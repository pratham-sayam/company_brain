const authService            = require('../services/authService');
const userContextService     = require('../services/userContextService');
const pythonService          = require('../services/pythonService');
const tokenVault             = require('../services/tokenVault');
const tokenRefreshScheduler  = require('../services/tokenRefreshScheduler');
const { resumePendingIndexing } = require('./copilotHandlers');

/**
 * Registers all auth IPC handlers.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getMainWindow
 *   Getter for the main window — used to push session-expiry and
 *   online-status events to the renderer without a request/response cycle.
 */
function registerAuthHandlers(ipcMain, getMainWindow) {

  // ── Helpers ───────────────────────────────────────────────

  /** Sends auth:sessionExpired to the renderer (forced logout). */
  function notifySessionExpired() {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('auth:sessionExpired');
  }

  /** Sends app:offlineStatus to the renderer when connectivity changes. */
  function notifyOffline(isOnline) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('app:offlineStatus', isOnline);
  }

  /**
   * Starts the background refresh timer for a newly established session.
   * onFailed  → pushes sessionExpired to renderer
   * onOffline → pushes offlineStatus to renderer
   */
  function startRefreshScheduler() {
    tokenRefreshScheduler.schedule(
      authService.getToken(),
      notifySessionExpired,
      notifyOffline
    );
  }

  /** Full rollback of all in-memory + vault state. */
  function rollback() {
    tokenRefreshScheduler.cancel();
    tokenVault.remove();
    authService.logout();
    userContextService.clear();
  }

  // ── Register ─────────────────────────────────────────────

  ipcMain.handle('auth:register', async (_event, { name, email, password }) => {
    try {
      const result = await authService.register({ name, email, password });
      return {
        success:         true,
        message:         result.message,
        cooldownSeconds: result.cooldownSeconds,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Login ─────────────────────────────────────────────────
  //
  // Step 1: Express auth       — access token (memory) + refresh token returned
  // Step 2: Directory init     — user data dir + database path computed
  // Step 3: Python /init-db    — SQLite created + schema applied
  // Step 4: Theme fetch        — stored theme retrieved from SQLite
  // Step 5: Vault write        — refresh token encrypted to disk (best-effort)
  // Step 6: Scheduler start    — background refresh scheduled
  //
  // Any step 2-4 failure → full rollback.

  ipcMain.handle('auth:login', async (_event, { email, password }) => {
    try {
      // Step 1
      const { user, refreshToken } = await authService.login({ email, password });

      // Step 2
      await userContextService.initializeUserDirectory(String(user._id));
      const databasePath = userContextService.getActiveDatabasePath();

      // Step 3
      try {
        await pythonService.initDb(databasePath, String(user._id));
      } catch (err) {
        authService.logout();
        userContextService.clear();
        throw new Error(`Database initialisation failed: ${err.message}`);
      }

      // Step 4
      let theme;
      try {
        theme = await pythonService.getTheme();
      } catch (err) {
        authService.logout();
        userContextService.clear();
        throw new Error(`Theme fetch failed: ${err.message}`);
      }

      // Step 5 — best-effort; vault failure does not break the session
      try {
        tokenVault.store(refreshToken);
      } catch { /* non-fatal */ }

      // Step 6
      startRefreshScheduler();

      // Step 7 — resume any pending indexing jobs (fire-and-forget)
      resumePendingIndexing(getMainWindow)
        .catch(() => { /* non-fatal */ });

      return { success: true, user, theme };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Session Restore ───────────────────────────────────────
  //
  // Step 1: Python health check
  // Step 2: Read refresh token from vault
  // Step 3: Exchange refresh token → new access + refresh tokens (validates + rotates)
  // Step 4: Restore in-memory session
  // Step 5: Init user directory
  // Step 6: Python /init-db
  // Step 7: Fetch theme
  // Step 8: Update vault with rotated refresh token
  // Step 9: Start background scheduler

  ipcMain.handle('auth:restoreSession', async () => {
    try {
      // Step 1 — Wait for Python to become healthy.
      // pythonProcess.start() runs just before the window opens, so the
      // FastAPI server may still be booting when React mounts and calls
      // restoreSession.  Poll up to ~10 s (20 × 500 ms) before giving up.
      const MAX_HEALTH_ATTEMPTS = 20;
      const HEALTH_INTERVAL_MS  = 500;
      let pythonReady = false;

      for (let i = 0; i < MAX_HEALTH_ATTEMPTS; i++) {
        try {
          await pythonService.checkHealth();
          pythonReady = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
        }
      }

      if (!pythonReady) return { success: false };

      // Step 2
      const storedRefreshToken = tokenVault.read();
      if (!storedRefreshToken) return { success: false };

      // Step 3 — Exchange: validates token and rotates it in one operation
      let tokens;
      try {
        tokens = await authService.refreshTokens(storedRefreshToken);
      } catch {
        // Token expired or revoked — require fresh login
        tokenVault.remove();
        return { success: false };
      }

      const { user, refreshToken: newRefreshToken } = tokens;

      // Step 4
      authService.setSession(authService.getToken(), user);

      // Step 5
      await userContextService.initializeUserDirectory(String(user._id));
      const databasePath = userContextService.getActiveDatabasePath();

      // Step 6
      try {
        await pythonService.initDb(databasePath, String(user._id));
      } catch {
        rollback();
        return { success: false };
      }

      // Step 7
      let theme;
      try {
        theme = await pythonService.getTheme();
      } catch {
        rollback();
        return { success: false };
      }

      // Step 8 — persist the rotated refresh token
      try {
        tokenVault.store(newRefreshToken);
      } catch { /* non-fatal */ }

      // Step 9
      startRefreshScheduler();

      // Step 10 — resume any pending indexing jobs (fire-and-forget)
      resumePendingIndexing(getMainWindow)
        .catch(() => { /* non-fatal */ });

      return { success: true, user, theme };
    } catch {
      rollback();
      return { success: false };
    }
  });

  // ── Logout ────────────────────────────────────────────────

  ipcMain.handle('auth:logout', async () => {
    try {
      // Cancel the refresh timer before clearing state
      tokenRefreshScheduler.cancel();

      // Best-effort server-side revocation of the refresh token
      const storedRefreshToken = tokenVault.read();
      if (storedRefreshToken) {
        await authService.revokeRefreshToken(storedRefreshToken);
      }

      // Clear vault, in-memory state, and user context
      tokenVault.remove();
      authService.logout();
      userContextService.clear();

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Delete Account ────────────────────────────────────────
  //
  // Step 1: Express validates password + soft-deletes (sets isDeleted, clears refresh token).
  //         If this throws, local state is untouched — full rollback by default.
  // Step 2: Cancel scheduler before any state mutation.
  // Step 3: Delete local user data directory (best-effort; account gone server-side).
  // Step 4: Remove refresh token from vault.
  // Step 5: Clear in-memory access token and user context.

  ipcMain.handle('auth:deleteAccount', async (_event, { password }) => {
    try {
      // Step 1 — if server rejects, throw propagates to catch and nothing local is changed
      await authService.deleteAccount({ password });

      // Step 2 — cancel before touching any state
      tokenRefreshScheduler.cancel();

      // Step 3 — directory removal; account is already server-deleted so this is best-effort
      try {
        await userContextService.deleteUserDirectory();
      } catch { /* non-fatal */ }

      // Step 4
      tokenVault.remove();

      // Step 5
      authService.logout();
      userContextService.clear();

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Forgot / Reset Password ───────────────────────────────

  ipcMain.handle('auth:forgotPassword', async (_event, { email }) => {
    try {
      const result = await authService.forgotPassword(email);
      return {
        success:         true,
        message:         result.message,
        cooldownSeconds: result.cooldownSeconds,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:verifyResetCode', async (_event, { email, code }) => {
    try {
      await authService.verifyResetCode(email, code);
      return { success: true };
    } catch (err) {
      return {
        success:           false,
        error:             err.message,
        retryAfterSeconds: err.retryAfterSeconds,
        attemptsLeft:      err.attemptsLeft,
      };
    }
  });

  ipcMain.handle('auth:resetPassword', async (_event, { email, code, newPassword }) => {
    try {
      await authService.resetPassword({ email, code, newPassword });
      return { success: true };
    } catch (err) {
      return {
        success:           false,
        error:             err.message,
        retryAfterSeconds: err.retryAfterSeconds,
      };
    }
  });

  ipcMain.handle('auth:resendResetCode', async (_event, { email }) => {
    try {
      const result = await authService.resendResetCode(email);
      return {
        success:           true,
        cooldownSeconds:   result.cooldownSeconds,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Email Verification ────────────────────────────────────

  ipcMain.handle('auth:verifyEmail', async (_event, { email, code }) => {
    try {
      const result = await authService.verifyEmail(email, code);
      return { success: true, message: result.message };
    } catch (err) {
      return {
        success:           false,
        error:             err.message,
        retryAfterSeconds: err.retryAfterSeconds,
        attemptsLeft:      err.attemptsLeft,
      };
    }
  });

  ipcMain.handle('auth:resendVerification', async (_event, { email }) => {
    try {
      const result = await authService.resendVerification(email);
      return {
        success:           true,
        cooldownSeconds:   result.cooldownSeconds,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Helpers ───────────────────────────────────────────────

  ipcMain.handle('auth:getCurrentUser', () => {
    try {
      const user = authService.getCurrentUser();
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:getLocalDbPath', () => {
    try {
      const dbPath = userContextService.getActiveDatabasePath();
      return { success: true, dbPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Send Feedback ─────────────────────────────────────────

  ipcMain.handle('auth:sendFeedback', async (_event, { feedback }) => {
    try {
      await authService.sendFeedback({ feedback });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = registerAuthHandlers;

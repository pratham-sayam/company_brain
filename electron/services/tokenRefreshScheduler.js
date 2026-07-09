/**
 * Token Refresh Scheduler — Electron main process only.
 *
 * Decodes the access token expiry and fires a refresh 60 seconds before
 * the token would expire. If the refresh fails:
 *   - Network error  → marks app offline, retries in 30 s (session preserved)
 *   - Auth error     → clears all session state, calls onFailed (forced logout)
 *
 * Neither token is ever touched by the renderer.
 */

const tokenVault        = require('./tokenVault');
const authService       = require('./authService');
const userContextService = require('./userContextService');

const REFRESH_LEAD_SECS = 60;   // Refresh this many seconds before token expiry
const OFFLINE_RETRY_MS  = 30_000;

let _timer     = null;
let _cancelled = false;

// ── Internal helpers ──────────────────────────────────────

/**
 * Decodes the `exp` claim from a JWT without signature verification.
 * Safe to use here because the value is only used for scheduling — not for
 * authorization decisions.
 *
 * @param {string} token
 * @returns {number|null} Unix timestamp in seconds, or null on failure
 */
function _decodeExpiry(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString()
    );
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the error looks like a transient network failure
 * rather than an authentication rejection from the server.
 */
function _isNetworkError(err) {
  if (err instanceof TypeError) return true;
  const cause = err?.cause;
  if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND') return true;
  const msg = err?.message || '';
  return msg.includes('fetch failed') || msg.includes('Failed to fetch');
}

// ── Core refresh logic ────────────────────────────────────

async function _doRefresh(onFailed, onOffline) {
  _timer = null;
  if (_cancelled) return;

  const refreshToken = tokenVault.read();
  if (!refreshToken) {
    onFailed();
    return;
  }

  try {
    const result = await authService.refreshTokens(refreshToken);

    if (_cancelled) return; // Logout raced with refresh completion

    // Persist the rotated refresh token
    try { tokenVault.store(result.refreshToken); } catch { /* non-fatal */ }

    // Signal that connectivity is restored (if we were offline)
    onOffline(true);

    // Reschedule for the newly issued access token
    _schedule(result.accessToken, onFailed, onOffline);
  } catch (err) {
    if (_cancelled) return;

    if (_isNetworkError(err)) {
      // Transient network failure — enter offline mode and retry
      onOffline(false);
      _timer = setTimeout(() => _doRefresh(onFailed, onOffline), OFFLINE_RETRY_MS);
    } else {
      // Server explicitly rejected the refresh token (expired, revoked, etc.)
      // Clear all state and force logout
      tokenVault.remove();
      authService.logout();
      userContextService.clear();
      onFailed();
    }
  }
}

function _schedule(accessToken, onFailed, onOffline) {
  const exp = _decodeExpiry(accessToken);
  if (!exp) return; // Undecodable token — skip scheduling

  const nowSecs       = Math.floor(Date.now() / 1000);
  const refreshInMs   = Math.max(0, (exp - nowSecs - REFRESH_LEAD_SECS) * 1000);

  _timer = setTimeout(() => _doRefresh(onFailed, onOffline), refreshInMs);
}

// ── Public API ────────────────────────────────────────────

/**
 * Schedules a background token refresh for the given access token.
 * Replaces any previously scheduled refresh.
 *
 * @param {string}   accessToken - The current short-lived JWT access token
 * @param {Function} onFailed    - Called when the session must be terminated
 *                                 (auth error, vault empty). Caller sends
 *                                 `auth:sessionExpired` to the renderer.
 * @param {Function} onOffline   - Called with (isOnline: boolean). Caller sends
 *                                 `app:offlineStatus` to the renderer.
 */
function schedule(accessToken, onFailed, onOffline) {
  cancel();
  _cancelled = false;
  _schedule(accessToken, onFailed, onOffline);
}

/**
 * Cancels any pending refresh. Called on logout to prevent the timer
 * from firing after the session has been cleared.
 */
function cancel() {
  _cancelled = true;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

module.exports = { schedule, cancel };

/**
 * Token Vault — runs exclusively in the Electron main process.
 *
 * Stores the long-lived REFRESH token (never the access token).
 * Uses Electron's built-in safeStorage API, which delegates to the OS
 * credential facility (DPAPI on Windows). The encrypted binary blob is
 * written to the userData directory and is unreadable without the OS
 * user credentials that encrypted it.
 *
 * Guarantees:
 *   - Refresh token is never stored as plaintext.
 *   - File is only decryptable by the same OS user on the same machine.
 *   - Neither token is ever exposed to the renderer process.
 *   - Access token lives only in main-process memory (authService._token).
 */

const { safeStorage, app } = require('electron');
const path = require('path');
const fs = require('fs');

// Lazy path resolution — app.getPath() requires the app to be ready.
function _getVaultPath() {
  return path.join(app.getPath('userData'), '.session');
}

/**
 * Encrypts and persists the refresh token to disk using DPAPI.
 *
 * @param {string} refreshToken - The raw JWT refresh token string
 * @throws {Error} If OS-level encryption is unavailable
 */
function store(refreshToken) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption (DPAPI) is not available on this machine.');
  }
  const encrypted = safeStorage.encryptString(refreshToken);
  fs.writeFileSync(_getVaultPath(), encrypted);
}

/**
 * Reads and decrypts the stored refresh token from disk.
 *
 * @returns {string|null} The raw refresh token, or null if absent or unreadable.
 */
function read() {
  const vaultPath = _getVaultPath();
  if (!fs.existsSync(vaultPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(vaultPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    // Decryption failure (tampered file, wrong OS user) — treat as absent.
    return null;
  }
}

/**
 * Removes the stored refresh token from disk.
 * Safe to call when no token exists — no-op in that case.
 */
function remove() {
  try {
    const vaultPath = _getVaultPath();
    if (fs.existsSync(vaultPath)) {
      fs.unlinkSync(vaultPath);
    }
  } catch {
    // Best-effort. A corrupt file returns null on the next read, which is
    // handled gracefully by all callers.
  }
}

module.exports = { store, read, remove };

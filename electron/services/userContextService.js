/**
 * User Context Service — runs exclusively in the Electron main process.
 *
 * Responsibilities:
 *   - Prepare the user-specific data directory on login.
 *   - Maintain activeUserId and activeDatabasePath in memory.
 *   - Never expose these values to the renderer except via controlled IPC.
 *   - Clear context on logout — does NOT delete files.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// In-memory active user context
let _activeUserId = null;
let _activeDatabasePath = null;

/**
 * Creates the user-specific directory and sets the active database path.
 * Idempotent — safe to call even if the directory already exists.
 *
 * @param {string} userId - MongoDB _id of the authenticated user (string)
 */
async function initializeUserDirectory(userId) {
  const userDataRoot = app.getPath('userData');
  const userDir = path.join(userDataRoot, 'users', userId);

  await fs.promises.mkdir(userDir, { recursive: true });

  _activeUserId = userId;
  _activeDatabasePath = path.join(userDir, 'database.sqlite');
}

/**
 * Deletes the active user's data directory (and all contents) from disk.
 * Only operates on the currently active userId — cannot touch other users' folders.
 * Called exclusively during account deletion, never on logout.
 */
async function deleteUserDirectory() {
  if (!_activeUserId) throw new Error('No active user directory to delete.');
  const userDataRoot = app.getPath('userData');
  const userDir = path.join(userDataRoot, 'users', _activeUserId);
  await fs.promises.rm(userDir, { recursive: true, force: true });
}

/**
 * Clears the in-memory user context on logout.
 * Does NOT delete the user directory or database file.
 */
function clear() {
  _activeUserId = null;
  _activeDatabasePath = null;
}

function getActiveUserId() {
  return _activeUserId;
}

function getActiveDatabasePath() {
  return _activeDatabasePath;
}

module.exports = {
  initializeUserDirectory,
  deleteUserDirectory,
  clear,
  getActiveUserId,
  getActiveDatabasePath,
};

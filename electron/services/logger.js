/**
 * Logger — Electron main process only.
 *
 * Wraps electron-log to provide structured, file-based logging.
 * Logs are written to: %APPDATA%/Orvyn/logs/electron.log
 *
 * Features:
 *   - Automatic log rotation (max 5 files, 5 MB each)
 *   - Console output in dev, file-only in production
 *   - Exposes the logs directory path for the "Open Logs" IPC channel
 *
 * Usage: const log = require('./logger');
 *        log.info('message');
 *        log.error('message', error);
 */

const log = require('electron-log/main');
const path = require('path');

// ── File transport configuration ─────────────────────────

// Resolves to %APPDATA%/Orvyn/logs/electron.log
log.transports.file.resolvePathFn = (variables) =>
  path.join(variables.userData, 'logs', 'electron.log');

log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per file
log.transports.file.archiveLogFn = (oldLog) => {
  // electron-log handles rotation automatically when maxSize is set.
  // Old files are renamed with .old.log extension.
  const info = path.parse(oldLog.path);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(info.dir, `${info.name}.${timestamp}${info.ext}`);
};

// ── Console transport ────────────────────────────────────

// In packaged builds, suppress console (no terminal to see it).
// In dev, keep console output for convenience.
try {
  const { app } = require('electron');
  if (app && app.isPackaged) {
    log.transports.console.level = false;
  }
} catch {
  // Not running in Electron context (e.g., tests) — keep console enabled
}

// ── Format ───────────────────────────────────────────────

log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

// ── Helper: get logs directory ───────────────────────────

/**
 * Returns the absolute path to the logs directory.
 * Used by the IPC channel to let users find their logs.
 */
function getLogsPath() {
  const logPath = log.transports.file.getFile().path;
  return path.dirname(logPath);
}

// Attach helper to the log object for easy access
log.getLogsPath = getLogsPath;

module.exports = log;

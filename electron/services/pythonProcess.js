/**
 * Python Process Manager — Electron main process only.
 *
 * Spawns and supervises the local Python FastAPI backend.
 * Restarts automatically on unexpected exit (crash recovery).
 * Uses the venv Python executable as required for Windows.
 *
 * Dynamic port allocation: finds a free port before spawning Python,
 * preventing conflicts when port 8000 is already in use.
 *
 * Renderer has no knowledge of this service.
 */

const { spawn } = require('child_process');
const { app }   = require('electron');
const path      = require('path');
const net       = require('net');
const log       = require('./logger');

// ── Paths ─────────────────────────────────────────────────

/**
 * Returns Python executable path and spawn arguments for dev vs packaged builds.
 *
 * Dev:      venv/Scripts/python.exe run.py --port <port>
 * Packaged: orvyn-backend.exe --port <port>  (PyInstaller onedir output)
 */
function _getPythonPaths() {
  if (app.isPackaged) {
    const dir = path.join(process.resourcesPath, 'python-backend');
    return { dir, exe: path.join(dir, 'orvyn-backend.exe'), args: [] };
  }
  const dir = path.join(__dirname, '..', '..', 'python-backend');
  return { dir, exe: path.join(dir, 'venv', 'Scripts', 'python.exe'), args: ['run.py'] };
}

const RESTART_DELAY_MS = 3_000;  // Wait before respawn to prevent tight loops
const MAX_RESTARTS     = 5;      // Give up after this many consecutive rapid crashes

// ── State ─────────────────────────────────────────────────

let _process       = null;
let _shouldRestart = false;
let _restartCount  = 0;
let _lastStartTime = 0;
let _resolvedPort  = null;  // The port Python is actually running on

// ── Port allocation ──────────────────────────────────────

/**
 * Finds an available TCP port by binding to port 0 (OS assigns a free port),
 * reading the assigned port, then closing the server.
 *
 * @returns {Promise<number>} A free port number
 */
function _findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Returns the PYTHON_URL for the currently running Python backend.
 * Other Electron services use this instead of reading from .env.
 *
 * @returns {string} e.g. "http://127.0.0.1:8042"
 */
function getPythonUrl() {
  if (!_resolvedPort) {
    // Fallback to env if Python hasn't been started via dynamic port yet
    return process.env.PYTHON_URL || 'http://127.0.0.1:8000';
  }
  return `http://127.0.0.1:${_resolvedPort}`;
}

// ── Internal ──────────────────────────────────────────────

function _spawn() {
  if (!_shouldRestart) return;

  _lastStartTime = Date.now();
  _restartCount  = 0; // will be checked in exit handler

  const stdio = app.isPackaged ? 'ignore' : 'inherit';

  // Compute logs path for Python (same %APPDATA% location as Electron logs)
  const logsPath = log.getLogsPath();

  const paths = _getPythonPaths();
  _process = spawn(paths.exe, [...paths.args, '--port', String(_resolvedPort)], {
    cwd:   app.isPackaged ? path.dirname(paths.exe) : paths.dir,
    stdio,
    windowsHide: true,
    env: {
      ...process.env,
      Orvyn_LOG_DIR: logsPath,
    },
  });

  log.info(`[Python] Spawned on port ${_resolvedPort} (PID: ${_process.pid})`);

  _process.on('error', (err) => {
    _process = null;
    if (_shouldRestart) {
      log.error(`[Python] Spawn error: ${err.message}. Retrying in ${RESTART_DELAY_MS}ms…`);
      _scheduleRestart();
    }
  });

  _process.on('exit', (code, signal) => {
    _process = null;
    if (!_shouldRestart) return; // Intentional stop

    const uptimeSecs = (Date.now() - _lastStartTime) / 1000;
    if (uptimeSecs < 5) {
      _restartCount++;
    } else {
      _restartCount = 0; // Process ran for a while — reset the crash counter
    }

    if (_restartCount >= MAX_RESTARTS) {
      log.error('[Python] Too many rapid restarts. Giving up.');
      _shouldRestart = false;
      return;
    }

    log.warn(`[Python] Exited (code=${code}, signal=${signal}). Restarting in ${RESTART_DELAY_MS}ms…`);
    _scheduleRestart();
  });
}

function _scheduleRestart() {
  setTimeout(async () => {
    // Re-allocate a free port on each restart in case the old one became occupied
    try {
      _resolvedPort = await _findFreePort();
      log.info(`[Python] Restart: allocated port ${_resolvedPort}`);
    } catch (err) {
      log.error(`[Python] Failed to find free port on restart: ${err.message}`);
    }
    _spawn();
  }, RESTART_DELAY_MS);
}

// ── Public API ────────────────────────────────────────────

/**
 * Starts the Python backend process.
 * Finds a free port dynamically, then spawns Python on that port.
 * Idempotent — safe to call if already running.
 */
async function start() {
  if (_process) return; // Already running
  _shouldRestart = true;
  _restartCount  = 0;

  try {
    _resolvedPort = await _findFreePort();
    log.info(`[Python] Allocated free port: ${_resolvedPort}`);
  } catch (err) {
    log.error(`[Python] Failed to find free port: ${err.message}. Falling back to 8000.`);
    _resolvedPort = 8000;
  }

  // Update PYTHON_URL in process.env so pythonService picks it up
  process.env.PYTHON_URL = `http://127.0.0.1:${_resolvedPort}`;

  _spawn();
}

/**
 * Terminates the Python backend and disables auto-restart.
 * Called on app quit to ensure a clean shutdown.
 */
function stop() {
  _shouldRestart = false;
  if (_process) {
    _process.kill();
    _process = null;
  }
}

module.exports = { start, stop, getPythonUrl };

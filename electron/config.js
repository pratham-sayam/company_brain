/**
 * Centralized configuration — Electron main process only.
 *
 * In dev:  reads from electron/.env (loaded by dotenv in main.js).
 * In prod: uses hardcoded production defaults (no .env file ships with the app).
 *
 * Single source of truth for all environment-dependent values.
 * Update the production URL here after deploying Express to Cloud Run.
 */

const { app } = require('electron');

const isDev = !app.isPackaged;

// ── Production Cloud Run URL ────────────────────────────────
// Replace this placeholder with your actual Cloud Run URL after deployment.
const PRODUCTION_EXPRESS_URL = 'https://orvyn-express-160954399633.asia-south1.run.app';

module.exports = {
  EXPRESS_URL: isDev
    ? (process.env.EXPRESS_URL || 'http://localhost:3000')
    : PRODUCTION_EXPRESS_URL,

  COPILOT_PANEL_DEFAULT_WIDTH: parseInt(process.env.COPILOT_PANEL_DEFAULT_WIDTH) || 380,
  COPILOT_PANEL_MIN_WIDTH:     parseInt(process.env.COPILOT_PANEL_MIN_WIDTH)     || 320,
  COPILOT_PANEL_MAX_WIDTH:     parseInt(process.env.COPILOT_PANEL_MAX_WIDTH)     || 600,
};

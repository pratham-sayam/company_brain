const crypto         = require('crypto');
const pythonService  = require('../services/pythonService');
const expressService = require('../services/expressService');
const log            = require('../services/logger');
const { resumePendingIndexing } = require('./copilotHandlers');

/**
 * Registers AI classification IPC handlers.
 *
 * AI flow (3-step orchestration):
 *   1. Python prepares data (fingerprints, folder tree) from local SQLite
 *   2. Express calls Gemini (holds the API key server-side)
 *   3. Python applies AI results back to the database
 *
 * The Gemini API key never touches the desktop app.
 *
 * Usage limits:
 *   - Pre-check before classification (advisory, for UX)
 *   - Hard enforcement in Express classify/generate endpoints
 *   - requestId for idempotency (prevents double-counting on retry)
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getMainWindow
 */
function registerAiHandlers(ipcMain, getMainWindow) {

  ipcMain.handle('ai:classify', async (_event, { dataroom_id, file_ids }) => {
    try {
      const startTime = Date.now();
      const requestId = crypto.randomUUID();

      // Pre-check: advisory file limit check (does NOT block — hard block is on Express)
      try {
        const check = await expressService.checkFileLimit(file_ids.length);
        if (!check.allowed) {
          return {
            success: false,
            error: `Monthly file upload limit reached (${check.remaining} remaining of ${check.limit}). Resets ${new Date(check.resetsAt).toLocaleDateString()}.`,
            limitReached: true,
          };
        }
      } catch (err) {
        // Pre-check failed — proceed anyway, Express will hard-enforce
        log.warn('ai:classify pre-check failed (non-blocking):', err.message);
      }

      // Step 1: Python prepares fingerprints + folder tree from local DB
      const prepared = await pythonService.prepareClassify(dataroom_id, file_ids);

      // Step 2: Express calls Gemini with the prepared data (API key stays server-side)
      // requestId ensures idempotent usage counting
      const results = await expressService.classifyFiles(
        prepared.fingerprints,
        prepared.folder_tree,
        prepared.folder_ids,
        requestId,
      );

      // Step 3: Python applies the AI results to the local database
      const applied = await pythonService.applyClassifyResults(dataroom_id, results);

      // Step 4: Trigger background indexing for newly classified files (fire-and-forget)
      resumePendingIndexing(getMainWindow).catch(err =>
        log.warn('ai:classify post-classify indexing trigger failed (non-fatal):', err.message)
      );

      return {
        success: true,
        status: applied.status,
        dataroom_id: applied.dataroom_id,
        total_files: file_ids.length,
        classified: applied.classified,
        low_confidence_skipped: applied.low_confidence_skipped,
        missing_file_ids: prepared.missing_file_ids,
        time_seconds: (Date.now() - startTime) / 1000,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ai:generate-dataroom', async (_event, { dataroom_name, dataroom_description, file_ids, dataroom_id }) => {
    try {
      const startTime = Date.now();
      const requestId = crypto.randomUUID();

      // Pre-check: advisory file limit check
      try {
        const check = await expressService.checkFileLimit(file_ids.length);
        if (!check.allowed) {
          return {
            success: false,
            error: `Monthly file upload limit reached (${check.remaining} remaining of ${check.limit}). Resets ${new Date(check.resetsAt).toLocaleDateString()}.`,
            limitReached: true,
          };
        }
      } catch (err) {
        log.warn('ai:generate-dataroom pre-check failed (non-blocking):', err.message);
      }

      // Step 1: Python prepares file fingerprints from local DB
      const prepared = await pythonService.prepareGenerate(file_ids);

      // Step 2: Express calls Gemini to generate folder structure + assignments
      // requestId ensures idempotent usage counting
      const geminiResult = await expressService.generateDataroom(
        dataroom_name,
        dataroom_description,
        prepared.fingerprints,
        requestId,
      );

      // Step 3: Python creates DataRoom, folders, and assigns files in local DB
      const applied = await pythonService.applyGenerateResults(
        dataroom_name,
        dataroom_description,
        geminiResult,
        file_ids,
        dataroom_id,
      );

      // Step 4: Trigger background indexing for newly classified files (fire-and-forget)
      resumePendingIndexing(getMainWindow).catch(err =>
        log.warn('ai:generate-dataroom post-generate indexing trigger failed (non-fatal):', err.message)
      );

      return {
        success: true,
        ...applied,
        missing_file_ids: prepared.missing_file_ids,
        time_seconds: (Date.now() - startTime) / 1000,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = registerAiHandlers;


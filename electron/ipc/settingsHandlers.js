const pythonService  = require('../services/pythonService');
const expressService = require('../services/expressService');

/**
 * Registers settings-related IPC handlers.
 *
 * All theme values are validated inside the Python backend before
 * touching the database. The renderer supplies only the theme string —
 * it cannot influence the database path or any other state.
 *
 * @param {Electron.IpcMain} ipcMain
 */
function registerSettingsHandlers(ipcMain) {

  ipcMain.handle('settings:setTheme', async (_event, theme) => {
    try {
      await pythonService.setTheme(theme);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('settings:getUsage', async () => {
    try {
      const data = await expressService.getUsage();
      return { success: true, usage: data.usage };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = registerSettingsHandlers;

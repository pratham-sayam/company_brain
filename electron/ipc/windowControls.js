/**
 * Registers IPC handlers for native window controls.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
function registerWindowControls(ipcMain, getWindow) {
  ipcMain.on('window:minimize', () => {
    const win = getWindow();
    if (win) win.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getWindow();
    if (!win) return;
    // Toggle maximize / restore — the 'maximize' and 'unmaximize' events on
    // the window (listeners in main.js) will push the new state to the renderer.
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    const win = getWindow();
    if (win) win.close();
  });
}

module.exports = registerWindowControls;

const pythonService = require('../services/pythonService');

/**
 * Registers Folder IPC handlers.
 *
 * @param {Electron.IpcMain} ipcMain
 */
function registerFolderHandlers(ipcMain) {

  ipcMain.handle('folder:create', async (_event, { dataroom_id, parent_folder_id, name, context }) => {
    try {
      const data = await pythonService.createFolder(dataroom_id, name, context, parent_folder_id);
      return { success: true, folder: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Key endpoint for file explorer navigation.
  // Returns folders and files at a specific level in the DataRoom tree.
  ipcMain.handle('folder:get-children', async (_event, { dataroom_id, parent_folder_id }) => {
    try {
      // Fetch all folders for this DataRoom
      const allFolders = await pythonService.listFolders(dataroom_id);

      // Filter to only direct children of the given parent
      const folders = allFolders.filter(f => {
        if (parent_folder_id == null) {
          // Root level — folders with no parent
          return f.parent_id == null;
        }
        return f.parent_id === parent_folder_id;
      });

      // Fetch files at this level
      let files;
      if (parent_folder_id == null) {
        // Root level — files not assigned to any folder
        const allFiles = await pythonService.listFiles(dataroom_id);
        files = allFiles.filter(f => f.folder_id == null);
      } else {
        files = await pythonService.listFiles(dataroom_id, { folder_id: parent_folder_id });
      }

      return { success: true, folders, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder:rename', async (_event, { folder_id, new_name }) => {
    try {
      const data = await pythonService.updateFolder(folder_id, { name: new_name });
      return { success: true, folder: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder:update-context', async (_event, { folder_id, context }) => {
    try {
      const data = await pythonService.updateFolder(folder_id, { context });
      return { success: true, folder: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder:delete-preview', async (_event, { folder_id }) => {
    try {
      const data = await pythonService.deleteFolderPreview(folder_id);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder:delete', async (_event, { folder_id, file_action }) => {
    try {
      const data = await pythonService.deleteFolder(folder_id, file_action || undefined);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folder:move', async (_event, { folder_id, new_parent_id }) => {
    try {
      // Send parent_id to Python — null means move to root
      const data = await pythonService.updateFolder(folder_id, { parent_id: new_parent_id });
      return { success: true, folder: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = registerFolderHandlers;

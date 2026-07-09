const { dialog, shell, clipboard, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const pythonService = require('../services/pythonService');
const expressService = require('../services/expressService');
const log = require('../services/logger');

// Supported file extensions — must match Python's _ALLOWED_EXTENSIONS.
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg',
]);

const MAX_FILES_PER_BATCH = 100;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Registers file-related IPC handlers.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow | null} getMainWindow
 */
function registerFileHandlers(ipcMain, getMainWindow) {

  // ── File selection dialogs ─────────────────────────────────

  ipcMain.handle('file:select-files', async () => {
    try {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Supported', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg'] },
          { name: 'Documents',     extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv'] },
          { name: 'Images',        extensions: ['png', 'jpg', 'jpeg'] },
        ],
      });

      if (result.canceled) return { success: true, filePaths: [] };

      if (result.filePaths.length > MAX_FILES_PER_BATCH) {
        return {
          success: false,
          error: `Selected ${result.filePaths.length} files. Maximum is ${MAX_FILES_PER_BATCH} per batch.`,
        };
      }

      return { success: true, filePaths: result.filePaths };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:select-folder', async () => {
    try {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
      });

      if (result.canceled) return { success: true, filePaths: [] };

      const folderPath = result.filePaths[0];
      const filePaths  = [];

      // Recursive scan for supported files
      function scanDir(dirPath) {
        let entries;
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
          return; // Skip unreadable directories
        }

        for (const entry of entries) {
          // Ignore hidden files and folders
          if (entry.name.startsWith('.')) continue;

          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              filePaths.push(fullPath);
            }
          }
        }
      }

      scanDir(folderPath);

      if (filePaths.length > MAX_FILES_PER_BATCH) {
        return {
          success: false,
          error: `Found ${filePaths.length} files. Maximum is ${MAX_FILES_PER_BATCH} per batch.`,
        };
      }

      return { success: true, filePaths };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── File registration & CRUD ───────────────────────────────

  ipcMain.handle('file:register', async (_event, { dataroom_id, file_paths }) => {
    try {
      const data = await pythonService.registerFiles(dataroom_id, file_paths);

      // OCR: extract text from registered image files via Gemini Vision
      const imageFileIds = (data.registered || [])
        .filter((f) => IMAGE_EXTENSIONS.has(f.file_extension))
        .map((f) => f.id);

      if (imageFileIds.length > 0) {
        try {
          log.info(`[fileHandlers] OCR: processing ${imageFileIds.length} image file(s)`);
          const ocrData = await pythonService.prepareOcr(imageFileIds);

          if (ocrData.files && !ocrData.skipped) {
            for (const file of ocrData.files) {
              if (file.error) {
                log.warn(`[fileHandlers] OCR prepare skipped file ${file.file_id}: ${file.error}`);
                continue;
              }
              try {
                const extractedText = await expressService.ocrImage(
                  file.image_base64,
                  file.mime_type,
                  file.filename,
                );
                await pythonService.applyOcr(file.file_id, extractedText);
                log.info(`[fileHandlers] OCR complete for ${file.filename}`);
              } catch (ocrErr) {
                log.warn(`[fileHandlers] OCR failed for ${file.filename}: ${ocrErr.message}`);
              }
            }
          }
        } catch (ocrErr) {
          log.warn(`[fileHandlers] OCR pipeline failed: ${ocrErr.message}`);
        }
      }

      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:move-to-folder', async (_event, { file_id, folder_id, dataroom_id }) => {
    try {
      const data = await pythonService.moveFileToFolder(file_id, folder_id, dataroom_id);
      return { success: true, file: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:remove-from-Orvyn', async (_event, { file_id }) => {
    try {
      const data = await pythonService.deleteFile(file_id, false);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:delete-from-system', async (_event, { file_id }) => {
    try {
      log.warn('[fileHandlers] DESTRUCTIVE: Deleting file from system, file_id:', file_id);
      const data = await pythonService.deleteFile(file_id, true);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:check-exists', async (_event, { file_id }) => {
    try {
      const data = await pythonService.checkFileExists(file_id);
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:relocate', async (_event, { file_id }) => {
    try {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: 'All Supported', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg'] },
        ],
      });

      if (result.canceled) return { success: true, canceled: true };

      const newPath = result.filePaths[0];
      const data = await pythonService.relocateFile(file_id, newPath);
      return { success: true, canceled: false, file: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:get-details', async (_event, { file_id }) => {
    try {
      const [fileData, existsData] = await Promise.all([
        pythonService.getFile(file_id),
        pythonService.checkFileExists(file_id),
      ]);
      return { success: true, file: fileData, exists: existsData.exists };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:list', async (_event, { dataroom_id, folder_id, include_subfolders, status }) => {
    try {
      const options = {};
      if (folder_id != null)       options.folder_id = folder_id;
      if (include_subfolders)      options.include_subfolders = true;
      if (status)                  options.status = status;

      const data = await pythonService.listFiles(dataroom_id, options);
      return { success: true, files: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:rename', async (_event, { file_id, new_name }) => {
    try {
      // Get current file details to find old path
      const fileData = await pythonService.getFile(file_id);
      const oldPath = fileData.original_path;
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, new_name);

      // Rename on disk if the file exists
      if (fs.existsSync(oldPath)) {
        if (oldPath !== newPath && fs.existsSync(newPath)) {
          return { success: false, error: `A file named '${new_name}' already exists there.` };
        }
        if (oldPath !== newPath) {
          fs.renameSync(oldPath, newPath);
        }
        const data = await pythonService.renameFile(file_id, new_name, newPath);
        return { success: true, file: data };
      } else {
        return { success: false, error: 'File not found at its original location.' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Path info & folder scanning (no registration) ─────

  ipcMain.handle('file:get-paths-info', async (_event, { file_paths }) => {
    try {
      const results = [];
      for (const fp of file_paths) {
        const ext = path.extname(fp).toLowerCase();
        const name = path.basename(fp);
        let size = 0;
        try { size = fs.statSync(fp).size; } catch { /* skip */ }
        results.push({ path: fp, name, size, extension: ext, valid: SUPPORTED_EXTENSIONS.has(ext) });
      }
      return { success: true, files: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:scan-folder', async (_event, { folder_path }) => {
    try {
      const filePaths = [];

      function scanDir(dirPath) {
        let entries;
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            filePaths.push(fullPath);
          }
        }
      }

      scanDir(folder_path);
      return { success: true, filePaths };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Shell & clipboard operations ───────────────────────────

  ipcMain.handle('file:open', async (_event, { file_path }) => {
    try {
      const result = await shell.openPath(path.resolve(file_path));
      // shell.openPath returns an empty string on success, or an error message
      if (result) return { success: false, error: result };
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:open-with', async (_event, { file_path }) => {
    try {
      const resolved = path.resolve(file_path).replace(/\//g, '\\');
      return new Promise((resolve) => {
        execFile(
          'rundll32.exe',
          ['shell32.dll,OpenAs_RunDLL', resolved],
          { windowsHide: false },
          (err) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:copy-path', async (_event, { file_path }) => {
    try {
      clipboard.writeText(path.resolve(file_path));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:copy-to-clipboard', async (_event, { file_path }) => {
    try {
      const resolved = path.resolve(file_path).replace(/\//g, '\\');
      const ext = path.extname(resolved).toLowerCase();

      if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        // Copy image to clipboard as native image
        const img = nativeImage.createFromPath(resolved);
        if (img.isEmpty()) {
          return { success: false, error: 'Failed to read image file.' };
        }
        clipboard.writeImage(img);
        return { success: true };
      }

      // For non-image files, use PowerShell Set-Clipboard -Path
      // This places the file in Windows file drop format (pasteable in Explorer)
      // Using execFile avoids shell interpolation — the path is passed as an
      // argument array, preventing command-injection via crafted filenames.
      return new Promise((resolve) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-Command', 'Set-Clipboard -Path $args[0]', '-args', resolved],
          { windowsHide: true },
          (err) => {
            if (err) {
              // Fallback: copy file path as text
              clipboard.writeText(resolved);
              resolve({ success: true, fallback: true });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

}

module.exports = registerFileHandlers;

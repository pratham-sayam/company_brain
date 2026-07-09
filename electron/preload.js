const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window control methods called from the React Header component
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),

    // Returns a cleanup function — call it in useEffect cleanup to avoid leaks
    onMaximizeChange: (callback) => {
      const handler = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },
  },

  // Runtime configuration sourced from electron/.env
  getConfig: () => ipcRenderer.invoke('app:getConfig'),

  // Auth bridge — JWTs never cross into the renderer.
  // Database paths are derived from main-process state and cannot be
  // influenced by the renderer.
  auth: {
    register:       (payload) => ipcRenderer.invoke('auth:register', payload),
    login:          (payload) => ipcRenderer.invoke('auth:login', payload),
    logout:         ()        => ipcRenderer.invoke('auth:logout'),
    deleteAccount:         (password) => ipcRenderer.invoke('auth:deleteAccount', { password }),
    verifyEmail:           (email, code)               => ipcRenderer.invoke('auth:verifyEmail', { email, code }),
    resendVerification:    (email)                    => ipcRenderer.invoke('auth:resendVerification', { email }),
    forgotPassword:        (email)                        => ipcRenderer.invoke('auth:forgotPassword', { email }),
    verifyResetCode:       (email, code)                  => ipcRenderer.invoke('auth:verifyResetCode', { email, code }),
    resetPassword:         ({ email, code, newPassword }) => ipcRenderer.invoke('auth:resetPassword', { email, code, newPassword }),
    resendResetCode:       (email)                        => ipcRenderer.invoke('auth:resendResetCode', { email }),
    sendFeedback:          (feedback) => ipcRenderer.invoke('auth:sendFeedback', { feedback }),
    getCurrentUser: ()        => ipcRenderer.invoke('auth:getCurrentUser'),
    getLocalDbPath: ()        => ipcRenderer.invoke('auth:getLocalDbPath'),
    // Called once on app mount — Electron performs the entire restore sequence.
    restoreSession: ()        => ipcRenderer.invoke('auth:restoreSession'),

    // Push event: Electron notifies the renderer when the session has expired
    // and cannot be silently renewed (revoked or expired refresh token).
    // Returns a cleanup function for useEffect.
    onSessionExpired: (callback) => {
      const handler = () => callback();
      ipcRenderer.once('auth:sessionExpired', handler);
      return () => ipcRenderer.removeListener('auth:sessionExpired', handler);
    },
  },

  // Settings bridge — theme persisted via Electron → Python → SQLite.
  settings: {
    setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', theme),
    getUsage: ()      => ipcRenderer.invoke('settings:getUsage'),
  },

  // DataRoom CRUD
  dataroom: {
    create:  ({ name, description })  => ipcRenderer.invoke('dataroom:create', { name, description }),
    list:    ()                       => ipcRenderer.invoke('dataroom:list'),
    get:     (id)                     => ipcRenderer.invoke('dataroom:get', { id }),
    update:  (id, updates)            => ipcRenderer.invoke('dataroom:update', { id, updates }),
    delete:  (id)                     => ipcRenderer.invoke('dataroom:delete', { id }),
  },

  // Folder operations
  folder: {
    create:        (dataroomId, parentFolderId, name, context) =>
      ipcRenderer.invoke('folder:create', { dataroom_id: dataroomId, parent_folder_id: parentFolderId, name, context }),
    getChildren:   (dataroomId, parentFolderId) =>
      ipcRenderer.invoke('folder:get-children', { dataroom_id: dataroomId, parent_folder_id: parentFolderId }),
    rename:        (folderId, newName) =>
      ipcRenderer.invoke('folder:rename', { folder_id: folderId, new_name: newName }),
    updateContext: (folderId, context) =>
      ipcRenderer.invoke('folder:update-context', { folder_id: folderId, context }),
    deletePreview: (folderId) =>
      ipcRenderer.invoke('folder:delete-preview', { folder_id: folderId }),
    delete:        (folderId, fileAction) =>
      ipcRenderer.invoke('folder:delete', { folder_id: folderId, file_action: fileAction }),
    move:          (folderId, newParentId) =>
      ipcRenderer.invoke('folder:move', { folder_id: folderId, new_parent_id: newParentId }),
  },

  // File operations
  file: {
    selectFiles:       ()                                  => ipcRenderer.invoke('file:select-files'),
    selectFolder:      ()                                  => ipcRenderer.invoke('file:select-folder'),
    register:          (dataroomId, filePaths)              => ipcRenderer.invoke('file:register', { dataroom_id: dataroomId, file_paths: filePaths }),
    moveToFolder:      (fileId, folderId, dataroomId)       => ipcRenderer.invoke('file:move-to-folder', { file_id: fileId, folder_id: folderId, dataroom_id: dataroomId }),
    removeFromOrvyn: (fileId)                            => ipcRenderer.invoke('file:remove-from-Orvyn', { file_id: fileId }),
    deleteFromSystem:  (fileId)                            => ipcRenderer.invoke('file:delete-from-system', { file_id: fileId }),
    checkExists:       (fileId)                            => ipcRenderer.invoke('file:check-exists', { file_id: fileId }),
    relocate:          (fileId)                            => ipcRenderer.invoke('file:relocate', { file_id: fileId }),
    open:              (filePath)                          => ipcRenderer.invoke('file:open', { file_path: filePath }),
    openWith:          (filePath)                          => ipcRenderer.invoke('file:open-with', { file_path: filePath }),
    copyPath:          (filePath)                          => ipcRenderer.invoke('file:copy-path', { file_path: filePath }),
    copyToClipboard:   (filePath)                          => ipcRenderer.invoke('file:copy-to-clipboard', { file_path: filePath }),
    getDetails:        (fileId)                            => ipcRenderer.invoke('file:get-details', { file_id: fileId }),
    list:              (dataroomId, options = {})           => ipcRenderer.invoke('file:list', { dataroom_id: dataroomId, ...options }),
    rename:            (fileId, newName)                   => ipcRenderer.invoke('file:rename', { file_id: fileId, new_name: newName }),
    getPathsInfo:      (filePaths)                         => ipcRenderer.invoke('file:get-paths-info', { file_paths: filePaths }),
    scanFolder:        (folderPath)                        => ipcRenderer.invoke('file:scan-folder', { folder_path: folderPath }),
  },

  // AI classification
  ai: {
    classify:         (dataroomId, fileIds)                => ipcRenderer.invoke('ai:classify', { dataroom_id: dataroomId, file_ids: fileIds }),
    generateDataroom: (name, description, fileIds, dataroomId) => ipcRenderer.invoke('ai:generate-dataroom', { dataroom_name: name, dataroom_description: description, file_ids: fileIds, dataroom_id: dataroomId }),
  },

  // Copilot — chat, indexing
  copilot: {
    sendMessage:      (data)  => ipcRenderer.invoke('copilot:send-message', data),
    cancelStream:     ()      => ipcRenderer.invoke('copilot:cancel-stream'),
    onStreamChunk:    (cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:stream-chunk', fn); return () => ipcRenderer.removeListener('copilot:stream-chunk', fn); },
    offStreamChunk:   (cb)    => ipcRenderer.removeListener('copilot:stream-chunk', cb),
    onStreamEnd:      (cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:stream-end', fn); return () => ipcRenderer.removeListener('copilot:stream-end', fn); },
    offStreamEnd:     (cb)    => ipcRenderer.removeListener('copilot:stream-end', cb),
    onStreamError:    (cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:stream-error', fn); return () => ipcRenderer.removeListener('copilot:stream-error', fn); },
    offStreamError:   (cb)    => ipcRenderer.removeListener('copilot:stream-error', cb),
    onStreamReasoning:(cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:stream-reasoning', fn); return () => ipcRenderer.removeListener('copilot:stream-reasoning', fn); },
    offStreamReasoning:(cb)   => ipcRenderer.removeListener('copilot:stream-reasoning', cb),
    onIndexProgress:  (cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:index-progress', fn); return () => ipcRenderer.removeListener('copilot:index-progress', fn); },
    offIndexProgress: (cb)    => ipcRenderer.removeListener('copilot:index-progress', cb),
    onTitleUpdate:    (cb)    => { const fn = (_, d) => cb(d); ipcRenderer.on('copilot:stream-end-title', fn); return () => ipcRenderer.removeListener('copilot:stream-end-title', fn); },
    offTitleUpdate:   (cb)    => ipcRenderer.removeListener('copilot:stream-end-title', cb),
    getSessions:      (data)  => ipcRenderer.invoke('copilot:get-sessions', data),
    getMessages:      (data)  => ipcRenderer.invoke('copilot:get-messages', data),
    deleteSession:    (data)  => ipcRenderer.invoke('copilot:delete-session', data),
    indexFiles:       (data)  => ipcRenderer.invoke('copilot:index-files', data),
    getIndexStatus:   (data)  => ipcRenderer.invoke('copilot:get-index-status', data),
    retryIndexing:    (data)  => ipcRenderer.invoke('copilot:retry-indexing', data),
    checkFileChanged: (data)  => ipcRenderer.invoke('copilot:check-file-changed', data),
    compareDocuments: (data)  => ipcRenderer.invoke('copilot:compare-documents', data),
  },

  // Logs — lets the UI offer a "Help > Open Logs" action
  logs: {
    getPath:    () => ipcRenderer.invoke('app:getLogsPath'),
    openFolder: () => ipcRenderer.invoke('app:openLogsFolder'),
  },

  // App-level push events from the main process
  app: {
    // Fires when the background token refresh detects a network change.
    // callback(isOnline: boolean) — true = back online, false = went offline
    // Returns a cleanup function for useEffect.
    onOfflineStatus: (callback) => {
      const handler = (_event, isOnline) => callback(isOnline);
      ipcRenderer.on('app:offlineStatus', handler);
      return () => ipcRenderer.removeListener('app:offlineStatus', handler);
    },
  },
});

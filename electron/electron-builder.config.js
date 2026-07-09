/**
 * electron-builder configuration for Orvyn
 * Windows-only — branded NSIS installer
 */
module.exports = {
  appId: 'com.orvyn.desktop',
  productName: 'Orvyn',
  copyright: 'Copyright (c) 2026 Orvyn',

  directories: {
    output: '../dist-electron',
    buildResources: 'build',
  },

  files: [
    '**/*',
    '!build',
  ],

  extraResources: [
    {
      from: '../frontend/dist',
      to: 'frontend/dist',
      filter: ['**/*'],
    },
    {
      from: '../python-backend/dist/orvyn-backend',
      to: 'python-backend',
      filter: ['**/*'],
    },
    {
      from: 'build/icon.ico',
      to: 'icon.ico',
    },
  ],

  win: {
    target: 'nsis',
    icon: 'build/icon.ico',
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Orvyn',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    displayLanguageSelector: false,
    allowElevation: true,
    packElevateHelper: true,

    // ── Branded NSIS assets (provide these later) ──────────────
    // Uncomment and supply the files when ready:
    //
    // installerSidebar: 'build/installerSidebar.bmp',   // 164x314 BMP
    // installerHeader: 'build/installerHeader.bmp',      // 150x57 BMP
    // license: 'build/license.txt',                      // License agreement shown during install
  },

  asar: false,
};

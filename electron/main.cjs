'use strict';

/**
 * SmartTrack — Electron Main Process
 *
 * Responsibilities:
 *  - Create and manage the BrowserWindow
 *  - Inject CORS / Origin headers for XAMPP API calls (file:// context)
 *  - System-tray icon with quick actions
 *  - IPC handlers for renderer queries (app info, XAMPP status, file dialogs)
 *  - Graceful crash recovery with user prompt
 *  - Dev-mode: load Vite dev server; production: load dist/index.html
 */

const {
  app,
  BrowserWindow,
  session,
  Menu,
  Tray,
  dialog,
  ipcMain,
  shell,
  nativeImage,
} = require('electron');
const fs   = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// ─── Environment ──────────────────────────────────────────────────────────────
const DEV_SERVER_URL  = process.env.ELECTRON_START_URL || null;
const IS_DEV          = !!DEV_SERVER_URL;
const DIST_INDEX      = path.join(app.getAppPath(), 'dist', 'index.html');
const CAN_LOAD_DIST   = fs.existsSync(DIST_INDEX);
const ICON_PATH       = path.join(__dirname, '../build/icon.ico');
const API_BASE        = 'http://localhost/SmartTrack/api';

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let tray        = null;
let isQuitting  = false;

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(label, data) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (data !== undefined) {
    console.log(`[${ts}] [SmartTrack] ${label}`, data);
  } else {
    console.log(`[${ts}] [SmartTrack] ${label}`);
  }
}

log('Starting', {
  devServerUrl: DEV_SERVER_URL || 'none',
  distIndexPath: DIST_INDEX,
  canLoadDist: CAN_LOAD_DIST,
  isDev: IS_DEV,
  electron: process.versions.electron,
  node: process.versions.node,
  platform: process.platform,
});

// ─── Chromium flags ───────────────────────────────────────────────────────────
// Allow the renderer (file:// origin) to reach the local XAMPP HTTP server.
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests');
// Improve rendering smoothness
app.commandLine.appendSwitch('enable-features', 'WebRTCHideLocalIpsWithMdns');

// ─── Single-instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('Another instance is already running — quitting.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Focus existing window when user tries to open a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Session / CORS headers ───────────────────────────────────────────────────
function setupSession() {
  const ses = session.defaultSession;

  // Inject Origin / Referer so PHP accepts the request from file:// context
  ses.webRequest.onBeforeSendHeaders(
    { urls: [`${API_BASE}/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['Origin']           = 'http://localhost';
      headers['Referer']          = 'http://localhost/';
      headers['X-Requested-With'] = 'XMLHttpRequest';
      callback({ requestHeaders: headers });
    }
  );

  // Log API errors to main-process stdout for easy debugging
  ses.webRequest.onErrorOccurred({ urls: [`${API_BASE}/*`] }, (details) => {
    log(`API error — ${details.url}`, details.error);
  });

  // Permissive CSP only in dev; tighter in production
  if (!IS_DEV) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' http://localhost; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: http://localhost; " +
            "connect-src 'self' http://localhost;",
          ],
        },
      });
    });
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
function registerIpcHandlers() {
  // General app information
  ipcMain.handle('get-app-info', async () => ({
    isDev:    IS_DEV,
    apiBase:  API_BASE,
    platform: process.platform,
    version:  app.getVersion(),
    electron: process.versions.electron,
    node:     process.versions.node,
  }));

  // Check whether XAMPP / the local API is reachable
  ipcMain.handle('check-xampp', async () => {
    return new Promise((resolve) => {
      const req = http.get(`${API_BASE}/diagnostic`, { timeout: 4000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({
              reachable: true,
              dbConnected: json?.database?.status === 'connected',
              raw: json,
            });
          } catch {
            resolve({ reachable: true, dbConnected: false, raw: null });
          }
        });
      });
      req.on('error', (err) => resolve({ reachable: false, dbConnected: false, error: err.message }));
      req.on('timeout', ()  => { req.destroy(); resolve({ reachable: false, dbConnected: false, error: 'timeout' }); });
    });
  });

  // Open a native Save-file dialog (e.g. CSV export)
  ipcMain.handle('dialog-save-file', async (_event, options = {}) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       options.title       || 'Save File',
      defaultPath: options.defaultPath || app.getPath('documents'),
      filters:     options.filters     || [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  // Write data to a file path (for CSV exports triggered from renderer)
  ipcMain.handle('write-file', async (_event, { filePath, content }) => {
    if (!filePath || typeof content !== 'string') return { ok: false, error: 'Invalid arguments' };
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Open a URL in the user's default browser
  ipcMain.handle('open-external', async (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  // Let renderer ask the main window to reload
  ipcMain.handle('reload-window', () => {
    mainWindow?.webContents.reload();
  });
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => { isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const wc = mainWindow?.webContents;
            if (wc) wc.setZoomFactor(Math.min(wc.getZoomFactor() + 0.1, 3));
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const wc = mainWindow?.webContents;
            if (wc) wc.setZoomFactor(Math.max(wc.getZoomFactor() - 0.1, 0.3));
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.setZoomFactor(1),
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { role: 'forceReload' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SmartTrack',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type:    'info',
              title:   'About SmartTrack',
              message: 'SmartTrack — Pharmacy Inventory Management',
              detail:  [
                `Version: ${app.getVersion()}`,
                `Electron: ${process.versions.electron}`,
                `Node.js: ${process.versions.node}`,
                `Platform: ${process.platform}`,
              ].join('\n'),
              buttons: ['OK'],
            });
          },
        },
        {
          label: 'Open Diagnostic',
          click: () => shell.openExternal(`${API_BASE}/diagnostic`),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── System tray ─────────────────────────────────────────────────────────────
function setupTray() {
  try {
    const sourceIcon = fs.existsSync(ICON_PATH)
      ? nativeImage.createFromPath(ICON_PATH)
      : nativeImage.createEmpty();
    const iconImg = sourceIcon.isEmpty()
      ? sourceIcon
      : sourceIcon.resize({ width: 16, height: 16 });

    tray = new Tray(iconImg);
    tray.setToolTip('SmartTrack — Pharmacy Inventory');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open SmartTrack',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Reload',
        click: () => mainWindow?.webContents.reload(),
      },
      {
        label: 'Open Diagnostic',
        click: () => shell.openExternal(`${API_BASE}/diagnostic`),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => { isQuitting = true; app.quit(); },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // Double-click tray icon restores the window
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    log('Tray setup failed (non-fatal)', err.message);
  }
}

// ─── Browser window ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        1100,
    minHeight:       700,
    autoHideMenuBar: false,
    title:           'SmartTrack — Pharmacy Inventory Management',
    icon:            ICON_PATH,
    show:            false,  // shown after 'ready-to-show' to avoid white flash
    backgroundColor: '#0f172a', // matches app dark bg so splash is seamless
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
    },
  });

  // Show only once content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
    log('Window ready and visible');
  });

  // Minimise to tray instead of closing, unless actually quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
      tray.displayBalloon?.({
        iconType: 'info',
        title:    'SmartTrack',
        content:  'SmartTrack is still running. Right-click the tray icon to quit.',
      });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // ── Load URL ────────────────────────────────────────────────────────────────
  if (DEV_SERVER_URL) {
    log('Loading dev server', DEV_SERVER_URL);
    mainWindow.loadURL(DEV_SERVER_URL);
  } else if (CAN_LOAD_DIST) {
    log('Loading built dist', DIST_INDEX);
    mainWindow.loadFile(DIST_INDEX);
  } else {
    log('No dist/ found — falling back to localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
  }

  // ── Renderer diagnostics ────────────────────────────────────────────────────
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    // Only surface warnings/errors to avoid verbose info spam
    if (level >= 2) log(`[Renderer] ${message}`);
  });

  // Auto-recover from renderer crashes
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('Renderer process gone', details);
    const choice = dialog.showMessageBoxSync({
      type:    'error',
      title:   'SmartTrack — Unexpected Error',
      message: 'The application encountered an error.',
      detail:  `Reason: ${details.reason}\n\nWould you like to reload?`,
      buttons: ['Reload', 'Quit'],
    });
    if (choice === 0) {
      mainWindow?.webContents.reload();
    } else {
      isQuitting = true;
      app.quit();
    }
  });

  // Prevent navigation away from the app origin
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const isAllowed =
      url.startsWith('http://localhost:5173') ||
      url.startsWith('file://') ||
      url.startsWith(API_BASE);
    if (!isAllowed) {
      e.preventDefault();
      shell.openExternal(url); // open external links in browser
    }
  });

  return mainWindow;
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  log('App ready');
  setupSession();
  registerIpcHandlers();
  buildAppMenu();
  createWindow();
  setupTray();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  // On macOS the app stays alive until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ─── Global error handling ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  log('Uncaught exception', err);
  dialog.showErrorBoxSync?.('SmartTrack — Fatal Error', err.message);
});

process.on('unhandledRejection', (reason) => {
  log('Unhandled promise rejection', reason);
});

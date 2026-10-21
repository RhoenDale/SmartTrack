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
  clipboard,
} = require('electron');
const fs   = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn, exec } = require('node:child_process');

// ─── Environment ──────────────────────────────────────────────────────────────
const DEV_SERVER_URL  = process.env.ELECTRON_START_URL || null;
const IS_DEV          = !!DEV_SERVER_URL;
const DIST_INDEX      = path.join(app.getAppPath(), 'dist', 'index.html');
const DIST_DIR        = path.dirname(DIST_INDEX);
const CAN_LOAD_DIST   = fs.existsSync(DIST_INDEX);
const ICON_PATH       = path.join(__dirname, '../build/icon.ico');
const API_BASE        = 'http://localhost/SmartTrack/api';

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let tray        = null;
let isQuitting  = false;
let shareServer = null;
let cloudflared = null;
let shareUrl    = null;
let shareState  = 'stopped';
let shareStartPromise = null;

// ─── XAMPP auto-start ─────────────────────────────────────────────────────────
const XAMPP_DIR = 'C:\\xampp';

/**
 * Run a shell command and resolve with { code, stdout, stderr }.
 * Never rejects — errors are captured in `code` / `stderr`.
 */
function runCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/** Returns true if the named Windows service is currently running. */
async function isServiceRunning(serviceName) {
  const { stdout } = await runCmd(`sc query "${serviceName}"`);
  return stdout.includes('RUNNING');
}

/**
 * Start a Windows service via `net start` if it isn't already running.
 * Returns true on success / already-running, false on failure.
 */
async function ensureService(serviceName) {
  if (await isServiceRunning(serviceName)) {
    log(`Service already running: ${serviceName}`);
    return true;
  }
  log(`Starting service: ${serviceName}`);
  const { code, stderr } = await runCmd(`net start "${serviceName}"`);
  if (code !== 0) {
    log(`net start "${serviceName}" failed (code ${code})`, stderr.trim());
    return false;
  }
  return true;
}

/**
 * Probe the local API once. Returns true when it responds with db connected.
 */
function probeApi() {
  return new Promise((resolve) => {
    const req = http.get(`${API_BASE}/diagnostic`, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(res.statusCode === 200 && json?.database?.status === 'connected');
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Wait up to `maxMs` for the API to become ready, polling every `intervalMs`.
 */
async function waitForApi(maxMs = 30000, intervalMs = 1500) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await probeApi()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Show a non-blocking splash message box while XAMPP services start.
 * Closes automatically when the returned `close()` is called.
 */
function showStartingSplash() {
  // We can't close a showMessageBox programmatically, so we use a minimal
  // BrowserWindow as a splash overlay instead.
  const splash = new BrowserWindow({
    width: 420,
    height: 180,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0f172a',
    icon: ICON_PATH,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f172a; color: #f8fafc;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; gap: 16px; padding: 24px;
  }
  h2 { font-size: 17px; font-weight: 600; }
  p  { font-size: 13px; color: #94a3b8; text-align: center; }
  .spinner {
    width: 32px; height: 32px; border: 3px solid #334155;
    border-top-color: #f97316; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="spinner"></div>
  <h2>Starting SmartTrack…</h2>
  <p>Waiting for Apache &amp; MySQL to start.<br/>This only takes a moment.</p>
</body>
</html>`;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splash.setMenu(null);
  return {
    close: () => { if (!splash.isDestroyed()) splash.close(); },
  };
}

/**
 * Main entry point for XAMPP auto-start.
 * Tries Windows services first, then falls back to xampp_start.exe.
 * Returns true if the API is ready, false otherwise.
 */
async function ensureXamppRunning() {
  // Quick check — if already running, do nothing.
  if (await probeApi()) {
    log('XAMPP API already reachable — skipping auto-start.');
    return true;
  }

  log('API not reachable — attempting to start XAMPP services…');
  const splash = showStartingSplash();

  try {
    // Try Windows service names used by XAMPP installer
    const apacheStarted = await ensureService('Apache2.4');
    const mysqlStarted  = await ensureService('mysql');

    if (!apacheStarted || !mysqlStarted) {
      // Fallback: try xampp_start.exe (portable XAMPP)
      const xamppStart = path.join(XAMPP_DIR, 'xampp_start.exe');
      if (fs.existsSync(xamppStart)) {
        log('Falling back to xampp_start.exe');
        spawn(xamppStart, [], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
      } else {
        log('xampp_start.exe not found — services may not start.');
      }
    }

    log('Waiting for API to become ready…');
    const ready = await waitForApi(35000, 1500);
    if (ready) {
      log('XAMPP API is ready.');
    } else {
      log('XAMPP API did not become ready in time.');
      dialog.showMessageBoxSync({
        type:    'warning',
        title:   'SmartTrack — XAMPP Not Ready',
        message: 'Could not start Apache or MySQL automatically.',
        detail:  'Please open XAMPP Control Panel and start Apache and MySQL manually, then relaunch SmartTrack.',
        buttons: ['OK'],
      });
    }
    return ready;
  } finally {
    splash.close();
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(label, data) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (data !== undefined) {
    console.log(`[${ts}] [SmartTrack] ${label}`, data);
  } else {
    console.log(`[${ts}] [SmartTrack] ${label}`);
  }
}

function publishShareStatus(error) {
    const status = { state: shareState, url: shareUrl, error: error || null };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('share-status', status);
    }
    return status;
  }

function downloadFile(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('Too many redirects downloading cloudflared.'));
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' ||
          !(parsed.hostname === 'github.com' || parsed.hostname.endsWith('.githubusercontent.com'))) {
        return reject(new Error('Refusing an untrusted cloudflared download URL.'));
      }

      const request = https.get(parsed, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location;
          response.resume();
          if (!location) return reject(new Error('Cloudflare download returned an invalid redirect.'));
          const nextUrl = new URL(location, parsed).toString();
          return resolve(downloadFile(nextUrl, destination, redirects + 1));
        }
        if (response.statusCode !== 200) {
          response.resume();
          return reject(new Error(`Cloudflare download failed (HTTP ${response.statusCode || 'unknown'}).`));
        }

        let bytes = 0;
        const output = fs.createWriteStream(destination);
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 100 * 1024 * 1024) {
            request.destroy(new Error('Cloudflare download exceeded the 100 MB limit.'));
            output.destroy();
          }
        });
        response.pipe(output);
        output.on('finish', () => output.close(() => resolve(destination)));
        output.on('error', (error) => reject(error));
      });
      request.setTimeout(30000, () => request.destroy(new Error('Cloudflare download timed out.')));
      request.on('error', (error) => {
        fs.rm(destination, { force: true }, () => reject(error));
      });
    });
  }

async function getCloudflaredPath() {
    if (process.platform !== 'win32') {
      throw new Error('Cloudflare sharing is currently supported by the Windows desktop app.');
    }
    const binaryPath = path.join(app.getPath('userData'), 'cloudflared.exe');
    if (fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 1024 * 1024) {
      return binaryPath;
    }

    shareState = 'downloading';
    publishShareStatus();
    const temporaryPath = `${binaryPath}.download`;
    try {
      await downloadFile(
        'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
        temporaryPath
      );
      if (fs.statSync(temporaryPath).size <= 1024 * 1024) {
        throw new Error('Downloaded cloudflared file is unexpectedly small.');
      }
      fs.rmSync(binaryPath, { force: true });
      fs.renameSync(temporaryPath, binaryPath);
      return binaryPath;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw new Error(`Could not download Cloudflare Tunnel: ${error.message}`);
    }
  }

function serveSharedApp(req, res) {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    if (requestUrl.pathname === '/SmartTrack/api' || requestUrl.pathname.startsWith('/SmartTrack/api/')) {
    const endpoint = requestUrl.pathname.toLowerCase().replace(/\/+$/, '');
    const blockedEndpoints = new Set([
      '/smarttrack/api/diagnostic',
      '/smarttrack/api/diagnostic.php',
      '/smarttrack/api/setup-test-users',
      '/smarttrack/api/setup-test-users.php',
      '/smarttrack/api/test-complete-flow',
      '/smarttrack/api/test-complete-flow.php',
    ]);
    if (blockedEndpoints.has(endpoint)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'This development endpoint is unavailable through the share link.' }));
      return;
    }
    const headers = { ...req.headers };
      delete headers.host;
      headers.origin = 'http://localhost';
      headers.referer = 'http://localhost/';
      headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const proxyRequest = http.request({
        hostname: '127.0.0.1',
        port: 80,
        path: requestUrl.pathname + requestUrl.search,
        method: req.method,
        headers,
      }, (proxyResponse) => {
        res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
        proxyResponse.pipe(res);
      });
      proxyRequest.on('error', (error) => {
        log('Share API proxy failed', error.message);
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'The local SmartTrack API is unavailable.' }));
      });
      req.pipe(proxyRequest);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = path.resolve(DIST_DIR, relativePath);
    if (filePath !== DIST_DIR && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = DIST_INDEX;
    }
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filePath).pipe(res);
  }

function stopShareTunnel() {
    if (cloudflared) {
      const child = cloudflared;
      cloudflared = null;
      child.kill();
    }
    if (shareServer) {
      shareServer.close();
      shareServer = null;
    }
    shareUrl = null;
    shareState = 'stopped';
    publishShareStatus();
  }

async function startShareTunnel() {
    if (shareUrl && cloudflared) return publishShareStatus();
    if (shareStartPromise) return shareStartPromise;
    shareStartPromise = (async () => {
      shareState = 'starting';
      publishShareStatus();
      try {
        const health = await new Promise((resolve, reject) => {
          const request = http.get(`${API_BASE}/diagnostic`, { timeout: 5000 }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
              try {
                const diagnostic = JSON.parse(body);
                if (response.statusCode !== 200 || diagnostic?.database?.status !== 'connected') {
                  reject(new Error('Start Apache and MySQL in XAMPP and verify the SmartTrack database first.'));
                } else resolve(true);
              } catch (error) {
                reject(error instanceof SyntaxError
                  ? new Error('The SmartTrack API returned an invalid health response.')
                  : error);
              }
            });
          });
          request.on('error', () => reject(new Error('SmartTrack API is unavailable. Start XAMPP Apache and MySQL first.')));
          request.on('timeout', () => request.destroy(new Error('SmartTrack API health check timed out.')));
        });
        if (!health) throw new Error('SmartTrack API health check failed.');
        if (!CAN_LOAD_DIST) throw new Error('The built SmartTrack web app is missing. Reinstall or rebuild the desktop app.');

        const binaryPath = await getCloudflaredPath();
        shareServer = http.createServer(serveSharedApp);
        await new Promise((resolve, reject) => {
          shareServer.once('error', reject);
          shareServer.listen(0, '127.0.0.1', resolve);
        });
        const port = shareServer.address().port;
        const child = spawn(binaryPath, [
          'tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate', '--loglevel', 'info',
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        cloudflared = child;
        return await new Promise((resolve, reject) => {
          let output = '';
          let settled = false;
          const timeout = setTimeout(() => finish(new Error('Cloudflare Tunnel did not provide a link within 60 seconds.')), 60000);
          const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) {
              stopShareTunnel();
              reject(error);
            } else resolve(result);
          };
          child.stderr.setEncoding('utf8');
          child.stderr.on('data', (chunk) => {
            output = `${output}${chunk}`.slice(-12000);
            const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (match) {
              shareUrl = match[0];
              shareState = 'running';
              finish(null, publishShareStatus());
            }
          });
          child.once('error', (error) => finish(new Error(`Could not launch cloudflared: ${error.message}`)));
          child.once('exit', (code) => {
            if (cloudflared !== child) return;
            cloudflared = null;
            if (shareServer) {
              shareServer.close();
              shareServer = null;
            }
            shareUrl = null;
            shareState = 'stopped';
            publishShareStatus(code === 0 ? null : `Cloudflare Tunnel stopped unexpectedly (exit ${code}).`);
            if (!settled) finish(new Error(`Cloudflare Tunnel exited before creating a link. ${output.slice(-1000)}`));
          });
        });
      } catch (error) {
        stopShareTunnel();
        publishShareStatus(error.message);
        throw error;
      } finally {
        shareStartPromise = null;
      }
    })();
  return shareStartPromise;
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

  ipcMain.handle('share-status', () => publishShareStatus());
  ipcMain.handle('share-start', () => startShareTunnel());
  ipcMain.handle('share-stop', () => {
    stopShareTunnel();
    return publishShareStatus();
  });
  ipcMain.handle('copy-text', (_event, text) => {
    if (typeof text !== 'string') throw new Error('Text to copy must be a string.');
    clipboard.writeText(text);
    return { ok: true };
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
app.whenReady().then(async () => {
  log('App ready');
  setupSession();
  registerIpcHandlers();
  buildAppMenu();

  // Auto-start XAMPP Apache + MySQL before showing the main window
  if (!IS_DEV) {
    await ensureXamppRunning();
  }

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
  stopShareTunnel();
});

// ─── Global error handling ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  log('Uncaught exception', err);
  dialog.showErrorBoxSync?.('SmartTrack — Fatal Error', err.message);
});

process.on('unhandledRejection', (reason) => {
  log('Unhandled promise rejection', reason);
});

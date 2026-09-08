const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const devServerUrl = process.env.ELECTRON_START_URL;
const distIndexPath = path.join(app.getAppPath(), 'dist', 'index.html');
const canLoadLocalDist = fs.existsSync(distIndexPath);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'SmartTrack',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (canLoadLocalDist) {
    mainWindow.loadFile(distIndexPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('smarttrack', {
  platform: process.platform,
});

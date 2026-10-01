'use strict';

/**
 * SmartTrack — Electron Preload Script
 *
 * Runs in a privileged context but exposes only a safe, typed API surface
 * to the renderer via contextBridge. The renderer never touches Node or
 * Electron internals directly.
 *
 * Exposed as: window.smarttrack.*
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─── Helper: one-way invoke with error boundary ────────────────────────────
function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((err) => {
    console.error(`[preload] IPC "${channel}" failed:`, err);
    return null;
  });
}

// ─── API surface ──────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('smarttrack', {
  // ── Environment ──────────────────────────────────────────────────────────

  /** The OS platform string — "win32", "darwin", "linux" */
  platform: process.platform,

  /** Whether the renderer is inside Electron */
  isElectron: true,

  // ── App info ──────────────────────────────────────────────────────────────

  /**
   * Returns { isDev, apiBase, platform, version, electron, node }
   * @returns {Promise<{isDev:boolean, apiBase:string, platform:string, version:string, electron:string, node:string}>}
   */
  getAppInfo: () => invoke('get-app-info'),

  // ── XAMPP / API connectivity ──────────────────────────────────────────────

  /**
   * Pings the local XAMPP API and returns connectivity info.
   * @returns {Promise<{reachable:boolean, dbConnected:boolean, error?:string}>}
   */
  checkXampp: () => invoke('check-xampp'),

  // ── File system helpers ───────────────────────────────────────────────────

  /**
   * Opens a native Save-file dialog.
   * @param {{ title?:string, defaultPath?:string, filters?:Array<{name:string,extensions:string[]}> }} options
   * @returns {Promise<string|null>} Chosen file path, or null if cancelled
   */
  showSaveDialog: (options) => invoke('dialog-save-file', options),

  /**
   * Write a string to a file on disk (for CSV / report exports).
   * @param {string} filePath  Absolute path returned by showSaveDialog
   * @param {string} content   File contents
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  writeFile: (filePath, content) => invoke('write-file', { filePath, content }),

  // ── Shell helpers ─────────────────────────────────────────────────────────

  /**
   * Open a URL in the user's default browser (http/https only).
   * @param {string} url
   */
  openExternal: (url) => invoke('open-external', url),

  // ── Window helpers ────────────────────────────────────────────────────────

  /**
   * Ask the main process to reload the current page.
   */
  reloadWindow: () => invoke('reload-window'),

  // ── Logging helpers ───────────────────────────────────────────────────────

  /**
   * Forward an informational log to the main-process console.
   * @param {string} message
   * @param {unknown} [data]
   */
  log: (message, data) => {
    if (data !== undefined) {
      console.log('[SmartTrack]', message, data);
    } else {
      console.log('[SmartTrack]', message);
    }
  },

  /**
   * Forward an error log to the main-process console.
   * @param {string} message
   * @param {unknown} [error]
   */
  error: (message, error) => {
    if (error !== undefined) {
      console.error('[SmartTrack Error]', message, error);
    } else {
      console.error('[SmartTrack Error]', message);
    }
  },
});

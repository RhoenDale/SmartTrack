/**
 * SmartTrack Electron Initialization
 * 
 * Handles Electron-specific setup:
 * - App info detection
 * - XAMPP connectivity checks
 * - Development vs production environment setup
 * - Error logging and reporting
 */

declare global {
  interface Window {
    smarttrack?: {
      platform: string;
      getAppInfo: () => Promise<{
        isDev: boolean;
        apiBase: string;
        platform: string;
        version: string;
      }>;
      log: (message: string, data?: unknown) => void;
      error: (message: string, error?: unknown) => void;
    };
  }
}

let isElectron = false;
let isDev = false;

/**
 * Detect if running in Electron
 */
export function detectElectron(): boolean {
  if (isElectron) return isElectron;

  try {
    const ua = navigator.userAgent.toLowerCase();
    isElectron = ua.includes('electron') || !!window.smarttrack;
    return isElectron;
  } catch {
    return false;
  }
}

/**
 * Get Electron app info
 */
export async function getElectronInfo() {
  if (!isElectron || !window.smarttrack?.getAppInfo) {
    return null;
  }

  try {
    return await window.smarttrack.getAppInfo();
  } catch (error) {
    console.error('[Electron] Failed to get app info:', error);
    return null;
  }
}

/**
 * Initialize Electron app
 */
export async function initializeElectron() {
  isElectron = detectElectron();
  
  if (!isElectron) {
    console.log('[SmartTrack] Not running in Electron');
    return;
  }

  console.log('[SmartTrack] Initializing Electron app');

  try {
    const info = await getElectronInfo();
    if (info) {
      isDev = info.isDev;
      console.log('[SmartTrack Electron]', {
        isDev,
        apiBase: info.apiBase,
        platform: info.platform,
        version: info.version,
      });

      // Verify XAMPP connectivity
      await checkXAMPPConnectivity();
    }
  } catch (error) {
    console.error('[SmartTrack] Electron initialization failed:', error);
  }
}

/**
 * Check XAMPP connectivity
 */
export async function checkXAMPPConnectivity(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost/SmartTrack/api/diagnostic', {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.warn('[SmartTrack] XAMPP returned non-OK status:', response.status);
      return false;
    }

    const data = await response.json() as { database?: { status: string } };
    const isConnected = data.database?.status === 'connected';

    if (isConnected) {
      console.log('[SmartTrack] ✓ XAMPP connected');
    } else {
      console.warn('[SmartTrack] XAMPP database not connected');
    }

    return isConnected;
  } catch (error) {
    console.error('[SmartTrack] XAMPP connectivity check failed:', error);
    return false;
  }
}

/**
 * Log message to Electron console
 */
export function logToElectron(message: string, data?: unknown) {
  if (!isElectron || !window.smarttrack?.log) {
    console.log('[SmartTrack]', message, data || '');
    return;
  }

  try {
    window.smarttrack.log(message, data);
  } catch {
    console.log('[SmartTrack]', message, data || '');
  }
}

/**
 * Log error to Electron console
 */
export function errorToElectron(message: string, error?: unknown) {
  if (!isElectron || !window.smarttrack?.error) {
    console.error('[SmartTrack Error]', message, error || '');
    return;
  }

  try {
    window.smarttrack.error(message, error);
  } catch {
    console.error('[SmartTrack Error]', message, error || '');
  }
}

/**
 * Check if app is in development
 */
export function getIsDev(): boolean {
  return isDev || import.meta.env.DEV;
}

/**
 * Get platform info
 */
export function getPlatformInfo() {
  if (!isElectron || !window.smarttrack) {
    return {
      isElectron: false,
      platform: 'web',
      isDev: import.meta.env.DEV,
    };
  }

  return {
    isElectron: true,
    platform: window.smarttrack.platform,
    isDev,
  };
}

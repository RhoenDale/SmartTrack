export type FontScale = "small" | "default" | "large" | "xl";
export type TableDensity = "default" | "compact";
export type ReduceMotionPreference = "system" | "reduced";

export interface FontScaleOption {
  id: FontScale;
  label: string;
  sizePx: string;
  samplePx: number;
}

export const FONT_SCALE_OPTIONS: readonly FontScaleOption[] = [
  { id: "small", label: "Small", sizePx: "14px", samplePx: 11 },
  { id: "default", label: "Default", sizePx: "16px", samplePx: 13 },
  { id: "large", label: "Large", sizePx: "17.5px", samplePx: 15 },
  { id: "xl", label: "XL", sizePx: "19px", samplePx: 17 },
];

export const TABLE_DENSITY_OPTIONS: readonly { id: TableDensity; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "compact", label: "Compact" },
];

export const MOTION_PREFERENCE_OPTIONS: readonly { id: ReduceMotionPreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "reduced", label: "Reduced" },
];

const STORAGE_KEYS = {
  fontScale: "st_font_scale",
  tableDensity: "st_table_density",
  reduceMotion: "st_reduce_motion",
  mutedColors: "st_muted_colors",
  showAlertOrb: "st_show_alert_orb",
} as const;

function safeReadStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeWriteStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    /* ignore storage failures in private/restricted environments */
  }
}

export function readFontScale(): FontScale {
  const raw = safeReadStorage(STORAGE_KEYS.fontScale);
  return FONT_SCALE_OPTIONS.some(opt => opt.id === raw) ? (raw as FontScale) : "default";
}

export function saveFontScale(scale: FontScale): void {
  safeWriteStorage(STORAGE_KEYS.fontScale, scale);
}

export function readTableDensity(): TableDensity {
  return safeReadStorage(STORAGE_KEYS.tableDensity) === "compact" ? "compact" : "default";
}

export function saveTableDensity(density: TableDensity): void {
  safeWriteStorage(STORAGE_KEYS.tableDensity, density);
}

export function readReduceMotionPreference(): ReduceMotionPreference {
  return safeReadStorage(STORAGE_KEYS.reduceMotion) === "reduced" ? "reduced" : "system";
}

export function saveReduceMotionPreference(pref: ReduceMotionPreference): void {
  safeWriteStorage(STORAGE_KEYS.reduceMotion, pref);
}

export function readShowAlertOrb(): boolean {
  return safeReadStorage(STORAGE_KEYS.showAlertOrb) !== "false";
}

export function saveShowAlertOrb(show: boolean): void {
  safeWriteStorage(STORAGE_KEYS.showAlertOrb, String(show));
}

export function readMutedColors(): boolean {
  return safeReadStorage(STORAGE_KEYS.mutedColors) === "true";
}

export function saveMutedColors(muted: boolean): void {
  safeWriteStorage(STORAGE_KEYS.mutedColors, String(muted));
}

/**
 * Applies display preferences directly on `document.documentElement` so both
 * Web and Electron Desktop pick them up at boot and on live Settings toggles.
 */
export function applyDisplayPreferences(prefs: {
  fontScale: FontScale;
  tableDensity: TableDensity;
  reduceMotion: ReduceMotionPreference;
  mutedColors: boolean;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const scaleMeta = FONT_SCALE_OPTIONS.find(opt => opt.id === prefs.fontScale) ?? FONT_SCALE_OPTIONS[1];
  root.style.setProperty("--font-size", scaleMeta.sizePx);
  root.dataset.fontScale = scaleMeta.id;

  if (prefs.tableDensity === "compact") {
    root.dataset.density = "compact";
  } else {
    delete root.dataset.density;
  }

  if (prefs.reduceMotion === "reduced") {
    root.dataset.reduceMotion = "true";
  } else {
    delete root.dataset.reduceMotion;
  }

  if (prefs.mutedColors) {
    root.dataset.mutedColors = "true";
  } else {
    delete root.dataset.mutedColors;
  }
}

export function applySavedDisplayPreferences(): void {
  applyDisplayPreferences({
    fontScale: readFontScale(),
    tableDensity: readTableDensity(),
    reduceMotion: readReduceMotionPreference(),
    mutedColors: readMutedColors(),
  });
}

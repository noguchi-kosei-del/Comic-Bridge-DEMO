import { create } from "zustand";

export interface AppSettings {
  /** UIフォントサイズ: "small" | "medium" | "large" */
  fontSize: "small" | "medium" | "large";
  /** アクセントカラー */
  accentColor: string;
  /** ダークモード */
  darkMode: boolean;
  /** フォルダ階層のデフォルトパス */
  defaultFolderPath: string;

  setFontSize: (size: "small" | "medium" | "large") => void;
  setAccentColor: (color: string) => void;
  setDarkMode: (dark: boolean) => void;
  setDefaultFolderPath: (path: string) => void;
}

const STORAGE_KEY = "comic_bridge_settings";

function loadSettings(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveSettings(state: Partial<AppSettings>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fontSize: state.fontSize,
      accentColor: state.accentColor,
      darkMode: state.darkMode,
      defaultFolderPath: state.defaultFolderPath,
    }));
  } catch { /* ignore */ }
}

const saved = loadSettings();

export const useSettingsStore = create<AppSettings>((set, get) => ({
  fontSize: saved.fontSize || "medium",
  accentColor: saved.accentColor || "#7c5cff",
  darkMode: saved.darkMode ?? false,
  defaultFolderPath: saved.defaultFolderPath || "",

  setFontSize: (fontSize) => { set({ fontSize }); saveSettings({ ...get(), fontSize }); },
  setAccentColor: (accentColor) => { set({ accentColor }); saveSettings({ ...get(), accentColor }); },
  setDarkMode: (darkMode) => { set({ darkMode }); saveSettings({ ...get(), darkMode }); },
  setDefaultFolderPath: (defaultFolderPath) => { set({ defaultFolderPath }); saveSettings({ ...get(), defaultFolderPath }); },
}));

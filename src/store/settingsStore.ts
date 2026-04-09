import { create } from "zustand";

/** ナビバーに表示するボタンの定義 */
export interface NavButton {
  id: string;
  label: string;
}

/** 全てのナビ/ツール項目（ナビバーとツールメニュー両方で使用可能） */
export const ALL_NAV_BUTTONS: NavButton[] = [
  { id: "specCheck", label: "ホーム" },
  { id: "unifiedViewer", label: "ビューアー" },
  { id: "scanPsd", label: "スキャナー" },
  { id: "layers", label: "レイヤー構造" },
  { id: "replace", label: "差替え" },
  { id: "compose", label: "合成" },
  { id: "tiff", label: "TIFF化" },
  { id: "split", label: "見開き分割" },
  { id: "folderSetup", label: "フォルダセットアップ" },
  { id: "requestPrep", label: "依頼準備" },
];

export interface AppSettings {
  fontSize: "small" | "medium" | "large";
  accentColor: string;
  darkMode: boolean;
  defaultFolderPath: string;
  /** CBロゴ行に表示するボタンID */
  navBarButtons: string[];
  /** ツールメニューに表示するボタンID */
  toolMenuButtons: string[];

  setFontSize: (size: "small" | "medium" | "large") => void;
  setAccentColor: (color: string) => void;
  setDarkMode: (dark: boolean) => void;
  setDefaultFolderPath: (path: string) => void;
  setNavBarButtons: (buttons: string[]) => void;
  setToolMenuButtons: (buttons: string[]) => void;
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
      navBarButtons: state.navBarButtons,
      toolMenuButtons: state.toolMenuButtons,
    }));
  } catch { /* ignore */ }
}

const saved = loadSettings();

export const useSettingsStore = create<AppSettings>((set, get) => ({
  fontSize: saved.fontSize || "medium",
  accentColor: saved.accentColor || "#7c5cff",
  darkMode: saved.darkMode ?? false,
  defaultFolderPath: saved.defaultFolderPath || "",
  navBarButtons: saved.navBarButtons || ["specCheck", "unifiedViewer", "scanPsd", "layers"],
  toolMenuButtons: saved.toolMenuButtons || ["replace", "compose", "tiff", "split", "folderSetup", "requestPrep"],

  setFontSize: (fontSize) => { set({ fontSize }); saveSettings({ ...get(), fontSize }); },
  setAccentColor: (accentColor) => { set({ accentColor }); saveSettings({ ...get(), accentColor }); },
  setDarkMode: (darkMode) => { set({ darkMode }); saveSettings({ ...get(), darkMode }); },
  setDefaultFolderPath: (defaultFolderPath) => { set({ defaultFolderPath }); saveSettings({ ...get(), defaultFolderPath }); },
  setNavBarButtons: (navBarButtons) => { set({ navBarButtons }); saveSettings({ ...get(), navBarButtons }); },
  setToolMenuButtons: (toolMenuButtons) => { set({ toolMenuButtons }); saveSettings({ ...get(), toolMenuButtons }); },
}));

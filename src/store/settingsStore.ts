import { create } from "zustand";
import {
  Home, Eye, ScanLine, Layers, Shield, Sparkles, FileEdit,
  SlidersHorizontal, Replace, Combine, FileImage, Columns2, FolderCog, Package,
  type LucideIcon,
} from "lucide-react";

/** ナビバーに表示するボタンの定義 */
export interface NavButton {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/** 全てのナビ/ツール項目（ナビバーとツールメニュー両方で使用可能） */
export const ALL_NAV_BUTTONS: NavButton[] = [
  { id: "specCheck", label: "ホーム", icon: Home },
  { id: "unifiedViewer", label: "ビューアー", icon: Eye },
  { id: "inspection", label: "検版ツール", icon: Shield },
  { id: "progen", label: "ProGen", icon: Sparkles },
  { id: "textEditor", label: "テキストエディタ", icon: FileEdit },
  { id: "scanPsd", label: "スキャナー", icon: ScanLine },
  { id: "layers", label: "レイヤー構造", icon: Layers },
  { id: "layerControl", label: "レイヤー制御", icon: SlidersHorizontal },
  { id: "replace", label: "差替え", icon: Replace },
  { id: "compose", label: "合成", icon: Combine },
  { id: "tiff", label: "TIFF化", icon: FileImage },
  { id: "split", label: "見開き分割", icon: Columns2 },
  { id: "folderSetup", label: "フォルダセットアップ", icon: FolderCog },
  { id: "requestPrep", label: "依頼準備", icon: Package },
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

// Migration: 既存ユーザーの toolMenuButtons に layerControl を追加（未登録の場合のみ）
function migrateToolMenu(existing: string[] | undefined): string[] {
  if (!existing) return ["layerControl", "replace", "compose", "tiff", "split", "folderSetup", "requestPrep"];
  if (existing.includes("layerControl")) return existing;
  // 先頭に追加
  return ["layerControl", ...existing];
}

// Migration: 既存ユーザーの navBarButtons に inspection / progen / textEditor を追加（未登録の場合のみ）
const LAYERS_REORDER_FLAG = "comic_bridge_migration_layers_after_home_v1";

function migrateNavBar(existing: string[] | undefined): string[] {
  if (!existing) return ["specCheck", "layers", "unifiedViewer", "inspection", "progen", "textEditor", "scanPsd"];
  let result = [...existing];
  // inspection を unifiedViewer の直後に挿入
  if (!result.includes("inspection")) {
    const idx = result.indexOf("unifiedViewer");
    if (idx === -1) result.push("inspection");
    else result = [...result.slice(0, idx + 1), "inspection", ...result.slice(idx + 1)];
  }
  // progen を inspection の直後に挿入
  if (!result.includes("progen")) {
    const idx = result.indexOf("inspection");
    if (idx === -1) result.push("progen");
    else result = [...result.slice(0, idx + 1), "progen", ...result.slice(idx + 1)];
  }
  // textEditor を progen の直後に挿入
  if (!result.includes("textEditor")) {
    const idx = result.indexOf("progen");
    if (idx === -1) result.push("textEditor");
    else result = [...result.slice(0, idx + 1), "textEditor", ...result.slice(idx + 1)];
  }
  // One-time reorder: レイヤー構造 を ホーム（specCheck）の直後へ移動
  try {
    if (!localStorage.getItem(LAYERS_REORDER_FLAG)) {
      if (result.includes("layers") && result.includes("specCheck")) {
        result = result.filter((id) => id !== "layers");
        const idx = result.indexOf("specCheck");
        result = [...result.slice(0, idx + 1), "layers", ...result.slice(idx + 1)];
      }
      localStorage.setItem(LAYERS_REORDER_FLAG, "1");
    }
  } catch { /* ignore */ }
  return result;
}

export const useSettingsStore = create<AppSettings>((set, get) => ({
  fontSize: saved.fontSize || "medium",
  accentColor: saved.accentColor || "#7c5cff",
  darkMode: saved.darkMode ?? false,
  defaultFolderPath: saved.defaultFolderPath || "",
  navBarButtons: migrateNavBar(saved.navBarButtons),
  toolMenuButtons: migrateToolMenu(saved.toolMenuButtons),

  setFontSize: (fontSize) => { set({ fontSize }); saveSettings({ ...get(), fontSize }); },
  setAccentColor: (accentColor) => { set({ accentColor }); saveSettings({ ...get(), accentColor }); },
  setDarkMode: (darkMode) => { set({ darkMode }); saveSettings({ ...get(), darkMode }); },
  setDefaultFolderPath: (defaultFolderPath) => { set({ defaultFolderPath }); saveSettings({ ...get(), defaultFolderPath }); },
  setNavBarButtons: (navBarButtons) => { set({ navBarButtons }); saveSettings({ ...get(), navBarButtons }); },
  setToolMenuButtons: (toolMenuButtons) => { set({ toolMenuButtons }); saveSettings({ ...get(), toolMenuButtons }); },
}));

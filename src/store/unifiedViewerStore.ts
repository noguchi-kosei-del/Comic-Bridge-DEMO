/**
 * 統合ビューアー専用ストア
 * メインの psdStore とは独立したファイル管理を行う
 *
 * この store はファクトリ関数 `createUnifiedViewerStore()` で複数インスタンス
 * 生成できる。アプリでは 2 つのインスタンスを使い分ける:
 *   - useUnifiedViewerStore : ビューアー View 用（デフォルト / 外部からの参照もこちら）
 *   - useTextEditorViewerStore : テキストエディタ View 用
 * これによりファイル選択 / タブ配置 / 読み込み中の TXT 内容などが 2 画面間で連動せず
 * 独立して維持される。UnifiedViewer コンポーネント内部では `ScopedViewerStoreProvider`
 * を介してどちらのインスタンスを使うか切り替える。
 */
import { createContext, createElement, useContext, type ReactNode } from "react";
import { create, useStore } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type { PsdMetadata } from "../types";
import type {
  ParsedProofreadingData,
  CheckTabMode,
} from "../types/typesettingCheck";

// ─── Types ──────────────────────────────────────────────

export interface ViewerFile {
  name: string;
  path: string;
  sourceType: "psd" | "image" | "pdf";
  /** PDFページ情報 */
  isPdf?: boolean;
  pdfPage?: number;
  pdfPath?: string;
  /** PSD/PSBの場合のみ: Rustパーサーから取得したメタデータ */
  metadata?: PsdMetadata;
}

export interface TextBlock {
  id: string;
  originalIndex: number;
  lines: string[];
  assignedFont?: string;
  isAdded?: boolean;
}

export interface TextPage {
  pageNumber: number;
  blocks: TextBlock[];
}

export interface FontPresetEntry {
  font: string; // PostScript name
  name: string; // Display name
  subName?: string; // Category
}

export type PanelTab = "files" | "layers" | "spec" | "text" | "proofread" | "diff" | "editor";
export type LeftTab = PanelTab;
export type RightTab = PanelTab;
// 「右サブ」レイヤーは廃止。右側は「右端」のみを使用する。
export type PanelPosition = "far-left" | "left-sub" | "far-right";
export const PANEL_POSITIONS: PanelPosition[] = ["far-left", "left-sub", "far-right"];
export const PANEL_POSITION_LABELS: Record<PanelPosition, string> = {
  "far-left": "左端", "left-sub": "左サブ", "far-right": "右端",
};

interface UnifiedViewerState {
  // ─ Files ─
  files: ViewerFile[];
  currentFileIndex: number;

  // ─ Left sidebar ─
  leftTab: LeftTab;

  // ─ Right panel ─
  rightTab: RightTab;

  // ─ Panel positions (5-slot layout) ─
  tabPositions: Partial<Record<PanelTab, PanelPosition>>;
  /** 各ポジションから押し出されたタブを記憶（移動元が空いたら戻す用） */
  displacedTabs: Partial<Record<PanelPosition, PanelTab>>;

  // ─ Text editor (COMIC-POT) ─
  textContent: string;
  textFilePath: string | null;
  textHeader: string[];
  textPages: TextPage[];
  isDirty: boolean;
  editMode: "edit" | "select";
  selectedBlockIds: Set<string>;

  // ─ Font presets ─
  fontPresets: FontPresetEntry[];
  presetJsonPath: string | null;

  // ─ Proofreading (校正JSON) ─
  checkData: ParsedProofreadingData | null;
  checkTabMode: CheckTabMode;
  checkSearchQuery: string;

  // ─ Actions ─
  setFiles: (files: ViewerFile[]) => void;
  addFiles: (files: ViewerFile[]) => void;
  setCurrentFileIndex: (index: number) => void;
  setLeftTab: (tab: LeftTab) => void;
  setRightTab: (tab: RightTab) => void;
  setTabPosition: (tab: PanelTab, pos: PanelPosition | null) => void;

  // Text
  setTextContent: (content: string) => void;
  setTextFilePath: (path: string | null) => void;
  setTextHeader: (header: string[]) => void;
  setTextPages: (pages: TextPage[]) => void;
  setIsDirty: (dirty: boolean) => void;
  setEditMode: (mode: "edit" | "select") => void;
  setSelectedBlockIds: (ids: Set<string>) => void;
  assignFontToBlocks: (blockIds: string[], font: string) => void;

  // Font presets
  setFontPresets: (presets: FontPresetEntry[]) => void;
  setPresetJsonPath: (path: string | null) => void;

  // Proofreading
  setCheckData: (data: ParsedProofreadingData | null) => void;
  setCheckTabMode: (mode: CheckTabMode) => void;
  setCheckSearchQuery: (query: string) => void;

  // File metadata
  updateFileMetadata: (index: number, metadata: PsdMetadata) => void;
}

export type UnifiedViewerStore = UseBoundStore<StoreApi<UnifiedViewerState>>;

export function createUnifiedViewerStore(): UnifiedViewerStore {
  return create<UnifiedViewerState>((set, get) => ({
  // Initial state
  files: [],
  currentFileIndex: -1,
  leftTab: "files",
  rightTab: "text",
  tabPositions: { text: "far-right" },
  displacedTabs: {},
  textContent: "",
  textFilePath: null,
  textHeader: [],
  textPages: [],
  isDirty: false,
  editMode: "select",
  selectedBlockIds: new Set(),
  fontPresets: [],
  presetJsonPath: null,
  checkData: null,
  checkTabMode: "both",
  checkSearchQuery: "",

  // Actions
  setFiles: (files) => set({ files, currentFileIndex: files.length > 0 ? 0 : -1 }),
  addFiles: (newFiles) => {
    const { files } = get();
    const combined = [...files, ...newFiles];
    set({ files: combined, currentFileIndex: files.length === 0 ? 0 : get().currentFileIndex });
  },
  setCurrentFileIndex: (index) => set({ currentFileIndex: index }),
  setLeftTab: (tab) => set({ leftTab: tab }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setTabPosition: (tab, pos) => {
    // 「右サブ」は廃止済み。互換のため万一渡ってきたら「右端」へ正規化する。
    if ((pos as string | null) === "right-sub") {
      pos = "far-right";
    }
    // files は「左端固定」もしくは非表示のみ許可（右側・左サブへ移動不可）
    if (tab === "files" && pos !== null && pos !== "far-left") {
      pos = "far-left";
    }
    // text / proofread / diff は左端へ移動不可（左端は files 専用）。左端を要求された場合は非表示扱い。
    if ((tab === "text" || tab === "proofread" || tab === "diff") && pos === "far-left") {
      pos = null;
    }
    const tp = { ...get().tabPositions };
    const dp = { ...get().displacedTabs };
    const oldPos = tp[tab] ?? null;

    // 移動元を空ける → そこに記憶されていたタブを戻す
    if (oldPos) {
      delete tp[tab];
      const restored = dp[oldPos];
      if (restored && !tp[restored]) {
        tp[restored] = oldPos;
      }
      delete dp[oldPos];
    }

    if (pos === null) {
      // 非表示にするだけ
      set({ tabPositions: tp, displacedTabs: dp });
      return;
    }

    // 移動先に既にタブがあれば押し出して記憶
    const occupant = Object.entries(tp).find(([t, p]) => p === pos && t !== tab);
    if (occupant) {
      const occTab = occupant[0] as PanelTab;
      delete tp[occTab];
      dp[pos] = occTab;
    }

    tp[tab] = pos;
    set({ tabPositions: tp, displacedTabs: dp });
  },

  setTextContent: (content) => set({ textContent: content }),
  setTextFilePath: (path) => set({ textFilePath: path }),
  setTextHeader: (header) => set({ textHeader: header }),
  setTextPages: (pages) => set({ textPages: pages }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setEditMode: (mode) => set({ editMode: mode }),
  setSelectedBlockIds: (ids) => set({ selectedBlockIds: ids }),

  assignFontToBlocks: (blockIds, font) => {
    const { textPages } = get();
    const updated = textPages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) =>
        blockIds.includes(block.id) ? { ...block, assignedFont: font } : block,
      ),
    }));
    set({ textPages: updated, isDirty: true });
  },

  setFontPresets: (presets) => set({ fontPresets: presets }),
  setPresetJsonPath: (path) => set({ presetJsonPath: path }),

  setCheckData: (data) => set({ checkData: data }),
  setCheckTabMode: (mode) => set({ checkTabMode: mode }),
  setCheckSearchQuery: (query) => set({ checkSearchQuery: query }),

  updateFileMetadata: (index, metadata) => {
    const { files } = get();
    if (index < 0 || index >= files.length) return;
    const updated = [...files];
    updated[index] = { ...updated[index], metadata };
    set({ files: updated });
  },
  }));
}

// ─ View 別インスタンス ─────────────────────────────────────
// デフォルト: ビューアー View 用（外部モジュール・旧コードからの参照先）
export const useUnifiedViewerStore: UnifiedViewerStore = createUnifiedViewerStore();
// テキストエディタ View 用（UnifiedViewer 内部からのみ使用）
export const useTextEditorViewerStore: UnifiedViewerStore = createUnifiedViewerStore();

// ─ React Context でスコープ伝播 ────────────────────────────
const ScopedStoreCtx = createContext<UnifiedViewerStore>(useUnifiedViewerStore);

export function ScopedViewerStoreProvider(
  props: { store: UnifiedViewerStore; children: ReactNode },
) {
  return createElement(ScopedStoreCtx.Provider, { value: props.store }, props.children);
}

/** UnifiedViewer 内部と、その配下のパネルから呼び出すフック。
 *  Provider が無い場所で呼ぶと既定のビューアーインスタンスを返す。
 *  セレクタ無しで呼べば state 全体、セレクタありで呼べば派生値を返す。 */
export function useScopedViewerStore(): UnifiedViewerState;
export function useScopedViewerStore<T>(selector: (s: UnifiedViewerState) => T): T;
export function useScopedViewerStore<T>(selector?: (s: UnifiedViewerState) => T) {
  const store = useContext(ScopedStoreCtx);
  return useStore(store, selector as (s: UnifiedViewerState) => T);
}

/** Provider 経由で現在のスコープ用 store インスタンスそのものを取得する。
 *  getState() / setState() / subscribe() を呼ぶ必要がある箇所で使う。 */
export function useScopedViewerStoreApi(): UnifiedViewerStore {
  return useContext(ScopedStoreCtx);
}

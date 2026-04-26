import { create } from "zustand";

export type AppView =
  | "specCheck"
  | "layers"
  | "split"
  | "replace"
  | "compose"
  | "rename"
  | "tiff"
  | "scanPsd"
  | "typesetting"
  | "progen"
  | "textEditor"
  | "unifiedViewer"
  | "folderSetup"
  | "requestPrep"
  | "inspection";

export type ProgenMode = "extraction" | "formatting" | "proofreading" | null;

interface ViewState {
  activeView: AppView;
  isDetailPanelOpen: boolean;
  progenMode: ProgenMode;
  isViewerFullscreen: boolean;
  /** 検版: 検Aフォルダパス */
  kenbanPathA: string | null;
  /** 検版: 検Bフォルダパス */
  kenbanPathB: string | null;
  /** 検版: 差分/分割切替 */
  kenbanViewMode: "diff" | "parallel";
  /** JSONブラウザモード（TopNavモーダル用） */
  jsonBrowserMode: "preset" | "check" | null;
  /** グローバルpromptダイアログ */
  promptDialog: { message: string; defaultValue: string; resolve: (value: string | null) => void } | null;
  /** ホームへ戻る退場アニメーション中フラグ（ViewRouter ラッパーが animate-exit-to-home を付与） */
  isExitingHome: boolean;
  /** ワークフロー開始時の入場アニメーション中フラグ（ViewRouter ラッパーが animate-enter-from-back を付与） */
  isEnteringWorkflow: boolean;
  /** ProGen ⇔ TextEditor / ホーム ⇔ 詳細 / TopNavツール の遷移アニメフェーズ。ViewRouter ラッパーに animate-slide-* クラスを付与 */
  slidePhase: "exit-left" | "exit-right" | "enter-from-right" | "enter-from-left" | "exit-up" | "enter-from-bottom" | null;

  setActiveView: (view: AppView) => void;
  setDetailPanelOpen: (open: boolean) => void;
  toggleDetailPanel: () => void;
  setProgenMode: (mode: ProgenMode) => void;
  setViewerFullscreen: (fullscreen: boolean) => void;
  setKenbanPathA: (path: string | null) => void;
  setKenbanPathB: (path: string | null) => void;
  setKenbanViewMode: (mode: "diff" | "parallel") => void;
  setJsonBrowserMode: (mode: "preset" | "check" | null) => void;
  /** どのビューからでもホームへアニメ付きで戻る（380ms 後に specCheck + home に切替） */
  goToHomeWithExit: () => void;
  /** ワークフロー入場アニメーションをトリガー（ViewRouter ラッパーで奥→手前ズーム） */
  triggerWorkflowEnter: () => void;
  /** ProGen → TextEditor: 右から左へ横スライド切替（exit-left → enter-from-right） */
  slideToTextEditor: () => void;
  /** TextEditor → ProGen: 左から右へ横スライド切替（exit-right → enter-from-left） */
  slideToProgen: () => void;
  /** ホーム → 詳細(thumbnails): 右から左へ横スライド切替 */
  slideToHomeDetail: () => void;
  /** 詳細 → ホーム: 左から右へ横スライド切替 */
  slideFromDetailToHome: () => void;
  /** TopNav ツールメニュー → 任意ビュー: 下から上への縦スライド切替（exit-up → enter-from-bottom） */
  slideToTool: (switchView: () => void) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  activeView: "specCheck",
  isDetailPanelOpen: false,
  progenMode: null,
  isViewerFullscreen: false,
  kenbanPathA: null,
  kenbanPathB: null,
  kenbanViewMode: "diff" as const,
  jsonBrowserMode: null,
  isExitingHome: false,
  isEnteringWorkflow: false,
  slidePhase: null,

  setActiveView: (activeView) => set({ activeView, isExitingHome: false, slidePhase: null }),
  setDetailPanelOpen: (isDetailPanelOpen) => set({ isDetailPanelOpen }),
  toggleDetailPanel: () => set((state) => ({ isDetailPanelOpen: !state.isDetailPanelOpen })),
  setProgenMode: (progenMode) => set({ progenMode }),
  setViewerFullscreen: (isViewerFullscreen) => {
    set({ isViewerFullscreen });
    // OSレベルのフルスクリーン切替（タイトルバーも非表示にする）
    import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
      getCurrentWebviewWindow().setFullscreen(isViewerFullscreen).catch(() => {});
    });
  },
  setKenbanPathA: (kenbanPathA) => set({ kenbanPathA }),
  setKenbanPathB: (kenbanPathB) => set({ kenbanPathB }),
  setKenbanViewMode: (kenbanViewMode) => set({ kenbanViewMode }),
  setJsonBrowserMode: (jsonBrowserMode) => set({ jsonBrowserMode }),
  promptDialog: null,
  goToHomeWithExit: () => {
    if (get().isExitingHome) return;
    // 動的 import で循環依存を回避
    import("./psdStore").then(({ usePsdStore }) => {
      const psd = usePsdStore.getState();
      const { activeView } = get();
      // 既にホーム表示中ならアニメ不要
      if (activeView === "specCheck" && psd.specViewMode === "home") return;
      set({ isExitingHome: true, slidePhase: null });
      window.setTimeout(() => {
        set({ activeView: "specCheck", isExitingHome: false });
        psd.setSpecViewMode("home");
      }, 380);
    });
  },
  triggerWorkflowEnter: () => {
    set({ isEnteringWorkflow: true });
    window.setTimeout(() => set({ isEnteringWorkflow: false }), 420);
  },
  slideToTextEditor: () => {
    if (get().activeView === "textEditor") return;
    runSlideTransition(get, set, "rtl", () => set({ activeView: "textEditor", isExitingHome: false }));
  },
  slideToProgen: () => {
    if (get().activeView === "progen") return;
    runSlideTransition(get, set, "ltr", () => set({ activeView: "progen", isExitingHome: false }));
  },
  slideToHomeDetail: () => {
    import("./psdStore").then(({ usePsdStore }) => {
      const psd = usePsdStore.getState();
      if (get().activeView === "specCheck" && psd.specViewMode !== "home") return;
      runSlideTransition(get, set, "rtl", () => {
        set({ activeView: "specCheck", isExitingHome: false });
        psd.setSpecViewMode("thumbnails");
      });
    });
  },
  slideFromDetailToHome: () => {
    import("./psdStore").then(({ usePsdStore }) => {
      const psd = usePsdStore.getState();
      if (get().activeView === "specCheck" && psd.specViewMode === "home") return;
      runSlideTransition(get, set, "ltr", () => {
        set({ activeView: "specCheck", isExitingHome: false });
        psd.setSpecViewMode("home");
      });
    });
  },
  slideToTool: (switchView) => {
    if (get().slidePhase) return;
    set({ slidePhase: "exit-up" });
    window.setTimeout(() => {
      if (get().slidePhase !== "exit-up") return;
      switchView();
      set({ slidePhase: "enter-from-bottom", isExitingHome: false });
      window.setTimeout(() => {
        if (get().slidePhase !== "enter-from-bottom") return;
        set({ slidePhase: null });
      }, 320);
    }, 200);
  },
}));

// ────────────────────────────────────────────────────────────
// 横スライド遷移ヘルパー
// ────────────────────────────────────────────────────────────
// direction: "rtl" = 右から左（exit-left → enter-from-right）
//            "ltr" = 左から右（exit-right → enter-from-left）
// switchView: 第1段階（exit）終了後に呼ばれる同期処理。activeView や inner state の差替えをここで行う。
function runSlideTransition(
  get: () => ViewState,
  set: (partial: Partial<ViewState>) => void,
  direction: "rtl" | "ltr",
  switchView: () => void,
): void {
  if (get().slidePhase) return;
  const exitPhase = direction === "rtl" ? "exit-left" : "exit-right";
  const enterPhase = direction === "rtl" ? "enter-from-right" : "enter-from-left";
  set({ slidePhase: exitPhase });
  window.setTimeout(() => {
    // 中断検知: 別ナビで slidePhase が変わっていたら no-op
    if (get().slidePhase !== exitPhase) return;
    switchView();
    set({ slidePhase: enterPhase });
    window.setTimeout(() => {
      if (get().slidePhase !== enterPhase) return;
      set({ slidePhase: null });
    }, 320);
  }, 220);
}

/** Tauri互換のpromptダイアログ（window.promptの代替） */
export function showPromptDialog(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    useViewStore.setState({
      promptDialog: { message, defaultValue, resolve },
    });
  });
}

/**
 * A/Bパスセット時のフォルダ検証。
 * PSDがあればPSD優先で通す。問題があればアラートを出してfalseを返す。
 */
export async function validateAndSetABPath(
  side: "A" | "B",
  folderPath: string,
): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const files = await invoke<string[]>("list_folder_files", { folderPath, recursive: false });
    if (files.length === 0) {
      return false;
    }
    const getExt = (f: string) => { const d = f.lastIndexOf("."); return d > 0 ? f.substring(d).toLowerCase() : ""; };
    const psdExts = new Set([".psd", ".psb"]);
    const imageExts = new Set([".psd", ".psb", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif", ".pdf", ".eps"]);

    const psds = files.filter((f) => psdExts.has(getExt(f)));
    const images = files.filter((f) => imageExts.has(getExt(f)));

    // テキストのみ or 画像なし → セットしない（アラートなし）
    if (images.length === 0) {
      return false;
    }
    // PSDがある場合はPSD優先（混在OK）
    if (psds.length > 0) {
      // PSD以外の画像が混在 → 情報表示（ブロックしない）
      const nonPsd = images.filter((f) => !psdExts.has(getExt(f)));
      if (nonPsd.length > 0) {
        // PSD優先なので通す
      }
    } else {
      // PSDなし: 複数拡張子の混在チェック
      const extSet = new Set(images.map((f) => getExt(f)));
      if (extSet.size > 1) {
        const extList = [...extSet].join(", ");
        if (!confirm(`${side}側: 複数の拡張子が混在しています（${extList}）。\nこのまま続行しますか？`)) {
          return false;
        }
      }
    }
  } catch {
    // フォルダ読み取り失敗（ファイル指定の場合など）→ そのまま通す
  }
  // セット
  const vs = useViewStore.getState();
  if (side === "A") vs.setKenbanPathA(folderPath);
  else vs.setKenbanPathB(folderPath);
  return true;
}

/**
 * 差分ビューアー専用ストア（KENBANから移植、Tailwind/Zustandネイティブ版）
 *
 * 元: src/components/kenban/KenbanDiffViewer.tsx (1175行) + KenbanApp.tsx の差分関連state
 */
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// ═══ 型定義 ═══

export type CompareMode = "tiff-tiff" | "psd-psd" | "pdf-pdf" | "psd-tiff";
export type ViewMode = "A" | "B" | "diff";
export type PairingMode = "order" | "name";

export interface DiffFile {
  name: string;
  filePath: string;
  size?: number;
}

export interface DiffMarker {
  x: number;
  y: number;
  radius: number;
  count: number;
}

export interface CropBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FilePair {
  index: number;
  fileA: DiffFile | null;
  fileB: DiffFile | null;
  status: "pending" | "loading" | "checking" | "rendering" | "done" | "error";
  srcA?: string;
  srcB?: string;
  processedA?: string;
  diffSrc?: string;
  hasDiff?: boolean;
  diffCount?: number;
  diffProbability?: number;
  markers?: DiffMarker[];
  imageWidth?: number;
  imageHeight?: number;
  error?: string;
}

interface DiffStore {
  // ── ファイル読み込み ──
  folderA: string | null;
  folderB: string | null;
  filesA: DiffFile[];
  filesB: DiffFile[];

  // ── ペアリング ──
  pairs: FilePair[];
  pairingMode: PairingMode;
  selectedIndex: number;

  // ── 比較モード ──
  compareMode: CompareMode;

  // ── 表示モード ──
  viewMode: ViewMode;

  // ── ズーム/パン ──
  zoom: number;
  panX: number;
  panY: number;
  isDragging: boolean;

  // ── PDF ──
  currentPage: number;
  totalPages: number;

  // ── オプション ──
  threshold: number;
  filterDiffOnly: boolean;
  showMarkers: boolean;
  cropBounds: CropBounds | null;

  // ═══ Actions ═══
  setFolderA: (path: string | null) => void;
  setFolderB: (path: string | null) => void;
  setFilesA: (files: DiffFile[]) => void;
  setFilesB: (files: DiffFile[]) => void;
  loadFolderSide: (path: string, side: "A" | "B") => Promise<void>;

  setPairingMode: (mode: PairingMode) => void;
  setSelectedIndex: (index: number) => void;
  rebuildPairs: () => void;

  setCompareMode: (mode: CompareMode) => void;
  setViewMode: (mode: ViewMode) => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  setIsDragging: (dragging: boolean) => void;

  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;

  setThreshold: (threshold: number) => void;
  setFilterDiffOnly: (filter: boolean) => void;
  setShowMarkers: (show: boolean) => void;
  setCropBounds: (bounds: CropBounds | null) => void;

  /** 1ペアの差分計算を実行 */
  processPair: (index: number) => Promise<void>;
  /** 全ペアを順次処理 */
  processAllPairs: () => Promise<void>;
  /** 全クリア */
  reset: () => void;
}

// ═══ ヘルパー ═══

const SUPPORTED_EXTS: Record<CompareMode, { a: string[]; b: string[] }> = {
  "tiff-tiff": {
    a: ["tif", "tiff", "jpg", "jpeg", "png", "bmp"],
    b: ["tif", "tiff", "jpg", "jpeg", "png", "bmp"],
  },
  "psd-psd": { a: ["psd", "psb"], b: ["psd", "psb"] },
  "pdf-pdf": { a: ["pdf"], b: ["pdf"] },
  "psd-tiff": { a: ["psd", "psb"], b: ["tif", "tiff", "jpg", "jpeg"] },
};

function getExt(path: string): string {
  return path.substring(path.lastIndexOf(".") + 1).toLowerCase();
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function getBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** 自然順ソート */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" });
}

/** ファイルのプレビューURLを取得（PSD/PDF/通常画像対応） */
export async function loadPreviewUrl(filePath: string): Promise<string> {
  const ext = getExt(filePath);
  if (ext === "pdf") {
    const result = await invoke<{ src: string; width: number; height: number }>(
      "kenban_render_pdf_page",
      { path: filePath, page: 1, dpi: 150, splitSide: null },
    );
    return convertFileSrc(result.src);
  } else if (ext === "psd" || ext === "psb") {
    const result = await invoke<{ file_url: string; width: number; height: number }>(
      "kenban_parse_psd",
      { path: filePath },
    );
    return convertFileSrc(result.file_url);
  } else {
    return convertFileSrc(filePath);
  }
}

/** ファイル拡張子からCompareModeを推定 */
export function detectCompareMode(extA: string, extB?: string): CompareMode {
  const psdExts = ["psd", "psb"];
  const tiffExts = ["tif", "tiff", "jpg", "jpeg", "png", "bmp"];
  if (extA === "pdf") return "pdf-pdf";
  if (psdExts.includes(extA)) {
    if (extB && tiffExts.includes(extB)) return "psd-tiff";
    return "psd-psd";
  }
  return "tiff-tiff";
}

// ═══ ストア ═══

export const useDiffStore = create<DiffStore>((set, get) => ({
  // ── 初期値 ──
  folderA: null,
  folderB: null,
  filesA: [],
  filesB: [],
  pairs: [],
  pairingMode: "order",
  selectedIndex: 0,
  compareMode: "tiff-tiff",
  viewMode: "A",
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  currentPage: 1,
  totalPages: 1,
  threshold: 30,
  filterDiffOnly: false,
  showMarkers: true,
  cropBounds: null,

  // ── Actions ──
  setFolderA: (path) => set({ folderA: path }),
  setFolderB: (path) => set({ folderB: path }),
  setFilesA: (files) => { set({ filesA: files }); get().rebuildPairs(); },
  setFilesB: (files) => { set({ filesB: files }); get().rebuildPairs(); },

  /** フォルダ or ファイルパスからファイル一覧を読み込み */
  loadFolderSide: async (path, side) => {
    const ext = getExt(path);
    const isFile = ext.length > 0 && ["pdf", "psd", "psb", "tif", "tiff", "jpg", "jpeg", "png", "bmp"].includes(ext);

    if (isFile) {
      // 単一ファイル
      const file: DiffFile = { name: getFileName(path), filePath: path };
      // CompareMode自動判定
      const otherFiles = side === "A" ? get().filesB : get().filesA;
      const otherExt = otherFiles[0] ? getExt(otherFiles[0].filePath) : "";
      const mode = detectCompareMode(ext, otherExt || ext);
      set({ compareMode: mode });
      if (side === "A") {
        set({ folderA: path, filesA: [file] });
      } else {
        set({ folderB: path, filesB: [file] });
      }
    } else {
      // フォルダ → 中のファイル一覧取得
      const compareMode = get().compareMode;
      const exts = SUPPORTED_EXTS[compareMode];
      const allExts = [...new Set([...exts.a, ...exts.b])];
      try {
        const filePaths = await invoke<string[]>("kenban_list_files_in_folder", {
          path,
          extensions: allExts,
        });
        const files: DiffFile[] = filePaths
          .map((p) => ({ name: getFileName(p), filePath: p }))
          .sort((a, b) => naturalSort(a.name, b.name));
        if (side === "A") {
          set({ folderA: path, filesA: files });
        } else {
          set({ folderB: path, filesB: files });
        }
      } catch (e) {
        console.error("loadFolderSide error:", e);
      }
    }
    get().rebuildPairs();
  },

  setPairingMode: (mode) => { set({ pairingMode: mode }); get().rebuildPairs(); },
  setSelectedIndex: (index) => set({ selectedIndex: index, currentPage: 1 }),

  rebuildPairs: () => {
    const { filesA, filesB, pairingMode } = get();
    const pairs: FilePair[] = [];

    if (pairingMode === "order") {
      const maxLen = Math.max(filesA.length, filesB.length);
      for (let i = 0; i < maxLen; i++) {
        pairs.push({
          index: i,
          fileA: filesA[i] || null,
          fileB: filesB[i] || null,
          status: "pending",
        });
      }
    } else {
      // name pairing: extension-stripped basename
      const mapA = new Map(filesA.map((f) => [getBaseName(f.name), f]));
      const mapB = new Map(filesB.map((f) => [getBaseName(f.name), f]));
      const allKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort(naturalSort);
      for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];
        pairs.push({
          index: i,
          fileA: mapA.get(key) || null,
          fileB: mapB.get(key) || null,
          status: "pending",
        });
      }
    }
    set({ pairs, selectedIndex: 0 });
  },

  setCompareMode: (mode) => set({ compareMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(10, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.1, s.zoom / 1.2) })),
  resetZoom: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),

  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),

  setThreshold: (threshold) => set({ threshold }),
  setFilterDiffOnly: (filter) => set({ filterDiffOnly: filter }),
  setShowMarkers: (show) => set({ showMarkers: show }),
  setCropBounds: (bounds) => set({ cropBounds: bounds }),

  processPair: async (index) => {
    const { pairs, compareMode, threshold, cropBounds } = get();
    const pair = pairs[index];
    if (!pair) return;

    // ── A単独 or B単独 → プレビューだけ読み込む ──
    if (!pair.fileA || !pair.fileB) {
      const file = pair.fileA || pair.fileB;
      if (!file) return;
      try {
        const url = await loadPreviewUrl(file.filePath);
        set((s) => {
          const next = [...s.pairs];
          if (pair.fileA) {
            next[index] = { ...next[index], status: "done", srcA: url };
          } else {
            next[index] = { ...next[index], status: "done", srcB: url };
          }
          return { pairs: next };
        });
      } catch (e) {
        set((s) => {
          const next = [...s.pairs];
          next[index] = { ...next[index], status: "error", error: String(e) };
          return { pairs: next };
        });
      }
      return;
    }

    // status: loading
    set((s) => {
      const next = [...s.pairs];
      next[index] = { ...next[index], status: "loading" };
      return { pairs: next };
    });

    // ── PDF-PDF の場合は差分計算をスキップしてプレビューだけ ──
    if (compareMode === "pdf-pdf") {
      try {
        const [urlA, urlB] = await Promise.all([
          loadPreviewUrl(pair.fileA.filePath),
          loadPreviewUrl(pair.fileB.filePath),
        ]);
        set((s) => {
          const next = [...s.pairs];
          next[index] = { ...next[index], status: "done", srcA: urlA, srcB: urlB };
          return { pairs: next };
        });
      } catch (e) {
        set((s) => {
          const next = [...s.pairs];
          next[index] = { ...next[index], status: "error", error: String(e) };
          return { pairs: next };
        });
      }
      return;
    }

    try {
      if (compareMode === "psd-tiff") {
        if (!cropBounds) {
          set((s) => {
            const next = [...s.pairs];
            next[index] = { ...next[index], status: "error", error: "クロップ範囲未設定" };
            return { pairs: next };
          });
          return;
        }
        const result = await invoke<any>("compute_diff_heatmap", {
          psdPath: pair.fileA.filePath,
          tiffPath: pair.fileB.filePath,
          cropBounds,
          threshold,
        });
        set((s) => {
          const next = [...s.pairs];
          next[index] = {
            ...next[index],
            status: "done",
            srcA: convertFileSrc(result.src_a),
            srcB: convertFileSrc(result.src_b),
            processedA: convertFileSrc(result.processed_a),
            diffSrc: convertFileSrc(result.diff_src),
            hasDiff: result.has_diff,
            diffProbability: result.diff_probability,
            markers: result.markers,
            imageWidth: result.image_width,
            imageHeight: result.image_height,
          };
          return { pairs: next };
        });
      } else {
        // simple diff (tiff-tiff, psd-psd, pdf-pdf)
        const result = await invoke<any>("compute_diff_simple", {
          pathA: pair.fileA.filePath,
          pathB: pair.fileB.filePath,
          threshold,
        });
        set((s) => {
          const next = [...s.pairs];
          next[index] = {
            ...next[index],
            status: "done",
            srcA: convertFileSrc(result.src_a),
            srcB: convertFileSrc(result.src_b),
            diffSrc: convertFileSrc(result.diff_src),
            hasDiff: result.has_diff,
            diffCount: result.diff_count,
            markers: result.markers,
            imageWidth: result.image_width,
            imageHeight: result.image_height,
          };
          return { pairs: next };
        });
      }
    } catch (e) {
      set((s) => {
        const next = [...s.pairs];
        next[index] = { ...next[index], status: "error", error: String(e) };
        return { pairs: next };
      });
    }
  },

  processAllPairs: async () => {
    const { pairs } = get();
    for (let i = 0; i < pairs.length; i++) {
      const p = get().pairs[i];
      if (p.status === "done" || !p.fileA || !p.fileB) continue;
      await get().processPair(i);
    }
  },

  reset: () => set({
    folderA: null,
    folderB: null,
    filesA: [],
    filesB: [],
    pairs: [],
    selectedIndex: 0,
    viewMode: "A",
    zoom: 1,
    panX: 0,
    panY: 0,
    currentPage: 1,
    totalPages: 1,
    cropBounds: null,
  }),
}));

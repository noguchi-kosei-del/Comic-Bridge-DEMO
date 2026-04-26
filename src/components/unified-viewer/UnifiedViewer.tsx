/**
 * 統合ビューアー — 3カラムレイアウト
 * Left: ファイルリスト / レイヤー構造 / 写植仕様
 * Center: 画像ビューアー (PSD/Image/PDF)
 * Right: テキスト編集 / 校正JSON
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FileContextMenu } from "../common/FileContextMenu";

// 開発モード時は右クリックでの独自コンテキストメニュー表示を無効化して、
// ネイティブの「検証」メニュー（DevTools）を使えるようにする。戻す時は true に。
const CONTEXT_MENU_ENABLED = false;
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  useUnifiedViewerStore,
  useTextEditorViewerStore,
  ScopedViewerStoreProvider,
  useScopedViewerStore,
  useScopedViewerStoreApi,
  type ViewerFile,
  type FontPresetEntry,
  type PanelPosition,
} from "../../store/unifiedViewerStore";
import type { PanelTab } from "../../store/unifiedViewerStore";
import { type ProofreadingCheckItem } from "../../types/typesettingCheck";
import { JsonFileBrowser } from "../scanPsd/JsonFileBrowser";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { usePsdStore } from "../../store/psdStore";
import { useViewStore, showPromptDialog } from "../../store/viewStore";
import {
  collectTextLayers,
  FONT_COLORS,
  MISSING_FONT_COLOR,
  type FontResolveInfo,
} from "../../hooks/useFontResolver";
import { normalizeTextForComparison } from "../../kenban-utils/textExtract";
import { useTextDiff } from "./hooks/useTextDiff";
import { ProofreadPanel } from "./panels/ProofreadPanel";
import { DiffPanel } from "./panels/DiffPanel";
import { TextEditorDropPanel } from "./panels/TextEditorDropPanel";

// ─── Separated modules ─────────────────────────────────
import {
  ALL_PANEL_TABS,
  ZOOM_STEPS,
  MAX_SIZE,
  parseComicPotText,
  isImageFile,
  isPsdFile,
  getTextPageNumbers,
  type CacheEntry,
} from "./utils";
import {
  SortableBlockItem,
  CheckJsonBrowser,
} from "./UnifiedSubComponents";
import { useViewerFileOps } from "./useViewerFileOps";
import { LayerTree as FullLayerTree } from "../metadata/LayerTree";
import { useFontBookStore } from "../../store/fontBookStore";
import type { FontBookEntry } from "../../types/fontBook";
import { Sparkles, Save, FilePlus } from "lucide-react";

// (utils, helpers, sub-components are imported from ./utils and ./UnifiedSubComponents)

// ═════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════
export interface UnifiedViewerProps {
  /** テキストエディタビュー時は files / layers / spec タブを隠す */
  textEditorMode?: boolean;
}

// 外側: View に応じたストアインスタンスを選び、Provider で子に伝播する薄いラッパー。
// これにより「ビューアー View」と「テキストエディタ View」で同じ UnifiedViewer を
// マウントしても互いの state（ファイル・タブ配置・テキスト内容など）が混線しない。
export function UnifiedViewer(props: UnifiedViewerProps = {}) {
  const storeApi = props.textEditorMode ? useTextEditorViewerStore : useUnifiedViewerStore;
  return (
    <ScopedViewerStoreProvider store={storeApi}>
      <UnifiedViewerInner {...props} />
    </ScopedViewerStoreProvider>
  );
}

function UnifiedViewerInner({ textEditorMode = false }: UnifiedViewerProps) {
  const store = useScopedViewerStore();
  const storeApi = useScopedViewerStoreApi();
  const [viewerContextMenu, setViewerContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Sync with psdStore: メイン画面のPSDファイルを常にビューアーに反映
  const psdFiles = usePsdStore((s) => s.files);
  const activeView = useViewStore((s) => s.activeView);
  const psdFilesSig = useMemo(() => psdFiles.map((f) => f.filePath).join("|"), [psdFiles]);

  const doSync = useCallback(() => {
    const latest = usePsdStore.getState().files;
    if (latest.length === 0) return;
    const viewerFiles: ViewerFile[] = latest.map((f) => {
      const isPdf = f.sourceType === "pdf" || f.filePath.toLowerCase().endsWith(".pdf");
      return {
        name: f.fileName,
        path: f.filePath,
        sourceType: /\.(psd|psb)$/i.test(f.fileName) ? "psd" as const : isPdf ? "pdf" as const : "image" as const,
        metadata: f.metadata || undefined,
        // PDF情報をマッピング（pdfPageIndex: 0-indexed → pdfPage: 1-indexed）
        isPdf: isPdf && !!f.pdfSourcePath,
        pdfPath: f.pdfSourcePath,
        pdfPage: f.pdfPageIndex != null ? f.pdfPageIndex + 1 : undefined,
      };
    });
    store.setFiles(viewerFiles);
  }, []);

  // ファイル変更時に同期
  useEffect(() => { doSync(); }, [psdFilesSig]);
  // ビューアータブに切り替えた時に強制同期 + 画像再読み込み
  const loadImageRef = useRef<(i: number) => void>(() => {});
  useEffect(() => {
    // UnifiedViewer は「ビューアー」と「テキストエディタ」の両 View にマウントされるため、
    // 自身が該当する activeView の時のみ同期する（インスタンスの混線防止）。
    const targetView = textEditorMode ? "textEditor" : "unifiedViewer";
    if (activeView === targetView) {
      doSync();
      cache.current.clear();
      // ビューアー view 限定: 校正JSON が far-right 以外に居たら far-right（右サイドバー）へ移動
      if (!textEditorMode) {
        const s = storeApi.getState();
        const curProof = s.tabPositions.proofread ?? null;
        if (curProof !== null && curProof !== "far-right") {
          s.setTabPosition("proofread", "far-right");
        }
        // editor はテキストエディタ view 専用のパネルなのでビューアー view では格納
        if ((s.tabPositions.editor ?? null) !== null) {
          s.setTabPosition("editor", null);
        }
      } else {
        // テキストエディタ view では左のファイル一覧パネルは常に非表示
        const s = storeApi.getState();
        if ((s.tabPositions.files ?? null) !== null) {
          s.setTabPosition("files", null);
        }
      }
      // メイン画面のactiveFileIdに対応するインデックスに自動移動
      setTimeout(() => {
        const st = storeApi.getState();
        const psd = usePsdStore.getState();
        if (st.files.length > 0) {
          let idx = st.currentFileIndex;
          if (psd.activeFileId) {
            const matchIdx = st.files.findIndex((f) => f.path === psd.files.find((p) => p.id === psd.activeFileId)?.filePath);
            if (matchIdx >= 0) idx = matchIdx;
          }
          st.setCurrentFileIndex(idx >= 0 ? idx : 0);
          loadImageRef.current(idx >= 0 ? idx : 0);
        }
      }, 100);
    }
  }, [activeView, textEditorMode]);

  // D&D sensors
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // --- Local viewer state ---
  const [zoom, setZoom] = useState(0);
  const [loading, setLoading] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // ページ連動は常時 ON（トグル UI は削除済み）
  const pageSync = true;
  const [viewerVisible, setViewerVisible] = useState(true);

  // Text editor local
  const [selectedChunk, setSelectedChunk] = useState(-1);
  // テキスト編集: ローカルバッファ（確定まで反映しない）
  const [editBuffer, setEditBuffer] = useState<string | null>(null);
  const [editCursorPos, setEditCursorPos] = useState<number | null>(null);
  const [chunks, setChunks] = useState<{ text: string; page: number }[]>([]);

  // JSON browser
  const [jsonBrowserMode, setJsonBrowserMode] = useState<"preset" | "check" | null>(null);
  const jsonFolderPath = useScanPsdStore((s) => s.jsonFolderPath);

  // Font resolution (和名表示)
  const [fontResolveMap, setFontResolveMap] = useState<Record<string, FontResolveInfo>>({});
  const [fontResolved, setFontResolved] = useState(false);

  // Layer highlight (写植仕様タブ → 画像ハイライト)
  const [highlightBounds, setHighlightBounds] = useState<{ top: number; left: number; bottom: number; right: number } | null>(null);
  const [activeFontFilter, setActiveFontFilter] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<PanelTab>("text");
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);

  // フォント帳の自動読み込み（作品情報JSON読み込み時）
  useEffect(() => {
    const scan = useScanPsdStore.getState();
    if (scan.workInfo.label && scan.workInfo.title && scan.textLogFolderPath) {
      useFontBookStore.getState().loadFontBook(scan.textLogFolderPath, scan.workInfo.label, scan.workInfo.title);
    }
  }, [store.presetJsonPath]);

  // フォント帳スクショキャプチャ: ドラッグ範囲選択 → 画像として保存
  const [captureMode, setCaptureMode] = useState(false);
  const [captureDrag, setCaptureDrag] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  const handleFontBookCapture = useCallback(async (bounds: { left: number; top: number; right: number; bottom: number }) => {
    if (!activeFontFilter) return;
    const fontBookDir = useFontBookStore.getState().fontBookDir;
    if (!fontBookDir) {
      setCaptureStatus("フォント帳フォルダ未設定（作品情報JSONを読み込んでください）");
      setTimeout(() => setCaptureStatus(null), 3000);
      return;
    }
    try {
      // asset://プロトコルはtainted canvasになるため、新しいImageをcrossOrigin付きで読み込む
      const srcUrl = imgRef.current?.src;
      if (!srcUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = srcUrl;
      });

      const scaleX = img.naturalWidth / dims.w;
      const scaleY = img.naturalHeight / dims.h;
      const sx = Math.round(bounds.left * scaleX);
      const sy = Math.round(bounds.top * scaleY);
      const sw = Math.max(1, Math.round((bounds.right - bounds.left) * scaleX));
      const sh = Math.max(1, Math.round((bounds.bottom - bounds.top) * scaleY));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92);
      });
      const arrayBuffer = await blob.arrayBuffer();
      const curFile = storeApi.getState().files[storeApi.getState().currentFileIndex];
      const entry: FontBookEntry = {
        id: `${activeFontFilter}-${Date.now()}`,
        fontPostScript: activeFontFilter,
        fontDisplayName: getFontLabel(activeFontFilter),
        subName: "",
        sourceFile: curFile?.name || "viewer",
        capturedAt: new Date().toISOString(),
      };
      await useFontBookStore.getState().addEntry(entry, new Uint8Array(arrayBuffer));
      setCaptureStatus("保存しました");
      setTimeout(() => setCaptureStatus(null), 2000);
    } catch (e) {
      console.error("Capture failed:", e);
      setCaptureStatus("キャプチャ失敗");
      setTimeout(() => setCaptureStatus(null), 2000);
    }
  }, [activeFontFilter, dims]);

  // 単ページ化モード
  const [spreadMode, setSpreadMode] = useState(false); // 見開き分割ON/OFF
  const [firstPageMode, setFirstPageMode] = useState<"single" | "spread" | "skip">("single");
  // 互換用: 既存コードが参照する diffSplitMode
  const diffSplitMode: "none" | "spread" | "spread-skip1" | "single1" = !spreadMode
    ? "none"
    : firstPageMode === "single" ? "single1"
    : firstPageMode === "skip" ? "spread-skip1"
    : "spread";

  // Panel resize — 左右サイドバーの幅（リサイズ可能）
  const MIN_PANEL_WIDTH = 150;
  const MAX_PANEL_WIDTH = 600;
  const [leftPanelWidth, setLeftPanelWidth] = useState(272);
  const [rightPanelWidth, setRightPanelWidth] = useState(272);
  const [resizingSide, setResizingSide] = useState<"left" | "right" | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  // Refs
  const cache = useRef(new Map<string, CacheEntry>());
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const pdfjsRef = useRef<any>(null);
  const pdfDocCache = useRef(new Map<string, any>());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { files, currentFileIndex: idx } = store;
  const cur = files[idx] || null;
  useEffect(() => { setSelectedLayerId(null); setHighlightBounds(null); }, [idx]);

  // ═══ PDF.js lazy load ═══
  const ensurePdfJs = useCallback(async () => {
    if (pdfjsRef.current) return pdfjsRef.current;
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    pdfjsRef.current = pdfjs;
    return pdfjs;
  }, []);

  const renderPdfPage = useCallback(
    async (pdfPath: string, pageNum: number): Promise<CacheEntry | null> => {
      try {
        const pdfjs = await ensurePdfJs();
        let doc = pdfDocCache.current.get(pdfPath);
        if (!doc) {
          doc = await pdfjs.getDocument(convertFileSrc(pdfPath)).promise;
          pdfDocCache.current.set(pdfPath, doc);
        }
        const page = await doc.getPage(pageNum);
        const vp = page.getViewport({ scale: 2.0 });
        const c = document.createElement("canvas");
        c.width = vp.width;
        c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        return { url: c.toDataURL("image/png"), w: vp.width, h: vp.height };
      } catch {
        return null;
      }
    },
    [ensurePdfJs],
  );

  const expandPdf = useCallback(
    async (raw: ViewerFile[]): Promise<ViewerFile[]> => {
      const out: ViewerFile[] = [];
      for (const f of raw) {
        if (f.name.toLowerCase().endsWith(".pdf")) {
          try {
            const pdfjs = await ensurePdfJs();
            const doc = await pdfjs.getDocument(convertFileSrc(f.path)).promise;
            pdfDocCache.current.set(f.path, doc);
            const n = doc.numPages;
            for (let i = 1; i <= n; i++)
              out.push({
                name: n > 1 ? `${f.name} (p.${i}/${n})` : f.name,
                path: `${f.path}#page=${i}`,
                sourceType: "pdf",
                isPdf: true,
                pdfPage: i,
                pdfPath: f.path,
              });
          } catch {
            out.push(f);
          }
        } else {
          out.push(f);
        }
      }
      return out;
    },
    [ensurePdfJs],
  );

  // ═══ Image loading ═══
  const loadImage = useCallback(
    async (i: number) => {
      // 常にstoreから最新のfilesを取得（クロージャの古い参照問題を回避）
      const latestFiles = storeApi.getState().files;
      if (i < 0 || i >= latestFiles.length) return;
      setLoading(true);
      const f = latestFiles[i];
      // キャッシュキー: PDFはページ番号も含める
      const cacheKey = f.pdfPage ? `${f.path}#p${f.pdfPage}` : f.path;
      const cached = cache.current.get(cacheKey);
      if (cached) {
        setImgUrl(cached.url);
        setDims({ w: cached.w, h: cached.h });
        setLoading(false);
        return;
      }
      try {
        let e: CacheEntry | null = null;
        if (f.isPdf && f.pdfPath && f.pdfPage) {
          // ページ分割済みPDF
          e = await renderPdfPage(f.pdfPath, f.pdfPage);
        } else if (f.sourceType === "pdf" || f.path.toLowerCase().endsWith(".pdf")) {
          // ファイル単位PDF（ページ1を表示）
          const pdfPath = f.pdfPath || f.path;
          e = await renderPdfPage(pdfPath, f.pdfPage || 1);
        } else {
          // Use standard get_high_res_preview command
          const r = await invoke<any>("get_high_res_preview", {
            filePath: f.path,
            maxSize: MAX_SIZE,
          });
          if (r.file_path)
            e = {
              url: convertFileSrc(r.file_path),
              w: r.original_width || 0,
              h: r.original_height || 0,
            };
        }
        if (e) {
          cache.current.set(cacheKey, e);
          setImgUrl(e.url);
          setDims({ w: e.w, h: e.h });
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    },
    [renderPdfPage],
  );

  // Prefetch ±2
  useEffect(() => {
    if (idx < 0 || files.length === 0) return;
    for (const off of [1, -1, 2, -2]) {
      const ni = idx + off;
      if (ni < 0 || ni >= files.length) continue;
      const f = files[ni];
      const ck = f.pdfPage ? `${f.path}#p${f.pdfPage}` : f.path;
      if (cache.current.has(ck)) continue;
      if (f.isPdf && f.pdfPath && f.pdfPage)
        renderPdfPage(f.pdfPath, f.pdfPage).then((e) => e && cache.current.set(ck, e));
      else if (f.sourceType === "pdf" || f.path.toLowerCase().endsWith(".pdf"))
        renderPdfPage(f.pdfPath || f.path, f.pdfPage || 1).then((e) => e && cache.current.set(ck, e));
      else
        invoke<any>("get_high_res_preview", { filePath: f.path, maxSize: MAX_SIZE })
          .then((r: any) => {
            if (r.file_path)
              cache.current.set(ck, {
                url: convertFileSrc(r.file_path),
                w: r.original_width || 0,
                h: r.original_height || 0,
              });
          })
          .catch(() => {});
    }
  }, [idx, files, renderPdfPage]);

  // loadImageの最新参照を保持（setTimeout内から呼ぶため）
  useEffect(() => { loadImageRef.current = loadImage; }, [loadImage]);

  // ファイル変更時に画像を読み込み
  const filesSig = useMemo(() => files.map((f) => f.path).join("|"), [files]);
  useEffect(() => {
    if (idx >= 0 && files.length > 0) loadImage(idx);
  }, [idx, loadImage, filesSig]);

  // Load PSD metadata when file changes
  useEffect(() => {
    if (idx < 0 || !cur || cur.metadata) return;
    if (!isPsdFile(cur.name)) return;
    invoke<any[]>("parse_psd_metadata_batch", { filePaths: [cur.path] })
      .then((results) => {
        if (results[0]?.metadata) store.updateFileMetadata(idx, results[0].metadata);
      })
      .catch(() => {});
  }, [idx, cur]);

  // ═══ Block D&D reorder ═══
  const handleBlockReorder = useCallback(
    (pageNumber: number, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const page = store.textPages.find((p) => p.pageNumber === pageNumber);
      if (!page) return;
      const oldIdx = page.blocks.findIndex((b) => b.id === active.id);
      const newIdx = page.blocks.findIndex((b) => b.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(page.blocks, oldIdx, newIdx);
      const updated = store.textPages.map((p) =>
        p.pageNumber === pageNumber ? { ...p, blocks: reordered } : p,
      );
      store.setTextPages(updated);
      store.setIsDirty(true);
    },
    [store.textPages],
  );

  // ═══ Block add (ブロック追加) ═══
  const handleAddBlock = useCallback(
    (pageNumber: number) => {
      const newId = `p${pageNumber}-b${Date.now()}`;
      const updated = store.textPages.map((p) => {
        if (p.pageNumber !== pageNumber) return p;
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { id: newId, originalIndex: -1, lines: [""], isAdded: true },
          ],
        };
      });
      store.setTextPages(updated);
      store.setIsDirty(true);
    },
    [store.textPages],
  );

  // ═══ Block delete toggle (// prefix) ═══
  const handleDeleteBlocks = useCallback(() => {
    if (store.selectedBlockIds.size === 0) return;
    const updated = store.textPages.map((p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        if (!store.selectedBlockIds.has(b.id)) return b;
        const firstLine = b.lines[0] || "";
        if (firstLine.startsWith("//")) {
          return { ...b, lines: [firstLine.slice(2), ...b.lines.slice(1)] };
        }
        return { ...b, lines: ["//" + firstLine, ...b.lines.slice(1)] };
      }),
    }));
    store.setTextPages(updated);
    store.setIsDirty(true);
    store.setSelectedBlockIds(new Set());
  }, [store.textPages, store.selectedBlockIds]);

  // ═══ Block inline edit (ダブルクリック編集) ═══
  const handleEditBlock = useCallback(
    (blockId: string, newLines: string[]) => {
      const updated = store.textPages.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, lines: newLines } : b)),
      }));
      store.setTextPages(updated);
      store.setIsDirty(true);
    },
    [store.textPages],
  );

  // 編集モード切替時にバッファを初期化
  useEffect(() => {
    if (store.editMode === "edit") {
      setEditBuffer(store.textContent);
      setEditCursorPos(null);
    } else {
      setEditBuffer(null);
    }
  }, [store.editMode]);

  // カーソル位置復元
  useEffect(() => {
    if (editCursorPos !== null && textareaRef.current) {
      textareaRef.current.selectionStart = editCursorPos;
      textareaRef.current.selectionEnd = editCursorPos;
    }
  }, [editBuffer, editCursorPos]);

  // ═══ Text chunks (for select mode) ═══
  const parseChunks = useCallback((content: string) => {
    const lines = content.split("\n");
    const result: { text: string; page: number }[] = [];
    let page = 0;
    let buf: string[] = [];
    const pageRe = /<<(\d+)Page>>/;
    for (const line of lines) {
      const pm = line.match(pageRe);
      if (pm) {
        if (buf.length) result.push({ text: buf.join("\n"), page });
        page = parseInt(pm[1], 10);
        buf = [];
        continue;
      }
      if (line.trim() === "" && buf.length) {
        result.push({ text: buf.join("\n"), page });
        buf = [];
        continue;
      }
      buf.push(line);
    }
    if (buf.length) result.push({ text: buf.join("\n"), page });
    setChunks(result);
  }, []);

  // textContent が外部（TopNav等）から変更された場合にchunks + textPagesを自動更新
  useEffect(() => {
    if (store.textContent.length > 0) {
      parseChunks(store.textContent);
      // textPagesが空の場合のみ自動パース（既にパース済みの場合は上書きしない）
      if (store.textPages.length === 0) {
        const { header, pages } = parseComicPotText(store.textContent);
        if (pages.length > 0) {
          store.setTextHeader(header);
          store.setTextPages(pages);
        }
      }
    } else {
      setChunks([]);
    }
  }, [store.textContent, parseChunks]);

  // ═══ File operations (extracted to useViewerFileOps) ═══
  const { openTextFile, handleJsonFileSelect, handleSave: handleSaveBase, handleSaveAs } = useViewerFileOps({
    expandPdf,
    parseChunks,
    cache,
    setZoom,
    jsonBrowserMode,
    setJsonBrowserMode,
  });

  // 編集バッファ対応の保存ハンドラ
  // 編集モード: editBuffer をファイルに書き込み、ストアにも反映
  // 選択モード: textPages を serializeText で再構築して保存（ブロック移動・フォント変更を反映）
  const handleSave = useCallback(async () => {
    const s = storeApi.getState();
    if (!s.textFilePath) return;
    // 編集中で未確定の変更がある場合は editBuffer を保存
    if (editBuffer !== null && editBuffer !== s.textContent) {
      try {
        await invoke("write_text_file", { filePath: s.textFilePath, content: editBuffer });
        s.setTextContent(editBuffer);
        parseChunks(editBuffer);
        const { header, pages } = parseComicPotText(editBuffer);
        s.setTextHeader(header);
        s.setTextPages(pages);
        s.setIsDirty(false);
      } catch { /* ignore */ }
      return;
    }
    // 選択モードの変更（ブロック移動・フォント割当・追加・削除）を反映して保存
    if (s.textPages.length > 0) {
      const { serializeText: serialize } = await import("./utils");
      const content = serialize(s.textHeader, s.textPages, s.fontPresets);
      try {
        await invoke("write_text_file", { filePath: s.textFilePath, content });
        s.setTextContent(content);
        parseChunks(content);
        s.setIsDirty(false);
      } catch { /* ignore */ }
      return;
    }
    // フォールバック: そのまま保存
    await handleSaveBase();
  }, [editBuffer, parseChunks, handleSaveBase]);

  const syncToPage = useCallback(
    (pageNum: number) => {
      if (store.editMode === "edit") {
        const ta = textareaRef.current;
        if (!ta) return;
        const lines = ta.value.split("\n");
        let pg = 0;
        let charPos = 0;
        let lineIdx = 0;
        for (const line of lines) {
          const m = line.match(/<<(\d+)Page>>/);
          if (m) pg = parseInt(m[1], 10);
          if (pg >= pageNum) {
            ta.focus();
            ta.setSelectionRange(charPos, charPos);
            // 行ベースのスクロール計算（character-proportional は不正確なため使わない）
            const cs = getComputedStyle(ta);
            const lineHeight =
              parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 18;
            const paddingTop = parseFloat(cs.paddingTop) || 0;
            ta.scrollTop = Math.max(0, lineIdx * lineHeight - paddingTop);
            return;
          }
          charPos += line.length + 1;
          lineIdx++;
        }
      } else {
        // view モード: chunks の選択を更新
        const ci = chunks.findIndex((c) => c.page >= pageNum);
        if (ci >= 0) setSelectedChunk(ci);
        // textPages 一覧で対応ページを画面内にスクロール
        // requestAnimationFrame で次フレームに実行（DOM更新後）
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-text-page="${pageNum}"]`);
          if (el && typeof (el as HTMLElement).scrollIntoView === "function") {
            (el as HTMLElement).scrollIntoView({ block: "start", behavior: "smooth" });
          }
        });
      }
    },
    [store.editMode, chunks],
  );

  // Page sync on image change
  useEffect(() => {
    if (!pageSync || idx < 0) return;
    syncToPage(idx + 1);
  }, [idx, pageSync, syncToPage]);

  // ═══ D&D ═══
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      const win = getCurrentWebviewWindow();
      unlisten = await win.onDragDropEvent(async (event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setDragOver(true);
        } else if (p.type === "leave") {
          setDragOver(false);
        } else if (p.type === "drop") {
          setDragOver(false);
          const paths: string[] = (p as any).paths || [];
          if (!paths.length) return;
          // .txt → text
          const txtPaths = paths.filter((pp) => pp.toLowerCase().endsWith(".txt"));
          if (txtPaths.length > 0) {
            try {
              const bytes = await readFile(txtPaths[0]);
              const content = new TextDecoder("utf-8").decode(bytes);
              store.setTextContent(content);
              store.setTextFilePath(txtPaths[0]);
              const { header, pages } = parseComicPotText(content);
              store.setTextHeader(header);
              store.setTextPages(pages);
              store.setIsDirty(false);
              parseChunks(content);
              store.setRightTab("text");
            } catch { /* ignore */ }
          }
          // .json → check data
          const jsonPaths = paths.filter((pp) => pp.toLowerCase().endsWith(".json"));
          if (jsonPaths.length > 0) {
            try {
              const bytes = await readFile(jsonPaths[0]);
              const content = new TextDecoder("utf-8").decode(bytes);
              const data = JSON.parse(content);
              // Detect type: proofreading or preset
              if (data.checks || (Array.isArray(data) && data[0]?.category)) {
                // Proofreading JSON
                const allItems: ProofreadingCheckItem[] = [];
                const parseArr = (src: any, fallbackKind: "correctness" | "proposal") => {
                  const arr = Array.isArray(src) ? src : Array.isArray(src?.items) ? src.items : null;
                  if (!arr) return;
                  for (const item of arr)
                    allItems.push({
                      picked: false,
                      category: item.category || "",
                      page: item.page || "",
                      excerpt: item.excerpt || "",
                      content: item.content || item.text || "",
                      checkKind: item.checkKind || fallbackKind,
                    });
                };
                if (data.checks) {
                  parseArr(data.checks.simple, "correctness");
                  parseArr(data.checks.variation, "proposal");
                } else {
                  parseArr(data, "correctness");
                }
                store.setCheckData({
                  title: data.work || "",
                  fileName: jsonPaths[0].substring(jsonPaths[0].lastIndexOf("\\") + 1),
                  filePath: jsonPaths[0],
                  allItems,
                  correctnessItems: allItems.filter((i) => i.checkKind === "correctness"),
                  proposalItems: allItems.filter((i) => i.checkKind === "proposal"),
                });
                store.setRightTab("proofread");
              } else if (data.presetData?.presets || data.presetSets || data.presets) {
                // Preset JSON → load fonts
                const presets: FontPresetEntry[] = [];
                const pObj = data?.presetData?.presets ?? data?.presets ?? data?.presetSets ?? {};
                if (typeof pObj === "object" && pObj !== null) {
                  const entries = Array.isArray(pObj) ? [["", pObj]] : Object.entries(pObj);
                  for (const [, arr] of entries) {
                    if (!Array.isArray(arr)) continue;
                    for (const p of arr as any[])
                      if (p?.font) presets.push({ font: p.font, name: p.name || "", subName: p.subName || "" });
                  }
                }
                if (presets.length > 0) store.setFontPresets(presets);
              }
            } catch { /* ignore */ }
          }
          // Images / Folders → file list
          const otherPaths = paths.filter(
            (pp) =>
              !pp.toLowerCase().endsWith(".txt") &&
              !pp.toLowerCase().endsWith(".json"),
          );
          if (otherPaths.length > 0) {
            let allImagePaths: string[] = [];
            for (const pp of otherPaths) {
              // Check if it's a folder (no extension or try list_folder_files)
              const fileName = pp.substring(pp.lastIndexOf("\\") + 1);
              if (isImageFile(fileName)) {
                allImagePaths.push(pp);
              } else {
                // Treat as folder — list contents
                try {
                  const folderFiles = await invoke<string[]>("list_folder_files", {
                    folderPath: pp,
                    recursive: false,
                  });
                  allImagePaths.push(
                    ...folderFiles.filter((fp) =>
                      isImageFile(fp.substring(fp.lastIndexOf("\\") + 1)),
                    ),
                  );
                } catch {
                  // Not a folder or error — skip
                }
              }
            }
            if (allImagePaths.length > 0) {
              const raw: ViewerFile[] = allImagePaths.map((pp) => ({
                name: pp.substring(pp.lastIndexOf("\\") + 1),
                path: pp,
                sourceType: isPsdFile(pp) ? "psd" as const : pp.toLowerCase().endsWith(".pdf") ? "pdf" as const : "image" as const,
              }));
              const expanded = await expandPdf(raw);
              store.setFiles(expanded);
              cache.current.clear();
              setZoom(0);
              store.setLeftTab("files");
            }
          }
        }
      });
    };
    setup();
    return () => { unlisten?.(); };
  }, [expandPdf, parseChunks]);

  // ═══ Zoom ═══
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 1, 0)), []);
  const zoomFit = useCallback(() => setZoom(0), []);
  const zoomLabel = zoom === 0 ? "Fit" : `${Math.round(ZOOM_STEPS[zoom - 1] * 100)}%`;

  // 単ページ化: 論理ページカウンター（全ファイル×前後をフラットに管理）
  const [splitReadOrder, setSplitReadOrder] = useState<"right-first" | "left-first">("left-first");
  const [logicalPage, setLogicalPage] = useState(0);

  // spreadMode変更時にリセット
  useEffect(() => { setLogicalPage(0); }, [spreadMode, firstPageMode]);

  // logicalPage → (fileIdx, side) の変換
  const resolveLogicalPage = useCallback((lp: number): { fileIdx: number; side: "full" | "right" | "left" } => {
    if (!spreadMode) return { fileIdx: lp, side: "full" };
    let remain = lp;
    for (let fi = 0; fi < files.length; fi++) {
      const isSingle = firstPageMode === "single" && fi === 0;
      const isSkip = firstPageMode === "skip" && fi === 0;
      if (isSingle) {
        if (remain === 0) return { fileIdx: fi, side: "full" };
        remain -= 1;
      } else if (isSkip) {
        // 左半分スキップ → 右半分のみ（readOrder=left-firstなら left=skip, right=表示）
        if (remain === 0) return { fileIdx: fi, side: splitReadOrder === "left-first" ? "right" : "left" };
        remain -= 1;
      } else {
        // 見開き: 2ページ
        if (remain === 0) return { fileIdx: fi, side: splitReadOrder === "left-first" ? "left" : "right" };
        if (remain === 1) return { fileIdx: fi, side: splitReadOrder === "left-first" ? "right" : "left" };
        remain -= 2;
      }
    }
    return { fileIdx: files.length - 1, side: "full" };
  }, [spreadMode, firstPageMode, files.length, splitReadOrder]);

  // 最大論理ページ数
  const maxLogicalPage = useMemo(() => {
    if (!spreadMode) return files.length;
    let count = 0;
    for (let fi = 0; fi < files.length; fi++) {
      const isSingle = firstPageMode === "single" && fi === 0;
      const isSkip = firstPageMode === "skip" && fi === 0;
      count += isSingle ? 1 : isSkip ? 1 : 2;
    }
    return count;
  }, [spreadMode, firstPageMode, files.length]);

  // 現在の表示状態
  const resolved = resolveLogicalPage(logicalPage);
  const splitViewSide = resolved.side;

  // idx同期 + 画像読み込み（logicalPageが変わったらfileIdxを更新し画像を読み込む）
  useEffect(() => {
    const targetIdx = resolved.fileIdx;
    if (targetIdx >= 0 && targetIdx < files.length) {
      if (targetIdx !== idx) {
        store.setCurrentFileIndex(targetIdx);
      }
      // loadImageRefで直接呼ぶ（useEffectチェーンを避ける）
      loadImageRef.current(targetIdx);
    }
  }, [logicalPage]);

  const imgStyle: React.CSSProperties =
    zoom === 0
      ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const }
      : {
          width: imgRef.current
            ? `${imgRef.current.naturalWidth * ZOOM_STEPS[zoom - 1]}px`
            : "auto",
        };
  // 半分表示用: imgをラップするdivのスタイル (splitViewSide !== "full" 時のみ適用)
  const splitWrapStyle: React.CSSProperties | null = splitViewSide !== "full" ? {
    overflow: "hidden",
    width: "50%",
    maxHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: splitViewSide === "right" ? "flex-start" : "flex-end",
  } : null;
  // 半分表示時のimg追加スタイル
  const splitImgExtra: React.CSSProperties | null = splitViewSide !== "full" ? {
    width: "200%",
    maxWidth: "none",
    maxHeight: "100%",
    objectFit: "contain" as const,
    marginLeft: splitViewSide === "left" ? "-100%" : undefined,
  } : null;

  // ═══ Nav ═══
  const goPrev = useCallback(() => {
    if (spreadMode) {
      if (logicalPage > 0) setLogicalPage(logicalPage - 1);
    } else {
      if (idx > 0) store.setCurrentFileIndex(idx - 1);
    }
  }, [spreadMode, logicalPage, idx]);

  const goNext = useCallback(() => {
    if (spreadMode) {
      if (logicalPage < maxLogicalPage - 1) setLogicalPage(logicalPage + 1);
    } else {
      if (idx < files.length - 1) store.setCurrentFileIndex(idx + 1);
    }
  }, [spreadMode, logicalPage, maxLogicalPage, idx, files.length]);

  const goFirst = useCallback(() => {
    if (spreadMode) setLogicalPage(0);
    else if (files.length > 0) store.setCurrentFileIndex(0);
  }, [spreadMode, files.length]);

  const goLast = useCallback(() => {
    if (spreadMode) setLogicalPage(Math.max(0, maxLogicalPage - 1));
    else if (files.length > 0) store.setCurrentFileIndex(files.length - 1);
  }, [spreadMode, maxLogicalPage, files.length]);

  const promptJumpToPage = useCallback(async () => {
    const total = spreadMode ? maxLogicalPage : files.length;
    if (total <= 0) return;
    const current = spreadMode ? logicalPage + 1 : idx + 1;
    const input = await showPromptDialog(`ジャンプ先のページ番号 (1〜${total})`, String(current));
    if (input === null) return;
    const n = parseInt(input.trim(), 10);
    if (!Number.isFinite(n) || n < 1) return;
    const clamped = Math.min(Math.max(1, n), total) - 1;
    if (spreadMode) setLogicalPage(clamped);
    else store.setCurrentFileIndex(clamped);
  }, [spreadMode, maxLogicalPage, files.length, logicalPage, idx]);

  /** テキストページ番号でナビゲート */
  const navigateToTextPage = useCallback((textPageNum: number) => {
    if (!spreadMode) {
      store.setCurrentFileIndex(Math.min(textPageNum - 1, files.length - 1));
      return;
    }
    // logicalPageを探す
    for (let lp = 0; lp < maxLogicalPage; lp++) {
      const r = resolveLogicalPage(lp);
      const pns = getTextPageNumbers(r.fileIdx, diffSplitMode);
      if (pns.length === 1 && pns[0] === textPageNum) { setLogicalPage(lp); return; }
      if (pns.length === 2) {
        if (r.side === "left" && pns[0] === textPageNum) { setLogicalPage(lp); return; }
        if (r.side === "right" && pns[1] === textPageNum) { setLogicalPage(lp); return; }
      }
    }
  }, [spreadMode, maxLogicalPage, resolveLogicalPage, diffSplitMode, files.length]);

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Ctrl+S は INPUT/TEXTAREA/SELECT 内でも動作させる（編集中のテキスト保存）
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
        else if (e.key === "-") { e.preventDefault(); zoomOut(); }
        else if (e.key === "0") { e.preventDefault(); zoomFit(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); goFirst(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); goLast(); }
        else if (e.key === "j" || e.key === "J") { e.preventDefault(); promptJumpToPage(); }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
      else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const f = storeApi.getState().files[storeApi.getState().currentFileIndex];
        if (f?.path) invoke("open_file_in_photoshop", { filePath: f.path }).catch(() => {});
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [goPrev, goNext, goFirst, goLast, promptJumpToPage, zoomIn, zoomOut, zoomFit, handleSave]);

  // Mouse wheel zoom / page
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }
      else if (zoom === 0) { e.preventDefault(); e.deltaY > 0 ? goNext() : goPrev(); }
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zoom, goPrev, goNext, zoomIn, zoomOut]);

  // Drag-to-pan
  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom === 0) return;
      e.preventDefault();
      setDragging(true);
      const el = canvasRef.current!;
      dragStart.current = { x: e.clientX, y: e.clientY, sx: el.scrollLeft, sy: el.scrollTop };
    },
    [zoom],
  );
  useEffect(() => {
    if (!dragging) return;
    const mv = (e: MouseEvent) => {
      const el = canvasRef.current;
      if (!el) return;
      el.scrollLeft = dragStart.current.sx - (e.clientX - dragStart.current.x);
      el.scrollTop = dragStart.current.sy - (e.clientY - dragStart.current.y);
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [dragging]);

  // Panel resize (drag handle)
  useEffect(() => {
    if (!resizingSide) return;
    const mv = (e: MouseEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      // 左サイド: 右方向ドラッグで幅拡大／右サイド: 左方向ドラッグで幅拡大
      const next = resizingSide === "left" ? start.width + dx : start.width - dx;
      const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, next));
      if (resizingSide === "left") setLeftPanelWidth(clamped);
      else setRightPanelWidth(clamped);
    };
    const up = () => {
      setResizingSide(null);
      resizeStart.current = null;
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [resizingSide]);

  // ═══ Derived data ═══
  const metadata = cur?.metadata || null;
  const layerTree = metadata?.layerTree || [];
  const textLayers = useMemo(() => collectTextLayers(layerTree), [layerTree]);

  // Collect all PostScript font names from current file's text layers
  const postScriptNames = useMemo(() => {
    const set = new Set<string>();
    for (const tl of textLayers) {
      if (tl.textInfo) for (const f of tl.textInfo.fonts) set.add(f);
    }
    return [...set];
  }, [textLayers]);

  // All fonts across ALL loaded files → Map<fontName, fileIndexes[]>
  const allFilesFontMap = useMemo(() => {
    const map = new Map<string, number[]>();
    files.forEach((f, fi) => {
      if (!f.metadata?.layerTree) return;
      const tls = collectTextLayers(f.metadata.layerTree);
      for (const tl of tls) {
        if (tl.textInfo) {
          for (const font of tl.textInfo.fonts) {
            const arr = map.get(font) || [];
            if (!arr.includes(fi)) arr.push(fi);
            map.set(font, arr);
          }
        }
      }
    });
    return map;
  }, [files]);

  // クリックごとに対象ファイルを巡回するためのインデックス（フォントボタン → ページ移動用）
  const fontClickIdx = useRef(new Map<string, number>());

  // Per-file text diff status: Map<fileIndex, "match" | "diff" | "no-text">
  const fileDiffStatusMap = useMemo(() => {
    const map = new Map<number, "match" | "diff" | "no-text">();
    if (store.textContent.length === 0) return map;
    files.forEach((f, fi) => {
      if (!f.metadata?.layerTree) return;
      const tls = collectTextLayers(f.metadata.layerTree).filter((tl) => tl.textInfo?.text);
      if (tls.length === 0) return;
      const psdText = tls.map((tl) => tl.textInfo!.text.trim()).filter(Boolean).join("\n\n");
      const pageNums = getTextPageNumbers(fi, diffSplitMode);
      if (pageNums.length === 0) return; // 1P除外
      const parts: string[] = [];
      for (const pn of pageNums) {
        const page = store.textPages.find((p) => p.pageNumber === pn);
        if (page) parts.push(page.blocks.map((b) => b.lines.join("\n")).join("\n\n"));
      }
      if (parts.length === 0) { map.set(fi, "no-text"); return; }
      const loadedText = parts.join("\n\n");
      const normPsd = normalizeTextForComparison(psdText);
      const normLoaded = normalizeTextForComparison(loadedText);
      map.set(fi, normPsd === normLoaded ? "match" : "diff");
    });
    return map;
  }, [files, store.textContent, store.textPages, diffSplitMode]);

  // Font color map (stable color per font)
  const fontColorMap = useMemo(() => {
    const map = new Map<string, string>();
    postScriptNames.forEach((f, i) => map.set(f, FONT_COLORS[i % FONT_COLORS.length]));
    return map;
  }, [postScriptNames]);

  // Resolve PostScript names → Japanese display names
  useEffect(() => {
    if (postScriptNames.length === 0) { setFontResolved(false); return; }
    setFontResolved(false);
    invoke<Record<string, FontResolveInfo>>("resolve_font_names", { postscriptNames: postScriptNames })
      .then((r) => { setFontResolveMap(r); setFontResolved(true); })
      .catch(() => {});
  }, [postScriptNames]);

  // Helper: get font label (和名)
  const getFontLabel = useCallback((ps: string) => {
    const info = fontResolveMap[ps];
    return info ? `${info.display_name} ${info.style_name}`.trim() : ps;
  }, [fontResolveMap]);

  const getFontColor = useCallback((ps: string) => {
    if (fontResolved && !(ps in fontResolveMap)) return MISSING_FONT_COLOR;
    return fontColorMap.get(ps) || FONT_COLORS[0];
  }, [fontResolveMap, fontColorMap, fontResolved]);

  // Text diff: hook 化（./hooks/useTextDiff）
  const textDiffResults = useTextDiff({
    textLayers,
    metadata,
    currentFileIndex: idx,
    diffSplitMode,
    textContent: store.textContent,
    textPages: store.textPages,
  });
  const checkData = store.checkData;

  // ═══════════════════════════════════════════════════════
  // Shared panel content renderer
  // ═══════════════════════════════════════════════════════
  const renderTabContent = useCallback((tab: PanelTab) => {
    switch (tab) {
      // 左サイドバーの files 一覧は廃止（ファイル切替は上位 View 側から行う）。
      case "layers":
        return (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-auto">
              {layerTree.length === 0 ? (
                <p className="text-[11px] text-text-muted text-center py-4">
                  {cur ? (isPsdFile(cur.name) ? "レイヤー読み込み中..." : "PSDファイルではありません") : "ファイルを選択してください"}
                </p>
              ) : (
                <FullLayerTree
                  layers={layerTree}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={(layerId, bounds) => {
                    setSelectedLayerId(layerId);
                    setHighlightBounds(bounds);
                  }}
                />
              )}
            </div>
          </div>
        );
      case "spec":
        return (
          <div className="select-none">
            {(postScriptNames.length > 0 || allFilesFontMap.size > 0) && (
              <div className="px-2 py-1.5 border-b border-border/30 space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-text-muted flex-1">
                    使用フォント ({allFilesFontMap.size}種 / 全{files.length}ファイル)
                  </span>
                </div>
                {/* 全ファイル使用フォント — クリックで対象ページ移動 */}
                <div className="flex flex-wrap gap-1">
                  {[...allFilesFontMap.entries()].map(([ps, fileIdxs]) => {
                    const isActive = activeFontFilter === ps;
                    const isCurrent = fileIdxs.includes(idx);
                    return (
                      <button
                        key={ps}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full text-white transition-all ${
                          isActive ? "ring-1 ring-white/60 scale-105" : activeFontFilter ? "opacity-30" : ""
                        } ${isCurrent ? "" : "opacity-70"}`}
                        style={{ backgroundColor: getFontColor(ps) }}
                        onClick={() => {
                          if (isActive) {
                            // 同じフォントの次のページへ巡回
                            const prev = fontClickIdx.current.get(ps) ?? -1;
                            const next = (prev + 1) % fileIdxs.length;
                            fontClickIdx.current.set(ps, next);
                            store.setCurrentFileIndex(fileIdxs[next]);
                          } else {
                            setActiveFontFilter(ps);
                            fontClickIdx.current.set(ps, fileIdxs.indexOf(idx) >= 0 ? fileIdxs.indexOf(idx) : 0);
                            if (!fileIdxs.includes(idx)) store.setCurrentFileIndex(fileIdxs[0]);
                          }
                        }}
                        onDoubleClick={() => setActiveFontFilter(null)}
                        title={`${getFontLabel(ps)}\n${fileIdxs.length}ファイルで使用 (p.${fileIdxs.map((i) => i + 1).join(",")})\nクリック: ページ移動 / ダブルクリック: フィルタ解除`}
                      >
                        {getFontLabel(ps).substring(0, 12)}
                        <span className="ml-0.5 opacity-60 text-[9px]">({fileIdxs.length})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {textLayers.length === 0 ? (
              <p className="text-[11px] text-text-muted text-center py-4">テキストレイヤーがありません</p>
            ) : (
              <div className="divide-y divide-border/20">
                {textLayers
                  .filter((tl) => !activeFontFilter || (tl.textInfo?.fonts || []).includes(activeFontFilter))
                  .map((tl, i) => {
                    const mainFont = tl.textInfo?.fonts[0];
                    const color = mainFont ? getFontColor(mainFont) : "#888";
                    const isHighlighted = highlightBounds && tl.bounds &&
                      tl.bounds.top === highlightBounds.top && tl.bounds.left === highlightBounds.left;
                    return (
                      <div
                        key={`${tl.layerName}-${i}`}
                        className={`px-2 py-1.5 cursor-pointer hover:bg-bg-tertiary/60 transition-colors ${
                          isHighlighted ? "bg-accent/10" : ""
                        }`}
                        onClick={() => {
                          setHighlightBounds(tl.bounds || null);
                          if (tl.textInfo?.fonts[0]) setActiveFontFilter(tl.textInfo.fonts[0]);
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[11px] text-text-primary truncate font-medium">{tl.layerName}</span>
                        </div>
                        {tl.textInfo && (
                          <div className="ml-3.5 mt-0.5">
                            <div className="text-[10px] text-text-secondary truncate" style={{ color }}>
                              {tl.textInfo.fonts.map((f) => getFontLabel(f)).join(", ")}
                            </div>
                            {tl.textInfo.fontSizes.length > 0 && (
                              <span className="text-[10px] text-text-muted">{tl.textInfo.fontSizes.join("/")}pt</span>
                            )}
                            {/* 白フチ / カーニング値バッジ */}
                            {(() => {
                              const ti: any = tl.textInfo;
                              const stroke = (typeof ti?.strokeSize === "number" && ti.strokeSize > 0) ? ti.strokeSize : null;
                              const tracking: number[] = Array.isArray(ti?.tracking) ? ti.tracking.filter((t: number) => t !== 0) : [];
                              if (stroke == null && tracking.length === 0) return null;
                              return (
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {stroke != null && (
                                    <span className="text-[9px] px-1 py-px rounded bg-accent-tertiary/10 text-accent-tertiary">
                                      白フチ {stroke}px
                                    </span>
                                  )}
                                  {tracking.length > 0 && (
                                    <span className="text-[9px] px-1 py-px rounded bg-warning/10 text-warning">
                                      カーニング {tracking.map((t) => (t > 0 ? `+${t}` : t)).join(",")}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {tl.textInfo.text && (
                              <div className="text-[10px] text-text-muted/60 truncate mt-0.5">
                                {tl.textInfo.text.replace(/\n/g, " ").substring(0, 30)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            {textDiffResults && (
              <div className={`px-2 py-1.5 border-t border-border/30 ${textDiffResults.hasDiff ? "bg-warning/10" : "bg-success/10"}`}>
                <div className={`text-[10px] font-medium ${textDiffResults.hasDiff ? "text-warning" : "text-success"}`}>
                  テキスト照合: {textDiffResults.hasDiff ? "差異あり" : "一致"}
                </div>
              </div>
            )}
          </div>
        );
      case "text":
        return (
          <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex-shrink-0 px-2 py-1 border-b border-border/30 flex items-center gap-1.5">
              {store.selectedBlockIds.size > 0 && (
                <>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-error flex-shrink-0"
                    onClick={() => {
                      const pages = store.textPages.map((p) => ({
                        ...p,
                        blocks: p.blocks.map((b) =>
                          store.selectedBlockIds.has(b.id) ? { ...b, assignedFont: undefined } : b,
                        ),
                      }));
                      store.setTextPages(pages);
                      store.setIsDirty(true);
                      store.setSelectedBlockIds(new Set());
                    }}
                  >
                    ✕解除
                  </button>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error hover:bg-error/20 flex-shrink-0 border border-error/30"
                    onClick={handleDeleteBlocks}
                    title="選択ブロックの削除/復元（// prefix toggle）"
                  >
                    削除//
                  </button>
                  <span className="text-[10px] text-text-muted flex-shrink-0">{store.selectedBlockIds.size}選択中</span>
                </>
              )}
              <div className="flex-1" />
              {/* ブロック追加 */}
              {store.textPages.length > 0 && (
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-accent flex-shrink-0"
                  onClick={() => {
                    const pageNum = idx + 1;
                    handleAddBlock(pageNum > 0 ? pageNum : 1);
                  }}
                  title="現在のページにブロック追加"
                >+追加</button>
              )}
              {/* フォントJSON読み込み */}
              <button
                className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0"
                onClick={() => setJsonBrowserMode("preset")}
                title="フォントプリセットJSONを読み込み"
              >
                {store.fontPresets.length > 0 ? "フォント変更" : "+フォント"}
              </button>
            </div>
            {/* フォント情報 — JSONプリセット(ドロップダウン) のみ（使用フォント一覧は写植仕様タブへ移動） */}
            {store.fontPresets.length > 0 && (
              <div className="flex-shrink-0 px-2 py-1.5 border-b border-border/30 space-y-1.5">
                {/* プリセットフォント — ドロップダウンで割当 */}
                {store.fontPresets.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      className="flex-1 text-[10px] bg-bg-primary border border-border/40 rounded px-1.5 py-0.5 text-text-primary outline-none"
                      value=""
                      onChange={(e) => {
                        const font = e.target.value;
                        if (!font) return;
                        if (store.selectedBlockIds.size > 0) {
                          store.assignFontToBlocks([...store.selectedBlockIds], font);
                          const allBlocks = store.textPages.flatMap((p) => p.blocks);
                          const lastIdx = Math.max(...[...store.selectedBlockIds].map((id) => allBlocks.findIndex((b) => b.id === id)));
                          store.setSelectedBlockIds(new Set());
                          if (lastIdx >= 0 && lastIdx < allBlocks.length - 1) {
                            store.setSelectedBlockIds(new Set([allBlocks[lastIdx + 1].id]));
                          }
                        }
                      }}
                    >
                      <option value="">
                        {store.selectedBlockIds.size > 0
                          ? `フォント割当 (${store.selectedBlockIds.size}件選択中)`
                          : `プリセットフォント (${store.fontPresets.length})`}
                      </option>
                      {store.fontPresets.map((fp, i) => (
                        <option key={i} value={fp.font}>
                          {fp.name || getFontLabel(fp.font)}{fp.subName ? ` (${fp.subName})` : ""}
                        </option>
                      ))}
                    </select>
                    {store.selectedBlockIds.size > 0 && (
                      <button
                        onClick={() => {
                          const pages = store.textPages.map((p) => ({
                            ...p,
                            blocks: p.blocks.map((b) =>
                              store.selectedBlockIds.has(b.id) ? { ...b, assignedFont: undefined } : b,
                            ),
                          }));
                          store.setTextPages(pages);
                          store.setIsDirty(true);
                        }}
                        className="text-[10px] px-1 py-0.5 rounded text-text-muted hover:text-error transition-colors flex-shrink-0"
                        title="フォント指定を解除"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Text content */}
            <div className="flex-1 overflow-auto">
              {store.textContent.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted p-4 text-center">
                  <p className="text-xs">テキストファイルを開く or .txt をD&amp;D</p>
                  <button onClick={openTextFile} className="px-3 py-1.5 text-[11px] font-medium text-white bg-gradient-to-r from-accent to-accent-secondary rounded-lg">
                    テキストを開く
                  </button>
                </div>
              ) : (
                <div className="p-2">
                  {store.textPages.length > 0 ? (
                    store.textPages.map((page) => {
                      const isActivePage = page.pageNumber === idx + 1;
                      const hasReorder = page.blocks.some((b, i) => b.originalIndex !== i);
                      return (
                        <div key={page.pageNumber} data-text-page={page.pageNumber} className="mb-2">
                          <div
                            className={`flex items-center gap-2 text-[10px] font-mono border-t border-border/40 pt-1 mt-1 mb-1 cursor-pointer ${
                              isActivePage ? "text-accent font-medium" : "text-text-muted/60"
                            }`}
                            onClick={() => {
                              navigateToTextPage(page.pageNumber);
                            }}
                          >
                            <span>&lt;&lt;{page.pageNumber}Page&gt;&gt;</span>
                            {isActivePage && <span className="text-accent text-[9px]">●</span>}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddBlock(page.pageNumber); }}
                              className="ml-auto w-4 h-4 flex items-center justify-center rounded text-text-muted/40 hover:text-accent hover:bg-accent/10 transition-all flex-shrink-0"
                              title="ブロック追加"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            </button>
                            {hasReorder && <span className="text-warning text-[9px]">順序変更</span>}
                          </div>
                          <DndContext
                            sensors={dndSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleBlockReorder(page.pageNumber, e)}
                          >
                            <SortableContext
                              items={page.blocks.map((b) => b.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {page.blocks.map((block, blockIdx) => (
                                <SortableBlockItem
                                  key={block.id}
                                  block={block}
                                  blockIdx={blockIdx}
                                  isSelected={store.selectedBlockIds.has(block.id)}
                                  fontColor={block.assignedFont ? getFontColor(block.assignedFont) : undefined}
                                  fontLabel={block.assignedFont ? getFontLabel(block.assignedFont) : undefined}
                                  onClick={(e) => {
                                    const sel = new Set(store.selectedBlockIds);
                                    if (e.ctrlKey || e.metaKey) {
                                      if (sel.has(block.id)) sel.delete(block.id);
                                      else sel.add(block.id);
                                    } else if (e.shiftKey && sel.size > 0) {
                                      const ids = page.blocks.map((b) => b.id);
                                      const lastIdx = ids.findIndex((id) => sel.has(id));
                                      const curIdx = ids.indexOf(block.id);
                                      if (lastIdx >= 0) {
                                        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
                                        for (let k = from; k <= to; k++) sel.add(ids[k]);
                                      } else {
                                        sel.add(block.id);
                                      }
                                    } else {
                                      sel.clear();
                                      sel.add(block.id);
                                    }
                                    store.setSelectedBlockIds(sel);
                                    if (pageSync) navigateToTextPage(page.pageNumber);
                                  }}
                                  onEditBlock={handleEditBlock}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      );
                    })
                  ) : (
                    chunks.map((c, ci) => (
                      <div key={ci}>
                        {(ci === 0 || chunks[ci - 1]?.page !== c.page) && c.page > 0 && (
                          <div className="text-[10px] text-text-muted/60 font-mono border-t border-border/40 pt-1 mt-1 mb-0.5">
                            &lt;&lt;{c.page}Page&gt;&gt;
                          </div>
                        )}
                        <div
                          className={`px-2 py-1.5 rounded text-sm font-mono whitespace-pre-wrap cursor-pointer transition-colors text-black ${
                            selectedChunk === ci ? "bg-accent/10 ring-1 ring-accent/30" : "hover:bg-bg-tertiary/60"
                          }`}
                          onClick={() => {
                            setSelectedChunk(ci);
                            if (pageSync && c.page > 0) navigateToTextPage(c.page);
                          }}
                        >
                          {c.text.trim() || <span className="text-text-muted/40 italic">（空）</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        );
      case "diff":
        return (
          <DiffPanel
            textLayers={textLayers}
            currentFileIndex={idx}
            hasCurrentFile={!!cur}
            textContentLength={store.textContent.length}
            diffResults={textDiffResults}
          />
        );
      case "editor":
        return <TextEditorDropPanel />;
      case "proofread":
        return <ProofreadPanel pageSync={pageSync} navigateToTextPage={navigateToTextPage} />;
      default:
        return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, idx, cur, layerTree, textLayers, postScriptNames, allFilesFontMap, activeFontFilter, highlightBounds, store.fontPresets, store.textContent, store.editMode, store.textPages, store.selectedBlockIds, textDiffResults, diffSplitMode, fileDiffStatusMap, editBuffer, chunks, selectedChunk, pageSync, navigateToTextPage, fontResolveMap, fontResolved, handleAddBlock, handleDeleteBlocks, handleEditBlock, selectedLayerId, captureMode, captureStatus]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full bg-bg-primary"
      style={{ userSelect: resizingSide ? "none" : undefined }}
      onContextMenu={(e) => {
        if (!CONTEXT_MENU_ENABLED) return;
        e.preventDefault();
        setViewerContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* ─── Top toolbar ─── */}
      <div className="flex-shrink-0 h-7 bg-bg-secondary border-b border-border flex items-center px-2 gap-1 text-xs">
        {/* 保存ドロップダウン（左端、PsDesign風） */}
        <SaveDropdown
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          canSave={!!store.textFilePath && (store.isDirty || (editBuffer !== null && editBuffer !== store.textContent))}
          hasContent={!!store.textContent}
        />
        {textEditorMode && (
          <button
            onClick={() => useViewStore.getState().slideToProgen()}
            className="mr-1 px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1 bg-bg-secondary border border-border text-text-primary hover:border-accent/40 hover:text-accent transition-colors"
            title="ProGen に移動"
          >
            <Sparkles className="w-3 h-3" strokeWidth={2} />
            ProGen
          </button>
        )}
        {/* ページ送り / ズーム / 単ページ化（旧画像ナビバーから移設） */}
        <button onClick={goPrev} disabled={idx <= 0} className="px-1 text-text-secondary hover:text-text-primary disabled:opacity-30">◀</button>
        <span className="text-text-muted tabular-nums min-w-[40px] text-center text-[11px]">
          {files.length > 0 ? `${idx + 1}/${files.length}` : "—"}
        </span>
        <button onClick={goNext} disabled={idx >= files.length - 1} className="px-1 text-text-secondary hover:text-text-primary disabled:opacity-30">▶</button>
        <div className="w-px h-3 bg-border mx-1" />
        <button onClick={zoomIn} disabled={zoom >= ZOOM_STEPS.length} className="px-0.5 text-text-secondary disabled:opacity-30">+</button>
        <button onClick={zoomFit} className="px-1 text-text-muted hover:text-text-primary rounded tabular-nums text-[11px]">{zoomLabel}</button>
        <button onClick={zoomOut} disabled={zoom <= 0} className="px-0.5 text-text-secondary disabled:opacity-30">−</button>
        <div className="w-px h-3 bg-border mx-1" />
        <button
          onClick={() => setSpreadMode((v) => !v)}
          className={`text-[9px] px-1.5 py-0 rounded transition-colors ${spreadMode ? "bg-orange-600 text-white" : "bg-bg-tertiary text-text-muted hover:text-text-primary"}`}
          title="見開きPDFを単ページに分割"
        >
          単ページ化
        </button>
        {spreadMode && (
          <>
            <select
              className="text-[9px] bg-bg-primary border border-border/40 rounded px-1 py-0 text-text-muted outline-none"
              value={firstPageMode}
              onChange={(e) => setFirstPageMode(e.target.value as typeof firstPageMode)}
            >
              <option value="single">1P単独</option>
              <option value="spread">1Pも見開き</option>
              <option value="skip">1P除外</option>
            </select>
            <button
              onClick={() => setSplitReadOrder((v) => v === "right-first" ? "left-first" : "right-first")}
              className="text-[9px] px-1.5 py-0 rounded bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
              title={`読み順: ${splitReadOrder === "right-first" ? "右→左（漫画）" : "左→右（通常）"}`}
            >
              {splitReadOrder === "right-first" ? "右→左" : "左→右"}
            </button>
            <span className="text-[9px] text-accent/70 tabular-nums">
              {logicalPage + 1}/{maxLogicalPage} ({splitViewSide === "full" ? "全体" : splitViewSide === "left" ? "左" : "右"})
            </span>
          </>
        )}
        <div className="flex-1" />
        {/* タブボタン一覧（右寄せ） — textEditorMode では非表示 */}
        {!textEditorMode && (
        <div className="flex items-center gap-0.5 px-1">
          {ALL_PANEL_TABS.filter((t) => {
            // editor は 校正編集 プリセット経由でのみ配置されるため、タブセレクタには出さない
            if (t.id === "editor") return false;
            // textEditorMode 時は layers / spec タブを隠す
            if (textEditorMode && (t.id === "layers" || t.id === "spec")) return false;
            return true;
          }).map((t) => {
            const pos = store.tabPositions[t.id] ?? null;
            const isActive = activeTabId === t.id;
            const badge = t.id === "proofread" ? (checkData?.allItems.length || 0)
              : t.id === "diff" ? (textDiffResults?.hasDiff ? 1 : textDiffResults?.deletedLayerIndices.size ? 1 : 0) : 0;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTabId(t.id);
                  if (!pos) store.setTabPosition(t.id, "far-right");
                }}
                className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors ${
                  isActive ? "ring-1 ring-accent/50 bg-accent/15 text-accent font-medium"
                    : pos ? "bg-accent/10 text-accent/80" : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/60"
                }`}
              >
                <Icon className="w-3 h-3" strokeWidth={2} aria-hidden />
                {t.label}
                {badge > 0 && <span className="ml-0.5 px-0.5 rounded-full bg-accent/20 text-[8px] tabular-nums">{badge}</span>}
              </button>
            );
          })}
        </div>
        )}
        {/* テキストエディタビュー専用: 表示プリセット切替（突き合わせ / 校正編集） */}
        {textEditorMode && (() => {
          const textPos = store.tabPositions.text ?? null;
          const proofPos = store.tabPositions.proofread ?? null;
          const diffPos = store.tabPositions.diff ?? null;
          const editorPos = store.tabPositions.editor ?? null;
          const isMatchMode = textPos !== null && proofPos === null && diffPos === null && editorPos === null;
          const isProofMode = textPos === null && proofPos !== null && editorPos !== null;
          const applyMatch = () => {
            // 画像 + テキストのみ。校正JSON / 照合 / エディタ / ファイルを格納。
            store.setTabPosition("proofread", null);
            store.setTabPosition("diff", null);
            store.setTabPosition("editor", null);
            store.setTabPosition("files", null);
            store.setTabPosition("text", "far-right");
            setActiveTabId("text");
            setViewerVisible(true);
          };
          const applyProof = () => {
            // 左: 校正JSON / 右: テキストエディタ(D&D)。テキスト・照合・画像・ファイルは格納し、2パネルで全画面を占有。
            store.setTabPosition("text", null);
            store.setTabPosition("diff", null);
            store.setTabPosition("files", null);
            store.setTabPosition("proofread", "left-sub");
            store.setTabPosition("editor", "far-right");
            setActiveTabId("proofread");
            setViewerVisible(false);
          };
          return (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              <div className="flex items-center gap-0.5 mr-1">
                <button
                  onClick={applyMatch}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    isMatchMode
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60"
                  }`}
                  title="画像とテキストのみを表示"
                  aria-pressed={isMatchMode}
                >
                  突き合わせ
                </button>
                <button
                  onClick={applyProof}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    isProofMode
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60"
                  }`}
                  title="左: 校正JSON / 右: テキストエディタ（TXTドロップ対応）"
                  aria-pressed={isProofMode}
                >
                  校正編集
                </button>
              </div>
            </>
          );
        })()}
        {store.isDirty && <span className="text-warning text-[10px] ml-1 mr-1">未保存</span>}
      </div>

      {/* ─── Main area (center + right) ─── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ═══ テキストエディタ view の校正編集モード: 左右 50/50 の専用 2 カラムレイアウト ═══ */}
        {textEditorMode && !viewerVisible ? (() => {
          const leftTab =
            (Object.entries(store.tabPositions).find(([, p]) => p === "left-sub")?.[0] as PanelTab | undefined) ??
            (Object.entries(store.tabPositions).find(([, p]) => p === "far-left")?.[0] as PanelTab | undefined);
          const rightTab =
            (Object.entries(store.tabPositions).find(([, p]) => p === "far-right")?.[0] as PanelTab | undefined);
          const renderCol = (tab: PanelTab | undefined, borderSide: "l" | "r") => {
            if (!tab) return <div className="flex-1 min-w-0" />;
            return (
              <div className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-bg-secondary ${borderSide === "l" ? "border-l" : "border-r"} border-border`}>
                <div className="flex-shrink-0 h-5 bg-bg-tertiary/30 border-b border-border/30 flex items-center px-1.5 gap-0.5">
                  <span className="text-[8px] text-text-muted/60 flex-1 truncate">
                    {ALL_PANEL_TABS.find((t) => t.id === tab)?.label}
                  </span>
                  <button
                    onClick={() => {
                      store.setTabPosition(tab, null);
                      setActiveTabId(tab);
                    }}
                    className="text-[8px] text-text-muted/40 hover:text-error"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-auto">{renderTabContent(tab)}</div>
              </div>
            );
          };
          return (
            <>
              {renderCol(leftTab, "r")}
              {renderCol(rightTab, "l")}
            </>
          );
        })() : (<>

        {/* ═══ LEFT-SIDE PANELS (左端 / 左サブ) ═══ */}
        {(["far-left", "left-sub"] as PanelPosition[]).map((pos) => {
          const entry = Object.entries(store.tabPositions).find(([, p]) => p === pos);
          if (!entry) return null;
          const tab = entry[0] as PanelTab;
          // textEditorMode で画像非表示時は flex-1 にして画面全域へ拡張
          const fillWidth = textEditorMode && !viewerVisible;
          return (
            <React.Fragment key={pos}>
              <div
                className={`flex flex-col overflow-hidden bg-bg-secondary border-r border-border ${fillWidth ? "flex-1 min-w-0" : ""}`}
                style={fillWidth ? undefined : { width: leftPanelWidth }}
              >
                <div className="flex-shrink-0 h-5 bg-bg-tertiary/30 border-b border-border/30 flex items-center px-1.5 gap-0.5">
                  <span className="text-[8px] text-text-muted/60 flex-1 truncate">{ALL_PANEL_TABS.find((t) => t.id === tab)?.label}</span>
                  <button
                    onClick={() => {
                      store.setTabPosition(tab, null);
                      setActiveTabId(tab);
                    }}
                    className="text-[8px] text-text-muted/40 hover:text-error"
                  >✕</button>
                </div>
                <div className="flex-1 overflow-auto">
                  {renderTabContent(tab)}
                </div>
              </div>
              <div
                className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  resizeStart.current = { x: e.clientX, width: leftPanelWidth };
                  setResizingSide("left");
                }}
              />
            </React.Fragment>
          );
        })}

        {/* ═══ CENTER: Image viewer ═══ */}
        {/* 格納時は display:none で state 保持 & レイアウトから抜ける（右パネルが左に詰まる） */}
        <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${textEditorMode && !viewerVisible ? "hidden" : ""}`}>
          {/* Image area */}
          <div
            ref={canvasRef}
            className={`relative flex-1 overflow-auto flex items-center justify-center bg-[#1a1a1e] ${
              captureMode ? "cursor-crosshair" : zoom > 0 ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
            } ${dragOver ? "ring-2 ring-inset ring-accent/50" : ""}`}
            onMouseDown={(e) => {
              if (captureMode && imgRef.current && dims.w > 0) {
                e.preventDefault();
                const rect = imgRef.current.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * dims.w;
                const y = ((e.clientY - rect.top) / rect.height) * dims.h;
                setCaptureDrag({ startX: x, startY: y, endX: x, endY: y });
                const onMove = (me: MouseEvent) => {
                  const mx = ((me.clientX - rect.left) / rect.width) * dims.w;
                  const my = ((me.clientY - rect.top) / rect.height) * dims.h;
                  setCaptureDrag((prev) => prev ? { ...prev, endX: mx, endY: my } : null);
                };
                const onUp = () => {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                  setCaptureDrag((prev) => {
                    if (prev) {
                      const left = Math.min(prev.startX, prev.endX);
                      const top = Math.min(prev.startY, prev.endY);
                      const right = Math.max(prev.startX, prev.endX);
                      const bottom = Math.max(prev.startY, prev.endY);
                      if (right - left > 5 && bottom - top > 5) {
                        handleFontBookCapture({ left, top, right, bottom });
                      }
                    }
                    return null;
                  });
                  setCaptureMode(false);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              } else {
                onCanvasMouseDown(e);
              }
            }}
            style={{ userSelect: "none" }}
          >
            {/* Screenshot button (top-left): toggle capture mode → drag to crop → save to font book */}
            {/* テキストエディタビューでは非表示（写植仕様タブが使えないため） */}
            {!textEditorMode && files.length > 0 && (() => {
              const specOpen = (store.tabPositions.spec ?? null) !== null;
              const enabled = specOpen && !!activeFontFilter;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!specOpen) {
                      setCaptureStatus("写植仕様タブを開いてください");
                      setTimeout(() => setCaptureStatus(null), 3000);
                      return;
                    }
                    if (!activeFontFilter) {
                      setCaptureStatus("写植仕様タブでフォントを選択してください");
                      setTimeout(() => setCaptureStatus(null), 3000);
                      return;
                    }
                    setCaptureMode((v) => !v);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`absolute top-2 left-2 z-20 w-8 h-8 rounded-lg backdrop-blur-sm border flex items-center justify-center transition-colors ${
                    captureMode
                      ? "bg-accent-secondary text-white border-accent-secondary"
                      : enabled
                        ? "bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border-white/20"
                        : "bg-black/30 text-white/40 border-white/10 cursor-not-allowed"
                  }`}
                  title={
                    captureMode
                      ? "スクショモード OFF"
                      : !specOpen
                        ? "写植仕様タブを開いてください"
                        : !activeFontFilter
                          ? "写植仕様タブでフォントを選択してください"
                          : `「${getFontLabel(activeFontFilter)}」をフォント帳にキャプチャ — ドラッグで範囲選択`
                  }
                  aria-label="スクショ"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              );
            })()}
            {/* Capture status toast (top-left, below screenshot button) */}
            {captureStatus && (
              <div className="absolute top-12 left-2 z-30 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] backdrop-blur-sm pointer-events-none">
                {captureStatus}
              </div>
            )}

            {/* Reload button (top-right): clears cache and reloads currently displayed file */}
            {files.length > 0 && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const curFile = files[idx];
                  if (!curFile) return;
                  // ローカルキャッシュから該当エントリを削除
                  const cacheKey = curFile.pdfPage ? `${curFile.path}#p${curFile.pdfPage}` : curFile.path;
                  cache.current.delete(cacheKey);
                  // PDFドキュメントキャッシュもクリア
                  if (curFile.pdfPath) pdfDocCache.current.delete(curFile.pdfPath);
                  else if (curFile.path) pdfDocCache.current.delete(curFile.path);
                  // バックエンドのプレビューキャッシュも無効化
                  try {
                    await invoke("invalidate_file_cache", { filePath: curFile.path });
                  } catch { /* ignore */ }
                  // 現在の画像を再読み込み
                  setImgUrl(null);
                  loadImageRef.current(idx);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 z-20 w-8 h-8 rounded-lg bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-sm border border-white/20 flex items-center justify-center transition-colors"
                title="再読み込み（画像表示失敗時の復旧）"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-text-muted p-8 text-center">
                <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">画像フォルダを開く or D&amp;D</p>
              </div>
            ) : loading && !imgUrl ? (
              <div className="text-text-muted">
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            ) : imgUrl ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {splitWrapStyle ? (
                  <div style={splitWrapStyle}>
                    <img ref={imgRef} src={imgUrl} alt={cur?.name || ""} style={{ ...imgStyle, ...splitImgExtra }} draggable={false} className="block" />
                  </div>
                ) : (
                  <img ref={imgRef} src={imgUrl} alt={cur?.name || ""} style={imgStyle} draggable={false} className="block" />
                )}
                {/* Layer bounds highlight overlay */}
                {highlightBounds && dims.w > 0 && imgRef.current && (
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    viewBox={`0 0 ${dims.w} ${dims.h}`}
                    style={{ width: "100%", height: "100%" }}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <rect
                      x={highlightBounds.left}
                      y={highlightBounds.top}
                      width={highlightBounds.right - highlightBounds.left}
                      height={highlightBounds.bottom - highlightBounds.top}
                      fill="rgba(58,123,213,0.18)"
                      stroke="#3a7bd5"
                      strokeWidth={Math.max(2, dims.w / 500)}
                      rx={2}
                    />
                  </svg>
                )}
                {/* キャプチャ範囲選択オーバーレイ */}
                {captureDrag && dims.w > 0 && imgRef.current && (
                  <svg
                    className="absolute inset-0 pointer-events-none z-30"
                    viewBox={`0 0 ${dims.w} ${dims.h}`}
                    style={{ width: "100%", height: "100%" }}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <rect x={0} y={0} width={dims.w} height={dims.h} fill="rgba(0,0,0,0.3)" />
                    <rect
                      x={Math.min(captureDrag.startX, captureDrag.endX)}
                      y={Math.min(captureDrag.startY, captureDrag.endY)}
                      width={Math.abs(captureDrag.endX - captureDrag.startX)}
                      height={Math.abs(captureDrag.endY - captureDrag.startY)}
                      fill="rgba(255,255,255,0.1)"
                      stroke="#ff5a8a"
                      strokeWidth={Math.max(2, dims.w / 300)}
                      strokeDasharray="6 3"
                      rx={2}
                    />
                  </svg>
                )}
                {/* キャプチャモードラベル */}
                {captureMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-lg bg-accent-secondary text-white text-[10px] font-medium shadow-lg pointer-events-none">
                    ドラッグで範囲選択 → フォント帳に保存
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* ═══ RIGHT-SIDE PANEL (右端のみ — 右サブは廃止) ═══ */}
        {(["far-right"] as PanelPosition[]).map((pos) => {
          const entry = Object.entries(store.tabPositions).find(([, p]) => p === pos);
          if (!entry) return null;
          const tab = entry[0] as PanelTab;
          const fillWidth = textEditorMode && !viewerVisible;
          return (
            <React.Fragment key={pos}>
              <div
                className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  resizeStart.current = { x: e.clientX, width: rightPanelWidth };
                  setResizingSide("right");
                }}
              />
              <div
                className={`flex flex-col overflow-hidden bg-bg-secondary border-l border-border ${fillWidth ? "flex-1 min-w-0" : ""}`}
                style={fillWidth ? undefined : { width: rightPanelWidth }}
              >
                <div className="flex-shrink-0 h-5 bg-bg-tertiary/30 border-b border-border/30 flex items-center px-1.5 gap-0.5">
                  <span className="text-[8px] text-text-muted/60 flex-1 truncate">{ALL_PANEL_TABS.find((t) => t.id === tab)?.label}</span>
                  <button onClick={() => { store.setTabPosition(tab, null); setActiveTabId(tab); }} className="text-[8px] text-text-muted/40 hover:text-error">✕</button>
                </div>
                <div className="flex-1 overflow-auto">
                  {renderTabContent(tab)}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        </>)}
      </div>

      {/* ─── JSON File Browser Modal ─── */}
      {jsonBrowserMode && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setJsonBrowserMode(null); }}>
          <div className="bg-bg-secondary rounded-xl shadow-2xl w-[500px] max-h-[70vh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <h3 className="text-sm font-medium">
                {jsonBrowserMode === "preset" ? "作品情報JSON" : "校正データJSON"} を選択
              </h3>
              <button onClick={() => setJsonBrowserMode(null)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="flex-1 overflow-auto">
              {jsonBrowserMode === "check" ? (
                <CheckJsonBrowser
                  onSelect={handleJsonFileSelect}
                  onCancel={() => setJsonBrowserMode(null)}
                />
              ) : jsonFolderPath ? (
                <JsonFileBrowser
                  basePath={jsonFolderPath}
                  onSelect={handleJsonFileSelect}
                  onCancel={() => setJsonBrowserMode(null)}
                  mode="open"
                />
              ) : (
                <div className="p-4 text-center text-text-muted text-xs">
                  <p>JSONフォルダパスが設定されていません</p>
                  <p className="mt-1 text-[10px]">スキャナータブでJSONフォルダを設定してください</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 右クリックコンテキストメニュー */}
      {viewerContextMenu && (
        <FileContextMenu
          x={viewerContextMenu.x}
          y={viewerContextMenu.y}
          files={(() => {
            const psd = usePsdStore.getState();
            const currentFile = store.files[store.currentFileIndex];
            if (!currentFile) return [];
            const match = psd.files.find((f) => f.filePath === currentFile.path);
            return match ? [match] : [];
          })()}
          allFiles={usePsdStore.getState().files}
          onClose={() => setViewerContextMenu(null)}
          viewerMode
        />
      )}
    </div>
  );
}

// (CheckJsonBrowser is now in ./UnifiedSubComponents.tsx)
// Re-export for backward compatibility (TopNav imports it from here)
export { CheckJsonBrowser } from "./UnifiedSubComponents";

// ────────────────────────────────────────────────────────────
// SaveDropdown — PsDesign 風の保存アイコン + ドロップダウン
// クリックで開閉、外側クリック / Escape で閉じる
// 上書き保存 / 別名保存 を選択可能
// ────────────────────────────────────────────────────────────
function SaveDropdown({
  onSave,
  onSaveAs,
  canSave,
  hasContent,
}: {
  onSave: () => void;
  onSaveAs: () => void;
  /** 上書き保存可能か（既存ファイルがあり、変更がある） */
  canSave: boolean;
  /** 別名保存可能か（テキストが空でない） */
  hasContent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const triggerDisabled = !hasContent && !canSave;

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!triggerDisabled) setOpen((v) => !v);
        }}
        disabled={triggerDisabled}
        title="保存"
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-1.5 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-30 disabled:pointer-events-none inline-flex items-center"
      >
        <Save className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 min-w-[200px] bg-bg-secondary border border-border rounded-lg shadow-elevated py-1 z-[1000]"
        >
          {/* Triangle pointer */}
          <div className="absolute -top-[5px] left-3 w-2 h-2 bg-bg-secondary border-l border-t border-border rotate-45" />
          <div className="px-3 py-1 text-[9px] text-text-muted/70 uppercase tracking-wide border-b border-border/40 mb-1">保存</div>
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            onClick={() => { onSave(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Save className="w-3 h-3 text-text-muted flex-shrink-0" strokeWidth={2} />
            <span className="flex-1 text-left">上書き保存</span>
            <span className="text-[9px] text-text-muted">Ctrl+S</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasContent}
            onClick={() => { onSaveAs(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <FilePlus className="w-3 h-3 text-text-muted flex-shrink-0" strokeWidth={2} />
            <span className="flex-1 text-left">別名で保存</span>
            <span className="text-[9px] text-text-muted">Ctrl+Shift+S</span>
          </button>
        </div>
      )}
    </div>
  );
}


/**
 * ProofreadView — 校正JSONビューアー（独立版）
 *
 * かつて統合ビューアーの "校正JSON" タブだった機能を独立ツール化。
 * 中央: 画像表示（参照用） / 右: ProofreadPanel（正誤/提案チェック）
 * ProofreadPanel が useScopedViewerStore に依存しているため、
 * <ScopedViewerStoreProvider store={useUnifiedViewerStore}> で包んで再利用する。
 */
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePsdStore } from "../../store/psdStore";
import {
  ScopedViewerStoreProvider,
  useUnifiedViewerStore,
  useScopedViewerStore,
} from "../../store/unifiedViewerStore";
import { useHighResPreview } from "../../hooks/useHighResPreview";
import { useOpenInPhotoshop } from "../../hooks/useOpenInPhotoshop";
import { usePhotoshopConverter } from "../../hooks/usePhotoshopConverter";
import { ProofreadPanel } from "../unified-viewer/panels/ProofreadPanel";

export function ProofreadView() {
  return (
    <ScopedViewerStoreProvider store={useUnifiedViewerStore}>
      <ProofreadViewInner />
    </ScopedViewerStoreProvider>
  );
}

function ProofreadViewInner() {
  const files = usePsdStore((s) => s.files);
  const activeFileId = usePsdStore((s) => s.activeFileId);
  const setActiveFile = usePsdStore((s) => s.setActiveFile);

  const checkData = useScopedViewerStore((s) => s.checkData);

  const { openFileInPhotoshop } = useOpenInPhotoshop();
  const { isPhotoshopInstalled } = usePhotoshopConverter();

  const idx = files.findIndex((f) => f.id === activeFileId);
  const cur = idx >= 0 ? files[idx] : files[0] || null;

  useEffect(() => {
    if (!activeFileId && files.length > 0) {
      setActiveFile(files[0].id);
    }
  }, [files.length, activeFileId, setActiveFile]);

  const { imageUrl, isLoading } = useHighResPreview(cur?.filePath, {
    maxSize: 2048,
    enabled: !!cur,
    pdfPageIndex: cur?.pdfPageIndex,
    pdfSourcePath: cur?.pdfSourcePath,
  });

  const goPrev = () => { if (idx > 0) setActiveFile(files[idx - 1].id); };
  const goNext = () => { if (idx < files.length - 1) setActiveFile(files[idx + 1].id); };

  // ProofreadPanel のページ移動 (item クリック → ファイル番号で移動)
  const navigateToTextPage = (pageNumber: number) => {
    const targetIdx = pageNumber - 1;
    if (targetIdx >= 0 && targetIdx < files.length) {
      setActiveFile(files[targetIdx].id);
    }
  };

  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if ((e.key === "p" || e.key === "P") && cur && isPhotoshopInstalled) {
        e.preventDefault();
        openFileInPhotoshop(cur.filePath);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, files.length, cur, isPhotoshopInstalled, openFileInPhotoshop]);

  // マウスホイールでページ送り（画像エリア上）
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) goNext();
      else if (e.deltaY < 0) goPrev();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [idx, files.length]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* ヘッダー */}
      <div className="flex-shrink-0 h-9 bg-bg-secondary border-b border-border flex items-center px-3 gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={idx <= 0}
            className="w-7 h-7 rounded-md bg-bg-tertiary text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-border/50 transition-colors inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            title="前のファイル (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-text-muted tabular-nums px-1 min-w-[50px] text-center">
            {files.length > 0 ? `${idx + 1} / ${files.length}` : "0 / 0"}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={idx < 0 || idx >= files.length - 1}
            className="w-7 h-7 rounded-md bg-bg-tertiary text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-border/50 transition-colors inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            title="次のファイル (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 text-sm font-medium text-text-primary truncate text-center">
          {cur?.fileName ?? "ファイルが選択されていません"}
        </div>
        {/* Photoshop で開くボタン（公式ブルーで Ps 表示） */}
        {isPhotoshopInstalled && cur && (
          <button
            className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded-[3px] transition-all hover:bg-[#31A8FF]/15 active:scale-95 border border-[#31A8FF]/60"
            onClick={() => openFileInPhotoshop(cur.filePath)}
            title="Photoshopで開く (P)"
            aria-label="Photoshopで開く"
          >
            <span className="text-[8px] font-bold leading-none text-[#31A8FF] tracking-tight select-none">Ps</span>
          </button>
        )}
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          {checkData ? (
            <span className="text-success">
              校正JSON: {checkData.allItems.length}件
            </span>
          ) : (
            <span className="text-warning">校正JSON未読込（TopNav から読込）</span>
          )}
        </div>
      </div>

      {/* メインエリア: 画像 (左) | ProofreadPanel (右) */}
      <div className="flex-1 flex min-h-0">
        <div ref={viewerRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#1a1a1e]">
          {!cur && <div className="text-text-muted text-sm">ファイルが選択されていません。</div>}
          {cur && !imageUrl && isLoading && (
            <div className="text-text-muted text-sm">読み込み中…</div>
          )}
          {cur && imageUrl && (
            <img
              src={imageUrl}
              className="max-w-full max-h-full object-contain"
              alt={cur.fileName}
            />
          )}
        </div>

        <div className="w-[480px] flex-shrink-0 border-l border-border bg-bg-secondary flex flex-col min-h-0">
          <div className="flex-shrink-0 h-7 px-2 flex items-center text-[11px] font-medium text-text-secondary border-b border-border/60 bg-bg-tertiary/40">
            校正JSON
          </div>
          <div className="flex-1 overflow-hidden">
            <ProofreadPanel pageSync={true} navigateToTextPage={navigateToTextPage} />
          </div>
        </div>
      </div>
    </div>
  );
}

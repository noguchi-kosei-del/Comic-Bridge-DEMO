import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { usePsdStore } from "../../store/psdStore";
import { useViewStore } from "../../store/viewStore";
import { useHighResPreview } from "../../hooks/useHighResPreview";
import { LayerTree } from "../metadata/LayerTree";
import type { LayerBounds } from "../../types";

export function LayerViewerView() {
  const files = usePsdStore((s) => s.files);
  const activeFileId = usePsdStore((s) => s.activeFileId);
  const setActiveFile = usePsdStore((s) => s.setActiveFile);
  const goBack = useViewStore((s) => s.goBackFromLayerViewer);

  const idx = files.findIndex((f) => f.id === activeFileId);
  const cur = idx >= 0 ? files[idx] : null;
  const layerTree = cur?.metadata?.layerTree ?? [];

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [highlightBounds, setHighlightBounds] = useState<LayerBounds | null>(null);
  const [imgFallbackDims, setImgFallbackDims] = useState({ w: 0, h: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);

  const { imageUrl, originalSize, isLoading } = useHighResPreview(
    cur?.filePath,
    {
      maxSize: 2048,
      enabled: !!cur,
      pdfPageIndex: cur?.pdfPageIndex,
      pdfSourcePath: cur?.pdfSourcePath,
    },
  );

  const dims = originalSize
    ? { w: originalSize.width, h: originalSize.height }
    : imgFallbackDims;

  // ファイル切替時にハイライトリセット
  useEffect(() => {
    setSelectedLayerId(null);
    setHighlightBounds(null);
    setImgFallbackDims({ w: 0, h: 0 });
  }, [activeFileId]);

  const goPrev = () => {
    if (idx > 0) setActiveFile(files[idx - 1].id);
  };
  const goNext = () => {
    if (idx < files.length - 1) setActiveFile(files[idx + 1].id);
  };

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, files.length]);

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
      <div className="flex-shrink-0 h-10 bg-bg-secondary border-b border-border flex items-center px-3 gap-3">
        <button
          type="button"
          onClick={goBack}
          className="px-2 py-1 text-xs rounded-md bg-bg-tertiary text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-border/50 transition-colors inline-flex items-center gap-1"
          title="戻る (Esc)"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          戻る
        </button>
        <div className="flex-1 text-sm font-medium text-text-primary truncate">
          {cur?.fileName ?? "ファイルが選択されていません"}
        </div>
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
          <span className="text-xs text-text-muted tabular-nums px-1">
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
      </div>

      {/* メインエリア */}
      <div className="flex-1 flex min-h-0">
        {/* 左サイドバー: LayerTree */}
        <div className="w-[280px] flex-shrink-0 border-r border-border bg-bg-secondary flex flex-col min-h-0">
          <div className="flex-shrink-0 h-7 px-2 flex items-center text-[11px] font-medium text-text-secondary border-b border-border/60 bg-bg-tertiary/40">
            レイヤー構造
          </div>
          <div className="flex-1 overflow-auto select-none">
            {layerTree.length > 0 ? (
              <LayerTree
                layers={layerTree}
                selectedLayerId={selectedLayerId}
                onSelectLayer={(id, bounds) => {
                  setSelectedLayerId(id);
                  setHighlightBounds(bounds);
                }}
              />
            ) : (
              <div className="p-3 text-xs text-text-muted">
                {cur ? "レイヤー情報がありません（PSD/PSB のみ対応）。" : "ファイルが選択されていません。"}
              </div>
            )}
          </div>
        </div>

        {/* 中央: 画像 + SVG オーバーレイ */}
        <div ref={viewerRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-[#1a1a1e]">
          {!cur && (
            <div className="text-text-muted text-sm">ファイルが選択されていません。</div>
          )}
          {cur && !imageUrl && isLoading && (
            <div className="text-text-muted text-sm">読み込み中…</div>
          )}
          {cur && imageUrl && (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={imageUrl}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImgFallbackDims({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                className="max-w-full max-h-full object-contain"
                alt={cur.fileName}
              />
              {highlightBounds && dims.w > 0 && dims.h > 0 && (
                <svg
                  className="absolute inset-0 pointer-events-none"
                  viewBox={`0 0 ${dims.w} ${dims.h}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: "100%", height: "100%" }}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

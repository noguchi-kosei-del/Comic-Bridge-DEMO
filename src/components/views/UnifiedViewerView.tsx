import { useState, useEffect } from "react";
import { usePsdStore } from "../../store/psdStore";
import { useOpenInPhotoshop } from "../../hooks/useOpenInPhotoshop";
import { usePhotoshopConverter } from "../../hooks/usePhotoshopConverter";
import { SpecViewerPanel } from "../spec-checker/SpecViewerPanel";
import { TypesettingViewerPanel } from "../typesetting-check/TypesettingViewerPanel";
import { TypesettingCheckPanel } from "../typesetting-check/TypesettingCheckPanel";
import { TypesettingConfirmPanel } from "../typesetting-confirm/TypesettingConfirmPanel";
import { DropZone } from "../file-browser/DropZone";
import { ProgenImageViewer } from "../unified-viewer/ProgenImageViewer";
import KenbanApp from "../kenban/KenbanApp";
import "../../kenban-utils/kenban.css";
import "../../kenban-utils/kenbanApp.css";

type ViewerSubMode = "image" | "check" | "confirm" | "diff" | "parallel" | "progen";

const SUB_TABS: { id: ViewerSubMode; label: string }[] = [
  { id: "image", label: "画像ビューアー" },
  { id: "check", label: "写植調整" },
  { id: "confirm", label: "写植確認" },
  { id: "diff", label: "差分モード" },
  { id: "parallel", label: "分割ビューアー" },
  { id: "progen", label: "ProGen" },
];

export function UnifiedViewerView() {
  const [activeSubMode, setActiveSubMode] = useState<ViewerSubMode>("image");
  const files = usePsdStore((s) => s.files);
  const { openFileInPhotoshop } = useOpenInPhotoshop();
  const { isPhotoshopInstalled } = usePhotoshopConverter();

  // State-preserving mount (once mounted, never unmount)
  const [diffMounted, setDiffMounted] = useState(false);
  const [parallelMounted, setParallelMounted] = useState(false);
  const [progenMounted, setProgenMounted] = useState(false);

  useEffect(() => {
    if (activeSubMode === "diff") setDiffMounted(true);
    if (activeSubMode === "parallel") setParallelMounted(true);
    if (activeSubMode === "progen") setProgenMounted(true);
  }, [activeSubMode]);

  const hasFiles = files.length > 0;

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Sub-mode selector bar */}
      <div className="flex-shrink-0 h-9 bg-bg-secondary border-b border-border flex items-center px-3 gap-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`
              flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md
              transition-all duration-150 flex-shrink-0
              ${
                activeSubMode === tab.id
                  ? "text-white bg-gradient-to-r from-accent to-accent-secondary shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }
            `}
            onClick={() => setActiveSubMode(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Image Viewer (COMIC-Bridge SpecViewerPanel) */}
        {activeSubMode === "image" && (
          <div className="h-full overflow-hidden">
            {!hasFiles ? (
              <DropZone />
            ) : (
              <SpecViewerPanel
                onOpenInPhotoshop={isPhotoshopInstalled ? openFileInPhotoshop : undefined}
              />
            )}
          </div>
        )}

        {/* 写植調整 (TypesettingViewerPanel + TypesettingCheckPanel) */}
        {activeSubMode === "check" && (
          <div className="flex h-full overflow-hidden">
            {hasFiles ? (
              <div className="flex-1 overflow-hidden">
                <TypesettingViewerPanel />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <svg
                    className="w-12 h-12 mx-auto text-text-muted/30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-xs text-text-muted">
                    PSDファイルをドロップして読み込んでください
                  </p>
                </div>
              </div>
            )}
            <div className="w-[480px] flex-shrink-0 border-l border-border overflow-hidden flex flex-col bg-bg-secondary">
              <TypesettingCheckPanel />
            </div>
          </div>
        )}

        {/* 写植確認 (TypesettingConfirmPanel) */}
        {activeSubMode === "confirm" && <TypesettingConfirmPanel />}

        {/* KENBAN Diff Mode */}
        {diffMounted && (
          <div
            className="kenban-scope"
            style={{ display: activeSubMode === "diff" ? "contents" : "none" }}
          >
            <div
              className="flex h-full w-full overflow-hidden"
              style={{ position: "absolute", inset: 0 }}
            >
              <KenbanApp defaultAppMode="diff-check" />
            </div>
          </div>
        )}

        {/* KENBAN Parallel Viewer */}
        {parallelMounted && (
          <div
            className="kenban-scope"
            style={{ display: activeSubMode === "parallel" ? "contents" : "none" }}
          >
            <div
              className="flex h-full w-full overflow-hidden"
              style={{ position: "absolute", inset: 0 }}
            >
              <KenbanApp defaultAppMode="parallel-view" />
            </div>
          </div>
        )}

        {/* ProGen Image Viewer */}
        {progenMounted && (
          <div style={{ display: activeSubMode === "progen" ? "contents" : "none" }}>
            <div
              className="flex h-full w-full overflow-hidden"
              style={{ position: "absolute", inset: 0 }}
            >
              <ProgenImageViewer />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

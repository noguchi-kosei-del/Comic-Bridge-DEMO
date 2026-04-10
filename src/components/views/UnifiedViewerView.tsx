import { useState, useEffect } from "react";
import { UnifiedViewer } from "../unified-viewer/UnifiedViewer";
import { useViewStore } from "../../store/viewStore";
import { DiffViewerView } from "../diff-viewer/DiffViewerView";
import { ParallelViewerView } from "../parallel-viewer/ParallelViewerView";

type ViewerSubMode = "viewer" | "diff" | "parallel";

const SUB_TABS: { id: ViewerSubMode; label: string }[] = [
  { id: "viewer", label: "統合ビューアー" },
  { id: "diff", label: "差分モード" },
  { id: "parallel", label: "分割ビューアー" },
];

export function UnifiedViewerView() {
  const [activeSubMode, setActiveSubMode] = useState<ViewerSubMode>("viewer");
  const isFullscreen = useViewStore((s) => s.isViewerFullscreen);
  const kenbanPathA = useViewStore((s) => s.kenbanPathA);
  const kenbanPathB = useViewStore((s) => s.kenbanPathB);

  const kenbanViewMode = useViewStore((s) => s.kenbanViewMode);

  // 検A+検B両方セットされたら自動で差分/分割モードに切り替え
  useEffect(() => {
    if (kenbanPathA && kenbanPathB && activeSubMode === "viewer") {
      setActiveSubMode(kenbanViewMode === "parallel" ? "parallel" : "diff");
    }
  }, [kenbanPathA, kenbanPathB, kenbanViewMode]);

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Sub-mode selector bar — 全画面時は非表示 */}
      {!isFullscreen && <div className="flex-shrink-0 h-9 bg-bg-secondary border-b border-border flex items-center px-3 gap-1">
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
      </div>}

      {/* Content area — タブ切替で毎回マウント（検A/B propsを確実に反映） */}
      <div className="flex-1 overflow-hidden relative">
        {activeSubMode === "viewer" && (
          <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
            <UnifiedViewer />
          </div>
        )}

        {activeSubMode === "diff" && (
          <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
            <DiffViewerView externalPathA={kenbanPathA} externalPathB={kenbanPathB} />
          </div>
        )}

        {activeSubMode === "parallel" && (
          <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
            <ParallelViewerView externalPathA={kenbanPathA} externalPathB={kenbanPathB} />
          </div>
        )}
      </div>
    </div>
  );
}

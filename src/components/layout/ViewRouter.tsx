import { useState, useEffect } from "react";
import { useViewStore } from "../../store/viewStore";
import { SpecCheckView } from "../views/SpecCheckView";
import { LayerControlView } from "../views/LayerControlView";
import { SplitView } from "../views/SplitView";
import { ReplaceView } from "../views/ReplaceView";
import { ComposeView } from "../views/ComposeView";
import { RenameView } from "../views/RenameView";
import { TiffView } from "../views/TiffView";
import { ScanPsdView } from "../views/ScanPsdView";
// TypsettingView は隔離中 — 削除予定
// import { TypsettingView } from "../views/TypsettingView";
// KENBAN は完全削除済み（差分・分割は統合ビューアーへReact移植完了）
import { ProgenView } from "../views/ProgenView";
import { UnifiedViewerView } from "../views/UnifiedViewerView";
import { TextEditorView } from "../views/TextEditorView";
import { FolderSetupView } from "../views/FolderSetupView";
import { RequestPrepView } from "../views/RequestPrepView";
import { InspectionToolView } from "../views/InspectionToolView";

export function ViewRouter() {
  const activeView = useViewStore((s) => s.activeView);

  // State-preserving mount for heavy tabs (once mounted, never unmount)
  const [progenMounted, setProgenMounted] = useState(false);
  const [unifiedViewerMounted, setUnifiedViewerMounted] = useState(false);
  const [textEditorMounted, setTextEditorMounted] = useState(false);
  const [inspectionMounted, setInspectionMounted] = useState(false);

  useEffect(() => {
    if (activeView === "progen") setProgenMounted(true);
    if (activeView === "unifiedViewer") setUnifiedViewerMounted(true);
    if (activeView === "textEditor") setTextEditorMounted(true);
    if (activeView === "inspection") setInspectionMounted(true);
  }, [activeView]);

  return (
    <div className="flex-1 overflow-hidden bg-bg-primary relative">
      {/* Standard conditional rendering for lightweight tabs */}
      {activeView === "specCheck" && <SpecCheckView />}
      {activeView === "layers" && <LayerControlView />}
      {/* TypsettingView は隔離中 — 削除予定 */}
      {/* {activeView === "typesetting" && <TypsettingView />} */}
      {activeView === "split" && <SplitView />}
      {activeView === "replace" && <ReplaceView />}
      {activeView === "compose" && <ComposeView />}
      {activeView === "rename" && <RenameView />}
      {activeView === "tiff" && <TiffView />}
      {activeView === "scanPsd" && <ScanPsdView />}
      {activeView === "folderSetup" && <FolderSetupView />}
      {activeView === "requestPrep" && <RequestPrepView />}

      {/* ProGen: React native (state-preserving via display toggle) */}
      {progenMounted && (
        <div style={{ display: activeView === "progen" ? "contents" : "none" }}>
          <ProgenView />
        </div>
      )}

      {/* Unified Viewer: display toggle for state preservation */}
      {unifiedViewerMounted && (
        <div style={{ display: activeView === "unifiedViewer" ? "contents" : "none" }}>
          <UnifiedViewerView />
        </div>
      )}

      {/* Text Editor: display toggle for state preservation */}
      {textEditorMounted && (
        <div style={{ display: activeView === "textEditor" ? "contents" : "none" }}>
          <TextEditorView />
        </div>
      )}

      {/* Inspection Tool: display toggle for state preservation (差分計算結果を保持) */}
      {inspectionMounted && (
        <div style={{ display: activeView === "inspection" ? "contents" : "none" }}>
          <InspectionToolView />
        </div>
      )}
    </div>
  );
}

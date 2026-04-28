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
import { DTPViewerView } from "../views/DTPViewerView";
import { TextDiffView } from "../views/TextDiffView";
import { ProofreadView } from "../views/ProofreadView";
import { TextEditorView } from "../views/TextEditorView";
import { FolderSetupView } from "../views/FolderSetupView";
import { RequestPrepView } from "../views/RequestPrepView";
import { InspectionToolView } from "../views/InspectionToolView";
import { LayerViewerView } from "../views/LayerViewerView";

export function ViewRouter() {
  const activeView = useViewStore((s) => s.activeView);
  const isExitingHome = useViewStore((s) => s.isExitingHome);
  const isEnteringWorkflow = useViewStore((s) => s.isEnteringWorkflow);
  const slidePhase = useViewStore((s) => s.slidePhase);

  // State-preserving mount for heavy tabs (once mounted, never unmount)
  const [progenMounted, setProgenMounted] = useState(false);
  const [dtpViewerMounted, setDtpViewerMounted] = useState(false);
  const [textDiffMounted, setTextDiffMounted] = useState(false);
  const [proofreadMounted, setProofreadMounted] = useState(false);
  const [textEditorMounted, setTextEditorMounted] = useState(false);
  const [inspectionMounted, setInspectionMounted] = useState(false);

  useEffect(() => {
    if (activeView === "progen") setProgenMounted(true);
    if (activeView === "dtpViewer") setDtpViewerMounted(true);
    if (activeView === "textDiff") setTextDiffMounted(true);
    if (activeView === "proofread") setProofreadMounted(true);
    if (activeView === "textEditor") setTextEditorMounted(true);
    if (activeView === "inspection") setInspectionMounted(true);
  }, [activeView]);

  return (
    <div className={`flex-1 overflow-hidden bg-bg-primary relative ${
      isExitingHome ? "animate-exit-to-home"
      : isEnteringWorkflow ? "animate-enter-from-back"
      : slidePhase === "exit-left" ? "animate-slide-out-left"
      : slidePhase === "exit-right" ? "animate-slide-out-right"
      : slidePhase === "enter-from-right" ? "animate-slide-in-from-right"
      : slidePhase === "enter-from-left" ? "animate-slide-in-from-left"
      : slidePhase === "exit-up" ? "animate-slide-out-up"
      : slidePhase === "enter-from-bottom" ? "animate-slide-in-from-bottom"
      : ""
    }`}>
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
      {activeView === "layerViewer" && <LayerViewerView />}

      {/* ProGen: React native (state-preserving via display toggle) */}
      {progenMounted && (
        <div style={{ display: activeView === "progen" ? "contents" : "none" }}>
          <ProgenView />
        </div>
      )}

      {/* DTP Viewer: display toggle for state preservation */}
      {dtpViewerMounted && (
        <div style={{ display: activeView === "dtpViewer" ? "contents" : "none" }}>
          <DTPViewerView />
        </div>
      )}

      {/* Text Diff: display toggle for state preservation */}
      {textDiffMounted && (
        <div style={{ display: activeView === "textDiff" ? "contents" : "none" }}>
          <TextDiffView />
        </div>
      )}

      {/* Proofread: display toggle for state preservation */}
      {proofreadMounted && (
        <div style={{ display: activeView === "proofread" ? "contents" : "none" }}>
          <ProofreadView />
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

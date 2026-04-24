import { useWorkflowStore } from "../../store/workflowStore";
import { WorkflowDescriptionBar } from "./WorkflowBar";

// フォルダパス入力バーは廃止。ワークフロー進行中のみ説明バーを表示し、
// それ以外は何も描画しない（上部スロットを空けてレイアウト節約）。
export function GlobalAddressBar() {
  const wfActive = useWorkflowStore((s) => s.activeWorkflow !== null);
  if (!wfActive) return null;
  return <WorkflowDescriptionBar />;
}

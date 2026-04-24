import { UnifiedViewer } from "../unified-viewer/UnifiedViewer";

export function UnifiedViewerView() {
  return (
    <div className="flex-1 h-full overflow-hidden">
      <UnifiedViewer />
    </div>
  );
}

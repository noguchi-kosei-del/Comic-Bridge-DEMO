import { useScanPsdStore } from "../../store/scanPsdStore";
import { ScanPsdModeSelector } from "../scanPsd/ScanPsdModeSelector";
import { ScanPsdEditView } from "../scanPsd/ScanPsdEditView";

export function ScanPsdView() {
  const mode = useScanPsdStore((s) => s.mode);

  if (!mode) {
    return <ScanPsdModeSelector />;
  }

  // モード選択後は常に3カラム全画面ビュー（追加スキャンはヘッダー右の「追加スキャン」ボタンから）
  return <ScanPsdEditView />;
}

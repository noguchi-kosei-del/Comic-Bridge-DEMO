/**
 * DTPViewerView — DTP用画像ビューアー（独立版）
 *
 * 参照プロジェクト COMIC-Bridge-main の DTPビューアー（ViewerView）と同等の構成。
 * SpecViewerPanel をフル機能で再利用:
 *  - 中央画像 + 右サイドバー（写植仕様 / レイヤー構造タブ）
 *  - フォント絞り込み(3状態) / 問題種別フィルタ / 白フチフィルタ
 *  - SVG オーバーレイで該当レイヤーを画像上にハイライト
 *  - 全画面モード（OS ネイティブ）
 *  - フォント帳キャプチャ（CaptureOverlay）
 *  - マーカー付き画像保存
 *  - ←→ / マウスホイールでページ送り
 *  - P で Photoshop 起動 / F でフォルダを開く
 */
import { usePsdStore } from "../../store/psdStore";
import { useOpenInPhotoshop } from "../../hooks/useOpenInPhotoshop";
import { usePhotoshopConverter } from "../../hooks/usePhotoshopConverter";
import { SpecViewerPanel } from "../spec-checker/SpecViewerPanel";

export function DTPViewerView() {
  const files = usePsdStore((s) => s.files);
  const { openFileInPhotoshop } = useOpenInPhotoshop();
  const { isPhotoshopInstalled } = usePhotoshopConverter();

  if (files.length === 0) {
    return (
      <div className="flex-1 h-full overflow-hidden flex items-center justify-center bg-bg-primary">
        <div className="text-text-muted text-sm">ホーム画面でファイルを読み込んでください</div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden">
      <SpecViewerPanel
        onOpenInPhotoshop={isPhotoshopInstalled ? openFileInPhotoshop : undefined}
        hideLayerTree
      />
    </div>
  );
}

import { UnifiedViewer } from "../unified-viewer/UnifiedViewer";

/**
 * テキストエディタビュー — 画像表示 / 校正JSON / テキスト照合 / テキスト編集 に特化。
 * 実体は UnifiedViewer を `textEditorMode` で呼び出したもの。
 * state（ファイル・校正JSON・textPages 等）は既存「ビューアー」と共有される。
 */
export function TextEditorView() {
  return (
    <div className="flex-1 h-full overflow-hidden">
      <UnifiedViewer textEditorMode />
    </div>
  );
}

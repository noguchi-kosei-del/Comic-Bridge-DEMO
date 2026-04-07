import { useCallback, useEffect } from "react";
import { TopNav } from "./TopNav";
import { GlobalAddressBar } from "./GlobalAddressBar";
import { ViewRouter } from "./ViewRouter";
import { GuideEditorModal } from "../guide-editor/GuideEditorModal";
import { ErrorBoundary } from "../ErrorBoundary";

import { ConversionToast } from "../spec-checker/ConversionToast";
import { usePsdStore } from "../../store/psdStore";
import { useViewStore } from "../../store/viewStore";
import { useGuideStore } from "../../store/guideStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useGlobalDragDrop } from "../../hooks/useGlobalDragDrop";
import { useOpenFolderShortcut } from "../../hooks/useOpenFolder";
import { useFileWatcher } from "../../hooks/useFileWatcher";
import { useHandoff } from "../../hooks/useHandoff";

export function AppLayout() {
  const isViewerFullscreen = useViewStore((s) => s.isViewerFullscreen);
  const isEditorOpen = useGuideStore((state) => state.isEditorOpen);
  const { fontSize, accentColor, darkMode } = useSettingsStore();

  // 設定をCSS変数/クラスに反映
  useEffect(() => {
    const root = document.documentElement;
    // フォントサイズ
    const scale = fontSize === "small" ? 0.9 : fontSize === "large" ? 1.15 : 1;
    root.style.fontSize = `${scale * 16}px`;
  }, [fontSize]);

  // ダークモード + アクセントカラー
  useEffect(() => {
    const root = document.documentElement;
    let filter = "";
    if (darkMode) filter += "invert(0.92) hue-rotate(180deg) ";
    // アクセントカラーのhue-rotate計算（デフォルト #ff5a8a = hue≈345°）
    if (accentColor && accentColor !== "#ff5a8a") {
      // 色相差をCSS変数に保存（UI要素のみに適用するため）
      root.style.setProperty("--settings-accent", accentColor);
    } else {
      root.style.removeProperty("--settings-accent");
    }
    root.style.filter = filter.trim() || "";
    // ダークモード: 画像/動画/canvas/iframeは二重反転で元に戻す
    const mediaSelector = "img, video, canvas, iframe";
    const mediaFilter = darkMode ? "invert(1) hue-rotate(180deg)" : "";
    // MutationObserverで動的に追加される要素にも適用
    document.querySelectorAll(mediaSelector).forEach((el) => {
      (el as HTMLElement).style.filter = mediaFilter;
    });
  }, [darkMode, accentColor]);
  const clearSelection = usePsdStore((state) => state.clearSelection);
  const selectAll = usePsdStore((state) => state.selectAll);
  const files = usePsdStore((state) => state.files);

  // グローバルドラッグ＆ドロップ（常時有効）
  useGlobalDragDrop();

  // Fキーでフォルダを開く（全タブ共通）
  useOpenFolderShortcut();

  // ファイル変更検知（外部Photoshop保存を検知）
  useFileWatcher();

  // Photoshop UXPプラグインからのハンドオフ検出
  useHandoff();

  // Ctrl+A で全選択
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        if (files.length > 0) selectAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [files.length, selectAll]);

  // サムネ領域外クリックで複数選択を解除
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-preview-grid]")) return;
      if ((e.target as HTMLElement).closest("[data-sidebar], [data-detail-panel]")) return;
      if ((e.target as HTMLElement).closest("[data-tool-panel]")) return;
      if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
      clearSelection();
    },
    [clearSelection],
  );

  return (
    <div
      className="flex flex-col h-screen bg-bg-primary overflow-hidden"
      onMouseDown={handleMouseDown}
    >
      {/* 背景のトーンパターン */}
      <div className="fixed inset-0 bg-tone pointer-events-none" />

      {/* Top Navigation — 全画面時は非表示 */}
      {!isViewerFullscreen && <TopNav />}

      {/* Global Address Bar — 全画面時は非表示 */}
      {!isViewerFullscreen && <GlobalAddressBar />}

      {/* View Content */}
      <ErrorBoundary>
        <ViewRouter />
      </ErrorBoundary>

      {/* Guide Editor Modal */}
      {isEditorOpen && <GuideEditorModal />}

      {/* Photoshop変換完了トースト */}
      <ConversionToast />
    </div>
  );
}

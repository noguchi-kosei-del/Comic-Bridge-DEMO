import { useState, useEffect, useRef } from "react";
import { useTextExtract } from "../../hooks/useTextExtract";
import { invoke } from "@tauri-apps/api/core";
import type { PsdFile } from "../../types";

/**
 * テキスト抽出フローティングボタン
 * PSDファイルのテキストレイヤーからテキストを抽出し、COMIC-POT互換フォーマットで保存する
 */
export function TextExtractButton({
  compact = false,
  files,
  variant = "accent",
}: {
  compact?: boolean;
  files?: PsdFile[];
  /** "accent" = 青基調 / "neutral" = ActionButton と同じ無彩色（ダークモード時に白文字化） */
  variant?: "accent" | "neutral";
}) {
  const {
    psdFiles,
    isExtracting,
    sortMode,
    setSortMode,
    includeHidden,
    setIncludeHidden,
    splitByFolder,
    setSplitByFolder,
    hasMultipleFolders,
    result,
    setResult,
    handleExtract,
  } = useTextExtract(files);
  const [showOptions, setShowOptions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリックでポップオーバーを閉じる
  useEffect(() => {
    if (!showOptions) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showOptions]);

  if (psdFiles.length === 0) return null;

  return (
    <>
      <div className="relative" ref={containerRef}>
        {/* オプションポップオーバー */}
        {showOptions && (
          <div
            className="absolute bottom-full right-0 mb-3 w-72 bg-bg-secondary rounded-xl shadow-elevated border border-border p-4 space-y-3"
            style={{ animation: "toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-text-primary">テキスト抽出設定</p>

            {/* ソート順 */}
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted">レイヤー順序</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === "bottomToTop"
                      ? "bg-accent/10 text-accent border-r border-border"
                      : "text-text-secondary hover:bg-bg-tertiary border-r border-border"
                  }`}
                  onClick={() => setSortMode("bottomToTop")}
                >
                  下→上
                </button>
                <button
                  className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === "topToBottom"
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-bg-tertiary"
                  }`}
                  onClick={() => setSortMode("topToBottom")}
                >
                  上→下
                </button>
              </div>
            </div>

            {/* 非表示レイヤー */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                role="checkbox"
                aria-checked={includeHidden}
                tabIndex={0}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  includeHidden ? "bg-accent border-accent" : "border-border hover:border-accent/50"
                }`}
                onClick={() => setIncludeHidden(!includeHidden)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") setIncludeHidden(!includeHidden);
                }}
              >
                {includeHidden && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-xs text-text-secondary">非表示レイヤーも含める</span>
            </label>

            {/* 複数フォルダ時の分割オプション */}
            {hasMultipleFolders && (
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  role="checkbox"
                  aria-checked={splitByFolder}
                  tabIndex={0}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    splitByFolder ? "bg-accent border-accent" : "border-border hover:border-accent/50"
                  }`}
                  onClick={() => setSplitByFolder(!splitByFolder)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") setSplitByFolder(!splitByFolder);
                  }}
                >
                  {splitByFolder && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-text-secondary">フォルダごとに分けて作成</span>
              </label>
            )}

            {/* 実行ボタン */}
            <button
              className="w-full px-4 py-2 text-sm font-bold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors active:scale-[0.97]"
              onClick={handleExtract}
            >
              抽出を実行
            </button>
          </div>
        )}

        {/* メインボタン */}
        <button
          className={`${compact ? "h-8 px-3 text-sm" : "h-10 px-4 text-base"} font-bold rounded-xl shadow-2xl transition-all duration-200 flex items-center justify-center gap-1 whitespace-nowrap bg-bg-secondary border-2 ${
            variant === "neutral"
              ? "border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              : "border-accent/40 text-accent hover:bg-bg-elevated hover:border-accent/60"
          } active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={() => {
            setResult(null);
            setShowOptions(!showOptions);
          }}
          disabled={isExtracting}
          title="テキストレイヤーの内容を抽出してテキストファイルに保存"
        >
          {isExtracting ? (
            <>
              <div
                className={`${compact ? "w-4 h-4" : "w-5 h-5"} rounded-full border-2 border-accent/30 border-t-accent animate-spin`}
              />
              <span className={compact ? "text-xs" : "text-base"}>抽出中...</span>
            </>
          ) : (
            <>
              <svg
                className={compact ? "w-4 h-4" : "w-5 h-5"}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v5a1 1 0 001 1h5" />
              </svg>
              テキスト抽出
            </>
          )}
        </button>
      </div>

      {/* 結果トースト */}
      {result && (
        <div
          className={`px-4 py-2 rounded-xl border text-xs max-w-xs ${
            result.success
              ? "bg-success/10 border-success/30 text-success"
              : "bg-error/10 border-error/30 text-error"
          }`}
          style={{ animation: "toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          {result.message}
          {result.success && result.filePath && (
            <button
              onClick={async () => {
                try {
                  await invoke("launch_progen", { handoffTextPath: result.filePath });
                } catch (err) {
                  console.error("ProGen launch failed:", err);
                }
              }}
              className="ml-2 px-2 py-0.5 rounded bg-accent-secondary/20 text-accent-secondary hover:bg-accent-secondary/30 transition-colors font-medium"
            >
              ProGenへ
            </button>
          )}
          <button onClick={() => setResult(null)} className="ml-2 underline">
            閉じる
          </button>
        </div>
      )}
    </>
  );
}

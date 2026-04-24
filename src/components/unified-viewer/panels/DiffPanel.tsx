/**
 * DiffPanel — PSD テキストレイヤーと COMIC-POT 原稿テキストの照合結果を表示するパネル。
 * 差分計算は useTextDiff に委譲する。
 */
import { useState } from "react";
import type { TextLayerEntry } from "../../../hooks/useFontResolver";
import { FONT_COLORS } from "../../../hooks/useFontResolver";
import type { TextDiffResults } from "../hooks/useTextDiff";
import { normalizeTextForComparison } from "../../../kenban-utils/textExtract";
import { UnifiedDiffDisplay } from "../UnifiedSubComponents";

interface DiffPanelProps {
  /** 現在の PSD テキストレイヤー一覧（存在確認用） */
  textLayers: TextLayerEntry[];
  /** 現在のファイル index（ラベル表示用） */
  currentFileIndex: number;
  /** true の時は「ファイル未選択」表示しない */
  hasCurrentFile: boolean;
  /** ストアの textContent（読込状態チェック用） */
  textContentLength: number;
  /** useTextDiff の結果 */
  diffResults: TextDiffResults | null;
}

export function DiffPanel({
  textLayers,
  currentFileIndex,
  hasCurrentFile,
  textContentLength,
  diffResults,
}: DiffPanelProps) {
  const [diffMatchDisplay, setDiffMatchDisplay] = useState<"psd" | "text">("text");

  return (
    <div className="flex flex-col h-full">
      {!diffResults ? (
        <div className="flex items-center justify-center h-full text-text-muted p-3 text-center">
          <p className="text-[10px]">
            {!hasCurrentFile ? "ファイル未選択"
              : textLayers.length === 0 ? "テキストレイヤーなし"
              : textContentLength === 0 ? "テキスト未読込"
              : "照合データなし"}
          </p>
        </div>
      ) : (
        <>
          {/* ステータスバー */}
          <div className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-border/30 ${
            diffResults.hasDiff ? "bg-warning/10"
              : diffResults.deletedLayerIndices.size > 0 ? "bg-warning/10"
              : "bg-success/10"
          }`}>
            <span className={`text-[10px] font-medium ${
              diffResults.hasDiff ? "text-warning"
                : diffResults.deletedLayerIndices.size > 0 ? "text-warning"
                : "text-success"
            }`}>
              {diffResults.hasDiff ? "差異"
                : diffResults.deletedLayerIndices.size > 0 ? "削除あり"
                : "一致"}
            </span>
            <span className="text-[9px] text-text-muted">
              p.{currentFileIndex + 1} PSD:{diffResults.psdLayerTexts.length} / T:{diffResults.loadedBlocks.length}
            </span>
            <div className="flex-1" />
            <div className="flex bg-bg-tertiary rounded overflow-hidden text-[8px]">
              <button
                onClick={() => setDiffMatchDisplay("psd")}
                className={`px-1 py-px ${diffMatchDisplay === "psd" ? "bg-accent text-white" : "text-text-muted"}`}
              >
                PSD
              </button>
              <button
                onClick={() => setDiffMatchDisplay("text")}
                className={`px-1 py-px ${diffMatchDisplay === "text" ? "bg-accent text-white" : "text-text-muted"}`}
              >
                T
              </button>
            </div>
          </div>
          {/* 照合リスト */}
          <div className="flex-1 overflow-auto">
            <div className="divide-y divide-border/15">
              {diffResults.psdLayerTexts.map((layer, pi) => {
                const isDeleted = diffResults.deletedLayerIndices.has(pi);
                if (isDeleted) {
                  return (
                    <div key={pi} className="bg-warning/8">
                      <div className="flex items-center gap-1 px-1.5 py-0.5 text-[9px]">
                        <span className="w-3 h-3 rounded-full text-[8px] text-white flex items-center justify-center font-bold flex-shrink-0 bg-warning/70">
                          {pi + 1}
                        </span>
                        <span className="text-text-muted truncate line-through">{layer.layerName}</span>
                        <span className="ml-auto text-warning font-medium">テキスト削除確認</span>
                      </div>
                      <div className="px-1.5 py-0.5 text-[9px] font-mono whitespace-pre-wrap break-all text-error/60 line-through leading-tight">
                        {layer.text}
                      </div>
                    </div>
                  );
                }
                const bi = diffResults.linkMap.get(pi);
                const block = bi !== undefined ? diffResults.loadedBlocks[bi] : null;
                const normL = normalizeTextForComparison(layer.text);
                const normB = block ? normalizeTextForComparison(block.text) : "";
                const isMatch = block ? normL === normB : false;
                return (
                  <div key={pi} className={isMatch ? "" : "bg-warning/5"}>
                    {!isMatch && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-bg-tertiary/30 text-[9px]">
                        <span
                          className="w-3 h-3 rounded-full text-[8px] text-white flex items-center justify-center font-bold flex-shrink-0"
                          style={{ backgroundColor: FONT_COLORS[pi % FONT_COLORS.length] }}
                        >
                          {pi + 1}
                        </span>
                        <span className="text-text-primary font-medium truncate">{layer.layerName}</span>
                        <span className="text-text-muted/50">→</span>
                        {block ? <span className="text-text-muted">B{bi! + 1}</span> : <span className="text-error">なし</span>}
                        <span className="ml-auto text-warning">差異</span>
                      </div>
                    )}
                    {isMatch ? (
                      <div className="px-1.5 py-0.5 text-[9px] font-mono whitespace-pre-wrap break-all text-text-secondary leading-tight">
                        {diffMatchDisplay === "psd" ? layer.text : (block?.text ?? "")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-0">
                        <div className="px-1.5 py-0.5 text-[9px] font-mono whitespace-pre-wrap break-all text-text-secondary border-r border-border/15 leading-tight">
                          {layer.text}
                        </div>
                        <div className="px-1.5 py-0.5 text-[9px] font-mono whitespace-pre-wrap break-all text-text-secondary leading-tight">
                          {block ? block.text : <span className="text-text-muted/30">—</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {diffResults.loadedBlocks.map((block, bi) => {
                if ([...diffResults.linkMap.values()].includes(bi)) return null;
                return (
                  <div key={`x-${bi}`} className="bg-success/5 px-1.5 py-0.5">
                    <span className="text-[8px] text-success mr-1">+B{bi + 1}</span>
                    <span className="text-[9px] font-mono text-success leading-tight">{block.text}</span>
                  </div>
                );
              })}
            </div>
            {diffResults.hasDiff && diffResults.unifiedEntries.length > 0 && (
              <div className="p-2 border-t border-border/30">
                <div className="text-[9px] font-medium text-warning mb-1">文字レベル差分</div>
                <UnifiedDiffDisplay entries={diffResults.unifiedEntries} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

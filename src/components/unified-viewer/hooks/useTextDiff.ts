/**
 * useTextDiff — PSD テキストレイヤーと COMIC-POT 原稿テキストの差分を計算するフック。
 * UnifiedViewer / DiffPanel から共通利用。
 */
import { useEffect, useState } from "react";
import type { TextLayerEntry } from "../../../hooks/useFontResolver";
import type { TextPage } from "../../../store/unifiedViewerStore";
import {
  normalizeTextForComparison,
  computeLineSetDiff,
  buildUnifiedDiff,
  type UnifiedDiffEntry,
} from "../../../kenban-utils/textExtract";
import { getTextPageNumbers, type SplitMode } from "../utils";

export interface TextDiffResults {
  psdText: string;
  loadedText: string;
  hasDiff: boolean;
  unifiedEntries: UnifiedDiffEntry[];
  psdLayerTexts: { layerName: string; text: string; fonts: string[] }[];
  loadedBlocks: { text: string; assignedFont?: string }[];
  linkMap: Map<number, number>;
  /** // で削除済みのPSDレイヤーインデックス */
  deletedLayerIndices: Set<number>;
}

export interface UseTextDiffArgs {
  textLayers: TextLayerEntry[];
  /** PSD キャンバス高さ（読み順ソート用）。null / undefined なら 1 にフォールバック */
  metadata: { height?: number } | null | undefined;
  /** 現在表示中のファイル index。単ページ化モード時のページ解決に使用 */
  currentFileIndex: number;
  diffSplitMode: SplitMode;
  textContent: string;
  textPages: TextPage[];
}

export function useTextDiff({
  textLayers,
  metadata,
  currentFileIndex,
  diffSplitMode,
  textContent,
  textPages,
}: UseTextDiffArgs): TextDiffResults | null {
  const [results, setResults] = useState<TextDiffResults | null>(null);

  useEffect(() => {
    if (textLayers.length === 0 || textContent.length === 0) {
      setResults(null);
      return;
    }
    try {
      const canvasH = metadata?.height || 1;
      const rowThreshold = canvasH * 0.08;
      const sortedLayers = [...textLayers]
        .filter((tl) => tl.textInfo?.text)
        .sort((a, b) => {
          const ay = a.bounds?.top ?? 0;
          const by = b.bounds?.top ?? 0;
          const ax = a.bounds?.left ?? 0;
          const bx = b.bounds?.left ?? 0;
          const rowA = Math.floor(ay / rowThreshold);
          const rowB = Math.floor(by / rowThreshold);
          if (rowA !== rowB) return rowA - rowB;
          return bx - ax;
        });
      const psdText = sortedLayers
        .map((tl) => tl.textInfo!.text.trim())
        .filter(Boolean)
        .join("\n\n");

      const textPageNums = getTextPageNumbers(currentFileIndex, diffSplitMode);
      const loadedParts: string[] = [];
      const loadedBlocksArr: { text: string; assignedFont?: string }[] = [];
      const deletedTexts = new Set<string>();
      if (textPages.length > 0) {
        for (const pn of textPageNums) {
          const page = textPages.find((p) => p.pageNumber === pn);
          if (page) {
            for (const b of page.blocks) {
              if (b.lines[0]?.startsWith("//")) {
                const stripped = [b.lines[0].slice(2), ...b.lines.slice(1)].join("\n");
                deletedTexts.add(normalizeTextForComparison(stripped));
              }
            }
            const activeBlocks = page.blocks.filter((b) => !(b.lines[0]?.startsWith("//")));
            loadedParts.push(activeBlocks.map((b) => b.lines.join("\n")).join("\n\n"));
            loadedBlocksArr.push(
              ...activeBlocks.map((b) => ({ text: b.lines.join("\n"), assignedFont: b.assignedFont })),
            );
          }
        }
      }
      let loadedText = loadedParts.join("\n\n");
      if (!loadedText && textContent.length > 0) {
        loadedText = textContent;
        loadedBlocksArr.push({ text: textContent });
      }
      if (!psdText || !loadedText) {
        setResults(null);
        return;
      }

      const psdLayerTexts = sortedLayers.map((tl) => ({
        layerName: tl.layerName,
        text: tl.textInfo!.text.trim(),
        fonts: tl.textInfo?.fonts || [],
      }));
      const loadedBlocks = loadedBlocksArr;

      const linkMap = new Map<number, number>();
      const usedBlocks = new Set<number>();
      for (let pi = 0; pi < psdLayerTexts.length; pi++) {
        const normP = normalizeTextForComparison(psdLayerTexts[pi].text);
        for (let bi = 0; bi < loadedBlocks.length; bi++) {
          if (usedBlocks.has(bi)) continue;
          const normB = normalizeTextForComparison(loadedBlocks[bi].text);
          if (normP === normB) {
            linkMap.set(pi, bi);
            usedBlocks.add(bi);
            break;
          }
        }
      }
      let nextBlock = 0;
      for (let pi = 0; pi < psdLayerTexts.length; pi++) {
        if (linkMap.has(pi)) continue;
        while (nextBlock < loadedBlocks.length && usedBlocks.has(nextBlock)) nextBlock++;
        if (nextBlock < loadedBlocks.length) {
          linkMap.set(pi, nextBlock);
          usedBlocks.add(nextBlock);
          nextBlock++;
        }
      }

      const deletedLayerIndices = new Set<number>();
      for (let pi = 0; pi < psdLayerTexts.length; pi++) {
        if (!linkMap.has(pi)) {
          const normP = normalizeTextForComparison(psdLayerTexts[pi].text);
          if (deletedTexts.has(normP)) deletedLayerIndices.add(pi);
        }
      }

      let hasDiff = false;
      for (let pi = 0; pi < psdLayerTexts.length; pi++) {
        if (deletedLayerIndices.has(pi)) continue;
        const bi = linkMap.get(pi);
        if (bi === undefined) { hasDiff = true; break; }
        const normP = normalizeTextForComparison(psdLayerTexts[pi].text);
        const normB = normalizeTextForComparison(loadedBlocks[bi].text);
        if (normP !== normB) { hasDiff = true; break; }
      }
      if (!hasDiff) {
        for (let bi = 0; bi < loadedBlocks.length; bi++) {
          if (![...linkMap.values()].includes(bi)) { hasDiff = true; break; }
        }
      }

      let unifiedEntries: UnifiedDiffEntry[] = [];
      if (hasDiff) {
        const { psd: psdParts, memo: memoParts } = computeLineSetDiff(psdText, loadedText);
        unifiedEntries = buildUnifiedDiff(psdParts, memoParts);
      }

      setResults({
        psdText: psdText.trim(),
        loadedText: loadedText.trim(),
        hasDiff,
        unifiedEntries,
        psdLayerTexts,
        loadedBlocks,
        linkMap,
        deletedLayerIndices,
      });
    } catch (e) {
      console.error("Text diff computation error:", e);
      setResults(null);
    }
  }, [textLayers, textContent, textPages, currentFileIndex, metadata, diffSplitMode]);

  return results;
}

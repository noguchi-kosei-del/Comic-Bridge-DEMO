/**
 * リンクグループのフォントサイズ検証
 *
 * Photoshopのレイヤーリンク機能で関連付けられたテキストレイヤー群について、
 * フォントサイズが「同一」または「片方がもう片方のぴったり半分」になっているかを検証する。
 * そのいずれでもない場合（= ルビの割合が不自然）を警告として返す。
 */
import type { PsdFile, LayerNode, TextInfo } from "../types";

export interface LinkGroupMember {
  fileName: string;
  layerName: string;
  text: string;
  fontSize: number;
}

export interface LinkGroupSizeIssue {
  fileName: string;
  linkGroup: number;
  members: LinkGroupMember[];
  /** 最大サイズ */
  maxSize: number;
  /** 最小サイズ */
  minSize: number;
  /** 比率（maxSize / minSize） */
  ratio: number;
  /** 問題の種類: "mixed" = 同一でも半分でもない */
  issue: "mixed";
}

// 誤差ゼロ判定（浮動小数点演算の丸めノイズを吸収する最小epsilonのみ許容）
const FLOAT_EPSILON = 0.001; // 実質的な「誤差ゼロ」
const RATIO_HALF = 2.0;

function approxEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function collectTextLayersWithLinkGroup(
  layers: LayerNode[],
  out: Array<{ name: string; textInfo: TextInfo; linkGroup: number }>,
): void {
  for (const layer of layers) {
    if (
      layer.type === "text" &&
      layer.visible &&
      layer.textInfo &&
      typeof layer.linkGroup === "number" &&
      layer.linkGroup > 0 &&
      layer.linkGroupEnabled !== false
    ) {
      out.push({ name: layer.name, textInfo: layer.textInfo, linkGroup: layer.linkGroup });
    }
    if (layer.children) collectTextLayersWithLinkGroup(layer.children, out);
  }
}

/**
 * ファイル群からリンクグループを抽出し、フォントサイズ検証を行う。
 * 「同一」または「片方が半分」のいずれかに該当しないグループのみ返却。
 */
export function checkLinkGroupFontSizes(files: PsdFile[]): LinkGroupSizeIssue[] {
  const issues: LinkGroupSizeIssue[] = [];
  for (const file of files) {
    if (!file.metadata?.layerTree) continue;
    const textLayers: Array<{ name: string; textInfo: TextInfo; linkGroup: number }> = [];
    collectTextLayersWithLinkGroup(file.metadata.layerTree, textLayers);
    if (textLayers.length < 2) continue;

    // グループ化
    const byGroup = new Map<number, typeof textLayers>();
    for (const tl of textLayers) {
      const arr = byGroup.get(tl.linkGroup) || [];
      arr.push(tl);
      byGroup.set(tl.linkGroup, arr);
    }

    for (const [groupId, members] of byGroup) {
      if (members.length < 2) continue; // 単独はリンクとして意味なし

      // 各メンバーの代表フォントサイズ（最大値を使用: 本文側を拾う意図）
      const memberData: LinkGroupMember[] = members
        .filter((m) => m.textInfo.fontSizes.length > 0)
        .map((m) => ({
          fileName: file.fileName,
          layerName: m.name,
          text: m.textInfo.text,
          fontSize: Math.max(...m.textInfo.fontSizes),
        }));

      if (memberData.length < 2) continue;

      const sizes = memberData.map((m) => m.fontSize);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);

      // 全員同じサイズか？（誤差ゼロのみスルー）
      const allEqual = sizes.every((s) => approxEqual(s, maxSize, FLOAT_EPSILON));
      if (allEqual) continue;

      // 最大/最小のみで判定: きっかり1:2関係か？（誤差ゼロのみスルー）
      const ratio = maxSize / minSize;
      const isExactlyHalf = approxEqual(ratio, RATIO_HALF, FLOAT_EPSILON);

      // さらに全メンバーが maxSize か minSize のどちらかにぴったり属するかもチェック
      const allAreBigOrSmall =
        isExactlyHalf &&
        sizes.every(
          (s) =>
            approxEqual(s, maxSize, FLOAT_EPSILON) ||
            approxEqual(s, minSize, FLOAT_EPSILON),
        );

      if (isExactlyHalf && allAreBigOrSmall) continue;

      issues.push({
        fileName: file.fileName,
        linkGroup: groupId,
        members: memberData,
        maxSize,
        minSize,
        ratio,
        issue: "mixed",
      });
    }
  }
  return issues;
}

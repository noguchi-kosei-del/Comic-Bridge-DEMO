/**
 * ProofreadPanel — 校正JSON表示パネル。
 * UnifiedViewer / TextEditorView から共通利用。state は useScopedViewerStore を直接参照。
 *
 * モード:
 *  - correctness: 正誤のみ（単一列）
 *  - proposal:    提案のみ（単一列）
 *  - both:        正誤 | 提案 の 2 カラム並列表示（ProGen の parallel view 準拠）
 */
import { useMemo } from "react";
import { useScopedViewerStore } from "../../../store/unifiedViewerStore";
import { useViewStore } from "../../../store/viewStore";
import {
  CATEGORY_COLORS,
  getCategoryColorIndex,
  type ProofreadingCheckItem,
} from "../../../types/typesettingCheck";

interface ProofreadPanelProps {
  /** ページ連動: 項目クリックで指定ページへ移動 */
  pageSync?: boolean;
  navigateToTextPage?: (pageNumber: number) => void;
}

function ItemRow({
  item,
  pageSync,
  navigateToTextPage,
}: {
  item: ProofreadingCheckItem;
  pageSync: boolean;
  navigateToTextPage?: (pageNumber: number) => void;
}) {
  const colorIdx = getCategoryColorIndex(item.category);
  const color = colorIdx >= 0 ? CATEGORY_COLORS[colorIdx] : "#888";
  return (
    <div
      className="px-3 py-2 hover:bg-bg-tertiary/40 transition-colors text-xs cursor-pointer"
      onClick={() => {
        if (pageSync && item.page && navigateToTextPage) {
          const pn = parseInt(item.page, 10);
          if (!isNaN(pn) && pn > 0) navigateToTextPage(pn);
        }
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {item.category || "—"}
        </span>
        {item.page && <span className="text-text-muted/60 text-[10px]">p.{item.page}</span>}
        <span
          className={`text-[10px] ${
            item.checkKind === "correctness" ? "text-error" : "text-accent-secondary"
          }`}
        >
          {item.checkKind === "correctness" ? "正誤" : "提案"}
        </span>
      </div>
      {item.excerpt && <div className="text-text-secondary mt-0.5 font-mono">{item.excerpt}</div>}
      {item.content && <div className="text-text-muted mt-0.5">{item.content}</div>}
    </div>
  );
}

function Column({
  title,
  titleClass,
  items,
  pageSync,
  navigateToTextPage,
}: {
  title: string;
  titleClass: string;
  items: ProofreadingCheckItem[];
  pageSync: boolean;
  navigateToTextPage?: (pageNumber: number) => void;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div
        className={`flex-shrink-0 px-2 py-1 border-b border-border/30 flex items-center gap-1 text-[10px] ${titleClass}`}
      >
        <span className="font-medium">{title}</span>
        <span className="text-text-muted/70">({items.length})</span>
      </div>
      <div className="flex-1 overflow-auto divide-y divide-border/30">
        {items.length === 0 ? (
          <div className="p-3 text-center text-text-muted/60 text-[10px]">該当なし</div>
        ) : (
          items.map((item, i) => (
            <ItemRow key={i} item={item} pageSync={pageSync} navigateToTextPage={navigateToTextPage} />
          ))
        )}
      </div>
    </div>
  );
}

export function ProofreadPanel({ pageSync = false, navigateToTextPage }: ProofreadPanelProps) {
  const checkData = useScopedViewerStore((s) => s.checkData);
  const checkTabMode = useScopedViewerStore((s) => s.checkTabMode);
  const setCheckTabMode = useScopedViewerStore((s) => s.setCheckTabMode);
  const setJsonBrowserMode = useViewStore((s) => s.setJsonBrowserMode);

  const correctnessItems = useMemo(() => checkData?.correctnessItems ?? [], [checkData]);
  const proposalItems = useMemo(() => checkData?.proposalItems ?? [], [checkData]);

  const noData = !checkData;

  return (
    <div className="flex flex-col h-full">
      {/* Check mode toggle */}
      <div className="flex-shrink-0 px-2 py-1 border-b border-border/30 flex items-center gap-0.5 text-[10px]">
        {(["correctness", "proposal", "both"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setCheckTabMode(m)}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              checkTabMode === m ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {m === "correctness" ? "正誤" : m === "proposal" ? "提案" : "全て"}
          </button>
        ))}
      </div>

      {noData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-text-muted p-4 text-center">
          <p className="text-xs">校正チェックJSONを読み込んでください</p>
          <button
            onClick={() => setJsonBrowserMode("check")}
            className="px-3 py-1.5 text-[11px] font-medium text-white bg-gradient-to-r from-accent to-accent-secondary rounded-lg"
          >
            JSON読込
          </button>
        </div>
      ) : checkTabMode === "both" ? (
        // ─── 2カラム並列表示（ProGen の parallel view 準拠） ───
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col border-r border-border/30">
            <Column
              title="✅ 正誤チェック"
              titleClass="text-error bg-error/5"
              items={correctnessItems}
              pageSync={pageSync}
              navigateToTextPage={navigateToTextPage}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <Column
              title="📝 提案チェック"
              titleClass="text-accent-secondary bg-accent-secondary/5"
              items={proposalItems}
              pageSync={pageSync}
              navigateToTextPage={navigateToTextPage}
            />
          </div>
        </div>
      ) : (
        // ─── 単一リスト (correctness only / proposal only) ───
        <div className="flex-1 overflow-auto divide-y divide-border/30">
          {(checkTabMode === "correctness" ? correctnessItems : proposalItems).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted p-4 text-center">
              <p className="text-xs">該当する項目がありません</p>
            </div>
          ) : (
            (checkTabMode === "correctness" ? correctnessItems : proposalItems).map((item, i) => (
              <ItemRow
                key={i}
                item={item}
                pageSync={pageSync}
                navigateToTextPage={navigateToTextPage}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

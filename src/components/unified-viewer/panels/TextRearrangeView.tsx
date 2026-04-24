/**
 * TextRearrangeView — ProGen の COMIC-POT セリフ並び替えツール（cpRenderSelectMode）の React 移植。
 * テキストを dialogue / separator のチャンクに分割して表示し、
 * クリックで選択（黄色ハイライト） / ドラッグ&ドロップで順序入れ替え / 選択削除 に対応する。
 *
 * - props.textContent を解析してチャンクを生成
 * - 入れ替え / 削除時は reconstructTextFromChunks で再構築して onChange で上位に返す
 * - ProGen 側では select-mode 中はマウスクリックで選択、Up/Down で移動、Del で削除、
 *   ダブルクリックで編集モード入り、という UX。
 */
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
import {
  parseTextToChunks,
  reconstructTextFromChunks,
  extractComicPotHeader,
  type TextChunk,
} from "../utils";

interface Props {
  textContent: string;
  onChange: (next: string) => void;
  onRequestEditMode?: () => void; // ダブルクリック等で編集モードへ戻る
}

type DropPos = "before" | "after";

export function TextRearrangeView({ textContent, onChange, onRequestEditMode }: Props) {
  const header = useMemo(() => extractComicPotHeader(textContent), [textContent]);
  const chunks = useMemo<TextChunk[]>(() => parseTextToChunks(textContent), [textContent]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPos>("before");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // 選択行を画面内に収める
  useEffect(() => {
    if (selectedIndex === null) return;
    const el = itemRefs.current.get(selectedIndex);
    const wrap = containerRef.current;
    if (!el || !wrap) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const scrollTop = wrap.scrollTop;
    const viewH = wrap.clientHeight;
    if (elTop < scrollTop) wrap.scrollTop = elTop - 20;
    else if (elBottom > scrollTop + viewH) wrap.scrollTop = elBottom - viewH + 20;
  }, [selectedIndex]);

  const commitChunks = useCallback(
    (next: TextChunk[], nextSelected: number | null) => {
      onChange(reconstructTextFromChunks(next, header));
      setSelectedIndex(nextSelected);
    },
    [header, onChange],
  );

  const moveUp = useCallback(() => {
    if (selectedIndex === null || selectedIndex === 0) return;
    const next = [...chunks];
    const m = next.splice(selectedIndex, 1)[0];
    next.splice(selectedIndex - 1, 0, m);
    commitChunks(next, selectedIndex - 1);
  }, [chunks, selectedIndex, commitChunks]);

  const moveDown = useCallback(() => {
    if (selectedIndex === null || selectedIndex >= chunks.length - 1) return;
    const next = [...chunks];
    const m = next.splice(selectedIndex, 1)[0];
    next.splice(selectedIndex + 1, 0, m);
    commitChunks(next, selectedIndex + 1);
  }, [chunks, selectedIndex, commitChunks]);

  const deleteSelected = useCallback(() => {
    if (selectedIndex === null) return;
    const cur = chunks[selectedIndex];
    if (!cur || cur.type === "separator") return;
    const next = [...chunks];
    const delIdx = selectedIndex;
    next.splice(delIdx, 1);
    // 隣接する dialogue を再選択
    let newSel: number | null = null;
    for (let i = delIdx - 1; i >= 0; i--) {
      if (next[i]?.type === "dialogue") { newSel = i; break; }
    }
    if (newSel === null) {
      for (let i = Math.min(delIdx, next.length - 1); i < next.length; i++) {
        if (next[i]?.type === "dialogue") { newSel = i; break; }
      }
    }
    commitChunks(next, newSel);
  }, [chunks, selectedIndex, commitChunks]);

  const selectPrev = useCallback(() => {
    if (chunks.length === 0) return;
    const start = selectedIndex === null ? chunks.length : selectedIndex;
    for (let i = start - 1; i >= 0; i--) {
      if (chunks[i].type === "dialogue") { setSelectedIndex(i); return; }
    }
  }, [chunks, selectedIndex]);

  const selectNext = useCallback(() => {
    if (chunks.length === 0) return;
    const start = selectedIndex === null ? -1 : selectedIndex;
    for (let i = start + 1; i < chunks.length; i++) {
      if (chunks[i].type === "dialogue") { setSelectedIndex(i); return; }
    }
  }, [chunks, selectedIndex]);

  // キーボードショートカット（この View がフォーカスを受けた状態で有効）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) moveUp();
      else selectPrev();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) moveDown();
      else selectNext();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === "Escape") {
      setSelectedIndex(null);
    }
  };

  // ─── ドラッグ & ドロップ ──────────────────────────────
  const onDragStart = (e: React.DragEvent, index: number) => {
    if (chunks[index].type === "separator") {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // 空の payload を必ずセット（Firefox 対策）
    try { e.dataTransfer.setData("text/plain", ""); } catch { /* noop */ }
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition("before");
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null) return;
    e.preventDefault();
    if (draggedIndex === index) {
      if (dragOverIndex !== null) {
        setDragOverIndex(null);
        setDropPosition("before");
      }
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pos: DropPos = y < rect.height / 2 ? "before" : "after";
    if (dragOverIndex !== index || dropPosition !== pos) {
      setDragOverIndex(index);
      setDropPosition(pos);
      e.dataTransfer.dropEffect = "move";
    }
  };

  const onDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null || draggedIndex === dropIdx) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      setDropPosition("before");
      return;
    }
    const next = [...chunks];
    const dragged = next[draggedIndex];
    next.splice(draggedIndex, 1);
    let insertIdx = dropIdx;
    if (dropPosition === "after") insertIdx = dropIdx + 1;
    if (draggedIndex < dropIdx) insertIdx -= 1;
    if (dropIdx === chunks.length - 1 && dropPosition === "after") insertIdx = next.length;
    insertIdx = Math.max(0, Math.min(insertIdx, next.length));
    next.splice(insertIdx, 0, dragged);
    commitChunks(next, insertIdx);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition("before");
  };

  // ルビ表記ハイライト（COMIC-POT 形式 [親](ふりがな) を強調）
  const renderChunkContent = (c: TextChunk) => {
    if (c.type === "separator") return c.content;
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(c.content)) !== null) {
      if (m.index > lastIdx) {
        nodes.push(c.content.substring(lastIdx, m.index));
      }
      nodes.push(
        <span key={`r-${key++}`} className="bg-accent/15 text-accent-secondary rounded-sm">{m[1]}</span>,
      );
      nodes.push(
        <span key={`a-${key++}`} className="text-text-muted text-[10px]">({m[2]})</span>,
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < c.content.length) {
      nodes.push(c.content.substring(lastIdx));
    }
    if (nodes.length === 0) return "";
    return nodes;
  };

  const selectedChunk = selectedIndex !== null ? chunks[selectedIndex] : null;
  const hasDialogueSel = !!selectedChunk && selectedChunk.type === "dialogue";
  const dialogueCount = chunks.filter((c) => c.type === "dialogue").length;
  const dialogueNumber = (() => {
    if (selectedIndex === null) return null;
    let n = 0;
    for (let i = 0; i <= selectedIndex; i++) {
      if (chunks[i]?.type === "dialogue") n++;
    }
    return n;
  })();

  const toolbar = (
    <div className="flex-shrink-0 px-1.5 py-1 border-b border-border/30 flex items-center gap-1 text-[10px]">
      <button
        onClick={moveUp}
        disabled={!hasDialogueSel || selectedIndex === 0}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors disabled:opacity-30"
        title="選択セリフを上へ (Ctrl+↑)"
      >
        <ArrowUp className="w-3 h-3" strokeWidth={2} />上へ
      </button>
      <button
        onClick={moveDown}
        disabled={!hasDialogueSel || selectedIndex === chunks.length - 1}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors disabled:opacity-30"
        title="選択セリフを下へ (Ctrl+↓)"
      >
        <ArrowDown className="w-3 h-3" strokeWidth={2} />下へ
      </button>
      <button
        onClick={deleteSelected}
        disabled={!hasDialogueSel}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-error hover:bg-bg-tertiary/60 transition-colors disabled:opacity-30"
        title="選択セリフを削除 (Del)"
      >
        <Trash2 className="w-3 h-3" strokeWidth={2} />削除
      </button>
      {onRequestEditMode && (
        <button
          onClick={() => onRequestEditMode()}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
          title="テキスト編集モードへ"
        >
          <Pencil className="w-3 h-3" strokeWidth={2} />編集
        </button>
      )}
      <div className="flex-1" />
      <span className="text-text-muted text-[9px]">
        {dialogueCount} セリフ
        {hasDialogueSel && dialogueNumber !== null && ` / 選択中: ${dialogueNumber}`}
      </span>
    </div>
  );

  if (chunks.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 flex items-center justify-center text-text-muted text-xs select-none p-6 text-center">
          <div>
            <p>並び替え対象のチャンクがありません。</p>
            <p className="mt-1 opacity-60">テキストを読み込むか、「編集」モードに切り替えて入力してください。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 w-full overflow-auto p-2 outline-none focus:ring-1 focus:ring-accent/30"
        onClick={(e) => {
          // 空白クリックで選択解除
          if (e.target === e.currentTarget) setSelectedIndex(null);
        }}
        onDoubleClick={() => onRequestEditMode?.()}
      >
      <pre
        className="m-0 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text-primary"
        style={{ cursor: draggedIndex !== null ? "grabbing" : undefined }}
      >
        {chunks.map((chunk, index) => {
          const nodes: React.ReactNode[] = [];
          if (index > 0) {
            const prev = chunks[index - 1];
            nodes.push(
              <span key={`gap-${index}`}>
                {prev.type === "separator" || chunk.type === "separator" ? "\n" : "\n\n"}
              </span>,
            );
          }
          if (dragOverIndex === index && draggedIndex !== null && dropPosition === "before") {
            nodes.push(<span key={`ind-b-${index}`} className="block h-[3px] my-[2px] mx-2 rounded-sm bg-accent shadow-[0_0_6px_rgba(var(--accent-rgb,59,130,246),0.5)]" />);
          }
          const isSep = chunk.type === "separator";
          const isSelected = selectedIndex === index && !isSep;
          const isDragging = draggedIndex === index;
          const isDeleted = !isSep && chunk.content.trim().startsWith("//");
          const baseCls = [
            "inline rounded-sm px-0.5 transition-[background-color,opacity] duration-150",
            isSep
              ? "text-accent-secondary font-semibold cursor-default"
              : "cursor-grab hover:bg-bg-tertiary/70",
            isSelected ? "!bg-yellow-300 !text-black" : "",
            isDragging ? "opacity-30 scale-[0.97]" : "",
            isDeleted ? "text-error line-through" : "",
          ].join(" ");
          nodes.push(
            <span
              key={`c-${index}`}
              ref={(el) => {
                if (el) itemRefs.current.set(index, el);
                else itemRefs.current.delete(index);
              }}
              data-index={index}
              className={baseCls}
              draggable={!isSep}
              title={isSep ? undefined : "ドラッグして移動 / クリックで選択 / ダブルクリックで編集"}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSep) setSelectedIndex(index);
              }}
              onDragStart={(e) => onDragStart(e, index)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
            >
              {renderChunkContent(chunk)}
            </span>,
          );
          if (dragOverIndex === index && draggedIndex !== null && dropPosition === "after") {
            nodes.push(<span key={`ind-a-${index}`} className="block h-[3px] my-[2px] mx-2 rounded-sm bg-accent shadow-[0_0_6px_rgba(var(--accent-rgb,59,130,246),0.5)]" />);
          }
          return nodes;
        })}
        {draggedIndex !== null && chunks.length > 0 && (
          <div
            className="h-12 w-full"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIndex(chunks.length);
              setDropPosition("after");
            }}
            onDragLeave={() => {
              setDragOverIndex(null);
              setDropPosition("before");
            }}
            onDrop={(e) => onDrop(e, chunks.length - 1)}
          >
            {dragOverIndex === chunks.length && (
              <span className="block h-[3px] my-1 mx-2 rounded-sm bg-accent shadow-[0_0_6px_rgba(var(--accent-rgb,59,130,246),0.5)]" />
            )}
          </div>
        )}
      </pre>
      </div>
    </div>
  );
}

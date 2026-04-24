/**
 * TextEditorDropPanel — .txt ファイルを D&D またはファイル選択で読み込み、textarea で編集するパネル。
 * ProGen-tauri の cpEditTextArea 相当（ファイル開く / 保存 / コピー / 削除マーク / ルビ付け）の移植。
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { FileText, FolderOpen, Copy as CopyIcon, Save as SaveIcon, FilePlus, Trash2, Pencil, ArrowUpDown } from "lucide-react";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useScopedViewerStore } from "../../../store/unifiedViewerStore";
import { showPromptDialog } from "../../../store/viewStore";
import { parseComicPotText } from "../utils";
import { TextRearrangeView } from "./TextRearrangeView";

type EditorMode = "edit" | "rearrange";

const REPARSE_DEBOUNCE_MS = 500;

export function TextEditorDropPanel() {
  const textContent = useScopedViewerStore((s) => s.textContent);
  const textFilePath = useScopedViewerStore((s) => s.textFilePath);
  const isDirty = useScopedViewerStore((s) => s.isDirty);
  const setTextContent = useScopedViewerStore((s) => s.setTextContent);
  const setTextHeader = useScopedViewerStore((s) => s.setTextHeader);
  const setTextPages = useScopedViewerStore((s) => s.setTextPages);
  const setTextFilePath = useScopedViewerStore((s) => s.setTextFilePath);
  const setIsDirty = useScopedViewerStore((s) => s.setIsDirty);

  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("edit");
  const reparseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const displayName = (() => {
    if (textFilePath) {
      const parts = textFilePath.split(/[\\/]/);
      return parts[parts.length - 1] || textFilePath;
    }
    return droppedFileName;
  })();

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 1800);
  };

  const normalizeNewlines = (s: string) => {
    let t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (t.charCodeAt(0) === 0xfeff) t = t.substring(1); // strip BOM
    return t;
  };

  const applyContent = (raw: string) => {
    const normalized = normalizeNewlines(raw);
    setTextContent(normalized);
    const { header, pages } = parseComicPotText(normalized);
    setTextHeader(header);
    setTextPages(pages);
    setIsDirty(true);
    return normalized;
  };

  const schedReparse = (raw: string) => {
    if (reparseTimer.current) clearTimeout(reparseTimer.current);
    reparseTimer.current = setTimeout(() => {
      const { header, pages } = parseComicPotText(raw);
      setTextHeader(header);
      setTextPages(pages);
    }, REPARSE_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (reparseTimer.current) clearTimeout(reparseTimer.current);
    };
  }, []);

  // ─── ファイル D&D ────────────────────────────────────────
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".txt"),
    );
    if (files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      applyContent(text);
      setDroppedFileName(file.name);
      setTextFilePath(null); // webview D&D は path 不明 → 別名保存フロー
      flashNotice(`読み込み: ${file.name}`);
    } catch (err) {
      console.error("Failed to read dropped txt:", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  };

  // ─── ファイル選択ダイアログ ───────────────────────────────
  const handleOpenFile = async () => {
    try {
      const picked = await dialogOpen({
        filters: [{ name: "テキスト", extensions: ["txt"] }],
        multiple: false,
      });
      if (!picked || Array.isArray(picked)) return;
      const path = picked as string;
      const bytes = await readFile(path);
      const content = new TextDecoder("utf-8").decode(bytes);
      applyContent(content);
      setTextFilePath(path);
      const name = path.replace(/\\/g, "/").split("/").pop() || "";
      setDroppedFileName(null);
      flashNotice(`開きました: ${name}`);
      // 保存済み状態にする（開いた直後は未変更）
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to open txt:", err);
    }
  };

  // ─── コピー ───────────────────────────────────────────────
  const handleCopy = async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      flashNotice("コピーしました");
    } catch (err) {
      console.error("copy failed:", err);
    }
  };

  // ─── 保存 ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!textContent) return;
    if (!textFilePath) {
      await handleSaveAs();
      return;
    }
    try {
      await invoke("write_text_file", { filePath: textFilePath, content: textContent });
      setIsDirty(false);
      flashNotice("保存しました");
    } catch (err) {
      console.error("save failed:", err);
    }
  };

  const handleSaveAs = async () => {
    if (!textContent) return;
    try {
      const path = await dialogSave({
        filters: [{ name: "テキスト", extensions: ["txt"] }],
        defaultPath: droppedFileName ?? textFilePath ?? undefined,
      });
      if (!path) return;
      await invoke("write_text_file", { filePath: path, content: textContent });
      setTextFilePath(path);
      setIsDirty(false);
      const name = (path as string).replace(/\\/g, "/").split("/").pop() || "";
      setDroppedFileName(null);
      flashNotice(`保存しました: ${name}`);
    } catch (err) {
      console.error("save-as failed:", err);
    }
  };

  const handleClear = () => {
    setTextContent("");
    setTextHeader([]);
    setTextPages([]);
    setTextFilePath(null);
    setDroppedFileName(null);
    setIsDirty(false);
  };

  // ─── 編集: 削除マーク (//) トグル ─────────────────────────
  const handleToggleDeleteMark = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const value = textContent;
    const { selectionStart, selectionEnd } = ta;
    const savedScrollTop = ta.scrollTop;
    // 選択範囲が含む行を特定
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    let lineEndIdx = value.indexOf("\n", selectionEnd);
    if (lineEndIdx === -1) lineEndIdx = value.length;
    const before = value.slice(0, lineStart);
    const target = value.slice(lineStart, lineEndIdx);
    const after = value.slice(lineEndIdx);
    const lines = target.split("\n");
    // すべての対象行が // で始まっていたら外す、そうでなければ付ける
    const allMarked = lines.every((l) => l.startsWith("//"));
    const newLines = allMarked
      ? lines.map((l) => l.slice(2))
      : lines.map((l) => (l.startsWith("//") ? l : `//${l}`));
    const newValue = before + newLines.join("\n") + after;
    setTextContent(newValue);
    schedReparse(newValue);
    setIsDirty(true);
    // カーソル/選択を維持（行頭追加分だけ補正）
    const delta = allMarked ? -2 : 2;
    const newStart = Math.max(lineStart, selectionStart + delta);
    const newEnd = selectionEnd + delta * lines.length;
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(newStart, newEnd);
      // setSelectionRange がカーソル位置へ自動スクロールしてしまうため、元のスクロール位置を復元
      t.scrollTop = savedScrollTop;
    });
  };

  // ─── 編集: ルビ付け（COMIC-POT 形式 親（ふりがな）） ────────
  const handleAddRuby = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    // プロンプトダイアログを await する前にスクロール位置・選択範囲を保存しておく
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const savedScrollTop = ta.scrollTop;
    const sel = textContent.slice(selStart, selEnd);
    if (!sel.trim()) {
      flashNotice("ルビを付ける文字を選択してください");
      return;
    }
    const ruby = await showPromptDialog(`「${sel}」のふりがなを入力`, "");
    if (!ruby) return;
    const replacement = `${sel}（${ruby}）`;
    const newValue = textContent.slice(0, selStart) + replacement + textContent.slice(selEnd);
    setTextContent(newValue);
    schedReparse(newValue);
    setIsDirty(true);
    const newCaret = selStart + replacement.length;
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(newCaret, newCaret);
      // ダイアログ復帰後の focus / setSelectionRange で自動スクロールが走るので元位置へ戻す
      t.scrollTop = savedScrollTop;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setTextContent(v);
    setIsDirty(true);
    schedReparse(v);
  };

  // クリックで propagation 止める（ドロップ領域の handler に食われないように）
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ─── Toolbar row 1: file ops ─── */}
      <div className="flex-shrink-0 px-1.5 py-1 border-b border-border/30 flex items-center gap-1 text-[10px]">
        <button
          onClick={(e) => { stop(e); handleOpenFile(); }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
          title="TXT ファイルを開く"
        >
          <FolderOpen className="w-3 h-3" strokeWidth={2} />開く
        </button>
        <button
          onClick={(e) => { stop(e); handleSave(); }}
          disabled={!textContent}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors disabled:opacity-40"
          title={textFilePath ? `上書き保存: ${textFilePath}` : "保存（別名保存にフォールバック）"}
        >
          <SaveIcon className="w-3 h-3" strokeWidth={2} />保存
        </button>
        <button
          onClick={(e) => { stop(e); handleSaveAs(); }}
          disabled={!textContent}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors disabled:opacity-40"
          title="別名保存"
        >
          <FilePlus className="w-3 h-3" strokeWidth={2} />別名
        </button>
        <button
          onClick={(e) => { stop(e); handleCopy(); }}
          disabled={!textContent}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors disabled:opacity-40"
          title="全文コピー"
        >
          <CopyIcon className="w-3 h-3" strokeWidth={2} />コピー
        </button>
        <div className="flex-1" />
        {textContent && (
          <button
            onClick={(e) => { stop(e); handleClear(); }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-error hover:bg-bg-tertiary/60 transition-colors"
            title="内容をクリア"
          >
            <Trash2 className="w-3 h-3" strokeWidth={2} />クリア
          </button>
        )}
      </div>

      {/* ─── Filename row ─── */}
      <div className="flex-shrink-0 px-2 py-0.5 border-b border-border/30 flex items-center gap-1.5 text-[10px]">
        <FileText className="w-3 h-3 text-text-muted flex-shrink-0" strokeWidth={2} />
        <span className="text-text-secondary truncate flex-1" title={textFilePath ?? droppedFileName ?? ""}>
          {displayName || "未読込 — 「開く」または .txt をドロップ"}
        </span>
        {isDirty && <span className="text-warning text-[9px]" title="未保存">●</span>}
        {notice && <span className="text-accent text-[9px]">{notice}</span>}
      </div>

      {/* ─── Toolbar row 2: editing (要テキスト) ─── */}
      {textContent && (
        <div className="flex-shrink-0 px-1.5 py-1 border-b border-border/30 flex items-center gap-1 text-[10px]">
          {/* モード切替（編集 / 並び替え） */}
          <div className="inline-flex items-center bg-bg-tertiary/50 rounded p-0.5">
            <button
              onClick={(e) => { stop(e); setMode("edit"); }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                mode === "edit" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              }`}
              title="テキスト編集（textarea）"
            >
              <Pencil className="w-3 h-3" strokeWidth={2} />編集
            </button>
            <button
              onClick={(e) => { stop(e); setMode("rearrange"); }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                mode === "rearrange" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
              }`}
              title="セリフ並び替え（ProGen 互換）"
            >
              <ArrowUpDown className="w-3 h-3" strokeWidth={2} />並び替え
            </button>
          </div>
          <div className="w-px h-4 bg-border/50 mx-1" />
          {mode === "edit" && (
            <>
              <button
                onClick={(e) => { stop(e); handleToggleDeleteMark(); }}
                className="px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors font-mono"
                title="選択行 / カーソル行の先頭に // を付け外し（削除マーク）"
              >
                // 削除マーク
              </button>
              <button
                onClick={(e) => { stop(e); handleAddRuby(); }}
                className="px-1.5 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
                title="選択文字にふりがなを付与（COMIC-POT 形式: 親（ふりがな））"
              >
                ルビ付け
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Editor / Drop area ─── */}
      <div className="flex-1 relative overflow-hidden">
        {textContent.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 text-center text-text-muted text-xs select-none pointer-events-none">
            <div>
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" strokeWidth={1.5} />
              <p>
                ここに <code className="px-1 rounded bg-bg-tertiary/60">.txt</code> ファイルをドロップ
              </p>
              <p className="mt-1 opacity-60">または上部の「開く」ボタン（UTF-8）</p>
            </div>
          </div>
        ) : mode === "rearrange" ? (
          <TextRearrangeView
            textContent={textContent}
            onChange={(next) => {
              setTextContent(next);
              setIsDirty(true);
              schedReparse(next);
            }}
            onRequestEditMode={() => setMode("edit")}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={textContent}
            onChange={handleChange}
            spellCheck={false}
            className="w-full h-full resize-none bg-bg-primary text-text-primary text-xs leading-relaxed p-2 outline-none font-mono whitespace-pre"
            placeholder="テキスト内容..."
          />
        )}

        {isDragOver && (
          <div className="absolute inset-0 z-10 bg-accent/15 border-2 border-dashed border-accent/60 flex items-center justify-center pointer-events-none">
            <div className="bg-bg-secondary/90 px-4 py-2 rounded-lg text-xs text-accent font-medium">
              .txt をドロップして読み込み
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      {textContent && (
        <div className="flex-shrink-0 px-2 py-0.5 border-t border-border/30 flex items-center gap-2 text-[9px] text-text-muted">
          <span>{textContent.length.toLocaleString()} 文字</span>
          <span>/</span>
          <span>{textContent.split("\n").length.toLocaleString()} 行</span>
          {!textFilePath && isDirty && <span className="ml-auto text-warning">未保存 — 「別名」で保存</span>}
        </div>
      )}
    </div>
  );
}

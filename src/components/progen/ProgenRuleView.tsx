/**
 * ProGen ルール編集ビュー（Phase 1）
 * サイドバー（6カテゴリ）+ メインエリア（ルールカード/リスト）
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ScanText, Wand2, SpellCheck, Lightbulb, FileEdit } from "lucide-react";
import { readFile } from "@tauri-apps/plugin-fs";
import { useProgenStore } from "../../store/progenStore";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { EDIT_CATEGORIES, NUMBER_SUB_RULES } from "../../types/progen";
import type { SymbolRule, ProofRule } from "../../types/progen";
import { showPromptDialog } from "../../store/viewStore";
import { openExternalUrl } from "../../hooks/useProgenTauri";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";
import { useViewStore } from "../../store/viewStore";
import { generateSimpleCheckPrompt, generateVariationCheckPrompt, generateExtractionPrompt, generateFormattingPrompt } from "../../lib/progenPrompts";

// ═══ メインコンポーネント ═══

export function ProgenRuleView({ listMode = false }: { listMode?: boolean } = {}) {
  const store = useProgenStore();
  const [searchText, setSearchText] = useState("");

  // ── プロンプト生成共有 state（GeminiButtons から持ち上げ） ──
  const [copied, setCopied] = useState<string | null>(null);
  const [textSources, setTextSources] = useState<{ name: string; content: string }[]>([]);
  const [showTextPicker, setShowTextPicker] = useState<"correctness" | "proposal" | null>(null);
  const [browseDir, setBrowseDir] = useState("");
  const [browseFolders, setBrowseFolders] = useState<string[]>([]);
  const [browseFiles, setBrowseFiles] = useState<string[]>([]);

  const loadBrowseDir = useCallback(async (dir: string) => {
    try {
      const r = await invoke<{ folders: string[]; json_files: string[] }>("list_folder_contents", { folderPath: dir });
      setBrowseDir(dir);
      setBrowseFolders(r.folders || []);
      const allFiles = await invoke<string[]>("kenban_list_files_in_folder", { path: dir, extensions: ["txt"] }).catch(() => [] as string[]);
      const txtFiles = allFiles
        .map((f: string) => f.replace(/\//g, "\\").split("\\").pop() || "")
        .filter(Boolean);
      setBrowseFiles(txtFiles);
    } catch { setBrowseFolders([]); setBrowseFiles([]); }
  }, []);

  const showCopied = useCallback((msg: string) => { setCopied(msg); setTimeout(() => setCopied(null), 2000); }, []);
  const gemini = useCallback(() => openExternalUrl("https://gemini.google.com/app"), []);

  const extraction = useCallback(async () => {
    const prompt = generateExtractionPrompt(store.symbolRules, store.currentProofRules, store.options, store.numberRules);
    await navigator.clipboard.writeText(prompt); showCopied("抽出"); gemini();
    useProgenStore.getState().setResultSaveMode("text");
  }, [store, showCopied, gemini]);

  const formatting = useCallback(async () => {
    const prompt = generateFormattingPrompt(store.symbolRules, store.currentProofRules, store.options, store.numberRules);
    await navigator.clipboard.writeText(prompt); showCopied("整形"); gemini();
    useProgenStore.getState().setResultSaveMode("text");
  }, [store, showCopied, gemini]);

  const correctness = useCallback(async () => {
    const current = useUnifiedViewerStore.getState().textContent || "";
    const text = [current, textSources.map((s) => s.content).join("\n\n")].filter(Boolean).join("\n\n");
    if (!text) { setShowTextPicker("correctness"); return; }
    const prompt = generateSimpleCheckPrompt(text, store.symbolRules, store.currentProofRules, store.options, store.numberRules);
    await navigator.clipboard.writeText(prompt); showCopied("正誤"); gemini();
    useProgenStore.getState().setResultSaveMode("json");
  }, [store, textSources, showCopied, gemini]);

  const proposal = useCallback(async () => {
    const current = useUnifiedViewerStore.getState().textContent || "";
    const text = [current, textSources.map((s) => s.content).join("\n\n")].filter(Boolean).join("\n\n");
    if (!text) { setShowTextPicker("proposal"); return; }
    const prompt = generateVariationCheckPrompt(text, store.symbolRules, store.currentProofRules, store.options, store.numberRules);
    await navigator.clipboard.writeText(prompt); showCopied("提案"); gemini();
    useProgenStore.getState().setResultSaveMode("json");
  }, [store, textSources, showCopied, gemini]);

  // カテゴリ別ルール数
  const catCounts = useMemo(() => {
    const counts: Record<string, { active: number; total: number }> = {};
    for (const cat of EDIT_CATEGORIES) {
      if (cat.isSymbol) {
        const a = store.symbolRules.filter((r) => r.active).length;
        counts[cat.key] = { active: a, total: store.symbolRules.length };
      } else if (cat.isNumber) {
        counts[cat.key] = { active: store.numberRules.subRulesEnabled ? 4 : 1, total: 4 };
      } else {
        const rules = cat.subCategories
          ? store.currentProofRules.filter((r) => cat.subCategories!.includes(r.category))
          : store.currentProofRules.filter((r) => r.category === cat.key);
        const a = rules.filter((r) => r.active).length;
        counts[cat.key] = { active: a, total: rules.length };
      }
    }
    return counts;
  }, [store.symbolRules, store.currentProofRules, store.numberRules]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* サイドバー */}
      <div className="w-[272px] flex-shrink-0 border-r border-border/50 flex flex-col bg-bg-tertiary/30">
        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-3 gap-1.5 content-start">
          {EDIT_CATEGORIES.map((cat) => {
            const c = catCounts[cat.key];
            const isActive = store.currentEditCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => store.setCurrentEditCategory(cat.key)}
                className={`aspect-square px-1.5 py-2 text-[10px] rounded-lg border transition-colors flex flex-col items-center justify-center gap-1 ${
                  isActive
                    ? "bg-accent/15 text-accent border-accent/40 font-medium"
                    : "bg-bg-primary/60 text-text-secondary border-border/40 hover:text-text-primary hover:bg-bg-tertiary hover:border-border"
                }`}
              >
                <span className="text-base leading-none text-sky-500">{cat.icon}</span>
                <span className="leading-none text-center">{cat.name}</span>
                {c && <span className="text-[9px] text-text-muted tabular-nums leading-none">{c.active}/{c.total}</span>}
              </button>
            );
          })}
        </div>
        {/* 検索 */}
        <div className="flex-shrink-0 p-2 border-t border-border/30">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ルール検索..."
            className="w-full text-[9px] px-2 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50"
          />
        </div>
        {/* 保存ボタン */}
        <SaveButton />
      </div>

      {/* メインエリア */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 上部バー（左: テキストエディタへジャンプ / 右: ドロップダウン2つ） */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/30 bg-bg-tertiary/20 flex items-center gap-2">
          <button
            onClick={() => useViewStore.getState().slideToTextEditor()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg-secondary border border-border text-text-primary hover:bg-bg-elevated hover:border-accent/40 transition-colors inline-flex items-center gap-1.5"
            title="テキストエディタへ移動"
          >
            <FileEdit className="w-3.5 h-3.5" />
            テキストエディタ
          </button>

          {/* 右寄せ: ドロップダウン2つ */}
          <div className="flex-1" />
          <TextSourceDropdown
            textSources={textSources}
            setTextSources={setTextSources}
            setShowTextPicker={setShowTextPicker}
            loadBrowseDir={loadBrowseDir}
          />
          <ResultPasteDropdown />
        </div>

        {/* テキストフォルダブラウザモーダル */}
        {showTextPicker && browseDir && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTextPicker(null)}>
            <div className="bg-bg-secondary rounded-xl shadow-2xl w-[400px] max-h-[60vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-tertiary/30">
                <span className="text-[10px] font-medium text-text-primary truncate flex-1">{browseDir.split(/[/\\]/).pop()}</span>
                <button onClick={() => setShowTextPicker(null)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
              <div className="flex-1 overflow-auto">
                <button
                  onClick={() => { const parent = browseDir.replace(/[/\\][^/\\]+$/, ""); if (parent && parent !== browseDir) loadBrowseDir(parent); }}
                  className="w-full px-3 py-1.5 text-left text-[10px] text-text-secondary hover:bg-bg-tertiary/50 flex items-center gap-1"
                >← 上へ</button>
                {browseFolders.map((f) => (
                  <button key={f} onClick={() => loadBrowseDir(`${browseDir}/${f}`)} className="w-full px-3 py-1.5 text-left text-[10px] text-text-primary hover:bg-bg-tertiary/50 flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-folder" /> {f}
                  </button>
                ))}
                {browseFiles.filter((f) => f.endsWith(".txt")).map((f) => {
                  const fullPath = `${browseDir}/${f}`;
                  const isChecked = textSources.some((s) => s.name === f);
                  return (
                    <label key={f} className="w-full px-3 py-1.5 text-left text-[10px] hover:bg-accent/5 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={async () => {
                          if (isChecked) {
                            setTextSources((prev) => prev.filter((s) => s.name !== f));
                          } else {
                            try {
                              const content = await invoke<string>("read_text_file", { filePath: fullPath });
                              setTextSources((prev) => [...prev, { name: f, content }]);
                            } catch { /* ignore */ }
                          }
                        }}
                        className="accent-accent w-3 h-3 flex-shrink-0"
                      />
                      <span className={isChecked ? "text-accent font-medium" : "text-text-primary"}>{f}</span>
                    </label>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-border flex items-center gap-2">
                <span className="text-[9px] text-text-muted">{textSources.length}件追加</span>
                <div className="flex-1" />
                <button onClick={() => setShowTextPicker(null)} className="px-3 py-1 text-[9px] font-medium text-white bg-accent rounded hover:bg-accent/90">完了</button>
              </div>
            </div>
          </div>
        )}

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto p-3">
          {store.currentEditCategory === "symbol" ? (
            <SymbolRulePanel searchText={searchText} listMode={listMode} />
          ) : store.currentEditCategory === "number" ? (
            <NumberRulePanel />
          ) : (
            <ProofRulePanel category={store.currentEditCategory} searchText={searchText} listMode={listMode} />
          )}
        </div>

        {/* 下部: プロンプト生成ボタン（大きな横一列） */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-border/30 bg-bg-tertiary/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-text-muted">プロンプト生成</span>
            {copied && <span className="text-[11px] text-success font-medium">{copied} コピー済</span>}
          </div>
          <div className="flex items-stretch gap-3">
            <button
              onClick={extraction}
              className="flex-1 h-14 px-4 text-base font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            >
              <ScanText className="w-5 h-5" />
              抽出
            </button>
            <button
              onClick={formatting}
              className="flex-1 h-14 px-4 text-base font-bold text-white bg-blue-500 rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            >
              <Wand2 className="w-5 h-5" />
              整形
            </button>
            <button
              onClick={correctness}
              className="flex-1 h-14 px-4 text-base font-bold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            >
              <SpellCheck className="w-5 h-5" />
              正誤
            </button>
            <button
              onClick={proposal}
              className="flex-1 h-14 px-4 text-base font-bold text-white bg-orange-500 rounded-xl hover:bg-orange-600 active:scale-[0.98] transition-all shadow-sm hover:shadow-md inline-flex items-center justify-center gap-2"
            >
              <Lightbulb className="w-5 h-5" />
              提案
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ 記号ルールパネル ═══

function SymbolRulePanel({ searchText, listMode }: { searchText: string; listMode: boolean }) {
  const { symbolRules, toggleSymbolRule, addSymbolRule, updateSymbolRule, deleteSymbolRule } = useProgenStore();
  const [addSrc, setAddSrc] = useState("");
  const [addDst, setAddDst] = useState("");
  const [addNote, setAddNote] = useState("");

  const filtered = useMemo(() => {
    if (!searchText) return symbolRules;
    const q = searchText.toLowerCase();
    return symbolRules.filter((r) => `${r.src}${r.dst}${r.note}`.toLowerCase().includes(q));
  }, [symbolRules, searchText]);

  const handleEdit = useCallback(async (index: number, rule: SymbolRule) => {
    const src = await showPromptDialog("変換前", rule.src);
    if (!src) return;
    const dst = await showPromptDialog("変換後", rule.dst);
    if (dst === null) return;
    const note = await showPromptDialog("備考", rule.note);
    updateSymbolRule(index, { src, dst: dst || "", note: note || "" });
  }, [updateSymbolRule]);

  // ─── 一覧モード（スキャナー経由） ───
  if (listMode) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="text-xs font-bold text-text-primary mb-2">記号・句読点ルール ({filtered.length})</h3>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-bg-secondary">
              <tr className="border-b border-border/30 text-text-muted text-left">
                <th className="w-6 px-1 py-1"></th>
                <th className="px-1 py-1">変換前</th>
                <th className="w-4 px-0 py-1"></th>
                <th className="px-1 py-1">変換後</th>
                <th className="px-1 py-1">備考</th>
                <th className="w-5 px-0 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule, i) => {
                const realIdx = symbolRules.indexOf(rule);
                return (
                  <tr key={i} className={`border-b border-border/10 hover:bg-bg-tertiary/60 cursor-pointer ${!rule.active ? "opacity-40" : ""}`} onClick={() => handleEdit(realIdx, rule)}>
                    <td className="px-1 py-0.5">
                      <button onClick={(e) => { e.stopPropagation(); toggleSymbolRule(realIdx); }} className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${rule.active ? "bg-accent border-accent" : "border-border"}`}>
                        {rule.active && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    </td>
                    <td className="px-1 py-0.5 font-mono text-text-primary">{rule.src}</td>
                    <td className="px-0 py-0.5 text-text-muted text-center">→</td>
                    <td className="px-1 py-0.5 font-mono text-accent-secondary">{rule.dst === " " ? "(半角SP)" : rule.dst}</td>
                    <td className="px-1 py-0.5 text-text-muted truncate max-w-[120px]">{rule.note}</td>
                    <td className="px-0 py-0.5"><button onClick={(e) => { e.stopPropagation(); deleteSymbolRule(realIdx); }} className="text-text-muted/40 hover:text-error">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0 border-t border-border/30 pt-2 mt-1">
          <div className="flex items-center gap-1">
            <input value={addSrc} onChange={(e) => setAddSrc(e.target.value)} placeholder="変換前" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            <span className="text-[9px] text-text-muted">→</span>
            <input value={addDst} onChange={(e) => setAddDst(e.target.value)} placeholder="変換後" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="備考" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50" />
            <button onClick={() => { if (!addSrc) return; addSymbolRule({ src: addSrc, dst: addDst, note: addNote, active: true }); setAddSrc(""); setAddDst(""); setAddNote(""); }} disabled={!addSrc} className="px-2 py-1 text-[9px] font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-30 flex-shrink-0">追加</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── カードモード（ツールメニュー経由） ───
  const [showAddForm, setShowAddForm] = useState(false);
  return (
    <div>
      <h3 className="text-xs font-bold text-text-primary mb-3">記号・句読点ルール ({filtered.length})</h3>
      <div className="grid grid-cols-3 gap-2">
        {filtered.map((rule, i) => {
          const realIdx = symbolRules.indexOf(rule);
          return (
            <div key={i} className={`bg-bg-tertiary rounded-lg px-3 py-2 transition-opacity ${!rule.active ? "opacity-40" : ""} hover:ring-1 hover:ring-accent/20 cursor-pointer`} onClick={() => handleEdit(realIdx, rule)}>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); toggleSymbolRule(realIdx); }} className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${rule.active ? "bg-accent border-accent" : "border-border"}`}>
                  {rule.active && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className="text-[11px] font-mono text-text-primary">{rule.src}</span>
                <span className="text-[10px] text-text-muted">→</span>
                <span className="text-[11px] font-mono text-accent-secondary">{rule.dst === " " ? "(半角スペース)" : rule.dst}</span>
                <div className="flex-1" />
                <button onClick={(e) => { e.stopPropagation(); deleteSymbolRule(realIdx); }} className="text-[9px] text-text-muted hover:text-error transition-colors">✕</button>
              </div>
              {rule.note && <div className="text-[9px] text-text-muted mt-0.5 ml-6">{rule.note}</div>}
            </div>
          );
        })}
        {/* 追加カード（最後尾） */}
        {showAddForm ? (
          <div className="bg-accent/5 border-2 border-dashed border-accent/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <input value={addSrc} onChange={(e) => setAddSrc(e.target.value)} placeholder="変換前" autoFocus className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
              <span className="text-[10px] text-text-muted">→</span>
              <input value={addDst} onChange={(e) => setAddDst(e.target.value)} placeholder="変換後" className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            </div>
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="備考" className="w-full text-[10px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 mb-1.5" />
            <div className="flex items-center gap-1.5">
              <button onClick={() => { if (!addSrc) return; addSymbolRule({ src: addSrc, dst: addDst, note: addNote, active: true }); setAddSrc(""); setAddDst(""); setAddNote(""); }} disabled={!addSrc} className="px-2.5 py-1 text-[9px] font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-30">追加</button>
              <button onClick={() => { setShowAddForm(false); setAddSrc(""); setAddDst(""); setAddNote(""); }} className="px-2 py-1 text-[9px] text-text-muted hover:text-text-primary">キャンセル</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="bg-bg-tertiary/50 border-2 border-dashed border-border/30 rounded-lg px-3 py-3 text-[10px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors flex items-center justify-center gap-1">
            <span className="text-sm">＋</span> 追加
          </button>
        )}
      </div>
    </div>
  );
}

// ═══ 校正ルールパネル ═══

function ProofRulePanel({ category, searchText, listMode }: { category: string; searchText: string; listMode: boolean }) {
  const { currentProofRules, toggleProofRule, addProofRule, updateProofRule, deleteProofRule } = useProgenStore();
  const cat = EDIT_CATEGORIES.find((c) => c.key === category);
  const [addBefore, setAddBefore] = useState("");
  const [addAfter, setAddAfter] = useState("");
  const [addNote, setAddNote] = useState("");

  const rules = useMemo(() => {
    let filtered = cat?.subCategories
      ? currentProofRules.filter((r) => cat.subCategories!.includes(r.category))
      : currentProofRules.filter((r) => r.category === category);
    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter((r) => `${r.before}${r.after}${r.note}`.toLowerCase().includes(q));
    }
    return filtered;
  }, [currentProofRules, category, cat, searchText]);

  const handleEdit = useCallback(async (realIdx: number, rule: ProofRule) => {
    const before = await showPromptDialog("変換前", rule.before);
    if (!before) return;
    const after = await showPromptDialog("変換後", rule.after);
    if (after === null) return;
    const note = await showPromptDialog("備考", rule.note);
    updateProofRule(realIdx, { before, after: after || "", note: note || "" });
  }, [updateProofRule]);

  // ─── 一覧モード ───
  if (listMode) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="text-xs font-bold text-text-primary mb-2">{cat?.name || category} ({rules.length})</h3>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-bg-secondary">
              <tr className="border-b border-border/30 text-text-muted text-left">
                <th className="w-6 px-1 py-1"></th>
                <th className="px-1 py-1">変換前</th>
                <th className="w-4 px-0 py-1"></th>
                <th className="px-1 py-1">変換後</th>
                <th className="px-1 py-1">備考</th>
                <th className="w-5 px-0 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => {
                const realIdx = currentProofRules.indexOf(rule);
                return (
                  <tr key={i} className={`border-b border-border/10 hover:bg-bg-tertiary/60 cursor-pointer ${!rule.active ? "opacity-40" : ""}`} onClick={() => handleEdit(realIdx, rule)}>
                    <td className="px-1 py-0.5">
                      <button onClick={(e) => { e.stopPropagation(); toggleProofRule(realIdx); }} className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${rule.active ? "bg-accent border-accent" : "border-border"}`}>
                        {rule.active && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    </td>
                    <td className="px-1 py-0.5 font-mono text-text-primary">{rule.before}</td>
                    <td className="px-0 py-0.5 text-text-muted text-center">→</td>
                    <td className="px-1 py-0.5 font-mono text-accent-secondary">
                      {rule.after}
                      {rule.addRuby && <span className="ml-1 text-[8px] px-0.5 rounded bg-warning/20 text-warning">ルビ</span>}
                      {rule.mode && rule.mode !== "none" && <span className="ml-1 text-[8px] px-0.5 rounded bg-accent/20 text-accent">{rule.mode}</span>}
                    </td>
                    <td className="px-1 py-0.5 text-text-muted truncate max-w-[120px]">{rule.note}</td>
                    <td className="px-0 py-0.5"><button onClick={(e) => { e.stopPropagation(); deleteProofRule(realIdx); }} className="text-text-muted/40 hover:text-error">✕</button></td>
                  </tr>
                );
              })}
              {rules.length === 0 && <tr><td colSpan={6} className="text-text-muted text-center py-6">ルールなし</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0 border-t border-border/30 pt-2 mt-1">
          <div className="flex items-center gap-1">
            <input value={addBefore} onChange={(e) => setAddBefore(e.target.value)} placeholder="変換前" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            <span className="text-[9px] text-text-muted">→</span>
            <input value={addAfter} onChange={(e) => setAddAfter(e.target.value)} placeholder="変換後" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="備考" className="flex-1 min-w-0 text-[10px] px-1.5 py-1 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50" />
            <button onClick={() => { if (!addBefore) return; addProofRule({ before: addBefore, after: addAfter, note: addNote, active: true, category: (cat?.subCategories?.[0] || category) as any, userAdded: true }); setAddBefore(""); setAddAfter(""); setAddNote(""); }} disabled={!addBefore} className="px-2 py-1 text-[9px] font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-30 flex-shrink-0">追加</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── カードモード ───
  const [showAddForm, setShowAddForm] = useState(false);
  return (
    <div>
      <h3 className="text-xs font-bold text-text-primary mb-3">{cat?.name || category} ({rules.length})</h3>
      <div className="grid grid-cols-3 gap-2">
        {rules.map((rule, i) => {
          const realIdx = currentProofRules.indexOf(rule);
          return (
            <div key={i} className={`bg-bg-tertiary rounded-lg px-3 py-2 transition-opacity ${!rule.active ? "opacity-40" : ""} hover:ring-1 hover:ring-accent/20 cursor-pointer`} onClick={() => handleEdit(realIdx, rule)}>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={(e) => { e.stopPropagation(); toggleProofRule(realIdx); }} className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${rule.active ? "bg-accent border-accent" : "border-border"}`}>
                  {rule.active && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className="text-[11px] font-mono text-text-primary">{rule.before}</span>
                <span className="text-[10px] text-text-muted">→</span>
                <span className="text-[11px] font-mono text-accent-secondary">{rule.after}</span>
                {rule.addRuby && <span className="text-[8px] px-1 rounded bg-warning/20 text-warning">ルビ</span>}
                {rule.mode && rule.mode !== "none" && <span className="text-[8px] px-1 rounded bg-accent/20 text-accent">{rule.mode}</span>}
                <div className="flex-1" />
                <button onClick={(e) => { e.stopPropagation(); deleteProofRule(realIdx); }} className="text-[9px] text-text-muted hover:text-error transition-colors">✕</button>
              </div>
              {rule.note && <div className="text-[9px] text-text-muted mt-0.5 ml-6">{rule.note}</div>}
            </div>
          );
        })}
        {rules.length === 0 && !showAddForm && <div className="col-span-3 text-text-muted text-xs text-center py-8">ルールなし</div>}
        {/* 追加カード（最後尾） */}
        {showAddForm ? (
          <div className="bg-accent/5 border-2 border-dashed border-accent/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <input value={addBefore} onChange={(e) => setAddBefore(e.target.value)} placeholder="変換前" autoFocus className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
              <span className="text-[10px] text-text-muted">→</span>
              <input value={addAfter} onChange={(e) => setAddAfter(e.target.value)} placeholder="変換後" className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono" />
            </div>
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="備考" className="w-full text-[10px] px-1.5 py-0.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 mb-1.5" />
            <div className="flex items-center gap-1.5">
              <button onClick={() => { if (!addBefore) return; addProofRule({ before: addBefore, after: addAfter, note: addNote, active: true, category: (cat?.subCategories?.[0] || category) as any, userAdded: true }); setAddBefore(""); setAddAfter(""); setAddNote(""); }} disabled={!addBefore} className="px-2.5 py-1 text-[9px] font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-30">追加</button>
              <button onClick={() => { setShowAddForm(false); setAddBefore(""); setAddAfter(""); setAddNote(""); }} className="px-2 py-1 text-[9px] text-text-muted hover:text-text-primary">キャンセル</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="bg-bg-tertiary/50 border-2 border-dashed border-border/30 rounded-lg px-3 py-3 text-[10px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors flex items-center justify-center gap-1">
            <span className="text-sm">＋</span> 追加
          </button>
        )}
      </div>
    </div>
  );
}

// ═══ 数字ルールパネル ═══

function NumberRulePanel() {
  const { numberRules, setNumberRule } = useProgenStore();
  const baseOptions = ["算用数字混在を許容", "全て算用数字に", "全て漢数字に"];

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-text-primary">数字ルール</h3>
      {/* ベースルール */}
      <div className="bg-bg-tertiary rounded-lg p-3">
        <div className="text-[10px] text-text-muted mb-1.5">基本ルール</div>
        <select
          value={numberRules.base}
          onChange={(e) => setNumberRule("base", Number(e.target.value))}
          className="w-full text-[11px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none"
        >
          {baseOptions.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
        </select>
      </div>
      {/* サブルール有効化 */}
      <label className="flex items-center gap-2 px-3 cursor-pointer">
        <input type="checkbox" checked={numberRules.subRulesEnabled} onChange={(e) => setNumberRule("subRulesEnabled", e.target.checked)} className="accent-accent" />
        <span className="text-[10px] text-text-primary">サブルールを有効にする</span>
      </label>
      {/* サブルール */}
      {numberRules.subRulesEnabled && (
        <div className="space-y-3">
          {(Object.entries(NUMBER_SUB_RULES) as [string, { label: string; options: readonly string[] }][]).map(([key, def]) => (
            <div key={key} className="bg-bg-tertiary rounded-lg p-3">
              <div className="text-[10px] text-text-muted mb-1.5">{def.label}</div>
              <select
                value={(numberRules as any)[key === "personCount" ? "personCount" : key === "thingCount" ? "thingCount" : "month"]}
                onChange={(e) => setNumberRule(key as any, Number(e.target.value))}
                className="w-full text-[11px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none"
              >
                {def.options.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ 保存ボタン ═══

function SaveButton() {
  const store = useProgenStore();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resultDialog, setResultDialog] = useState<
    | { ok: true; label: string | null; jsonPath: string | null }
    | { ok: false; error: string }
    | null
  >(null);

  const handleSave = useCallback(async () => {
    setStatus("saving");
    try {
      // 1. マスタールールに保存
      const scan = useScanPsdStore.getState();
      const label = scan.workInfo.label || "";
      if (label) {
        const { writeMasterRule } = await import("../../hooks/useProgenTauri");
        await writeMasterRule(label, {
          proof: store.currentProofRules,
          symbol: store.symbolRules,
          options: {
            ...store.options,
            numberRuleBase: store.numberRules.base,
            numberRulePersonCount: store.numberRules.personCount,
            numberRuleThingCount: store.numberRules.thingCount,
            numberRuleMonth: store.numberRules.month,
            numberSubRulesEnabled: store.numberRules.subRulesEnabled,
          },
        });
      }
      // 2. 作品JSONにも保存（パスがあれば）
      const jsonPath = store.currentJsonPath;
      if (jsonPath) {
        let json = store.currentLoadedJson || {};
        json = {
          ...json,
          proofRules: {
            proof: store.currentProofRules,
            symbol: store.symbolRules,
            options: {
              ...store.options,
              numberRuleBase: store.numberRules.base,
              numberRulePersonCount: store.numberRules.personCount,
              numberRuleThingCount: store.numberRules.thingCount,
              numberRuleMonth: store.numberRules.month,
              numberSubRulesEnabled: store.numberRules.subRulesEnabled,
            },
          },
        };
        const { writeJsonFile } = await import("../../hooks/useProgenTauri");
        await writeJsonFile(jsonPath, json);
        store.setCurrentLoadedJson(json);
      }
      setStatus("saved");
      setResultDialog({ ok: true, label: label || null, jsonPath: jsonPath || null });
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      console.error("ProGen save failed:", e);
      setStatus("error");
      setResultDialog({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [store]);

  // Ctrl+S で保存
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleSave]);

  return (
    <div className="flex-shrink-0 px-2 py-1.5 border-t border-border/30">
      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className={`w-full px-2 py-1.5 text-[9px] font-medium rounded transition-colors ${
          status === "saved" ? "bg-success/15 text-success"
          : status === "error" ? "bg-error/15 text-error"
          : "bg-accent/10 text-accent hover:bg-accent/20"
        }`}
      >
        {status === "saving" ? "保存中..." : status === "saved" ? "✓ 保存しました" : status === "error" ? "保存エラー" : "ルールを保存"}
      </button>

      {/* 保存結果ダイアログ */}
      {resultDialog && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={() => setResultDialog(null)}
        >
          <div
            className="bg-bg-secondary border border-border rounded-2xl p-5 shadow-xl w-[340px] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {resultDialog.ok ? (
              <>
                <p className="text-sm font-medium text-success text-center">
                  ✓ ルールを保存しました
                </p>
                <div className="text-[11px] text-text-secondary space-y-1">
                  {resultDialog.label && (
                    <div>
                      <span className="text-text-muted">マスタールール: </span>
                      <span className="font-medium text-text-primary">{resultDialog.label}</span>
                    </div>
                  )}
                  {resultDialog.jsonPath && (
                    <div className="break-all">
                      <span className="text-text-muted">作品JSON: </span>
                      <span className="font-medium text-text-primary">{resultDialog.jsonPath}</span>
                    </div>
                  )}
                  {!resultDialog.label && !resultDialog.jsonPath && (
                    <div className="text-warning">
                      保存先（レーベル / 作品JSON）が未設定のため、何も書き込まれていません。
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-error text-center">保存に失敗しました</p>
                <p className="text-[11px] text-text-secondary break-all">{resultDialog.error}</p>
              </>
            )}
            <button
              onClick={() => setResultDialog(null)}
              className="w-full px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-accent to-accent-secondary rounded-lg hover:-translate-y-0.5 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ 校正用テキスト追加ドロップダウン ═══

interface TextSourceDropdownProps {
  textSources: { name: string; content: string }[];
  setTextSources: React.Dispatch<React.SetStateAction<{ name: string; content: string }[]>>;
  setShowTextPicker: React.Dispatch<React.SetStateAction<"correctness" | "proposal" | null>>;
  loadBrowseDir: (dir: string) => Promise<void>;
}

function TextSourceDropdown({ textSources, setTextSources, setShowTextPicker, loadBrowseDir }: TextSourceDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-[10px] font-medium rounded border border-border/40 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors inline-flex items-center gap-1"
      >
        校正用テキスト追加
        {textSources.length > 0 && (
          <span className="text-[9px] text-accent font-bold">+{textSources.length}</span>
        )}
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-bg-secondary border border-border rounded-lg shadow-xl py-2 min-w-[240px]">
          {textSources.length > 0 && (
            <div className="px-3 pb-2 border-b border-border/30 mb-2">
              <div className="text-[9px] text-text-muted/60 mb-1">追加済み ({textSources.length})</div>
              <div className="space-y-0.5 max-h-32 overflow-auto">
                {textSources.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px] text-text-secondary">
                    <span className="truncate flex-1">{s.name}</span>
                    <button onClick={() => setTextSources((prev) => prev.filter((_, j) => j !== i))} className="text-text-muted/40 hover:text-error flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setTextSources([])} className="text-[9px] text-text-muted/60 hover:text-error mt-1">全クリア</button>
            </div>
          )}
          <button
            onClick={async () => {
              const path = await dialogOpen({ filters: [{ name: "テキスト", extensions: ["txt"] }], multiple: true });
              if (!path) return;
              const paths = Array.isArray(path) ? path : [path];
              for (const p of paths) {
                try {
                  const bytes = await readFile(p as string);
                  const content = new TextDecoder("utf-8").decode(bytes);
                  const name = (p as string).replace(/\\/g, "/").split("/").pop() || "text.txt";
                  setTextSources((prev) => [...prev, { name, content }]);
                } catch { /* ignore */ }
              }
            }}
            className="w-full text-left px-3 py-1.5 text-[10px] text-text-secondary hover:text-accent hover:bg-bg-tertiary transition-colors"
            title="エクスプローラーからテキストファイルを選択"
          >エクスプローラーから参照…</button>
          <button
            onClick={() => {
              const base = useScanPsdStore.getState().textLogFolderPath || "";
              if (base) loadBrowseDir(base);
              setShowTextPicker("correctness");
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-[10px] text-text-secondary hover:text-accent hover:bg-bg-tertiary transition-colors"
            title="テキストフォルダから選択"
          >テキストフォルダから選択…</button>
        </div>
      )}
    </div>
  );
}

// ═══ 結果貼り付けドロップダウン ═══

function ResultPasteDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-[10px] font-medium rounded border border-border/40 text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors inline-flex items-center gap-1"
      >
        結果を貼り付け
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-bg-secondary border border-border rounded-lg shadow-xl py-1 min-w-[160px]">
          <button
            onClick={() => { useProgenStore.getState().setResultSaveMode("text"); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[10px] font-medium text-blue-500 hover:bg-blue-50 transition-colors"
          >テキスト保存</button>
          <button
            onClick={() => { useProgenStore.getState().setResultSaveMode("json"); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-[10px] font-medium text-emerald-500 hover:bg-emerald-50 transition-colors"
          >JSON保存</button>
        </div>
      )}
    </div>
  );
}

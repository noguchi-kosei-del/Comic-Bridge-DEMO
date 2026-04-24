/**
 * ProGen 校正画面（Phase 2）
 * 正誤チェック / 提案チェック のプロンプト生成 + Gemini連携
 */
import { useState, useCallback, type ReactNode } from "react";
import { useProgenStore } from "../../store/progenStore";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";
import { generateSimpleCheckPrompt, generateVariationCheckPrompt } from "../../lib/progenPrompts";
import { openExternalUrl } from "../../hooks/useProgenTauri";
import type { ProofreadingMode } from "../../types/progen";

const SVG = (props: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    {props.children}
  </svg>
);

type CheckItem = { id: number; name: string; desc: string; icon: ReactNode };

// 正誤チェック項目（ProGen準拠: 7項目 + ルール確認）
const SIMPLE_CHECK_ITEMS: CheckItem[] = [
  { id: 1, name: "誤字・脱字", desc: "変換ミス、タイプミス、文字抜け", icon: <SVG><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></SVG> },
  { id: 2, name: "人名ルビ", desc: "初出の人名にルビ確認", icon: <SVG><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></SVG> },
  { id: 3, name: "常用外漢字", desc: "ルビ付け要否の確認", icon: <SVG><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></SVG> },
  { id: 4, name: "熟字訓", desc: "特殊な読みを持つ熟語のルビ確認", icon: <SVG><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></SVG> },
  { id: 5, name: "単位の誤り", desc: "文脈に合わない単位", icon: <SVG><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></SVG> },
  { id: 6, name: "伏字チェック", desc: "NGワードが伏字化されているか", icon: <SVG><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></SVG> },
  { id: 7, name: "人物名チェック", desc: "登録名との誤記・揺れ", icon: <SVG><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></SVG> },
];

const RULES_CHECK_ITEM: CheckItem = {
  id: 0,
  name: "統一表記ルール反映確認",
  desc: "",
  icon: <SVG><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></SVG>,
};

// 提案チェック項目（ProGen準拠: 10項目）
const VARIATION_CHECK_ITEMS: CheckItem[] = [
  { id: 1, name: "漢字/ひらがな統一", desc: "", icon: <SVG><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></SVG> },
  { id: 2, name: "カタカナ表記", desc: "", icon: <SVG><path d="M21 14l-3-3h-7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10z" /><path d="M14 15v2a1 1 0 0 1-1 1H6l-3 3V11a1 1 0 0 1 1-1h2" /></SVG> },
  { id: 3, name: "送り仮名の違い", desc: "", icon: <SVG><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></SVG> },
  { id: 4, name: "長音記号の有無", desc: "", icon: <SVG><line x1="5" y1="12" x2="19" y2="12" /></SVG> },
  { id: 5, name: "中黒の有無", desc: "", icon: <SVG><circle cx="12" cy="12" r="1" /></SVG> },
  { id: 6, name: "イコールの有無", desc: "", icon: <SVG><line x1="5" y1="9" x2="19" y2="9" /><line x1="5" y1="15" x2="19" y2="15" /></SVG> },
  { id: 7, name: "巻またぎ表記", desc: "", icon: <SVG><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></SVG> },
  { id: 8, name: "固有名詞・商標", desc: "", icon: <SVG><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></SVG> },
  { id: 9, name: "専門用語・事実の正確性", desc: "", icon: <SVG><path d="M12 3v18" /><rect x="3" y="8" width="7" height="13" rx="1" /><rect x="14" y="8" width="7" height="13" rx="1" /></SVG> },
  { id: 10, name: "未成年表現チェック", desc: "", icon: <SVG><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></SVG> },
];

export function ProgenProofreadingView() {
  const { currentProofreadingMode, setCurrentProofreadingMode } = useProgenStore();
  const symbolRules = useProgenStore((s) => s.symbolRules);
  const currentProofRules = useProgenStore((s) => s.currentProofRules);
  const progenOptions = useProgenStore((s) => s.options);
  const numberRules = useProgenStore((s) => s.numberRules);
  const textContent = useUnifiedViewerStore((s) => s.textContent);
  const textFilePath = useUnifiedViewerStore((s) => s.textFilePath);
  const [copied, setCopied] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);

  const fileName = textFilePath?.split("\\").pop()?.split("/").pop() || "";
  const hasText = textContent.length > 0;
  const charCount = textContent.length;

  const showCopied = (msg: string) => { setCopied(msg); setTimeout(() => setCopied(null), 2500); };

  // プロンプト生成（ProGenルールも含む）
  const handleGenerate = useCallback(() => {
    if (!hasText) return;
    const prompt = currentProofreadingMode === "simple"
      ? generateSimpleCheckPrompt(textContent, symbolRules, currentProofRules, progenOptions, numberRules)
      : generateVariationCheckPrompt(textContent, symbolRules, currentProofRules, progenOptions, numberRules);
    setGeneratedPrompt(prompt);
  }, [hasText, currentProofreadingMode, textContent, symbolRules, currentProofRules, progenOptions, numberRules]);

  // コピー → Gemini → 結果保存ダイアログ
  const handleCopyAndOpen = useCallback(async () => {
    if (!hasText) return;
    const prompt = currentProofreadingMode === "simple"
      ? generateSimpleCheckPrompt(textContent, symbolRules, currentProofRules, progenOptions, numberRules)
      : generateVariationCheckPrompt(textContent, symbolRules, currentProofRules, progenOptions, numberRules);
    setGeneratedPrompt(prompt);
    await navigator.clipboard.writeText(prompt).catch(() => {});
    showCopied(currentProofreadingMode === "simple" ? "正誤チェック" : "提案チェック");
    await openExternalUrl("https://gemini.google.com/app");
    // 結果保存ダイアログを表示（正誤/提案はJSON保存）
    useProgenStore.getState().setResultSaveMode("json");
  }, [hasText, currentProofreadingMode, textContent, symbolRules, currentProofRules, progenOptions, numberRules]);

  // コピーのみ
  const handleCopyOnly = useCallback(async () => {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt).catch(() => {});
    showCopied("プロンプト");
  }, [generatedPrompt]);

  const items = currentProofreadingMode === "simple" ? SIMPLE_CHECK_ITEMS : VARIATION_CHECK_ITEMS;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ヘッダー: モード切替 */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-bg-secondary flex items-center gap-3">
        <span className="text-xs font-bold text-text-primary">校正チェック</span>
        <div className="flex bg-bg-tertiary rounded-lg p-0.5">
          {(["simple", "variation"] as ProofreadingMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => { setCurrentProofreadingMode(mode); setGeneratedPrompt(null); }}
              className={`px-3 py-1 text-[10px] rounded-md transition-colors ${
                currentProofreadingMode === mode
                  ? mode === "simple" ? "bg-emerald-500 text-white font-medium" : "bg-orange-500 text-white font-medium"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {mode === "simple" ? "正誤チェック" : "提案チェック"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {copied && <span className="text-[9px] text-success font-medium">{copied} コピー済</span>}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左: チェック項目 + テキスト情報 */}
        <div className="w-[272px] flex-shrink-0 border-r border-border/50 flex flex-col bg-bg-tertiary/20 overflow-y-auto">
          {/* テキスト情報 */}
          <div className="p-3 border-b border-border/30">
            <div className="text-[10px] text-text-muted mb-1">対象テキスト</div>
            {hasText ? (
              <div className="space-y-1">
                {fileName && <div className="text-[10px] text-text-primary truncate">{fileName}</div>}
                <div className="text-[9px] text-text-muted">{charCount.toLocaleString()} 文字</div>
                <div className="bg-bg-primary rounded p-2 max-h-[100px] overflow-auto">
                  <pre className="text-[8px] font-mono text-text-secondary whitespace-pre-wrap">{textContent.substring(0, 500)}{textContent.length > 500 ? "..." : ""}</pre>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-warning">テキストが読み込まれていません。TopNavの「テキスト」ボタンから読み込んでください。</div>
            )}
          </div>

          {/* チェック項目一覧 */}
          <div className="p-3">
            <div className="text-[10px] font-medium text-text-muted mb-2">
              {currentProofreadingMode === "simple"
                ? "正誤チェック項目（7項目 + ルール確認）"
                : "提案チェック項目（10項目）"}
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 px-2 py-1.5 bg-bg-tertiary/50 rounded text-[10px]">
                  <span className="flex-shrink-0 text-text-secondary">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary font-medium">{item.id}. {item.name}</div>
                    {item.desc && <div className="text-[9px] text-text-muted">{item.desc}</div>}
                  </div>
                </div>
              ))}
              {currentProofreadingMode === "simple" && (
                <>
                  <div className="border-t border-border/30 my-2" />
                  <div className="flex items-start gap-2 px-2 py-1.5 bg-accent/10 rounded text-[10px]">
                    <span className="flex-shrink-0 text-accent">{RULES_CHECK_ITEM.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary font-medium">{RULES_CHECK_ITEM.name}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          <div className="p-3 border-t border-border/30 mt-auto space-y-2">
            <button
              onClick={handleCopyAndOpen}
              disabled={!hasText}
              className={`w-full px-3 py-2.5 text-[11px] font-medium text-white rounded-lg transition-colors disabled:opacity-30 ${
                currentProofreadingMode === "simple"
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              プロンプトをコピーして Gemini を開く
            </button>
            <button
              onClick={handleGenerate}
              disabled={!hasText}
              className="w-full px-3 py-1.5 text-[10px] text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-elevated transition-colors disabled:opacity-30"
            >
              プロンプトをプレビュー
            </button>
          </div>
        </div>

        {/* 右: プロンプトプレビュー */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {generatedPrompt ? (
            <>
              <div className="flex-shrink-0 px-3 py-1.5 border-b border-border/30 flex items-center gap-2">
                <span className="text-[10px] text-text-muted">生成されたプロンプト</span>
                <div className="flex-1" />
                <button onClick={handleCopyOnly} className="px-2 py-0.5 text-[9px] bg-bg-tertiary hover:bg-accent/10 hover:text-accent rounded transition-colors">コピー</button>
                <button onClick={() => openExternalUrl("https://gemini.google.com/app")} className="px-2 py-0.5 text-[9px] text-blue-500 hover:bg-blue-50 rounded transition-colors">Gemini</button>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <pre className="text-[9px] font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">{generatedPrompt}</pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
              {hasText
                ? "「プロンプトをプレビュー」または「コピーしてGeminiを開く」を押してください"
                : "テキストを読み込んでからチェックを実行してください"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";

interface SymbolRule {
  src: string;
  dst: string;
  note: string;
  active: boolean;
}

interface ProofRule {
  pattern?: string;
  replacement?: string;
  note?: string;
  [key: string]: any;
}

interface MasterData {
  proofRules?: {
    symbol?: SymbolRule[];
    proof?: ProofRule[];
    options?: Record<string, any>;
  };
  [key: string]: any;
}

export function ProgenJsonBrowser() {
  const workInfo = useScanPsdStore((s) => s.workInfo);
  const [labels, setLabels] = useState<{ key: string; displayName: string }[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [masterData, setMasterData] = useState<MasterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"symbol" | "proof" | "options">("symbol");

  // レーベル一覧取得 + workInfo.labelから自動選択
  useEffect(() => {
    console.log("[ProgenJsonBrowser] mounted, workInfo.label:", workInfo.label);
    invoke<any>("progen_get_master_label_list")
      .then((res: any) => {
        console.log("[ProgenJsonBrowser] label list result:", res?.labels?.length, "labels");
        if (res?.success && Array.isArray(res.labels)) {
          const list = res.labels
            .filter((l: any) => l && l.key && (l.display_name || l.displayName))
            .map((l: any) => ({ key: l.key as string, displayName: (l.display_name || l.displayName) as string }));
          setLabels(list);
          console.log("[ProgenJsonBrowser] labels:", list.map((l: any) => l.displayName).join(", "));
          // workInfo.labelで自動選択（DEDEDE等）
          if (workInfo.label) {
            const labelLower = workInfo.label.toLowerCase();
            const match = list.find((l: any) =>
              l.displayName.toLowerCase() === labelLower ||
              l.key.toLowerCase() === labelLower ||
              l.displayName.toLowerCase().includes(labelLower) ||
              labelLower.includes(l.displayName.toLowerCase())
            );
            console.log("[ProgenJsonBrowser] auto-match:", workInfo.label, "→", match?.key || "no match");
            if (match) loadLabel(match.key);
          }
        }
      })
      .catch((e: any) => { console.error("[ProgenJsonBrowser] label list error:", e); });
  }, [workInfo.label]);

  const loadLabel = useCallback(async (key: string) => {
    console.log("[ProgenJsonBrowser] loadLabel called with key:", key);
    setSelectedLabel(key);
    setMasterData(null);
    setLoading(true);
    try {
      // まずラベル一覧を再スキャンしてmapを最新化
      await invoke("progen_get_master_label_list").catch(() => {});
      const res = await invoke<{ success: boolean; data?: any; error?: string }>("progen_read_master_rule", { labelValue: key });
      console.log("[ProgenJsonBrowser] read_master_rule result:", key, JSON.stringify(res).substring(0, 200));
      if (res.success && res.data) {
        setMasterData(res.data as MasterData);
      } else {
        // keyで失敗した場合、display_nameで再試行
        const label = labels.find((l) => l.key === key);
        if (label && label.displayName !== key) {
          console.log("[ProgenJsonBrowser] retrying with displayName:", label.displayName);
          const res2 = await invoke<{ success: boolean; data?: any; error?: string }>("progen_read_master_rule", { labelValue: label.displayName });
          console.log("[ProgenJsonBrowser] retry result:", JSON.stringify(res2).substring(0, 200));
          if (res2.success && res2.data) setMasterData(res2.data as MasterData);
        }
      }
    } catch (e) { console.error("[ProgenJsonBrowser] invoke error:", e); }
    setLoading(false);
  }, [labels]);

  const showCopied = (msg: string) => { setCopied(msg); setTimeout(() => setCopied(null), 2000); };

  const handleCopySymbolRules = useCallback(async () => {
    const rules = masterData?.proofRules?.symbol;
    if (!rules) return;
    await navigator.clipboard.writeText(JSON.stringify(rules, null, 2)).catch(() => {});
    showCopied("統一表記ルール");
  }, [masterData]);

  const handleCopyProofRules = useCallback(async () => {
    const rules = masterData?.proofRules?.proof;
    if (!rules) return;
    await navigator.clipboard.writeText(JSON.stringify(rules, null, 2)).catch(() => {});
    showCopied("校正ルール");
  }, [masterData]);

  const handleCopyAll = useCallback(async () => {
    if (!masterData) return;
    await navigator.clipboard.writeText(JSON.stringify(masterData, null, 2)).catch(() => {});
    showCopied("全体");
  }, [masterData]);

  const handleOpenGemini = useCallback(async () => {
    await invoke("open_with_default_app", { filePath: "https://gemini.google.com/app" }).catch(() => {});
  }, []);

  // テキスト取得
  const getTextContent = () => useUnifiedViewerStore.getState().textContent || "";

  // 4種類のプロンプト生成+Gemini
  const buildSymbolRulesText = () => {
    const rules = masterData?.proofRules?.symbol?.filter((r: any) => r.active) || [];
    return rules.map((r: any) => `「${r.src}」→「${r.dst}」（${r.note}）`).join("\n");
  };

  const buildProofRulesText = () => {
    const rules = masterData?.proofRules?.proof || [];
    return JSON.stringify(rules, null, 2);
  };

  const handleExtractionGemini = useCallback(async () => {
    const symbolText = buildSymbolRulesText();
    const text = getTextContent();
    const prompt = `以下の統一表記ルールに従って、テキストからセリフを抽出・整形してください。

【統一表記ルール（記号変換）】
${symbolText || "（ルールなし）"}

【対象テキスト】
${text || "（テキスト未読み込み — Geminiに貼り付けてください）"}

【指示】
- 漫画の読み順（右上→左下）でセリフを抽出
- 吹き出し1つにつき1ブロック、空行で区切る
- 統一表記ルールの記号変換を適用
- 手書き効果音は除外`;
    await navigator.clipboard.writeText(prompt).catch(() => {});
    showCopied("抽出プロンプト");
    handleOpenGemini();
  }, [masterData]);

  const handleFormattingGemini = useCallback(async () => {
    const symbolText = buildSymbolRulesText();
    const proofText = buildProofRulesText();
    const text = getTextContent();
    const prompt = `以下のルールに従って、テキストを整形・校正してください。

【統一表記ルール（記号変換）】
${symbolText || "（ルールなし）"}

【校正ルール】
${proofText || "（ルールなし）"}

【対象テキスト】
${text || "（テキスト未読み込み — Geminiに貼り付けてください）"}

【指示】
- 統一表記ルールの記号変換を適用
- 校正ルールに従って表記を統一
- 吹き出し区切り（空行）を維持
- COMIC-POTフォーマット（<<NPage>>）を維持`;
    await navigator.clipboard.writeText(prompt).catch(() => {});
    showCopied("整形プロンプト");
    handleOpenGemini();
  }, [masterData]);

  const handleCorrectnessGemini = useCallback(async () => {
    const text = getTextContent();
    const prompt = `以下のテキストについて、正誤チェック（誤字・脱字・人名ルビ）を5パス実行してください。

【対象テキスト】
${text || "（テキスト未読み込み — Geminiに貼り付けてください）"}

【チェック項目】
1. 誤字（変換ミス、タイプミス）
2. 脱字（文字の脱落）
3. 人名ルビ（初出のみ）

【実行方法】
- パス1: 全項目を網羅的にチェック
- パス2〜5: 前のパスで見逃した新規項目のみ
- 各パスの結果をMarkdownテーブルで出力

【出力形式】
| 種別 | 箇所(ページ) | セリフ抜粋 | 指摘内容 |
該当なしの場合は「該当なし」と記載`;
    await navigator.clipboard.writeText(prompt).catch(() => {});
    showCopied("正誤チェック");
    handleOpenGemini();
  }, [masterData]);

  const handleProposalGemini = useCallback(async () => {
    const text = getTextContent();
    const prompt = `以下のテキストについて、表記ゆれ・提案チェックを5パス実行してください。

【対象テキスト】
${text || "（テキスト未読み込み — Geminiに貼り付けてください）"}

【チェック10項目】
1. 漢字/ひらがな/カタカナの混在（例:「して頂く」vs「していただく」）
2. 送り仮名のゆれ（例:「申し込み」vs「申込み」）
3. 外来語・長音符のゆれ（例:「サーバー」vs「サーバ」）
4. 数字・漢数字の統一
5. 略称・別表現の混在
6. 異体字（例:「渡辺」vs「渡邊」）
7. 文体の統一（例:「私たち」vs「我々」）
8. 固有名詞・商標の正確性
9. 専門用語・事実確認
10. 未成年表現チェック

【実行方法】
- パス1: 全10項目を網羅的にチェック
- パス2〜5: 前のパスで見逃した新規項目のみ
- 同じ項目で別のゆれグループは①②③で区別

【出力形式】
| チェック項目 | 箇所(ページ) | セリフ抜粋 | 指摘内容 |
表記ゆれは両方の表記と出現ページ一覧を記載
最終的に全パスの統合リスト（重複排除）も出力`;
    await navigator.clipboard.writeText(prompt).catch(() => {});
    showCopied("提案チェック");
    handleOpenGemini();
  }, [masterData]);

  const symbolRules = masterData?.proofRules?.symbol || [];
  const proofRules = masterData?.proofRules?.proof || [];
  const options = masterData?.proofRules?.options || {};
  const selectedLabelName = labels.find((l) => l.key === selectedLabel)?.displayName || selectedLabel || "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ヘッダー */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-bg-secondary flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-text-primary">ProGen マスターJSON</span>
        {selectedLabelName && <span className="text-[10px] px-2 py-0.5 rounded bg-accent-secondary/15 text-accent-secondary font-medium">{selectedLabelName}</span>}
        <div className="flex-1" />
        {copied && <span className="text-[9px] text-success font-medium">{copied} をコピーしました</span>}
        <div className="flex items-center gap-1">
          <button onClick={handleExtractionGemini} disabled={!masterData} className="px-2 py-1 text-[9px] font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-30" title="抽出プロンプトをコピーしてGeminiで開く">抽出</button>
          <button onClick={handleFormattingGemini} disabled={!masterData} className="px-2 py-1 text-[9px] font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-30" title="整形プロンプトをコピーしてGeminiで開く">整形</button>
          <button onClick={handleCorrectnessGemini} disabled={!masterData} className="px-2 py-1 text-[9px] font-medium text-white bg-emerald-500 rounded hover:bg-emerald-600 transition-colors disabled:opacity-30" title="正誤チェックをコピーしてGeminiで開く">正誤</button>
          <button onClick={handleProposalGemini} disabled={!masterData} className="px-2 py-1 text-[9px] font-medium text-white bg-orange-500 rounded hover:bg-orange-600 transition-colors disabled:opacity-30" title="提案チェックをコピーしてGeminiで開く">提案</button>
          <button onClick={handleOpenGemini} className="px-2 py-1 text-[9px] text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Geminiを開く">Gemini</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左: レーベル一覧 */}
        <div className="w-[160px] flex-shrink-0 border-r border-border/50 overflow-y-auto bg-bg-tertiary/30">
          {labels.map((label) => (
            <button
              key={label.key}
              onClick={() => loadLabel(label.key)}
              className={`w-full text-left px-3 py-1.5 text-[10px] transition-colors border-b border-border/10 ${
                selectedLabel === label.key ? "bg-accent/10 text-accent font-medium" : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              {label.displayName}
            </button>
          ))}
        </div>

        {/* 右: ルール内容 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : !masterData ? (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs">データなし</div>
          ) : (
            <>
              {/* タブ + アクション */}
              <div className="flex-shrink-0 px-3 py-1.5 border-b border-border/30 flex items-center gap-1">
                {([
                  { id: "symbol" as const, label: `統一表記 (${symbolRules.length})` },
                  { id: "proof" as const, label: `校正ルール (${proofRules.length})` },
                  { id: "options" as const, label: "オプション" },
                ]).map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-2 py-0.5 text-[9px] rounded transition-colors ${tab === t.id ? "bg-accent/15 text-accent font-medium" : "text-text-muted hover:text-text-secondary"}`}
                  >{t.label}</button>
                ))}
                <div className="flex-1" />
                {tab === "symbol" && <button onClick={handleCopySymbolRules} className="px-2 py-0.5 text-[9px] bg-bg-tertiary hover:bg-accent/10 hover:text-accent rounded transition-colors">ルールコピー</button>}
                {tab === "proof" && <button onClick={handleCopyProofRules} className="px-2 py-0.5 text-[9px] bg-bg-tertiary hover:bg-accent/10 hover:text-accent rounded transition-colors">ルールコピー</button>}
                <button onClick={handleCopyAll} className="px-2 py-0.5 text-[9px] bg-bg-tertiary hover:bg-accent/10 hover:text-accent rounded transition-colors">全体コピー</button>
              </div>

              {/* コンテンツ */}
              <div className="flex-1 overflow-auto p-3">
                {tab === "symbol" && (
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="text-text-muted border-b border-border/40 sticky top-0 bg-bg-primary">
                        <th className="text-left py-1.5 px-2 w-8">有効</th>
                        <th className="text-left py-1.5 px-2">変換前</th>
                        <th className="text-left py-1.5 px-2">変換後</th>
                        <th className="text-left py-1.5 px-2">備考</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolRules.map((rule, i) => (
                        <tr key={i} className={`border-b border-border/10 ${!rule.active ? "opacity-40" : ""} hover:bg-bg-tertiary/40`}>
                          <td className="py-1 px-2">{rule.active ? <span className="text-success">●</span> : <span className="text-text-muted">○</span>}</td>
                          <td className="py-1 px-2 font-mono text-text-primary">{rule.src}</td>
                          <td className="py-1 px-2 font-mono text-accent-secondary">{rule.dst}</td>
                          <td className="py-1 px-2 text-text-muted">{rule.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tab === "proof" && (
                  proofRules.length > 0 ? (
                    <div className="space-y-1">
                      {proofRules.map((rule, i) => (
                        <div key={i} className="bg-bg-tertiary rounded-lg px-3 py-2 text-[10px]">
                          <pre className="font-mono text-text-secondary whitespace-pre-wrap">{JSON.stringify(rule, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-text-muted text-xs text-center py-4">校正ルールなし</div>
                  )
                )}
                {tab === "options" && (
                  Object.keys(options).length > 0 ? (
                    <div className="bg-bg-tertiary rounded-lg p-3">
                      <table className="w-full text-[10px]">
                        <tbody>
                          {Object.entries(options).map(([key, val]) => (
                            <tr key={key} className="border-b border-border/10">
                              <td className="py-1 px-2 font-mono text-text-muted">{key}</td>
                              <td className="py-1 px-2 font-mono text-text-primary">{String(val)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-text-muted text-xs text-center py-4">オプション設定なし</div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

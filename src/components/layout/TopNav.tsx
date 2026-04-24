// @ts-nocheck
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FileText, FileJson, ClipboardCheck, Shield, Check, RotateCcw, type LucideIcon } from "lucide-react";
import { useViewStore, validateAndSetABPath } from "../../store/viewStore";
import { usePsdStore } from "../../store/psdStore";
import { useSpecStore } from "../../store/specStore";
import { useAppUpdater } from "../../hooks/useAppUpdater";
import { useUnifiedViewerStore, useTextEditorViewerStore, type FontPresetEntry } from "../../store/unifiedViewerStore";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useProgenStore } from "../../store/progenStore";
import { open as dialogOpen, ask as dialogAsk, message as dialogMessage } from "@tauri-apps/plugin-dialog";
import { globalLoadFolder } from "../../lib/psdLoaderRegistry";
import { invoke } from "@tauri-apps/api/core";
import type { ProofreadingCheckItem } from "../../types/typesettingCheck";
import { JsonFileBrowser } from "../scanPsd/JsonFileBrowser";
import { CheckJsonBrowser } from "../unified-viewer/UnifiedViewer";
import { WorkflowBar } from "./WorkflowBar";
import { useWorkflowStore } from "../../store/workflowStore";
import { SettingsButton } from "./SettingsPanel";
import { useSettingsStore, ALL_NAV_BUTTONS } from "../../store/settingsStore";
import { parseComicPotText } from "../unified-viewer/utils";

export function TopNav() {
  const setActiveView = useViewStore((s) => s.setActiveView);
  const files = usePsdStore((s) => s.files);
  const checkResults = useSpecStore((s) => s.checkResults);
  const textLoadedForReset = useUnifiedViewerStore((s) => s.textContent.length > 0 || !!s.textFilePath);
  const textEditorLoadedForReset = useTextEditorViewerStore((s) => s.textContent.length > 0 || !!s.textFilePath);
  const presetsLoadedForReset = useUnifiedViewerStore((s) => s.fontPresets.length > 0 || !!s.presetJsonPath);
  const checkLoadedForReset = useUnifiedViewerStore((s) => !!s.checkData);
  const updater = useAppUpdater();
  const viewerStore = useUnifiedViewerStore();
  const jsonFolderPath = useScanPsdStore((s) => s.jsonFolderPath);
  const jsonBrowserMode = useViewStore((s) => s.jsonBrowserMode);
  const setJsonBrowserMode = useViewStore((s) => s.setJsonBrowserMode);

  const passedCount = Array.from(checkResults.values()).filter((r) => r.passed).length;
  const failedCount = Array.from(checkResults.values()).filter((r) => !r.passed).length;

  // JSON file selection handler
  const handleJsonSelect = useCallback(async (filePath: string) => {
    const mode = jsonBrowserMode;
    const ext = filePath.substring(filePath.lastIndexOf(".") + 1).toLowerCase();
    if (ext !== "json") {
      await dialogMessage("対応していないファイル形式です。.json ファイルを選択してください。", {
        title: mode === "check" ? "校正JSON読み込みエラー" : "作品情報JSON読み込みエラー",
        kind: "error",
      });
      setJsonBrowserMode(null);
      return;
    }
    try {
      const content = await invoke<string>("read_text_file", { filePath });
      let data: any;
      try {
        data = JSON.parse(content);
      } catch (parseErr) {
        throw new Error(`JSONの解析に失敗しました: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }
      if (mode === "check") {
        const allItems: ProofreadingCheckItem[] = [];
        const parse = (src: any, fallbackKind: "correctness" | "proposal") => {
          const arr = Array.isArray(src) ? src : Array.isArray(src?.items) ? src.items : null;
          if (!arr) return;
          for (const item of arr)
            allItems.push({ picked: false, category: item.category || "", page: item.page || "", excerpt: item.excerpt || "", content: item.content || item.text || "", checkKind: item.checkKind || fallbackKind });
        };
        if (data.checks) { parse(data.checks.simple, "correctness"); parse(data.checks.variation, "proposal"); }
        else if (Array.isArray(data)) { parse(data, "correctness"); }
        else {
          throw new Error("校正JSONの形式が正しくありません（checks フィールド、または配列形式が必要です）。");
        }
        viewerStore.setCheckData({
          title: data.work || "", fileName: filePath.substring(filePath.lastIndexOf("\\") + 1), filePath,
          allItems, correctnessItems: allItems.filter((i) => i.checkKind === "correctness"), proposalItems: allItems.filter((i) => i.checkKind === "proposal"),
        });
      } else {
        const presets: FontPresetEntry[] = [];
        const presetsObj = data?.presetData?.presets ?? data?.presets ?? data?.presetSets ?? data;
        if (typeof presetsObj === "object" && presetsObj !== null) {
          const entries = Array.isArray(presetsObj) ? [["", presetsObj]] : Object.entries(presetsObj);
          for (const [, arr] of entries) {
            if (!Array.isArray(arr)) continue;
            for (const p of arr as any[])
              if (p?.font || p?.postScriptName)
                presets.push({ font: p.font || p.postScriptName, name: p.name || p.displayName || "", subName: p.subName || "" });
          }
        }
        const wi = data?.presetData?.workInfo ?? data?.workInfo;
        const hasWorkInfo = wi && typeof wi === "object";
        if (presets.length === 0 && !hasWorkInfo) {
          throw new Error("作品情報JSONの形式が正しくありません（presets / workInfo いずれも見つかりません）。");
        }
        if (presets.length > 0) { viewerStore.setFontPresets(presets); viewerStore.setPresetJsonPath(filePath); }
        // workInfo（ジャンル/タイトル/巻数等）をscanPsdStoreにセット
        if (hasWorkInfo) {
          const scanStore = useScanPsdStore.getState();
          scanStore.setWorkInfo({
            ...scanStore.workInfo,
            ...(wi.genre ? { genre: wi.genre } : {}),
            ...(wi.label ? { label: wi.label } : {}),
            ...(wi.title ? { title: wi.title } : {}),
            ...(wi.author ? { author: wi.author } : {}),
          });
        }
        // ── ProGen 校正ルールも自動反映（proofRules があれば優先、なければラベルからマスタールール）──
        const progenStore = useProgenStore.getState();
        progenStore.setCurrentLoadedJson(data);
        progenStore.setCurrentJsonPath(filePath);
        if (data?.proofRules) {
          progenStore.applyJsonRules(data);
        } else if (data?.presetData?.proofRules) {
          progenStore.applyJsonRules(data.presetData);
        } else if (wi?.label) {
          await progenStore.loadMasterRule(wi.label);
        }
      }
    } catch (e) {
      await dialogMessage(
        `${mode === "check" ? "校正JSON" : "作品情報JSON"}を読み込めませんでした。\n\n${e instanceof Error ? e.message : String(e)}`,
        { title: mode === "check" ? "校正JSON読み込みエラー" : "作品情報JSON読み込みエラー", kind: "error" },
      );
    }
    setJsonBrowserMode(null);
  }, [jsonBrowserMode]);

  // WFアクティブ時はTopNavの他の要素を非表示にし、WorkflowBarに全幅を譲る
  const wfActive = useWorkflowStore((s) => s.activeWorkflow !== null);

  return (
    <nav
      className="h-14 flex-shrink-0 bg-bg-secondary border-b border-border flex items-center px-3 gap-2 relative z-20 shadow-soft"
      data-tauri-drag-region
    >
      {/* WF（左端） — WFアクティブ時は全幅展開（ツール/ナビボタン類を非表示にする） */}
      <WorkflowBar />

      {!wfActive && (
        <>
          {/* ツール + 設定 + フォルダから開く */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <TopNavToolMenu />
            <SettingsButton />
            <button
              onClick={async () => {
                const path = await dialogOpen({
                  directory: true,
                  multiple: false,
                  defaultPath: usePsdStore.getState().currentFolderPath || undefined,
                });
                if (!path) return;
                const p = (path as string).replace(/\/+$|\\+$/g, "");
                usePsdStore.getState().setCurrentFolderPath(p);
                try { await globalLoadFolder(p); } catch { /* ignore */ }
                usePsdStore.getState().triggerRefresh();
              }}
              className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary rounded hover:bg-bg-tertiary transition-colors"
              title="フォルダから開く"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            <button
              onClick={async () => {
                const ps = usePsdStore.getState();
                const vs = useUnifiedViewerStore.getState();
                const ts = useTextEditorViewerStore.getState();
                const hasAny =
                  ps.files.length > 0 ||
                  vs.textContent.length > 0 ||
                  !!vs.textFilePath ||
                  ts.textContent.length > 0 ||
                  !!ts.textFilePath ||
                  vs.fontPresets.length > 0 ||
                  !!vs.presetJsonPath ||
                  !!vs.checkData;
                if (!hasAny) return;
                const ok = await dialogAsk("読み込みをリセットします。よろしいですか？", {
                  title: "読み込みリセット",
                  kind: "warning",
                });
                if (!ok) return;
                // PSD フォルダ
                ps.clearFiles();
                ps.triggerRefresh();
                // テキスト（両方のビューアーインスタンスをクリア）
                for (const s of [vs, ts]) {
                  s.setTextContent("");
                  s.setTextFilePath(null);
                  s.setTextHeader([]);
                  s.setTextPages([]);
                  s.setIsDirty(false);
                }
                // 作品情報JSON
                vs.setFontPresets([]);
                vs.setPresetJsonPath(null);
                // 校正JSON
                vs.setCheckData(null);
              }}
              disabled={
                files.length === 0 &&
                !textLoadedForReset &&
                !textEditorLoadedForReset &&
                !presetsLoadedForReset &&
                !checkLoadedForReset
              }
              className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary rounded hover:bg-bg-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
              title="読み込みリセット"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-8 bg-border flex-shrink-0" />

          {/* ナビボタン（左寄せ） */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <NavBarButtons />
          </div>

          <div className="flex-1" />
        </>
      )}

      {/* データ読み込みボタン（右寄せ）— WF中も残す */}
      <TopNavDataButtons />

      <div className="w-px h-4 bg-border/50 mx-0.5 flex-shrink-0" />

      {/* Right: ファイル数 + OK/NG — WF中も残す */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-text-muted">{files.length} ファイル</span>
          {checkResults.size > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-tertiary">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-success leading-none">○</span>
                <span className="text-xs font-medium text-success">{passedCount}</span>
              </div>
              <span className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-error leading-none">×</span>
                <span className="text-xs font-medium text-error">{failedCount}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 更新検出時のみ: 更新可用バッジ（バージョン表示は設定パネルへ移設済み） */}
      {updater.phase === "available" && (
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <button
            onClick={() => updater.downloadAndInstall()}
            className="relative flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-accent-tertiary bg-accent-tertiary/10 rounded-lg hover:bg-accent-tertiary/20 transition-colors"
          >
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent-tertiary animate-pulse" />
            v{updater.updateInfo?.version}
          </button>
        </div>
      )}

      {/* Update Prompt Dialog */}
      {updater.showPrompt && updater.updateInfo &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-secondary border border-border rounded-2xl p-8 shadow-xl max-w-sm text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary">アップデートがあります</h3>
                <p className="text-xs text-text-muted mt-1">v{updater.appVersion} → <span className="text-accent-tertiary font-semibold">v{updater.updateInfo.version}</span></p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => updater.dismissPrompt()} className="flex-1 px-4 py-2.5 text-xs font-medium text-text-secondary bg-bg-tertiary rounded-xl hover:bg-bg-tertiary/80 transition-colors">あとで</button>
                <button onClick={() => { updater.dismissPrompt(); updater.downloadAndInstall(); }} className="flex-1 px-4 py-2.5 text-xs font-medium text-white bg-gradient-to-r from-accent to-accent-secondary rounded-xl hover:-translate-y-0.5 transition-all shadow-sm">アップデートする</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Update Dialog (downloading / ready / error) */}
      {(updater.phase === "downloading" || updater.phase === "ready" || updater.phase === "error") &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-secondary border border-border rounded-2xl p-8 shadow-xl max-w-sm text-center space-y-4">
              {updater.phase === "downloading" && (
                <>
                  <svg className="w-12 h-12 mx-auto text-accent animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <h3 className="text-base font-bold text-text-primary">アップデート中...</h3>
                  <p className="text-xs text-text-muted">ダウンロードしています。しばらくお待ちください。</p>
                </>
              )}
              {updater.phase === "ready" && (
                <>
                  <svg className="w-12 h-12 mx-auto text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-base font-bold text-text-primary">インストール完了</h3>
                  <p className="text-xs text-text-muted">アプリを再起動します...</p>
                </>
              )}
              {updater.phase === "error" && (
                <>
                  <svg className="w-12 h-12 mx-auto text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-base font-bold text-text-primary">アップデート失敗</h3>
                  <p className="text-xs text-text-muted">{updater.error}</p>
                  <button onClick={updater.dismiss} className="px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-accent to-accent-secondary rounded-xl hover:-translate-y-0.5 transition-all">閉じる</button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}


      {/* JSON File Browser Modal */}
      {jsonBrowserMode &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setJsonBrowserMode(null); }}>
            <div className="bg-bg-secondary rounded-xl shadow-2xl w-[500px] max-h-[70vh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <h3 className="text-sm font-medium">{jsonBrowserMode === "preset" ? "作品情報JSON" : "校正データJSON"} を選択</h3>
                <button onClick={() => setJsonBrowserMode(null)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
              <div className="flex-1 overflow-auto">
                {jsonBrowserMode === "preset" && jsonFolderPath ? (
                  <JsonFileBrowser basePath={jsonFolderPath} onSelect={handleJsonSelect} onCancel={() => setJsonBrowserMode(null)} mode="open" />
                ) : jsonBrowserMode === "check" ? (
                  <CheckJsonBrowser onSelect={handleJsonSelect} onCancel={() => setJsonBrowserMode(null)} />
                ) : (
                  <div className="p-4 text-center text-text-muted text-xs">JSONフォルダパスが設定されていません</div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </nav>
  );
}

// ─── データ読み込みボタン（TopNav内、右寄せ） ───
function TopNavDataButtons() {
  const textLoaded = useUnifiedViewerStore((s) => s.textContent.length > 0);
  const textFilePath = useUnifiedViewerStore((s) => s.textFilePath);
  const presetJsonPath = useUnifiedViewerStore((s) => s.presetJsonPath);
  // presetJsonPath があれば新規作成JSON(presets空)でもロード済みとみなす
  const presetsLoaded = useUnifiedViewerStore((s) => s.fontPresets.length > 0 || !!s.presetJsonPath);
  const checkLoaded = useUnifiedViewerStore((s) => !!s.checkData);
  const checkData = useUnifiedViewerStore((s) => s.checkData);

  // ツールチップ: 読み込み中のフォルダ名/ファイル名
  const textTooltip = textFilePath
    ? `テキスト: ${textFilePath.replace(/\//g, "\\").split("\\").slice(-2).join("\\")}`
    : "テキスト読み込み";
  const presetTooltip = presetJsonPath
    ? `作品情報JSON: ${presetJsonPath.replace(/\//g, "\\").split("\\").slice(-2).join("\\")}`
    : "作品情報JSON";
  const checkTooltip = checkData
    ? `校正JSON: ${checkData.title || ""}${checkData.fileName ? ` (${checkData.fileName})` : ""}`
    : "校正JSON";
  const wfActive = useWorkflowStore((s) => s.activeWorkflow !== null);

  const handleOpenText = useCallback(async () => {
    const path = await dialogOpen({
      filters: [
        { name: "テキスト", extensions: ["txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
      multiple: false,
    });
    if (!path) return;
    const p = path as string;
    const ext = p.substring(p.lastIndexOf(".") + 1).toLowerCase();
    if (ext !== "txt") {
      await dialogMessage("対応していないファイル形式です。.txt ファイルを選択してください。", {
        title: "テキスト読み込みエラー",
        kind: "error",
      });
      return;
    }
    try {
      const content = await invoke<string>("read_text_file", { filePath: p });
      if (typeof content !== "string") {
        throw new Error("ファイル内容を文字列として取得できませんでした。");
      }
      const vs = useUnifiedViewerStore.getState();
      vs.setTextContent(content);
      vs.setTextFilePath(p);
      vs.setIsDirty(false);
      // COMIC-POTフォーマットをパースしてページ/ブロックに分割
      const { header, pages } = parseComicPotText(content);
      vs.setTextHeader(header);
      vs.setTextPages(pages);
    } catch (e) {
      await dialogMessage(
        `テキストファイルを読み込めませんでした。ファイル形式または文字コードが対応していない可能性があります。\n\n${e instanceof Error ? e.message : String(e)}`,
        { title: "テキスト読み込みエラー", kind: "error" },
      );
    }
  }, []);

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {wfActive ? (
        /* WF中: 1つのピッカーボタン + ホバードロップダウン */
        <WfDataPickerButton
          textLoaded={textLoaded}
          presetsLoaded={presetsLoaded}
          checkLoaded={checkLoaded}
          onLoadText={handleOpenText}
          onClearText={() => { const v = useUnifiedViewerStore.getState(); v.setTextContent(""); v.setTextFilePath(null); v.setTextHeader([]); v.setTextPages([]); v.setIsDirty(false); }}
          onLoadPreset={() => useViewStore.getState().setJsonBrowserMode("preset")}
          onClearPreset={() => { useUnifiedViewerStore.getState().setFontPresets([]); useUnifiedViewerStore.getState().setPresetJsonPath(null); }}
          onLoadCheck={() => useViewStore.getState().setJsonBrowserMode("check")}
          onClearCheck={() => useUnifiedViewerStore.getState().setCheckData(null)}
        />
      ) : (
        <>
          {/* テキスト */}
          <SmallBtn loaded={textLoaded} icon={FileText} title="テキスト読み込み" clearTitle="クリア"
            onLoad={handleOpenText}
            onClear={() => { const v = useUnifiedViewerStore.getState(); v.setTextContent(""); v.setTextFilePath(null); v.setTextHeader([]); v.setTextPages([]); v.setIsDirty(false); }}
            tooltip={textTooltip}
          />
          {/* 作品情報 */}
          <SmallBtn loaded={presetsLoaded} icon={FileJson} title="作品情報JSON" clearTitle="クリア"
            onLoad={() => useViewStore.getState().setJsonBrowserMode("preset")}
            onClear={() => { useUnifiedViewerStore.getState().setFontPresets([]); useUnifiedViewerStore.getState().setPresetJsonPath(null); }}
            tooltip={presetTooltip}
          />
          {/* 校正JSON */}
          <SmallBtn loaded={checkLoaded} icon={ClipboardCheck} title="校正JSON" clearTitle="クリア"
            onLoad={() => useViewStore.getState().setJsonBrowserMode("check")}
            onClear={() => useUnifiedViewerStore.getState().setCheckData(null)}
            tooltip={checkTooltip}
          />
        </>
      )}
    </div>
  );
}

// ─── 小さなデータ読み込みボタン ───
function SmallBtn({ loaded, icon: Icon, title, clearTitle, onLoad, onClear, tooltip }: {
  loaded: boolean; icon: LucideIcon; title: string; clearTitle: string;
  onLoad: () => void; onClear: () => void;
  tooltip?: string;
}) {
  const bgCls = loaded
    ? "bg-sky-500/15 text-sky-500 hover:bg-sky-500/25"
    : "bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/70";
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={onLoad} className={`h-6 px-1.5 flex items-center justify-center rounded-md transition-colors ${bgCls}`} title={tooltip || title}>
        <Icon className="w-3.5 h-3.5" />
      </button>
      {loaded && (
        <button onClick={onClear} className="w-3.5 h-3.5 flex items-center justify-center rounded text-sky-500 hover:bg-sky-500/15 transition-colors" title={clearTitle}>
          <Check className="w-3 h-3" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

// ─── WF中のデータピッカーボタン（A/Bスタイル: 1つのボタン + ホバードロップダウン） ───
function WfDataPickerButton({
  textLoaded, presetsLoaded, checkLoaded,
  onLoadText, onClearText,
  onLoadPreset, onClearPreset,
  onLoadCheck, onClearCheck,
}: {
  textLoaded: boolean; presetsLoaded: boolean; checkLoaded: boolean;
  onLoadText: () => void; onClearText: () => void;
  onLoadPreset: () => void; onClearPreset: () => void;
  onLoadCheck: () => void; onClearCheck: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  const loadedCount = (textLoaded ? 1 : 0) + (presetsLoaded ? 1 : 0) + (checkLoaded ? 1 : 0);
  const hasAny = loadedCount > 0;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => { clearTimeout((ref.current as any)?._hoverTimer); setHover(true); }}
      onMouseLeave={() => { (ref.current as any)._hoverTimer = setTimeout(() => setHover(false), 300); }}
    >
      {/* メインボタン */}
      <div className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded transition-colors cursor-default ${
        hasAny ? "bg-sky-100 text-sky-600" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
      }`}>
        <span>データ</span>
        {hasAny && (
          <span className="text-[8px] font-bold opacity-70">{loadedCount}/3</span>
        )}
      </div>

      {/* ホバードロップダウン */}
      {hover && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-lg shadow-xl py-1.5 min-w-[220px]">
          {/* テキスト */}
          <div className="px-3 py-1.5 border-b border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><FileText className="w-3 h-3" />テキスト</span>
              {textLoaded && (
                <button onClick={onClearText} className="text-[9px] text-text-muted hover:text-error">クリア</button>
              )}
            </div>
            {textLoaded ? (
              <div className="text-[9px] text-emerald-600 mb-1">✓ 読み込み済み</div>
            ) : (
              <div className="text-[9px] text-text-muted mb-1">未読み込み</div>
            )}
            <button
              onClick={() => { setHover(false); onLoadText(); }}
              className="w-full px-2 py-1 text-[9px] bg-bg-tertiary hover:bg-emerald-50 hover:text-emerald-600 rounded transition-colors"
            >
              {textLoaded ? "別のテキストを読み込む" : "テキストを読み込む"}
            </button>
          </div>

          {/* 作品情報JSON */}
          <div className="px-3 py-1.5 border-b border-border/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-purple-600 flex items-center gap-1"><FileJson className="w-3 h-3" />作品情報JSON</span>
              {presetsLoaded && (
                <button onClick={onClearPreset} className="text-[9px] text-text-muted hover:text-error">クリア</button>
              )}
            </div>
            {presetsLoaded ? (
              <div className="text-[9px] text-purple-600 mb-1">✓ 読み込み済み</div>
            ) : (
              <div className="text-[9px] text-text-muted mb-1">未読み込み</div>
            )}
            <button
              onClick={() => { setHover(false); onLoadPreset(); }}
              className="w-full px-2 py-1 text-[9px] bg-bg-tertiary hover:bg-purple-50 hover:text-purple-600 rounded transition-colors"
            >
              {presetsLoaded ? "別のJSONを読み込む" : "作品情報JSONを読み込む"}
            </button>
          </div>

          {/* 校正JSON */}
          <div className="px-3 py-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" />校正JSON</span>
              {checkLoaded && (
                <button onClick={onClearCheck} className="text-[9px] text-text-muted hover:text-error">クリア</button>
              )}
            </div>
            {checkLoaded ? (
              <div className="text-[9px] text-amber-600 mb-1">✓ 読み込み済み</div>
            ) : (
              <div className="text-[9px] text-text-muted mb-1">未読み込み</div>
            )}
            <button
              onClick={() => { setHover(false); onLoadCheck(); }}
              className="w-full px-2 py-1 text-[9px] bg-bg-tertiary hover:bg-amber-50 hover:text-amber-600 rounded transition-colors"
            >
              {checkLoaded ? "別の校正JSONを読み込む" : "校正JSONを読み込む"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ツールメニュー（ドットメニュー） ───
const TOOL_PROGEN_MODES = [
  { id: "extraction" as const, label: "抽出プロンプト" },
  { id: "formatting" as const, label: "整形プロンプト" },
  { id: "proofreading" as const, label: "校正プロンプト" },
];

const TOOL_INSPECTION_MODES = [
  { id: "diff" as const, label: "差分モード" },
  { id: "parallel" as const, label: "分割ビューアー" },
];

function TopNavToolMenu() {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const scanJsonPath = useScanPsdStore((s) => s.currentJsonFilePath);
  const viewerPresets = useUnifiedViewerStore((s) => s.fontPresets);
  const viewerPresetPath = useUnifiedViewerStore((s) => s.presetJsonPath);
  const hasWorkJson = !!(scanJsonPath || (viewerPresets.length > 0 && viewerPresetPath));

  return (
    <div ref={ref} className="relative" onMouseEnter={() => { clearTimeout((ref.current as any)?._hoverTimer); setHover(true); }} onMouseLeave={() => { (ref.current as any)._hoverTimer = setTimeout(() => setHover(false), 300); }}>
      <button
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${hover ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"}`}
        title="ツール"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.3" /><circle cx="8" cy="3" r="1.3" /><circle cx="13" cy="3" r="1.3" />
          <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
          <circle cx="3" cy="13" r="1.3" /><circle cx="8" cy="13" r="1.3" /><circle cx="13" cy="13" r="1.3" />
        </svg>
      </button>
      {hover && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-lg shadow-xl py-1 min-w-[140px]">
          {useSettingsStore.getState().toolMenuButtons.map((id) => {
            const btn = ALL_NAV_BUTTONS.find((b) => b.id === id);
            if (!btn) return null;
            const Icon = btn.icon;
            return (
              <button key={btn.id} className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors inline-flex items-center gap-1.5" onClick={() => {
                if (btn.id === "layers") { setActiveView("specCheck"); usePsdStore.getState().setSpecViewMode("layers"); }
                else if (btn.id === "layerControl") { setActiveView("layers"); }
                else if (btn.id === "specCheck") { setActiveView("specCheck"); usePsdStore.getState().setSpecViewMode("thumbnails"); }
                else setActiveView(btn.id as any);
                setHover(false);
              }}>
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                {btn.label}
              </button>
            );
          })}
          <div className="border-t border-border/40 my-1" />
          <div className="px-3 py-0.5 text-[9px] text-text-muted/50 font-medium">ProGen</div>
          {TOOL_PROGEN_MODES.map((mode) => (
            <button key={mode.id} className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors" onClick={() => {
              // ツールメニュー経由の場合、前回のWFフラグを必ずクリア
              try {
                localStorage.removeItem("folderSetup_progenMode");
                localStorage.removeItem("progen_wfCheckMode");
              } catch { /* ignore */ }
              // toolMode + screen を progenStore に直接セット（race condition 回避）
              // 初回レンダリング前に screen を更新することで古い画面の popup が表示されるのを防ぐ
              // 注意: proofreading モードでも画面は extraction（ProgenRuleView）を使用
              useProgenStore.getState().setToolMode(mode.id);
              useProgenStore.getState().setScreen(mode.id === "proofreading" ? "extraction" : mode.id);
              useViewStore.getState().setProgenMode(mode.id);
              const _lbl = useScanPsdStore.getState().workInfo.label || (() => { const jp = useScanPsdStore.getState().currentJsonFilePath || useUnifiedViewerStore.getState().presetJsonPath || ""; if (!jp) return ""; const ps = jp.replace(/\//g, "\\").split("\\"); return ps.length >= 2 ? ps[ps.length - 2] : ""; })();
              if (_lbl) useProgenStore.getState().loadMasterRule(_lbl);
              setActiveView("progen");
              setHover(false);
            }}>
              {mode.label}
              {!hasWorkJson && <span className="text-[9px] text-text-muted/50 ml-1">新規</span>}
            </button>
          ))}
          <div className="border-t border-border/40 my-1" />
          <div className="px-3 py-0.5 text-[9px] text-text-muted/50 font-medium inline-flex items-center gap-1">
            <Shield className="w-3 h-3" />
            検版ツール
          </div>
          {TOOL_INSPECTION_MODES.map((mode) => (
            <button
              key={mode.id}
              className="w-full text-left px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              onClick={() => {
                useViewStore.getState().setKenbanViewMode(mode.id);
                setActiveView("inspection");
                setHover(false);
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ナビバーボタン（設定で配置変更可能） ───
function NavBarButtons() {
  const navBarButtons = useSettingsStore((s) => s.navBarButtons);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const activeView = useViewStore((s) => s.activeView);
  const specViewMode = usePsdStore((s) => s.specViewMode);

  // 各ボタン ID → 現在アクティブかどうかの判定。click 側のルーティングと対称に揃える。
  const isActive = (id: string): boolean => {
    if (id === "layers") return activeView === "specCheck" && specViewMode === "layers";
    if (id === "layerControl") return activeView === "layers";
    if (id === "specCheck") return activeView === "specCheck" && specViewMode !== "layers";
    return activeView === id;
  };

  return (
    <>
      {navBarButtons.map((id) => {
        const btn = ALL_NAV_BUTTONS.find((b) => b.id === id);
        if (!btn) return null;
        const Icon = btn.icon;
        const active = isActive(btn.id);
        return (
          <button
            key={btn.id}
            aria-current={active ? "page" : undefined}
            title={btn.label}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              active
                ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
            onClick={() => {
              if (btn.id === "layers") {
                setActiveView("specCheck");
                usePsdStore.getState().setSpecViewMode("layers");
              } else if (btn.id === "layerControl") {
                setActiveView("layers");
              } else if (btn.id === "specCheck") {
                // ホーム（仕様チェック）に戻る時は常にサムネイル表示
                setActiveView("specCheck");
                usePsdStore.getState().setSpecViewMode("thumbnails");
              } else {
                setActiveView(btn.id as any);
              }
            }}
          >
            {Icon && <Icon className="w-4 h-4" />}
          </button>
        );
      })}
    </>
  );
}

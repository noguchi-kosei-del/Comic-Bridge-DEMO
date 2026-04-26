// @ts-nocheck
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FileText, FileJson, ClipboardCheck, Shield, Sparkles, Check, RotateCcw, Home, type LucideIcon } from "lucide-react";
import { useViewStore, validateAndSetABPath } from "../../store/viewStore";
import { usePsdStore } from "../../store/psdStore";
import { useSpecStore } from "../../store/specStore";
import { useAppUpdater } from "../../hooks/useAppUpdater";
import { useUnifiedViewerStore, useTextEditorViewerStore, type FontPresetEntry } from "../../store/unifiedViewerStore";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useProgenStore } from "../../store/progenStore";
import { open as dialogOpen, message as dialogMessage } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { globalLoadFolder } from "../../lib/psdLoaderRegistry";
import { invoke } from "@tauri-apps/api/core";
import type { ProofreadingCheckItem } from "../../types/typesettingCheck";
import { JsonFileBrowser } from "../scanPsd/JsonFileBrowser";
import { CheckJsonBrowser } from "../unified-viewer/UnifiedViewer";
import { useWorkflowStore } from "../../store/workflowStore";
import { SettingsButton } from "./SettingsPanel";
import { useSettingsStore, ALL_NAV_BUTTONS } from "../../store/settingsStore";
import { parseComicPotText } from "../unified-viewer/utils";

export function TopNav() {
  const setActiveView = useViewStore((s) => s.setActiveView);
  const files = usePsdStore((s) => s.files);
  const textLoadedForReset = useUnifiedViewerStore((s) => s.textContent.length > 0 || !!s.textFilePath);
  const textEditorLoadedForReset = useTextEditorViewerStore((s) => s.textContent.length > 0 || !!s.textFilePath);
  const presetsLoadedForReset = useUnifiedViewerStore((s) => s.fontPresets.length > 0 || !!s.presetJsonPath);
  const checkLoadedForReset = useUnifiedViewerStore((s) => !!s.checkData);
  const updater = useAppUpdater();
  const viewerStore = useUnifiedViewerStore();
  const jsonFolderPath = useScanPsdStore((s) => s.jsonFolderPath);
  const jsonBrowserMode = useViewStore((s) => s.jsonBrowserMode);
  const setJsonBrowserMode = useViewStore((s) => s.setJsonBrowserMode);

  // 読み込みリセット用カスタム確認ダイアログ
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const performReset = useCallback(() => {
    const ps = usePsdStore.getState();
    const vs = useUnifiedViewerStore.getState();
    const ts = useTextEditorViewerStore.getState();
    const sp = useSpecStore.getState();
    // PSD フォルダ
    ps.clearFiles();
    ps.setCurrentFolderPath(null);
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
    // 仕様チェック結果（○/× カウント）
    sp.clearCheckResults();
    sp.clearConversionResults();
  }, []);

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
      className="h-10 flex-shrink-0 bg-bg-secondary border-b border-border flex items-center px-3 gap-2 relative z-20 shadow-soft"
      data-tauri-drag-region
    >
      {/* アプリアイコン（左端） */}
      <img
        src="/app-icon.png"
        alt="Comic-Bridge"
        className="w-6 h-6 flex-shrink-0 rounded select-none pointer-events-none"
        draggable={false}
      />

      {/* ホーム + ツール選択メニュー（アイコン右） */}
      {!wfActive && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <HomeNavButton />
          <TopNavToolMenu />
        </div>
      )}

      {/* 区切り線（ツールメニューの右） */}
      {!wfActive && <div className="w-px h-5 bg-border flex-shrink-0" />}

      {!wfActive && (
        <>
          {/* 設定 + フォルダから開く + 読み込みリセット */}
          <div className="flex items-center gap-1 flex-shrink-0">
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
              onClick={() => {
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
                setShowResetConfirm(true);
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

          {/* 区切り線（ツール群とデータボタンの間） */}
          <div className="w-px h-5 bg-border flex-shrink-0" />
        </>
      )}

      {/* データ読み込みボタン — WF中も残す */}
      <TopNavDataButtons />

      {/* 右寄せスペーサー（WF 中も有効） */}
      <div className="flex-1" />

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

      {/* ウインドウコントロール（右端） */}
      <WindowControls />

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


      {/* 読み込みリセット確認ダイアログ（カスタム） */}
      {showResetConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowResetConfirm(false); }}
          >
            <div
              className="bg-bg-secondary border border-error/30 rounded-2xl p-5 shadow-xl w-[340px] space-y-4"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-error/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="text-sm font-bold text-error">読み込みリセット</h3>
                  <p className="text-xs text-text-secondary mt-1">読み込み済みの PSD・テキスト・作品情報 JSON・校正 JSON を全て破棄します。よろしいですか？</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-3 py-2 text-xs font-medium text-text-secondary bg-bg-tertiary rounded-lg hover:bg-bg-elevated transition-colors"
                  autoFocus
                >
                  キャンセル
                </button>
                <button
                  onClick={() => { setShowResetConfirm(false); performReset(); }}
                  className="flex-1 px-3 py-2 text-xs font-medium text-white bg-error rounded-lg hover:bg-error/90 transition-colors shadow-sm shadow-error/30"
                >
                  リセット
                </button>
              </div>
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
          <SmallBtn loaded={textLoaded} icon={FileText} title="テキスト読み込み"
            onLoad={handleOpenText}
            tooltip={textTooltip}
          />
          {/* 作品情報 */}
          <SmallBtn loaded={presetsLoaded} icon={FileJson} title="作品情報JSON"
            onLoad={() => useViewStore.getState().setJsonBrowserMode("preset")}
            tooltip={presetTooltip}
          />
          {/* 校正JSON */}
          <SmallBtn loaded={checkLoaded} icon={ClipboardCheck} title="校正JSON"
            onLoad={() => useViewStore.getState().setJsonBrowserMode("check")}
            tooltip={checkTooltip}
          />
        </>
      )}
    </div>
  );
}

// ─── 小さなデータ読み込みボタン ───
function SmallBtn({ loaded, icon: Icon, title, onLoad, tooltip }: {
  loaded: boolean; icon: LucideIcon; title: string;
  onLoad: () => void;
  tooltip?: string;
}) {
  // 読み込み済みは [Icon ラベル ✓] の単一ボタン。✓ は視覚インジケータのみ（クリア機能なし）。
  // クリックで再読み込み（ファイルピッカーを開く）。
  const bgCls = loaded
    ? "bg-sky-500/15 text-sky-500 hover:bg-sky-500/25"
    : "bg-bg-tertiary text-text-muted hover:bg-bg-elevated";
  return (
    <button
      onClick={onLoad}
      className={`h-6 px-2 inline-flex items-center gap-1 rounded-md transition-colors ${bgCls}`}
      title={tooltip || title}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[10px] font-medium whitespace-nowrap">{title}</span>
      {loaded && <Check className="w-3 h-3 flex-shrink-0" strokeWidth={3} aria-hidden />}
    </button>
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
  // 見た目は PsDesign の save-menu 方式（三角吹き出し / ヘッダー付きセクション）、
  // 開閉はホバー（mouseEnter で開き、mouseLeave でディレイ後に閉じる）
  const [hover, setHover] = useState(false);
  // 閉じアニメ中もマウントを保持するための rendered フラグ
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (hover) {
      setRendered(true);
      return;
    }
    if (!rendered) return;
    const t = window.setTimeout(() => setRendered(false), 160);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover]);
  const ref = useRef<HTMLDivElement>(null);
  const setActiveView = useViewStore((s) => s.setActiveView);
  const scanJsonPath = useScanPsdStore((s) => s.currentJsonFilePath);
  const viewerPresets = useUnifiedViewerStore((s) => s.fontPresets);
  const viewerPresetPath = useUnifiedViewerStore((s) => s.presetJsonPath);
  const hasWorkJson = !!(scanJsonPath || (viewerPresets.length > 0 && viewerPresetPath));

  const itemCls =
    "flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-text-primary bg-transparent hover:bg-bg-tertiary transition-colors text-left";
  const sectionHeaderCls =
    "px-3.5 pt-1 pb-1.5 text-[11px] text-text-muted border-b border-border mb-1 inline-flex items-center gap-1.5 w-full";

  return (
    <div
      ref={ref}
      className="relative flex-shrink-0"
      onMouseEnter={() => { clearTimeout((ref.current as any)?._hoverTimer); setHover(true); }}
      onMouseLeave={() => { (ref.current as any)._hoverTimer = setTimeout(() => setHover(false), 300); }}
      aria-haspopup="menu"
      aria-expanded={hover}
    >
      <button
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
          hover ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
        }`}
        title="ツール"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="3" r="1.3" /><circle cx="8" cy="3" r="1.3" /><circle cx="13" cy="3" r="1.3" />
          <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
          <circle cx="3" cy="13" r="1.3" /><circle cx="8" cy="13" r="1.3" /><circle cx="13" cy="13" r="1.3" />
        </svg>
      </button>
      {rendered && (
        <div
          role="menu"
          className={`absolute left-0 top-full mt-3 z-[1000] min-w-[220px] bg-bg-secondary border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-text-primary ${
            hover ? "animate-dropdown-down" : "animate-dropdown-down-close pointer-events-none"
          }`}
        >
          {/* 三角吹き出し（上向き、トリガーボタン中心を指す。overflow 外に配置して clip 回避）
              ボタン (w-7=28px) の中心 14px に tip を合わせる: left 8px + borderLeft 6px = 14px */}
          <span
            aria-hidden="true"
            className="absolute -top-[7px] left-2 w-0 h-0 pointer-events-none z-10"
            style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "7px solid var(--cb-border-color, #d5d9e0)" }}
          />
          <span
            aria-hidden="true"
            className="absolute -top-[6px] left-2 w-0 h-0 pointer-events-none z-10"
            style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "7px solid var(--cb-menu-bg, #ffffff)" }}
          />
          {/* 内側スクロール領域 */}
          <div className="max-h-[35vh] overflow-auto py-1.5 rounded-lg">
            <div className={sectionHeaderCls}>ツール</div>
            {ALL_NAV_BUTTONS.filter((b) => b.id !== "specCheck").map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.id}
                  role="menuitem"
                  className={itemCls}
                  onClick={() => {
                    useViewStore.getState().slideToTool(() => {
                      if (btn.id === "layers") { setActiveView("specCheck"); usePsdStore.getState().setSpecViewMode("layers"); }
                      else if (btn.id === "layerControl") { setActiveView("layers"); }
                      else setActiveView(btn.id as any);
                    });
                    setHover(false);
                  }}
                >
                  {Icon && <Icon className="w-4 h-4 flex-shrink-0 text-text-secondary" />}
                  <span className="flex-1">{btn.label}</span>
                </button>
              );
            })}

            <div className={`${sectionHeaderCls} mt-1`}>
              <Sparkles className="w-3 h-3" />
              ProGen
            </div>
            {TOOL_PROGEN_MODES.map((mode) => (
              <button
                key={mode.id}
                role="menuitem"
                className={itemCls}
                onClick={() => {
                  useViewStore.getState().slideToTool(() => {
                    try {
                      localStorage.removeItem("folderSetup_progenMode");
                      localStorage.removeItem("progen_wfCheckMode");
                    } catch { /* ignore */ }
                    useProgenStore.getState().setToolMode(mode.id);
                    useProgenStore.getState().setScreen(mode.id === "proofreading" ? "extraction" : mode.id);
                    useViewStore.getState().setProgenMode(mode.id);
                    const _lbl = useScanPsdStore.getState().workInfo.label || (() => {
                      const jp = useScanPsdStore.getState().currentJsonFilePath || useUnifiedViewerStore.getState().presetJsonPath || "";
                      if (!jp) return "";
                      const ps = jp.replace(/\//g, "\\").split("\\");
                      return ps.length >= 2 ? ps[ps.length - 2] : "";
                    })();
                    if (_lbl) useProgenStore.getState().loadMasterRule(_lbl);
                    setActiveView("progen");
                  });
                  setHover(false);
                }}
              >
                <span className="w-4 flex-shrink-0" />
                <span className="flex-1">{mode.label}</span>
                {!hasWorkJson && <span className="text-[10px] text-text-muted font-mono">新規</span>}
              </button>
            ))}

            <div className={`${sectionHeaderCls} mt-1`}>
              <Shield className="w-3 h-3" />
              検版ツール
            </div>
            {TOOL_INSPECTION_MODES.map((mode) => (
              <button
                key={mode.id}
                role="menuitem"
                className={itemCls}
                onClick={() => {
                  useViewStore.getState().slideToTool(() => {
                    useViewStore.getState().setKenbanViewMode(mode.id);
                    setActiveView("inspection");
                  });
                  setHover(false);
                }}
              >
                <span className="w-4 flex-shrink-0" />
                <span className="flex-1">{mode.label}</span>
              </button>
            ))}
          </div>
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
                : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            }`}
            onClick={() => {
              if (btn.id === "layers") {
                setActiveView("specCheck");
                usePsdStore.getState().setSpecViewMode("layers");
              } else if (btn.id === "layerControl") {
                setActiveView("layers");
              } else if (btn.id === "specCheck") {
                // ホームへはアニメ付きで遷移（どのビューからでも）
                useViewStore.getState().goToHomeWithExit();
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

// ─── ホームボタン（読み込みリセットの右） ───
function HomeNavButton() {
  const activeView = useViewStore((s) => s.activeView);
  const specViewMode = usePsdStore((s) => s.specViewMode);
  const active = activeView === "specCheck" && specViewMode !== "layers";

  return (
    <button
      aria-current={active ? "page" : undefined}
      title="ホーム"
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
        active
          ? "bg-accent/15 text-accent ring-1 ring-accent/40"
          : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
      }`}
      onClick={() => useViewStore.getState().goToHomeWithExit()}
    >
      <Home className="w-4 h-4" />
    </button>
  );
}

// ─── ウインドウコントロール（右端: 最小化 / 最大化 / 閉じる） ───
function WindowControls() {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    const w = getCurrentWindow();
    w.isMaximized().then(setIsMax).catch(() => {});
    const unlistenPromise = w.onResized(() => {
      w.isMaximized().then(setIsMax).catch(() => {});
    });
    return () => { unlistenPromise.then((fn) => fn()).catch(() => {}); };
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize().catch(() => {});
  const handleToggleMax = () => getCurrentWindow().toggleMaximize().catch(() => {});
  const handleClose = () => getCurrentWindow().close().catch(() => {});

  const btnBase =
    "no-glass w-11 h-10 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors";

  return (
    <div className="flex items-center flex-shrink-0 -mr-3 h-full" data-tauri-drag-region={false}>
      <button onClick={handleMinimize} className={btnBase} title="最小化" aria-label="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2" y="6" width="8" height="1" fill="currentColor" />
        </svg>
      </button>
      <button onClick={handleToggleMax} className={btnBase} title={isMax ? "元に戻す" : "最大化"} aria-label={isMax ? "元に戻す" : "最大化"}>
        {isMax ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="3.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="2.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        onClick={handleClose}
        className="no-glass w-11 h-10 flex items-center justify-center text-text-muted hover:text-white hover:bg-[#e81123] transition-colors"
        title="閉じる"
        aria-label="閉じる"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Folder, FolderOpen, Pencil, ScanLine, PlayCircle } from "lucide-react";
import { usePsdStore } from "../../store/psdStore";
import { useSpecStore } from "../../store/specStore";
import { useViewStore } from "../../store/viewStore";
import { useGuideStore } from "../../store/guideStore";
import { useWorkflowStore, WORKFLOWS, type Workflow } from "../../store/workflowStore";
import { ALL_NAV_BUTTONS } from "../../store/settingsStore";
import { usePsdLoader } from "../../hooks/usePsdLoader";
import { useHighResPreview } from "../../hooks/useHighResPreview";
import { useSpecChecker } from "../../hooks/useSpecChecker";
import { executeStepNav, ProofLoadOverlay } from "../layout/WorkflowBar";
import { TextExtractButton } from "../common/TextExtractButton";
import { SpecScanJsonDialog } from "../spec-checker/SpecScanJsonDialog";

// ═══ タイルグリッドのタブ定義 ═══
type TileTabId = "all" | "ingest" | "proof" | "whiteout" | "tiff";

interface TileTab {
  id: TileTabId;
  label: string;
  /** null = すべて表示、配列 = その順で表示 */
  navIds: string[] | null;
}

const TILE_TABS: TileTab[] = [
  { id: "all", label: "すべて", navIds: null },
  { id: "ingest", label: "入稿", navIds: ["progen", "textEditor", "split", "layerControl", "requestPrep"] },
  { id: "proof", label: "初稿確認", navIds: ["inspection", "textEditor", "layers", "layerControl", "unifiedViewer", "progen"] },
  { id: "whiteout", label: "差し替え", navIds: ["replace", "compose", "inspection"] },
  { id: "tiff", label: "TIFF化", navIds: ["tiff", "scanPsd", "inspection"] },
];

export function HomeLayout() {
  const setSpecViewMode = usePsdStore((s) => s.setSpecViewMode);
  const files = usePsdStore((s) => s.files);
  const setCurrentFolderPath = usePsdStore((s) => s.setCurrentFolderPath);
  const currentFolderPath = usePsdStore((s) => s.currentFolderPath);

  const specifications = useSpecStore((s) => s.specifications);
  const activeSpecId = useSpecStore((s) => s.activeSpecId);
  const selectSpecAndCheck = useSpecStore((s) => s.selectSpecAndCheck);
  const checkResults = useSpecStore((s) => s.checkResults);

  const activeWorkflow = useWorkflowStore((s) => s.activeWorkflow);

  const setActiveView = useViewStore((s) => s.setActiveView);
  const setKenbanViewMode = useViewStore((s) => s.setKenbanViewMode);

  const openEditor = useGuideStore((s) => s.openEditor);

  const { loadFolder } = usePsdLoader();

  // 仕様チェックの自動実行（ファイル/仕様変更に応じて checkResults を更新）
  useSpecChecker();

  // 読み込み時にカラーモード多数派へ自動切替（フォルダ単位で 1 回だけ）
  const autoSelectedFolderRef = useRef<string | null>(null);
  useEffect(() => {
    const folderKey = currentFolderPath || "";
    if (folderKey !== autoSelectedFolderRef.current) {
      // フォルダが変わったら再判定できるようにリセット
      autoSelectedFolderRef.current = null;
    }
    if (autoSelectedFolderRef.current === folderKey) return;
    const withMeta = files.filter((f) => f.metadata);
    if (withMeta.length === 0) return;
    let mono = 0;
    let color = 0;
    for (const f of withMeta) {
      const cm = f.metadata?.colorMode;
      if (cm === "Grayscale") mono++;
      else if (cm === "RGB" || cm === "CMYK") color++;
    }
    if (mono === 0 && color === 0) return;
    const target = mono >= color ? "mono-spec" : "color-spec";
    if (activeSpecId !== target) {
      selectSpecAndCheck(target);
    }
    autoSelectedFolderRef.current = folderKey;
  }, [files, currentFolderPath, activeSpecId, selectSpecAndCheck]);

  const [isDragOver, setIsDragOver] = useState(false);
  const [wfPickerOpen, setWfPickerOpen] = useState(false);
  const [showProofLoadOverlay, setShowProofLoadOverlay] = useState(false);
  const [activeTileTab, setActiveTileTab] = useState<TileTabId>("all");

  // タイルタブの sliding indicator (選択中タブの背景 pill が左右にスライド)
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<TileTabId, HTMLButtonElement | null>>({
    all: null, ingest: null, proof: null, whiteout: null, tiff: null,
  });
  const [tabPillStyle, setTabPillStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0, width: 0, ready: false,
  });
  useEffect(() => {
    const update = () => {
      const tabEl = tabRefs.current[activeTileTab];
      const containerEl = tabsContainerRef.current;
      if (!tabEl || !containerEl) return;
      const tabRect = tabEl.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      setTabPillStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
        ready: true,
      });
    };
    update();
    const containerEl = tabsContainerRef.current;
    if (!containerEl) return;
    const ro = new ResizeObserver(update);
    ro.observe(containerEl);
    Object.values(tabRefs.current).forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [activeTileTab]);
  const [showScanJsonInPanel, setShowScanJsonInPanel] = useState(false);
  const [tachimiError, setTachimiError] = useState<string | null>(null);

  // 退場アニメーション
  //   toDetail: 右 → 左 スライド（詳細▶）
  //   toTile:   下 → 上 スライド（タイルクリック）
  const [exitDirection, setExitDirection] = useState<"none" | "toDetail" | "toTile">("none");
  const exitTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
  }, []);
  const goToDetail = () => {
    if (exitDirection !== "none") return;
    setExitDirection("toDetail");
    exitTimerRef.current = window.setTimeout(() => {
      setSpecViewMode("thumbnails");
    }, 300);
  };
  const goToTile = (id: string) => {
    if (exitDirection !== "none") return;
    setExitDirection("toTile");
    exitTimerRef.current = window.setTimeout(() => {
      navigateTo(id);
    }, 300);
  };

  // Tachimi 起動（PDF化）
  const handleLaunchTachimi = async () => {
    setTachimiError(null);
    try {
      const filePaths = files.map((f) => f.filePath).filter(Boolean);
      if (filePaths.length === 0) return;
      await invoke("launch_tachimi", { filePaths });
    } catch (e) {
      setTachimiError(String(e));
    }
  };

  const passedCount = Array.from(checkResults.values()).filter((r) => r.passed).length;
  const failedCount = Array.from(checkResults.values()).filter((r) => !r.passed).length;

  const firstFile = files[0];

  // 高解像度プレビュー（viewer と同等の画質）
  const {
    imageUrl: previewUrl,
    isLoading: previewLoading,
  } = useHighResPreview(firstFile?.filePath, {
    maxSize: 1200,
    enabled: !!firstFile,
  });

  const thumbnailReady = !!previewUrl;
  const thumbnailLoading = previewLoading && !previewUrl;

  const folderName = currentFolderPath
    ? currentFolderPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || currentFolderPath
    : "";

  const handlePickFolder = async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    if (!path) return;
    const p = (path as string).replace(/\/+$|\\+$/g, "");
    setCurrentFolderPath(p);
    try {
      await loadFolder(p);
    } catch {
      /* ignore */
    }
  };

  // 右カラム: 各タイルクリック時の遷移処理。TopNav の NavBarButtons / TopNavToolMenu と同じ分岐。
  const navigateTo = (id: string) => {
    if (id === "layers") {
      setActiveView("specCheck");
      usePsdStore.getState().setSpecViewMode("layers");
    } else if (id === "layerControl") {
      setActiveView("layers");
    } else if (id === "specCheck") {
      // 自分自身（ホーム）— 詳細サムネビューへ
      setActiveView("specCheck");
      usePsdStore.getState().setSpecViewMode("thumbnails");
    } else if (id === "inspection") {
      setKenbanViewMode("diff");
      setActiveView("inspection");
    } else {
      setActiveView(id as any);
    }
  };

  // タブに応じたタイル一覧を算出。"すべて" はホーム自身を除いた全項目（ALL_NAV_BUTTONS 順）。
  // それ以外はタブ定義の navIds 順に ALL_NAV_BUTTONS を引いて並べる。
  const currentTab = TILE_TABS.find((t) => t.id === activeTileTab) ?? TILE_TABS[0];
  const tileButtons = currentTab.navIds === null
    ? ALL_NAV_BUTTONS.filter((b) => b.id !== "specCheck")
    : currentTab.navIds
        .map((id) => ALL_NAV_BUTTONS.find((b) => b.id === id))
        .filter((b): b is (typeof ALL_NAV_BUTTONS)[number] => !!b);

  const handleSelectWorkflow = (wf: Workflow) => {
    useWorkflowStore.getState().startWorkflow(wf);
    // ワークフロー入場アニメ: ViewRouter ラッパー全体が奥 → 手前にズームイン
    useViewStore.getState().triggerWorkflowEnter();
    setWfPickerOpen(false);
    if (wf.id === "proof") {
      setShowProofLoadOverlay(true);
      return;
    }
    if (wf.steps[0]?.nav) executeStepNav(wf.steps[0]);
  };

  return (
    <div
      className={`flex flex-col h-full overflow-hidden transition-all duration-300 ease-in ${
        exitDirection === "toDetail"
          ? "-translate-x-8 opacity-0"
          : exitDirection === "toTile"
            ? "-translate-y-8 opacity-0"
            : "translate-x-0 translate-y-0 opacity-100"
      }`}
    >
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-auto">
        {/* ═══ LEFT COLUMN ═══ */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* ステータス行 */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {specifications.length > 0 && (
              <div
                className={`inline-flex items-center bg-bg-tertiary rounded-full p-0.5 border border-border/50 flex-shrink-0 transition-opacity ${
                  files.length === 0 ? "opacity-40 pointer-events-none" : ""
                }`}
                role="group"
                aria-label="原稿仕様切替"
                aria-disabled={files.length === 0}
                title={files.length === 0 ? "PSD を読み込むと選択できます" : undefined}
              >
                {[
                  { id: "mono-spec", label: "モノクロ" },
                  { id: "color-spec", label: "カラー" },
                ].map((opt) => {
                  const active = activeSpecId === opt.id;
                  const disabled = files.length === 0;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => selectSpecAndCheck(opt.id)}
                      disabled={disabled}
                      className={`px-3 py-0.5 text-[10px] font-medium rounded-full transition-all ${
                        disabled
                          ? "text-text-muted cursor-not-allowed"
                          : active
                            ? "bg-gradient-to-r from-accent to-accent-hover text-white shadow-sm"
                            : "text-text-secondary hover:text-text-primary"
                      }`}
                      aria-pressed={active}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-text-muted">{files.length} ファイル</span>
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
            </div>

            <div className="flex-1" />

            <button
              onClick={goToDetail}
              className="px-3 py-1 text-[11px] rounded bg-bg-tertiary border border-border/50 hover:bg-bg-elevated text-text-primary transition-colors flex-shrink-0"
              title="詳細（サムネグリッド）表示へ"
            >
              詳細 ▶
            </button>
          </div>

          {/* サムネ/ドロップゾーン */}
          <div
            onClick={handlePickFolder}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={() => setIsDragOver(false)}
            className={`group relative flex-1 min-h-[240px] rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden ${
              isDragOver
                ? "border-accent bg-accent/10"
                : "border-text-muted/20 hover:border-accent/40 hover:bg-accent/5"
            }`}
            title={files.length > 0 ? "クリックでフォルダを再選択" : "クリックでフォルダを選択"}
          >
            {files.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <div className="w-20 h-20 mb-4 rounded-3xl flex items-center justify-center bg-bg-tertiary">
                  <Folder className="w-10 h-10 text-folder" />
                </div>
                <p className="text-base font-display font-medium mb-1 text-text-primary">
                  フォルダを選択、またはドラッグ＆ドロップ
                </p>
                <p className="text-xs text-text-muted">
                  クリックでフォルダ選択ダイアログを開きます
                </p>
              </div>
            ) : (
              <>
                {thumbnailReady ? (
                  <img
                    src={previewUrl || undefined}
                    alt={firstFile.fileName}
                    className="w-full h-full object-contain bg-bg-primary"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                    {thumbnailLoading ? (
                      <>
                        <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin mb-2" />
                        <span className="text-xs">サムネ生成中…</span>
                      </>
                    ) : (
                      <>
                        <Folder className="w-10 h-10 mb-2" />
                        <span className="text-xs">サムネを表示できません</span>
                      </>
                    )}
                  </div>
                )}
                {/* 読込済みバッジ + 再選択オーバーレイ */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/50 text-white text-[10px] backdrop-blur-sm pointer-events-none max-w-[70%] truncate">
                  {folderName}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity pointer-events-none">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary/90 text-text-primary text-xs font-medium shadow-lg">
                    <FolderOpen className="w-4 h-4" />
                    フォルダを変更
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ワークフロー大ボタン */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setWfPickerOpen((v) => !v)}
              disabled={!!activeWorkflow}
              className={`w-full py-4 rounded-2xl text-white text-lg font-bold shadow-card transition-shadow flex items-center justify-center gap-2.5 ${
                activeWorkflow
                  ? "bg-bg-tertiary text-text-muted cursor-not-allowed opacity-60"
                  : "bg-gradient-to-br from-accent to-accent-secondary btn-shine"
              }`}
              title={activeWorkflow ? "ワークフロー進行中" : "ワークフローを開始"}
            >
              <span className="relative z-[1] inline-flex items-center gap-2.5">
                <PlayCircle className="w-6 h-6" strokeWidth={2.25} />
                {activeWorkflow ? `WF 進行中: ${activeWorkflow.name}` : "ワークフロー"}
              </span>
            </button>

            {wfPickerOpen && !activeWorkflow && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setWfPickerOpen(false)}
                />
                <div className="absolute left-0 right-0 bottom-full mb-2 z-50 bg-bg-secondary border border-border rounded-xl shadow-elevated py-1 max-h-[50vh] overflow-auto">
                  {WORKFLOWS.map((wf) => (
                    <button
                      key={wf.id}
                      className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
                      onClick={() => handleSelectWorkflow(wf)}
                    >
                      <span className="text-sm">{wf.icon}</span>
                      <span className="font-medium">{wf.name}</span>
                      <span className="text-[10px] text-text-muted ml-auto">
                        {wf.steps.length}工程
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: ツールタイルグリッド（Chrome 風タブ） ═══ */}
        <div className="flex flex-col min-h-[300px]">
          {/* Chrome 風 タブバー — 選択中タブの背景 pill が左右にスライド */}
          <div
            ref={tabsContainerRef}
            className="flex items-end px-2 pt-1 relative z-10"
            role="tablist"
            aria-label="タイル カテゴリ"
          >
            {/* スライディング pill（選択中タブの背景、コンテンツパネルと同色で同化） */}
            <div
              aria-hidden
              className="absolute bottom-0 -mb-px bg-bg-secondary border border-b-0 border-border rounded-t-lg pointer-events-none transition-all duration-300 ease-out"
              style={{
                left: `${tabPillStyle.left}px`,
                width: `${tabPillStyle.width}px`,
                top: "0.25rem",
                opacity: tabPillStyle.ready ? 1 : 0,
              }}
            />
            {TILE_TABS.map((tab) => {
              const active = tab.id === activeTileTab;
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el; }}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTileTab(tab.id)}
                  className={`no-glass relative z-20 px-4 py-2 text-xs font-medium bg-transparent transition-colors ${
                    active
                      ? "text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* コンテンツパネル（アクティブタブの下辺と自然に接続） */}
          <div className="flex-1 rounded-2xl rounded-tl-none bg-bg-secondary border border-border p-4 overflow-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 auto-rows-fr content-start">
              {tileButtons.map((btn) => {
                const Icon = btn.icon;
                return (
                  <button
                    key={btn.id}
                    onClick={() => goToTile(btn.id)}
                    title={btn.label}
                    className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl bg-bg-primary border border-border hover:border-accent/40 hover:bg-accent/5 shadow-soft hover:shadow-card transition-all group"
                  >
                    {Icon && (
                      <Icon className="w-8 h-8 text-text-secondary group-hover:text-accent transition-colors" />
                    )}
                    <span className="text-sm font-medium text-text-primary text-center">
                      {btn.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* アクション行（ガイド編集 / PDF化 / 簡易スキャン / テキスト抽出）— 常時表示 */}
          <div className="grid grid-cols-4 gap-2 flex-shrink-0 mt-3">
            <ActionButton
              icon={<Pencil className="w-4 h-4" />}
              label="ガイドを編集"
              colorClass="border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              onClick={openEditor}
            />
            <ActionButton
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
              label="PDF化"
              colorClass="border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              onClick={handleLaunchTachimi}
              title="Tachimiを起動してPDF作成"
            />
            <ActionButton
              icon={<ScanLine className="w-4 h-4" />}
              label="簡易スキャン"
              colorClass="border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              onClick={() => setShowScanJsonInPanel(true)}
              title="読み込み中のPSDからフォント・ガイド・テキスト情報をJSONに登録"
            />
            {files.length > 0 ? (
              <div className="[&>div]:w-full [&>div>button]:w-full [&>div>button]:!border-border [&>div>button]:!text-text-secondary [&>div>button:hover]:!text-text-primary [&>div>button:hover]:!shadow-none">
                <TextExtractButton compact files={files} />
              </div>
            ) : (
              <ActionButton
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v5a1 1 0 001 1h5" />
                  </svg>
                }
                label="テキスト抽出"
                colorClass="border-border text-text-secondary opacity-50 cursor-not-allowed"
                onClick={() => {}}
                title="PSD を読み込んでください"
              />
            )}
          </div>
        </div>
      </div>

      {/* 初校データ読み込みオーバーレイ */}
      {showProofLoadOverlay && (
        <ProofLoadOverlay
          onClose={() => {
            setShowProofLoadOverlay(false);
            useWorkflowStore.getState().abortWorkflow();
          }}
          onProceed={() => {
            setShowProofLoadOverlay(false);
            const wf = useWorkflowStore.getState().activeWorkflow;
            const step = wf?.steps[0];
            if (step?.nav) executeStepNav(step);
          }}
        />
      )}

      {/* 簡易スキャン（JSON登録）モーダル */}
      {showScanJsonInPanel && (
        <SpecScanJsonDialog
          onClose={() => setShowScanJsonInPanel(false)}
          targetFiles={files}
        />
      )}

      {/* Tachimi 起動エラー（右下トースト） */}
      {tachimiError && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-xl bg-error/10 border border-error/30 text-xs text-error max-w-xs z-50 shadow-elevated">
          {tachimiError}
          <button onClick={() => setTachimiError(null)} className="ml-2 underline">
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

// ─── アクションボタン（右カラム下 4 列アクション行用、TextExtractButton compact と同サイズ） ───
function ActionButton({ icon, label, colorClass, onClick, title }: {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`h-8 px-3 text-sm font-bold rounded-xl shadow-2xl transition-all duration-200 flex items-center justify-center gap-1 whitespace-nowrap bg-bg-secondary border-2 active:scale-[0.97] ${colorClass}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

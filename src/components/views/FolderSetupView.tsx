import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";

const DEFAULT_COPY_DEST = "1_原稿";

function loadSetting(key: string, fallback: string): string {
  try { return localStorage.getItem(`folderSetup_${key}`) || fallback; } catch { return fallback; }
}
function saveSetting(key: string, value: string) {
  try { localStorage.setItem(`folderSetup_${key}`, value); } catch { /* ignore */ }
}
function loadStructure(key: string): string[] {
  try {
    const raw = localStorage.getItem(`folderSetup_struct_${key}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function saveStructure(key: string, folders: string[]) {
  try { localStorage.setItem(`folderSetup_struct_${key}`, JSON.stringify(folders)); } catch { /* ignore */ }
}

// デフォルト構造
const DEFAULT_NEW = ["1_原稿","2_写植","3_写植校了","4_TIFF","5_校正","6_白消しPSD","7_次回予告","8_あらすじ","9_表紙"];
const DEFAULT_SEQUEL = ["1_原稿","2_写植","3_写植校了","4_TIFF","5_校正","6_白消しPSD"];

export function FolderSetupView() {
  const [sourcePath, setSourcePath] = useState("");
  const [mode, setMode] = useState<"new" | "sequel">("new");
  const [destBase, setDestBase] = useState("");
  const [extractedNumber, setExtractedNumber] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [processing, setProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 設定
  const [newTemplatePath, setNewTemplatePath] = useState(loadSetting("newTemplatePath", ""));
  const [sequelTemplatePath, setSequelTemplatePath] = useState(loadSetting("sequelTemplatePath", ""));
  const [newStructure, setNewStructure] = useState<string[]>(() => {
    const saved = loadStructure("new");
    return saved.length > 0 ? saved : DEFAULT_NEW;
  });
  const [sequelStructure, setSequelStructure] = useState<string[]>(() => {
    const saved = loadStructure("sequel");
    return saved.length > 0 ? saved : DEFAULT_SEQUEL;
  });
  const [copyDest, setCopyDest] = useState(loadSetting("copyDest", DEFAULT_COPY_DEST));

  // D&Dでフォルダ構造を取得
  const handleDropStructure = useCallback(async (type: "new" | "sequel", folderPath: string) => {
    try {
      const contents = await invoke<{ folders: string[]; json_files: string[] }>("list_folder_contents", { folderPath });
      const folders = contents.folders.sort();
      if (folders.length === 0) { alert("サブフォルダが見つかりませんでした"); return; }
      if (type === "new") {
        setNewStructure(folders);
        saveStructure("new", folders);
      } else {
        setSequelStructure(folders);
        saveStructure("sequel", folders);
      }
    } catch (e) {
      alert("フォルダ構造の取得に失敗しました: " + String(e));
    }
  }, []);

  // アドレスペースト時にフォルダ名から数字を抽出
  const handleSourceChange = useCallback((val: string) => {
    setSourcePath(val.trim());
    const folderName = val.trim().replace(/\\/g, "/").split("/").pop() || "";
    const match = folderName.match(/(\d+)/);
    setExtractedNumber(match ? match[1] : "");
    setStatus({ type: "idle", message: "" });
  }, []);

  const handlePaste = useCallback(async () => {
    try { const text = await navigator.clipboard.readText(); if (text) handleSourceChange(text); } catch { /* ignore */ }
  }, [handleSourceChange]);

  const handleBrowseSource = useCallback(async () => {
    const path = await dialogOpen({ directory: true, multiple: false, title: "コピー元フォルダを選択" });
    if (path) handleSourceChange(path as string);
  }, [handleSourceChange]);

  const handleBrowseDest = useCallback(async () => {
    const path = await dialogOpen({ directory: true, multiple: false, title: "コピー先ベースフォルダを選択" });
    if (path) setDestBase(path as string);
  }, []);

  // 実行
  const handleExecute = useCallback(async () => {
    if (!sourcePath || !destBase) { setStatus({ type: "error", message: "コピー元とコピー先を指定してください" }); return; }
    const number = extractedNumber || "0";
    const structure = mode === "new" ? newStructure : sequelStructure;
    const templatePath = mode === "new" ? newTemplatePath : sequelTemplatePath;

    setProcessing(true);
    setStatus({ type: "idle", message: "処理中..." });

    try {
      const numberFolder = `${destBase}\\${number}`;

      if (templatePath) {
        // テンプレートフォルダからコピー
        await invoke<number>("copy_folder", { source: templatePath, destination: numberFolder });
      } else {
        // 保存済み構造からフォルダ作成
        for (const folder of structure) {
          await invoke("write_text_file", { filePath: `${numberFolder}\\${folder}\\.keep`, content: "" });
        }
      }

      // ソースフォルダをフォルダ名ごと指定サブフォルダにコピー
      const sourceFolderName = sourcePath.replace(/\\/g, "/").split("/").pop() || "";
      const copyDestFolder = `${numberFolder}\\${copyDest}\\${sourceFolderName}`;
      const copiedCount = await invoke<number>("copy_folder", { source: sourcePath, destination: copyDestFolder });

      setStatus({ type: "success", message: `完了: ${number}フォルダを作成し、${copiedCount}ファイルを${copyDest}/${sourceFolderName}にコピーしました` });
      await invoke("open_folder_in_explorer", { folderPath: numberFolder }).catch(() => {});
    } catch (e) {
      setStatus({ type: "error", message: `エラー: ${String(e)}` });
    }
    setProcessing(false);
  }, [sourcePath, destBase, extractedNumber, mode, newStructure, sequelStructure, newTemplatePath, sequelTemplatePath, copyDest]);

  const saveAllSettings = () => {
    saveSetting("newTemplatePath", newTemplatePath);
    saveSetting("sequelTemplatePath", sequelTemplatePath);
    saveSetting("copyDest", copyDest);
    saveStructure("new", newStructure);
    saveStructure("sequel", sequelStructure);
    setShowSettings(false);
  };

  // D&Dハンドラ
  const makeDropHandler = (type: "new" | "sequel") => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      // TauriのドロップはdataTransferにパスが入らないので、ダイアログで代替
      const path = await dialogOpen({ directory: true, multiple: false, title: "フォルダ構造を取得するフォルダを選択" });
      if (path) handleDropStructure(type, path as string);
    },
  });

  return (
    <div className="h-full flex flex-col bg-bg-primary overflow-auto">
      <div className="max-w-[600px] mx-auto w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text-primary">フォルダセットアップ</h1>
            <p className="text-xs text-text-muted mt-1">原稿フォルダを作業フォルダにコピー＋フォルダ構造を作成</p>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1.5 text-[10px] rounded-lg bg-bg-tertiary hover:bg-bg-elevated text-text-secondary border border-border/50 transition-colors">
            {showSettings ? "閉じる" : "設定"}
          </button>
        </div>

        {/* 設定パネル */}
        {showSettings && (
          <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-4">
            <h3 className="text-xs font-bold text-text-primary">テンプレート設定</h3>

            {/* 新作 */}
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-text-primary">新作</label>
              <div>
                <label className="text-[9px] text-text-muted block mb-1">テンプレートフォルダ（空ならフォルダ構造を使用）</label>
                <input type="text" value={newTemplatePath} onChange={(e) => setNewTemplatePath(e.target.value)}
                  className="w-full text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="未指定（フォルダ構造を使用）" />
              </div>
              <div>
                <label className="text-[9px] text-text-muted block mb-1">フォルダ構造（クリックでフォルダから取得）</label>
                <div
                  className="p-2 bg-bg-primary border border-dashed border-border rounded cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-colors"
                  onClick={async () => {
                    const path = await dialogOpen({ directory: true, multiple: false, title: "新作用: フォルダ構造を取得" });
                    if (path) handleDropStructure("new", path as string);
                  }}
                >
                  {newStructure.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {newStructure.map((f) => (
                        <span key={f} className="px-1.5 py-0.5 text-[9px] bg-accent/10 text-accent rounded">{f}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-text-muted text-center py-2">クリックしてフォルダ構造を取得</p>
                  )}
                </div>
              </div>
            </div>

            {/* 続話 */}
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-text-primary">続話</label>
              <div>
                <label className="text-[9px] text-text-muted block mb-1">テンプレートフォルダ（空ならフォルダ構造を使用）</label>
                <input type="text" value={sequelTemplatePath} onChange={(e) => setSequelTemplatePath(e.target.value)}
                  className="w-full text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="未指定（フォルダ構造を使用）" />
              </div>
              <div>
                <label className="text-[9px] text-text-muted block mb-1">フォルダ構造（クリックでフォルダから取得）</label>
                <div
                  className="p-2 bg-bg-primary border border-dashed border-border rounded cursor-pointer hover:border-accent-secondary/40 hover:bg-accent-secondary/5 transition-colors"
                  onClick={async () => {
                    const path = await dialogOpen({ directory: true, multiple: false, title: "続話用: フォルダ構造を取得" });
                    if (path) handleDropStructure("sequel", path as string);
                  }}
                >
                  {sequelStructure.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {sequelStructure.map((f) => (
                        <span key={f} className="px-1.5 py-0.5 text-[9px] bg-accent-secondary/10 text-accent-secondary rounded">{f}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-text-muted text-center py-2">クリックしてフォルダ構造を取得</p>
                  )}
                </div>
              </div>
            </div>

            {/* コピー先サブフォルダ */}
            <div>
              <label className="text-[9px] text-text-muted block mb-1">コピー先サブフォルダ名</label>
              <input type="text" value={copyDest} onChange={(e) => setCopyDest(e.target.value)}
                className="w-full text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="例: 1_原稿" />
            </div>

            <button onClick={saveAllSettings}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors">
              設定を保存
            </button>
          </div>
        )}

        {/* Step 1: コピー元 */}
        <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-xs font-medium text-text-primary">コピー元フォルダ</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={sourcePath} onChange={(e) => handleSourceChange(e.target.value)}
              className="flex-1 text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="フォルダパスを貼り付け..." />
            <button onClick={handlePaste} className="px-2 py-1.5 text-[10px] bg-bg-tertiary border border-border/50 rounded hover:bg-bg-elevated text-text-secondary">貼付</button>
            <button onClick={handleBrowseSource} className="px-2 py-1.5 text-[10px] bg-bg-tertiary border border-border/50 rounded hover:bg-bg-elevated text-text-secondary">参照</button>
          </div>
          {extractedNumber && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-muted">検出番号:</span>
              <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-bold">{extractedNumber}</span>
              <input type="text" value={extractedNumber} onChange={(e) => setExtractedNumber(e.target.value)}
                className="w-16 text-[10px] px-2 py-0.5 border border-border/50 rounded text-text-primary outline-none text-center" title="番号を手動修正" />
            </div>
          )}
        </div>

        {/* Step 2: 新作/続話 */}
        <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">2</span>
            <span className="text-xs font-medium text-text-primary">フォルダ種別</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMode("new")}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${mode === "new" ? "bg-accent/15 text-accent border border-accent/30" : "bg-bg-tertiary text-text-secondary border border-border/50 hover:bg-bg-elevated"}`}>
              新作<div className="text-[9px] text-text-muted mt-0.5">{newStructure.length}フォルダ</div>
            </button>
            <button onClick={() => setMode("sequel")}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${mode === "sequel" ? "bg-accent-secondary/15 text-accent-secondary border border-accent-secondary/30" : "bg-bg-tertiary text-text-secondary border border-border/50 hover:bg-bg-elevated"}`}>
              続話<div className="text-[9px] text-text-muted mt-0.5">{sequelStructure.length}フォルダ</div>
            </button>
          </div>
        </div>

        {/* Step 3: コピー先 */}
        <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">3</span>
            <span className="text-xs font-medium text-text-primary">コピー先ベースフォルダ</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={destBase} onChange={(e) => setDestBase(e.target.value)}
              className="flex-1 text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="コピー先フォルダを選択..." />
            <button onClick={handleBrowseDest} className="px-2 py-1.5 text-[10px] bg-bg-tertiary border border-border/50 rounded hover:bg-bg-elevated text-text-secondary">参照</button>
          </div>
          {destBase && extractedNumber && (
            <div className="text-[10px] text-text-muted font-mono">
              作成先: {destBase}\{extractedNumber}\<span className="text-accent">{copyDest}</span>\{sourcePath.replace(/\\/g, "/").split("/").pop() || ""}
            </div>
          )}
        </div>

        {/* 実行 */}
        <button onClick={handleExecute} disabled={processing || !sourcePath || !destBase}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]">
          {processing ? "処理中..." : "フォルダ作成＋コピー実行"}
        </button>

        {status.message && (
          <div className={`p-3 rounded-xl text-xs ${status.type === "success" ? "bg-success/10 text-success border border-success/20" : status.type === "error" ? "bg-error/10 text-error border border-error/20" : "bg-bg-tertiary text-text-muted"}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}

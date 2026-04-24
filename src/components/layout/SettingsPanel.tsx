import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "../../store/settingsStore";
import { useAppUpdater } from "../../hooks/useAppUpdater";

const FONT_SIZES = [
  { id: "small" as const, label: "小", desc: "9px基準" },
  { id: "medium" as const, label: "中", desc: "デフォルト" },
  { id: "large" as const, label: "大", desc: "12px基準" },
];

const ACCENT_COLORS = [
  { color: "#7c5cff", label: "パープル" },
  { color: "#3b82f6", label: "ブルー" },
  { color: "#10b981", label: "グリーン" },
  { color: "#f59e0b", label: "オレンジ" },
  { color: "#ef4444", label: "レッド" },
  { color: "#ec4899", label: "ピンク" },
  { color: "#6366f1", label: "インディゴ" },
  { color: "#14b8a6", label: "ティール" },
];


export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-7 h-7 flex items-center justify-center rounded transition-colors text-text-muted hover:text-text-primary hover:bg-bg-tertiary" title="設定">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    fontSize, accentColor, darkMode, defaultFolderPath,
    setFontSize, setAccentColor, setDarkMode, setDefaultFolderPath,
  } = useSettingsStore();
  const updater = useAppUpdater();

  const handleBrowseFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ directory: true, multiple: false });
    if (path) setDefaultFolderPath(path as string);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-bg-secondary rounded-2xl shadow-2xl border border-border w-[480px] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">設定</h2>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">文字サイズ</label>
            <div className="flex gap-2">
              {FONT_SIZES.map((s) => (
                <button key={s.id} onClick={() => setFontSize(s.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs text-center transition-all ${fontSize === s.id ? "bg-accent/15 text-accent border border-accent/30 font-bold" : "bg-bg-tertiary text-text-secondary border border-border/50 hover:bg-bg-elevated"}`}>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">アクセントカラー</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map((c) => (
                <button key={c.color} onClick={() => setAccentColor(c.color)}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${accentColor === c.color ? "border-text-primary scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c.color }} title={c.label} />
              ))}
            </div>
            <p className="text-[9px] text-text-muted mt-1">※カラー変更は今後対応予定</p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">ダークモード</label>
            <button onClick={() => setDarkMode(!darkMode)} className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-accent" : "bg-border"}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
            <span className="ml-2 text-[10px] text-text-muted">{darkMode ? "ON" : "OFF"}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">フォルダ階層のデフォルト位置</label>
            <div className="flex gap-2">
              <input type="text" value={defaultFolderPath} onChange={(e) => setDefaultFolderPath(e.target.value)}
                className="flex-1 text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none font-mono" placeholder="デスクトップ（デフォルト）" />
              <button onClick={handleBrowseFolder} className="px-2 py-1.5 text-[10px] bg-bg-tertiary border border-border/50 rounded hover:bg-bg-elevated text-text-secondary">参照</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 items-center">
          {/* バージョン情報（左側） */}
          <div className="mr-auto flex items-center gap-2 text-[11px] text-text-muted">
            {updater.appVersion && (
              <span className="font-mono">v{updater.appVersion}</span>
            )}
            {updater.phase === "checking" && (
              <span className="inline-flex items-center gap-1 text-text-muted/70">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                更新を確認中
              </span>
            )}
            {updater.phase === "up-to-date" && (
              <span className="inline-flex items-center gap-1 text-success">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                最新版
              </span>
            )}
            {updater.phase === "available" && updater.updateInfo && (
              <button
                onClick={() => updater.downloadAndInstall()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-accent-tertiary bg-accent-tertiary/10 hover:bg-accent-tertiary/20 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-tertiary animate-pulse" />
                更新 v{updater.updateInfo.version}
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors">閉じる</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

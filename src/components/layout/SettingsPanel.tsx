import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "../../store/settingsStore";

const FONT_SIZES = [
  { id: "small" as const, label: "小", desc: "9px基準" },
  { id: "medium" as const, label: "中", desc: "10px基準（デフォルト）" },
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
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
        title="設定"
      >
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
  const { fontSize, accentColor, darkMode, defaultFolderPath, setFontSize, setAccentColor, setDarkMode, setDefaultFolderPath } = useSettingsStore();

  const handleBrowseFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ directory: true, multiple: false });
    if (path) setDefaultFolderPath(path as string);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary rounded-2xl shadow-2xl border border-border w-[420px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">設定</h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 文字サイズ */}
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">文字サイズ</label>
            <div className="flex gap-2">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setFontSize(s.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs text-center transition-all ${
                    fontSize === s.id
                      ? "bg-accent/15 text-accent border border-accent/30 font-bold"
                      : "bg-bg-tertiary text-text-secondary border border-border/50 hover:bg-bg-elevated"
                  }`}
                >
                  <div className="font-medium">{s.label}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* カラー */}
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">アクセントカラー</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.color}
                  onClick={() => setAccentColor(c.color)}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${
                    accentColor === c.color ? "border-text-primary scale-110 shadow-md" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
            </div>
            <p className="text-[9px] text-text-muted mt-1">※カラー変更は今後のアップデートで対応予定</p>
          </div>

          {/* ダークモード */}
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">ダークモード</label>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? "bg-accent" : "bg-border"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
            <span className="ml-2 text-[10px] text-text-muted">{darkMode ? "ON" : "OFF"}</span>
          </div>

          {/* フォルダ階層のデフォルト位置 */}
          <div>
            <label className="text-xs font-medium text-text-primary mb-2 block">フォルダ階層のデフォルト位置</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 text-[10px] px-2 py-1.5 bg-bg-primary border border-border/50 rounded text-text-primary outline-none focus:border-accent/50 font-mono"
                value={defaultFolderPath}
                onChange={(e) => setDefaultFolderPath(e.target.value)}
                placeholder="デスクトップ（デフォルト）"
              />
              <button
                onClick={handleBrowseFolder}
                className="px-2 py-1.5 text-[10px] bg-bg-tertiary border border-border/50 rounded hover:bg-bg-elevated text-text-secondary"
              >
                参照
              </button>
            </div>
            <p className="text-[9px] text-text-muted mt-1">空の場合はデスクトップが使用されます</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

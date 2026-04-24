import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { usePsdLoader } from "../../hooks/usePsdLoader";
import { usePsdStore } from "../../store/psdStore";

export function DropZone() {
  const { loadFolder } = usePsdLoader();

  const handleClick = async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    if (path) {
      usePsdStore.getState().setCurrentFolderPath(path as string);
      await loadFolder(path as string);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-3xl m-6 transition-all duration-300 border-text-muted/20 hover:border-accent/40 hover:bg-accent/5 cursor-pointer"
      onClick={handleClick}
    >
      <div className="text-center p-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center bg-bg-tertiary">
          <svg className="w-12 h-12 text-folder" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
        </div>
        <p className="text-xl font-display font-medium mb-3 text-text-primary">
          フォルダを選択、またはドラッグ＆ドロップ
        </p>
        <p className="text-sm text-text-muted mb-6">クリックでフォルダ選択ダイアログを開きます</p>
        <div className="flex items-center justify-center gap-2">
          <span className="px-3 py-1 bg-manga-pink/20 text-manga-pink text-xs rounded-full">.psd</span>
          <span className="px-3 py-1 bg-manga-lavender/20 text-manga-lavender text-xs rounded-full">.psb</span>
          <span className="px-3 py-1 bg-error/15 text-error/80 text-xs rounded-full">.pdf</span>
          <span className="px-3 py-1 bg-accent-tertiary/15 text-accent-tertiary/80 text-xs rounded-full">画像</span>
        </div>
      </div>
    </div>
  );
}

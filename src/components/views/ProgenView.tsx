import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";
import { useViewStore } from "../../store/viewStore";

/**
 * ProGen統合ビュー
 *
 * データ連携: Tauri invoke で一時JSONファイルに書き出し → ProGen側がTauri invokeで読み込み
 * window.parent参照は本番ビルドで動かないため一切使用しない
 */

async function writeHandoff() {
  const scan = useScanPsdStore.getState();
  const viewer = useUnifiedViewerStore.getState();

  const data = {
    textContent: viewer.textContent || "",
    textFileName: (() => {
      const p = viewer.textFilePath;
      if (!p) return "";
      return p.split("\\").pop() || p.split("/").pop() || "text.txt";
    })(),
    jsonPath: scan.currentJsonFilePath || viewer.presetJsonPath || "",
    labelName: (() => {
      if (scan.workInfo.label) return scan.workInfo.label;
      const jp = scan.currentJsonFilePath || viewer.presetJsonPath || "";
      if (!jp) return "";
      const parts = jp.replace(/\//g, "\\").split("\\");
      return parts.length >= 2 ? parts[parts.length - 2] : "";
    })(),
    workInfo: {
      genre: scan.workInfo.genre || "",
      label: scan.workInfo.label || "",
      title: scan.workInfo.title || "",
      author: scan.workInfo.author || "",
      volume: scan.workInfo.volume || 0,
    },
  };

  try {
    const tempDir = await invoke<string>("get_temp_dir");
    const filePath = `${tempDir}\\comic_bridge_progen_handoff.json`;
    await invoke("write_text_file", { filePath, content: JSON.stringify(data) });
  } catch (e) {
    console.warn("[ProgenView] writeHandoff failed:", e);
  }
}

export function ProgenView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const progenMode = useViewStore((s) => s.progenMode);
  const [iframeSrc, setIframeSrc] = useState("/progen/index.html");

  useEffect(() => {
    if (!progenMode) return;
    useViewStore.getState().setProgenMode(null);

    (async () => {
      await writeHandoff();
      setIframeSrc(`/progen/index.html?mode=${progenMode}&t=${Date.now()}`);
    })();
  }, [progenMode]);

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="w-full h-full border-0"
        title="ProGen"
      />
    </div>
  );
}

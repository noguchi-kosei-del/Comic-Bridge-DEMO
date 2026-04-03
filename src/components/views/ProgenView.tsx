import { useRef, useEffect, useState } from "react";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";
import { useViewStore } from "../../store/viewStore";

/**
 * ProGen統合ビュー
 *
 * データ連携: localStorage に書き込み → ProGen側が localStorage から読み込み
 * 同一オリジン (https://tauri.localhost) なので共有可能
 */

function writeToLocalStorage() {
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
    localStorage.setItem("comic_bridge_progen_handoff", JSON.stringify(data));
  } catch (e) {
    console.warn("[ProgenView] localStorage write failed:", e);
  }
}

export function ProgenView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const progenMode = useViewStore((s) => s.progenMode);
  const [iframeSrc, setIframeSrc] = useState("/progen/index.html");

  useEffect(() => {
    if (!progenMode) return;
    useViewStore.getState().setProgenMode(null);

    writeToLocalStorage();
    setIframeSrc(`/progen/index.html?mode=${progenMode}&t=${Date.now()}`);
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

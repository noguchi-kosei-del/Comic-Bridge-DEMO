import { useEffect } from "react";
import { useScanPsdStore } from "../../store/scanPsdStore";
import { useUnifiedViewerStore } from "../../store/unifiedViewerStore";
import { useViewStore } from "../../store/viewStore";

/**
 * ProGen統合ビュー
 *
 * iframe は state-preserving（一度読み込んだら維持）
 * データ連携: localStorage に書き込み → ProGen側が500msポーリングで検知
 */

function writeCommand(mode: string) {
  const scan = useScanPsdStore.getState();
  const viewer = useUnifiedViewerStore.getState();

  const cmd = {
    mode,
    ts: Date.now(),
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
  };

  localStorage.setItem("cb_progen_cmd", JSON.stringify(cmd));
}

export function ProgenView() {
  const progenMode = useViewStore((s) => s.progenMode);

  // モード指定が来たらlocalStorageにコマンド書き込み
  useEffect(() => {
    if (!progenMode) return;
    useViewStore.getState().setProgenMode(null);
    writeCommand(progenMode);
  }, [progenMode]);

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
      <iframe
        src="/progen/index.html"
        className="w-full h-full border-0"
        title="ProGen"
      />
    </div>
  );
}

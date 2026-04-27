import { FileText, FileJson } from "lucide-react";

interface TextFileCardProps {
  fileName: string;
  size: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

const EXT_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  ".txt": { bg: "bg-slate-500", text: "text-white", ring: "ring-slate-400/40" },
  ".json": { bg: "bg-amber-500", text: "text-white", ring: "ring-amber-400/40" },
};

const DEFAULT_COLOR = { bg: "bg-text-muted", text: "text-white", ring: "ring-text-muted/40" };

export function TextFileCard({
  fileName,
  size,
  isSelected,
  onClick,
  onContextMenu,
  onDoubleClick,
}: TextFileCardProps) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.substring(dot).toLowerCase() : "";
  const color = EXT_COLORS[ext] ?? DEFAULT_COLOR;
  const isJson = ext === ".json";
  const Icon = isJson ? FileJson : FileText;

  return (
    <div
      className={`
        group relative rounded-2xl overflow-hidden cursor-pointer select-none
        transition-all duration-200 shadow-card border
        hover:-translate-y-1 hover:shadow-elevated
        ${
          isSelected
            ? `ring-2 ring-sky-400 bg-sky-50 border-sky-400`
            : `bg-bg-tertiary border-border hover:ring-1 hover:ring-sky-300/30`
        }
      `}
      style={{
        aspectRatio: "1 / 1.4142",
        minHeight: `${size}px`,
        ...(isSelected ? { boxShadow: "0 0 0 12px rgba(56,189,248,0.5), 0 0 20px rgba(56,189,248,0.3)" } : {}),
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      title={fileName}
    >
      {/* 中央のアイコン */}
      <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated">
        <div className={`flex items-center justify-center rounded-2xl ${color.bg} shadow-lg`} style={{ width: "54%", aspectRatio: "1 / 1.2" }}>
          <Icon className={`${color.text}`} style={{ width: "48%", height: "48%" }} strokeWidth={1.6} />
        </div>
      </div>

      {/* 拡張子バッジ（左上） */}
      <div className={`absolute top-3 left-3 px-1.5 py-0.5 rounded-md ${color.bg} ${color.text} text-[10px] font-bold tracking-wide shadow ring-1 ${color.ring}`}>
        {ext.replace(".", "").toUpperCase()}
      </div>

      {/* ファイル名オーバーレイ（下端） */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-8">
        <p className="text-xs text-white font-medium truncate" title={fileName}>
          {fileName}
        </p>
      </div>
    </div>
  );
}

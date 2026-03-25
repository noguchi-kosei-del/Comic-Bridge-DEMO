export function ProgenView() {
  return (
    <div className="flex h-full w-full overflow-hidden" style={{ position: "absolute", inset: 0 }}>
      <iframe
        src="/progen/index.html"
        className="w-full h-full border-0"
        title="ProGen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
      />
    </div>
  );
}

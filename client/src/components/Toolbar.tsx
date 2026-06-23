import { useEditorStore, type Tool } from '../store/editorStore';
import { useSchemeStore } from '../store/schemeStore';

/** Floating drawing toolbar over the map canvas. */
export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const selection = useEditorStore((s) => s.selection);
  const activeScheme = useSchemeStore((s) => s.activeScheme);

  const hasScheme = !!activeScheme;
  const hasLine = !!selection?.lineId;

  const tools: { id: Tool; label: string; glyph: string; enabled: boolean; hint: string }[] = [
    { id: 'select', label: 'Select', glyph: '⬚', enabled: true, hint: 'Click a line, segment, or station to edit it.' },
    { id: 'draw-line', label: 'Draw line', glyph: '╱', enabled: hasScheme, hint: 'Click to place vertices; double-click to finish.' },
    { id: 'add-station', label: 'Add station', glyph: '◉', enabled: hasLine, hint: 'Click on the selected line to drop a station.' },
    { id: 'edit-geometry', label: 'Edit shape', glyph: '✛', enabled: hasLine, hint: 'Drag vertices; click midpoints to add, select a vertex and press delete to remove.' },
  ];

  const activeHint = tools.find((t) => t.id === tool)?.hint;

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-10 w-min">
      <div className="flex overflow-hidden rounded-[4px] border border-hairline bg-surface/95 shadow-panel backdrop-blur">
        {tools.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!t.enabled}
              aria-pressed={active}
              onClick={() => setTool(t.id)}
              title={t.enabled ? t.label : `${t.label} — ${t.id === 'draw-line' ? 'open a scheme first' : 'select a line first'}`}
              className={`flex h-9 items-center gap-1.5 border-r border-hairline px-3 font-sans text-xs transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-35 ${
                active ? 'bg-signal text-chrome' : 'text-ink hover:bg-hairline/50'
              }`}
            >
              <span className="font-mono text-sm leading-none" aria-hidden>
                {t.glyph}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {activeHint && (
        <p className="mt-1.5 max-w-xs rounded-[3px] bg-chrome/80 px-2 py-1 font-sans text-2xs text-muted">
          {activeHint}
        </p>
      )}
    </div>
  );
}

import { useEditorStore } from '../../store/editorStore';
import { useSchemeStore } from '../../store/schemeStore';
import { LineProperties } from './LineProperties';
import { SegmentProperties } from './SegmentProperties';
import { StationProperties } from './StationProperties';

/** Right-panel properties editor, driven by the current selection. */
export function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection);
  const activeScheme = useSchemeStore((s) => s.activeScheme);

  if (!selection) {
    return (
      <p className="px-3 py-2 text-2xs text-muted">
        Select a line, segment, or station to edit its engineering properties.
      </p>
    );
  }

  const line = activeScheme?.lines.find((l) => l.id === selection.lineId);
  if (!line) {
    return <p className="px-3 py-2 text-2xs text-muted">Selection unavailable.</p>;
  }

  if (selection.type === 'line') return <LineProperties line={line} />;
  if (selection.type === 'segment') return <SegmentProperties line={line} seq={selection.seq} />;
  return <StationProperties line={line} stationId={selection.stationId} />;
}

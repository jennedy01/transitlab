import {
  ELECTRIFICATIONS,
  ELECTRIFICATION_LABELS,
  MODES,
  MODE_LABELS,
  type Electrification,
  type Line,
  type Mode,
} from '@transitlab/shared';
import { useSchemeStore, LINE_PALETTE } from '../../store/schemeStore';
import { useEditorStore } from '../../store/editorStore';
import { useRollingStock } from '../../lib/refData';
import { Select } from '../ui/Select';
import { TextInput } from '../ui/TextInput';
import { Button } from '../ui/Button';
import { lineLength } from '../../lib/geometry';
import { formatDistance } from '../../lib/format';
import type { LngLat } from '../../lib/geometry';

const GAUGE_OPTIONS = [
  { value: '1435', label: 'Standard 1435 mm' },
  { value: '2140', label: 'Brunel broad 2140 mm' },
  { value: '1000', label: 'Narrow 1000 mm' },
  { value: '1067', label: 'Cape 1067 mm' },
];

export function LineProperties({ line }: { line: Line }) {
  const updateLineProps = useSchemeStore((s) => s.updateLineProps);
  const removeLine = useSchemeStore((s) => s.removeLine);
  const setTool = useEditorStore((s) => s.setTool);
  const select = useEditorStore((s) => s.select);
  const stock = useRollingStock();

  const coords = (line.geom?.coordinates ?? []) as LngLat[];
  const lengthM = lineLength(coords);
  const modeStock = stock.filter((s) => s.mode === line.mode);
  const gaugeKnown = GAUGE_OPTIONS.some((g) => g.value === String(line.gaugeMm));

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Field label="Name">
        <TextInput
          value={line.name}
          onChange={(e) => updateLineProps(line.id, { name: e.target.value })}
        />
      </Field>

      <Field label="Colour">
        <div className="flex flex-wrap gap-1.5">
          {LINE_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`colour ${c}`}
              onClick={() => updateLineProps(line.id, { colour: c })}
              className={`h-5 w-5 rounded-[3px] ring-2 ${
                line.colour.toLowerCase() === c.toLowerCase() ? 'ring-ink' : 'ring-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={line.colour}
            onChange={(e) => updateLineProps(line.id, { colour: e.target.value })}
            className="h-5 w-5 cursor-pointer rounded-[3px] border border-hairline bg-transparent"
            aria-label="custom colour"
          />
        </div>
      </Field>

      <Select
        label="Mode"
        value={line.mode}
        onChange={(e) => updateLineProps(line.id, { mode: e.target.value as Mode })}
        options={MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
      />

      <Select
        label="Track gauge"
        value={gaugeKnown ? String(line.gaugeMm) : 'custom'}
        onChange={(e) => {
          if (e.target.value !== 'custom') updateLineProps(line.id, { gaugeMm: Number(e.target.value) });
        }}
        options={[...GAUGE_OPTIONS, { value: 'custom', label: `Custom (${line.gaugeMm} mm)` }]}
      />
      {!gaugeKnown && (
        <TextInput
          type="number"
          value={line.gaugeMm}
          min={300}
          max={5000}
          onChange={(e) => updateLineProps(line.id, { gaugeMm: Number(e.target.value) })}
        />
      )}

      <Select
        label="Electrification"
        value={line.electrification}
        onChange={(e) =>
          updateLineProps(line.id, { electrification: e.target.value as Electrification })
        }
        options={ELECTRIFICATIONS.map((el) => ({ value: el, label: ELECTRIFICATION_LABELS[el] }))}
      />

      <Select
        label="Rolling stock"
        value={line.rollingStockId ?? ''}
        onChange={(e) => updateLineProps(line.id, { rollingStockId: e.target.value || null })}
        options={[
          { value: '', label: modeStock.length ? '— none —' : 'no stock for this mode' },
          ...modeStock.map((s) => ({
            value: s.id,
            label: `${s.name} · ${s.maxSpeedKph} km/h · ${s.capacity} cap`,
          })),
        ]}
      />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-3 font-mono text-2xs text-muted">
        <dt>Length</dt>
        <dd className="text-right text-ink">{formatDistance(lengthM)}</dd>
        <dt>Vertices</dt>
        <dd className="text-right text-ink">{coords.length}</dd>
        <dt>Segments</dt>
        <dd className="text-right text-ink">{line.segments.length}</dd>
        <dt>Stations</dt>
        <dd className="text-right text-ink">{line.stations.length}</dd>
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
        <Button onClick={() => setTool('edit-geometry')}>Edit shape</Button>
        <Button onClick={() => setTool('add-station')}>Add station</Button>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`Delete line “${line.name}”?`)) {
              void removeLine(line.id);
              select(null);
            }
          }}
        >
          Delete line
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block font-sans text-2xs uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

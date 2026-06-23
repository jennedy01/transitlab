import type { Line } from '@transitlab/shared';
import { useSchemeStore } from '../../store/schemeStore';
import { useEditorStore } from '../../store/editorStore';
import { TextInput } from '../ui/TextInput';
import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';
import { formatDistance } from '../../lib/format';

export function StationProperties({ line, stationId }: { line: Line; stationId: string }) {
  const updateStation = useSchemeStore((s) => s.updateStation);
  const removeStation = useSchemeStore((s) => s.removeStation);
  const select = useEditorStore((s) => s.select);
  const station = line.stations.find((st) => st.id === stationId);
  if (!station) return <p className="px-3 py-3 text-2xs text-muted">Station not found.</p>;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <label className="block">
        <span className="mb-1 block font-sans text-2xs uppercase tracking-wider text-muted">
          Station name
        </span>
        <TextInput
          value={station.name}
          onChange={(e) => updateStation(line.id, stationId, { name: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-1 border-y border-hairline py-2">
        <Toggle
          label="Interchange"
          checked={station.isInterchange}
          onChange={(v) => updateStation(line.id, stationId, { isInterchange: v })}
        />
        <Toggle
          label="Step-free access"
          checked={station.stepFree}
          onChange={(v) => updateStation(line.id, stationId, { stepFree: v })}
        />
      </div>

      {station.isInterchange && (
        <p className="rounded-[3px] bg-caution/10 px-2 py-1 text-2xs text-caution">
          Flagged as an interchange — auto-detected near an existing station, or set manually.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-2xs text-muted">
        <dt>Chainage</dt>
        <dd className="text-right text-ink">{formatDistance(station.chainageM)}</dd>
        <dt>On line</dt>
        <dd className="truncate text-right text-ink">{line.name}</dd>
      </dl>

      <Button
        variant="danger"
        onClick={() => {
          removeStation(line.id, stationId);
          select({ type: 'line', lineId: line.id });
        }}
      >
        Delete station
      </Button>
    </div>
  );
}

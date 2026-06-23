import {
  STRUCTURE_COLOURS,
  STRUCTURE_LABELS,
  STRUCTURE_TYPES,
  type Line,
  type StructureType,
} from '@transitlab/shared';
import { useSchemeStore } from '../../store/schemeStore';
import { Select } from '../ui/Select';
import { TextInput } from '../ui/TextInput';
import { formatDistance } from '../../lib/format';

export function SegmentProperties({ line, seq }: { line: Line; seq: number }) {
  const setSegment = useSchemeStore((s) => s.setSegment);
  const segment = line.segments.find((sg) => sg.seq === seq);
  if (!segment) return <p className="px-3 py-3 text-2xs text-muted">Segment not found.</p>;

  const lengthM = segment.endChainageM - segment.startChainageM;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-[2px]"
          style={{ backgroundColor: STRUCTURE_COLOURS[segment.structureType] }}
        />
        <span className="font-sans text-xs text-ink">
          Segment {seq + 1} of {line.segments.length} · {line.name}
        </span>
      </div>

      <Select
        label="Structure type"
        value={segment.structureType}
        onChange={(e) => setSegment(line.id, seq, { structureType: e.target.value as StructureType })}
        options={STRUCTURE_TYPES.map((st) => ({ value: st, label: STRUCTURE_LABELS[st] }))}
      />

      <Select
        label="Track count"
        value={String(segment.trackCount)}
        onChange={(e) => setSegment(line.id, seq, { trackCount: Number(e.target.value) })}
        options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} track${n > 1 ? 's' : ''}` }))}
      />

      <label className="block">
        <span className="mb-1 block font-sans text-2xs uppercase tracking-wider text-muted">
          Max speed override (km/h)
        </span>
        <TextInput
          type="number"
          placeholder="line default"
          value={segment.maxSpeedKph ?? ''}
          min={5}
          max={500}
          onChange={(e) =>
            setSegment(line.id, seq, {
              maxSpeedKph: e.target.value === '' ? null : Number(e.target.value),
            })
          }
        />
      </label>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-3 font-mono text-2xs text-muted">
        <dt>Length</dt>
        <dd className="text-right text-ink">{formatDistance(lengthM)}</dd>
        <dt>Chainage</dt>
        <dd className="text-right text-ink">
          {formatDistance(segment.startChainageM)} – {formatDistance(segment.endChainageM)}
        </dd>
      </dl>
    </div>
  );
}

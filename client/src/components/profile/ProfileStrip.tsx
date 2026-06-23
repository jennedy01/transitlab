import { useEffect, useRef, useState } from 'react';
import {
  IS_SUBSURFACE,
  STRUCTURE_COLOURS,
  STRUCTURE_LABELS,
  STRUCTURE_LEVEL,
  type Line,
  type Segment,
} from '@transitlab/shared';
import { useSchemeStore } from '../../store/schemeStore';
import { useEditorStore } from '../../store/editorStore';
import { formatDistance } from '../../lib/format';

/**
 * The signature vertical profile strip: a horizontal cross-section of the
 * selected line showing each structural section in its colour at its level
 * relative to grade, with station markers dropped at their chainage.
 *
 * Below grade (tunnels, cuttings) sits under the datum; embankments, viaducts
 * and bridges rise above it. Clicking a section or station selects it.
 */

// Vertical geometry (SVG units; width is measured from the container).
const H = 150;
const LABELS_TOP = 4;
const PLOT_TOP = 22;
const DATUM_Y = 74;
const LEVEL_STEP = 13;
const BAND_H = 9;
const AXIS_Y = 118;
const PAD_X = 12;

const yLevel = (level: number) => DATUM_Y - level * LEVEL_STEP;

function useWidth<T extends HTMLElement>(ref: React.RefObject<T>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Nice chainage tick spacing (m) for a given total length. */
function tickStep(totalM: number): number {
  const targets = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const ideal = totalM / 6;
  return targets.find((t) => t >= ideal) ?? 100000;
}

export function ProfileStrip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useWidth(containerRef);
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const activeScheme = useSchemeStore((s) => s.activeScheme);

  const line: Line | undefined = selection
    ? activeScheme?.lines.find((l) => l.id === selection.lineId)
    : undefined;

  // Strip is present only when a line with geometry is selected.
  if (!line || line.segments.length === 0) return null;

  const segments = [...line.segments].sort((a, b) => a.seq - b.seq);
  const total = segments[segments.length - 1]?.endChainageM || 1;
  const plotW = Math.max(0, width - PAD_X * 2);
  const xFor = (m: number) => PAD_X + (m / total) * plotW;

  const tunnelLen = segments
    .filter((s) => IS_SUBSURFACE[s.structureType])
    .reduce((a, s) => a + (s.endChainageM - s.startChainageM), 0);

  const usedStructures = [...new Set(segments.map((s) => s.structureType))];
  const selectedSeq = selection?.type === 'segment' ? selection.seq : null;
  const selectedStation = selection?.type === 'station' ? selection.stationId : null;

  // Chainage axis ticks.
  const step = tickStep(total);
  const ticks: number[] = [];
  for (let m = 0; m <= total + 1; m += step) ticks.push(m);

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 border-t border-hairline bg-chrome/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: line.colour }} />
          <span className="truncate font-sans text-2xs font-semibold uppercase tracking-wider text-muted">
            Vertical profile · {line.name}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-2xs text-muted">
          <span>{formatDistance(total)}</span>
          <span title="proportion in tunnel">
            tunnel {((tunnelLen / total) * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted hover:text-ink"
            aria-label={collapsed ? 'Expand profile' : 'Collapse profile'}
          >
            {collapsed ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div ref={containerRef} className="px-0 pb-1">
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label={`Vertical profile of ${line.name}`}>
              {/* Datum (grade) line */}
              <line
                x1={PAD_X}
                x2={PAD_X + plotW}
                y1={DATUM_Y}
                y2={DATUM_Y}
                stroke="#2C333D"
                strokeWidth={1}
              />
              <text x={2} y={DATUM_Y - 3} className="fill-muted font-mono" fontSize={7}>
                grade
              </text>

              {/* Structural sections */}
              {segments.map((seg) => (
                <ProfileSegment
                  key={seg.id}
                  seg={seg}
                  x0={xFor(seg.startChainageM)}
                  x1={xFor(seg.endChainageM)}
                  selected={selectedSeq === seg.seq}
                  hovered={hover === seg.seq}
                  onEnter={() => setHover(seg.seq)}
                  onLeave={() => setHover((h) => (h === seg.seq ? null : h))}
                  onClick={() => select({ type: 'segment', lineId: line.id, seq: seg.seq })}
                />
              ))}

              {/* Station markers */}
              {line.stations.map((st) => {
                const x = xFor(st.chainageM);
                const on = selectedStation === st.id;
                return (
                  <g
                    key={st.id}
                    className="cursor-pointer"
                    onClick={() => select({ type: 'station', lineId: line.id, stationId: st.id })}
                  >
                    <line x1={x} x2={x} y1={PLOT_TOP - 4} y2={DATUM_Y} stroke={on ? '#00B4A6' : '#95A0AD'} strokeWidth={on ? 1.4 : 0.8} />
                    {st.isInterchange ? (
                      <rect x={x - 3} y={LABELS_TOP + 4} width={6} height={6} transform={`rotate(45 ${x} ${LABELS_TOP + 7})`} fill={on ? '#00B4A6' : '#E8EBEF'} />
                    ) : (
                      <circle cx={x} cy={LABELS_TOP + 7} r={3} fill={on ? '#00B4A6' : '#E8EBEF'} stroke="#15181D" strokeWidth={0.5} />
                    )}
                    {(on || hover === null) && (
                      <text
                        x={x}
                        y={LABELS_TOP + 1}
                        textAnchor={x < 36 ? 'start' : x > width - 36 ? 'end' : 'middle'}
                        className={on ? 'fill-signal' : 'fill-muted'}
                        fontSize={7.5}
                        fontFamily="Inter, sans-serif"
                      >
                        {truncate(st.name, 14)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Chainage axis */}
              <line x1={PAD_X} x2={PAD_X + plotW} y1={AXIS_Y} y2={AXIS_Y} stroke="#2C333D" strokeWidth={1} />
              {ticks.map((m) => {
                const x = xFor(m);
                return (
                  <g key={m}>
                    <line x1={x} x2={x} y1={AXIS_Y} y2={AXIS_Y + 4} stroke="#2C333D" strokeWidth={1} />
                    <text x={x} y={AXIS_Y + 13} textAnchor="middle" className="fill-muted font-mono" fontSize={7.5}>
                      {m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`}
                    </text>
                  </g>
                );
              })}

              {/* Hover tooltip */}
              {hover !== null && <SegmentTooltip seg={segments.find((s) => s.seq === hover)!} xFor={xFor} plotW={plotW} />}
            </svg>
          )}

          {/* Legend of structures present */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pb-1 pt-0.5">
            {usedStructures.map((st) => (
              <span key={st} className="flex items-center gap-1 font-sans text-2xs text-muted">
                <span className="h-2 w-2 rounded-[1px]" style={{ backgroundColor: STRUCTURE_COLOURS[st] }} />
                {STRUCTURE_LABELS[st]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSegment({
  seg,
  x0,
  x1,
  selected,
  hovered,
  onEnter,
  onLeave,
  onClick,
}: {
  seg: Segment;
  x0: number;
  x1: number;
  selected: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const level = STRUCTURE_LEVEL[seg.structureType];
  const colour = STRUCTURE_COLOURS[seg.structureType];
  const yb = yLevel(level);
  const w = Math.max(0.5, x1 - x0);
  const bandY = yb - BAND_H / 2;
  const elements = [];

  // Structural fill that conveys the form.
  if (level > 0) {
    // Embankment / viaduct / bridge: fill down to grade.
    elements.push(
      <rect key="fill" x={x0} y={bandY + BAND_H} width={w} height={DATUM_Y - (bandY + BAND_H)} fill={colour} opacity={0.18} />,
    );
    if (level >= 2) {
      // Viaduct/bridge piers.
      const piers = Math.max(1, Math.floor(w / 16));
      for (let i = 0; i <= piers; i += 1) {
        const px = x0 + (w * i) / piers;
        elements.push(<line key={`p${i}`} x1={px} x2={px} y1={bandY + BAND_H} y2={DATUM_Y} stroke={colour} strokeWidth={1} opacity={0.55} />);
      }
    }
  } else if (level < 0) {
    // Tunnel / cutting: overburden hatch above the alignment.
    elements.push(
      <rect key="over" x={x0} y={DATUM_Y} width={w} height={bandY - DATUM_Y} fill={colour} opacity={0.14} />,
    );
  }

  // The alignment band itself.
  elements.push(
    <rect
      key="band"
      x={x0}
      y={bandY}
      width={w}
      height={BAND_H}
      rx={1}
      fill={colour}
      stroke={selected ? '#E8EBEF' : hovered ? '#E8EBEF' : 'none'}
      strokeWidth={selected ? 1.5 : 1}
      opacity={selected || hovered ? 1 : 0.92}
    />,
  );

  return (
    <g className="cursor-pointer" onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}>
      {/* Invisible wide hit area for easy clicking of thin bands. */}
      <rect x={x0} y={PLOT_TOP} width={w} height={AXIS_Y - PLOT_TOP} fill="transparent" />
      {elements}
    </g>
  );
}

function SegmentTooltip({ seg, xFor, plotW }: { seg: Segment; xFor: (m: number) => number; plotW: number }) {
  const xMid = (xFor(seg.startChainageM) + xFor(seg.endChainageM)) / 2;
  const len = seg.endChainageM - seg.startChainageM;
  const text = `${STRUCTURE_LABELS[seg.structureType]} · ${formatDistance(len)} · ${seg.trackCount} track${seg.trackCount > 1 ? 's' : ''}${seg.maxSpeedKph ? ` · ${seg.maxSpeedKph} km/h` : ''}`;
  const w = text.length * 5.0 + 12;
  const x = Math.min(Math.max(xMid - w / 2, PAD_X), PAD_X + plotW - w);
  return (
    <g pointerEvents="none">
      <rect x={x} y={PLOT_TOP - 2} width={w} height={13} rx={2} fill="#1E232B" stroke="#2C333D" />
      <text x={x + 6} y={PLOT_TOP + 7} className="fill-ink font-mono" fontSize={7.5}>
        {text}
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

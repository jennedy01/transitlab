import { create } from 'zustand';
import type {
  Electrification,
  Line,
  LineUpsertRequest,
  Mode,
  Scheme,
  SchemeWithLines,
  Segment,
  Station,
  StructureType,
} from '@transitlab/shared';
import {
  createScheme as apiCreate,
  createLine,
  deleteLine,
  deleteScheme as apiDelete,
  getScheme,
  listSchemes,
  patchScheme,
  updateLine,
} from '../lib/api';
import { cumulativeChainage, lineLength, pointAtFraction, type LngLat } from '../lib/geometry';

/** Palette seeded with iconic UK line colours, cycled for new lines. */
export const LINE_PALETTE = [
  '#E32017', '#0098D4', '#00782A', '#003688', '#9B0056',
  '#F3A9BB', '#B36305', '#EE7C0E', '#84B817', '#6950A1',
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface SchemeState {
  schemes: Scheme[];
  activeSchemeId: string | null;
  activeScheme: SchemeWithLines | null;
  loading: boolean;
  error: string | null;

  loadSchemes: () => Promise<void>;
  selectScheme: (id: string | null) => Promise<void>;
  createScheme: (name: string, description?: string) => Promise<void>;
  renameScheme: (id: string, name: string) => Promise<void>;
  removeScheme: (id: string) => Promise<void>;

  // Drawing mutations (operate on the active scheme; persist debounced).
  addLine: (coordinates: LngLat[]) => Promise<string | null>;
  updateLineProps: (lineId: string, patch: Partial<LineProps>) => void;
  updateLineGeometry: (lineId: string, coordinates: LngLat[]) => void;
  setSegment: (lineId: string, seq: number, patch: Partial<SegmentProps>) => void;
  addStation: (lineId: string, fraction: number, name?: string) => void;
  updateStation: (lineId: string, stationId: string, patch: Partial<StationProps>) => void;
  removeStation: (lineId: string, stationId: string) => void;
  removeLine: (lineId: string) => Promise<void>;
}

interface LineProps {
  name: string;
  colour: string;
  mode: Mode;
  gaugeMm: number;
  electrification: Electrification;
  rollingStockId: string | null;
}
interface SegmentProps {
  structureType: StructureType;
  trackCount: number;
  maxSpeedKph: number | null;
}
interface StationProps {
  name: string;
  isInterchange: boolean;
  stepFree: boolean;
}

// Debounced per-line persistence timers (module scope).
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function buildUpsert(line: Line): LineUpsertRequest {
  const coords = (line.geom?.coordinates ?? []) as LngLat[];
  const total = lineLength(coords) || 1;
  const edgeCount = Math.max(0, coords.length - 1);
  const sorted = [...line.segments].sort((a, b) => a.seq - b.seq);
  const segments = Array.from({ length: edgeCount }, (_, i) => {
    const s = sorted[i];
    return s
      ? { structureType: s.structureType, trackCount: s.trackCount, maxSpeedKph: s.maxSpeedKph ?? null }
      : { structureType: 'surface' as StructureType, trackCount: 2, maxSpeedKph: null };
  });
  return {
    name: line.name,
    colour: line.colour,
    mode: line.mode,
    gaugeMm: line.gaugeMm,
    electrification: line.electrification,
    rollingStockId: line.rollingStockId ?? null,
    coordinates: coords,
    segments,
    stations: line.stations.map((st) => ({
      id: st.id?.startsWith('tmp-') ? undefined : st.id,
      name: st.name,
      fraction: clamp01(st.chainageM / total),
      isInterchange: st.isInterchange,
      stepFree: st.stepFree,
    })),
  };
}

/** Build local segment objects (immediate render; server recomputes on save). */
function localSegments(lineId: string, coords: LngLat[], prev: Segment[]): Segment[] {
  const chain = cumulativeChainage(coords);
  const sorted = [...prev].sort((a, b) => a.seq - b.seq);
  return Array.from({ length: Math.max(0, coords.length - 1) }, (_, i) => {
    const base = sorted[i];
    return {
      id: base?.id ?? `tmp-seg-${i}`,
      lineId,
      seq: i,
      structureType: base?.structureType ?? ('surface' as StructureType),
      trackCount: base?.trackCount ?? 2,
      maxSpeedKph: base?.maxSpeedKph ?? null,
      startChainageM: chain[i],
      endChainageM: chain[i + 1],
      geom: { type: 'LineString', coordinates: [coords[i], coords[i + 1]] },
    } satisfies Segment;
  });
}

export const useSchemeStore = create<SchemeState>((set, get) => {
  /** Replace one line within the active scheme. */
  function patchLine(lineId: string, fn: (line: Line) => Line): void {
    set((s) =>
      s.activeScheme
        ? {
            activeScheme: {
              ...s.activeScheme,
              lines: s.activeScheme.lines.map((l) => (l.id === lineId ? fn(l) : l)),
            },
          }
        : {},
    );
  }

  async function persistLine(lineId: string): Promise<void> {
    const line = get().activeScheme?.lines.find((l) => l.id === lineId);
    if (!line || !line.geom) return;
    try {
      const { line: saved } = await updateLine(lineId, buildUpsert(line));
      // Adopt the server's authoritative geometry/segments/stations/flags.
      patchLine(lineId, () => saved);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  }

  function schedulePersist(lineId: string): void {
    clearTimeout(persistTimers.get(lineId));
    persistTimers.set(lineId, setTimeout(() => void persistLine(lineId), 400));
  }

  return {
    schemes: [],
    activeSchemeId: null,
    activeScheme: null,
    loading: false,
    error: null,

    loadSchemes: async () => {
      set({ loading: true, error: null });
      try {
        const { schemes } = await listSchemes();
        set({ schemes });
        const { activeSchemeId } = get();
        if (activeSchemeId && !schemes.some((s) => s.id === activeSchemeId)) {
          set({ activeSchemeId: null, activeScheme: null });
        }
      } catch (err) {
        set({ error: (err as Error).message });
      } finally {
        set({ loading: false });
      }
    },

    selectScheme: async (id) => {
      if (!id) {
        set({ activeSchemeId: null, activeScheme: null });
        return;
      }
      set({ activeSchemeId: id, loading: true, error: null });
      try {
        const { scheme } = await getScheme(id);
        set({ activeScheme: scheme });
      } catch (err) {
        set({ error: (err as Error).message, activeScheme: null });
      } finally {
        set({ loading: false });
      }
    },

    createScheme: async (name, description) => {
      const { scheme } = await apiCreate(name, description);
      set((s) => ({
        schemes: [scheme, ...s.schemes],
        activeSchemeId: scheme.id,
        activeScheme: scheme,
      }));
    },

    renameScheme: async (id, name) => {
      const { scheme } = await patchScheme(id, { name });
      set((s) => ({
        schemes: s.schemes.map((x) => (x.id === id ? { ...x, name: scheme.name } : x)),
        activeScheme:
          s.activeScheme?.id === id ? { ...s.activeScheme, name: scheme.name } : s.activeScheme,
      }));
    },

    removeScheme: async (id) => {
      await apiDelete(id);
      set((s) => ({
        schemes: s.schemes.filter((x) => x.id !== id),
        activeSchemeId: s.activeSchemeId === id ? null : s.activeSchemeId,
        activeScheme: s.activeScheme?.id === id ? null : s.activeScheme,
      }));
    },

    addLine: async (coordinates) => {
      const scheme = get().activeScheme;
      if (!scheme || coordinates.length < 2) return null;
      const idx = scheme.lines.length;
      const body: LineUpsertRequest = {
        name: `Line ${idx + 1}`,
        colour: LINE_PALETTE[idx % LINE_PALETTE.length],
        mode: 'heavy_rail',
        gaugeMm: 1435,
        electrification: 'ohle_25kv',
        rollingStockId: null,
        coordinates,
        segments: Array.from({ length: coordinates.length - 1 }, () => ({
          structureType: 'surface' as StructureType,
          trackCount: 2,
          maxSpeedKph: null,
        })),
        stations: [],
      };
      try {
        const { line } = await createLine(scheme.id, body);
        set((s) =>
          s.activeScheme
            ? { activeScheme: { ...s.activeScheme, lines: [...s.activeScheme.lines, line] } }
            : {},
        );
        return line.id;
      } catch (err) {
        set({ error: (err as Error).message });
        return null;
      }
    },

    updateLineProps: (lineId, patch) => {
      patchLine(lineId, (l) => ({ ...l, ...patch }));
      schedulePersist(lineId);
    },

    updateLineGeometry: (lineId, coordinates) => {
      patchLine(lineId, (l) => ({
        ...l,
        geom: { type: 'LineString', coordinates },
        segments: localSegments(lineId, coordinates, l.segments),
      }));
      schedulePersist(lineId);
    },

    setSegment: (lineId, seq, patch) => {
      patchLine(lineId, (l) => ({
        ...l,
        segments: l.segments.map((sg) => (sg.seq === seq ? { ...sg, ...patch } : sg)),
      }));
      schedulePersist(lineId);
    },

    addStation: (lineId, fraction, name) => {
      patchLine(lineId, (l) => {
        const coords = (l.geom?.coordinates ?? []) as LngLat[];
        const total = lineLength(coords);
        const station: Station = {
          id: `tmp-${Date.now()}-${Math.round(fraction * 1000)}`,
          lineId,
          name: name ?? `Station ${l.stations.length + 1}`,
          isInterchange: false,
          stepFree: false,
          chainageM: clamp01(fraction) * total,
          geom: { type: 'Point', coordinates: pointAtFraction(coords, fraction) },
        };
        return { ...l, stations: [...l.stations, station] };
      });
      schedulePersist(lineId);
    },

    updateStation: (lineId, stationId, patch) => {
      patchLine(lineId, (l) => ({
        ...l,
        stations: l.stations.map((st) => (st.id === stationId ? { ...st, ...patch } : st)),
      }));
      schedulePersist(lineId);
    },

    removeStation: (lineId, stationId) => {
      patchLine(lineId, (l) => ({
        ...l,
        stations: l.stations.filter((st) => st.id !== stationId),
      }));
      schedulePersist(lineId);
    },

    removeLine: async (lineId) => {
      clearTimeout(persistTimers.get(lineId));
      try {
        await deleteLine(lineId);
      } catch (err) {
        set({ error: (err as Error).message });
      }
      set((s) =>
        s.activeScheme
          ? {
              activeScheme: {
                ...s.activeScheme,
                lines: s.activeScheme.lines.filter((l) => l.id !== lineId),
              },
            }
          : {},
      );
    },
  };
});

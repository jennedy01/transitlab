import { create } from 'zustand';
import {
  getConnectivity,
  getLineAnalysis,
  type ConnectivityResult,
  type LineAnalysis,
} from '../lib/api';

export const WALK_RADII = [400, 800, 1000, 1500] as const;

interface AnalysisState {
  /** The line the current result belongs to (so stale results can be hidden). */
  lineId: string | null;
  result: LineAnalysis | null;
  connectivity: ConnectivityResult | null;
  walkRadiusM: number;
  running: boolean;
  runningConnectivity: boolean;
  error: string | null;

  run: (lineId: string) => Promise<void>;
  runConnectivity: (lineId: string) => Promise<void>;
  setWalkRadius: (m: number) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  lineId: null,
  result: null,
  connectivity: null,
  walkRadiusM: 800,
  running: false,
  runningConnectivity: false,
  error: null,

  run: async (lineId) => {
    set({ running: true, error: null, lineId });
    try {
      const result = await getLineAnalysis(lineId, { walkRadius: get().walkRadiusM });
      set({ result, lineId });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ running: false });
    }
  },

  runConnectivity: async (lineId) => {
    set({ runningConnectivity: true, error: null });
    try {
      const { connectivity } = await getConnectivity(lineId);
      set({ connectivity });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ runningConnectivity: false });
    }
  },

  setWalkRadius: (m) => {
    set({ walkRadiusM: m });
    // Re-run catchment etc. if a result is already showing for a line.
    const { lineId, result } = get();
    if (lineId && result) void get().run(lineId);
  },

  clear: () => set({ result: null, connectivity: null, lineId: null, error: null }),
}));

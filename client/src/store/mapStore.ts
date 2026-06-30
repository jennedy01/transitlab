import { create } from 'zustand';
import { DEFAULT_VISIBILITY } from '../map/overlays';

interface Cursor {
  lng: number;
  lat: number;
}

interface MapState {
  /** Layer visibility keyed by overlay key. */
  visibility: Record<string, boolean>;
  /** Live cursor position (null when off-canvas). */
  cursor: Cursor | null;
  /** Current map zoom. */
  zoom: number;
  /** Whether the API health check is passing (null = not yet checked). */
  apiReachable: boolean | null;
  /** Last reference/data load error message, if any. */
  dataError: string | null;

  setVisible: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
  setCursor: (cursor: Cursor | null) => void;
  setZoom: (zoom: number) => void;
  setApiReachable: (reachable: boolean) => void;
  setDataError: (message: string | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  visibility: { ...DEFAULT_VISIBILITY },
  cursor: null,
  zoom: 0,
  apiReachable: null,
  dataError: null,

  setVisible: (key, value) =>
    set((s) => ({ visibility: { ...s.visibility, [key]: value } })),
  toggle: (key) =>
    set((s) => ({ visibility: { ...s.visibility, [key]: !s.visibility[key] } })),
  setCursor: (cursor) => set({ cursor }),
  setZoom: (zoom) => set({ zoom }),
  setApiReachable: (reachable) => set({ apiReachable: reachable }),
  setDataError: (message) => set({ dataError: message }),
}));

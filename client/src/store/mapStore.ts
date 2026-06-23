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

  setVisible: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
  setCursor: (cursor: Cursor | null) => void;
  setZoom: (zoom: number) => void;
}

export const useMapStore = create<MapState>((set) => ({
  visibility: { ...DEFAULT_VISIBILITY },
  cursor: null,
  zoom: 0,

  setVisible: (key, value) =>
    set((s) => ({ visibility: { ...s.visibility, [key]: value } })),
  toggle: (key) =>
    set((s) => ({ visibility: { ...s.visibility, [key]: !s.visibility[key] } })),
  setCursor: (cursor) => set({ cursor }),
  setZoom: (zoom) => set({ zoom }),
}));

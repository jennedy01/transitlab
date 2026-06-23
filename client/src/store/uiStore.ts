import { create } from 'zustand';

/** Desktop-first: side panels start open on wide screens, collapsed on tablet. */
const wideScreen = typeof window !== 'undefined' ? window.innerWidth >= 1000 : true;

interface UiState {
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  leftOpen: wideScreen,
  rightOpen: wideScreen,
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
}));

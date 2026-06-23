import { create } from 'zustand';

/** Active drawing tool. */
export type Tool = 'select' | 'draw-line' | 'add-station' | 'edit-geometry';

/** What is currently selected (drives the right-hand properties panel). */
export type Selection =
  | { type: 'line'; lineId: string }
  | { type: 'segment'; lineId: string; seq: number }
  | { type: 'station'; lineId: string; stationId: string }
  | null;

interface EditorState {
  tool: Tool;
  selection: Selection;
  setTool: (tool: Tool) => void;
  select: (selection: Selection) => void;
  /** The line id implied by the current selection, if any. */
  selectedLineId: () => string | null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: 'select',
  selection: null,
  setTool: (tool) => set({ tool }),
  select: (selection) => set({ selection }),
  selectedLineId: () => {
    const s = get().selection;
    return s ? s.lineId : null;
  },
}));

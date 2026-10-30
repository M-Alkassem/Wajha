/**
 * Editor chrome state that is neither project data nor undoable: which side
 * panels are open (remembered per device in localStorage), and whether a
 * list item is being dragged (keyboard shortcuts stand aside meanwhile).
 */
import { create } from 'zustand';

const STORAGE_KEY = 'wajha.editor.panels';

interface StoredPanels {
  left: boolean;
  right: boolean;
}

function readPanels(): StoredPanels {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return { left: true, right: true };
    const v = JSON.parse(raw) as Partial<StoredPanels> | null;
    return { left: v?.left !== false, right: v?.right !== false };
  } catch {
    return { left: true, right: true };
  }
}

function writePanels(p: StoredPanels): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private mode or blocked storage: the choice lasts for this session only.
  }
}

export interface EditorChromeState {
  /** The slides and layers sidebar is shown. */
  leftOpen: boolean;
  /** The inspector is shown. */
  rightOpen: boolean;
  setLeftOpen(open: boolean): void;
  setRightOpen(open: boolean): void;
  toggleLeft(): void;
  toggleRight(): void;
}

export const useEditorChrome = create<EditorChromeState>()((set, get) => {
  const initial = readPanels();
  const save = () => writePanels({ left: get().leftOpen, right: get().rightOpen });
  return {
    leftOpen: initial.left,
    rightOpen: initial.right,
    setLeftOpen(open) {
      if (get().leftOpen === open) return;
      set({ leftOpen: open });
      save();
    },
    setRightOpen(open) {
      if (get().rightOpen === open) return;
      set({ rightOpen: open });
      save();
    },
    toggleLeft() {
      get().setLeftOpen(!get().leftOpen);
    },
    toggleRight() {
      get().setRightOpen(!get().rightOpen);
    },
  };
});

let listDragging = false;

/** Called by the sortable lists when a drag starts and ends. */
export function setListDragging(dragging: boolean): void {
  listDragging = dragging;
}

/** True while a slide or layer is being dragged (by pointer or keyboard). */
export function isListDragging(): boolean {
  return listDragging;
}

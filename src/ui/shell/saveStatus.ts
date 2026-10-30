import { create } from 'zustand';
import type { AutosaveStatus } from '../../runtime';

/** Autosave state of the open project, shown by the editor's top bar. */
export interface SaveStatusState {
  status: AutosaveStatus;
  error: string | null;
  /** Time of the last successful save (ms since epoch). */
  savedAt: number | null;
  setStatus(status: AutosaveStatus, error?: unknown): void;
  reset(): void;
}

export const useSaveStatus = create<SaveStatusState>()((set) => ({
  status: 'idle',
  error: null,
  savedAt: null,
  setStatus(status, error) {
    set((s) => ({
      status,
      error: status === 'error' ? (error instanceof Error ? error.message : error ? String(error) : 'Could not save') : null,
      savedAt: status === 'saved' ? Date.now() : s.savedAt,
    }));
  },
  reset() {
    set({ status: 'idle', error: null, savedAt: null });
  },
}));

/**
 * Home screen UI state shared by the top bar, the library and the dialogs:
 * the project search, the new-project dialog request and Settings.
 */
import { create } from 'zustand';

/** Where the new-project dialog opens: built-in templates, the community gallery or My templates. */
export type TemplateSource = 'builtin' | 'community' | 'mine';

export interface NewProjectRequest {
  /** Template to select first (built-in or user template id); null selects Blank. Undefined: the default pick. */
  templateId?: string | null;
  source?: TemplateSource;
  /** Changes on every open, so the dialog starts fresh. */
  nonce: number;
}

export interface HomeUiState {
  query: string;
  setQuery(query: string): void;
  /** The open new-project dialog, or null. */
  newProject: NewProjectRequest | null;
  openNewProject(options?: { templateId?: string | null; source?: TemplateSource }): void;
  closeNewProject(): void;
  settingsOpen: boolean;
  setSettingsOpen(open: boolean): void;
}

let nonce = 0;

export const useHomeUi = create<HomeUiState>()((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  newProject: null,
  openNewProject: (options) => set({ newProject: { ...options, nonce: ++nonce } }),
  closeNewProject: () => set({ newProject: null }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));

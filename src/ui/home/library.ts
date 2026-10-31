/**
 * The project library shown on the home screen: the listing, per-project
 * busy states, and every library action (open, rename, duplicate, export,
 * delete, import). Lives at module level so returning home shows the last
 * list instantly while it refreshes in the background.
 */
import { create } from 'zustand';
import { cleanName } from '../../model/rules';
import type { ProjectMeta } from '../../model/types';
import { getPlatform } from '../../platform';
import {
  duplicateProject,
  exportProjectArchive,
  importProjectArchive,
  listProjects,
  loadProject,
  saveProject,
} from '../../storage';
import { confirmDialog, deleteProjectById, openProjectById, subscribeProject, toast } from '../../store';
import { archiveFileName, shorten } from './format';

import { t } from '../../i18n';
export type LibraryStatus = 'loading' | 'ready' | 'error';
export type ProjectBusy = 'opening' | 'renaming' | 'duplicating' | 'exporting' | 'deleting';

export interface LibraryState {
  status: LibraryStatus;
  /** Most recently edited first. */
  projects: ProjectMeta[];
  error: string | null;
  busy: Readonly<Record<string, ProjectBusy>>;
  /** The project being opened; other opens wait until it settles. */
  openingId: string | null;
  /** The card showing its inline rename field. */
  renamingId: string | null;
  /** A card that should take keyboard focus once it renders (a new copy, a renamed card). */
  focusRequest: { id: string; nonce: number } | null;
  /** A card briefly ringed to show where it went (a new copy, a renamed card). */
  flashId: string | null;
  /** A .wajha file is being imported. */
  importing: boolean;
}

export const useLibrary = create<LibraryState>()(() => ({
  status: 'loading',
  projects: [],
  error: null,
  busy: {},
  openingId: null,
  renamingId: null,
  focusRequest: null,
  flashId: null,
  importing: false,
}));

/** Human-readable message from anything thrown. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return typeof e === 'string' ? e : 'Something went wrong.';
}

/** True for "the user closed the picker", which is not an error. */
function isCancel(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'cancelled';
}

function setBusy(id: string, kind: ProjectBusy | null): void {
  useLibrary.setState((s) => {
    const busy = { ...s.busy };
    if (kind) busy[id] = kind;
    else delete busy[id];
    return { busy };
  });
}

/** True when keyboard focus is inside the project's card or nowhere (so moving it steals nothing). */
function focusIsOn(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  return active.closest('[data-project-id]')?.getAttribute('data-project-id') === id;
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;

function requestFocus(id: string, highlight = true): void {
  useLibrary.setState((s) => ({ focusRequest: { id, nonce: (s.focusRequest?.nonce ?? 0) + 1 }, ...(highlight ? { flashId: id } : {}) }));
  if (!highlight) return;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (useLibrary.getState().flashId === id) useLibrary.setState({ flashId: null });
  }, 1400);
}

/** The project last open in the editor: the home screen hands keyboard focus back to its card. */
let returnTo: string | null = null;
subscribeProject((next) => {
  if (next) returnTo = next.id;
});

/** Focuses the card of the project the user just came back from (once). */
export function restoreReturnFocus(): void {
  const id = returnTo;
  returnTo = null;
  if (id) requestFocus(id, false);
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function sameMeta(a: ProjectMeta, b: ProjectMeta): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.updatedAt === b.updatedAt &&
    a.createdAt === b.createdAt &&
    a.slideCount === b.slideCount &&
    a.templateId === b.templateId &&
    sameList(a.families, b.families) &&
    sameList(a.languages, b.languages)
  );
}

/** The fresh list, reusing unchanged entries so memoised cards do not re-render. */
export function mergeProjects(previous: readonly ProjectMeta[], next: readonly ProjectMeta[]): ProjectMeta[] {
  const old = new Map(previous.map((m) => [m.id, m]));
  return next.map((m) => {
    const before = old.get(m.id);
    return before && sameMeta(before, m) ? before : m;
  });
}

let loadTicket = 0;

/** Re-reads the library. A failure keeps showing the last good list. */
export async function refreshProjects(): Promise<void> {
  const ticket = ++loadTicket;
  const first = useLibrary.getState().status !== 'ready';
  if (first) useLibrary.setState({ status: 'loading', error: null });
  try {
    const list = await listProjects();
    if (ticket !== loadTicket) return;
    useLibrary.setState((s) => {
      // A rename in flight keeps showing its new name until its own save lands.
      const merged = mergeProjects(s.projects, list).map((m) => (s.busy[m.id] === 'renaming' ? (s.projects.find((p) => p.id === m.id) ?? m) : m));
      return { status: 'ready', error: null, projects: merged };
    });
  } catch (e) {
    if (ticket !== loadTicket) return;
    if (useLibrary.getState().status === 'ready') return;
    useLibrary.setState({ status: 'error', error: errorText(e) });
  }
}

/** Opens a project in the editor (the home screen unmounts on success). */
export async function openProject(id: string): Promise<void> {
  const s = useLibrary.getState();
  if (s.openingId || s.renamingId === id) return;
  useLibrary.setState({ openingId: id });
  setBusy(id, 'opening');
  try {
    await openProjectById(id);
  } catch (e) {
    toast.error(t('Could not open the project'), errorText(e));
    void refreshProjects();
  } finally {
    setBusy(id, null);
    if (useLibrary.getState().openingId === id) useLibrary.setState({ openingId: null });
  }
}

export function startRename(id: string): void {
  if (useLibrary.getState().busy[id]) return;
  useLibrary.setState({ renamingId: id });
}

export function cancelRename(): void {
  useLibrary.setState({ renamingId: null });
}

/**
 * "Rename" chosen in a menu: the field must open only after the menu has
 * closed and given focus back, or the field would lose focus at once.
 */
let renameAfterMenu: string | null = null;

export function renameWhenMenuCloses(id: string): void {
  renameAfterMenu = id;
}

/** For a menu's onCloseAutoFocus: starts the pending rename; true when it did (skip the focus return). */
export function startPendingRename(id: string): boolean {
  if (renameAfterMenu !== id) return false;
  renameAfterMenu = null;
  startRename(id);
  return true;
}

/**
 * Renames through the lightweight path (load, set name and updatedAt,
 * save), showing the new name immediately and reverting on failure.
 */
export async function renameProject(id: string, rawName: string, refocus = false): Promise<void> {
  useLibrary.setState({ renamingId: null });
  const name = cleanName(rawName);
  const meta = useLibrary.getState().projects.find((m) => m.id === id);
  if (!meta || !name || name === meta.name) return;
  const previous = meta.name;
  const rename = (to: string) =>
    useLibrary.setState((s) => ({ projects: s.projects.map((m) => (m.id === id ? { ...m, name: to } : m)) }));
  rename(name);
  setBusy(id, 'renaming');
  try {
    const project = await loadProject(id);
    await saveProject({ ...project, name, updatedAt: Date.now() });
  } catch (e) {
    rename(previous);
    toast.error(t('Could not rename the project'), errorText(e));
  } finally {
    setBusy(id, null);
  }
  await refreshProjects();
  if (refocus) requestFocus(id);
}

export async function duplicateProjectById(id: string): Promise<void> {
  const meta = useLibrary.getState().projects.find((m) => m.id === id);
  if (!meta || useLibrary.getState().busy[id]) return;
  setBusy(id, 'duplicating');
  try {
    const copy = await duplicateProject(id, `${meta.name} copy`);
    await refreshProjects();
    requestFocus(copy.id);
  } catch (e) {
    toast.error(t('Could not duplicate the project'), errorText(e));
  } finally {
    setBusy(id, null);
  }
}

export async function exportProjectFile(id: string): Promise<void> {
  const meta = useLibrary.getState().projects.find((m) => m.id === id);
  if (!meta || useLibrary.getState().busy[id]) return;
  setBusy(id, 'exporting');
  try {
    const bytes = await exportProjectArchive(id);
    const saved = await getPlatform().saveFile(archiveFileName(meta.name, 'wajha'), bytes);
    if (saved) toast.success(t('Project exported'), saved);
  } catch (e) {
    if (!isCancel(e)) toast.error(t('Could not export the project'), errorText(e));
  } finally {
    setBusy(id, null);
  }
}

export async function deleteProjectWithConfirm(id: string): Promise<void> {
  const meta = useLibrary.getState().projects.find((m) => m.id === id);
  if (!meta || useLibrary.getState().busy[id]) return;
  const where = getPlatform().kind === 'desktop' ? 'this computer' : 'this browser';
  const ok = await confirmDialog({
    title: t('Delete “{shorten}”?', { shorten: shorten(meta.name) }),
    message: t('The project and its screenshots will be removed from {where}. This cannot be undone.', { where }),
    confirmLabel: t('Delete project'),
    danger: true,
  });
  if (!ok) return;
  setBusy(id, 'deleting');
  try {
    await deleteProjectById(id);
    const list = useLibrary.getState().projects;
    const at = list.findIndex((m) => m.id === id);
    // Keyboard focus moves to the card that takes its place.
    const neighbour = list[at + 1] ?? list[at - 1];
    useLibrary.setState((s) => ({ projects: s.projects.filter((m) => m.id !== id) }));
    if (neighbour && focusIsOn(id)) requestFocus(neighbour.id);
  } catch (e) {
    toast.error(t('Could not delete the project'), errorText(e));
  } finally {
    setBusy(id, null);
  }
  void refreshProjects();
}

/** Imports a .wajha archive and opens it. */
export async function importProjectBytes(data: Uint8Array, fileName: string): Promise<void> {
  if (useLibrary.getState().importing) return;
  useLibrary.setState({ importing: true });
  try {
    const meta = await importProjectArchive(data);
    void refreshProjects();
    await openProjectById(meta.id);
  } catch (e) {
    toast.error(t('Could not open “{shorten}”', { shorten: shorten(fileName, 48) }), errorText(e));
  } finally {
    useLibrary.setState({ importing: false });
  }
}

/** "Open file…": picks a .wajha file, imports it as a new project and opens it. */
export async function openProjectFile(): Promise<void> {
  if (useLibrary.getState().importing) return;
  let file: { name: string; data: Uint8Array } | null;
  try {
    file = await getPlatform().openFile('project');
  } catch (e) {
    if (!isCancel(e)) toast.error(t('Could not open the file'), errorText(e));
    return;
  }
  if (file) await importProjectBytes(file.data, file.name);
}

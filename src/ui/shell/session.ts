/**
 * Ties runtime services to the open project: one autosave per project,
 * font loading, and cleanup (unused assets, decoded images, engine caches)
 * when a project closes, which the home screen can wait for
 * (projectReleased). Also makes sure pending edits are written before the
 * desktop window closes.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '../../model/types';
import { clearEngineCaches } from '../../engine';
import { getPlatform } from '../../platform';
import { ensureFonts, getImageCache, startAutosave, type AutosaveHandle } from '../../runtime';
import { pruneAssets } from '../../storage';
import { flushProject, setProjectFlusher, subscribeProject, useEditor } from '../../store';
import { useSaveStatus } from './saveStatus';

let handle: AutosaveHandle | null = null;
let handleProjectId: string | null = null;
let started = false;
/** Closed projects whose release (see releaseProject) is still running, by id. */
const releases = new Map<string, Promise<void>>();

/** Longest wait for the last thumbnail of a closing project. */
const THUMBNAIL_WAIT_MS = 3000;

const within = (work: Promise<unknown>, ms: number): Promise<unknown> =>
  Promise.race([work.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, ms))]);

/**
 * Resolves once a closed project is fully released: its last thumbnail drawn
 * (or given up on) and its decoded images freed. The home screen waits for
 * this before drawing the project's thumbnail itself, so the two never draw
 * the same picture or evict images from under each other. Never rejects.
 */
export async function projectReleased(id: string): Promise<void> {
  // Closed again meanwhile (reopened and left): wait for that release too.
  for (let release = releases.get(id); release; release = releases.get(id)) await release;
}

function closeSession(previous: Project | null): Promise<void> {
  const h = handle;
  handle = null;
  handleProjectId = null;
  setProjectFlusher(null);
  const saved = endAutosave(h);
  const closed = saved.then(() => useSaveStatus.getState().reset());
  // The next project's session starts once `closed` settles; the rest runs in the background.
  const released = saved.then((ok) => releaseProject(h, previous, ok)).catch(() => undefined);
  if (previous) {
    // Registered before the home screen can mount and ask (this runs in the store's notification).
    const id = previous.id;
    releases.set(id, released);
    void released.then(() => {
      if (releases.get(id) === released) releases.delete(id);
    });
  }
  return closed;
}

/** Writes the last edits and stops autosave; resolves whether the project on disk is up to date. */
async function endAutosave(h: AutosaveHandle | null): Promise<boolean> {
  if (!h) return true;
  try {
    // goHome() flushes before closing; this catches any other way a project closes.
    await h.flush();
    return true;
  } catch {
    return false;
  } finally {
    h.stop();
  }
}

/**
 * Finishes closing a project: draws its home-screen thumbnail from the last
 * save (home cards pick it up when it is written), then frees its decoded
 * images and the engine caches and deletes images it no longer uses.
 */
async function releaseProject(h: AutosaveHandle | null, previous: Project | null, saved: boolean): Promise<void> {
  if (h && saved) await within(h.flushThumbnail(), THUMBNAIL_WAIT_MS);
  // Reopened meanwhile: its images are in use again.
  if (!previous || useEditor.getState().project?.id === previous.id) return;
  getImageCache().evictProject(previous.id);
  clearEngineCaches();
  // Only prune when the last save worked: the file on disk must not point at deleted images.
  if (saved) {
    try {
      await pruneAssets(previous, { isOpen: () => useEditor.getState().project?.id === previous.id });
    } catch (err) {
      console.warn('[session] could not prune unused images', err);
    }
  }
}

function openSession(project: Project): void {
  const id = project.id;
  handleProjectId = id;
  handle = startAutosave({
    getProject: () => {
      const p = useEditor.getState().project;
      return p && p.id === id ? p : null;
    },
    subscribe: (listener) => subscribeProject(() => listener()),
    onStatus: (status, error) => {
      if (handleProjectId === id) useSaveStatus.getState().setStatus(status, error);
    },
  });
  const own = handle;
  setProjectFlusher(() => own.flush());
  void ensureFonts(project);
}

/** Starts watching the editor store. Safe to call more than once. */
export function startSessionManager(): void {
  if (started) return;
  started = true;
  let current: Project | null = useEditor.getState().project;
  if (current) openSession(current);
  subscribeProject((next, previous) => {
    const nextId = next?.id ?? null;
    if (nextId === (current?.id ?? null)) {
      current = next;
      return;
    }
    const closing = current ?? previous;
    current = next;
    void closeSession(closing).then(() => {
      const open = useEditor.getState().project;
      if (open && open.id === nextId && handleProjectId !== nextId) openSession(open);
    });
  });
  void installDesktopCloseGuard();
}

/** Saves pending edits and the thumbnail, waiting at most 3 s so closing never hangs. */
function flushBeforeLeaving(): Promise<unknown> {
  const own = handle;
  return within(flushProject().then(() => own?.flushThumbnail()), 3000);
}

/**
 * Desktop only: flush autosave before the window closes, and before the app
 * quits (Cmd+Q / app menu), where the Rust shell holds the exit back and
 * sends "wajha://before-exit" until we call confirm_exit.
 */
async function installDesktopCloseGuard(): Promise<void> {
  if (getPlatform().kind !== 'desktop') return;
  try {
    const [{ getCurrentWindow }, { listen }] = await Promise.all([import('@tauri-apps/api/window'), import('@tauri-apps/api/event')]);
    await getCurrentWindow().onCloseRequested(async () => {
      await flushBeforeLeaving();
    });
    await listen('wajha://before-exit', async () => {
      await flushBeforeLeaving();
      await invoke('confirm_exit').catch(() => undefined);
    });
  } catch (err) {
    console.warn('[session] close guard unavailable', err);
  }
}

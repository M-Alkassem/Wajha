/**
 * Autosave: writes the open project a moment after the user stops editing,
 * never runs two saves at once, retries failed saves with backoff, and
 * refreshes the home-screen thumbnail a few seconds after a successful save.
 *
 * Change detection is by reference (plus updatedAt): store mutations go
 * through immer, so a notification that leaves the project object untouched
 * (selection, zoom, panels) costs nothing and never shows "unsaved".
 */
import type { Project } from '../model/types';
import { saveProject, writeThumbnail } from '../storage';
import { PageUnloadingError, pageIsUnloading } from './canvas';
import { renderThumbnail } from './renderer';
import { noop } from './util';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveHandle {
  /** Saves immediately if there are pending changes. */
  flush(): Promise<void>;
  /**
   * Resolves once the home-screen thumbnail shows the last saved version,
   * rendering it now if needed. Works after stop(); never rejects.
   */
  flushThumbnail(): Promise<void>;
  stop(): void;
}

export interface AutosaveOptions {
  getProject(): Project | null;
  /** Subscribe to project changes; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  onStatus?(status: 'idle' | 'pending' | 'saving' | 'saved' | 'error', error?: unknown): void;
  delayMs?: number;
  /** Called after a fresh home-screen thumbnail was written for the project. */
  onThumbnail?(projectId: string): void;
}

export const AUTOSAVE_DELAY_MS = 800;
/** Waits before the automatic retries of a failed save. */
export const AUTOSAVE_RETRY_MS: readonly number[] = [2000, 5000, 10000];
export const THUMBNAIL_DELAY_MS = 4000;

type Timer = ReturnType<typeof setTimeout>;

interface Version {
  project: Project;
  updatedAt: number;
}

const versionOf = (p: Project | null): Version | null => (p ? { project: p, updatedAt: p.updatedAt } : null);
const sameVersion = (p: Project, v: Version | null) => v !== null && v.project === p && v.updatedAt === p.updatedAt;

/**
 * Starts autosaving. The project as it is now counts as saved (it was just
 * loaded or created and written). Call `flush()` before `stop()` to persist
 * the last edits; `flush()` rejects when that save fails.
 */
export function startAutosave(opts: AutosaveOptions): AutosaveHandle {
  const delay = opts.delayMs !== undefined && Number.isFinite(opts.delayMs) && opts.delayMs >= 0 ? opts.delayMs : AUTOSAVE_DELAY_MS;

  let stopped = false;
  let status: AutosaveStatus = 'idle';
  let saved: Version | null = versionOf(opts.getProject());
  let inflight: Version | null = null;
  // The last project seen: still saved when the store already dropped it (editor closing).
  let latest: Project | null = saved?.project ?? null;

  let busy = false;
  let again = false;
  let cycle: Promise<void> = Promise.resolve();
  let saveTimer: Timer | null = null;
  let retryTimer: Timer | null = null;
  let retries = 0;

  let thumbTimer: Timer | null = null;
  let thumbRun: Promise<void> | null = null;
  let thumbAgain = false;
  // The version as opened already has its thumbnail, or the home screen draws one
  // (it redraws a thumbnail that is missing or shows another version).
  let thumbOf: Project | null = saved?.project ?? null;
  let thumbWarned = false;

  const clear = (t: Timer | null): null => {
    if (t !== null) clearTimeout(t);
    return null;
  };

  function setStatus(next: AutosaveStatus, error?: unknown): void {
    // Repeated errors are reported each time (the error may differ); other repeats are noise.
    if (next === status && next !== 'error') return;
    status = next;
    if (stopped || !opts.onStatus) return;
    try {
      if (error === undefined) opts.onStatus(next);
      else opts.onStatus(next, error);
    } catch (err) {
      console.error('[autosave] status listener failed', err);
    }
  }

  const target = (): Project | null => opts.getProject() ?? latest;
  const unsaved = (): boolean => {
    const p = target();
    return p !== null && !sameVersion(p, saved);
  };

  function scheduleSave(): void {
    saveTimer = clear(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      run().catch(noop);
    }, delay);
  }

  function onChange(): void {
    if (stopped) return;
    const current = opts.getProject();
    if (current) latest = current;
    const p = current ?? latest;
    // Unrelated store change, or the version being written right now.
    if (!p || sameVersion(p, inflight)) return;
    if (sameVersion(p, saved) && !busy) {
      // Undo went back to exactly what is on disk.
      saveTimer = clear(saveTimer);
      retryTimer = clear(retryTimer);
      if (status === 'pending' || status === 'error') setStatus('saved');
      return;
    }
    // Different from what the disk will hold once any running save finishes.
    setStatus('pending');
    retryTimer = clear(retryTimer);
    retries = 0;
    scheduleSave();
  }

  function scheduleRetry(): void {
    if (stopped || saveTimer !== null || retries >= AUTOSAVE_RETRY_MS.length) return;
    const wait = AUTOSAVE_RETRY_MS[retries++];
    retryTimer = clear(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      run().catch(noop);
    }, wait);
  }

  async function saveCycle(): Promise<void> {
    let wrote = false;
    try {
      do {
        again = false;
        const p = target();
        if (!p || sameVersion(p, saved)) break;
        inflight = versionOf(p);
        setStatus('saving');
        try {
          await saveProject(p);
        } catch (err) {
          inflight = null;
          if (!stopped) {
            setStatus('error', err);
            scheduleRetry();
          }
          throw err;
        }
        inflight = null;
        saved = versionOf(p);
        wrote = true;
        retries = 0;
        retryTimer = clear(retryTimer);
      } while (again && !stopped);
    } finally {
      busy = false;
    }
    if (stopped) return;
    if (unsaved()) {
      // Edited during the save: the debounce timer that edit started saves it
      // (started here if the store changed without notifying).
      setStatus('pending');
      if (saveTimer === null && retryTimer === null) scheduleSave();
    } else if (wrote || status === 'pending' || status === 'error') {
      setStatus('saved');
      if (wrote) scheduleThumbnail();
    }
  }

  /** Starts a save cycle, or asks the running one to go again; resolves when that cycle ends. */
  function run(): Promise<void> {
    if (busy) {
      again = true;
      return cycle;
    }
    busy = true;
    cycle = saveCycle();
    return cycle;
  }

  function scheduleThumbnail(): void {
    if (stopped) return;
    thumbTimer = clear(thumbTimer);
    thumbTimer = setTimeout(() => {
      thumbTimer = null;
      void refreshThumbnail();
    }, THUMBNAIL_DELAY_MS);
  }

  /** Draws the last saved version; a call while one is drawing queues one more. */
  function refreshThumbnail(): Promise<void> {
    if (thumbRun) {
      thumbAgain = true;
      return thumbRun;
    }
    const p = saved?.project ?? null;
    // An unloading page could not finish the picture (its canvas cannot be read back).
    if (!p || p === thumbOf || pageIsUnloading()) return Promise.resolve();
    thumbRun = drawThumbnail(p).finally(() => {
      thumbRun = null;
      if (thumbAgain && !stopped) {
        thumbAgain = false;
        void refreshThumbnail();
      }
    });
    return thumbRun;
  }

  async function drawThumbnail(p: Project): Promise<void> {
    try {
      const jpeg = await renderThumbnail(p);
      await writeThumbnail(p.id, jpeg, p.updatedAt);
      thumbOf = p;
      try {
        opts.onThumbnail?.(p.id);
      } catch (err) {
        console.error('[autosave] thumbnail listener failed', err);
      }
    } catch (err) {
      // A thumbnail is cosmetic: never surface it as a save error, and do not spam the console.
      // One cut short by the page unloading is expected and not worth a word.
      if (err instanceof PageUnloadingError || thumbWarned) return;
      thumbWarned = true;
      console.warn('[autosave] thumbnail refresh failed', err);
    }
  }

  async function flushThumbnail(): Promise<void> {
    thumbTimer = clear(thumbTimer);
    // A running render may be drawing an older version: let it finish, then draw the last saved one.
    while (thumbRun) await thumbRun;
    await refreshThumbnail();
  }

  /** Writes pending changes now; rejects when that save fails. */
  async function saveNow(): Promise<void> {
    saveTimer = clear(saveTimer);
    retryTimer = clear(retryTimer);
    // A running save may be writing an older version; let it finish first.
    while (busy) {
      try {
        await cycle;
      } catch {
        /* superseded by the save below */
      }
    }
    if (unsaved()) await run();
  }

  async function flush(): Promise<void> {
    await saveNow();
    // The editor is usually closing: bring the home-screen thumbnail up to date now.
    if (thumbTimer !== null) {
      thumbTimer = clear(thumbTimer);
      void refreshThumbnail();
    }
  }

  // Leaving the page: only the save can still finish. A due thumbnail keeps its
  // timer, for a page that stays after all or comes back from the back-forward cache.
  // When the page does go, thumb.jpg still says it shows an older version, and the
  // home screen draws it again.
  const onPageHide = () => {
    saveNow().catch(noop);
  };

  const unsubscribe = opts.subscribe(onChange);
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('beforeunload', onPageHide);

  return {
    flush,
    flushThumbnail,
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      saveTimer = clear(saveTimer);
      retryTimer = clear(retryTimer);
      thumbTimer = clear(thumbTimer);
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('beforeunload', onPageHide);
    },
  };
}

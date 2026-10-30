import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../model/types';

interface Handle {
  flush: ReturnType<typeof vi.fn<() => Promise<void>>>;
  flushThumbnail: ReturnType<typeof vi.fn<() => Promise<void>>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
}

const h = vi.hoisted(() => {
  let project: { id: string } | null = null;
  const listeners = new Set<(next: unknown, previous: unknown) => void>();
  return {
    handles: [] as Handle[],
    /** What the next autosave handle does when asked for its last thumbnail. */
    flushThumbnail: null as (() => Promise<void>) | null,
    evictProject: vi.fn<(id: string) => void>(),
    pruneAssets: vi.fn<(project: Project) => Promise<number>>(),
    /** The editor store: open (or close with null) a project, notifying like subscribeProject does. */
    setProject(next: { id: string } | null) {
      const previous = project;
      project = next;
      for (const l of [...listeners]) l(next, previous);
    },
    getProject: () => project,
    listeners,
  };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../engine', () => ({ clearEngineCaches: vi.fn() }));
vi.mock('../../platform', () => ({ getPlatform: () => ({ kind: 'web' }) }));
vi.mock('../../runtime', () => ({
  ensureFonts: vi.fn(async () => undefined),
  getImageCache: () => ({ evictProject: h.evictProject }),
  startAutosave: () => {
    const draw = h.flushThumbnail ?? (async () => undefined);
    const handle: Handle = { flush: vi.fn(async () => undefined), flushThumbnail: vi.fn(draw), stop: vi.fn() };
    h.handles.push(handle);
    return handle;
  },
}));
vi.mock('../../storage', () => ({ pruneAssets: h.pruneAssets }));
vi.mock('../../store', () => ({
  flushProject: vi.fn(async () => undefined),
  setProjectFlusher: vi.fn(),
  subscribeProject: (listener: (next: unknown, previous: unknown) => void) => {
    h.listeners.add(listener);
    return () => h.listeners.delete(listener);
  },
  useEditor: { getState: () => ({ project: h.getProject() }) },
}));
vi.mock('./saveStatus', () => ({ useSaveStatus: { getState: () => ({ reset: vi.fn(), setStatus: vi.fn() }) } }));

import { projectReleased, startSessionManager } from './session';

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Resolves to true once `p` has settled, false while it is pending. */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  void p.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.handles.length = 0;
  h.flushThumbnail = null;
  h.evictProject.mockReset();
  h.pruneAssets.mockReset();
  h.pruneAssets.mockResolvedValue(0);
  startSessionManager();
});

afterEach(() => {
  h.setProject(null);
  vi.useRealTimers();
});

describe('projectReleased', () => {
  it('resolves at once for a project that is not closing', async () => {
    expect(await settled(projectReleased('never-open'))).toBe(true);
  });

  it('resolves once the closed project has its last thumbnail and its images are freed', async () => {
    const thumbnail = deferred();
    h.flushThumbnail = () => thumbnail.promise;
    h.setProject({ id: 'a' });
    await vi.advanceTimersByTimeAsync(0);
    h.setProject(null);
    // Asked right away, as the home screen does when it mounts.
    const released = projectReleased('a');
    expect(await settled(released)).toBe(false);
    expect(h.evictProject).not.toHaveBeenCalled();
    thumbnail.resolve();
    expect(await settled(released)).toBe(true);
    expect(h.evictProject).toHaveBeenCalledWith('a');
    expect(h.pruneAssets).toHaveBeenCalledTimes(1);
  });

  it('waits for the next release when the project was opened and closed again meanwhile', async () => {
    const first = deferred();
    const second = deferred();
    h.flushThumbnail = () => first.promise;
    h.setProject({ id: 'b' });
    await vi.advanceTimersByTimeAsync(0);
    h.setProject(null);
    const released = projectReleased('b');
    await vi.advanceTimersByTimeAsync(0);
    h.flushThumbnail = () => second.promise;
    h.setProject({ id: 'b' });
    await vi.advanceTimersByTimeAsync(0);
    h.setProject(null);
    await vi.advanceTimersByTimeAsync(0);
    first.resolve();
    expect(await settled(released)).toBe(false);
    second.resolve();
    expect(await settled(released)).toBe(true);
  });

  it('gives up waiting for a thumbnail after 3 s, and never rejects', async () => {
    h.flushThumbnail = () => new Promise<void>(() => undefined);
    h.pruneAssets.mockRejectedValue(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.setProject({ id: 'c' });
    await vi.advanceTimersByTimeAsync(0);
    h.setProject(null);
    const released = projectReleased('c');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(await settled(released)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(released)).toBe(true);
    await expect(released).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

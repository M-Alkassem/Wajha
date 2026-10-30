import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../model/types';

const h = vi.hoisted(() => ({
  saveProject: vi.fn<(project: Project) => Promise<void>>(),
  writeThumbnail: vi.fn<(id: string, jpeg: Uint8Array, updatedAt: number) => Promise<void>>(),
  renderThumbnail: vi.fn<(project: Project) => Promise<Uint8Array>>(),
  pageIsUnloading: vi.fn<() => boolean>(),
}));
vi.mock('../storage', () => ({ saveProject: h.saveProject, writeThumbnail: h.writeThumbnail }));
vi.mock('./renderer', () => ({ renderThumbnail: h.renderThumbnail }));
vi.mock('./canvas', async (importOriginal) => ({ ...(await importOriginal<typeof import('./canvas')>()), pageIsUnloading: h.pageIsUnloading }));

import { AUTOSAVE_RETRY_MS, startAutosave, THUMBNAIL_DELAY_MS, type AutosaveOptions, type AutosaveStatus } from './autosave';
import { PageUnloadingError } from './canvas';
import { project } from './fixtures.node';

/** A minimal store: replaces the project like immer does and notifies subscribers. */
function store(initial: Project | null) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: Project | null) {
      current = next;
      for (const l of [...listeners]) l();
    },
    /** Same project, e.g. a selection change in the editor store. */
    poke() {
      for (const l of [...listeners]) l();
    },
    edit(name: string) {
      if (!current) throw new Error('no project');
      this.set({ ...current, name, updatedAt: current.updatedAt + 1 });
      return current;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
  };
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(err: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function start(s: ReturnType<typeof store>, extra: Partial<AutosaveOptions> = {}) {
  const statuses: AutosaveStatus[] = [];
  const errors: unknown[] = [];
  const handle = startAutosave({
    getProject: s.get,
    subscribe: (l) => s.subscribe(l),
    onStatus: (status, error) => {
      statuses.push(status);
      if (error !== undefined) errors.push(error);
    },
    ...extra,
  });
  return { handle, statuses, errors };
}

const savedNames = () => h.saveProject.mock.calls.map((c) => c[0].name);

beforeEach(() => {
  vi.useFakeTimers();
  h.saveProject.mockReset();
  h.saveProject.mockResolvedValue(undefined);
  h.writeThumbnail.mockReset();
  h.writeThumbnail.mockResolvedValue(undefined);
  h.renderThumbnail.mockReset();
  h.renderThumbnail.mockResolvedValue(new Uint8Array([0xff, 0xd8]));
  h.pageIsUnloading.mockReset();
  h.pageIsUnloading.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('debounced saving', () => {
  it('saves once after 800 ms of quiet', async () => {
    const s = store(project());
    const { statuses } = start(s);
    s.edit('a');
    await vi.advanceTimersByTimeAsync(500);
    s.edit('ab');
    await vi.advanceTimersByTimeAsync(500);
    s.edit('abc');
    await vi.advanceTimersByTimeAsync(799);
    expect(h.saveProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(savedNames()).toEqual(['abc']);
    expect(h.saveProject.mock.calls[0][0]).toBe(s.get());
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('honours a custom delay and falls back for invalid ones', async () => {
    const s = store(project());
    start(s, { delayMs: 50 });
    s.edit('x');
    await vi.advanceTimersByTimeAsync(50);
    expect(h.saveProject).toHaveBeenCalledTimes(1);

    const t = store(project());
    start(t, { delayMs: Number.NaN });
    t.edit('y');
    await vi.advanceTimersByTimeAsync(799);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.saveProject).toHaveBeenCalledTimes(2);
  });

  it('ignores notifications that leave the project untouched', async () => {
    const s = store(project());
    const { statuses } = start(s);
    s.poke();
    s.set(s.get()); // same object again
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveProject).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it('detects in-place mutations through updatedAt', async () => {
    const p = project();
    const s = store(p);
    start(s);
    p.updatedAt += 1;
    s.poke();
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
  });

  it('cancels the save when undo returns to the saved version', async () => {
    const original = project();
    const s = store(original);
    const { statuses } = start(s);
    s.edit('changed');
    s.set(original);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveProject).not.toHaveBeenCalled();
    expect(statuses).toEqual(['pending', 'saved']);
  });

  it('saves the first project that appears when it started without one', async () => {
    const s = store(null);
    start(s);
    s.set(project({ name: 'fresh' }));
    await vi.advanceTimersByTimeAsync(800);
    expect(savedNames()).toEqual(['fresh']);
  });
});

describe('concurrency', () => {
  it('never runs two saves at once; a change during a save schedules another', async () => {
    let active = 0;
    let peak = 0;
    const gates: Deferred[] = [];
    h.saveProject.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      active--;
    });
    const s = store(project());
    const { statuses } = start(s);
    s.edit('one');
    await vi.advanceTimersByTimeAsync(800);
    expect(savedNames()).toEqual(['one']);
    s.edit('two');
    await vi.advanceTimersByTimeAsync(800); // the debounce fires while "one" is still saving
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    gates[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(savedNames()).toEqual(['one', 'two']); // follow-up starts right away
    gates[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(peak).toBe(1);
    expect(statuses).toEqual(['pending', 'saving', 'pending', 'saving', 'saved']);
  });

  it('waits for the debounce when the edit lands late in a save', async () => {
    const gate = deferred();
    h.saveProject.mockImplementationOnce(() => gate.promise);
    const s = store(project());
    const { statuses } = start(s);
    s.edit('one');
    await vi.advanceTimersByTimeAsync(800);
    s.edit('two');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe('pending');
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(savedNames()).toEqual(['one', 'two']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('saves again when undo returns to the old version while a newer one is being written', async () => {
    const gate = deferred();
    h.saveProject.mockImplementationOnce(() => gate.promise);
    const original = project({ name: 'original' });
    const s = store(original);
    const { statuses } = start(s);
    s.edit('newer');
    await vi.advanceTimersByTimeAsync(800);
    s.set(original); // the disk is about to hold "newer"
    gate.resolve();
    await vi.advanceTimersByTimeAsync(800);
    expect(savedNames()).toEqual(['newer', 'original']);
    expect(statuses.at(-1)).toBe('saved');
  });
});

describe('flush', () => {
  it('saves pending changes immediately and resolves when done', async () => {
    const s = store(project());
    const { handle, statuses } = start(s);
    s.edit('now');
    await handle.flush();
    expect(savedNames()).toEqual(['now']);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
  });

  it('does nothing when everything is saved', async () => {
    const s = store(project());
    const { handle, statuses } = start(s);
    await handle.flush();
    expect(h.saveProject).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it('waits for a running save, then writes the newer version', async () => {
    const gate = deferred();
    h.saveProject.mockImplementationOnce(() => gate.promise);
    const s = store(project());
    const { handle } = start(s);
    s.edit('one');
    await vi.advanceTimersByTimeAsync(800);
    s.edit('two');
    let done = false;
    const flushing = handle.flush().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    gate.resolve();
    await flushing;
    expect(savedNames()).toEqual(['one', 'two']);
  });

  it('rejects when the save fails', async () => {
    h.saveProject.mockRejectedValue(new Error('disk full'));
    const s = store(project());
    const { handle, statuses, errors } = start(s);
    s.edit('x');
    await expect(handle.flush()).rejects.toThrow('disk full');
    expect(statuses.at(-1)).toBe('error');
    expect(errors).toHaveLength(1);
  });

  it('saves the last known project when the store already dropped it', async () => {
    const s = store(project());
    const { handle } = start(s);
    s.edit('last words');
    s.set(null); // the editor closed before flushing
    await handle.flush();
    expect(savedNames()).toEqual(['last words']);
  });

  it('flushes on pagehide and beforeunload until stopped', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const s = store(project());
    const { handle } = start(s);
    s.edit('a');
    target.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(savedNames()).toEqual(['a']);
    s.edit('b');
    target.dispatchEvent(new Event('beforeunload'));
    await vi.advanceTimersByTimeAsync(0);
    expect(savedNames()).toEqual(['a', 'b']);
    handle.stop();
    s.edit('c');
    target.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(savedNames()).toEqual(['a', 'b']);
  });
});

describe('errors and retries', () => {
  it('retries after 2 s, 5 s and 10 s, then gives up until the next change', async () => {
    h.saveProject.mockRejectedValue(new Error('locked'));
    const s = store(project());
    const { statuses } = start(s);
    s.edit('x');
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    expect(AUTOSAVE_RETRY_MS).toEqual([2000, 5000, 10000]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.saveProject).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.saveProject).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.saveProject).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.saveProject).toHaveBeenCalledTimes(4);
    expect(statuses.filter((st) => st === 'error')).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(0);

    // a new edit starts over: debounce, then the retry ladder again
    h.saveProject.mockResolvedValue(undefined);
    s.edit('y');
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveProject).toHaveBeenCalledTimes(5);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('recovers when a retry succeeds', async () => {
    h.saveProject.mockRejectedValueOnce(new Error('busy'));
    const s = store(project());
    const { statuses, errors } = start(s);
    s.edit('x');
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.saveProject).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(['pending', 'saving', 'error', 'saving', 'saved']);
    expect((errors[0] as Error).message).toBe('busy');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.saveProject).toHaveBeenCalledTimes(2);
  });

  it('lets an edit during a failing save take over from the retry ladder', async () => {
    const gate = deferred();
    h.saveProject.mockImplementationOnce(() => gate.promise);
    const s = store(project());
    start(s);
    s.edit('one');
    await vi.advanceTimersByTimeAsync(800);
    s.edit('two'); // debounce pending while the save fails
    gate.reject(new Error('nope'));
    await vi.advanceTimersByTimeAsync(800);
    expect(savedNames()).toEqual(['one', 'two']);
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.saveProject).toHaveBeenCalledTimes(2);
  });

  it('keeps saving when the status listener throws', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = store(project());
    startAutosave({
      getProject: s.get,
      subscribe: (l) => s.subscribe(l),
      onStatus: () => {
        throw new Error('ui crashed');
      },
    });
    s.edit('x');
    await vi.advanceTimersByTimeAsync(800);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalled();
  });
});

describe('stop', () => {
  it('unsubscribes, clears timers and stays quiet', async () => {
    const s = store(project());
    const { handle, statuses } = start(s);
    expect(s.listenerCount()).toBe(1);
    s.edit('x');
    handle.stop();
    handle.stop();
    expect(s.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    s.edit('y');
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.saveProject).not.toHaveBeenCalled();
    expect(statuses).toEqual(['pending']);
  });

  it('lets a running save finish without status updates or retries', async () => {
    const gate = deferred();
    h.saveProject.mockImplementationOnce(() => gate.promise);
    const s = store(project());
    const { handle, statuses } = start(s);
    s.edit('x');
    await vi.advanceTimersByTimeAsync(800);
    handle.stop();
    gate.reject(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.saveProject).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['pending', 'saving']);
    expect(h.renderThumbnail).not.toHaveBeenCalled();
  });
});

describe('thumbnails', () => {
  it('refreshes the thumbnail 4 s after the last successful save', async () => {
    const onThumbnail = vi.fn();
    const s = store(project({ id: 'p-thumb' }));
    start(s, { onThumbnail });
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(3000);
    const b = s.edit('b'); // saved at +800 ms, which restarts the 4 s thumbnail debounce
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS - 1);
    expect(h.renderThumbnail).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.renderThumbnail.mock.calls[0][0].name).toBe('b');
    // Written with the version it shows, so the home screen can tell when one falls behind.
    expect(h.writeThumbnail).toHaveBeenCalledWith('p-thumb', new Uint8Array([0xff, 0xd8]), b.updatedAt);
    expect(onThumbnail).toHaveBeenCalledWith('p-thumb');
  });

  it('records the version it drew, not a newer one saved while it was drawing', async () => {
    let finish!: () => void;
    h.renderThumbnail.mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = () => resolve(new Uint8Array([1]));
        }),
    );
    const s = store(project());
    const { handle } = start(s);
    const a = s.edit('a');
    await handle.flush(); // starts drawing 'a'
    const b = s.edit('b');
    await handle.flush(); // 'b' is saved while 'a' is still drawing
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.writeThumbnail.mock.calls.map((c) => c[2])).toEqual([a.updatedAt, b.updatedAt]);
  });

  it('swallows thumbnail errors and logs them once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.renderThumbnail.mockRejectedValue(new Error('no canvas'));
    const s = store(project());
    const { statuses } = start(s);
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800 + THUMBNAIL_DELAY_MS);
    s.edit('b');
    await vi.advanceTimersByTimeAsync(800 + THUMBNAIL_DELAY_MS);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(statuses).not.toContain('error');
    expect(h.writeThumbnail).not.toHaveBeenCalled();
  });

  it('flush brings a pending thumbnail up to date at once', async () => {
    const s = store(project());
    const { handle } = start(s);
    s.edit('closing');
    await handle.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.writeThumbnail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS * 2);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('runs one refresh at a time and skips versions already drawn', async () => {
    let finish!: () => void;
    h.renderThumbnail.mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = () => resolve(new Uint8Array([1]));
        }),
    );
    const s = store(project());
    const { handle } = start(s);
    s.edit('a');
    await handle.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    s.edit('b');
    await handle.flush(); // asks for another refresh while the first is drawing
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(h.renderThumbnail.mock.calls[1][0].name).toBe('b');
    await handle.flush();
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('flushThumbnail draws a scheduled refresh at once, and only when something was saved', async () => {
    const s = store(project());
    const { handle } = start(s);
    await handle.flushThumbnail();
    expect(h.renderThumbnail).not.toHaveBeenCalled();
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(h.renderThumbnail).not.toHaveBeenCalled();
    await handle.flushThumbnail();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.renderThumbnail.mock.calls[0][0].name).toBe('a');
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS * 2);
    await handle.flushThumbnail();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('flushThumbnail waits for a running render, then draws the last saved version, after stop too', async () => {
    let finish!: () => void;
    h.renderThumbnail.mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = () => resolve(new Uint8Array([1]));
        }),
    );
    const s = store(project());
    const { handle } = start(s);
    s.edit('a');
    await handle.flush(); // starts drawing 'a'
    s.edit('b');
    await handle.flush(); // 'b' is saved while 'a' is still drawing
    handle.stop();
    let done = false;
    const flushed = handle.flushThumbnail().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    finish();
    await flushed;
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(h.renderThumbnail.mock.calls[1][0].name).toBe('b');
    expect(h.writeThumbnail).toHaveBeenCalledTimes(2);
  });

  it('stop cancels a scheduled refresh', async () => {
    const s = store(project());
    const { handle } = start(s);
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800);
    handle.stop();
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS * 2);
    expect(h.renderThumbnail).not.toHaveBeenCalled();
  });
});

describe('leaving the page', () => {
  it('saves on the way out but starts no thumbnail, and draws it if the page stays', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const s = store(project());
    start(s);
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800); // saved; its thumbnail is due in 4 s
    s.edit('b');
    h.pageIsUnloading.mockReturnValue(true);
    target.dispatchEvent(new Event('beforeunload'));
    target.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(savedNames()).toEqual(['a', 'b']);
    expect(h.renderThumbnail).not.toHaveBeenCalled();

    // Back from the back-forward cache: the refresh that was due still happens.
    h.pageIsUnloading.mockReturnValue(false);
    target.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.renderThumbnail.mock.calls[0][0].name).toBe('b');
  });

  it('starts no thumbnail while the page unloads, even when one is asked for', async () => {
    const s = store(project());
    const { handle } = start(s);
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800);
    h.pageIsUnloading.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(THUMBNAIL_DELAY_MS);
    await handle.flushThumbnail();
    expect(h.renderThumbnail).not.toHaveBeenCalled();
    // The version was not drawn, so a page that stays draws it when asked next.
    h.pageIsUnloading.mockReturnValue(false);
    await handle.flushThumbnail();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a thumbnail cut short by unloading, and still reports a real failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onThumbnail = vi.fn();
    h.renderThumbnail.mockRejectedValueOnce(new PageUnloadingError({ cause: new DOMException('The I/O read operation failed.', 'NotReadableError') }));
    const s = store(project());
    const { handle, statuses } = start(s, { onThumbnail });
    s.edit('a');
    await vi.advanceTimersByTimeAsync(800 + THUMBNAIL_DELAY_MS);
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(onThumbnail).not.toHaveBeenCalled();
    // Still due: drawn on the next request.
    await handle.flushThumbnail();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(onThumbnail).toHaveBeenCalledTimes(1);

    h.renderThumbnail.mockRejectedValueOnce(new Error('no canvas'));
    s.edit('b');
    await vi.advanceTimersByTimeAsync(800 + THUMBNAIL_DELAY_MS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual(new Error('no canvas'));
    expect(statuses).not.toContain('error');
  });
});

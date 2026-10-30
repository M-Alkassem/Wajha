import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageLike } from '../engine/types';

const storage = vi.hoisted(() => ({
  readAsset: vi.fn<(projectId: string, assetId: string) => Promise<Uint8Array | null>>(),
}));
vi.mock('../storage', () => ({ readAsset: storage.readAsset }));

import { readImageSize } from '../platform/limits';
import { browserDecoder, createImageCache, getImageCache, waitForPreviews, type ImageDecoder } from './images';
import { ASSET_A, ASSET_B, ASSET_C, ASSET_D, fakeBitmap, flushPromises, type FakeBitmap } from './fixtures.node';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Bytes encode the preview size: [w, h] -> a w x h bitmap. */
const sized = (w: number, h: number) => new Uint8Array([w, h]);

function setup(opts: { budgetBytes?: number; maxConcurrentLoads?: number } = {}) {
  let time = 1000;
  const reads = new Map<string, Deferred<Uint8Array | null>>();
  const read = vi.fn((projectId: string, assetId: string) => {
    const d = deferred<Uint8Array | null>();
    reads.set(`${projectId}/${assetId}`, d);
    return d.promise;
  });
  const disposed: FakeBitmap[] = [];
  const decoder: ImageDecoder = {
    decodeFull: vi.fn(async (bytes: Uint8Array) => fakeBitmap(bytes[0] * 10, bytes[1] * 10, 'full')),
    decodePreview: vi.fn(async (bytes: Uint8Array, _mime: string, maxSide: number) => {
      if (bytes.length === 0) throw new Error('corrupt');
      return fakeBitmap(Math.min(bytes[0], maxSide), Math.min(bytes[1], maxSide), 'preview');
    }),
    dispose: vi.fn((img: ImageLike) => {
      (img as unknown as FakeBitmap).close();
      disposed.push(img as unknown as FakeBitmap);
    }),
  };
  const deferredNotifications: (() => void)[] = [];
  const onError = vi.fn();
  const cache = createImageCache({
    read,
    decoder,
    budgetBytes: opts.budgetBytes,
    maxConcurrentLoads: opts.maxConcurrentLoads ?? 8,
    maxPreviewSide: 1400,
    now: () => time,
    defer: (fn) => deferredNotifications.push(fn),
    onError,
  });
  const finish = async (projectId: string, assetId: string, bytes: Uint8Array | null) => {
    const d = reads.get(`${projectId}/${assetId}`);
    if (!d) throw new Error(`no read for ${assetId}`);
    d.resolve(bytes);
    await flushPromises();
  };
  const runNotifications = () => {
    for (const fn of deferredNotifications.splice(0)) fn();
  };
  return {
    cache,
    read,
    decoder,
    disposed,
    onError,
    finish,
    reads,
    deferredNotifications,
    runNotifications,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('image cache: loading', () => {
  it('returns null while loading, dedupes concurrent requests and serves the preview once ready', async () => {
    const t = setup();
    expect(t.cache.getPreview('p', ASSET_A)).toBeNull();
    expect(t.cache.getPreview('p', ASSET_A)).toBeNull();
    expect(t.cache.state('p', ASSET_A)).toBe('loading');
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.read).toHaveBeenCalledWith('p', ASSET_A);
    await t.finish('p', ASSET_A, sized(40, 80));
    const img = t.cache.getPreview('p', ASSET_A);
    expect(img).not.toBeNull();
    expect([img?.width, img?.height]).toEqual([40, 80]);
    expect(t.cache.state('p', ASSET_A)).toBe('ready');
    expect(t.cache.memoryBytes()).toBe(40 * 80 * 4);
    expect(t.decoder.decodePreview).toHaveBeenCalledWith(sized(40, 80), 'image/png', 1400);
  });

  it('passes the MIME type from the asset extension', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_B);
    t.cache.getPreview('p', ASSET_C);
    await flushPromises();
    await t.finish('p', ASSET_B, sized(1, 1));
    await t.finish('p', ASSET_C, sized(1, 1));
    expect(vi.mocked(t.decoder.decodePreview).mock.calls.map((c) => c[1])).toEqual(['image/jpeg', 'image/webp']);
  });

  it('keys previews by project', async () => {
    const t = setup();
    t.cache.getPreview('p1', ASSET_A);
    t.cache.getPreview('p2', ASSET_A);
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(2);
  });

  it('ignores empty ids', () => {
    const t = setup();
    expect(t.cache.getPreview('', ASSET_A)).toBeNull();
    expect(t.cache.getPreview('p', '')).toBeNull();
    expect(t.read).not.toHaveBeenCalled();
  });

  it('notifies subscribers once per batch of finished loads', async () => {
    const t = setup();
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = t.cache.subscribe(listener);
    t.cache.subscribe(other);
    t.cache.getPreview('p', ASSET_A);
    t.cache.getPreview('p', ASSET_B);
    await flushPromises();
    t.reads.get(`p/${ASSET_A}`)?.resolve(sized(2, 2));
    t.reads.get(`p/${ASSET_B}`)?.resolve(sized(3, 3));
    await flushPromises();
    expect(t.deferredNotifications).toHaveLength(1);
    t.runNotifications();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe(); // idempotent
    t.cache.getPreview('p', ASSET_C);
    await flushPromises();
    await t.finish('p', ASSET_C, sized(4, 4));
    t.runNotifications();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
  });

  it('keeps notifying the other subscribers when one throws', async () => {
    const t = setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    t.cache.subscribe(() => {
      throw new Error('bad listener');
    });
    t.cache.subscribe(good);
    t.cache.getPreview('p', ASSET_A);
    await flushPromises();
    await t.finish('p', ASSET_A, sized(1, 1));
    t.runNotifications();
    expect(good).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalled();
  });

  it('uses queueMicrotask for notifications by default', async () => {
    const read = vi.fn(async () => sized(5, 5));
    const cache = createImageCache({
      read,
      decoder: {
        decodeFull: async () => fakeBitmap(1, 1),
        decodePreview: async (b) => fakeBitmap(b[0], b[1]),
        dispose: () => {},
      },
    });
    const listener = vi.fn();
    cache.subscribe(listener);
    cache.getPreview('p', ASSET_A);
    await flushPromises(20);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('image cache: failures', () => {
  it('remembers a missing asset for 5 s, then retries', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    await flushPromises();
    await t.finish('p', ASSET_A, null);
    expect(t.cache.state('p', ASSET_A)).toBe('failed');
    expect(t.onError).toHaveBeenCalledTimes(1);
    expect(t.cache.getPreview('p', ASSET_A)).toBeNull();
    t.advance(4999);
    expect(t.cache.getPreview('p', ASSET_A)).toBeNull();
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(1);
    t.advance(1);
    expect(t.cache.state('p', ASSET_A)).toBe('idle');
    expect(t.cache.getPreview('p', ASSET_A)).toBeNull();
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(2);
    await t.finish('p', ASSET_A, sized(9, 9));
    expect(t.cache.getPreview('p', ASSET_A)?.width).toBe(9);
    expect(t.deferredNotifications).toHaveLength(1);
  });

  it('treats read and decode errors as failures without notifying', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    t.cache.getPreview('p', ASSET_B);
    await flushPromises();
    t.reads.get(`p/${ASSET_A}`)?.reject(new Error('disk on fire'));
    await t.finish('p', ASSET_B, new Uint8Array(0)); // decoder rejects empty data
    expect(t.cache.state('p', ASSET_A)).toBe('failed');
    expect(t.cache.state('p', ASSET_B)).toBe('failed');
    expect(t.onError).toHaveBeenCalledTimes(2);
    expect(t.deferredNotifications).toHaveLength(0);
  });

  it('treats an empty decode as a failure instead of caching it', async () => {
    const empty = fakeBitmap(0, 0);
    const disposed: ImageLike[] = [];
    let time = 0;
    const cache = createImageCache({
      read: async () => sized(1, 1),
      decoder: { decodeFull: async () => fakeBitmap(1, 1), decodePreview: async () => empty, dispose: (img) => disposed.push(img) },
      now: () => time,
      onError: () => {},
    });
    cache.getPreview('p', ASSET_A);
    await flushPromises();
    expect(cache.state('p', ASSET_A)).toBe('failed');
    expect(cache.memoryBytes()).toBe(0);
    expect(disposed).toEqual([empty]);
    time += 5000;
    expect(cache.state('p', ASSET_A)).toBe('idle');
  });

  it('warns once per asset by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let time = 0;
    const cache = createImageCache({
      read: async () => null,
      decoder: { decodeFull: async () => fakeBitmap(1, 1), decodePreview: async () => fakeBitmap(1, 1), dispose: () => {} },
      now: () => time,
    });
    cache.getPreview('p', ASSET_A);
    await flushPromises();
    time += 6000;
    cache.getPreview('p', ASSET_A);
    await flushPromises();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(ASSET_A);
  });
});

describe('image cache: memory', () => {
  it('evicts least recently used previews over budget and closes them', async () => {
    const t = setup({ budgetBytes: 1000 });
    for (const id of [ASSET_A, ASSET_B]) {
      t.cache.getPreview('p', id);
      await flushPromises();
      await t.finish('p', id, sized(10, 10)); // 400 bytes each
    }
    // touch A so that B becomes the least recently used
    expect(t.cache.getPreview('p', ASSET_A)).not.toBeNull();
    t.cache.getPreview('p', ASSET_C);
    await flushPromises();
    await t.finish('p', ASSET_C, sized(10, 10));
    expect(t.cache.memoryBytes()).toBe(800);
    expect(t.disposed.map((d) => d.closed)).toEqual([true]);
    expect(t.cache.state('p', ASSET_B)).toBe('idle');
    expect(t.cache.state('p', ASSET_A)).toBe('ready');
    expect(t.cache.state('p', ASSET_C)).toBe('ready');
    // asking again reloads it
    expect(t.cache.getPreview('p', ASSET_B)).toBeNull();
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(4);
  });

  it('defaults to a 192 MB budget', async () => {
    const read = vi.fn(async () => new Uint8Array([1]));
    const cache = createImageCache({
      read,
      decoder: {
        decodeFull: async () => fakeBitmap(1, 1),
        // 1400 x 1400 x 4 = 7 840 000 bytes each: 25 fit in 192 MiB, the 26th evicts one
        decodePreview: async () => fakeBitmap(1400, 1400),
        dispose: () => {},
      },
      maxConcurrentLoads: 64,
    });
    for (let i = 0; i < 26; i++) cache.getPreview('p', `${i.toString(16).padStart(64, '0')}.png`);
    await flushPromises(40);
    expect(cache.memoryBytes()).toBe(25 * 1400 * 1400 * 4);
    expect(cache.memoryBytes()).toBeLessThanOrEqual(192 * 1024 * 1024);
  });

  it('evictProject closes only that project and discards its in-flight loads', async () => {
    const t = setup();
    t.cache.getPreview('p1', ASSET_A);
    t.cache.getPreview('p2', ASSET_A);
    await flushPromises();
    await t.finish('p1', ASSET_A, sized(10, 10));
    await t.finish('p2', ASSET_A, sized(10, 10));
    t.cache.getPreview('p1', ASSET_B); // in flight during eviction
    t.cache.getPreview('p1', ASSET_C);
    await flushPromises();
    await t.finish('p1', ASSET_C, null); // failure memory is dropped too
    expect(t.cache.state('p1', ASSET_C)).toBe('failed');

    t.cache.evictProject('p1');
    expect(t.cache.memoryBytes()).toBe(400);
    expect(t.disposed).toHaveLength(1);
    expect(t.cache.state('p1', ASSET_A)).toBe('idle');
    expect(t.cache.state('p1', ASSET_C)).toBe('idle');
    expect(t.cache.state('p2', ASSET_A)).toBe('ready');

    await t.finish('p1', ASSET_B, sized(20, 20));
    expect(t.cache.state('p1', ASSET_B)).toBe('idle');
    // the superseded load stops before decoding
    expect(vi.mocked(t.decoder.decodePreview).mock.calls.map((c) => c[0][0])).not.toContain(20);
    expect(t.cache.memoryBytes()).toBe(400);
  });

  it('releases a preview whose project was evicted while it was decoding', async () => {
    const decoding = deferred<ImageLike>();
    const late = fakeBitmap(10, 10);
    const cache = createImageCache({
      read: async () => sized(10, 10),
      decoder: { decodeFull: async () => fakeBitmap(1, 1), decodePreview: () => decoding.promise, dispose: (img) => (img as unknown as FakeBitmap).close() },
    });
    cache.getPreview('p', ASSET_A);
    await flushPromises();
    cache.evictProject('p');
    decoding.resolve(late);
    await flushPromises();
    expect(late.closed).toBe(true);
    expect(cache.memoryBytes()).toBe(0);
    expect(cache.state('p', ASSET_A)).toBe('idle');
  });

  it('a request after evictProject starts a fresh load even while the old one runs', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    await flushPromises();
    const stale = t.reads.get(`p/${ASSET_A}`);
    t.cache.evictProject('p');
    t.cache.getPreview('p', ASSET_A);
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(2);
    stale?.resolve(sized(5, 5));
    await flushPromises();
    expect(t.cache.state('p', ASSET_A)).toBe('loading');
    await t.finish('p', ASSET_A, sized(6, 6));
    expect(t.cache.getPreview('p', ASSET_A)?.width).toBe(6);
  });

  it('clear() drops everything and ignores loads already running', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    t.cache.getPreview('q', ASSET_B);
    await flushPromises();
    await t.finish('p', ASSET_A, sized(4, 4));
    t.cache.clear();
    expect(t.cache.memoryBytes()).toBe(0);
    expect(t.disposed).toHaveLength(1);
    await t.finish('q', ASSET_B, sized(4, 4));
    expect(t.cache.state('q', ASSET_B)).toBe('idle');
    expect(t.cache.memoryBytes()).toBe(0);
    expect(t.decoder.decodePreview).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent loads and runs queued ones in order', async () => {
    const t = setup({ maxConcurrentLoads: 2 });
    for (const id of [ASSET_A, ASSET_B, ASSET_C, ASSET_D]) t.cache.getPreview('p', id);
    await flushPromises();
    expect(t.read.mock.calls.map((c) => c[1])).toEqual([ASSET_A, ASSET_B]);
    expect(t.cache.state('p', ASSET_D)).toBe('loading');
    await t.finish('p', ASSET_A, sized(1, 1));
    expect(t.read.mock.calls.map((c) => c[1])).toEqual([ASSET_A, ASSET_B, ASSET_C]);
    await t.finish('p', ASSET_B, null);
    expect(t.read).toHaveBeenCalledTimes(4);
  });

  it('skips queued loads of an evicted project', async () => {
    const t = setup({ maxConcurrentLoads: 1 });
    t.cache.getPreview('p', ASSET_A);
    t.cache.getPreview('p', ASSET_B);
    await flushPromises();
    t.cache.evictProject('p');
    await t.finish('p', ASSET_A, sized(1, 1));
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(1);
  });
});

describe('image cache: full-resolution images', () => {
  it('loadFull decodes every time without caching, and release closes it', async () => {
    const read = vi.fn(async () => sized(30, 60));
    const disposed: ImageLike[] = [];
    const cache = createImageCache({
      read,
      decoder: {
        decodeFull: async (b, mime) => Object.assign(fakeBitmap(b[0] * 100, b[1] * 100), { label: mime }),
        decodePreview: async (b) => fakeBitmap(b[0], b[1]),
        dispose: (img) => {
          disposed.push(img);
          (img as unknown as FakeBitmap).close();
        },
      },
    });
    const a = await cache.loadFull('p', ASSET_B);
    const b = await cache.loadFull('p', ASSET_B);
    expect(a).not.toBe(b);
    expect([a.width, a.height]).toEqual([3000, 6000]);
    expect((a as unknown as FakeBitmap).label).toBe('image/jpeg');
    expect(cache.memoryBytes()).toBe(0);
    cache.release(a);
    expect(disposed).toEqual([a]);
  });

  it('loadFull rejects for a missing asset', async () => {
    const cache = createImageCache({
      read: async () => null,
      decoder: { decodeFull: async () => fakeBitmap(1, 1), decodePreview: async () => fakeBitmap(1, 1), dispose: () => {} },
    });
    await expect(cache.loadFull('p', ASSET_A)).rejects.toThrow(/not found/);
  });

  it('release() never closes a preview that is still cached', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    await flushPromises();
    await t.finish('p', ASSET_A, sized(8, 8));
    const preview = t.cache.getPreview('p', ASSET_A);
    if (!preview) throw new Error('expected a preview');
    t.cache.release(preview);
    expect((preview as unknown as FakeBitmap).closed).toBe(false);
    expect(t.cache.getPreview('p', ASSET_A)).toBe(preview);
  });
});

describe('image cache: whenSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resolves once every preview is ready or failed', async () => {
    const t = setup();
    let done = false;
    const wait = t.cache.whenSettled('p', [ASSET_A, ASSET_B, ASSET_A], 1500).then(() => {
      done = true;
    });
    await flushPromises();
    expect(t.read).toHaveBeenCalledTimes(2);
    await t.finish('p', ASSET_A, sized(1, 1));
    expect(done).toBe(false);
    await t.finish('p', ASSET_B, null);
    await wait;
    expect(done).toBe(true);
  });

  it('gives up after the timeout', async () => {
    const t = setup();
    let done = false;
    void t.cache.whenSettled('p', [ASSET_A], 1500).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('resolves at once when everything is cached or recently failed', async () => {
    const t = setup();
    t.cache.getPreview('p', ASSET_A);
    t.cache.getPreview('p', ASSET_B);
    await flushPromises();
    await t.finish('p', ASSET_A, sized(1, 1));
    await t.finish('p', ASSET_B, null);
    await expect(t.cache.whenSettled('p', [ASSET_A, ASSET_B], 1500)).resolves.toBeUndefined();
    await expect(t.cache.whenSettled('p', [], 1500)).resolves.toBeUndefined();
  });
});

/** PNG signature + IHDR declaring the size; the stubbed createImageBitmap below reads the size back. */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function stubBitmapDecoder() {
  const decode = vi.fn(async (blob: Blob) => {
    const size = readImageSize(new Uint8Array(await blob.arrayBuffer()), 'png');
    return fakeBitmap(size?.width ?? 0, size?.height ?? 0);
  });
  vi.stubGlobal('createImageBitmap', decode);
  return decode;
}

describe('browser decoder', () => {
  it('refuses an asset whose header declares a huge canvas before decoding it', async () => {
    const decode = stubBitmapDecoder();
    const decoder = browserDecoder();
    // About 5 KB of PNG can declare 30000 x 30000 pixels: 3.6 GB once decoded.
    await expect(decoder.decodePreview(pngHeader(30000, 30000), 'image/png', 1400)).rejects.toThrow('larger than supported');
    await expect(decoder.decodeFull(pngHeader(30000, 30000), 'image/png')).rejects.toThrow('larger than supported');
    expect(decode).not.toHaveBeenCalled();
    const ok = await decoder.decodeFull(pngHeader(1290, 2796), 'image/png');
    expect([ok.width, ok.height]).toEqual([1290, 2796]);
  });
});

describe('shared cache', () => {
  it('is a singleton reading assets through storage', async () => {
    stubBitmapDecoder();
    storage.readAsset.mockResolvedValue(pngHeader(64, 32));
    const cache = getImageCache();
    expect(getImageCache()).toBe(cache);
    expect(cache.getPreview('shared', ASSET_A)).toBeNull();
    await waitForPreviews('shared', [ASSET_A], 1000);
    expect(storage.readAsset).toHaveBeenCalledWith('shared', ASSET_A);
    const img = cache.getPreview('shared', ASSET_A);
    expect([img?.width, img?.height]).toEqual([64, 32]);
    cache.evictProject('shared');
    expect(cache.memoryBytes()).toBe(0);
  });
});

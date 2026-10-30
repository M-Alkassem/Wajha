/**
 * Image cache: decodes project assets into memory-bounded preview images for
 * the editor, and full-resolution images on demand for export.
 *
 * Previews are downscaled to a longest side of 1400 px and kept in an LRU
 * with a 192 MB budget (width x height x 4), so twenty slides x three
 * languages of 1320 x 2868 screenshots stay far below the app's memory
 * target. Full-size decodes are never cached: the exporter loads them per
 * job and releases them right after rendering.
 */
import type { ImageLike } from '../engine/types';
import { readAsset } from '../storage';
import { decodeImage, disposeImage, mimeForName, shrinkImage } from './decode';
import { ByteLru } from './lru';
import { errorMessage, settleWithin } from './util';

export interface ImageCacheApi {
  /** Preview-quality image (longest side <= maxPreviewSide) or null while loading; starts loading on first call. */
  getPreview(projectId: string, assetId: string): ImageLike | null;
  /** Full-resolution decode for export. Caller must call `release` when done. */
  loadFull(projectId: string, assetId: string): Promise<ImageLike>;
  release(img: ImageLike): void;
  /** Called whenever a preview finishes loading. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Drops every cached image of a project (e.g. when closing it). */
  evictProject(projectId: string): void;
  /** Approximate bytes held by decoded previews. */
  memoryBytes(): number;
}

export const PREVIEW_MAX_SIDE = 1400;
export const PREVIEW_BUDGET_BYTES = 192 * 1024 * 1024;
/** A failed load is not retried before this many milliseconds. */
export const FAILURE_RETRY_MS = 5000;
/** Each concurrent preview load briefly holds a full-size decode, so keep few in flight. */
export const MAX_CONCURRENT_LOADS = 2;

export type PreviewState = 'idle' | 'loading' | 'ready' | 'failed';

/** Turns encoded bytes into images; injectable so the cache logic runs in Node tests. */
export interface ImageDecoder {
  decodeFull(bytes: Uint8Array, mime: string): Promise<ImageLike>;
  /** An image whose longest side is at most `maxSide` (may be the full decode when it is small enough). */
  decodePreview(bytes: Uint8Array, mime: string, maxSide: number): Promise<ImageLike>;
  dispose(img: ImageLike): void;
}

export interface ImageCacheOptions {
  /** Encoded asset bytes, or null when the asset does not exist. */
  read(projectId: string, assetId: string): Promise<Uint8Array | null>;
  decoder: ImageDecoder;
  budgetBytes?: number;
  maxPreviewSide?: number;
  failureRetryMs?: number;
  maxConcurrentLoads?: number;
  now?: () => number;
  /** Runs the batched subscriber notification; defaults to queueMicrotask. */
  defer?: (fn: () => void) => void;
  /** Reports load failures; defaults to one console.warn per asset. */
  onError?: (projectId: string, assetId: string, error: unknown) => void;
}

/** The cache with the extra hooks the renderer and tests use. */
export interface ImageCache extends ImageCacheApi {
  state(projectId: string, assetId: string): PreviewState;
  /** Starts loading the previews and resolves once each is ready or failed, or after `timeoutMs`. Never rejects. */
  whenSettled(projectId: string, assetIds: readonly string[], timeoutMs: number): Promise<void>;
  /** Drops every preview of every project. */
  clear(): void;
}

interface Entry {
  projectId: string;
  image: ImageLike;
}

/** Previews are only valid until the next await: the cache may close them when it evicts. */
export function createImageCache(options: ImageCacheOptions): ImageCache {
  const { decoder } = options;
  const maxSide = options.maxPreviewSide ?? PREVIEW_MAX_SIDE;
  const retryMs = options.failureRetryMs ?? FAILURE_RETRY_MS;
  const maxLoads = Math.max(1, Math.floor(options.maxConcurrentLoads ?? MAX_CONCURRENT_LOADS) || 1);
  const now = options.now ?? (() => Date.now());
  const defer = options.defer ?? ((fn: () => void) => queueMicrotask(fn));
  const warned = new Set<string>();
  const onError =
    options.onError ??
    ((projectId: string, assetId: string, error: unknown) => {
      const key = keyOf(projectId, assetId);
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[images] could not load ${assetId}: ${errorMessage(error)}`);
    });

  // Lets release() refuse to close a preview that is still cached.
  const cached = new WeakSet<object>();
  const lru = new ByteLru<Entry>(options.budgetBytes ?? PREVIEW_BUDGET_BYTES, (_key, entry) => {
    cached.delete(entry.image);
    decoder.dispose(entry.image);
  });
  const inflight = new Map<string, Promise<void>>();
  const failedUntil = new Map<string, number>();
  const listeners = new Set<() => void>();
  // Loads started before evictProject/clear must not repopulate the cache.
  const projectGen = new Map<string, number>();
  let epoch = 0;
  let notifyQueued = false;
  let active = 0;
  const queue: (() => void)[] = [];

  const genOf = (projectId: string) => `${epoch}:${projectGen.get(projectId) ?? 0}`;

  function notify(): void {
    if (notifyQueued) return;
    notifyQueued = true;
    defer(() => {
      notifyQueued = false;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (err) {
          console.error('[images] subscriber failed', err);
        }
      }
    });
  }

  function limited(task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const start = () => {
        active++;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            queue.shift()?.();
          });
      };
      if (active < maxLoads) start();
      else queue.push(start);
    });
  }

  function startLoad(projectId: string, assetId: string, key: string): void {
    const gen = genOf(projectId);
    const job = limited(async () => {
      if (genOf(projectId) !== gen) return;
      const bytes = await options.read(projectId, assetId);
      if (!bytes) throw new Error('asset not found');
      if (genOf(projectId) !== gen) return;
      const image = await decoder.decodePreview(bytes, mimeForName(assetId), maxSide);
      if (genOf(projectId) !== gen) {
        decoder.dispose(image);
        return;
      }
      // The engine ignores empty images, so caching one would leave it "loading" forever.
      if (!(image.width > 0 && image.height > 0)) {
        decoder.dispose(image);
        throw new Error('the decoded image is empty');
      }
      cached.add(image);
      lru.set(key, { projectId, image }, image.width * image.height * 4);
      failedUntil.delete(key);
      notify();
    })
      .catch((err: unknown) => {
        if (genOf(projectId) !== gen) return;
        failedUntil.set(key, now() + retryMs);
        onError(projectId, assetId, err);
      })
      .finally(() => {
        if (inflight.get(key) === job) inflight.delete(key);
      });
    inflight.set(key, job);
  }

  function getPreview(projectId: string, assetId: string): ImageLike | null {
    if (!projectId || !assetId) return null;
    const key = keyOf(projectId, assetId);
    const hit = lru.get(key);
    if (hit) return hit.image;
    if (inflight.has(key)) return null;
    const retryAt = failedUntil.get(key);
    if (retryAt !== undefined) {
      if (now() < retryAt) return null;
      failedUntil.delete(key);
    }
    startLoad(projectId, assetId, key);
    return null;
  }

  function state(projectId: string, assetId: string): PreviewState {
    const key = keyOf(projectId, assetId);
    if (lru.has(key)) return 'ready';
    if (inflight.has(key)) return 'loading';
    const retryAt = failedUntil.get(key);
    return retryAt !== undefined && now() < retryAt ? 'failed' : 'idle';
  }

  function dropKeys(map: Map<string, unknown>, prefix: string): void {
    for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key);
  }

  return {
    getPreview,
    state,

    async loadFull(projectId, assetId) {
      const bytes = await options.read(projectId, assetId);
      if (!bytes) throw new Error(`Image ${assetId} was not found`);
      return decoder.decodeFull(bytes, mimeForName(assetId));
    },

    release(img) {
      if (cached.has(img)) return;
      decoder.dispose(img);
    },

    subscribe(listener) {
      const wrapped = () => listener();
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },

    evictProject(projectId) {
      projectGen.set(projectId, (projectGen.get(projectId) ?? 0) + 1);
      lru.deleteWhere((_key, entry) => entry.projectId === projectId);
      const prefix = keyOf(projectId, '');
      dropKeys(failedUntil, prefix);
      // Superseded loads finish on their own and discard their result.
      dropKeys(inflight, prefix);
    },

    memoryBytes() {
      return lru.bytes;
    },

    async whenSettled(projectId, assetIds, timeoutMs) {
      const waits: Promise<void>[] = [];
      for (const assetId of new Set(assetIds)) {
        if (getPreview(projectId, assetId)) continue;
        const job = inflight.get(keyOf(projectId, assetId));
        if (job) waits.push(job);
      }
      if (waits.length > 0) await settleWithin(Promise.all(waits), timeoutMs);
    },

    clear() {
      epoch++;
      lru.clear();
      failedUntil.clear();
      inflight.clear();
    },
  };
}

// NUL never appears in ids (library paths reject it), so prefixes are unambiguous.
function keyOf(projectId: string, assetId: string): string {
  return `${projectId}\u0000${assetId}`;
}

/**
 * The webview decoder: createImageBitmap (or <img>), downscaled on a canvas
 * for previews. decodeImage refuses an asset over the image limits before
 * decoding it, whichever project, template or archive it came from.
 */
export function browserDecoder(): ImageDecoder {
  return {
    decodeFull: (bytes, mime) => decodeImage(bytes, mime),
    decodePreview: async (bytes, mime, maxSide) => shrinkImage(await decodeImage(bytes, mime), maxSide),
    dispose: disposeImage,
  };
}

let shared: ImageCache | null = null;

type AssetReader = (assetId: string) => Promise<Uint8Array | null>;
const assetReaders = new Map<string, AssetReader>();

function sharedCache(): ImageCache {
  shared ??= createImageCache({
    read: (projectId, assetId) => {
      const reader = assetReaders.get(projectId);
      return reader ? reader(assetId) : readAsset(projectId, assetId);
    },
    decoder: browserDecoder(),
  });
  return shared;
}

/**
 * Makes the shared cache read the images of `projectId` with `read` instead
 * of from the project's assets folder. For in-memory projects whose images
 * live elsewhere, such as template previews, which read the template's own
 * asset files. Returns a function that removes the route.
 */
export function setAssetReader(projectId: string, read: AssetReader): () => void {
  assetReaders.set(projectId, read);
  return () => {
    if (assetReaders.get(projectId) === read) assetReaders.delete(projectId);
  };
}

/** The app-wide image cache (created on first use). */
export function getImageCache(): ImageCacheApi {
  return sharedCache();
}

/**
 * Starts loading the given previews of the shared cache and resolves once
 * they are all ready or failed, or after `timeoutMs`. Never rejects.
 */
export function waitForPreviews(projectId: string, assetIds: readonly string[], timeoutMs: number): Promise<void> {
  return sharedCache().whenSettled(projectId, assetIds, timeoutMs);
}

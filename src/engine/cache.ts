/**
 * Small bounded caches for the renderer. The editor repaints on every drag
 * frame, so pattern tiles, glow bitmaps, blurred images, blob outlines and
 * parsed markup are kept between frames, but always under an entry and a
 * byte budget so a long session cannot grow memory without limit.
 */

const registry = new Set<{ clear(): void }>();

/** Least-recently-used map with an entry limit and an optional cost (bytes) limit. */
export class LruCache<K, V> {
  private readonly map = new Map<K, { value: V; cost: number }>();
  private readonly maxEntries: number;
  private readonly maxCost: number;
  private total = 0;

  constructor(maxEntries: number, maxCost = Number.POSITIVE_INFINITY) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.maxCost = maxCost;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Re-insert to mark as most recently used (Map keeps insertion order).
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Stores a value; items costlier than the whole budget are not cached at all. */
  set(key: K, value: V, cost = 0): void {
    const old = this.map.get(key);
    if (old) {
      this.total -= old.cost;
      this.map.delete(key);
    }
    const c = Number.isFinite(cost) && cost > 0 ? cost : 0;
    if (c > this.maxCost) return;
    this.map.set(key, { value, cost: c });
    this.total += c;
    while (this.map.size > this.maxEntries || this.total > this.maxCost) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const entry = this.map.get(oldest.value);
      this.map.delete(oldest.value);
      if (entry) this.total -= entry.cost;
    }
  }

  clear(): void {
    this.map.clear();
    this.total = 0;
  }

  get size(): number {
    return this.map.size;
  }

  /** Sum of the costs of the cached items. */
  get cost(): number {
    return this.total;
  }
}

/** A module-level cache that `clearEngineCaches` empties. */
export function engineCache<K, V>(maxEntries: number, maxCost?: number): LruCache<K, V> {
  const cache = new LruCache<K, V>(maxEntries, maxCost);
  registry.add(cache);
  return cache;
}

const ids = new WeakMap<object, number>();
let nextId = 1;

/**
 * Stable small number for an object, for cache keys that depend on an image
 * instance. Weakly held, so images can still be garbage collected.
 */
export function objectId(obj: object): number {
  let id = ids.get(obj);
  if (id === undefined) {
    id = nextId++;
    ids.set(obj, id);
  }
  return id;
}

/** Drops every engine cache (pattern tiles, glows, blurred images, outlines, markup). */
export function clearEngineCaches(): void {
  for (const cache of registry) cache.clear();
}

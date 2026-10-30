/**
 * Least-recently-used map with a byte budget. Pure bookkeeping (no DOM), so
 * the image cache's memory policy can be unit-tested on its own.
 */

interface Slot<V> {
  value: V;
  bytes: number;
}

export class ByteLru<V> {
  readonly budgetBytes: number;
  private readonly onEvict: ((key: string, value: V) => void) | undefined;
  // Map iteration follows insertion order, so re-inserting on access keeps
  // the least recently used entry first.
  private readonly slots = new Map<string, Slot<V>>();
  private total = 0;

  /** `onEvict` runs for every value that leaves the cache: evicted, replaced, deleted or cleared. */
  constructor(budgetBytes: number, onEvict?: (key: string, value: V) => void) {
    this.budgetBytes = Number.isFinite(budgetBytes) && budgetBytes > 0 ? budgetBytes : 0;
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.slots.size;
  }

  /** Sum of the byte sizes of every entry. */
  get bytes(): number {
    return this.total;
  }

  /** The value, marked as most recently used. */
  get(key: string): V | undefined {
    const slot = this.slots.get(key);
    if (!slot) return undefined;
    this.slots.delete(key);
    this.slots.set(key, slot);
    return slot.value;
  }

  /** The value without changing its position. */
  peek(key: string): V | undefined {
    return this.slots.get(key)?.value;
  }

  has(key: string): boolean {
    return this.slots.has(key);
  }

  /**
   * Inserts (or replaces) an entry as the most recently used, then evicts
   * from the least recently used end until the total fits the budget. The
   * new entry is never evicted by its own insertion, so a single value
   * larger than the budget is kept alone rather than dropped on arrival.
   */
  set(key: string, value: V, bytes: number): void {
    const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    const old = this.slots.get(key);
    if (old) {
      this.slots.delete(key);
      this.total -= old.bytes;
      if (old.value !== value) this.onEvict?.(key, old.value);
    }
    this.slots.set(key, { value, bytes: size });
    this.total += size;
    this.trim(key);
  }

  delete(key: string): boolean {
    const slot = this.slots.get(key);
    if (!slot) return false;
    this.slots.delete(key);
    this.total -= slot.bytes;
    this.onEvict?.(key, slot.value);
    return true;
  }

  /** Deletes every entry matching the predicate; returns how many were removed. */
  deleteWhere(predicate: (key: string, value: V) => boolean): number {
    const doomed: string[] = [];
    for (const [key, slot] of this.slots) if (predicate(key, slot.value)) doomed.push(key);
    for (const key of doomed) this.delete(key);
    return doomed.length;
  }

  clear(): void {
    const all = [...this.slots];
    this.slots.clear();
    this.total = 0;
    for (const [key, slot] of all) this.onEvict?.(key, slot.value);
  }

  /** Keys from least to most recently used. */
  keys(): string[] {
    return [...this.slots.keys()];
  }

  private trim(keep: string): void {
    if (this.total <= this.budgetBytes) return;
    // Deleting the entry being visited is safe during Map iteration.
    for (const [key, slot] of this.slots) {
      if (this.total <= this.budgetBytes) break;
      if (key === keep) continue;
      this.slots.delete(key);
      this.total -= slot.bytes;
      this.onEvict?.(key, slot.value);
    }
  }
}

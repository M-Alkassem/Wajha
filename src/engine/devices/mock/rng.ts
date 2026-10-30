/** Small seeded PRNG (mulberry32) so mock screens are identical on every run and platform. */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** Folds any number (fractions, negatives, NaN) into a well-mixed 32-bit seed. */
export function hashSeed(n: number): number {
  const v = Number.isFinite(n) ? n : 0;
  let h = Math.imul((Math.floor(v) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.round((v - Math.floor(v)) * 1e6);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
  let a = hashSeed(seed) || 0x6d2b79f5;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (items) => items[Math.min(items.length - 1, Math.floor(next() * items.length))],
    chance: (p) => next() < p,
  };
}

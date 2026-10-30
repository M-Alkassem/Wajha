import { describe, expect, it, vi } from 'vitest';
import { ByteLru } from './lru';

function lru(budget: number) {
  const evicted: string[] = [];
  const cache = new ByteLru<string>(budget, (key, value) => evicted.push(`${key}=${value}`));
  return { cache, evicted };
}

describe('ByteLru', () => {
  it('accounts bytes for inserts, replacements and deletes', () => {
    const { cache, evicted } = lru(1000);
    cache.set('a', 'A', 100);
    cache.set('b', 'B', 250);
    expect(cache.bytes).toBe(350);
    expect(cache.size).toBe(2);
    cache.set('a', 'A2', 300); // replacement frees the old value
    expect(cache.bytes).toBe(550);
    expect(evicted).toEqual(['a=A']);
    expect(cache.delete('b')).toBe(true);
    expect(cache.delete('b')).toBe(false);
    expect(cache.bytes).toBe(300);
    expect(evicted).toEqual(['a=A', 'b=B']);
  });

  it('does not report a replacement with the same value as an eviction', () => {
    const { cache, evicted } = lru(1000);
    cache.set('a', 'A', 100);
    cache.set('a', 'A', 200);
    expect(evicted).toEqual([]);
    expect(cache.bytes).toBe(200);
  });

  it('evicts least recently used entries first when over budget', () => {
    const { cache, evicted } = lru(300);
    cache.set('a', 'A', 100);
    cache.set('b', 'B', 100);
    cache.set('c', 'C', 100);
    cache.set('d', 'D', 100);
    expect(evicted).toEqual(['a=A']);
    expect(cache.keys()).toEqual(['b', 'c', 'd']);
    expect(cache.bytes).toBe(300);
  });

  it('get() touches an entry, peek() and has() do not', () => {
    const { cache, evicted } = lru(300);
    cache.set('a', 'A', 100);
    cache.set('b', 'B', 100);
    cache.set('c', 'C', 100);
    expect(cache.get('a')).toBe('A');
    expect(cache.peek('b')).toBe('B');
    expect(cache.has('b')).toBe(true);
    cache.set('d', 'D', 100);
    expect(evicted).toEqual(['b=B']);
    expect(cache.keys()).toEqual(['c', 'a', 'd']);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts as many entries as needed for a big insert', () => {
    const { cache, evicted } = lru(300);
    cache.set('a', 'A', 100);
    cache.set('b', 'B', 100);
    cache.set('c', 'C', 100);
    cache.set('big', 'X', 250);
    expect(evicted).toEqual(['a=A', 'b=B', 'c=C']);
    expect(cache.keys()).toEqual(['big']);
  });

  it('keeps a single entry larger than the whole budget', () => {
    const { cache, evicted } = lru(100);
    cache.set('a', 'A', 50);
    cache.set('huge', 'H', 500);
    expect(cache.keys()).toEqual(['huge']);
    expect(evicted).toEqual(['a=A']);
    cache.set('b', 'B', 10);
    // the next insert pushes the oversized entry out
    expect(cache.keys()).toEqual(['b']);
  });

  it('treats invalid byte sizes and budgets as zero', () => {
    const { cache } = lru(Number.NaN);
    expect(cache.budgetBytes).toBe(0);
    const ok = new ByteLru<number>(100);
    ok.set('nan', 1, Number.NaN);
    ok.set('neg', 2, -50);
    ok.set('inf', 3, Number.POSITIVE_INFINITY);
    expect(ok.bytes).toBe(0);
    expect(ok.size).toBe(3);
  });

  it('deleteWhere and clear report every removed value', () => {
    const { cache, evicted } = lru(1000);
    cache.set('p1/a', 'A', 10);
    cache.set('p2/b', 'B', 20);
    cache.set('p1/c', 'C', 30);
    expect(cache.deleteWhere((key) => key.startsWith('p1/'))).toBe(2);
    expect(cache.keys()).toEqual(['p2/b']);
    expect(cache.bytes).toBe(20);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
    expect(evicted).toEqual(['p1/a=A', 'p1/c=C', 'p2/b=B']);
  });

  it('works without an eviction callback', () => {
    const cache = new ByteLru<number>(10);
    cache.set('a', 1, 8);
    cache.set('b', 2, 8);
    expect(cache.keys()).toEqual(['b']);
  });

  it('keeps consistent state when the callback throws', () => {
    const onEvict = vi.fn(() => {
      throw new Error('boom');
    });
    const cache = new ByteLru<number>(10, onEvict);
    cache.set('a', 1, 8);
    expect(() => cache.set('b', 2, 8)).toThrow('boom');
    expect(cache.keys()).toEqual(['b']);
    expect(cache.bytes).toBe(8);
  });
});

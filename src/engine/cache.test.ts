import { describe, expect, it } from 'vitest';
import { clearEngineCaches, engineCache, LruCache, objectId } from './cache';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // a is now the most recent
    c.set('c', 3);
    expect(c.has('b')).toBe(false);
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('respects a cost budget and skips items larger than it', () => {
    const c = new LruCache<string, string>(100, 10);
    c.set('a', 'x', 4);
    c.set('b', 'y', 4);
    c.set('c', 'z', 4);
    expect(c.has('a')).toBe(false);
    expect(c.cost).toBe(8);
    c.set('huge', 'w', 11);
    expect(c.has('huge')).toBe(false);
    expect(c.size).toBe(2);
  });

  it('replaces values and their cost', () => {
    const c = new LruCache<string, number>(10, 10);
    c.set('a', 1, 6);
    c.set('a', 2, 3);
    expect(c.get('a')).toBe(2);
    expect(c.cost).toBe(3);
    c.set('b', 3, NaN);
    expect(c.cost).toBe(3);
  });

  it('clears registered engine caches', () => {
    const c = engineCache<string, number>(4);
    c.set('k', 1);
    clearEngineCaches();
    expect(c.size).toBe(0);
  });
});

describe('objectId', () => {
  it('is stable per object and distinct between objects', () => {
    const a = {};
    const b = {};
    expect(objectId(a)).toBe(objectId(a));
    expect(objectId(a)).not.toBe(objectId(b));
  });
});

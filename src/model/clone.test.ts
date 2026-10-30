import { freeze } from 'immer';
import { describe, expect, it } from 'vitest';
import { deepClone, jsonEqual } from './clone';

describe('deepClone', () => {
  it('copies nested data so edits never reach the original', () => {
    const src = { a: [1, { b: 2 }], c: { d: 'x' }, e: null };
    const copy = deepClone(src);
    expect(copy).toEqual(src);
    (copy.a[1] as { b: number }).b = 9;
    copy.c.d = 'y';
    expect(src).toEqual({ a: [1, { b: 2 }], c: { d: 'x' }, e: null });
  });

  it('turns frozen (immer) data into editable data', () => {
    const frozen = freeze({ list: [{ x: 1 }] }, true);
    const copy = deepClone(frozen);
    expect(Object.isFrozen(copy)).toBe(false);
    copy.list[0].x = 2;
    expect(frozen.list[0].x).toBe(1);
  });

  it('never copies prototype keys', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1, "constructor": {"x": 1}}') as Record<string, unknown>;
    const copy = deepClone(hostile);
    expect(Object.keys(copy)).toEqual(['ok']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  });

  it('passes primitives through', () => {
    expect(deepClone(5)).toBe(5);
    expect(deepClone('s')).toBe('s');
    expect(deepClone(null)).toBeNull();
  });
});

describe('jsonEqual', () => {
  it('compares structure, not identity', () => {
    expect(jsonEqual({ a: [1, 2], b: { c: 'x' } }, { b: { c: 'x' }, a: [1, 2] })).toBe(true);
    expect(jsonEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual(1, '1')).toBe(false);
  });

  it('treats undefined keys as absent, like JSON', () => {
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('treats NaN as equal to NaN', () => {
    expect(jsonEqual({ x: NaN }, { x: NaN })).toBe(true);
  });
});

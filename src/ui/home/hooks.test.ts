import { describe, expect, it } from 'vitest';
import { isTruncated } from './hooks';

const box = (scrollWidth: number, clientWidth: number) => ({ scrollWidth, clientWidth }) as unknown as Element;

describe('isTruncated', () => {
  it('is true only while the text is wider than its box', () => {
    expect(isTruncated(box(240, 180))).toBe(true);
    expect(isTruncated(box(180, 180))).toBe(false);
    expect(isTruncated(box(120, 180))).toBe(false);
  });

  it('is false without an element (the name is being renamed)', () => {
    expect(isTruncated(null)).toBe(false);
  });
});

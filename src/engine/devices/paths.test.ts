import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../types';
import { pixel, testCanvas } from '../testing/canvas.node';
import { insetSmoothRect, pillPath, roundRectPath, smoothRectPath } from './paths';

function fillShape(w: number, h: number, add: (ctx: Ctx2D) => void) {
  const { ctx } = testCanvas(w, h);
  ctx.beginPath();
  add(ctx);
  ctx.fillStyle = '#000';
  ctx.fill();
  return ctx;
}

function alphaSum(ctx: Ctx2D, w: number, h: number): number {
  const d = ctx.getImageData(0, 0, w, h).data;
  let s = 0;
  for (let i = 3; i < d.length; i += 4) s += d[i];
  return s;
}

describe('roundRectPath', () => {
  it('fills the box with rounded, transparent corners', () => {
    const ctx = fillShape(120, 80, (c) => roundRectPath(c, 10, 10, 100, 60, 20));
    expect(pixel(ctx, 60, 40)[3]).toBe(255);
    expect(pixel(ctx, 11, 11)[3]).toBe(0);
    expect(pixel(ctx, 108, 68)[3]).toBe(0);
    expect(pixel(ctx, 11, 40)[3]).toBe(255);
  });

  it('clamps huge radii to a pill and supports per-corner radii', () => {
    const pill = fillShape(120, 60, (c) => roundRectPath(c, 0, 10, 120, 40, 999));
    expect(pixel(pill, 1, 30)[3]).toBeGreaterThan(100);
    expect(pixel(pill, 60, 11)[3]).toBe(255);
    expect(pixel(pill, 2, 12)[3]).toBe(0);
    const tab = fillShape(100, 100, (c) => roundRectPath(c, 0, 0, 100, 100, [40, 40, 0, 0]));
    expect(pixel(tab, 1, 1)[3]).toBe(0);
    expect(pixel(tab, 1, 98)[3]).toBe(255);
  });

  it('adds nothing for empty or invalid boxes', () => {
    for (const box of [
      [0, 0, 0, 10],
      [0, 0, 10, -1],
      [NaN, 0, 10, 10],
      [0, 0, Infinity, 10],
    ]) {
      const ctx = fillShape(20, 20, (c) => roundRectPath(c, box[0], box[1], box[2], box[3], 4));
      expect(alphaSum(ctx, 20, 20)).toBe(0);
    }
    const neg = fillShape(20, 20, (c) => roundRectPath(c, 2, 2, 16, 16, [-5, NaN, Infinity, 3]));
    expect(pixel(neg, 3, 3)[3]).toBe(255);
  });
});

describe('smoothRectPath', () => {
  it('stays inside its box and covers its centre', () => {
    for (const smoothing of [0, 0.3, 0.6, 1]) {
      const ctx = fillShape(140, 260, (c) => smoothRectPath(c, 20, 20, 100, 220, 30, smoothing));
      const d = ctx.getImageData(0, 0, 140, 260).data;
      for (let y = 0; y < 260; y++) {
        for (let x = 0; x < 140; x++) {
          if (x >= 19 && x <= 120 && y >= 19 && y <= 240) continue;
          expect(d[(y * 140 + x) * 4 + 3]).toBe(0);
        }
      }
      expect(pixel(ctx, 70, 130)[3]).toBe(255);
      expect(pixel(ctx, 21, 130)[3]).toBe(255);
    }
  });

  it('is softer than a circular corner of the same radius, and equal at smoothing 0', () => {
    const round = fillShape(100, 100, (c) => roundRectPath(c, 0, 0, 100, 100, 30));
    const zero = fillShape(100, 100, (c) => smoothRectPath(c, 0, 0, 100, 100, 30, 0));
    const smooth = fillShape(100, 100, (c) => smoothRectPath(c, 0, 0, 100, 100, 30, 0.6));
    expect(alphaSum(zero, 100, 100)).toBe(alphaSum(round, 100, 100));
    expect(alphaSum(smooth, 100, 100)).toBeLessThan(alphaSum(round, 100, 100));
    // Edges stay straight in the middle.
    expect(pixel(smooth, 50, 0)[3]).toBe(255);
    expect(pixel(smooth, 0, 50)[3]).toBe(255);
  });

  it('reduces smoothing on small shapes instead of overflowing', () => {
    const ctx = fillShape(40, 40, (c) => smoothRectPath(c, 5, 5, 30, 30, 14, 1));
    expect(pixel(ctx, 20, 20)[3]).toBe(255);
    expect(pixel(ctx, 4, 20)[3]).toBe(0);
    expect(pixel(ctx, 20, 36)[3]).toBe(0);
    const tiny = fillShape(4, 4, (c) => smoothRectPath(c, 0, 0, 1.5, 1.5, 9, 0.6));
    expect(alphaSum(tiny, 4, 4)).toBeGreaterThan(0);
  });

  it('insets concentrically and handles degenerate input', () => {
    const ctx = fillShape(100, 200, (c) => insetSmoothRect(c, 100, 200, 30, 0.4, 10));
    expect(pixel(ctx, 5, 100)[3]).toBe(0);
    expect(pixel(ctx, 12, 100)[3]).toBe(255);
    const none = fillShape(20, 20, (c) => insetSmoothRect(c, 20, 20, 5, 0.4, 15));
    expect(alphaSum(none, 20, 20)).toBe(0);
    const nan = fillShape(20, 20, (c) => smoothRectPath(c, 0, 0, 20, 20, NaN, NaN));
    expect(pixel(nan, 1, 1)[3]).toBe(255);
  });
});

describe('pillPath', () => {
  it('draws a closed pill that can share a path with other shapes', () => {
    const ctx = fillShape(100, 50, (c) => {
      pillPath(c, 0, 0, 60, 20);
      pillPath(c, 70, 20, 20, 20);
      pillPath(c, 0, 0, 0, 10);
    });
    expect(pixel(ctx, 30, 10)[3]).toBe(255);
    expect(pixel(ctx, 80, 30)[3]).toBe(255);
    expect(pixel(ctx, 65, 30)[3]).toBe(0);
    expect(pixel(ctx, 1, 1)[3]).toBe(0);
  });
});

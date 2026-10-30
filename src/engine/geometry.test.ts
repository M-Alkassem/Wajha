import { describe, expect, it } from 'vitest';
import { clamp, hash2, intersect, linearGradientLine, mulberry32, num, roundedRect, seedInt, transformScale } from './geometry';
import { pixel, testCanvas } from './testing/canvas.node';
import type { Ctx2D } from './types';

describe('numbers', () => {
  it('clamps and sanitises', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(num(NaN, 3)).toBe(3);
    expect(num(Infinity, 3)).toBe(3);
    expect(num('4', 3)).toBe(3);
    expect(num(undefined, 3)).toBe(3);
    expect(num(-2, 3)).toBe(-2);
  });

  it('intersects rectangles', () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBeNull();
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 3, w: 1, h: 1 })).toEqual({ x: 2, y: 3, w: 1, h: 1 });
  });

  it('builds integer seeds from anything', () => {
    expect(seedInt(3.7)).toBe(3);
    expect(seedInt(-3.2)).toBe(-4);
    expect(seedInt(NaN)).toBe(0);
    expect(seedInt(Infinity)).toBe(0);
    expect(Number.isInteger(seedInt(1e20))).toBe(true);
  });
});

describe('random', () => {
  it('mulberry32 is deterministic and uniform enough', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });

  it('hash2 is stable and spread over [0, 1)', () => {
    expect(hash2(3, 4)).toBe(hash2(3, 4));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const v = hash2(i, i * 7, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      values.add(Math.floor(v * 10));
    }
    expect(values.size).toBe(10);
  });
});

describe('linearGradientLine (CSS semantics)', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 };
  it('0deg runs bottom to top', () => {
    const l = linearGradientLine(0, box);
    expect(l.x0).toBeCloseTo(100);
    expect(l.y0).toBeCloseTo(100);
    expect(l.x1).toBeCloseTo(100);
    expect(l.y1).toBeCloseTo(0);
  });
  it('90deg runs left to right', () => {
    const l = linearGradientLine(90, box);
    expect(l.x0).toBeCloseTo(0);
    expect(l.x1).toBeCloseTo(200);
    expect(l.y0).toBeCloseTo(50);
    expect(l.y1).toBeCloseTo(50);
  });
  it('180deg runs top to bottom', () => {
    const l = linearGradientLine(180, box);
    expect(l.y0).toBeCloseTo(0);
    expect(l.y1).toBeCloseTo(100);
  });
  it('has length |w sin a| + |h cos a| so corners get the end colours', () => {
    const l = linearGradientLine(45, box);
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    expect(len).toBeCloseTo(200 * Math.SQRT1_2 + 100 * Math.SQRT1_2);
    // The bottom-left corner projects exactly onto the start of the line.
    const dx = (l.x1 - l.x0) / len;
    const dy = (l.y1 - l.y0) / len;
    expect((0 - l.x0) * dx + (100 - l.y0) * dy).toBeCloseTo(0);
    expect((200 - l.x0) * dx + (0 - l.y0) * dy).toBeCloseTo(len);
  });
  it('falls back to 180deg for NaN angles', () => {
    expect(linearGradientLine(NaN, box)).toEqual(linearGradientLine(180, box));
  });
});

describe('roundedRect', () => {
  it('matches the native roundRect with the arc fallback', () => {
    const a = testCanvas(60, 60);
    a.ctx.fillStyle = '#000';
    a.ctx.beginPath();
    roundedRect(a.ctx, 5, 5, 50, 50, 20);
    a.ctx.fill();

    const b = testCanvas(60, 60);
    // Native contexts reject a Proxy as `this`, so every access is forwarded to the target.
    const noRound = new Proxy(b.ctx, {
      get(target, prop) {
        if (prop === 'roundRect') return undefined;
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value, target);
      },
    }) as Ctx2D;
    noRound.fillStyle = '#000';
    noRound.beginPath();
    roundedRect(noRound, 5, 5, 50, 50, 20);
    noRound.fill();

    for (const [x, y] of [
      [6, 6],
      [30, 30],
      [11, 11],
      [54, 30],
      [8, 50],
    ]) {
      expect(Math.abs(pixel(a.ctx, x, y)[3] - pixel(b.ctx, x, y)[3])).toBeLessThan(40);
    }
    expect(pixel(a.ctx, 6, 6)[3]).toBe(0);
    expect(pixel(a.ctx, 30, 30)[3]).toBe(255);
  });

  it('clamps the radius and ignores empty or negative sizes', () => {
    const { ctx } = testCanvas(40, 40);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    roundedRect(ctx, 0, 0, 40, 20, 1000);
    ctx.fill();
    // Radius 1000 is clamped to 10 (half the height): a pill.
    expect(pixel(ctx, 20, 10)[3]).toBe(255);
    expect(pixel(ctx, 1, 1)[3]).toBe(0);
    const other = testCanvas(20, 20).ctx;
    other.beginPath();
    expect(() => roundedRect(other, 0, 0, -5, 20, 4)).not.toThrow();
    expect(() => roundedRect(other, 0, 0, 10, 10, -4)).not.toThrow();
    expect(() => roundedRect(other, 0, 0, 10, 10, NaN)).not.toThrow();
    expect(() => roundedRect(other, 0, 0, NaN, 10, 2)).not.toThrow();
  });
});

describe('transformScale', () => {
  it('reads the uniform scale of the current transform', () => {
    const { ctx } = testCanvas(10, 10);
    expect(transformScale(ctx)).toBeCloseTo(1);
    ctx.scale(2, 2);
    ctx.rotate(0.7);
    expect(transformScale(ctx)).toBeCloseTo(2);
  });
});

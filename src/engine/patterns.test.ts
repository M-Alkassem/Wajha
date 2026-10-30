import { describe, expect, it } from 'vitest';
import type { Pattern } from '../model/types';
import { paintPattern, patternSpacing } from './patterns';
import { nodeEnv, pixel, testCanvas } from './testing/canvas.node';
import type { Ctx2D } from './types';

const W = 200;
const H = 160;
const U = Math.min(W, H);
const full = { x: 0, y: 0, w: W, h: H };

function painted(p: Pattern, w = W, h = H): Ctx2D {
  const { ctx } = testCanvas(w, h);
  paintPattern(ctx, p, { x: 0, y: 0, w, h }, { x: 0, y: 0, w, h }, U, nodeEnv);
  return ctx;
}

const alpha = (ctx: Ctx2D, x: number, y: number) => pixel(ctx, x, y)[3];
const coverage = (ctx: Ctx2D, w = W, h = H) => {
  const d = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n / (w * h);
};

const pattern = (kind: Pattern['kind'], extra: Partial<Pattern> = {}): Pattern => ({ kind, color: '#000000', opacity: 1, scale: 0.125, ...extra });

describe('patterns', () => {
  it('computes spacing from scale x u with sane limits', () => {
    expect(patternSpacing(pattern('dots'), 160)).toBe(20);
    expect(patternSpacing(pattern('dots', { scale: 0.0001 }), 160)).toBe(2);
    expect(patternSpacing(pattern('dots', { scale: 50 }), 160)).toBe(320);
  });

  it('dots: one dot centred in every spacing cell', () => {
    const ctx = painted(pattern('dots'));
    expect(alpha(ctx, 10, 10)).toBe(255);
    expect(alpha(ctx, 30, 50)).toBe(255);
    expect(alpha(ctx, 0, 0)).toBe(0);
    expect(alpha(ctx, 20, 20)).toBe(0);
  });

  it('grid: hairlines every spacing, through the middle of each cell', () => {
    const ctx = painted(pattern('grid'));
    expect(alpha(ctx, 10, 3)).toBeGreaterThan(200);
    expect(alpha(ctx, 30, 47)).toBeGreaterThan(200);
    expect(alpha(ctx, 3, 50)).toBeGreaterThan(200);
    expect(alpha(ctx, 0, 0)).toBe(0);
    expect(alpha(ctx, 5, 5)).toBe(0);
  });

  it('grid: translucent lines are not doubled at crossings', () => {
    const ctx = painted(pattern('grid', { color: '#00000080' }));
    expect(Math.abs(alpha(ctx, 10, 10) - alpha(ctx, 10, 3))).toBeLessThanOrEqual(2);
  });

  it('diagonal: 45deg lines with gaps between them', () => {
    const ctx = painted(pattern('diagonal'));
    const c = coverage(ctx);
    expect(c).toBeGreaterThan(0.05);
    expect(c).toBeLessThan(0.5);
    // Constant along the "/" direction: (x, y) and (x + 1, y - 1) match.
    let same = 0;
    for (let i = 0; i < 40; i++) if (Math.abs(alpha(ctx, 40 + i, 100 - i) - alpha(ctx, 41 + i, 99 - i)) < 40) same++;
    expect(same).toBeGreaterThan(36);
  });

  it('waves: one sine line per row', () => {
    const ctx = painted(pattern('waves'));
    for (let row = 0; row < 3; row++) {
      let hits = 0;
      for (let y = row * 20; y < (row + 1) * 20; y++) if (alpha(ctx, 15, y) > 100) hits++;
      expect(hits).toBeGreaterThan(0);
      expect(hits).toBeLessThan(8);
    }
  });

  it('noise: deterministic grain with varying alpha', () => {
    const a = painted(pattern('noise'));
    const b = painted(pattern('noise'));
    expect(a.getImageData(0, 0, W, H).data).toEqual(b.getImageData(0, 0, W, H).data);
    const values = new Set<number>();
    for (let x = 0; x < 50; x++) values.add(alpha(a, x, 3));
    expect(values.size).toBeGreaterThan(20);
  });

  it('rings: concentric circles around the box centre', () => {
    const ctx = painted(pattern('rings'));
    // 1px antialiased strokes on radius 20 and 40: they straddle two pixel columns/rows.
    expect(alpha(ctx, 119, 80) + alpha(ctx, 120, 80)).toBeGreaterThan(200);
    expect(alpha(ctx, 100, 39) + alpha(ctx, 100, 40)).toBeGreaterThan(200);
    expect(alpha(ctx, 100 + 10, 80)).toBe(0);
  });

  it('applies colour and opacity', () => {
    const ctx = painted(pattern('dots', { color: '#ff0000', opacity: 0.5 }));
    const p = pixel(ctx, 10, 10);
    expect(p[0]).toBe(255);
    expect(p[3]).toBeGreaterThan(120);
    expect(p[3]).toBeLessThan(135);
  });

  it('paints nothing for invalid patterns', () => {
    for (const p of [pattern('dots', { opacity: 0 }), pattern('dots', { scale: 0 }), pattern('dots', { scale: NaN }), { ...pattern('dots'), kind: 'plaid' } as unknown as Pattern]) {
      expect(coverage(painted(p))).toBe(0);
    }
    const { ctx } = testCanvas(10, 10);
    expect(() => paintPattern(ctx, null, full, full, U, nodeEnv)).not.toThrow();
  });

  it('keeps tiles small for extreme spacings', () => {
    const { ctx } = testCanvas(300, 300);
    const huge = pattern('waves', { scale: 2 }); // spacing 2u -> a 1800 x 600 period at u = 300
    const area = { x: 0, y: 0, w: 300, h: 300 };
    const t0 = performance.now();
    paintPattern(ctx, huge, area, area, 300, nodeEnv);
    paintPattern(ctx, pattern('dots', { scale: 2 }), area, area, 4000, nodeEnv); // 8000px period, capped
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('renders tiles at device resolution under a scaled context', () => {
    const scaled = testCanvas(400, 320).ctx;
    scaled.scale(2, 2);
    paintPattern(scaled, pattern('dots'), { x: 0, y: 0, w: 200, h: 160 }, { x: 0, y: 0, w: 200, h: 160 }, 160, nodeEnv, 2);
    const native = testCanvas(400, 320).ctx;
    paintPattern(native, pattern('dots'), { x: 0, y: 0, w: 400, h: 320 }, { x: 0, y: 0, w: 400, h: 320 }, 320, nodeEnv, 1);
    let diff = 0;
    for (let y = 0; y < 80; y += 3) for (let x = 0; x < 80; x += 3) diff = Math.max(diff, Math.abs(alpha(scaled, x, y) - alpha(native, x, y)));
    expect(diff).toBeLessThanOrEqual(8);
  });

  it('continues seamlessly across panorama slides', () => {
    for (const kind of ['dots', 'grid', 'diagonal', 'noise', 'waves', 'rings'] as const) {
      const p = pattern(kind, { scale: 0.13 });
      const strip = { x: 0, y: 0, w: 2 * W, h: H };
      const whole = testCanvas(2 * W, H).ctx;
      paintPattern(whole, p, strip, strip, U, nodeEnv);
      const second = testCanvas(W, H).ctx;
      second.translate(-W, 0);
      paintPattern(second, p, strip, { x: W, y: 0, w: W, h: H }, U, nodeEnv);
      second.setTransform(1, 0, 0, 1, 0, 0);
      let diff = 0;
      for (const y of [5, 40, 77, 120]) {
        for (const x of [0, 1, 13, 50, 199]) diff = Math.max(diff, Math.abs(alpha(second, x, y) - alpha(whole, x + W, y)));
      }
      expect(diff, kind).toBeLessThanOrEqual(2);
    }
  });
});

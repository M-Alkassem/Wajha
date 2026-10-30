import { describe, expect, it } from 'vitest';
import type { FamilyId } from '../model/types';
import type { Ctx2D } from './types';
import { pixel, registerBundledFonts, testCanvas } from './testing/canvas.node';
import { drawMockScreen, mockArchetype, mockLayoutMode, MOCK_ARCHETYPES, paintMockScreen } from './mock';

registerBundledFonts();

const PALETTE = ['#6c5ce7', '#ff7a59', '#00b894'];

function render(w: number, h: number, seed: number, opts: { dark?: boolean; family?: FamilyId; palette?: string[]; chrome?: 'device' | 'web' } = {}) {
  const { canvas, ctx } = testCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  paintMockScreen(ctx, w, h, { seed, palette: opts.palette ?? PALETTE, dark: opts.dark ?? false, family: opts.family, chrome: opts.chrome });
  return { canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

function same(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function meanLuma(data: Uint8ClampedArray): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return s / n;
}

describe('mock screen selection', () => {
  it('has at least eight distinct app archetypes', () => {
    expect(new Set(MOCK_ARCHETYPES).size).toBe(MOCK_ARCHETYPES.length);
    expect(MOCK_ARCHETYPES.length).toBeGreaterThanOrEqual(8);
  });

  it('gives consecutive seeds different apps and wraps around', () => {
    const n = MOCK_ARCHETYPES.length;
    const ids = Array.from({ length: n }, (_, i) => mockArchetype(i));
    expect(new Set(ids).size).toBe(n);
    expect(mockArchetype(n)).toBe(mockArchetype(0));
    expect(mockArchetype(-1)).toBe(mockArchetype(n - 1));
    expect(mockArchetype(NaN)).toBe(mockArchetype(0));
    expect(mockArchetype(Infinity)).toBe(mockArchetype(0));
    expect(mockArchetype(2.7)).toBe(mockArchetype(2));
    expect(MOCK_ARCHETYPES).toContain(mockArchetype(1e12 + 3));
  });

  it('picks phone, tablet or desktop layouts from family and shape', () => {
    expect(mockLayoutMode(390, 844, 'iphone')).toBe('phone');
    expect(mockLayoutMode(412, 915, 'android-phone')).toBe('phone');
    expect(mockLayoutMode(820, 1180, 'ipad')).toBe('tablet');
    expect(mockLayoutMode(800, 1280, 'android-tablet')).toBe('tablet');
    expect(mockLayoutMode(1440, 900, 'mac')).toBe('desktop');
    expect(mockLayoutMode(390, 844, 'mac')).toBe('desktop');
    expect(mockLayoutMode(900, 400, 'iphone')).toBe('desktop');
    expect(mockLayoutMode(1180, 820, 'ipad')).toBe('desktop');
    expect(mockLayoutMode(390, 844)).toBe('phone');
    expect(mockLayoutMode(600, 800)).toBe('tablet');
    expect(mockLayoutMode(1000, 600)).toBe('desktop');
  });
});

describe('drawMockScreen output', () => {
  it('is deterministic: same seed, same pixels', () => {
    for (const family of ['iphone', 'ipad', 'mac'] as const) {
      const a = render(160, family === 'mac' ? 100 : 300, 3, { family });
      const b = render(160, family === 'mac' ? 100 : 300, 3, { family });
      expect(same(a.data, b.data)).toBe(true);
    }
  });

  it('draws visibly different screens for different seeds', () => {
    const shots = Array.from({ length: MOCK_ARCHETYPES.length }, (_, i) => render(120, 260, i).data);
    for (let i = 0; i < shots.length; i++) {
      for (let j = i + 1; j < shots.length; j++) expect(same(shots[i], shots[j])).toBe(false);
    }
  });

  it('fills the whole area, edge to edge, in every layout and appearance', () => {
    for (const [w, h, family] of [
      [200, 430, 'iphone'],
      [200, 444, 'android-phone'],
      [300, 400, 'ipad'],
      [320, 200, 'mac'],
      [320, 200, undefined],
    ] as const) {
      for (let seed = 0; seed < MOCK_ARCHETYPES.length; seed++) {
        for (const dark of [false, true]) {
          const { ctx } = render(w, h, seed, { dark, family });
          for (const [x, y] of [
            [0, 0],
            [w - 1, 0],
            [0, h - 1],
            [w - 1, h - 1],
            [w / 2, h / 2],
          ])
            expect(pixel(ctx, x, y)[3]).toBe(255);
        }
      }
    }
  });

  it('dark variants are darker than light ones', () => {
    for (let seed = 0; seed < MOCK_ARCHETYPES.length; seed++) {
      const light = meanLuma(render(120, 260, seed, { dark: false }).data);
      const dark = meanLuma(render(120, 260, seed, { dark: true }).data);
      expect(dark).toBeLessThan(light - 40);
    }
  });

  it('uses the palette as accents', () => {
    const red = render(150, 320, 0, { palette: ['#e11d48'] }).data;
    const blue = render(150, 320, 0, { palette: ['#2563eb'] }).data;
    expect(same(red, blue)).toBe(false);
    let reddish = 0;
    for (let i = 0; i < red.length; i += 4) if (red[i] > 180 && red[i + 1] < 90 && red[i + 2] < 120) reddish++;
    expect(reddish).toBeGreaterThan(50);
  });

  it('falls back to a built-in palette when the palette is empty or unusable', () => {
    for (const palette of [[], ['#ffffff', '#000000', '#f4f4f4'], ['not-a-colour', ''], ['#ff000000']]) {
      const { ctx } = render(120, 260, 1, { palette });
      expect(pixel(ctx, 60, 130)[3]).toBe(255);
    }
    const empty = render(120, 260, 1, { palette: [] }).data;
    const junk = render(120, 260, 1, { palette: ['#ffffff', '#000000'] }).data;
    expect(same(empty, junk)).toBe(true);
  });

  it('leaves out the status bar inside a browser window', () => {
    const device = render(200, 430, 0, { family: 'iphone' });
    const web = render(200, 430, 0, { family: 'iphone', chrome: 'web' });
    expect(same(device.data, web.data)).toBe(false);
  });

  it('is crisp and complete at store size within a reasonable time', () => {
    const t0 = performance.now();
    const { ctx } = render(1320, 2868, 4, { family: 'iphone' });
    const ms = performance.now() - t0;
    expect(pixel(ctx, 660, 1434)[3]).toBe(255);
    expect(ms).toBeLessThan(4000);
  });

  it('survives tiny, empty, huge and invalid sizes quickly', () => {
    const t0 = performance.now();
    for (const [w, h] of [
      [1, 1],
      [2, 3],
      [20, 43],
      [43, 20],
      [0, 0],
      [-10, 20],
      [NaN, 100],
      [100, Infinity],
      [2, 1e7],
      [1e5, 3],
    ]) {
      const { canvas, ctx } = testCanvas(10, 10);
      expect(() => drawMockScreen(ctx, w, h, { seed: 5, palette: PALETTE, dark: true })).not.toThrow();
      expect(canvas.width).toBe(10);
    }
    expect(performance.now() - t0).toBeLessThan(5000);
    const { ctx } = testCanvas(10, 10);
    drawMockScreen(ctx, 0, 0, { seed: 1, palette: PALETTE, dark: false });
    expect(pixel(ctx, 5, 5)[3]).toBe(0);
  });

  it('accepts odd seeds', () => {
    for (const seed of [-7, 0.5, 1e9, NaN, -Infinity]) {
      const { ctx } = render(80, 170, seed);
      expect(pixel(ctx, 40, 85)[3]).toBe(255);
    }
  });

  it('restores every context property it changes', () => {
    const { ctx } = testCanvas(200, 400);
    const prime = (c: Ctx2D) => {
      c.translate(3, 4);
      c.globalAlpha = 0.7;
      c.lineWidth = 3;
      c.font = '10px serif';
      c.textAlign = 'right';
      c.shadowBlur = 4;
      c.shadowColor = 'rgba(255, 0, 0, 1)';
      c.fillStyle = '#abcdef';
    };
    prime(ctx);
    const m = ctx.getTransform();
    drawMockScreen(ctx, 190, 390, { seed: 2, palette: PALETTE, dark: false, family: 'iphone' });
    const n = ctx.getTransform();
    expect([n.a, n.b, n.c, n.d, n.e, n.f]).toEqual([m.a, m.b, m.c, m.d, m.e, m.f]);
    expect(ctx.globalAlpha).toBeCloseTo(0.7, 5);
    expect(ctx.lineWidth).toBe(3);
    expect(ctx.font).toBe('10px serif');
    expect(ctx.textAlign).toBe('right');
    expect(ctx.shadowBlur).toBe(4);
    expect(ctx.fillStyle).toBe('#abcdef');
  });

  it('draws inside its rectangle only', () => {
    const { ctx } = testCanvas(300, 300);
    ctx.translate(50, 50);
    drawMockScreen(ctx, 100, 200, { seed: 6, palette: PALETTE, dark: true, family: 'iphone' });
    expect(pixel(ctx, 49, 100)[3]).toBe(0);
    expect(pixel(ctx, 151, 100)[3]).toBe(0);
    expect(pixel(ctx, 100, 49)[3]).toBe(0);
    expect(pixel(ctx, 100, 251)[3]).toBe(0);
    expect(pixel(ctx, 100, 150)[3]).toBe(255);
  });
});

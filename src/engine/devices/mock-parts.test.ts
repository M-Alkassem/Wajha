import { describe, expect, it } from 'vitest';
import { contrast, luminance } from '../color';
import { pixel, testCanvas } from '../testing/canvas.node';
import { albumArt, avatar, mapArt, photo, product } from './mock/art';
import { ICON_NAMES, icon } from './mock/icons';
import { clock, money, series, type Mk } from './mock/kit';
import { createRng, hashSeed } from './mock/rng';
import { FALLBACK_PALETTE, hueDistance, mockTheme, usableAccents } from './mock/theme';
import { APPS } from './mock/apps';

const HEX6 = /^#[0-9a-f]{6}$/;

function mk(w: number, h: number, dark = false): { m: Mk; ctx: Mk['ctx'] } {
  const { ctx } = testCanvas(w, h);
  const m: Mk = { ctx, t: mockTheme(['#6c5ce7', '#ff7a59'], dark), rng: createRng(1), px: 1, os: 'ios', form: 'phone', seed: 1 };
  return { m, ctx };
}

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const seq = (s: number) => Array.from({ length: 8 }, createRng(s).next);
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
    expect(seq(1)).not.toEqual(seq(2));
    expect(seq(NaN)).toEqual(seq(0));
  });

  it('keeps helpers in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = r.int(3, 6);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(6);
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
      const x = r.range(-2, 2);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(2);
    }
    expect(createRng(1).chance(0)).toBe(false);
    expect(createRng(1).chance(1)).toBe(true);
  });

  it('hashes any number to a 32-bit unsigned seed', () => {
    for (const n of [0, 1, -1, 0.5, 1e12, NaN, Infinity]) {
      const h = hashSeed(n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
    expect(hashSeed(1)).not.toBe(hashSeed(2));
    expect(hashSeed(1.5)).not.toBe(hashSeed(1));
  });
});

describe('mock theme', () => {
  it('keeps vivid palette colours in order and drops backgrounds and duplicates', () => {
    expect(usableAccents(['#ffffff', '#0b0b0f', '#ff5a5f', '#FF5A5F', '#f5f0e8', '#3a86ff'])).toEqual(['#ff5a5f', '#3a86ff']);
    expect(usableAccents(['#808080', 'nope', '#12345678', '#abc'])).toEqual([]);
    // Muted tones (chroma 0.16..0.35) follow vivid ones; near-greys are dropped.
    expect(usableAccents(['#a07a6a', '#8a9a8f', '#e11d48'])).toEqual(['#e11d48', '#a07a6a']);
  });

  it('produces valid colours with readable accents in light and dark', () => {
    for (const palette of [[], ['#ffe7a3'], ['#0b1d51'], ['#cfe3ff', '#f6d5c8'], ['#00b894', '#fdcb6e', '#e17055', '#0984e3', '#6c5ce7']]) {
      for (const dark of [false, true]) {
        const t = mockTheme(palette, dark);
        for (const c of [t.bg, t.surface, t.surface2, t.text, t.text2, t.bar, t.bar2, t.bar3, t.accent, t.soft, t.companion, ...t.accents, ...t.brand]) expect(c).toMatch(HEX6);
        expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(dark ? 2.6 : 2);
        expect(contrast(t.text, t.bg)).toBeGreaterThan(12);
        expect(hueDistance(t.accent, t.companion)).toBeLessThanOrEqual(70.5);
        expect(luminance(t.bg) < 0.1).toBe(dark);
      }
    }
  });

  it('uses the fallback palette when nothing is usable', () => {
    const t = mockTheme(['#ffffff', '#000000'], false);
    expect(hueDistance(t.accent, FALLBACK_PALETTE[0])).toBeLessThan(12);
  });
});

describe('kit helpers', () => {
  it('formats numbers like a real app', () => {
    expect(money(1234567.891)).toBe('1,234,567.89');
    expect(money(-42.5)).toBe('42.50');
    expect(money(999, 0)).toBe('999');
    expect(money(1000, 0)).toBe('1,000');
    expect(clock(9, 5)).toBe('9:05');
  });

  it('builds bounded series', () => {
    const s = series(createRng(3), 40, 0.5, 0.9, 0.2);
    expect(s).toHaveLength(40);
    for (const v of s) {
      expect(v).toBeGreaterThanOrEqual(0.08);
      expect(v).toBeLessThanOrEqual(0.92);
    }
    expect(series(createRng(3), 0)).toEqual([]);
  });
});

describe('icons and art', () => {
  it('draws every icon inside its box, outline and filled', () => {
    for (const name of ICON_NAMES) {
      for (const filled of [false, true]) {
        const { ctx } = testCanvas(40, 40);
        icon(ctx, name, 20, 20, 24, '#000000', filled);
        const d = ctx.getImageData(0, 0, 40, 40).data;
        let ink = 0;
        let outside = 0;
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 40; x++) {
            const a = d[(y * 40 + x) * 4 + 3];
            ink += a;
            if (a > 0 && (x < 6 || x > 33 || y < 6 || y > 33)) outside++;
          }
        }
        expect(ink, name).toBeGreaterThan(0);
        expect(outside, name).toBe(0);
      }
    }
    const { ctx } = testCanvas(10, 10);
    expect(() => icon(ctx, 'home', 5, 5, 0, '#000')).not.toThrow();
  });

  it('paints photos, covers, products, avatars and maps that fill their shapes', () => {
    for (let k = 0; k < 12; k++) {
      for (const dark of [false, true]) {
        const { m, ctx } = mk(120, 120, dark);
        photo(m, 0, 0, 120, 120, 12, k);
        expect(pixel(ctx, 60, 60)[3]).toBe(255);
        expect(pixel(ctx, 0, 0)[3]).toBe(0);
        albumArt(m, 0, 0, 120, 0, k);
        expect(pixel(ctx, 1, 1)[3]).toBe(255);
        product(m, 0, 0, 120, 120, 0, k);
        expect(pixel(ctx, 2, 2)[3]).toBe(255);
        avatar(m, 60, 60, 80, k);
        expect(pixel(ctx, 60, 60)[3]).toBe(255);
      }
    }
    const { m, ctx } = mk(200, 300);
    mapArt(m, 0, 0, 200, 300, 4);
    expect(pixel(ctx, 1, 1)[3]).toBe(255);
    expect(pixel(ctx, 199, 299)[3]).toBe(255);
    // Degenerate sizes are ignored.
    expect(() => {
      photo(m, 0, 0, 0, 10, 2, 1);
      albumArt(m, 0, 0, -5, 2, 1);
      product(m, 0, 0, NaN, 10, 2, 1);
      avatar(m, 0, 0, 0, 1);
    }).not.toThrow();
  });

  it('every app draws both layouts at narrow and wide sizes without throwing', () => {
    for (const app of APPS) {
      for (const dark of [false, true]) {
        const { m } = mk(390, 900, dark);
        expect(() => app.narrow(m, { x: 0, y: 54, w: 390, h: 760 }, { x: 0, y: 0, w: 390, h: 900 })).not.toThrow();
        expect(() => app.narrow(m, { x: 0, y: 54, w: 300, h: 120 }, { x: 0, y: 0, w: 300, h: 200 })).not.toThrow();
        expect(() => app.wide(m, { x: 250, y: 84, w: 1000, h: 700 })).not.toThrow();
        expect(() => app.wide(m, { x: 250, y: 84, w: 600, h: 200 })).not.toThrow();
      }
      expect(app.nav.length).toBeGreaterThanOrEqual(4);
    }
  });
});

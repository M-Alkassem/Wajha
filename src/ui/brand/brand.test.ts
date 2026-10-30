import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';
import { Wordmark } from './Wordmark';
import { ARCH, ARCH_PATH, ISLAND, ISLAND_PATH, MARK_VIEWBOX, NIGHT, PHONE, PHONE_PATH, SUNSET_STOPS, roundedRectPath, superellipsePath } from './mark';

/** Every number in an SVG path, for bounds checks. */
const numbers = (d: string) => (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

describe('mark geometry', () => {
  it('uses only absolute path commands with finite numbers', () => {
    for (const d of [ARCH_PATH, PHONE_PATH, ISLAND_PATH]) {
      expect(d).toMatch(/^M[\d. AHVZ-]+$/);
      expect(d.endsWith('Z')).toBe(true);
      expect(numbers(d).every(Number.isFinite)).toBe(true);
    }
  });

  it('fits inside the viewBox', () => {
    expect(ARCH.left).toBeGreaterThan(0);
    expect(ARCH.right).toBeLessThan(MARK_VIEWBOX);
    expect(ARCH.top).toBe(ARCH.springY - ARCH.radius);
    expect(ARCH.bottom).toBeLessThan(MARK_VIEWBOX);
    expect((ARCH.right - ARCH.left) / 2).toBe(ARCH.radius);
  });

  it('stands the phone inside the arch with margins, and the island inside the phone', () => {
    expect(PHONE.x).toBeGreaterThan(ARCH.left + 4);
    expect(PHONE.x + PHONE.w).toBeLessThan(ARCH.right - 4);
    expect(PHONE.y + PHONE.h).toBeLessThan(ARCH.bottom);
    expect(PHONE.y).toBeGreaterThan(ARCH.top + 8);
    // Centred horizontally on the arch.
    expect(PHONE.x + PHONE.w / 2).toBe((ARCH.left + ARCH.right) / 2);
    expect(ISLAND.x).toBeGreaterThan(PHONE.x);
    expect(ISLAND.x + ISLAND.w).toBeLessThan(PHONE.x + PHONE.w);
    expect(ISLAND.y).toBeGreaterThan(PHONE.y);
    expect(ISLAND.x + ISLAND.w / 2).toBeCloseTo(PHONE.x + PHONE.w / 2, 5);
  });

  it('keeps the phone portrait like a real one', () => {
    const aspect = PHONE.h / PHONE.w;
    expect(aspect).toBeGreaterThan(1.7);
    expect(aspect).toBeLessThan(2.3);
  });

  it('declares sunset stops in order with valid colours', () => {
    const offsets = SUNSET_STOPS.map(([o]) => o);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(1);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    for (const [, c] of SUNSET_STOPS) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    expect(NIGHT).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('rounds rectangles with a radius clamped to half the shorter side', () => {
    const d = roundedRectPath(0, 0, 10, 4, 99);
    expect(d).toContain('A2 2');
    expect(Math.max(...numbers(d))).toBeLessThanOrEqual(10);
    expect(roundedRectPath(0, 0, 10, 10, -3)).toContain('A0 0');
  });

  it('builds a closed superellipse within its bounds', () => {
    const d = superellipsePath(50, 50, 40, 5, 64);
    expect(d.startsWith('M90 50')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const vals = numbers(d);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...vals)).toBeLessThanOrEqual(90);
    expect((d.match(/L/g) ?? []).length).toBe(63);
    // Bad exponents and segment counts fall back to something drawable.
    expect(superellipsePath(0, 0, 1, Number.NaN, 2).match(/L/g)).toHaveLength(7);
  });
});

describe('<Logo>', () => {
  it('is an image named Wajha by default', () => {
    const html = renderToStaticMarkup(h(Logo));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Wajha"');
    expect(html).toContain('width="24"');
  });

  it('can be decorative', () => {
    const html = renderToStaticMarkup(h(Logo, { title: null }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it('uses url-safe, unique gradient ids', () => {
    const html = renderToStaticMarkup(h('div', null, h(Logo), h(Logo)));
    const ids = [...html.matchAll(/id="(wajha-sunset-[^"]*)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^wajha-sunset-[a-zA-Z0-9]+$/);
      expect(html).toContain(`url(#${id})`);
    }
  });

  it('draws the island only when there is room for it', () => {
    const count = (size: number) => (renderToStaticMarkup(h(Logo, { size })).match(/<path/g) ?? []).length;
    expect(count(24)).toBe(2);
    expect(count(48)).toBe(3);
  });

  it('has a one-colour variant with the phone cut out', () => {
    const html = renderToStaticMarkup(h(Logo, { variant: 'mono' }));
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain('linearGradient');
  });
});

describe('<Wordmark>', () => {
  it('sets the Latin name with the Arabic name beside it, right-to-left', () => {
    const html = renderToStaticMarkup(h(Wordmark));
    expect(html).toContain('>Wajha<');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('واجهة');
    expect(html).toContain('<svg');
  });

  it('can drop the mark or the Arabic name', () => {
    expect(renderToStaticMarkup(h(Wordmark, { showMark: false }))).not.toContain('<svg');
    expect(renderToStaticMarkup(h(Wordmark, { showArabic: false }))).not.toContain('واجهة');
  });
});

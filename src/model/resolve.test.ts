import { produce } from 'immer';
import { describe, expect, it, vi } from 'vitest';
import * as adaptModule from './adapt';
import { FAMILIES } from './catalog';
import { DEFAULT_LAYOUT_IDS, blankProject, defaultLayout, defaultTheme } from './defaults';
import { devices } from './fixtures.node';
import { layoutSource, resolveLayout, resolveShot, resolveText } from './resolve';
import type { Project, Slide } from './types';

function project(families: Project['families'] = ['iphone', 'ipad']): Project {
  const p = blankProject('P', families, ['en-US', 'ar-SA']);
  // Keep only the primary family's stored layout so the others derive.
  for (const s of p.slides) for (const f of families.slice(1)) delete s.layouts[f];
  return p;
}

describe('resolveLayout', () => {
  it('returns the stored layout itself', () => {
    const p = project();
    expect(resolveLayout(p, p.slides[0], 'iphone')).toBe(p.slides[0].layouts.iphone);
  });

  it('adapts the primary family layout for other families', () => {
    const p = project();
    const l = resolveLayout(p, p.slides[0], 'ipad');
    expect(devices(l)[0].frame).toBe('ipad');
    expect(l.elements.map((e) => e.id)).toEqual(p.slides[0].layouts.iphone!.elements.map((e) => e.id));
    expect(l).toEqual(adaptModule.adaptLayout(p.slides[0].layouts.iphone!, FAMILIES.iphone.design, FAMILIES.ipad.design, 'ipad'));
  });

  it('adapts from any stored layout when the primary has none', () => {
    const p = project(['iphone', 'ipad', 'mac']);
    const slide: Slide = { ...p.slides[0], layouts: { mac: defaultLayout('mac', p.theme, { device: 'm', headline: 'mh', subtitle: 'ms' }) } };
    expect(layoutSource(p, slide, 'iphone')).toBe('mac');
    const l = resolveLayout(p, slide, 'iphone');
    expect(l.elements.map((e) => e.id)).toEqual(['m', 'mh', 'ms']);
    expect(devices(l)[0].frame).toBe('iphone');
  });

  it('falls back to a default layout with stable ids', () => {
    const p = project();
    const slide: Slide = { id: 'bare', texts: {}, shots: {}, layouts: {} };
    expect(layoutSource(p, slide, 'ipad')).toBeNull();
    const l = resolveLayout(p, slide, 'ipad');
    expect(l.elements.map((e) => e.id)).toEqual([DEFAULT_LAYOUT_IDS.device, DEFAULT_LAYOUT_IDS.headline, DEFAULT_LAYOUT_IDS.subtitle]);
    expect(devices(l)[0].frame).toBe('ipad');
  });

  it('memoizes per slide object and family', () => {
    const p = project();
    const spy = vi.spyOn(adaptModule, 'adaptLayout');
    const a = resolveLayout(p, p.slides[1], 'ipad');
    const calls = spy.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    const b = resolveLayout(p, p.slides[1], 'ipad');
    expect(b).toBe(a);
    // A new project object with the same slide (immer keeps identity) is still a hit.
    const p2 = produce(p, (d) => {
      d.name = 'Renamed';
    });
    expect(p2.slides[1]).toBe(p.slides[1]);
    expect(resolveLayout(p2, p2.slides[1], 'ipad')).toBe(a);
    expect(spy.mock.calls.length).toBe(calls);
    spy.mockRestore();
  });

  it('recomputes when the slide or the primary family changes', () => {
    const p = project();
    const before = resolveLayout(p, p.slides[0], 'ipad');
    const edited = produce(p, (d) => {
      d.slides[0].layouts.iphone!.elements[0].x = 0.3;
    });
    const after = resolveLayout(edited, edited.slides[0], 'ipad');
    expect(after).not.toBe(before);
    expect(devices(after)[0].x).not.toBe(devices(before)[0].x);

    const swapped = produce(p, (d) => {
      d.families = ['ipad', 'iphone'];
      d.slides[0].layouts.ipad = defaultLayout('ipad', d.theme, { device: 'x', headline: 'y', subtitle: 'z' });
      delete d.slides[0].layouts.iphone;
    });
    expect(resolveLayout(swapped, swapped.slides[0], 'iphone').elements.map((e) => e.id)).toEqual(['x', 'y', 'z']);
  });

  it('rebuilds default layouts when the theme changes, not adapted ones', () => {
    const p = project();
    const bare: Slide = { id: 'bare', texts: {}, shots: {}, layouts: {} };
    const a = resolveLayout(p, bare, 'iphone');
    const light = { ...p, theme: { ...defaultTheme(), background: { fill: { type: 'solid' as const, color: '#ffffff' }, pattern: null } } };
    const b = resolveLayout(light, bare, 'iphone');
    expect(b).not.toBe(a);
    expect(b.elements[1].kind === 'text' && b.elements[1].style.color).toBe('#14121f');
    const adapted = resolveLayout(p, p.slides[0], 'ipad');
    expect(resolveLayout({ ...p, theme: light.theme }, p.slides[0], 'ipad')).toBe(adapted);
  });

  it('returns an empty layout for an unknown family', () => {
    const p = project();
    expect(resolveLayout(p, p.slides[0], 'watch' as never).elements).toEqual([]);
  });

  it('resolves a 20-slide x 6-family project fast', () => {
    const p = blankProject('Big', ['iphone', 'ipad', 'android-phone', 'android-tablet', 'mac', 'play-feature'], ['en-US']);
    const slides: Slide[] = Array.from({ length: 20 }, (_, i) => ({ ...p.slides[i % 3], id: `s${i}`, layouts: { iphone: p.slides[i % 3].layouts.iphone } }));
    const big = { ...p, slides };
    const t0 = performance.now();
    for (let round = 0; round < 50; round++) for (const s of slides) for (const f of big.families) resolveLayout(big, s, f);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});

describe('resolveText and resolveShot', () => {
  const slide: Slide = {
    id: 's',
    texts: { 'en-US': { headline: 'Hello', subtitle: 'Sub' }, 'ar-SA': { headline: 'مرحبا', subtitle: '' } },
    shots: { iphone: { main: { 'en-US': 'a.png', 'ar-SA': 'b.png' }, side: { 'en-US': 'c.png' } } },
    layouts: {},
  };

  it('falls back to the base language for missing or empty texts', () => {
    expect(resolveText(slide, 'headline', 'ar-SA', 'en-US')).toBe('مرحبا');
    expect(resolveText(slide, 'subtitle', 'ar-SA', 'en-US')).toBe('Sub');
    expect(resolveText(slide, 'headline', 'de-DE', 'en-US')).toBe('Hello');
    expect(resolveText(slide, 'nope', 'en-US', 'en-US')).toBe('');
  });

  it('falls back to the base language screenshot, then null', () => {
    expect(resolveShot(slide, 'iphone', 'main', 'ar-SA', 'en-US')).toBe('b.png');
    expect(resolveShot(slide, 'iphone', 'side', 'ar-SA', 'en-US')).toBe('c.png');
    expect(resolveShot(slide, 'iphone', 'none', 'ar-SA', 'en-US')).toBeNull();
    expect(resolveShot(slide, 'ipad', 'main', 'en-US', 'en-US')).toBeNull();
  });

  it('never returns inherited members for keys, slots or languages named after them', () => {
    expect(resolveText(slide, 'toString', 'en-US', 'en-US')).toBe('');
    expect(resolveText(slide, 'headline', 'constructor', 'valueOf')).toBe('');
    expect(resolveShot(slide, 'iphone', 'toString', 'en-US', 'en-US')).toBeNull();
    expect(resolveShot(slide, 'iphone', 'main', 'valueOf', 'hasOwnProperty')).toBeNull();
    expect(resolveShot(slide, 'toString' as never, 'main', 'en-US', 'en-US')).toBeNull();
  });
});

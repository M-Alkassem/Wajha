import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_ORDER } from './catalog';
import { backgroundTone, contrast } from './colorMath';
import {
  BLANK_SLIDE_COUNT,
  DEFAULT_FONT,
  DEFAULT_LAYOUT_IDS,
  blankProject,
  defaultBackground,
  defaultExportSettings,
  defaultLayout,
  defaultTheme,
  newDeviceElement,
  newImageElement,
  newShapeElement,
  newSlide,
  newTextElement,
  textColors,
} from './defaults';
import { deviceBox, numbersIn } from './fixtures.node';
import { familyMetrics } from './geometry';
import type { Theme } from './types';
import { validateProject } from './validate';

const theme = defaultTheme();

describe('theme defaults', () => {
  it('is a deep violet mesh with a harmonious palette', () => {
    const bg = defaultBackground();
    expect(bg.fill.type).toBe('mesh');
    expect(bg.pattern).toBeNull();
    if (bg.fill.type !== 'mesh') throw new Error('mesh expected');
    expect(bg.fill.points.length).toBeGreaterThanOrEqual(3);
    expect(theme.palette.length).toBeGreaterThanOrEqual(5);
    expect(theme.palette.length).toBeLessThanOrEqual(6);
    expect(theme.fonts).toEqual({ heading: 'Inter Variable', body: 'Inter Variable' });
    expect(theme.panorama).toBe(false);
    expect(theme.mockDark).toBe(false);
  });

  it('returns fresh objects every call', () => {
    const a = defaultTheme();
    a.palette.push('#000000');
    expect(defaultTheme().palette).not.toContain('#000000');
  });

  it('exports PNG into store folders by default', () => {
    expect(defaultExportSettings()).toEqual({ sizes: [], languages: [], format: 'png', jpegQuality: 0.92, structure: 'stores' });
  });
});

describe('text elements', () => {
  it('builds the headline preset', () => {
    const h = newTextElement('headline', 'iphone', theme);
    expect(h.kind).toBe('text');
    expect(h.key).toBe('headline');
    expect(h.style).toMatchObject({ weight: 800, size: 0.075, lineHeight: 1.08, letterSpacing: -0.02, maxLines: 3, align: 'center', font: DEFAULT_FONT });
    expect(h.valign).toBe('top');
    expect(h.width).toBe(0.86);
    expect(h.x).toBe(0.5);
    expect(newTextElement('headline', 'ipad', theme).style.size).toBe(0.075);
    expect(newTextElement('headline', 'mac', theme).style.size).toBe(0.06);
  });

  it('builds the subtitle preset with a softened colour', () => {
    const s = newTextElement('subtitle', 'iphone', theme);
    expect(s.key).toBe('subtitle');
    expect(s.style).toMatchObject({ weight: 500, size: 0.04, lineHeight: 1.25, maxLines: 3 });
    expect(s.style.color).toMatch(/^#[0-9a-f]{6}(b[a-f0-9]|c0)$/);
    expect(s.y).toBeGreaterThan(newTextElement('headline', 'iphone', theme).y);
  });

  it('builds a small caption', () => {
    const c = newTextElement('caption', 'iphone', theme);
    expect(c.key).toBe('caption');
    expect(c.style.size).toBeLessThan(0.04);
    expect(c.style.transform).toBe('uppercase');
  });

  it('reads well on the theme background', () => {
    for (const t of [theme, lightTheme()]) {
      const tone = backgroundTone(t.background);
      const h = newTextElement('headline', 'iphone', t);
      expect(contrast(h.style.color, tone)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(h.style.highlight, tone)).toBeGreaterThanOrEqual(3);
    }
    expect(textColors(lightTheme()).text).toBe('#14121f');
  });

  it('puts copy in the left half on wide canvases and keeps boxes inside', () => {
    for (const f of ['mac', 'play-feature'] as const) {
      const m = familyMetrics(f);
      for (const role of ['headline', 'subtitle'] as const) {
        const el = newTextElement(role, f, theme);
        expect(el.x).toBeCloseTo(0.28);
        const left = el.x - el.width / 2 / m.wu;
        const right = el.x + el.width / 2 / m.wu;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('never makes a text wider than 92 % of the canvas', () => {
    for (const f of FAMILY_ORDER) {
      for (const role of ['headline', 'subtitle', 'caption'] as const) {
        expect(newTextElement(role, f, theme).width).toBeLessThanOrEqual(0.92 * familyMetrics(f).wu + 1e-9);
      }
    }
  });

  it('copes with a broken theme', () => {
    const el = newTextElement('headline', 'iphone', {} as Theme);
    expect(el.style.font).toBe(DEFAULT_FONT);
    expect(el.style.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('device elements', () => {
  it('uses the family default frame and a metal graphite style', () => {
    for (const f of FAMILY_ORDER) {
      const d = newDeviceElement(f, theme);
      expect(d.frame).toBe(FAMILIES[f].defaultFrame);
      expect(d.style.finish).toBe('metal');
      expect(d.style.bezel).toBe('black');
      expect(d.slot).toBe('main');
      expect(d.shadow).not.toBeNull();
    }
  });

  it('sits the iPhone ~0.78u wide around y 0.64, bleeding slightly off the bottom', () => {
    const d = newDeviceElement('iphone', theme);
    expect(d.width).toBeCloseTo(0.78, 2);
    expect(d.y).toBeGreaterThan(0.6);
    expect(d.y).toBeLessThan(0.68);
    const box = deviceBox(d, 'iphone');
    expect(box.bottom).toBeGreaterThan(1);
    expect(box.bottom).toBeLessThan(1.1);
  });

  it('gives tablets a 0.80u device', () => {
    expect(newDeviceElement('ipad', theme).width).toBeCloseTo(0.8);
    expect(newDeviceElement('android-tablet', theme).width).toBeCloseTo(0.8);
  });

  it('keeps the device below the copy on portrait canvases', () => {
    for (const f of ['iphone', 'ipad', 'android-phone', 'android-tablet'] as const) {
      const d = newDeviceElement(f, theme);
      const sub = newTextElement('subtitle', f, theme);
      const m = familyMetrics(f);
      const subBottom = sub.y + (2 * sub.style.size * sub.style.lineHeight) / m.hu;
      expect(deviceBox(d, f).top).toBeGreaterThan(subBottom);
    }
  });

  it('puts the device on the right half of wide canvases', () => {
    for (const f of ['mac', 'play-feature'] as const) {
      const box = deviceBox(newDeviceElement(f, theme), f);
      expect(box.left).toBeGreaterThanOrEqual(0.5);
      expect(box.right).toBeLessThanOrEqual(1);
    }
    // A laptop is fully visible, a phone on the banner bleeds.
    const mac = deviceBox(newDeviceElement('mac', theme), 'mac');
    expect(mac.top).toBeGreaterThan(0);
    expect(mac.bottom).toBeLessThan(1);
    expect(deviceBox(newDeviceElement('play-feature', theme), 'play-feature').bottom).toBeGreaterThan(1);
  });
});

describe('shapes and images', () => {
  it('creates every shape kind with sane sizes', () => {
    for (const kind of ['circle', 'rect', 'blob', 'ring'] as const) {
      const s = newShapeElement(kind, theme);
      expect(s.shape).toBe(kind);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
      expect(s.fill).toEqual({ type: 'solid', color: theme.palette[0] });
    }
    expect(newShapeElement('ring', theme).stroke).toBeGreaterThan(0);
    expect(newShapeElement('rect', theme).radius).toBeGreaterThan(0);
    expect(Number.isInteger(newShapeElement('blob', theme).seed)).toBe(true);
    expect(newShapeElement('circle', { palette: [] } as unknown as Theme).fill).toEqual({ type: 'solid', color: '#7c5cff' });
  });

  it('sizes images by their aspect', () => {
    expect(newImageElement('a', 2).width).toBeCloseTo(0.3);
    expect(newImageElement('a', 0.5).width).toBeCloseTo(0.6);
    for (const bad of [NaN, 0, -1, Infinity]) expect(Number.isFinite(newImageElement('a', bad).width)).toBe(true);
  });
});

describe('slides and projects', () => {
  it('creates a layout per family with shared element ids and empty texts', () => {
    const slide = newSlide(['iphone', 'ipad', 'mac'], theme, ['en-US', 'ar-SA']);
    expect(Object.keys(slide.layouts)).toEqual(['iphone', 'ipad', 'mac']);
    const ids = (f: 'iphone' | 'ipad' | 'mac') => slide.layouts[f]!.elements.map((e) => e.id);
    expect(ids('iphone')).toEqual(ids('ipad'));
    expect(ids('iphone')).toEqual(ids('mac'));
    expect(slide.layouts.iphone!.elements.map((e) => e.kind)).toEqual(['device', 'text', 'text']);
    expect(slide.texts).toEqual({ 'en-US': { headline: '', subtitle: '' }, 'ar-SA': { headline: '', subtitle: '' } });
    expect(slide.shots).toEqual({});
  });

  it('repairs empty or invalid families and languages', () => {
    const slide = newSlide([], theme, ['nope' as string]);
    expect(Object.keys(slide.layouts)).toEqual(['iphone']);
    expect(Object.keys(slide.texts)).toEqual(['en-US']);
  });

  it('builds default layouts with stable ids', () => {
    const a = defaultLayout('iphone', theme);
    const b = defaultLayout('iphone', theme);
    expect(a.elements.map((e) => e.id)).toEqual([DEFAULT_LAYOUT_IDS.device, DEFAULT_LAYOUT_IDS.headline, DEFAULT_LAYOUT_IDS.subtitle]);
    expect(a).toEqual(b);
  });

  it('creates a valid blank project with three slides', () => {
    const p = blankProject('  My App  ', ['iphone', 'android-phone', 'iphone'], ['en-US', 'de-DE']);
    expect(p.name).toBe('My App');
    expect(p.slides).toHaveLength(BLANK_SLIDE_COUNT);
    expect(p.families).toEqual(['iphone', 'android-phone']);
    expect(p.languages).toEqual(['en-US', 'de-DE']);
    expect(p.templateId).toBeNull();
    expect(new Set(p.slides.map((s) => s.id)).size).toBe(3);
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(blankProject('', [], []).name).toBe('Untitled');
  });

  it('never produces NaN anywhere', () => {
    for (const f of FAMILY_ORDER) {
      for (const n of numbersIn(defaultLayout(f, theme))) expect(Number.isFinite(n.value), n.path).toBe(true);
    }
  });
});

function lightTheme(): Theme {
  return { ...defaultTheme(), background: { fill: { type: 'solid', color: '#f6f4ff' }, pattern: null }, palette: ['#6a4cff', '#ff5c9d', '#ffffff'] };
}

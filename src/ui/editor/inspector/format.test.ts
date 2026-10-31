import { describe, expect, it } from 'vitest';
import { newShapeElement, newTextElement, defaultTheme, newDeviceElement, newImageElement, blankProject } from '../../../model/defaults';
import type { Fill, Slide } from '../../../model/types';
import {
  canonicalColor,
  clampWeight,
  defaultElementName,
  dialTurnStarted,
  elementName,
  fillsMatch,
  fontGroups,
  fontLabel,
  formatBytes,
  frameAspect,
  widthForFrame,
  fromPct,
  humanizeKey,
  normalizeRotation,
  rotationFromPointer,
  shotStatus,
  smallerTextSize,
  suggestPaletteColor,
  toPct,
  weightOptions,
  weightRange,
} from './format';

describe('units', () => {
  it('converts fractions to percent without float noise and back', () => {
    expect(toPct(0.075)).toBe(7.5);
    expect(toPct(0.1 + 0.2)).toBe(30);
    expect(fromPct(7.5)).toBe(0.075);
    expect(fromPct(toPct(0.6394))).toBe(0.6394);
    expect(toPct(-0)).toBe(0);
  });

  it('steps overflowing text about 10% smaller on the size grid, never below the minimum', () => {
    expect(smallerTextSize(0.09)).toBe(0.081);
    expect(smallerTextSize(0.081)).toBe(0.073);
    expect(smallerTextSize(0.005)).toBe(0.004);
    expect(smallerTextSize(0.004)).toBe(0.004);
    expect(smallerTextSize(Number.NaN)).toBe(0.004);
    for (let size = 0.006; size < 0.3; size += 0.0137) expect(smallerTextSize(size)).toBeLessThan(size);
  });

  it('turns the rotation dial only after the pointer travels, so clicks and double-clicks do not rotate', () => {
    expect(dialTurnStarted(0, 0)).toBe(false);
    expect(dialTurnStarted(2, 2)).toBe(false);
    expect(dialTurnStarted(3, 0)).toBe(true);
    expect(dialTurnStarted(-2, -3)).toBe(true);
  });

  it('folds rotations into [-180, 180)', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(190)).toBe(-170);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(180)).toBe(-180);
    expect(normalizeRotation(-8)).toBe(-8);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it('reads dial angles clockwise from 12 o’clock, snapping with shift', () => {
    expect(rotationFromPointer(0, -10, false)).toBe(0);
    expect(rotationFromPointer(10, 0, false)).toBe(90);
    expect(rotationFromPointer(-10, 0, false)).toBe(-90);
    expect(rotationFromPointer(0, 10, false)).toBe(-180);
    expect(rotationFromPointer(10, -9, true)).toBe(45);
    expect(rotationFromPointer(0, 0, false)).toBeNull();
  });

  it('formats byte sizes', () => {
    expect(formatBytes(312)).toBe('312 B');
    expect(formatBytes(140_000)).toBe('137 KB');
    expect(formatBytes(1_300_000)).toBe('1.2 MB');
    expect(formatBytes(40 * 1024 * 1024)).toBe('40 MB');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('names', () => {
  it('humanizes text keys', () => {
    expect(humanizeKey('headline')).toBe('Headline');
    expect(humanizeKey('caption2')).toBe('Caption 2');
    expect(humanizeKey('call_to-action')).toBe('Call to action');
    expect(humanizeKey('ctaButton')).toBe('Cta button');
    expect(humanizeKey('---')).toBe('Text');
  });

  it('names elements by kind, frame, shape or file', () => {
    const theme = defaultTheme();
    const project = blankProject('P', ['iphone'], ['en-US']);
    project.assets['a'.repeat(64) + '.png'] = { id: 'a'.repeat(64) + '.png', name: 'App Store badge.png', width: 10, height: 10, bytes: 1, addedAt: 0 };
    expect(defaultElementName(newTextElement('subtitle', 'iphone', theme), project)).toBe('Subtitle');
    expect(defaultElementName({ ...newDeviceElement('ipad', theme), frame: 'macbook' }, project)).toBe('MacBook');
    expect(defaultElementName(newShapeElement('ring', theme), project)).toBe('Ring');
    expect(defaultElementName(newImageElement('a'.repeat(64) + '.png', 1), project)).toBe('App Store badge');
    expect(defaultElementName(newImageElement('b'.repeat(64) + '.png', 1), project)).toBe('Image');
    expect(elementName({ ...newShapeElement('blob', theme), name: '  Glow ' }, project)).toBe('Glow');
    expect(elementName({ ...newShapeElement('blob', theme), name: '   ' }, project)).toBe('Blob');
  });
});

describe('fonts', () => {
  it('labels bundled fonts and passes system fonts through', () => {
    expect(fontLabel('Inter Variable')).toBe('Inter');
    expect(fontLabel('Helvetica Neue')).toBe('Helvetica Neue');
    expect(weightRange('Readex Pro Variable')).toEqual([160, 700]);
    expect(weightRange('Helvetica Neue')).toEqual([100, 900]);
  });

  it('offers the standard weights inside a range, plus an odd current one', () => {
    expect(weightOptions([160, 700], 700).map((o) => o.value)).toEqual(['200', '300', '400', '500', '600', '700']);
    expect(weightOptions([100, 900], 450).map((o) => o.value)).toContain('450');
    expect(weightOptions([100, 1000], 800).find((o) => o.value === '800')?.label).toBe('800 · Extra Bold');
    expect(weightOptions([430, 470], 450).map((o) => o.value)).toEqual(['400', '450']);
  });

  it('keeps a weight the new font supports, else the nearest one', () => {
    expect(clampWeight(800, [200, 800])).toBe(800);
    expect(clampWeight(900, [200, 800])).toBe(800);
    expect(clampWeight(100, [160, 700])).toBe(200);
    expect(clampWeight(450, [100, 900])).toBe(450);
    expect(clampWeight(Number.NaN, [100, 900])).toBe(400);
  });

  it('groups bundled fonts by category and appends system fonts without duplicates', () => {
    const groups = fontGroups(['Helvetica Neue', 'Inter', '.SF NS', 'Avenir', 'Avenir'], '');
    expect(groups.map((g) => g.id)).toEqual(['sans', 'display', 'serif', 'arabic', 'multi', 'system']);
    expect(groups.at(-1)?.fonts.map((f) => f.family)).toEqual(['Helvetica Neue', 'Avenir']);
    const search = fontGroups(['Helvetica Neue'], 'play');
    expect(search.flatMap((g) => g.fonts.map((f) => f.label))).toEqual(['Playfair Display']);
    expect(fontGroups([], 'zzz')).toEqual([]);
  });

  it('never matches the hidden " Variable" suffix of bundled families', () => {
    const labels = (q: string) => fontGroups(['Arial', 'Avenir'], q).flatMap((g) => g.fonts.map((f) => f.label));
    expect(labels('ar')).toEqual(['Plus Jakarta Sans', 'Noto Sans Arabic', 'Arial']);
    expect(labels('Aria')).toEqual(['Arial']);
    for (const q of ['ia', 'le', 'var', 'Variable']) expect(labels(q), q).not.toContain('Inter');
    expect(labels('var')).toEqual([]);
    // The family name still matches without its suffix.
    expect(labels('noto sans')).toEqual(['Noto Sans Arabic']);
  });
});

describe('screenshots', () => {
  const slide = (shots: Slide['shots']): Slide => ({ id: 's', texts: {}, shots, layouts: {} });

  it('tells own, fallback and missing screenshots apart', () => {
    const s = slide({ iphone: { main: { 'en-US': 'x.png' } } });
    expect(shotStatus(s, 'iphone', 'main', 'en-US', 'en-US')).toBe('own');
    expect(shotStatus(s, 'iphone', 'main', 'ar-SA', 'en-US')).toBe('base');
    expect(shotStatus(s, 'iphone', 'other', 'ar-SA', 'en-US')).toBe('missing');
    expect(shotStatus(s, 'ipad', 'main', 'en-US', 'en-US')).toBe('missing');
  });

  it('gives every frame a sensible default screen shape', () => {
    expect(frameAspect('iphone', 'iphone')).toBeGreaterThan(2);
    expect(frameAspect('macbook', 'iphone')).toBeLessThan(1);
    expect(frameAspect('none', 'mac')).toBeLessThan(1);
    expect(frameAspect('browser', 'iphone')).toBe(0.625);
  });
});

describe('colours', () => {
  it('normalises hex colours for comparison', () => {
    expect(canonicalColor('#AABBCC')).toBe('#aabbcc');
    expect(canonicalColor('#AABBCCFF')).toBe('#aabbcc');
    expect(canonicalColor('#AABBCC80')).toBe('#aabbcc80');
    expect(canonicalColor('cover')).toBe('cover');
  });

  it('matches fills across the kit/store round trip', () => {
    const kit: Fill = { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#7C6CFF' }, { offset: 1, color: '#FFB65CFF' }] };
    const store: Fill = { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#7c6cff' }, { offset: 1, color: '#ffb65c' }] };
    expect(fillsMatch(kit, store)).toBe(true);
    expect(fillsMatch(kit, { ...store, angle: 161 })).toBe(false);
    expect(fillsMatch(kit, null)).toBe(false);
  });

  it('suggests a palette colour with a hue the palette does not have', () => {
    const palette = ['#7c5cff', '#ff5c9d', '#ffc46b', '#3dd6c6', '#ffffff', '#130b33'];
    const next = suggestPaletteColor(palette);
    expect(next).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette).not.toContain(next);
    expect(suggestPaletteColor([])).toMatch(/^#[0-9a-f]{6}$/);
    expect(suggestPaletteColor(['#ffffff', '#000000'])).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('widthForFrame', () => {
  it('keeps the width when the frame stays the same', () => {
    expect(widthForFrame(0.6, 'iphone', 'iphone', 'iphone')).toBe(0.6);
  });

  it('fits a phone that replaces a laptop inside the laptop, so it does not outgrow the slide', () => {
    const w = widthForFrame(0.67, 'macbook', 'iphone', 'mac');
    expect(w).toBeLessThan(0.67 / 2.5);
    expect(w).toBeGreaterThan(0.1);
  });

  it('keeps a laptop that replaces a phone about as wide as the phone was', () => {
    const w = widthForFrame(0.78, 'iphone', 'macbook', 'iphone');
    expect(w).toBeLessThanOrEqual(0.78);
    expect(w).toBeGreaterThan(0.6);
  });

  it('stays inside the model limits', () => {
    expect(widthForFrame(4, 'iphone', 'macbook', 'iphone')).toBeLessThanOrEqual(4);
    expect(widthForFrame(0.02, 'macbook', 'iphone', 'mac')).toBeGreaterThanOrEqual(0.02);
  });
});

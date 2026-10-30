import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../../../model/catalog';
import { blankProject, newDeviceElement, newImageElement, newShapeElement, newTextElement, defaultTheme } from '../../../model/defaults';
import { assetId, assetInfo } from '../../../model/fixtures.node';
import { resolveLayout } from '../../../model/resolve';
import type { Project, Slide, SlideLayout } from '../../../model/types';
import {
  SLIDE_LIST_INNER,
  SLIDE_NUMBER_COL,
  countMissingShots,
  elementLabel,
  missingDevices,
  shapeLabel,
  singleLine,
  slideHasContent,
  slideTitle,
  textRoleLabel,
  thumbSize,
} from './labels';

const theme = defaultTheme();

function slideWith(texts: Slide['texts'], extra: Partial<Slide> = {}): Slide {
  return { id: 's1', texts, shots: {}, layouts: {}, ...extra };
}

describe('singleLine', () => {
  it('drops highlight markup and escapes and joins lines', () => {
    expect(singleLine('Track *every* habit')).toBe('Track every habit');
    expect(singleLine('Five\\* rating')).toBe('Five* rating');
    expect(singleLine('Line one\nline   two')).toBe('Line one line two');
    expect(singleLine('  ')).toBe('');
    expect(singleLine('')).toBe('');
  });
  it('keeps right-to-left text intact', () => {
    expect(singleLine('تتبع *كل* عادة')).toBe('تتبع كل عادة');
  });
});

describe('textRoleLabel', () => {
  it('names the usual roles and numbers copies', () => {
    expect(textRoleLabel('headline')).toBe('Headline');
    expect(textRoleLabel('subtitle2')).toBe('Subtitle 2');
    expect(textRoleLabel('eyebrow')).toBe('Eyebrow');
    expect(textRoleLabel('caption')).toBe('Caption');
  });
  it('turns other keys into words', () => {
    expect(textRoleLabel('promo_badge')).toBe('Promo badge');
    expect(textRoleLabel('k3')).toBe('K 3');
    expect(textRoleLabel('')).toBe('Text');
    expect(textRoleLabel('42')).toBe('Text 42');
  });
});

describe('shapeLabel', () => {
  it('names shapes by kind; a blurred circle is a glow', () => {
    expect(shapeLabel(newShapeElement('circle', theme))).toBe('Circle');
    expect(shapeLabel({ ...newShapeElement('circle', theme), blur: 0.1 })).toBe('Glow');
    expect(shapeLabel(newShapeElement('rect', theme))).toBe('Rounded rect');
    expect(shapeLabel({ ...newShapeElement('rect', theme), radius: 0 })).toBe('Rectangle');
    expect(shapeLabel(newShapeElement('blob', theme))).toBe('Blob');
    expect(shapeLabel(newShapeElement('ring', theme))).toBe('Ring');
  });
});

describe('elementLabel', () => {
  const slide = slideWith({ 'en-US': { headline: 'Sleep *better*', subtitle: '' }, 'ar-SA': { headline: 'نم أفضل' } });
  const ctx = { slide, lang: 'en-US', baseLang: 'en-US', assets: { [assetId(1)]: assetInfo(1) } };

  it('prefers the user name', () => {
    expect(elementLabel({ ...newTextElement('headline', 'iphone', theme), name: '  Hero copy ' }, ctx)).toBe('Hero copy');
  });
  it('shows a text in the active language, falling back to the base language, then the role', () => {
    const headline = newTextElement('headline', 'iphone', theme);
    expect(elementLabel(headline, ctx)).toBe('Sleep better');
    expect(elementLabel(headline, { ...ctx, lang: 'ar-SA' })).toBe('نم أفضل');
    expect(elementLabel(headline, { ...ctx, lang: 'de-DE' })).toBe('Sleep better');
    expect(elementLabel(newTextElement('subtitle', 'iphone', theme), ctx)).toBe('Subtitle');
  });
  it('names devices by frame and extra slots', () => {
    const device = newDeviceElement('iphone', theme);
    expect(elementLabel(device, ctx)).toBe('iPhone');
    expect(elementLabel({ ...device, slot: 'second' }, ctx)).toBe('iPhone · second');
    expect(elementLabel({ ...device, frame: 'macbook' }, ctx)).toBe('MacBook');
    expect(elementLabel({ ...device, frame: 'none' }, ctx)).toBe('Screenshot');
  });
  it('names images by file and shapes by kind', () => {
    expect(elementLabel(newImageElement(assetId(1), 1), ctx)).toBe('shot-1.png');
    expect(elementLabel(newImageElement(assetId(2), 1), ctx)).toBe('Image');
    expect(elementLabel(newShapeElement('ring', theme), ctx)).toBe('Ring');
  });
});

describe('slideTitle', () => {
  const layout = (keys: string[]): SlideLayout => ({
    background: null,
    elements: keys.map((k) => ({ ...newTextElement('caption', 'iphone', theme), key: k })),
  });

  it('reads the headline and subtitle with base-language fallback', () => {
    const slide = slideWith({ 'en-US': { headline: 'Plan *your* day', subtitle: 'In seconds' }, 'de-DE': { headline: 'Plane deinen Tag', subtitle: '' } });
    expect(slideTitle(slide, layout(['subtitle', 'headline']), 'en-US', 'en-US')).toEqual({ title: 'Plan your day', subtitle: 'In seconds' });
    expect(slideTitle(slide, layout(['headline', 'subtitle']), 'de-DE', 'en-US')).toEqual({ title: 'Plane deinen Tag', subtitle: 'In seconds' });
  });
  it('falls back to the first text without a headline, then to nothing', () => {
    const slide = slideWith({ 'en-US': { eyebrow: 'NEW', promo: 'Free for a week' } });
    expect(slideTitle(slide, layout(['eyebrow', 'promo']), 'en-US', 'en-US')).toEqual({ title: 'NEW', subtitle: 'Free for a week' });
    expect(slideTitle(slide, layout([]), 'en-US', 'en-US')).toEqual({ title: '', subtitle: '' });
    expect(slideTitle(slideWith({}), layout(['headline']), 'en-US', 'en-US')).toEqual({ title: '', subtitle: '' });
  });
});

describe('slideHasContent', () => {
  it('is false for empty texts and no screenshots', () => {
    expect(slideHasContent(slideWith({ 'en-US': { headline: '', subtitle: '  ' } }))).toBe(false);
    expect(slideHasContent(slideWith({}, { shots: { iphone: { main: {} } } }))).toBe(false);
  });
  it('is true with any written text or any screenshot', () => {
    expect(slideHasContent(slideWith({ 'ar-SA': { headline: 'مرحبا' } }))).toBe(true);
    expect(slideHasContent(slideWith({}, { shots: { 'android-phone': { main: { 'en-US': assetId(3) } } } }))).toBe(true);
  });
});

describe('missing screenshots', () => {
  function project(): Project {
    const p = blankProject('Test', ['iphone', 'play-feature'], ['en-US', 'ar-SA']);
    return p;
  }

  it('counts visible devices without a screenshot after base-language fallback', () => {
    const p = project();
    const slide = p.slides[0];
    const layout = resolveLayout(p, slide, 'iphone');
    const device = layout.elements.find((e) => e.kind === 'device')!;
    expect(missingDevices(slide, layout, 'iphone', 'en-US', 'en-US')).toEqual([device.id]);
    const withShot: Slide = { ...slide, shots: { iphone: { [device.kind === 'device' ? device.slot : 'main']: { 'en-US': assetId(1) } } } };
    expect(missingDevices(withShot, layout, 'iphone', 'ar-SA', 'en-US')).toEqual([]);
    const hidden: SlideLayout = { ...layout, elements: layout.elements.map((e) => (e.id === device.id ? { ...e, hidden: true } : e)) };
    expect(missingDevices(slide, hidden, 'iphone', 'en-US', 'en-US')).toEqual([]);
  });

  it('only counts slides the store accepts and points at the first gap', () => {
    const p = project();
    const all = countMissingShots(p, 'iphone', 'en-US');
    expect(all.count).toBe(p.slides.length);
    expect(all.first?.slideId).toBe(p.slides[0].id);
    // The feature graphic exports one slide only.
    expect(countMissingShots(p, 'play-feature', 'en-US').count).toBe(FAMILIES['play-feature'].maxSlides);
  });
});

describe('thumbSize', () => {
  it('sizes portrait canvases beside the text and landscape ones across the row', () => {
    const iphone = thumbSize('iphone');
    expect(iphone.layout).toBe('side');
    expect(iphone.width).toBeGreaterThanOrEqual(80);
    expect(iphone.width).toBeLessThanOrEqual(96);
    expect(thumbSize('ipad').width).toBeGreaterThan(iphone.width);
    expect(thumbSize('ipad').width).toBeLessThanOrEqual(88);
    expect(thumbSize('mac')).toEqual({ width: SLIDE_LIST_INNER - SLIDE_NUMBER_COL, layout: 'stacked' });
    expect(thumbSize('play-feature').layout).toBe('stacked');
  });
});

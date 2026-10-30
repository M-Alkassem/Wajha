import { describe, expect, it } from 'vitest';
import { adaptLayout } from './adapt';
import { FAMILIES, FAMILY_ORDER } from './catalog';
import { blankProject, defaultLayout, defaultTheme } from './defaults';
import { assetId, assetInfo, devices, sampleTemplate } from './fixtures.node';
import { REFERENCE_FAMILY, designAssets, pickTexts, projectFromTemplate, sameLanguageTexts, templateFromProject, templateIdFrom } from './instantiate';
import { resolveLayout, resolveText } from './resolve';
import type { ImageElement, Project, Template } from './types';
import { validateProject, validateTemplate } from './validate';

const opts = { name: 'My App', families: ['iphone', 'ipad', 'android-phone', 'mac', 'play-feature'] as Project['families'], languages: ['en-US', 'ar-SA', 'fr-FR', 'ja'] };

describe('pickTexts', () => {
  const t = { 'en-US': { h: 'en' }, ar: { h: 'ar' }, 'pt-BR': { h: 'br' }, 'en-GB': { h: 'gb' } };
  it('prefers the same language, then a variant, then en-US', () => {
    expect(pickTexts(t, 'en-US')).toEqual({ h: 'en' });
    expect(pickTexts(t, 'ar-SA')).toEqual({ h: 'ar' });
    expect(pickTexts(t, 'pt-PT')).toEqual({ h: 'br' });
    expect(pickTexts(t, 'ja')).toEqual({ h: 'en' });
    expect(pickTexts({ 'en-GB': { h: 'gb' } }, 'ja')).toEqual({ h: 'gb' });
    expect(pickTexts({ de: { h: 'de' } }, 'ja')).toEqual({ h: 'de' });
    expect(pickTexts({}, 'ja')).toEqual({});
  });
  it('ignores inherited keys', () => {
    expect(pickTexts(Object.create({ ja: { h: 'proto' } }) as Record<string, Record<string, string>>, 'ja')).toEqual({});
  });
});

describe('sameLanguageTexts', () => {
  const t = { 'en-US': { h: 'en' }, ar: { h: 'ar' }, 'pt-BR': { h: 'br' }, 'zh-Hans': { h: 'hans' } };
  it('finds the same language or a regional variant, nothing else', () => {
    expect(sameLanguageTexts(t, 'en-US')).toEqual({ h: 'en' });
    expect(sameLanguageTexts(t, 'en-GB')).toEqual({ h: 'en' });
    expect(sameLanguageTexts(t, 'ar-SA')).toEqual({ h: 'ar' });
    expect(sameLanguageTexts(t, 'pt-PT')).toEqual({ h: 'br' });
    expect(sameLanguageTexts(t, 'ja')).toBeUndefined();
    expect(sameLanguageTexts(t, 'fr-FR')).toBeUndefined();
  });
  it('never takes copy written in another script', () => {
    expect(sameLanguageTexts(t, 'zh-Hans')).toEqual({ h: 'hans' });
    expect(sameLanguageTexts(t, 'zh-Hant')).toBeUndefined();
    expect(sameLanguageTexts(t, 'zh-CN')).toEqual({ h: 'hans' });
    expect(pickTexts(t, 'zh-Hant')).toEqual({ h: 'en' });
  });
});

describe('projectFromTemplate', () => {
  const template = sampleTemplate(3);
  const p = projectFromTemplate(template, opts);

  it('creates a well-formed project that validates unchanged', () => {
    expect(p.format).toBe('wajha.project');
    expect(p.name).toBe('My App');
    expect(p.templateId).toBe('sample-glow');
    expect(p.families).toEqual(opts.families);
    expect(p.languages).toEqual(opts.languages);
    expect(p.slides).toHaveLength(3);
    expect(p.theme).toEqual(template.theme);
    expect(p.theme).not.toBe(template.theme);
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('gives the project, slides and elements fresh ids', () => {
    const p2 = projectFromTemplate(template, opts);
    expect(p2.id).not.toBe(p.id);
    expect(p2.slides[0].id).not.toBe(p.slides[0].id);
    const templateIds = new Set(template.slides.flatMap((s) => Object.values(s.layouts).flatMap((l) => l!.elements.map((e) => e.id))));
    for (const s of p.slides) for (const l of Object.values(s.layouts)) for (const e of l!.elements) expect(templateIds.has(e.id)).toBe(false);
  });

  it('keeps one element identity across every family of a slide', () => {
    for (const s of p.slides) {
      const ids = opts.families.map((f) => resolveLayout(p, s, f).elements.map((e) => e.id).join(','));
      expect(new Set(ids).size).toBe(1);
    }
  });

  it('copies sample texts for the base language and real translations only', () => {
    expect(p.slides[0].texts['en-US']).toEqual({ headline: 'Headline 1', subtitle: 'Subtitle 1' });
    expect(p.slides[0].texts['ar-SA']).toEqual({ headline: 'عنوان 1', subtitle: 'وصف 1' });
    expect(p.slides[0].texts['fr-FR']).toEqual({ headline: 'Titre 1', subtitle: 'Sous-titre 1' });
    // No Japanese copy: nothing is stored, so it shows the base text and counts as untranslated.
    expect(p.slides[0].texts.ja).toBeUndefined();
    expect(resolveText(p.slides[0], 'headline', 'ja', 'en-US')).toBe('Headline 1');
    // Copies, not shared objects.
    p.slides[0].texts['fr-FR'].headline = 'changed';
    expect(template.slides[0].texts['fr-FR'].headline).toBe('Titre 1');
  });

  it('gives a base language the template lacks the English samples', () => {
    const q = projectFromTemplate(template, { ...opts, languages: ['ja', 'en-US', 'de-DE'] });
    expect(q.slides[0].texts.ja).toEqual({ headline: 'Headline 1', subtitle: 'Subtitle 1' });
    expect(q.slides[0].texts['en-US']).toEqual({ headline: 'Headline 1', subtitle: 'Subtitle 1' });
    expect(q.slides[0].texts['de-DE']).toBeUndefined();
  });

  it('stores the primary layout and the other class designs of the template; the rest follow the primary', () => {
    const s0 = p.slides[0];
    // iPhone (primary), iPad (template tablet design), Mac and feature graphic (template wide design).
    expect(Object.keys(s0.layouts).sort()).toEqual(['ipad', 'iphone', 'mac', 'play-feature']);
    // Reference families take their class layout as authored (ids aside).
    const noIds = (l: { elements: { id: string }[] }) => l.elements.map(({ id: _id, ...rest }) => rest);
    expect(noIds(s0.layouts.iphone!)).toEqual(noIds(template.slides[0].layouts.tall));
    expect(noIds(s0.layouts.mac!)).toEqual(noIds(template.slides[0].layouts.wide!));
    expect(noIds(s0.layouts['play-feature']!)).toEqual(noIds(adaptLayout(template.slides[0].layouts.wide!, FAMILIES.mac.design, FAMILIES['play-feature'].design, 'play-feature')));
    // Android phone has the primary's shape: it is derived from the iPhone layout.
    expect(s0.layouts['android-phone']).toBeUndefined();
    const android = resolveLayout(p, s0, 'android-phone');
    expect(android).toEqual(adaptLayout(s0.layouts.iphone!, FAMILIES.iphone.design, FAMILIES['android-phone'].design, 'android-phone'));
    expect(devices(android)[0].frame).toBe('android-phone');
    // The last template slide has only a tall layout: only the primary is stored, everything else follows it.
    const last = p.slides[2];
    expect(Object.keys(last.layouts)).toEqual(['iphone']);
    expect(devices(resolveLayout(p, last, 'ipad'))[0].frame).toBe('ipad');
    expect(devices(resolveLayout(p, last, 'mac'))[0].frame).toBe('macbook');
    expect(resolveLayout(p, last, 'ipad')).toEqual(adaptLayout(last.layouts.iphone!, FAMILIES.iphone.design, FAMILIES.ipad.design, 'ipad'));
  });

  it('stores the tall design of the template for phones when the primary family is not a phone', () => {
    const q = projectFromTemplate(template, { ...opts, families: ['mac', 'iphone', 'android-phone', 'play-feature'] });
    const s0 = q.slides[0];
    expect(Object.keys(s0.layouts).sort()).toEqual(['android-phone', 'iphone', 'mac']);
    expect(devices(s0.layouts['android-phone']!)[0].frame).toBe('android-phone');
    // The feature graphic shares the Mac's shape and follows it.
    expect(devices(resolveLayout(q, s0, 'play-feature'))[0].frame).toBe('android-phone');
  });

  it('keeps at most 10 slides', () => {
    const big = sampleTemplate(14);
    expect(projectFromTemplate(big, opts).slides).toHaveLength(10);
  });

  it('copies template assets and repairs bad options', () => {
    const t: Template = { ...sampleTemplate(1), assets: { [assetId(9)]: assetInfo(9) } };
    t.slides[0].layouts.tall.elements.push({ id: 'img', kind: 'image', x: 0.5, y: 0.5, rotation: 0, opacity: 1, assetId: assetId(9), width: 0.3, cornerRadius: 0, shadow: null });
    const q = projectFromTemplate(t, { name: '   ', families: ['watch' as never], languages: ['not a code'] });
    expect(q.assets).toEqual(t.assets);
    expect(q.assets).not.toBe(t.assets);
    expect(q.families).toEqual(['iphone']);
    expect(q.languages).toEqual(['en-US']);
    expect(q.name).toBe('Sample Glow');
    expect(q.slides[0].layouts.iphone!.elements.some((e) => e.kind === 'image' && (e as ImageElement).assetId === assetId(9))).toBe(true);
  });

  it('survives a template without slides', () => {
    const q = projectFromTemplate({ ...sampleTemplate(1), slides: [] }, opts);
    expect(q.slides).toHaveLength(1);
    expect(Object.keys(q.slides[0].layouts)).toEqual(opts.families);
  });
});

describe('templateFromProject', () => {
  function sourceProject(): Project {
    const p = blankProject('Shop', ['android-phone', 'iphone', 'ipad', 'mac'], ['ar-SA', 'en-US']);
    p.assets = { [assetId(1)]: assetInfo(1), [assetId(2)]: assetInfo(2), [assetId(3)]: assetInfo(3) };
    p.slides[0].texts['ar-SA'] = { headline: 'متجر', subtitle: 'تسوق' };
    p.slides[0].texts['en-US'] = { headline: 'Shop', subtitle: 'Buy' };
    p.slides[0].shots = { iphone: { main: { 'en-US': assetId(1) } } };
    p.slides[0].layouts['android-phone']!.elements.push({ id: 'logo', kind: 'image', x: 0.5, y: 0.9, rotation: 0, opacity: 1, assetId: assetId(2), width: 0.2, cornerRadius: 0, shadow: null });
    p.theme.background = { fill: { type: 'image', assetId: assetId(3), fit: 'cover', opacity: 1, blur: 0, tint: null }, pattern: null };
    return p;
  }

  const meta = { id: '', name: 'My Shop Look', author: '  Bsher ', description: 'Warm\r\nand bold', category: 'bold' as const, tags: ['Shop', 'shop', '', 'x'.repeat(80)] };

  it('keeps the design and base-language copy, drops screenshots', () => {
    const p = sourceProject();
    const t = templateFromProject(p, meta);
    expect(t.format).toBe('wajha.template');
    expect(t.id).toBe('my-shop-look');
    expect(t.author).toBe('Bsher');
    expect(t.description).toBe('Warm\nand bold');
    expect(t.tags).toEqual(['shop', 'x'.repeat(40)]);
    expect(t.slides).toHaveLength(3);
    expect(t.slides[0].texts).toEqual({ 'en-US': { headline: 'متجر', subtitle: 'تسوق' }, 'ar-SA': { headline: 'متجر', subtitle: 'تسوق' } });
    expect(JSON.stringify(t)).not.toContain('shots');
    // Screenshot-only assets are dropped, design assets kept.
    expect(Object.keys(t.assets).sort()).toEqual([assetId(2), assetId(3)].sort());
  });

  it('stores one layout per class on the reference canvas, first family per class wins', () => {
    const p = sourceProject();
    const t = templateFromProject(p, meta);
    const s0 = t.slides[0];
    // tall comes from android-phone (listed first), adapted to the iPhone canvas.
    const fromAndroid = adaptLayout(resolveLayout(p, p.slides[0], 'android-phone'), FAMILIES['android-phone'].design, FAMILIES.iphone.design, 'iphone');
    expect(s0.layouts.tall).toEqual(fromAndroid);
    expect(devices(s0.layouts.tall)[0].frame).toBe('iphone');
    expect(s0.layouts.tablet).toEqual(resolveLayout(p, p.slides[0], 'ipad'));
    expect(s0.layouts.wide).toEqual(resolveLayout(p, p.slides[0], 'mac'));
    expect(REFERENCE_FAMILY).toEqual({ tall: 'iphone', tablet: 'ipad', wide: 'mac' });
  });

  it('derives a tall layout for projects without a portrait phone family', () => {
    const p = blankProject('Mac only', ['mac'], ['en-US']);
    const t = templateFromProject(p, { ...meta, id: 'mac-only' });
    expect(t.id).toBe('mac-only');
    expect(devices(t.slides[0].layouts.tall)[0].frame).toBe('iphone');
    expect(t.slides[0].layouts.wide).toBeDefined();
    expect(t.slides[0].layouts.tablet).toBeUndefined();
  });

  it('round trips through validation and back into a project', () => {
    const t = templateFromProject(sourceProject(), meta);
    const valid = validateTemplate(JSON.parse(JSON.stringify(t)));
    expect(valid).toEqual(t);
    const again = projectFromTemplate(valid, { name: 'Again', families: [...FAMILY_ORDER], languages: ['en-US'] });
    expect(again.slides).toHaveLength(3);
    expect(validateProject(JSON.parse(JSON.stringify(again)))).toEqual(again);
  });

  it('caps slides at 10', () => {
    const p = blankProject('Many', ['iphone'], ['en-US']);
    p.slides = Array.from({ length: 12 }, (_, i) => ({ ...p.slides[0], id: `s${i}` }));
    expect(templateFromProject(p, meta).slides).toHaveLength(10);
  });
});

describe('helpers', () => {
  it('derives kebab-case template ids', () => {
    expect(templateIdFrom('ok-id', 'x')).toBe('ok-id');
    expect(templateIdFrom('', 'Café Déjà Vu!')).toBe('cafe-deja-vu');
    expect(templateIdFrom('Bad Id', '')).toBe('bad-id');
    expect(templateIdFrom('', 'واجهة')).toMatch(/^t[0-9a-z]{12}$/);
    expect(templateIdFrom('', 'a'.repeat(100))).toHaveLength(64);
  });

  it('never derives a template id Windows cannot use as a folder name', () => {
    expect(templateIdFrom('', 'Aux')).toMatch(/^t[0-9a-z]{12}$/);
    expect(templateIdFrom('nul', 'Con')).toMatch(/^t[0-9a-z]{12}$/);
    expect(templateIdFrom('nul', 'Console')).toBe('console');
  });

  it('collects design assets from backgrounds, images and shape fills', () => {
    const theme = defaultTheme();
    const layout = defaultLayout('iphone', theme);
    layout.background = { fill: { type: 'image', assetId: 'bg', fit: 'cover', opacity: 1, blur: 0, tint: null }, pattern: null };
    layout.elements.push({ id: 's', kind: 'shape', shape: 'rect', x: 0, y: 0, rotation: 0, opacity: 1, width: 1, height: 1, fill: { type: 'image', assetId: 'fill', fit: 'tile', opacity: 1, blur: 0, tint: null }, radius: 0, stroke: 0, blur: 0, seed: 0 });
    layout.elements.push({ id: 'i', kind: 'image', x: 0, y: 0, rotation: 0, opacity: 1, assetId: 'img', width: 1, cornerRadius: 0, shadow: null });
    expect([...designAssets(theme, [layout])].sort()).toEqual(['bg', 'fill', 'img']);
  });
});

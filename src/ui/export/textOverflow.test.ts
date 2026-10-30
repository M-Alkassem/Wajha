/**
 * The export summary's text check: which checks a plan needs, that the
 * pre-export layout reports exactly what the export render reports, and how
 * results become summary rows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { registerBundledFonts, testCanvas } from '../../engine/testing/canvas.node';
import type { ExportJob } from '../../export/types';
import { blankProject } from '../../model/defaults';
import type { FamilyId, LangCode, Project, TextElement } from '../../model/types';
import { renderProjectSlide } from '../../templates/testing/render.node';
import { checkKey, overflowChecks, overflowingTexts, textOverflowRows, type OverflowCheck } from './textOverflow';

const LONG_EN = [
  'Plan every trip with friends, share the costs, vote on places to eat, and keep every ticket, booking and receipt in one tidy place.',
  'Offline maps, packing lists, live flight times and a shared photo album come along, so nobody has to ask where the hotel was again.',
  'Everything syncs in seconds, in every language, on every device you own.',
].join(' ');
const LONG_AR = 'خطط لكل رحلة مع أصدقائك وتقاسم التكاليف وصوّت على أماكن الطعام واحتفظ بكل تذكرة وحجز وإيصال في مكان واحد مرتب وسهل الوصول';

const job = (over: Partial<ExportJob>): ExportJob => ({ family: 'iphone', sizeId: 'ios-6.9', width: 1320, height: 2868, lang: 'en-US', slideIndex: 0, path: 'x.png', ...over });

describe('overflowChecks', () => {
  it('checks each slide, family and language once per canvas size, in plan order', () => {
    const jobs = [
      job({}),
      job({ sizeId: 'ios-6.9', path: 'again.png' }),
      job({ sizeId: 'ios-6.3', width: 1206, height: 2622 }),
      job({ lang: 'ar-SA' }),
      job({ family: 'mac', sizeId: 'mac', width: 2880, height: 1800, slideIndex: 1 }),
    ];
    expect(overflowChecks(jobs)).toEqual([
      { family: 'iphone', lang: 'en-US', slideIndex: 0, unit: 1320 },
      { family: 'iphone', lang: 'en-US', slideIndex: 0, unit: 1206 },
      { family: 'iphone', lang: 'ar-SA', slideIndex: 0, unit: 1320 },
      // The shorter side: a wide canvas is measured by its height.
      { family: 'mac', lang: 'en-US', slideIndex: 1, unit: 1800 },
    ]);
    expect(overflowChecks([])).toEqual([]);
  });
});

describe('overflowingTexts', () => {
  let project: Project;
  let ids: { headline: string; subtitle: string };

  beforeAll(() => {
    registerBundledFonts();
    project = blankProject('Trips', ['iphone', 'android-phone'], ['en-US', 'ar-SA', 'de-DE']);
    const [first, second] = project.slides;
    first.texts['en-US'] = { headline: 'Plan your *week*', subtitle: '' };
    first.texts['ar-SA'] = { headline: LONG_AR, subtitle: '' };
    // German has no texts of its own: the English ones stand in.
    second.texts['en-US'] = { headline: 'Trips', subtitle: LONG_EN, note: LONG_EN, faded: LONG_EN, free: LONG_EN };
    second.texts['ar-SA'] = { headline: 'رحلات', subtitle: 'كل شيء في مكان واحد' };
    delete second.texts['de-DE'];
    // Slide 1 on Android follows the iPhone layout (adapted), slide 2 has its own.
    delete first.layouts['android-phone'];
    const layout = second.layouts.iphone;
    const subtitle = layout?.elements.find((e): e is TextElement => e.kind === 'text' && e.key === 'subtitle');
    const headline = layout?.elements.find((e): e is TextElement => e.kind === 'text' && e.key === 'headline');
    if (!layout || !subtitle || !headline) throw new Error('blank slide without texts');
    ids = { headline: headline.id, subtitle: subtitle.id };
    layout.elements.push(
      { ...subtitle, id: 'hidden', key: 'note', hidden: true },
      { ...subtitle, id: 'faded', key: 'faded', opacity: 0 },
      { ...subtitle, id: 'free', key: 'free', style: { ...subtitle.style, maxLines: 0 } },
    );
  });

  it('reports exactly what the export render reports', () => {
    const { ctx } = testCanvas(1, 1);
    const seen: string[] = [];
    for (const family of ['iphone', 'android-phone'] as FamilyId[]) {
      for (const lang of project.languages) {
        for (const slideIndex of [0, 1]) {
          const rendered = renderProjectSlide(project, slideIndex, family, lang, 320);
          const check: OverflowCheck = { family, lang, slideIndex, unit: Math.min(rendered.width, rendered.height) };
          const found = overflowingTexts(ctx, project, check);
          expect(found.toSorted(), checkKey(check)).toEqual(rendered.result.overflowingText.toSorted());
          if (found.length) seen.push(`${family} ${lang} ${slideIndex + 1}`);
        }
      }
    }
    // The cases that matter did come up: long Arabic, a long English text and the German fallback to it.
    expect(seen).toEqual(expect.arrayContaining(['iphone ar-SA 1', 'android-phone ar-SA 1', 'iphone en-US 2', 'iphone de-DE 2']));
    expect(seen).not.toContain('iphone en-US 1');
  });

  it('skips hidden, transparent and unlimited texts, and missing slides', () => {
    const { ctx } = testCanvas(1, 1);
    const found = overflowingTexts(ctx, project, { family: 'iphone', lang: 'en-US', slideIndex: 1, unit: 1320 });
    expect(found).toEqual([ids.subtitle]);
    expect(overflowingTexts(ctx, project, { family: 'iphone', lang: 'en-US', slideIndex: 9, unit: 1320 })).toEqual([]);
  });
});

describe('textOverflowRows', () => {
  const project = blankProject('Rows', ['iphone', 'android-phone', 'ipad'], ['en-US', 'ar-SA']);
  const check = (family: FamilyId, lang: LangCode, slideIndex: number, unit = 1320): OverflowCheck => ({ family, lang, slideIndex, unit });
  const checks = [
    ...[0, 1, 2].flatMap((i) => [check('iphone', 'en-US', i), check('iphone', 'ar-SA', i)]),
    check('iphone', 'ar-SA', 0, 1206),
    ...[0, 1].flatMap((i) => [check('android-phone', 'en-US', i, 1080), check('android-phone', 'ar-SA', i, 1080)]),
    check('ipad', 'en-US', 0, 2064),
  ];

  it('makes one row per language, or one for all languages when they share the slides', () => {
    const hits = new Map<string, string[]>([
      [checkKey(check('iphone', 'en-US', 2)), ['sub']],
      [checkKey(check('iphone', 'ar-SA', 1)), ['head', 'sub']],
      [checkKey(check('iphone', 'ar-SA', 2)), []],
      // Overflowing at one of the sizes is enough.
      [checkKey(check('iphone', 'ar-SA', 0, 1206)), ['head']],
      [checkKey(check('android-phone', 'en-US', 1, 1080)), ['sub']],
      [checkKey(check('android-phone', 'ar-SA', 1, 1080)), ['head']],
      [checkKey(check('ipad', 'en-US', 0, 2064)), ['head']],
    ]);
    expect(textOverflowRows(project, checks, hits)).toEqual([
      // Base language first, slides in order, the first text that does not fit is the one to select.
      { families: ['iphone'], lang: 'en-US', slides: [{ slideIndex: 2, lang: 'en-US', elementId: 'sub' }] },
      {
        families: ['iphone'],
        lang: 'ar-SA',
        slides: [
          { slideIndex: 0, lang: 'ar-SA', elementId: 'head' },
          { slideIndex: 1, lang: 'ar-SA', elementId: 'head' },
        ],
      },
      // Every exported language overflows on slide 2: one row, jumping to the base language.
      { families: ['android-phone'], lang: null, slides: [{ slideIndex: 1, lang: 'en-US', elementId: 'sub' }] },
      // A family exported in one language names it.
      { families: ['ipad'], lang: 'en-US', slides: [{ slideIndex: 0, lang: 'en-US', elementId: 'head' }] },
    ]);
  });

  it('shares a row between devices with the same slides in the same language', () => {
    const hits = new Map<string, string[]>([
      [checkKey(check('iphone', 'ar-SA', 1)), ['head']],
      [checkKey(check('android-phone', 'ar-SA', 1, 1080)), ['other']],
      [checkKey(check('android-phone', 'en-US', 0, 1080)), ['sub']],
      [checkKey(check('ipad', 'en-US', 0, 2064)), ['sub']],
    ]);
    expect(textOverflowRows(project, checks, hits)).toEqual([
      // The chips go to the first device, with its text.
      { families: ['iphone', 'android-phone'], lang: 'ar-SA', slides: [{ slideIndex: 1, lang: 'ar-SA', elementId: 'head' }] },
      { families: ['android-phone', 'ipad'], lang: 'en-US', slides: [{ slideIndex: 0, lang: 'en-US', elementId: 'sub' }] },
    ]);
  });

  it('leaves out checks without a result and texts that fit', () => {
    expect(textOverflowRows(project, checks, new Map())).toEqual([]);
    const fits = new Map(checks.map((c) => [checkKey(c), [] as string[]]));
    expect(textOverflowRows(project, checks, fits)).toEqual([]);
  });
});

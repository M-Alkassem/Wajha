import { describe, expect, it, vi } from 'vitest';
import { FAMILIES } from '../model/catalog';
import { resolveLayout } from '../model/resolve';
import type { ExportSettings, ExportStructure, FamilyId, Project, Slide, SlideLayout } from '../model/types';
import { deepFreeze, device, layout, project, slide, text } from './fixtures.node';
import { planExport } from './plan';

// resolveLayout belongs to the model package (implemented in parallel): stand in with the stored layout.
vi.mock('../model/resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../model/resolve')>();
  return {
    ...actual,
    resolveLayout: vi.fn((_project: Project, s: Slide, family: FamilyId): SlideLayout => s.layouts[family] ?? { background: null, elements: [] }),
  };
});

const settings = (partial: Partial<ExportSettings> = {}): ExportSettings => ({
  sizes: [],
  languages: [],
  format: 'png',
  jpegQuality: 0.9,
  structure: 'stores',
  ...partial,
});

const ALL: FamilyId[] = ['iphone', 'ipad', 'mac', 'android-phone', 'android-tablet', 'play-feature'];

/** A slide with a headline and a device in every family, screenshots only in `shotLangs`. */
function shotSlide(i: number, families: FamilyId[] = ALL, shotLangs: string[] = ['en-US']): Slide {
  const layouts: Slide['layouts'] = {};
  const shots: Slide['shots'] = {};
  for (const f of families) {
    layouts[f] = layout(text(`t${i}`, 'headline'), device(`d${i}`));
    shots[f] = { main: Object.fromEntries(shotLangs.map((l) => [l, `${String(i).padStart(64, '0')}.png`])) };
  }
  return slide({ id: `s${i}`, texts: { 'en-US': { headline: `Slide ${i}` } }, layouts, shots });
}

const slides = (n: number, families?: FamilyId[], shotLangs?: string[]) => Array.from({ length: n }, (_, i) => shotSlide(i, families, shotLangs));
const nn = (i: number) => String(i + 1).padStart(2, '0');
const paths = (p: { jobs: { path: string }[] }) => p.jobs.map((j) => j.path);

describe('planExport: sizes and languages', () => {
  it("uses each enabled family's default sizes when none are selected", () => {
    const p = project({ families: ['iphone', 'android-phone'], slides: slides(2) });
    const plan = planExport(p, settings());
    const expectedSizes = ['iphone', 'android-phone'].flatMap((f) => FAMILIES[f as FamilyId].sizes.filter((s) => s.default).map((s) => s.id));
    expect([...new Set(plan.jobs.map((j) => j.sizeId))]).toEqual(expectedSizes);
    expect(expectedSizes).toContain('ios-6.9');
    expect(expectedSizes).toContain('play-phone');
    expect(plan.jobs).toHaveLength(expectedSizes.length * 2);
  });

  it('keeps selected sizes of enabled families only and ignores unknown ids', () => {
    const p = project({ families: ['iphone'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.5', 'nope', 'play-phone', 'ios-6.5', 'ipad-13'] }));
    expect(plan.jobs.map((j) => j.sizeId)).toEqual(['ios-6.5']);
  });

  it('falls back to defaults when no selected size survives the filter', () => {
    const p = project({ families: ['android-phone'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'ghost'] }));
    expect(plan.jobs.map((j) => j.sizeId)).toEqual(FAMILIES['android-phone'].sizes.filter((s) => s.default).map((s) => s.id));
  });

  it('orders sizes by the catalog, not by the selection order', () => {
    const p = project({ families: ['iphone'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.1', 'ios-6.9', 'ios-6.5'] }));
    expect(plan.jobs.map((j) => j.sizeId)).toEqual(['ios-6.9', 'ios-6.5', 'ios-6.1']);
  });

  it('intersects the selected languages with the project languages, in project order', () => {
    const p = project({ languages: ['en-US', 'ar-SA', 'de-DE'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9'], languages: ['de-DE', 'ja', 'en-US'] }));
    expect(plan.jobs.map((j) => j.lang)).toEqual(['en-US', 'de-DE']);
  });

  it('exports every project language when the selection is empty or matches none', () => {
    const p = project({ languages: ['en-US', 'ar-SA'], slides: slides(1) });
    expect(planExport(p, settings({ sizes: ['ios-6.9'] })).jobs.map((j) => j.lang)).toEqual(['en-US', 'ar-SA']);
    expect(planExport(p, settings({ sizes: ['ios-6.9'], languages: ['ja'] })).jobs.map((j) => j.lang)).toEqual(['en-US', 'ar-SA']);
  });

  it('orders families as the project lists them and dedupes repeated entries', () => {
    const p = project({ families: ['android-phone', 'iphone', 'android-phone'], languages: ['en-US', 'en-US'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'play-phone'] }));
    expect(plan.jobs.map((j) => `${j.family}:${j.lang}`)).toEqual(['android-phone:en-US', 'iphone:en-US']);
  });

  it('ignores unknown family ids from damaged data', () => {
    const p = project({ families: ['iphone', 'toaster' as FamilyId], slides: slides(1) });
    expect(planExport(p, settings()).jobs.every((j) => j.family === 'iphone')).toBe(true);
  });

  it('fills every job field from the size and uses the project language code', () => {
    const p = project({ languages: ['en-US', 'he'], families: ['android-phone'], slides: slides(1) });
    const [, hebrew] = planExport(p, settings({ sizes: ['play-phone-hd'] })).jobs;
    expect(hebrew).toEqual({ family: 'android-phone', sizeId: 'play-phone-hd', width: 1440, height: 2560, lang: 'he', slideIndex: 0, path: 'Google Play/iw-IL/Phone (1440)/01.png' });
  });

  it('uses .jpg for JPEG exports', () => {
    const plan = planExport(project({ slides: slides(1) }), settings({ sizes: ['ios-6.9'], format: 'jpeg' }));
    expect(paths(plan)).toEqual(['App Store/en-US/iPhone 6.9/01.jpg']);
  });

  it('returns an empty plan for a project without slides or languages', () => {
    expect(planExport(project({ slides: [] }), settings())).toEqual({ jobs: [], warnings: [] });
    expect(planExport(project({ slides: slides(2), languages: [] }), settings())).toEqual({ jobs: [], warnings: [] });
    expect(planExport(project({ slides: slides(2), families: [] }), settings())).toEqual({ jobs: [], warnings: [] });
  });

  it('is deterministic and does not mutate its input', () => {
    const p = deepFreeze(project({ families: ALL, languages: ['en-US', 'ar-SA', 'fa'], slides: slides(9) }));
    const s = deepFreeze(settings({ sizes: ['ios-6.9', 'play-phone', 'play-feature', 'mac-2880'] }));
    const a = planExport(p, s);
    expect(planExport(p, s)).toEqual(a);
  });
});

describe('planExport: store limits', () => {
  it('caps slides per family and warns once per family', () => {
    const p = project({ families: ['iphone', 'android-phone'], slides: slides(12) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'ios-6.5', 'play-phone'] }));
    const count = (sizeId: string) => plan.jobs.filter((j) => j.sizeId === sizeId).length;
    expect(count('ios-6.9')).toBe(10);
    expect(count('ios-6.5')).toBe(10);
    expect(count('play-phone')).toBe(8);
    const tooMany = plan.warnings.filter((w) => w.kind === 'too-many-slides');
    expect(tooMany.map((w) => w.family)).toEqual(['iphone', 'android-phone']);
    expect(tooMany[0].message).toBe('App Store accepts up to 10 iPhone screenshots per language; slides 11–12 are not exported for iPhone.');
    expect(tooMany[1].message).toBe('Google Play accepts up to 8 Android phone screenshots per language; slides 9–12 are not exported for Android phone.');
  });

  it('words a single extra slide and the one-slide feature graphic naturally', () => {
    const p = project({ families: ['android-phone', 'play-feature'], slides: slides(9) });
    const plan = planExport(p, settings());
    const messages = plan.warnings.filter((w) => w.kind === 'too-many-slides').map((w) => w.message);
    expect(messages).toEqual([
      'Google Play accepts up to 8 Android phone screenshots per language; slide 9 is not exported for Android phone.',
      'The Play feature graphic uses slide 1 only; slides 2–9 are not exported for it.',
    ]);
    expect(plan.jobs.filter((j) => j.family === 'play-feature').map((j) => j.slideIndex)).toEqual([0]);
  });

  it('does not warn about families that export nothing', () => {
    const p = project({ families: ['iphone', 'android-phone'], languages: ['fa'], slides: slides(12) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9'] }));
    expect(plan.jobs).toEqual([]);
    expect(plan.warnings.map((w) => w.kind)).toEqual(['no-locale-code']);
  });

  it('skips languages a store does not offer, with one warning per store and language', () => {
    const p = project({ families: ['iphone', 'ipad', 'android-phone'], languages: ['en-US', 'fa', 'or-IN'], slides: slides(2) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'ios-6.5', 'ipad-13', 'play-phone'] }));
    expect(plan.jobs.filter((j) => j.lang === 'fa').every((j) => j.family === 'android-phone')).toBe(true);
    expect(plan.jobs.filter((j) => j.lang === 'or-IN').every((j) => j.family !== 'android-phone')).toBe(true);
    expect(plan.jobs.filter((j) => j.lang === 'fa').map((j) => j.path)).toEqual(['Google Play/fa/Phone/01.png', 'Google Play/fa/Phone/02.png']);
    const locale = plan.warnings.filter((w) => w.kind === 'no-locale-code');
    expect(locale).toEqual([
      { kind: 'no-locale-code', lang: 'fa', message: 'App Store has no Persian localization, so Persian is skipped for App Store sizes.' },
      { kind: 'no-locale-code', lang: 'or-IN', message: 'Google Play has no Odia localization, so Odia is skipped for Google Play sizes.' },
    ]);
  });

  it('skips a language that would share a store folder with another one', () => {
    // "ar" is not a catalog code: its Google Play code "ar" is already Arabic's.
    const p = project({ families: ['iphone', 'android-phone'], languages: ['ar-SA', 'ar'], slides: slides(1, ALL, ['ar-SA']) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'play-phone'] }));
    expect(paths(plan)).toEqual(['App Store/ar-SA/iPhone 6.9/01.png', 'App Store/ar/iPhone 6.9/01.png', 'Google Play/ar/Phone/01.png']);
    expect(plan.warnings).toEqual([
      { kind: 'no-locale-code', lang: 'ar', message: 'ar would be written to the same Google Play folder as Arabic, so ar is skipped for Google Play sizes.' },
    ]);
  });

  it('treats paths that differ only in case as the same file (APFS, NTFS)', () => {
    const p = project({ languages: ['en-US', 'en-us'], slides: slides(1) });
    const plan = planExport(p, settings({ sizes: ['ios-6.9'], structure: 'flat' }));
    expect(paths(plan)).toEqual(['ios-6.9/en-US/01.png']);
    expect(plan.warnings[0]).toMatchObject({ kind: 'no-locale-code', lang: 'en-us' });
  });

  it('keeps one phone size per fastlane supply folder', () => {
    const p = project({ families: ['android-phone'], slides: slides(2) });
    const fastlane = planExport(p, settings({ sizes: ['play-phone', 'play-phone-hd'], structure: 'fastlane' }));
    expect(fastlane.jobs.map((j) => j.sizeId)).toEqual(['play-phone', 'play-phone']);
    expect(fastlane.warnings).toEqual([
      {
        kind: 'too-many-slides',
        family: 'android-phone',
        message: 'Phone 1440 × 2560 would overwrite the Phone 1080 × 1920 files in this folder structure, so it is skipped. Export it with the "stores" or "flat" structure instead.',
      },
    ]);
    const stores = planExport(p, settings({ sizes: ['play-phone', 'play-phone-hd'], structure: 'stores' }));
    expect(stores.jobs).toHaveLength(4);
    expect(stores.warnings).toEqual([]);
  });
});

describe('planExport: fastlane deliver screenshot sets', () => {
  it('keeps one size per App Store Connect screenshot set', () => {
    const p = project({ families: ['iphone', 'mac'], languages: ['en-US', 'ja'], slides: slides(2) });
    const sizes = ['ios-6.9', 'ios-6.9-b', 'ios-6.3', 'mac-1280', 'mac-2880'];
    const fastlane = planExport(p, settings({ sizes, structure: 'fastlane' }));
    expect([...new Set(fastlane.jobs.map((j) => j.sizeId))]).toEqual(['ios-6.9', 'ios-6.3', 'mac-2880']);
    expect(fastlane.warnings).toEqual([
      {
        kind: 'too-many-slides',
        family: 'iphone',
        message: 'iPhone 6.9″ (1290) goes into the same App Store Connect screenshot set as iPhone 6.9″ when fastlane uploads it, so it is skipped. Export it with the "stores" or "flat" structure instead.',
      },
      {
        kind: 'too-many-slides',
        family: 'mac',
        message: 'Mac 1280 × 800 goes into the same App Store Connect screenshot set as Mac 2880 × 1800 when fastlane uploads it, so it is skipped. Export it with the "stores" or "flat" structure instead.',
      },
    ]);
    for (const structure of ['stores', 'flat'] as const) {
      const plan = planExport(p, settings({ sizes, structure }));
      expect(new Set(plan.jobs.map((j) => j.sizeId)).size, structure).toBe(5);
      expect(plan.warnings, structure).toEqual([]);
    }
  });

  it('never trips over the default sizes', () => {
    const p = project({ families: ALL, languages: ['en-US', 'ar-SA'], slides: slides(3) });
    const plan = planExport(p, settings({ structure: 'fastlane' }));
    // Only the feature graphic's "slide 1 only" note; no size is skipped.
    expect(plan.warnings.map((w) => w.family)).toEqual(['play-feature']);
    const defaults = ALL.flatMap((f) => FAMILIES[f].sizes.filter((s) => s.default).map((s) => s.id));
    expect([...new Set(plan.jobs.map((j) => j.sizeId))]).toEqual(defaults);
  });
});

describe('planExport: missing screenshots', () => {
  it('warns per slide, family and language when no screenshot resolves, even after fallback', () => {
    const s0 = slide({ id: 'a', layouts: { iphone: layout(device('d')) }, shots: { iphone: { main: { 'en-US': 'x.png' } } } });
    const s1 = slide({ id: 'b', layouts: { iphone: layout(device('d')) } });
    const p = project({ languages: ['en-US', 'ar-SA'], slides: [s0, s1] });
    const plan = planExport(p, settings({ sizes: ['ios-6.9'] }));
    expect(plan.warnings).toEqual([
      {
        kind: 'missing-screenshot',
        slideIndex: 1,
        family: 'iphone',
        lang: 'en-US',
        message: 'Slide 2 has no iPhone screenshot in English (US). The device shows a placeholder screen until you drop a screenshot onto it.',
      },
      {
        kind: 'missing-screenshot',
        slideIndex: 1,
        family: 'iphone',
        lang: 'ar-SA',
        message: 'Slide 2 has no iPhone screenshot in Arabic or in the base language (English (US)). The device shows a placeholder screen until you drop a screenshot onto it.',
      },
    ]);
  });

  it('accepts a screenshot in the language itself when the base language has none', () => {
    const s = slide({ layouts: { iphone: layout(device('d')) }, shots: { iphone: { main: { 'ar-SA': 'x.png' } } } });
    const plan = planExport(project({ languages: ['en-US', 'ar-SA'], slides: [s] }), settings({ sizes: ['ios-6.9'] }));
    expect(plan.warnings.map((w) => w.lang)).toEqual(['en-US']);
  });

  it('counts every visible device without a screenshot, ignoring hidden and transparent ones', () => {
    const s = slide({
      layouts: {
        iphone: layout(device('a'), device('b', { slot: 'second' }), device('c', { slot: 'third', hidden: true }), device('d', { slot: 'fourth', opacity: 0 }), text('t', 'headline')),
      },
    });
    const plan = planExport(project({ slides: [s] }), settings({ sizes: ['ios-6.9'] }));
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].message).toBe('Slide 1 has no iPhone screenshot in English (US). 2 devices show a placeholder screen until you drop a screenshot onto them.');
  });

  it('checks each family against its own screenshots and resolves its layout once per slide', () => {
    vi.mocked(resolveLayout).mockClear();
    const s = slide({
      layouts: { iphone: layout(device('d')), 'android-phone': layout(device('d', { frame: 'android-phone' })) },
      shots: { iphone: { main: { 'en-US': 'x.png' } } },
    });
    const p = project({ families: ['iphone', 'android-phone'], languages: ['en-US', 'de-DE', 'ja'], slides: [s] });
    const plan = planExport(p, settings({ sizes: ['ios-6.9', 'ios-6.5', 'play-phone', 'play-phone-hd'] }));
    expect(plan.warnings.map((w) => `${w.family}:${w.lang}`)).toEqual(['android-phone:en-US', 'android-phone:de-DE', 'android-phone:ja']);
    expect(vi.mocked(resolveLayout).mock.calls.map(([, sl, f]) => `${sl.id}:${f}`)).toEqual(['slide:iphone', 'slide:android-phone']);
  });

  it('does not report slides or languages that are not exported', () => {
    // Slide 11 is over the iPhone limit and Persian is not on the App Store.
    const list = [...slides(10, ['iphone']), slide({ id: 'extra', layouts: { iphone: layout(device('d')) } })];
    const p = project({ languages: ['en-US', 'fa'], slides: list });
    const plan = planExport(p, settings({ sizes: ['ios-6.9'] }));
    expect(plan.warnings.map((w) => w.kind)).toEqual(['no-locale-code', 'too-many-slides']);
  });

  it('lists warnings by kind: locale codes, slide limits, then screenshots', () => {
    const missing = slide({ layouts: { 'android-phone': layout(device('d')) } });
    const p = project({ families: ['android-phone', 'iphone'], languages: ['en-US', 'fa'], slides: [missing, ...slides(9, ['android-phone', 'iphone'])] });
    const plan = planExport(p, settings({ sizes: ['play-phone', 'ios-6.9'] }));
    // The first slide has an Android device only: one screenshot warning per exported language.
    expect(plan.warnings.map((w) => `${w.kind}:${w.family ?? ''}:${w.lang ?? ''}`)).toEqual([
      'no-locale-code::fa',
      'too-many-slides:android-phone:',
      'missing-screenshot:android-phone:en-US',
      'missing-screenshot:android-phone:fa',
    ]);
  });
});

describe('planExport: 10 slides x 5 languages', () => {
  const langs = ['en-US', 'ar-SA', 'he', 'ja', 'fa'];
  const appleLocale: Record<string, string> = { 'en-US': 'en-US', 'ar-SA': 'ar-SA', he: 'he', ja: 'ja' };
  const playLocale: Record<string, string> = { 'en-US': 'en-US', 'ar-SA': 'ar', he: 'iw-IL', ja: 'ja-JP', fa: 'fa' };
  const p = project({ families: ALL, languages: langs, slides: slides(10) });
  const sizes = ['play-feature', 'mac-2880', 'play-tablet-10', 'ipad-13', 'play-tablet-7', 'ios-6.9', 'play-phone'];

  /** [family, size id, stores folder, fastlane supply folder, slide limit] in plan order. */
  const table: [FamilyId, string, string, string, number][] = [
    ['iphone', 'ios-6.9', 'iPhone 6.9', '', 10],
    ['ipad', 'ipad-13', 'iPad 13', '', 10],
    ['mac', 'mac-2880', 'Mac 2880', '', 10],
    ['android-phone', 'play-phone', 'Phone', 'phoneScreenshots', 8],
    ['android-tablet', 'play-tablet-7', 'Tablet 7', 'sevenInchScreenshots', 8],
    ['android-tablet', 'play-tablet-10', 'Tablet 10', 'tenInchScreenshots', 8],
    ['play-feature', 'play-feature', '', 'featureGraphic', 1],
  ];

  function expected(structure: ExportStructure): string[] {
    const out: string[] = [];
    for (const [family, sizeId, folder, supply, limit] of table) {
      const apple = FAMILIES[family].stores[0] === 'app-store';
      for (const lang of langs) {
        if (apple && !appleLocale[lang]) continue;
        for (let i = 0; i < limit; i++) {
          if (structure === 'flat') out.push(`${sizeId}/${lang}/${nn(i)}.png`);
          else if (structure === 'stores') {
            if (apple) out.push(`App Store/${appleLocale[lang]}/${folder}/${nn(i)}.png`);
            else if (family === 'play-feature') out.push(`Google Play/${playLocale[lang]}/Feature graphic.png`);
            else out.push(`Google Play/${playLocale[lang]}/${folder}/${nn(i)}.png`);
          } else if (apple) out.push(`fastlane/screenshots/${appleLocale[lang]}/${nn(i)}_${sizeId}.png`);
          else if (family === 'play-feature') out.push(`fastlane/metadata/android/${playLocale[lang]}/images/featureGraphic.png`);
          else out.push(`fastlane/metadata/android/${playLocale[lang]}/images/${supply}/${nn(i)}.png`);
        }
      }
    }
    return out;
  }

  for (const structure of ['stores', 'fastlane', 'flat'] as const) {
    it(`produces the exact "${structure}" path list`, () => {
      const plan = planExport(p, settings({ sizes, structure }));
      const list = paths(plan);
      expect(list).toEqual(expected(structure));
      expect(list).toHaveLength(3 * 4 * 10 + 3 * 5 * 8 + 5);
      expect(new Set(list.map((x) => x.toLowerCase())).size).toBe(list.length);
      // Base-language screenshots cover every language, so only the store rules warn.
      expect(plan.warnings.map((w) => `${w.kind}:${w.family ?? w.lang}`)).toEqual([
        'no-locale-code:fa',
        'too-many-slides:android-phone',
        'too-many-slides:android-tablet',
        'too-many-slides:play-feature',
      ]);
    });
  }

  it('spot-checks a few literal paths', () => {
    const stores = paths(planExport(p, settings({ sizes, structure: 'stores' })));
    expect(stores).toContain('App Store/he/iPhone 6.9/10.png');
    expect(stores).toContain('Google Play/iw-IL/Tablet 10/08.png');
    expect(stores).toContain('Google Play/ar/Feature graphic.png');
    expect(stores).not.toContain('Google Play/iw-IL/Tablet 10/09.png');
    expect(stores.some((x) => x.startsWith('App Store/fa/'))).toBe(false);
    const fastlane = paths(planExport(p, settings({ sizes, structure: 'fastlane' })));
    expect(fastlane[0]).toBe('fastlane/screenshots/en-US/01_ios-6.9.png');
    expect(fastlane.at(-1)).toBe('fastlane/metadata/android/fa/images/featureGraphic.png');
  });
});

import { describe, expect, it } from 'vitest';
import { planExport } from '../../export/plan';
import type { ExportJob, ExportWarning } from '../../export/types';
import { blankProject } from '../../model/defaults';
import type { Project } from '../../model/types';
import { pathProblem } from '../../platform/paths';
import {
  bytesPerPixel,
  createOverflowCollector,
  defaultSizeIds,
  estimateBytes,
  exportTargetName,
  familySummaries,
  firstSkippedSlide,
  folderTreePreview,
  formatBytes,
  formatDuration,
  groupWarnings,
  initialLanguages,
  initialSizes,
  jobLabel,
  languagesSetting,
  missingShotRows,
  orderSizes,
  pathPrefix,
  planSettings,
  prefixPlan,
  remainingLabel,
  remainingMs,
  selectionProblem,
  sizesSetting,
  toggled,
} from './exportModel';

function demo(over: Partial<Project> = {}): Project {
  return { ...blankProject('Sunny App', ['iphone', 'android-phone'], ['en-US', 'ar-SA']), ...over };
}

const job = (over: Partial<ExportJob> = {}): ExportJob => ({
  family: 'iphone',
  sizeId: 'ios-6.9',
  width: 1320,
  height: 2868,
  lang: 'en-US',
  slideIndex: 0,
  path: 'x.png',
  ...over,
});

describe('size selection', () => {
  it('starts from the enabled families defaults when nothing is saved', () => {
    const p = demo();
    expect(initialSizes(p)).toEqual(['ios-6.9', 'ios-6.3', 'play-phone']);
    expect(defaultSizeIds(['iphone'])).toEqual(['ios-6.9', 'ios-6.3']);
  });

  it('keeps saved sizes of enabled families only, in display order', () => {
    const p = demo({ export: { ...demo().export, sizes: ['play-phone-hd', 'ipad-13', 'ios-6.5'] } });
    expect(initialSizes(p)).toEqual(['ios-6.5', 'play-phone-hd']);
  });

  it('falls back to defaults when every saved size belongs to a disabled family', () => {
    const p = demo({ export: { ...demo().export, sizes: ['ipad-13'] } });
    expect(initialSizes(p)).toEqual(['ios-6.9', 'ios-6.3', 'play-phone']);
  });

  it('saves [] for exactly the defaults and an explicit list otherwise', () => {
    const fams = ['iphone', 'android-phone'] as const;
    expect(sizesSetting(['play-phone', 'ios-6.3', 'ios-6.9'], [...fams])).toEqual([]);
    expect(sizesSetting(['ios-6.9'], [...fams])).toEqual(['ios-6.9']);
    expect(sizesSetting(['play-phone', 'ios-6.1', 'ipad-13'], [...fams])).toEqual(['ios-6.1', 'play-phone']);
  });

  it('orders and filters sizes by family', () => {
    expect(orderSizes(['play-phone', 'nope', 'ios-6.1', 'ios-6.9'], ['iphone', 'android-phone'])).toEqual(['ios-6.9', 'ios-6.1', 'play-phone']);
  });
});

describe('language selection', () => {
  it('starts with saved languages the project still has, else all', () => {
    expect(initialLanguages(demo())).toEqual(['en-US', 'ar-SA']);
    const p = demo({ export: { ...demo().export, languages: ['ar-SA', 'de-DE'] } });
    expect(initialLanguages(p)).toEqual(['ar-SA']);
  });

  it('saves [] when every language is selected', () => {
    expect(languagesSetting(['ar-SA', 'en-US'], ['en-US', 'ar-SA'])).toEqual([]);
    expect(languagesSetting(['ar-SA'], ['en-US', 'ar-SA'])).toEqual(['ar-SA']);
  });

  it('toggles without duplicates', () => {
    expect(toggled(['a'], 'a', true)).toEqual(['a']);
    expect(toggled(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b']);
  });

  it('explains an empty selection', () => {
    expect(selectionProblem([], ['en-US'], 0)).toMatch(/size/);
    expect(selectionProblem(['ios-6.9'], [], 0)).toMatch(/language/);
    expect(selectionProblem(['ios-6.9'], ['en-US'], 0)).toMatch(/Nothing/);
    expect(selectionProblem(['ios-6.9'], ['en-US'], 3)).toBeNull();
  });
});

describe('paths', () => {
  it('puts stores and flat exports into a project folder, fastlane at the root', () => {
    expect(pathPrefix('stores', 'My: App')).toBe('My App/');
    expect(pathPrefix('flat', '')).toBe('Untitled/');
    expect(pathPrefix('fastlane', 'My App')).toBe('');
  });

  it('writes valid paths for a project name with an unpaired surrogate', () => {
    // Names from older or hand-edited files: one bad half must not fail every file of the export.
    const p = { ...demo(), name: 'Sunny \ud83d' };
    for (const structure of ['stores', 'flat'] as const) {
      const plan = prefixPlan(planExport(p, planSettings(initialSizes(p), p.languages, 'png', 0.9, structure)), pathPrefix(structure, p.name));
      expect(plan.jobs.length).toBeGreaterThan(0);
      for (const j of plan.jobs) expect(pathProblem(j.path), j.path).toBeNull();
    }
    expect(exportTargetName(p.name)).toBe('Sunny screenshots');
  });

  it('prefixes every job path', () => {
    const plan = { jobs: [job({ path: 'a/01.png' })], warnings: [] };
    expect(prefixPlan(plan, 'P/').jobs[0].path).toBe('P/a/01.png');
    expect(prefixPlan(plan, '')).toBe(plan);
  });
});

describe('folderTreePreview', () => {
  it('opens the first branch, collapses the next sibling and summarises the rest', () => {
    const p = demo();
    const settings = planSettings(initialSizes(p), p.languages, 'png', 0.9, 'stores');
    const plan = prefixPlan(planExport(p, settings), pathPrefix('stores', p.name));
    const lines = folderTreePreview(plan.jobs.map((j) => j.path));
    expect(lines.map((l) => `${'  '.repeat(l.depth)}${l.kind === 'file' || l.kind === 'folder' ? l.name : l.kind}${l.count ? ` (${l.count})` : ''}`)).toEqual([
      'Sunny App',
      '  App Store',
      '    en-US',
      '      iPhone 6.9',
      '        01.png',
      '        02.png',
      '        more-files (1)',
      '      iPhone 6.3 (3)',
      '    ar-SA (6)',
      '  Google Play (6)',
    ]);
  });

  it('summarises many sibling folders in one line with their file count', () => {
    const paths = ['r/a/1.png', 'r/b/1.png', 'r/c/1.png', 'r/c/2.png', 'r/d/1.png'];
    const lines = folderTreePreview(paths);
    expect(lines.at(-1)).toEqual({ depth: 1, kind: 'more-folders', name: '', count: 2, files: 3 });
  });

  it('caps the number of lines and handles empty input', () => {
    const paths = Array.from({ length: 30 }, (_, i) => `x/${i}/a/b/c/d/e/f/g/h/i/j/k/${i}.png`);
    expect(folderTreePreview(paths, { maxLines: 6 })).toHaveLength(6);
    expect(folderTreePreview([])).toEqual([]);
  });

  it('lists fastlane paths from the repository root', () => {
    const p = demo();
    const plan = planExport(p, planSettings(initialSizes(p), p.languages, 'png', 0.9, 'fastlane'));
    const lines = folderTreePreview(plan.jobs.map((j) => j.path));
    expect(lines[0]).toMatchObject({ kind: 'folder', name: 'fastlane', open: true });
    expect(lines[1]).toMatchObject({ kind: 'folder', name: 'screenshots', depth: 1 });
  });
});

describe('summaries', () => {
  it('counts files, sizes, languages and slides per family', () => {
    const p = demo();
    const plan = planExport(p, planSettings(initialSizes(p), p.languages, 'png', 0.9, 'stores'));
    expect(familySummaries(plan.jobs, [...p.families, 'ipad'])).toEqual([
      { family: 'iphone', files: 12, sizes: 2, languages: 2, slides: 3 },
      { family: 'android-phone', files: 6, sizes: 1, languages: 2, slides: 3 },
      { family: 'ipad', files: 0, sizes: 0, languages: 0, slides: 0 },
    ]);
  });

  it('groups missing screenshots per family and language and keeps the rest by kind', () => {
    const warnings: ExportWarning[] = [
      { kind: 'no-locale-code', message: 'no fa', lang: 'fa' },
      { kind: 'too-many-slides', message: 'too many', family: 'android-phone' },
      { kind: 'missing-screenshot', message: 'm', family: 'iphone', lang: 'en-US', slideIndex: 2 },
      { kind: 'missing-screenshot', message: 'm', family: 'iphone', lang: 'en-US', slideIndex: 0 },
      { kind: 'missing-screenshot', message: 'm', family: 'iphone', lang: 'ar-SA', slideIndex: 1 },
    ];
    const g = groupWarnings(warnings);
    expect(g.missing).toEqual([
      { family: 'iphone', lang: 'en-US', slides: [0, 2] },
      { family: 'iphone', lang: 'ar-SA', slides: [1] },
    ]);
    expect(g.slides).toHaveLength(1);
    expect(g.locales).toHaveLength(1);
    expect(g.count).toBe(5);
  });

  it('merges missing screenshots into one row per family when every language misses the same slides', () => {
    const jobs = [job({ lang: 'en-US' }), job({ lang: 'ar-SA' }), job({ family: 'android-phone', lang: 'en-US' }), job({ family: 'android-phone', lang: 'ar-SA' })];
    const rows = missingShotRows(
      [
        { family: 'iphone', lang: 'en-US', slides: [0, 1] },
        { family: 'iphone', lang: 'ar-SA', slides: [0, 1] },
        { family: 'android-phone', lang: 'en-US', slides: [0, 1] },
        { family: 'android-phone', lang: 'ar-SA', slides: [1] },
      ],
      jobs,
    );
    expect(rows).toEqual([
      { family: 'iphone', lang: null, slides: [0, 1] },
      { family: 'android-phone', lang: 'en-US', slides: [0, 1] },
      { family: 'android-phone', lang: 'ar-SA', slides: [1] },
    ]);
    // A single exported language keeps its name.
    expect(missingShotRows([{ family: 'iphone', lang: 'en-US', slides: [0] }], [job()])).toEqual([{ family: 'iphone', lang: 'en-US', slides: [0] }]);
  });

  it('finds the first slide over a store limit', () => {
    const p = demo();
    expect(firstSkippedSlide(p, 'android-phone')).toBeNull();
    const many = { ...p, slides: Array.from({ length: 9 }, () => p.slides[0]) };
    expect(firstSkippedSlide(many, 'android-phone')).toBe(8);
    expect(firstSkippedSlide(many, 'play-feature')).toBe(1);
  });
});

describe('estimates and labels', () => {
  it('estimates PNG larger than JPEG and JPEG growing with quality', () => {
    const jobs = [job(), job({ slideIndex: 1 })];
    const png = estimateBytes(jobs, 'png', 0.9);
    expect(png).toBe(Math.round(2 * 1320 * 2868 * bytesPerPixel('png', 0.9)));
    expect(estimateBytes(jobs, 'jpeg', 0.6)).toBeLessThan(estimateBytes(jobs, 'jpeg', 0.95));
    expect(estimateBytes(jobs, 'jpeg', 1)).toBeLessThan(png);
    expect(bytesPerPixel('jpeg', Number.NaN)).toBeGreaterThan(0);
  });

  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(820 * 1024)).toBe('820 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
    expect(formatBytes(92 * 1024 * 1024)).toBe('92 MB');
    expect(formatBytes(1010 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.3 GB');
  });

  it('formats durations', () => {
    expect(formatDuration(420)).toBe('0.4 s');
    expect(formatDuration(8240)).toBe('8.2 s');
    expect(formatDuration(42_400)).toBe('42 s');
    expect(formatDuration(65_000)).toBe('1 min 5 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(Number.NaN)).toBe('0.0 s');
  });

  it('estimates the time left once a few files are done', () => {
    expect(remainingMs(1, 10, 1000)).toBeNull();
    expect(remainingMs(2, 10, 1000)).toBe(4000);
    expect(remainingMs(10, 10, 1000)).toBeNull();
    expect(remainingLabel(null)).toBeNull();
    expect(remainingLabel(3000)).toBe('Almost done');
    expect(remainingLabel(21_000)).toBe('About 20 s left');
    expect(remainingLabel(150_000)).toBe('About 3 min left');
  });

  it('labels a job', () => {
    expect(jobLabel({ sizeId: 'ios-6.9', lang: 'ar-SA', slideIndex: 2 })).toBe('iPhone 6.9″ · Arabic · slide 3');
  });
});

describe('createOverflowCollector', () => {
  it('merges reports per slide and element across sizes and languages', () => {
    const p = demo();
    const layout = p.slides[1].layouts.iphone;
    const headline = layout?.elements.find((e) => e.kind === 'text' && e.key === 'headline');
    expect(headline).toBeDefined();
    const c = createOverflowCollector(p);
    c.add(job({ slideIndex: 1, lang: 'ar-SA' }), [headline!.id]);
    c.add(job({ slideIndex: 1, lang: 'ar-SA', sizeId: 'ios-6.3' }), [headline!.id]);
    c.add(job({ slideIndex: 1, lang: 'en-US' }), [headline!.id]);
    c.add(job({ slideIndex: 0 }), []);
    expect(c.list()).toEqual([
      { slideIndex: 1, elementId: headline!.id, label: 'Headline', family: 'iphone', lang: 'ar-SA', langs: ['ar-SA', 'en-US'], sizes: ['iPhone 6.9″', 'iPhone 6.3″'] },
    ]);
  });

  it('names unknown elements generically', () => {
    const c = createOverflowCollector(demo());
    c.add(job(), ['ghost']);
    expect(c.list()[0].label).toBe('Text');
  });
});

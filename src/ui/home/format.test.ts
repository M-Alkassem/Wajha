import { describe, expect, it } from 'vitest';
import {
  archiveFileName,
  archiveKind,
  fitStrip,
  foldForSearch,
  formatEdited,
  gridNeighbor,
  hashVariant,
  isGridKey,
  listFamilies,
  listJoin,
  matchesSearch,
  plural,
  projectInitials,
  relativeEdited,
  shorten,
} from './format';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** A fixed local noon, so calendar-day maths never straddles midnight by accident. */
const NOON = new Date(2026, 9, 30, 12, 0, 0).getTime();

describe('relativeEdited', () => {
  it('says "just now" for the last 45 seconds and for future times', () => {
    expect(relativeEdited(NOON, NOON)).toBe('just now');
    expect(relativeEdited(NOON - 44_000, NOON)).toBe('just now');
    expect(relativeEdited(NOON + 5 * MIN, NOON)).toBe('just now');
  });

  it('counts minutes in the short form without the CLDR period', () => {
    expect(relativeEdited(NOON - 50_000, NOON)).toBe('1 min ago');
    expect(relativeEdited(NOON - 5 * MIN, NOON)).toBe('5 min ago');
    expect(relativeEdited(NOON - 59 * MIN, NOON)).toBe('59 min ago');
  });

  it('counts hours within the day', () => {
    expect(relativeEdited(NOON - HOUR, NOON)).toBe('1 hour ago');
    expect(relativeEdited(NOON - 3 * HOUR, NOON)).toBe('3 hours ago');
  });

  it('uses calendar days, then weeks', () => {
    expect(relativeEdited(NOON - DAY, NOON)).toBe('yesterday');
    expect(relativeEdited(NOON - 3 * DAY, NOON)).toBe('3 days ago');
    expect(relativeEdited(NOON - 8 * DAY, NOON)).toBe('last week');
    expect(relativeEdited(NOON - 15 * DAY, NOON)).toBe('2 weeks ago');
  });

  it('keeps a late-evening edit seen just after midnight in hours', () => {
    const midnight = new Date(2026, 9, 30, 0, 30).getTime();
    expect(relativeEdited(midnight - 2 * HOUR, midnight)).toBe('2 hours ago');
  });

  it('switches to a date after about a month, with the year only when it differs', () => {
    expect(relativeEdited(new Date(2026, 6, 4, 10).getTime(), NOON)).toBe('Jul 4');
    expect(relativeEdited(new Date(2024, 2, 9, 10).getTime(), NOON)).toBe('Mar 9, 2024');
  });

  it('survives garbage', () => {
    expect(relativeEdited(Number.NaN, NOON)).toBe('a while ago');
    expect(formatEdited(NOON - 5 * MIN, NOON)).toBe('Edited 5 min ago');
  });
});

describe('projectInitials', () => {
  it('takes the first letters of the first two words', () => {
    expect(projectInitials('Habit Tracker')).toBe('HT');
    expect(projectInitials('  fitness pulse pro ')).toBe('FP');
    expect(projectInitials('Fitness')).toBe('F');
  });

  it('skips words that start with symbols and splits on punctuation', () => {
    expect(projectInitials('Habit & Co')).toBe('HC');
    expect(projectInitials('chat-lab')).toBe('CL');
    expect(projectInitials('🚀 Launch')).toBe('L');
  });

  it('uses one character for joined scripts and ideographs', () => {
    expect(projectInitials('تطبيق اللياقة')).toBe('ت');
    expect(projectInitials('שלום עולם')).toBe('ש');
    expect(projectInitials('日本 アプリ')).toBe('日');
    expect(projectInitials('Habit تطبيق')).toBe('H');
  });

  it('falls back to the first character, or nothing', () => {
    expect(projectInitials('🚀')).toBe('🚀');
    expect(projectInitials('   ')).toBe('');
    expect(projectInitials('éclair bar')).toBe('ÉB');
  });
});

describe('hashVariant', () => {
  it('is stable and within range', () => {
    expect(hashVariant('abc', 4)).toBe(hashVariant('abc', 4));
    for (const id of ['a', 'b', 'project-1', 'x'.repeat(80)]) {
      const v = hashVariant(id, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
    }
    expect(hashVariant('abc', 0)).toBe(0);
  });

  it('spreads ids over the variants', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => hashVariant(`id-${i}`, 4)));
    expect(seen.size).toBe(4);
  });
});

describe('search', () => {
  it('folds case, accents and Arabic hamza forms', () => {
    expect(foldForSearch('  Café   CRÈME ')).toBe('cafe creme');
    expect(foldForSearch('أحمد')).toBe(foldForSearch('احمد'));
    expect(foldForSearch('مـرحـبـا')).toBe('مرحبا');
  });

  it('needs every word somewhere in the fields', () => {
    expect(matchesSearch('', 'anything')).toBe(true);
    expect(matchesSearch('fit', 'Fitness Pulse')).toBe(true);
    expect(matchesSearch('pulse fit', 'Fitness Pulse')).toBe(true);
    expect(matchesSearch('pulse zen', 'Fitness Pulse')).toBe(false);
    expect(matchesSearch('wajha', 'Sunset', null, undefined, 'by Wajha')).toBe(true);
    expect(matchesSearch('cafe', 'Café')).toBe(true);
  });
});

describe('files', () => {
  it('builds safe archive names', () => {
    expect(archiveFileName('My App', 'wajha')).toBe('My App.wajha');
    expect(archiveFileName('a/b:c', 'wajha-template')).toBe('abc.wajha-template');
    expect(archiveFileName('   ', 'wajha')).toBe('Untitled.wajha');
  });

  it('recognises archives by extension', () => {
    expect(archiveKind('x.wajha')).toBe('project');
    expect(archiveKind('X.WAJHA-TEMPLATE')).toBe('template');
    expect(archiveKind('shot.png')).toBeNull();
    expect(archiveKind('wajha')).toBeNull();
  });
});

describe('wording', () => {
  it('lists families and items naturally', () => {
    expect(listFamilies(['iphone'])).toBe('iPhone');
    expect(listFamilies(['iphone', 'android-phone'])).toBe('iPhone and Android phone');
    expect(listFamilies(['iphone', 'ipad', 'play-feature'])).toBe('iPhone, iPad and Feature graphic');
    expect(listJoin([])).toBe('');
    expect(plural(1, 'slide')).toBe('1 slide');
    expect(plural(3, 'slide')).toBe('3 slides');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});

describe('shorten', () => {
  it('keeps short names and cuts long ones on code points', () => {
    expect(shorten('Habit Tracker')).toBe('Habit Tracker');
    expect(shorten('a'.repeat(70), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(shorten('🚀'.repeat(5), 3)).toBe('🚀🚀…');
    expect(shorten('word   word', 6)).toBe('word…');
  });
});

describe('gridNeighbor', () => {
  // 7 items in 3 columns:  0 1 2 / 3 4 5 / 6
  it('moves left and right across row ends', () => {
    expect(gridNeighbor(2, 'ArrowRight', 7, 3)).toBe(3);
    expect(gridNeighbor(3, 'ArrowLeft', 7, 3)).toBe(2);
    expect(gridNeighbor(0, 'ArrowLeft', 7, 3)).toBeNull();
    expect(gridNeighbor(6, 'ArrowRight', 7, 3)).toBeNull();
  });

  it('moves by rows and lands on the last item below a short row', () => {
    expect(gridNeighbor(1, 'ArrowDown', 7, 3)).toBe(4);
    expect(gridNeighbor(4, 'ArrowDown', 7, 3)).toBe(6);
    expect(gridNeighbor(5, 'ArrowDown', 7, 3)).toBe(6);
    expect(gridNeighbor(6, 'ArrowDown', 7, 3)).toBeNull();
    expect(gridNeighbor(4, 'ArrowUp', 7, 3)).toBe(1);
    expect(gridNeighbor(1, 'ArrowUp', 7, 3)).toBeNull();
  });

  it('jumps with Home and End and tolerates odd input', () => {
    expect(gridNeighbor(4, 'Home', 7, 3)).toBe(0);
    expect(gridNeighbor(4, 'End', 7, 3)).toBe(6);
    expect(gridNeighbor(0, 'Home', 7, 3)).toBeNull();
    expect(gridNeighbor(0, 'ArrowDown', 0, 3)).toBeNull();
    expect(gridNeighbor(99, 'ArrowLeft', 7, 0)).toBe(5);
  });

  it('knows which keys it handles', () => {
    expect(isGridKey('ArrowUp')).toBe(true);
    expect(isGridKey('End')).toBe(true);
    expect(isGridKey('Enter')).toBe(false);
  });
});

describe('fitStrip', () => {
  const box = { w: 300, h: 236, gap: 10 };
  it('shows three tall phone slides', () => {
    const fit = fitStrip(box.w, box.h, 2868 / 1320, 5, box.gap);
    expect(fit.count).toBe(3);
    expect(fit.width * 3 + box.gap * 2).toBeLessThanOrEqual(box.w);
    expect(fit.height).toBeLessThanOrEqual(box.h);
  });

  it('shows two tablets and one wide slide', () => {
    expect(fitStrip(box.w, box.h, 2752 / 2064, 5, box.gap).count).toBe(2);
    const mac = fitStrip(box.w, box.h, 1800 / 2880, 5, box.gap);
    expect(mac.count).toBe(1);
    expect(mac.width).toBe(300);
  });

  it('never shows more slides than exist and survives empty boxes', () => {
    expect(fitStrip(box.w, box.h, 2868 / 1320, 1, box.gap).count).toBe(1);
    expect(fitStrip(0, 0, 2, 3, 10)).toEqual({ count: 1, width: 0, height: 0 });
    expect(fitStrip(300, 200, Number.NaN, 3, 10).count).toBeGreaterThanOrEqual(1);
  });
});

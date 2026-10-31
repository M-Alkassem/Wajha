/**
 * Pure helpers for the home screen: relative "edited" times, initials,
 * search folding, file names, keyboard navigation in the project grid and
 * fitting a strip of slide previews into a box. No DOM, no stores.
 */
import { FAMILIES } from '../../model/catalog';
import type { FamilyId } from '../../model/types';
import { sanitizeSegment } from '../../export/paths';

import { t } from '../../i18n';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

let relative: Intl.RelativeTimeFormat | null = null;
let shortRelative: Intl.RelativeTimeFormat | null = null;

function rtf(style: 'long' | 'short'): Intl.RelativeTimeFormat {
  if (style === 'short') return (shortRelative ??= new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }));
  return (relative ??= new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'long' }));
}

/** Start of the local calendar day of `t`. */
function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * When a project was last edited, relative to `now`: "just now",
 * "5 min ago", "3 hours ago", "yesterday", "last week", then a date
 * ("Mar 4", or "Mar 4, 2024" in another year). Future times (a clock that
 * moved backwards) read as "just now".
 */
export function relativeEdited(updatedAt: number, now: number): string {
  if (!Number.isFinite(updatedAt) || !Number.isFinite(now)) return 'a while ago';
  const diff = now - updatedAt;
  if (diff < 45 * SECOND) return 'just now';
  if (diff < HOUR) {
    // "5 min. ago" is CLDR's short form; the period reads fussy in a card.
    return rtf('short')
      .format(-Math.max(1, Math.round(diff / MINUTE)), 'minute')
      .replace(/\bmin\.\s/, 'min ');
  }
  // Calendar days, so 23:50 yesterday is "yesterday" at 00:10 today, not "10 min ago" style hours.
  const days = Math.round((dayStart(now) - dayStart(updatedAt)) / DAY);
  if (days === 0 || diff < 6 * HOUR) return rtf('long').format(-Math.max(1, Math.round(diff / HOUR)), 'hour');
  if (days < 7) return rtf('long').format(-days, 'day');
  if (diff < 4 * WEEK + 2 * DAY) return rtf('long').format(-Math.max(1, Math.round(days / 7)), 'week');
  const then = new Date(updatedAt);
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString('en', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Edited 5 min ago", as shown under a project card. */
export function formatEdited(updatedAt: number, now: number): string {
  return `Edited ${relativeEdited(updatedAt, now)}`;
}

/** Full local date and time, for tooltips and screen readers. */
export function formatFullDate(t: number): string {
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}

/* Initials ------------------------------------------------------------ */

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function firstGrapheme(s: string): string {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  }
  if (graphemeSegmenter) {
    for (const { segment } of graphemeSegmenter.segment(s)) return segment;
    return '';
  }
  return Array.from(s)[0] ?? '';
}

/** Scripts whose letters join or are whole words: one character reads better than two. */
const SINGLE_CHAR = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Extended_Pictographic}]/u;
const STARTS_WITH_WORD = /^[\p{L}\p{N}]/u;

/**
 * Up to two initials for a placeholder thumbnail: "Habit Tracker" -> "HT",
 * "Fitness" -> "F", "تطبيق اللياقة" -> "ت", "🚀 Launch" -> "L".
 * Falls back to the first character (an emoji, a symbol) or "".
 */
export function projectInitials(name: string): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return '';
  const words = trimmed.split(/[\s\-_.·,:;/\\|+&()[\]{}"'“”‘’«»]+/u).filter((w) => STARTS_WITH_WORD.test(w));
  if (!words.length) return firstGrapheme(trimmed);
  const first = firstGrapheme(words[0]);
  if (SINGLE_CHAR.test(first) || words.length < 2) return first.toLocaleUpperCase();
  const second = firstGrapheme(words[1]);
  if (SINGLE_CHAR.test(second)) return first.toLocaleUpperCase();
  return (first + second).toLocaleUpperCase();
}

/** Stable small integer for `id` (FNV-1a), to vary placeholder artwork per project. */
export function hashVariant(id: string, variants: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const n = Math.max(1, Math.floor(variants));
  return (h >>> 0) % n;
}

/* Search ---------------------------------------------------------------- */

/**
 * Lower-cased, accent-free form for matching: "Café" and "cafe" match, and
 * Arabic hamza forms (أ إ آ) and tatweel fold to their base letters.
 */
export function foldForSearch(s: string): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\p{M}ـ]+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of `query` occurs in one of `fields` (accent- and case-insensitive). */
export function matchesSearch(query: string, ...fields: ReadonlyArray<string | null | undefined>): boolean {
  const tokens = foldForSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const hay = fields.map((f) => foldForSearch(f ?? '')).join('\n');
  return tokens.every((t) => hay.includes(t));
}

/* Files ----------------------------------------------------------------- */

/** "My App" -> "My App.wajha": a file name safe on every file system. */
export function archiveFileName(name: string, ext: 'wajha' | 'wajha-template'): string {
  return `${sanitizeSegment(name)}.${ext}`;
}

/** The kind of a dropped or picked file, by extension. */
export function archiveKind(fileName: string): 'project' | 'template' | null {
  const lower = String(fileName ?? '').toLowerCase();
  if (lower.endsWith('.wajha-template')) return 'template';
  if (lower.endsWith('.wajha')) return 'project';
  return null;
}

/* Families ---------------------------------------------------------------- */

/** Names used for device families on the home screen (shorter than the catalog's for the feature graphic). */
export const FAMILY_NAME: Readonly<Record<FamilyId, string>> = {
  iphone: t('iPhone'),
  'iphone-landscape': t('iPhone landscape'),
  ipad: t('iPad'),
  'ipad-landscape': t('iPad landscape'),
  'android-phone': t('Android phone'),
  'android-landscape': t('Android landscape'),
  'android-tablet': t('Android tablet'),
  mac: t('Mac'),
  watch: t('Apple Watch'),
  'apple-tv': t('Apple TV'),
  vision: t('Vision Pro'),
  'play-feature': t('Feature graphic'),
};

/** "iPhone and Android phone", "iPhone, iPad and Mac". */
export function listFamilies(families: readonly FamilyId[]): string {
  const names = families.filter((f) => f in FAMILIES).map((f) => FAMILY_NAME[f]);
  return listJoin(names);
}

/** "A", "A and B", "A, B and C". */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** `name` cut to `max` characters (whole code points) with an ellipsis, for titles and toasts. */
export function shorten(name: string, max = 60): string {
  const chars = Array.from(String(name ?? '').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

/** "1 project", "3 languages". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* Grid navigation ---------------------------------------------------------- */

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export function isGridKey(key: string): key is GridKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End';
}

/**
 * Index the focus moves to in a grid of `count` items laid out in `columns`
 * columns, or null when it stays. Left/right wrap between rows; down from a
 * row above a shorter last row lands on the last item, like Finder.
 */
export function gridNeighbor(index: number, key: GridKey, count: number, columns: number): number | null {
  if (count <= 0) return null;
  const cols = Math.max(1, Math.floor(columns) || 1);
  const i = Math.min(Math.max(0, Math.floor(index) || 0), count - 1);
  let next: number;
  switch (key) {
    case 'ArrowRight':
      next = i + 1;
      break;
    case 'ArrowLeft':
      next = i - 1;
      break;
    case 'ArrowDown': {
      next = i + cols;
      const lastRow = Math.floor((count - 1) / cols);
      if (next >= count && Math.floor(i / cols) < lastRow) next = count - 1;
      break;
    }
    case 'ArrowUp':
      next = i - cols;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
  }
  if (next < 0 || next >= count || next === i) return null;
  return next;
}

/* Preview strips ----------------------------------------------------------- */

export interface StripFit {
  count: number;
  /** CSS width of each slide. */
  width: number;
  height: number;
}

/**
 * How many slides of `aspect` (height / width) to show side by side in a
 * `boxW` x `boxH` box, and how big: the count that covers the most area,
 * at most `maxCount` and at most the slides `available`. Tall phone slides
 * come out three across, tablets two, wide Mac slides one.
 */
export function fitStrip(boxW: number, boxH: number, aspect: number, available: number, gap: number, maxCount = 3): StripFit {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const limit = Math.max(1, Math.min(Math.floor(maxCount) || 1, Math.floor(available) || 1));
  let best: StripFit = { count: 1, width: 0, height: 0 };
  let bestArea = -1;
  for (let n = 1; n <= limit; n++) {
    const w = Math.min((boxW - gap * (n - 1)) / n, boxH / a);
    if (!(w > 0)) continue;
    const area = n * w * w * a;
    if (area > bestArea + 1e-6) {
      bestArea = area;
      best = { count: n, width: Math.floor(w), height: Math.floor(w * a) };
    }
  }
  return best;
}

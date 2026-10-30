/**
 * Where a paragraph may wrap. A simplified UAX #14:
 *  - after spaces (the spaces hang at the line end and are not drawn),
 *  - after a hyphen inside a word ("state-of-the-art"),
 *  - around ideographs, kana and fullwidth forms in any language,
 *  - between any graphemes for languages marked `wrap: 'char'`, except
 *    inside runs of Latin-like letters and digits, so an app name inside
 *    Japanese copy stays whole; Thai uses dictionary word boundaries from
 *    Intl.Segmenter when available,
 *  - never before closing punctuation or small kana, never after opening
 *    punctuation (basic kinsoku shori).
 * Graphemes come from Intl.Segmenter, with a code-point fallback that keeps
 * combining marks, variation selectors, ZWJ emoji and flags together, so a
 * forced break can never split a user-perceived character.
 */

/** Break class of a grapheme. */
const WSP = 0; // breaking whitespace
const ZW = 1; // zero-width space: break opportunity
const CL = 2; // closing punctuation: no break before
const OP = 3; // opening punctuation: no break after
const HY = 4; // hyphen: break after (inside words)
const ID = 5; // ideographic: break before and after
const SA = 6; // Thai/Lao/Khmer/Myanmar: no spaces between words
const AL = 7; // letters, digits, everything else: no break inside

export interface Segment {
  /** First code unit of the segment. */
  start: number;
  /** End of the visible content (exclusive), before any trailing spaces. */
  end: number;
  /** End including trailing spaces. */
  wsEnd: number;
}

export interface Segmentation {
  /** Grapheme start offsets, followed by text.length. */
  graphemes: number[];
  segments: Segment[];
}

type Granularity = 'grapheme' | 'word';
const segmenters = new Map<string, Intl.Segmenter | null>();

function segmenter(lang: string, granularity: Granularity): Intl.Segmenter | null {
  const key = `${granularity}|${lang}`;
  const hit = segmenters.get(key);
  if (hit !== undefined) return hit;
  let seg: Intl.Segmenter | null = null;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      seg = new Intl.Segmenter(lang || undefined, { granularity });
    } catch {
      // Invalid language tags throw RangeError; fall back to the default locale.
      try {
        seg = new Intl.Segmenter(undefined, { granularity });
      } catch {
        seg = null;
      }
    }
  }
  if (segmenters.size > 64) segmenters.clear();
  segmenters.set(key, seg);
  return seg;
}

const isExtender = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
  (cp >= 0x0483 && cp <= 0x0489) ||
  (cp >= 0x0591 && cp <= 0x05c7 && cp !== 0x05be && cp !== 0x05c0 && cp !== 0x05c3 && cp !== 0x05c6) ||
  (cp >= 0x0610 && cp <= 0x061a) ||
  (cp >= 0x064b && cp <= 0x065f) ||
  cp === 0x0670 ||
  (cp >= 0x06d6 && cp <= 0x06ed && cp !== 0x06dd && cp !== 0x06de && cp !== 0x06e5 && cp !== 0x06e6 && cp !== 0x06e9) ||
  (cp >= 0x0900 && cp <= 0x0903) ||
  (cp >= 0x093a && cp <= 0x094f) ||
  cp === 0x0e31 ||
  (cp >= 0x0e34 && cp <= 0x0e3a) ||
  (cp >= 0x0e47 && cp <= 0x0e4e) ||
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  cp === 0x200c ||
  cp === 0x200d ||
  (cp >= 0x20d0 && cp <= 0x20ff) ||
  (cp >= 0x3099 && cp <= 0x309a) ||
  (cp >= 0xfe00 && cp <= 0xfe0f) ||
  (cp >= 0xfe20 && cp <= 0xfe2f) ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || // skin tones
  (cp >= 0xe0020 && cp <= 0xe007f) || // emoji tags
  (cp >= 0xe0100 && cp <= 0xe01ef);

const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/**
 * Grapheme starts without Intl.Segmenter (older WebKit): combining marks,
 * variation selectors, skin tones, ZWJ sequences and flag pairs stay with
 * the character before them. Followed by text.length.
 */
export function fallbackGraphemeBounds(text: string): number[] {
  const out: number[] = [];
  let prevZwj = false;
  let riRun = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const ri = isRegionalIndicator(cp);
    // Flags are pairs of regional indicators: the 2nd, 4th, ... join the one before.
    const joins = i > 0 && (isExtender(cp) || prevZwj || (ri && riRun % 2 === 1));
    if (!joins) out.push(i);
    riRun = ri ? riRun + 1 : 0;
    prevZwj = cp === 0x200d;
    i += cp > 0xffff ? 2 : 1;
  }
  out.push(text.length);
  return out;
}

/** Grapheme start offsets (UTF-16) followed by text.length. */
export function graphemeBounds(text: string, lang: string): number[] {
  if (!text) return [0];
  const seg = segmenter(lang, 'grapheme');
  if (!seg) return fallbackGraphemeBounds(text);
  const out: number[] = [];
  for (const s of seg.segment(text)) out.push(s.index);
  out.push(text.length);
  return out;
}

/** Splits a string into graphemes. */
export function graphemes(text: string, lang: string): string[] {
  const b = graphemeBounds(text, lang);
  const out: string[] = [];
  for (let i = 0; i + 1 < b.length; i++) out.push(text.slice(b[i], b[i + 1]));
  return out;
}

const CLOSERS = new Set(
  [...')]}»›”’"\'!?,.:;…‼⁇⁈⁉、。，．！？：；）］｝〕〉》」』】〙〗〟｠ー々〻ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ・‥゛゜ゝゞヽヾ％‰°′″℃¢؟،؛'].map(
    (c) => c.codePointAt(0) ?? 0,
  ),
);
const OPENERS = new Set([...'([{«‹“‘（［｛〔〈《「『【〘〖〝｟'].map((c) => c.codePointAt(0) ?? 0));

const LETTER = /\p{L}/u;

function breakClass(cp: number): number {
  if (cp === 0x20 || cp === 0x09 || cp === 0x3000 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x2006) || (cp >= 0x2008 && cp <= 0x200a) || cp === 0x205f) return WSP;
  if (cp === 0x200b) return ZW;
  if (CLOSERS.has(cp)) return CL;
  if (OPENERS.has(cp)) return OP;
  if (cp === 0x2d || cp === 0x2010 || cp === 0x2013 || cp === 0x2014) return HY;
  if (
    (cp >= 0x2e80 && cp <= 0x2fff) ||
    (cp >= 0x3001 && cp <= 0x303f) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3100 && cp <= 0x31ff) ||
    (cp >= 0x3200 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x20000 && cp <= 0x3ffff)
  )
    return ID;
  if ((cp >= 0x0e00 && cp <= 0x0eff) || (cp >= 0x1000 && cp <= 0x109f) || (cp >= 0x1780 && cp <= 0x17ff) || (cp >= 0x1950 && cp <= 0x19df)) return SA;
  return AL;
}

/**
 * Splits a paragraph into unbreakable segments (each followed by its
 * trailing spaces). Leading spaces of the paragraph are dropped.
 */
export function segmentText(text: string, lang: string, mode: 'space' | 'char'): Segmentation {
  const bounds = graphemeBounds(text, lang);
  const count = bounds.length - 1;
  const cls = new Uint8Array(count);
  let hasSA = false;
  for (let i = 0; i < count; i++) {
    cls[i] = breakClass(text.codePointAt(bounds[i]) ?? 0);
    if (cls[i] === SA) hasSA = true;
  }

  // Dictionary word boundaries for scripts written without spaces.
  let wordStarts: Set<number> | null = null;
  if (mode === 'char' && hasSA) {
    const seg = segmenter(lang, 'word');
    if (seg) {
      wordStarts = new Set();
      for (const s of seg.segment(text)) wordStarts.add(s.index);
    }
  }

  const isLetter = (g: number) => LETTER.test(String.fromCodePoint(text.codePointAt(bounds[g]) ?? 0));
  const latinLike = (g: number) => cls[g] === AL || ((text.codePointAt(bounds[g]) ?? 0x80) < 0x80 && cls[g] !== WSP);
  const canBreak = (a: number, b: number): boolean => {
    const A = cls[a];
    const B = cls[b];
    if (A === ZW) return true;
    if (B === CL || B === ZW) return false;
    if (A === OP) return false;
    // "state-of-the-art" may wrap after a hyphen; "1-2" and "-5" may not.
    if (A === HY) return B === AL && a > 0 && cls[a - 1] === AL && isLetter(b) && isLetter(a - 1);
    if (A === ID || B === ID) return true;
    if (mode !== 'char') return false;
    if (A === SA && B === SA) return wordStarts ? wordStarts.has(bounds[b]) : true;
    // Latin words, numbers and their ASCII punctuation ("it's", "v2.0") stay whole in CJK text.
    return !(latinLike(a) && latinLike(b)) && !(A === HY || B === HY);
  };

  const segments: Segment[] = [];
  let i = 0;
  while (i < count && cls[i] === WSP) i++;
  while (i < count) {
    const start = bounds[i];
    let j = i + 1;
    while (j < count && cls[j] !== WSP && !canBreak(j - 1, j)) j++;
    const end = bounds[j];
    let k = j;
    while (k < count && cls[k] === WSP) k++;
    segments.push({ start, end, wsEnd: bounds[k] });
    i = k;
  }
  return { graphemes: bounds, segments };
}

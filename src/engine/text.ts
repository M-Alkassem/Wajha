/**
 * Text elements: markup runs, wrapping, auto-fit, alignment, right-to-left
 * paragraphs, highlight colours and marker pills.
 *
 * Layout and drawing are split so callers can measure without painting
 * (`layoutText`, the public contract) and the renderer can draw a layout it
 * already measured (`drawTextBlock`). All measuring goes through the same
 * context state (font, direction, letter spacing) that drawing uses, so the
 * wrapped lines always match what ends up on the canvas.
 */
import type { TextStyle } from '../model/types';
import { FONT_FALLBACK_STACK, languageInfo } from '../model/catalog';
import type { Ctx2D, LayoutTextFn, LayoutTextInput, TextLayout, TextLine, TextRun } from './types';
import { contrast, rgba } from './color';
import { clamp, num, roundedRect } from './geometry';
import { engineCache } from './cache';
import { parseMarkup } from './markup';
import { isUnidirectional, resolveLevels, strongDirections, visualOrder } from './bidi';
import { graphemes, segmentText, type Segmentation } from './linebreak';

const MIN_FONT_PX = 1;
const MAX_FONT_PX = 4000;
/** Auto-fit shrinks in 4 % steps down to 60 % of the style size. */
const FIT_STEPS = 10;
const FIT_STEP = 0.04;
/** Texts are length-limited by the validators; this only protects against runaway input. */
const MAX_TEXT_LENGTH = 10000;
const EPS = 0.01;
/** Marker pill padding around the highlighted words, in em. */
const PILL_PAD_X = 0.14;
const PILL_PAD_Y = 0.04;

/** A TextStyle with every field present, finite and in range. */
export interface SafeTextStyle {
  font: string;
  weight: number;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  highlight: string;
  highlightMode: 'color' | 'marker';
  align: 'start' | 'center' | 'end';
  transform: 'none' | 'uppercase';
  maxLines: number;
  shadow: { color: string; blur: number; x: number; y: number } | null;
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Normalises a (possibly malformed) TextStyle. */
export function safeTextStyle(style: Partial<TextStyle> | null | undefined): SafeTextStyle {
  const s: Partial<TextStyle> = style && typeof style === 'object' ? style : {};
  const color = str(s.color, '#111111');
  const sh: unknown = s.shadow;
  let shadow: SafeTextStyle['shadow'] = null;
  if (sh && typeof sh === 'object') {
    const o = sh as Record<string, unknown>;
    shadow = { color: str(o.color, '#00000040'), blur: Math.max(0, num(o.blur, 0)), x: num(o.x, 0), y: num(o.y, 0) };
  }
  return {
    font: str(s.font, ''),
    weight: Math.round(clamp(num(s.weight, 400), 1, 1000)),
    size: clamp(num(s.size, 0.05), 0, 20),
    lineHeight: clamp(num(s.lineHeight, 1.2), 0.3, 5),
    letterSpacing: clamp(num(s.letterSpacing, 0), -0.5, 2),
    color,
    highlight: str(s.highlight, color),
    highlightMode: s.highlightMode === 'marker' ? 'marker' : 'color',
    align: s.align === 'center' || s.align === 'end' ? s.align : 'start',
    transform: s.transform === 'uppercase' ? 'uppercase' : 'none',
    maxLines: Math.floor(clamp(num(s.maxLines, 0), 0, 1000)),
    shadow,
  };
}

/** Canvas font shorthand: `WEIGHT PXpx "FONT", <fallback stack>`. */
export function fontString(family: string, weight: number, px: number): string {
  // Quotes or semicolons in a family name would make the whole shorthand invalid and the
  // canvas would silently keep the previous font.
  const name = family.replace(/["\\\r\n;{}]/g, '').trim();
  const size = Math.max(0.01, Math.round(px * 100) / 100);
  const w = Math.round(clamp(num(weight, 400), 1, 1000));
  return `${w} ${size}px ${name ? `"${name}", ` : ''}${FONT_FALLBACK_STACK}`;
}

/* ------------------------------------------------------------------ */
/* Paragraph preparation (cached: independent of font size)            */
/* ------------------------------------------------------------------ */

interface ParaRun {
  start: number;
  end: number;
  highlighted: boolean;
}

interface Para {
  text: string;
  runs: ParaRun[];
  /** Base direction used for bidi and letter-spacing decisions. */
  rtl: boolean;
  /** Letter spacing may be applied (not RTL, no cursive-joining script). */
  spaced: boolean;
  seg: Segmentation;
  /** Start and end offsets of the highlighted runs a marker pill is drawn around (sorted). */
  pills: number[];
}

/** Scripts whose letters join; per-letter spacing would tear them apart. */
const JOINING = /[\u0600-\u08ff\u1800-\u18af\ua840-\ua87f\ufb50-\ufdff\ufe70-\ufeff]|[\u{10ac0}-\u{10aff}\u{10d00}-\u{10d3f}\u{10f30}-\u{10f6f}]/u;
/** Something visible for a marker pill to sit behind (not only spaces or invisible format characters). */
const INK = /[^\s\p{Cf}]/u;

const prepared = engineCache<string, Para[]>(160);

function upper(s: string, lang: string): string {
  try {
    return s.toLocaleUpperCase(lang);
  } catch {
    // Invalid language tags throw RangeError.
    return s.toUpperCase();
  }
}

function prepare(text: string, style: SafeTextStyle, lang: string, baseRtl: boolean, wrap: 'space' | 'char'): Para[] {
  const key = `${lang}\u0000${wrap}\u0000${style.transform}\u0000${baseRtl ? 1 : 0}\u0000${style.letterSpacing !== 0 ? 1 : 0}\u0000${text}`;
  const hit = prepared.get(key);
  if (hit) return hit;
  const paras = parseMarkup(text).map((runs): Para => {
    let t = '';
    const out: ParaRun[] = [];
    for (const r of runs) {
      const s = style.transform === 'uppercase' ? upper(r.text, lang) : r.text;
      if (!s) continue;
      out.push({ start: t.length, end: t.length + s.length, highlighted: r.highlighted });
      t += s;
    }
    // A paragraph written only in the opposite script (an untranslated fallback, a Latin
    // tagline in an Arabic project) reads in its own direction; mixed text keeps the
    // language direction so "Wajha يساعدك" still starts on the right.
    const dirs = strongDirections(t);
    const rtl = baseRtl ? !(dirs.ltr && !dirs.rtl) : dirs.rtl && !dirs.ltr;
    const pills: number[] = [];
    for (const r of out) if (r.highlighted && INK.test(t.slice(r.start, r.end))) pills.push(r.start, r.end);
    return {
      text: t,
      runs: out,
      rtl,
      spaced: style.letterSpacing !== 0 && !rtl && !JOINING.test(t),
      seg: segmentText(t, lang, wrap),
      pills,
    };
  });
  prepared.set(key, paras);
  return paras;
}

/* ------------------------------------------------------------------ */
/* Measuring                                                           */
/* ------------------------------------------------------------------ */

const finiteWidth = (w: number) => (Number.isFinite(w) && w > 0 ? w : 0);

function setSpacing(ctx: Ctx2D, px: number): void {
  ctx.letterSpacing = `${Math.round(px * 100) / 100}px`;
}

/**
 * Width of `text` with letter spacing. Native `ctx.letterSpacing` must
 * already be set by the caller; without native support the spacing is
 * emulated per grapheme (and drawn the same way, see drawSpaced).
 */
function measureWith(ctx: Ctx2D, text: string, spacing: number, native: boolean, lang: string): number {
  if (!text) return 0;
  if (spacing === 0 || native) return finiteWidth(ctx.measureText(text).width);
  let w = 0;
  let n = 0;
  for (const g of graphemes(text, lang)) {
    w += finiteWidth(ctx.measureText(g).width);
    n++;
  }
  return Math.max(0, w + n * spacing);
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** A laid-out line plus what drawing needs to reproduce its measurement. */
export interface LaidLine extends TextLine {
  /** Base direction of the paragraph the line belongs to. */
  rtl: boolean;
  /** Letter spacing in pixels applied to this line (0 when disabled). */
  spacing: number;
}

/** The public TextLayout plus the state `drawTextBlock` needs. */
export interface LaidText extends TextLayout {
  lines: LaidLine[];
  font: string;
  style: SafeTextStyle;
  /** Alignment direction: the slide language, so start/end mirror for RTL. */
  rtl: boolean;
  lang: string;
  /** Letter spacing uses ctx.letterSpacing (else emulated per grapheme). */
  nativeSpacing: boolean;
}

export interface LayoutOptions {
  /** Overrides feature detection of ctx.letterSpacing (tests). */
  nativeSpacing?: boolean;
}

interface Attempt {
  lines: LaidLine[];
  /** A word had to be split at grapheme boundaries. */
  broke: boolean;
  /** Per paragraph: total content width on one line (for cheap auto-fit estimates). */
  widths: number[];
}

/** How many of the sorted offsets lie in [from, to). */
function countIn(offsets: number[], from: number, to: number): number {
  return to > from && offsets.length ? lowerBound(offsets, to) - lowerBound(offsets, from) : 0;
}

/** Pill padding inside the line [start, end): the pills' outer sides at the line ends hang free. */
const pillPadding = (p: Para, pad: number, start: number, end: number): number => (pad > 0 ? pad * countIn(p.pills, start + 1, end) : 0);

/**
 * Greedy line breaking. `pad` is the room a marker pill keeps on each side
 * of its words (0 without pills), counted wherever the pill has a
 * neighbour on the same line, like a space.
 */
function breakParagraph(
  p: Para,
  measure: (s: string) => number,
  boxWidth: number,
  pad: number,
): { ranges: [number, number][]; broke: boolean; total: number } {
  const ranges: [number, number][] = [];
  const { segments, graphemes: bounds } = p.seg;
  const pills = pad > 0 ? p.pills : [];
  let broke = false;
  let total = 0;
  let lineStart = -1;
  let lineEnd = -1;
  let lineWidth = 0; // includes the trailing spaces (and pill padding) of the last segment
  for (const seg of segments) {
    // Padding at a pill edge before the word counts once another word precedes it on the
    // line, padding after it only if the line goes on, padding inside the word always.
    const lead = pad * countIn(pills, seg.start, seg.start + 1);
    const trail = pad * countIn(pills, seg.end, seg.wsEnd);
    const inner = pad * countIn(pills, seg.start + 1, seg.end);
    const cw = measure(p.text.slice(seg.start, seg.end)) + inner;
    const fw = (seg.wsEnd > seg.end ? measure(p.text.slice(seg.start, seg.wsEnd)) + inner : cw) + trail;
    // Content only: a strict lower bound of the wrapped width (spaces at breaks are dropped).
    total += cw;
    if (lineStart >= 0 && lineWidth + lead + cw <= boxWidth + EPS) {
      lineEnd = seg.end;
      lineWidth += lead + fw;
      continue;
    }
    if (lineStart >= 0) ranges.push([lineStart, lineEnd]);
    if (cw <= boxWidth + EPS) {
      lineStart = seg.start;
      lineEnd = seg.end;
      lineWidth = fw;
      continue;
    }
    // A single word wider than the box: break it between graphemes.
    broke = true;
    let gi = lowerBound(bounds, seg.start);
    let chunkStart = seg.start;
    let chunkWidth = 0;
    for (; gi + 1 < bounds.length && bounds[gi] < seg.end; gi++) {
      const gw = measure(p.text.slice(bounds[gi], bounds[gi + 1]));
      const gp = chunkWidth > 0 ? pad * countIn(pills, bounds[gi], bounds[gi] + 1) : 0;
      if (chunkWidth > 0 && chunkWidth + gp + gw > boxWidth + EPS) {
        ranges.push([chunkStart, bounds[gi]]);
        chunkStart = bounds[gi];
        chunkWidth = 0;
      } else chunkWidth += gp;
      chunkWidth += gw;
    }
    lineStart = chunkStart;
    lineEnd = seg.end;
    lineWidth = chunkWidth + Math.max(0, fw - cw);
  }
  if (lineStart >= 0) ranges.push([lineStart, lineEnd]);
  if (!ranges.length) ranges.push([0, 0]);
  return { ranges, broke, total };
}

function lowerBound(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Paragraphs with this many lines get balanced line lengths (like CSS `text-wrap: balance`). */
const BALANCE_MIN_LINES = 2;
const BALANCE_MAX_LINES = 6;

/**
 * Narrowest wrap width that keeps the greedy line count, found by binary
 * search. Greedy wrapping leaves orphans ("…one day at a / time."); equal
 * lines read as designed, which is what screenshot headlines want. The box
 * itself does not change, only where the lines break.
 */
function balanceRanges(p: Para, measure: (s: string) => number, boxWidth: number, pad: number, greedy: [number, number][]): [number, number][] {
  const n = greedy.length;
  let lo = 0;
  let total = 0;
  for (const seg of p.seg.segments) {
    const w = measure(p.text.slice(seg.start, seg.end));
    lo = Math.max(lo, w);
    total += w;
  }
  lo = Math.max(lo, total / n);
  let hi = boxWidth;
  let best = greedy;
  for (let i = 0; i < 16 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    const r = breakParagraph(p, measure, mid, pad);
    if (!r.broke && r.ranges.length <= n) {
      hi = mid;
      best = r.ranges;
    } else lo = mid;
  }
  return best;
}

function attempt(ctx: Ctx2D, paras: Para[], px: number, style: SafeTextStyle, boxWidth: number, native: boolean, lang: string, balance = false): Attempt {
  ctx.font = fontString(style.font, style.weight, px);
  // Marker pills keep their padding clear of the neighbouring words (see pillGaps).
  const pad = style.highlightMode === 'marker' ? PILL_PAD_X * px : 0;
  const lines: LaidLine[] = [];
  const widths: number[] = [];
  let broke = false;
  for (const p of paras) {
    const spacing = p.spaced ? style.letterSpacing * px : 0;
    ctx.direction = p.rtl ? 'rtl' : 'ltr';
    if (native) setSpacing(ctx, spacing);
    const memo = new Map<string, number>();
    const measure = (s: string): number => {
      let w = memo.get(s);
      if (w === undefined) {
        w = measureWith(ctx, s, spacing, native, lang);
        memo.set(s, w);
      }
      return w;
    };
    const res = breakParagraph(p, measure, boxWidth, pad);
    broke ||= res.broke;
    widths.push(res.total);
    const count = res.ranges.length;
    const ranges = balance && !res.broke && count >= BALANCE_MIN_LINES && count <= BALANCE_MAX_LINES ? balanceRanges(p, measure, boxWidth, pad, res.ranges) : res.ranges;
    for (const [start, end] of ranges) {
      const runs: TextRun[] = [];
      let width = pillPadding(p, pad, start, end);
      for (const r of p.runs) {
        const s = Math.max(start, r.start);
        const e = Math.min(end, r.end);
        if (s >= e) continue;
        const text = p.text.slice(s, e);
        const w = measure(text);
        runs.push({ text, highlighted: r.highlighted, width: w });
        width += w;
      }
      lines.push({ runs, width, rtl: p.rtl, spacing });
    }
  }
  return { lines, broke, widths };
}

/**
 * Lays out text with the style's font, wrapping, letter spacing and
 * auto-fit. Returns the public TextLayout fields plus drawing state.
 */
export function layoutTextBlock(ctx: Ctx2D, input: LayoutTextInput, opts: LayoutOptions = {}): LaidText {
  const style = safeTextStyle(input?.style);
  const unit = num(input?.unit, 0) > 0 ? input.unit : 1;
  const boxWidth = Math.max(0, num(input?.boxWidth, 0));
  const lang = typeof input?.lang === 'string' && input.lang ? input.lang : 'en-US';
  const rtl = input?.rtl === true;
  const raw = typeof input?.text === 'string' ? input.text : '';
  const text = raw.length > MAX_TEXT_LENGTH ? raw.slice(0, MAX_TEXT_LENGTH) : raw;
  const basePx = clamp(style.size * unit, MIN_FONT_PX, MAX_FONT_PX);
  const paras = prepare(text, style, lang, rtl, languageInfo(lang).wrap);
  const native = opts.nativeSpacing ?? 'letterSpacing' in ctx;

  const build = (chosen: Attempt, px: number, overflow: boolean): LaidText => {
    // Auto-fit decides on greedy layouts; balancing keeps the line count, so it runs once at the end.
    const a = chosen.lines.length >= BALANCE_MIN_LINES ? attempt(ctx, paras, px, style, boxWidth, native, lang, true) : chosen;
    const lineHeightPx = px * style.lineHeight;
    return {
      lines: a.lines,
      fontPx: px,
      lineHeightPx,
      boxWidth,
      height: Math.max(1, a.lines.length) * lineHeightPx,
      overflow,
      font: fontString(style.font, style.weight, px),
      style,
      rtl,
      lang,
      nativeSpacing: native,
    };
  };

  ctx.save();
  try {
    const first = attempt(ctx, paras, basePx, style, boxWidth, native, lang);
    const max = style.maxLines;
    if (max <= 0 || (first.lines.length <= max && !first.broke)) return build(first, basePx, false);

    let fitted: { a: Attempt; px: number } | null = first.lines.length <= max ? { a: first, px: basePx } : null;
    let last = { a: first, px: basePx };
    for (let i = 1; i <= FIT_STEPS; i++) {
      const scale = Math.round((1 - FIT_STEP * i) * 100) / 100;
      const px = Math.max(MIN_FONT_PX, basePx * scale);
      // Skip sizes whose single-line width already proves they need too many lines
      // (widths scale linearly with the font size; 2 % margin for hinting).
      if (i < FIT_STEPS && boxWidth > 0) {
        let estimate = 0;
        for (const w of first.widths) estimate += Math.max(1, Math.ceil((w * scale * 0.98) / boxWidth));
        if (estimate > max) continue;
      }
      const a = attempt(ctx, paras, px, style, boxWidth, native, lang);
      last = { a, px };
      if (a.lines.length <= max) {
        if (!a.broke) return build(a, px, false);
        fitted ??= { a, px };
      }
    }
    // Prefer the largest size that fits the line count, even if a long word had to break.
    if (fitted) return build(fitted.a, fitted.px, false);
    return build(last.a, last.px, last.a.lines.length > max);
  } finally {
    if (native && 'letterSpacing' in ctx) setSpacing(ctx, 0);
    ctx.restore();
  }
}

/** Public contract: lays out text without drawing (see LayoutTextFn). */
export const layoutText: LayoutTextFn = (ctx, input) => layoutTextBlock(ctx, input);

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

interface Piece {
  text: string;
  highlighted: boolean;
  width: number;
  /** Drawing direction of this piece. */
  rtl: boolean;
  spacing: number;
}

interface Placed extends Piece {
  x: number;
  baseline: number;
  line: number;
}

/**
 * Runs of a line in visual (left-to-right) order, cut wherever the bidi
 * level changes, even inside one run: every piece is drawn by its own
 * fillText in a single direction (see bidi.ts for why WebKit needs that).
 * Levels never change inside a word of one script, so Arabic letters stay
 * joined.
 */
function linePieces(ctx: Ctx2D, line: LaidLine, native: boolean, lang: string): Piece[] {
  const runs = line.runs;
  const joined = runs.length === 1 ? runs[0].text : runs.map((r) => r.text).join('');
  if (isUnidirectional(joined, line.rtl)) {
    const pieces = runs.map((r): Piece => ({ text: r.text, highlighted: r.highlighted, width: r.width, rtl: line.rtl, spacing: line.spacing }));
    return line.rtl ? pieces.reverse() : pieces;
  }

  const levels = resolveLevels(joined, line.rtl);
  const items: { text: string; highlighted: boolean; level: number }[] = [];
  let offset = 0;
  for (const r of runs) {
    let s = 0;
    for (let k = 1; k <= r.text.length; k++) {
      if (k === r.text.length || levels[offset + k] !== levels[offset + s]) {
        items.push({ text: r.text.slice(s, k), highlighted: r.highlighted, level: levels[offset + s] });
        s = k;
      }
    }
    offset += r.text.length;
  }
  if (native) setSpacing(ctx, line.spacing);
  return visualOrder(items.map((it) => it.level)).map((idx) => {
    const it = items[idx];
    const rtl = it.level % 2 === 1;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    return { text: it.text, highlighted: it.highlighted, width: measureWith(ctx, it.text, line.spacing, native, lang), rtl, spacing: line.spacing };
  });
}

/**
 * Room to leave before each piece of a line for marker pills: a pill grows
 * by `pad` on each side, and reserving that keeps a full word space between
 * the pill and its neighbours. At the line ends the pill hangs free, so the
 * text stays aligned. layoutTextBlock counts the same room when wrapping.
 */
function pillGaps(pieces: Piece[], pad: number): number[] {
  const gaps = pieces.map(() => 0);
  if (pad <= 0) return gaps;
  for (let i = 0; i < pieces.length; i++) {
    if (!pieces[i].highlighted) continue;
    let j = i;
    while (j + 1 < pieces.length && pieces[j + 1].highlighted) j++;
    if (pieces.slice(i, j + 1).some((p) => INK.test(p.text))) {
      if (i > 0) gaps[i] += pad;
      if (j + 1 < pieces.length) gaps[j + 1] += pad;
    }
    i = j;
  }
  return gaps;
}

const resolveAlign = (align: SafeTextStyle['align'], rtl: boolean): 'left' | 'center' | 'right' =>
  align === 'center' ? 'center' : (align === 'start') !== rtl ? 'left' : 'right';

const metric = (v: number | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/** Colour of highlighted words: the highlight colour, or for markers a colour readable on the pill. */
export function highlightTextColor(style: SafeTextStyle): string {
  if (style.highlightMode === 'color') return rgba(style.highlight);
  if (contrast(style.highlight, style.color) >= 3) return rgba(style.color);
  const white = '#ffffff';
  const ink = '#111114';
  return rgba(contrast(style.highlight, white) >= contrast(style.highlight, ink) ? white : ink);
}

export interface DrawTextOptions {
  /** u in pixels; shadow sizes are fractions of it. */
  unit: number;
  /** Device pixels per user unit (shadows ignore the transform). */
  pxScale?: number;
}

/**
 * Draws a laid-out block centred on the origin: the box spans
 * [-boxWidth/2, boxWidth/2] x [-height/2, height/2].
 */
export function drawTextBlock(ctx: Ctx2D, layout: LaidText, opts: DrawTextOptions): void {
  if (!layout.lines.some((l) => l.runs.length > 0)) return;
  const { style } = layout;
  const px = layout.fontPx;
  const unit = num(opts.unit, 1);
  const pxScale = num(opts.pxScale, 1);
  const native = layout.nativeSpacing && 'letterSpacing' in ctx;
  ctx.save();
  try {
    ctx.font = layout.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';
    // Font-level metrics (not the glyphs of each line) so every line box is placed alike,
    // and lines are centred in their line height the way CSS distributes half-leading.
    const hg = ctx.measureText('Hg');
    const ascent = metric(hg.fontBoundingBoxAscent, px * 0.8);
    const descent = metric(hg.fontBoundingBoxDescent, px * 0.2);
    const lh = layout.lineHeightPx;
    const top = -layout.height / 2;
    const half = layout.boxWidth / 2;
    const align = resolveAlign(style.align, layout.rtl);
    const pad = style.highlightMode === 'marker' ? PILL_PAD_X * px : 0;

    const placed: Placed[] = [];
    layout.lines.forEach((line, i) => {
      if (!line.runs.length) return;
      const baseline = top + i * lh + (lh - (ascent + descent)) / 2 + ascent;
      const pieces = linePieces(ctx, line, native, layout.lang);
      const gaps = pillGaps(pieces, pad);
      let total = 0;
      for (let k = 0; k < pieces.length; k++) total += gaps[k] + pieces[k].width;
      // Spacing follows every glyph, including the last; centre on the ink, not on that gap.
      const visual = total - (line.spacing !== 0 ? line.spacing : 0);
      let x = align === 'left' ? -half : align === 'right' ? half - visual : -visual / 2;
      pieces.forEach((p, k) => {
        x += gaps[k];
        placed.push({ ...p, x, baseline, line: i });
        x += p.width;
      });
    });

    if (style.highlightMode === 'marker') drawPills(ctx, placed, layout, native);

    if (style.shadow) {
      ctx.shadowColor = rgba(style.shadow.color);
      ctx.shadowBlur = style.shadow.blur * unit * pxScale;
      ctx.shadowOffsetX = style.shadow.x * unit * pxScale;
      ctx.shadowOffsetY = style.shadow.y * unit * pxScale;
    }
    const base = rgba(style.color);
    const hi = highlightTextColor(style);
    for (const p of placed) {
      ctx.fillStyle = p.highlighted ? hi : base;
      ctx.direction = p.rtl ? 'rtl' : 'ltr';
      if (p.spacing !== 0 && !native) {
        drawSpaced(ctx, p, layout.lang);
      } else {
        if (native) setSpacing(ctx, p.spacing);
        ctx.fillText(p.text, p.x, p.baseline);
      }
    }
  } finally {
    if ('letterSpacing' in ctx) setSpacing(ctx, 0);
    ctx.restore();
  }
}

/** Per-grapheme drawing for engines without ctx.letterSpacing (older WebKit). */
function drawSpaced(ctx: Ctx2D, p: Placed, lang: string): void {
  const gs = graphemes(p.text, lang);
  if (p.rtl) gs.reverse();
  let x = p.x;
  for (const g of gs) {
    ctx.fillText(g, x, p.baseline);
    x += finiteWidth(ctx.measureText(g).width) + p.spacing;
  }
}

const LEADING_WS = /^\s+/;
const TRAILING_WS = /\s+$/;

function drawPills(ctx: Ctx2D, placed: Placed[], layout: LaidText, native: boolean): void {
  const px = layout.fontPx;
  const padX = PILL_PAD_X * px;
  const padY = PILL_PAD_Y * px;
  ctx.direction = 'ltr';
  if (native) setSpacing(ctx, 0);
  // Pills hug ascenders and descenders of the font, grown to the actual glyphs of the
  // line so tall scripts (Arabic hamza, Vietnamese stacks) stay inside.
  const probeTop = metric(ctx.measureText('Hd').actualBoundingBoxAscent, px * 0.75);
  const probeBottom = metric(ctx.measureText('gy').actualBoundingBoxDescent, px * 0.22);
  const lineExtent = new Map<number, [number, number]>();
  const extentOf = (line: number): [number, number] => {
    let e = lineExtent.get(line);
    if (!e) {
      const m = ctx.measureText(layout.lines[line].runs.map((r) => r.text).join(''));
      e = [Math.max(probeTop, metric(m.actualBoundingBoxAscent, 0)), Math.max(probeBottom, metric(m.actualBoundingBoxDescent, 0))];
      lineExtent.set(line, e);
    }
    return e;
  };
  const wsWidth = (p: Placed, side: 'left' | 'right'): number => {
    const re = (side === 'left') !== p.rtl ? LEADING_WS : TRAILING_WS;
    const ws = re.exec(p.text)?.[0];
    if (!ws) return 0;
    if (ws.length === p.text.length) return p.width;
    if (native) setSpacing(ctx, p.spacing);
    const w = measureWith(ctx, ws, p.spacing, native, layout.lang);
    if (native) setSpacing(ctx, 0);
    return w;
  };

  ctx.fillStyle = rgba(layout.style.highlight);
  for (let i = 0; i < placed.length; ) {
    if (!placed[i].highlighted) {
      i++;
      continue;
    }
    // One pill per visually contiguous highlighted stretch (a run cut by bidi stays one pill).
    let j = i;
    while (j + 1 < placed.length && placed[j + 1].highlighted && placed[j + 1].line === placed[i].line) j++;
    const first = placed[i];
    const last = placed[j];
    const left = first.x + wsWidth(first, 'left');
    // The spacing after the last glyph is part of the measured width but not of the ink.
    const right = last.x + last.width - wsWidth(last, 'right') - (last.rtl ? 0 : last.spacing);
    if (right - left > 0.5) {
      const [up, down] = extentOf(first.line);
      const y0 = first.baseline - up - padY;
      const h = up + down + 2 * padY;
      ctx.beginPath();
      roundedRect(ctx, left - padX, y0, right - left + 2 * padX, h, Math.min(0.22 * px, h / 2));
      ctx.fill();
    }
    i = j + 1;
  }
}

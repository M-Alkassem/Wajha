import { describe, expect, it } from 'vitest';
import { pixel, registerPrimaryFonts, testCanvas } from './testing/canvas.node';
import { textStyle } from './testing/fixtures';
import { drawTextBlock, fontString, highlightTextColor, layoutText, layoutTextBlock, safeTextStyle, type LaidText, type LayoutOptions } from './text';
import { resolveLevels, strongDirections } from './bidi';
import { plainText } from './markup';
import { FONT_FALLBACK_STACK } from '../model/catalog';
import type { TextStyle } from '../model/types';
import type { Ctx2D } from './types';

registerPrimaryFonts();

const U = 400;

interface LayOpts {
  box?: number;
  rtl?: boolean;
  lang?: string;
  layout?: LayoutOptions;
}

function lay(text: string, style: Partial<TextStyle> = {}, o: LayOpts = {}): LaidText {
  const { ctx } = testCanvas(10, 10);
  return layoutTextBlock(ctx, { text, style: textStyle(style), boxWidth: o.box ?? 300, unit: U, rtl: o.rtl ?? false, lang: o.lang ?? 'en-US' }, o.layout);
}

const lineText = (l: { runs: { text: string }[] }) => l.runs.map((r) => r.text).join('');

/** Width of `s` in the same font, for oracle checks. */
function measure(s: string, style: Partial<TextStyle> = {}, px = 32): number {
  const { ctx } = testCanvas(10, 10);
  const st = textStyle(style);
  ctx.font = fontString(st.font, st.weight, px);
  return ctx.measureText(s).width;
}

/** Ink bounds (alpha > 60) of a canvas region. */
function inkBounds(ctx: Ctx2D, w: number, h: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 60) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Draws a laid-out block centred on (cx, cy) of a fresh canvas. */
function drawn(layout: LaidText, w = 400, h = 160, cx = 200, cy = 80): Ctx2D {
  const { ctx } = testCanvas(w, h);
  ctx.translate(cx, cy);
  drawTextBlock(ctx, layout, { unit: U });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

interface FillCall {
  text: string;
  x: number;
  y: number;
  /** Direction the text was drawn in. */
  rtl: boolean;
}

/** A context proxy that records fillText calls. */
function recording(ctx: Ctx2D): { ctx: Ctx2D; calls: FillCall[] } {
  const calls: FillCall[] = [];
  const proxy = new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'fillText') {
        return (text: string, x: number, y: number) => {
          calls.push({ text, x, y, rtl: target.direction === 'rtl' });
          target.fillText(text, x, y);
        };
      }
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
  return { ctx: proxy as Ctx2D, calls };
}

describe('style and font helpers', () => {
  it('builds the canvas font shorthand with the fallback stack', () => {
    expect(fontString('Inter Variable', 700, 32)).toBe(`700 32px "Inter Variable", ${FONT_FALLBACK_STACK}`);
    expect(fontString('Bad"Name;', 400, 10.123456)).toBe(`400 10.12px "BadName", ${FONT_FALLBACK_STACK}`);
    expect(fontString('', 400, 10)).toBe(`400 10px ${FONT_FALLBACK_STACK}`);
    expect(fontString('X', NaN, 10)).toBe(`400 10px "X", ${FONT_FALLBACK_STACK}`);
  });

  it('sanitises malformed styles', () => {
    const s = safeTextStyle({ size: NaN, lineHeight: -3, weight: 5000, maxLines: 2.7, align: 'sideways' as 'start', highlightMode: 'x' as 'color', shadow: { color: 5 as unknown as string, blur: NaN, x: 0.01, y: Infinity } });
    expect(s.size).toBe(0.05);
    expect(s.lineHeight).toBe(0.3);
    expect(s.weight).toBe(1000);
    expect(s.maxLines).toBe(2);
    expect(s.align).toBe('start');
    expect(s.highlightMode).toBe('color');
    expect(s.shadow).toEqual({ color: '#00000040', blur: 0, x: 0.01, y: 0 });
    expect(safeTextStyle(undefined).color).toBe('#111111');
  });

  it('picks a readable colour for marker highlights', () => {
    const base = safeTextStyle(textStyle({ highlightMode: 'marker', color: '#000000', highlight: '#ffd400' }));
    expect(highlightTextColor(base)).toBe('rgba(0, 0, 0, 1)');
    const dark = safeTextStyle(textStyle({ highlightMode: 'marker', color: '#111111', highlight: '#5b21b6' }));
    expect(highlightTextColor(dark)).toBe('rgba(255, 255, 255, 1)');
    const light = safeTextStyle(textStyle({ highlightMode: 'marker', color: '#ffffff', highlight: '#fde68a' }));
    expect(highlightTextColor(light)).toBe('rgba(17, 17, 20, 1)');
    const color = safeTextStyle(textStyle({ highlightMode: 'color', highlight: '#ff0000' }));
    expect(highlightTextColor(color)).toBe('rgba(255, 0, 0, 1)');
  });
});

describe('layoutText basics', () => {
  it('lays out a single line', () => {
    const l = lay('Hello');
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].runs).toEqual([{ text: 'Hello', highlighted: false, width: expect.any(Number) }]);
    expect(l.lines[0].width).toBeCloseTo(measure('Hello'), 3);
    expect(l.fontPx).toBe(32);
    expect(l.lineHeightPx).toBeCloseTo(32 * 1.15);
    expect(l.height).toBeCloseTo(32 * 1.15);
    expect(l.boxWidth).toBe(300);
    expect(l.overflow).toBe(false);
  });

  it('is exposed through the public layoutText contract', () => {
    const { ctx } = testCanvas(10, 10);
    const l = layoutText(ctx, { text: 'Hi', style: textStyle(), boxWidth: 100, unit: U, rtl: false, lang: 'en-US' });
    expect(l.lines[0].runs[0].text).toBe('Hi');
  });

  it('returns a one-line box for empty text', () => {
    for (const t of ['', '   ']) {
      const l = lay(t);
      expect(l.lines).toHaveLength(1);
      expect(l.lines[0].runs).toEqual([]);
      expect(l.height).toBeCloseTo(l.lineHeightPx);
    }
  });

  it('honours hard breaks, including blank lines', () => {
    expect(lay('a\nb').lines.map(lineText)).toEqual(['a', 'b']);
    expect(lay('a\n\nb').lines.map(lineText)).toEqual(['a', '', 'b']);
    expect(lay('a\n\nb').height).toBeCloseTo(3 * lay('a').lineHeightPx);
  });

  it('splits highlighted runs from markup', () => {
    const l = lay('Track *every* habit', {}, { box: 1000 });
    expect(l.lines[0].runs.map((r) => [r.text, r.highlighted])).toEqual([
      ['Track ', false],
      ['every', true],
      [' habit', false],
    ]);
    const sum = l.lines[0].runs.reduce((s, r) => s + r.width, 0);
    expect(l.lines[0].width).toBeCloseTo(sum);
  });

  it('applies locale-aware uppercase', () => {
    expect(lineText(lay('istanbul', { transform: 'uppercase' }, { lang: 'tr', box: 1000 }).lines[0])).toBe('İSTANBUL');
    expect(lineText(lay('istanbul', { transform: 'uppercase' }, { lang: 'en-US', box: 1000 }).lines[0])).toBe('ISTANBUL');
    expect(lineText(lay('straße *ok*', { transform: 'uppercase' }, { lang: 'de-DE', box: 1000 }).lines[0])).toBe('STRASSE OK');
  });
});

describe('wrapping', () => {
  const text = 'Track every habit you care about and build streaks that last';

  /** Independent greedy word wrap over measured widths. */
  function greedy(t: string, box: number): string[] {
    const space = measure(' ');
    const out: string[] = [];
    let line = '';
    for (const w of t.split(' ')) {
      if (line && measure(line) + space + measure(w) > box + 0.01) {
        out.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    out.push(line);
    return out;
  }

  it('keeps the greedy line count and balances the line lengths', () => {
    const l = lay(text);
    const oracle = greedy(text, 300);
    expect(oracle.length).toBeGreaterThanOrEqual(3);
    expect(oracle.length).toBeLessThanOrEqual(6);
    expect(l.lines).toHaveLength(oracle.length);
    expect(l.lines.map(lineText).join(' ')).toBe(text);
    const widths = l.lines.map((x) => x.width);
    const greedyWidths = oracle.map((x) => measure(x));
    for (const w of widths) expect(w).toBeLessThanOrEqual(300 + 0.5);
    expect(Math.max(...widths)).toBeLessThanOrEqual(Math.max(...greedyWidths) + 0.5);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(Math.max(...greedyWidths) - Math.min(...greedyWidths));
  });

  it('produces known line counts with the bundled fonts', () => {
    // Inter 700 at 32px in a 300px box; Cairo 700 at 32px in a 180px box.
    expect(lay(text).lines.map(lineText)).toEqual(['Track every', 'habit you care', 'about and build', 'streaks that last']);
    expect(lay('Plan your perfect week').lines.map(lineText)).toEqual(['Plan your', 'perfect week']);
    expect(lay('Build streaks that last, one day at a time.').lines).toHaveLength(3);
    const ar = lay('تتبع عاداتك اليومية بسهولة وابن سلسلة نجاحات', { font: 'Cairo Variable' }, { box: 180, rtl: true, lang: 'ar-SA' });
    expect(ar.lines).toHaveLength(5);
  });

  it('removes orphans from two-line texts', () => {
    const t = 'Build streaks that last, one day at a time.';
    const box = measure('Build streaks that last, one day at a') + 2;
    expect(greedy(t, box)[1]).toBe('time.');
    const l = lay(t, {}, { box });
    expect(l.lines).toHaveLength(2);
    expect(lineText(l.lines[1]).split(' ').length).toBeGreaterThan(2);
  });

  it('fills lines greedily when a paragraph is too long to balance (> 6 lines)', () => {
    const long = `${text} ${text}`;
    const l = lay(long, {}, { box: 220 });
    expect(l.lines.length).toBeGreaterThan(6);
    expect(l.lines.map(lineText)).toEqual(greedy(long, 220));
    l.lines.forEach((line, i) => {
      expect(line.width).toBeLessThanOrEqual(220 + 0.5);
      const next = l.lines[i + 1];
      if (next) expect(line.width + measure(' ') + measure(lineText(next).split(' ')[0])).toBeGreaterThan(220);
    });
  });

  it('puts every word on its own line when the box fits just one', () => {
    const l = lay('alpha beta gamma delta', {}, { box: 120 });
    expect(l.lines.map(lineText)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('breaks a word wider than the box between graphemes when there is no line limit', () => {
    const word = 'Gesundheitsversicherungsunternehmen';
    const l = lay(word, {}, { box: 200 });
    expect(l.lines.length).toBeGreaterThan(1);
    expect(l.lines.map(lineText).join('')).toBe(word);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(200 + 0.5);
  });

  it('wraps CJK text between characters, filling each line', () => {
    const zh = '使用我们的应用程序轻松追踪您的日常习惯，每天进步一点点，坚持就是胜利';
    const l = lay(zh, { font: 'Inter Variable' }, { box: 110, lang: 'zh-Hans' });
    expect(l.lines.length).toBeGreaterThan(6);
    expect(l.lines.map(lineText).join('')).toBe(zh);
    l.lines.forEach((line, i) => {
      expect(line.width).toBeLessThanOrEqual(110 + 0.5);
      const next = l.lines[i + 1];
      // The next unbreakable unit: a character plus any closing punctuation glued to it (kinsoku).
      if (next) expect(line.width + measure(/^.[，。、！？]*/u.exec(lineText(next))?.[0] ?? '')).toBeGreaterThan(110);
      expect(lineText(line).startsWith('，')).toBe(false);
    });
  });

  it('balances short CJK paragraphs evenly', () => {
    const ja = '毎日の習慣を簡単に記録しましょう。';
    const l = lay(ja, {}, { box: 300, lang: 'ja' });
    expect(l.lines.length).toBeGreaterThanOrEqual(2);
    const counts = l.lines.map((x) => [...lineText(x)].length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it('never starts a Japanese line with closing punctuation', () => {
    const ja = 'これはテストです。とても長い文章を書いています。';
    for (const box of [100, 120, 150, 170, 200]) {
      const l = lay(ja, {}, { box, lang: 'ja' });
      for (const line of l.lines) expect(lineText(line).startsWith('。')).toBe(false);
    }
  });

  it('keeps every Arabic word whole inside a run', () => {
    const ar = 'تتبع عاداتك اليومية بسهولة وابن سلسلة نجاحات';
    const words = new Set(ar.split(' '));
    const l = lay(ar, { font: 'Cairo Variable' }, { box: 180, rtl: true, lang: 'ar-SA' });
    expect(l.lines.length).toBeGreaterThan(1);
    for (const line of l.lines) {
      expect(line.runs).toHaveLength(1);
      for (const w of lineText(line).split(' ')) expect(words.has(w)).toBe(true);
    }
  });

  it('keeps a highlighted Arabic word as one run', () => {
    const l = lay('تتبع *عاداتك* اليومية', { font: 'Cairo Variable' }, { box: 1000, rtl: true, lang: 'ar-SA' });
    expect(l.lines[0].runs.map((r) => [r.text, r.highlighted])).toEqual([
      ['تتبع ', false],
      ['عاداتك', true],
      [' اليومية', false],
    ]);
  });
});

describe('auto-fit', () => {
  const long = 'Plan your week, track every habit and celebrate each streak';

  it('shrinks in 4% steps until the text fits maxLines', () => {
    const free = lay(long);
    expect(free.lines.length).toBeGreaterThan(2);
    const l = lay(long, { maxLines: 2 });
    expect(l.lines.length).toBeLessThanOrEqual(2);
    expect(l.overflow).toBe(false);
    expect(l.fontPx).toBeLessThan(32);
    expect(l.fontPx).toBeGreaterThanOrEqual(32 * 0.6 - 1e-9);
    const step = (1 - l.fontPx / 32) / 0.04;
    expect(Math.abs(step - Math.round(step))).toBeLessThan(1e-6);
    // The previous (bigger) step would not have fitted.
    const bigger = lay(long, { size: (l.fontPx + 32 * 0.04) / U, maxLines: 0 });
    expect(bigger.lines.length).toBeGreaterThan(2);
    expect(l.lineHeightPx).toBeCloseTo(l.fontPx * 1.15);
  });

  it('does not shrink text that already fits', () => {
    expect(lay('Short', { maxLines: 1 }).fontPx).toBe(32);
    expect(lay(long, { maxLines: 0 }).fontPx).toBe(32);
  });

  it('reports overflow at 60% and keeps every line', () => {
    const huge = `${long} ${long} ${long}`;
    const l = lay(huge, { maxLines: 1 });
    expect(l.overflow).toBe(true);
    expect(l.fontPx).toBeCloseTo(32 * 0.6);
    expect(l.lines.length).toBeGreaterThan(1);
    expect(l.lines.map(lineText).join(' ')).toBe(huge);
    expect(l.height).toBeCloseTo(l.lines.length * l.lineHeightPx);
  });

  it('shrinks a long German word instead of breaking it', () => {
    const word = 'Gesundheitsversicherung';
    expect(lay(word, { maxLines: 0 }).lines.length).toBeGreaterThan(1);
    const l = lay(word, { maxLines: 2 });
    expect(l.lines.map(lineText)).toEqual([word]);
    expect(l.fontPx).toBeLessThan(32);
    expect(l.lines[0].width).toBeLessThanOrEqual(300 + 0.5);
  });

  it('counts hard breaks against maxLines', () => {
    const l = lay('one\ntwo\nthree', { maxLines: 2 });
    expect(l.overflow).toBe(true);
    expect(l.lines).toHaveLength(3);
  });

  it('handles very long input quickly', () => {
    const big = 'lorem ipsum dolor sit amet '.repeat(150);
    const t0 = performance.now();
    const l = lay(big, { maxLines: 3 });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(l.overflow).toBe(true);
  });
});

describe('directions and letter spacing', () => {
  it('lays out Arabic paragraphs right-to-left and Latin-only ones left-to-right', () => {
    expect(lay('مرحبا بالعالم', {}, { rtl: true, lang: 'ar-SA' }).lines[0].rtl).toBe(true);
    expect(lay('Hello world', {}, { rtl: true, lang: 'ar-SA' }).lines[0].rtl).toBe(false);
    expect(lay('Wajha يساعدك', {}, { rtl: true, lang: 'ar-SA' }).lines[0].rtl).toBe(true);
    expect(lay('مرحبا', {}, { rtl: false }).lines[0].rtl).toBe(true);
  });

  it('adds letter spacing for Latin text', () => {
    const plain = lay('HELLO', {}, { box: 1000 });
    const spaced = lay('HELLO', { letterSpacing: 0.1 }, { box: 1000 });
    expect(spaced.lines[0].spacing).toBeCloseTo(3.2);
    expect(spaced.lines[0].width - plain.lines[0].width).toBeCloseTo(5 * 3.2, 0);
  });

  it('emulates letter spacing per grapheme where ctx.letterSpacing is missing', () => {
    const native = lay('HELLO', { letterSpacing: 0.1 }, { box: 1000 });
    const manual = lay('HELLO', { letterSpacing: 0.1 }, { box: 1000, layout: { nativeSpacing: false } });
    expect(manual.nativeSpacing).toBe(false);
    expect(Math.abs(manual.lines[0].width - native.lines[0].width)).toBeLessThan(4);
  });

  it('never spaces Arabic letters apart', () => {
    const plain = lay('مرحبا', { font: 'Cairo Variable' }, { rtl: true, lang: 'ar-SA', box: 1000 });
    const spaced = lay('مرحبا', { font: 'Cairo Variable', letterSpacing: 0.2 }, { rtl: true, lang: 'ar-SA', box: 1000 });
    expect(spaced.lines[0].spacing).toBe(0);
    expect(spaced.lines[0].width).toBeCloseTo(plain.lines[0].width);
    // Even inside a left-to-right paragraph.
    expect(lay('Hi مرحبا', { letterSpacing: 0.2 }, { box: 1000 }).lines[0].spacing).toBe(0);
  });
});

describe('robustness', () => {
  it('survives NaN, negative and missing values', () => {
    const { ctx } = testCanvas(10, 10);
    const bad = { ...textStyle(), size: NaN, lineHeight: NaN, letterSpacing: Infinity, maxLines: NaN, weight: -5 } as TextStyle;
    expect(() => layoutText(ctx, { text: 'Hello world', style: bad, boxWidth: NaN, unit: NaN, rtl: false, lang: 'en-US' })).not.toThrow();
    const l = layoutText(ctx, { text: 'Hi', style: bad, boxWidth: -10, unit: 0, rtl: false, lang: 'en-US' });
    expect(l.lines.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(l.height)).toBe(true);
    expect(() => layoutText(ctx, { text: 42 as unknown as string, style: undefined as unknown as TextStyle, boxWidth: 100, unit: 100, rtl: false, lang: 'en-US' })).not.toThrow();
  });

  it('accepts invalid language tags', () => {
    expect(() => lay('istanbul *x*', { transform: 'uppercase' }, { lang: 'not a tag!!' })).not.toThrow();
  });

  it('leaves the context state untouched', () => {
    const { ctx } = testCanvas(10, 10);
    ctx.font = '10px serif';
    ctx.direction = 'ltr';
    layoutText(ctx, { text: 'مرحبا world', style: textStyle({ letterSpacing: 0.1 }), boxWidth: 100, unit: U, rtl: true, lang: 'ar-SA' });
    expect(ctx.font).toBe('10px serif');
    expect(ctx.direction).toBe('ltr');
    expect(ctx.letterSpacing).toBe('0px');
  });
});

describe('drawTextBlock', () => {
  it('aligns start to the left for LTR and to the right for RTL', () => {
    const ltr = inkBounds(drawn(lay('Hi', { align: 'start' }, { box: 300 })), 400, 160);
    expect(ltr.minX).toBeLessThan(50 + 8);
    expect(ltr.maxX).toBeLessThan(200);
    const rtl = inkBounds(drawn(lay('مرحبا', { align: 'start', font: 'Cairo Variable' }, { box: 300, rtl: true, lang: 'ar-SA' })), 400, 160);
    expect(rtl.maxX).toBeGreaterThan(350 - 8);
    expect(rtl.minX).toBeGreaterThan(200);
    const end = inkBounds(drawn(lay('مرحبا', { align: 'end', font: 'Cairo Variable' }, { box: 300, rtl: true, lang: 'ar-SA' })), 400, 160);
    expect(end.minX).toBeLessThan(50 + 8);
  });

  it('centres lines and the block', () => {
    const b = inkBounds(drawn(lay('Hello', { align: 'center' })), 400, 160);
    expect(Math.abs((b.minX + b.maxX) / 2 - 200)).toBeLessThan(3);
    // Single line: glyphs sit inside the line box around the block centre.
    expect(b.minY).toBeGreaterThan(80 - 32);
    expect(b.maxY).toBeLessThan(80 + 32);
  });

  it('draws nothing for empty text', () => {
    const b = inkBounds(drawn(lay('')), 400, 160);
    expect(b.maxX).toBe(-1);
  });

  it('paints highlighted words in the highlight colour', () => {
    const ctx = drawn(lay('*HH*', { highlight: '#ff0000', color: '#0000ff' }));
    const d = ctx.getImageData(0, 0, 400, 160).data;
    let red = 0;
    let blue = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && d[i] > 200 && d[i + 2] < 50) red++;
      if (d[i + 3] > 200 && d[i + 2] > 200 && d[i] < 50) blue++;
    }
    expect(red).toBeGreaterThan(50);
    expect(blue).toBe(0);
  });

  it('puts a marker pill behind highlighted words with readable text on it', () => {
    const layout = lay('*HH*', { highlightMode: 'marker', highlight: '#5b21b6', color: '#111111', align: 'center' });
    const ctx = drawn(layout);
    const b = inkBounds(ctx, 400, 160);
    const pill = pixel(ctx, b.minX + 2, (b.minY + b.maxY) / 2);
    expect(pill.slice(0, 3)).toEqual([0x5b, 0x21, 0xb6]);
    // The text on a dark pill turns white.
    const d = ctx.getImageData(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++;
    expect(white).toBeGreaterThan(30);
  });

  it('trims spaces at the edges of a highlighted run from the pill', () => {
    const tight = inkBounds(drawn(lay('*HH*', { highlightMode: 'marker', highlight: '#ff0000' })), 400, 160);
    const spaced = inkBounds(drawn(lay('* HH *', { highlightMode: 'marker', highlight: '#ff0000' })), 400, 160);
    expect(Math.abs(spaced.maxX - spaced.minX - (tight.maxX - tight.minX))).toBeLessThan(3);
  });

  it('draws the text shadow', () => {
    const ctx = drawn(lay('HH', { color: '#000000', shadow: { color: '#ff0000', blur: 0, x: 0, y: 0.05 } }));
    const d = ctx.getImageData(0, 0, 400, 160).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] < 60) red++;
    expect(red).toBeGreaterThan(50);
  });

  it('orders bidi pieces so a Latin phrase split by highlights still reads left to right', () => {
    const layout = lay('اشترك في Wajha *Pro*', { font: 'Cairo Variable' }, { box: 1000, rtl: true, lang: 'ar-SA' });
    const base = testCanvas(1100, 120).ctx;
    base.translate(550, 60);
    const { ctx, calls } = recording(base);
    drawTextBlock(ctx, layout, { unit: U });
    const x = (t: string) => calls.find((c) => c.text.includes(t))?.x ?? NaN;
    expect(x('Wajha')).toBeLessThan(x('Pro'));
    expect(x('Pro')).toBeLessThan(x('اشترك'));
  });

  it('places runs right-to-left in pure Arabic lines', () => {
    const layout = lay('تتبع *عاداتك* اليومية', { font: 'Cairo Variable' }, { box: 1000, rtl: true, lang: 'ar-SA' });
    const base = testCanvas(1100, 120).ctx;
    base.translate(550, 60);
    const { ctx, calls } = recording(base);
    drawTextBlock(ctx, layout, { unit: U });
    expect(calls.map((c) => c.text)).toEqual([' اليومية', 'عاداتك', 'تتبع ']);
    expect(calls[0].x).toBeLessThan(calls[1].x);
    expect(calls[1].x).toBeLessThan(calls[2].x);
  });

  it('draws spaced text per grapheme when emulating letter spacing', () => {
    const layout = lay('ABC', { letterSpacing: 0.2 }, { box: 1000, layout: { nativeSpacing: false } });
    const base = testCanvas(600, 120).ctx;
    base.translate(300, 60);
    const { ctx, calls } = recording(base);
    drawTextBlock(ctx, layout, { unit: U });
    expect(calls.map((c) => c.text)).toEqual(['A', 'B', 'C']);
    expect(calls[1].x - calls[0].x).toBeCloseTo(measure('A') + 0.2 * 32, 0);
  });
});

/** Draws a layout centred on a wide canvas and records its fillText calls. */
function drawCalls(layout: LaidText): FillCall[] {
  const base = testCanvas(1200, 400).ctx;
  base.translate(600, 200);
  const { ctx, calls } = recording(base);
  drawTextBlock(ctx, layout, { unit: U });
  return calls;
}

describe('mixed-direction lines', () => {
  const calls = (text: string, style: Partial<TextStyle>, rtl: boolean, lang: string) => drawCalls(lay(text, style, { box: 1000, rtl, lang }));
  /** WebKit resolves the text of the call into one direction run (one embedding level). */
  const oneRun = (c: FillCall) => new Set(resolveLevels(c.text, c.rtl)).size === 1;

  it('draws one direction per fillText call, highlights or not', () => {
    // WebKit draws the direction runs of one call in turn and carries the vertical offset of
    // a run's first glyph (Arabic marks and dots) over to the next run: "iOS 18" after
    // "كلياً" floats a third of the font size above the baseline (e2e/text-baseline.spec.ts).
    const cases: [string, boolean, string, string][] = [
      ['iOS 18 جديد كلياً', true, 'ar-SA', 'Cairo Variable'],
      ['السعر $9.99 شهرياً', true, 'ar-SA', 'Noto Sans Arabic Variable'],
      ['خصم ٥٠٪ اليوم', true, 'ar-SA', 'Cairo Variable'],
      ['Now in العربية too', false, 'en-US', 'Inter Variable'],
      ['חסוך 50% הערב', true, 'he', 'Rubik Variable'],
      ['اشترك في *Wajha Pro* اليوم', true, 'ar-SA', 'Cairo Variable'],
    ];
    for (const [text, rtl, lang, font] of cases) {
      const drawn = calls(text, { font }, rtl, lang);
      expect(drawn.length, text).toBeGreaterThan(1);
      for (const c of drawn) expect(oneRun(c), `${text}: ${JSON.stringify(c.text)}`).toBe(true);
      // Cuts fall only between directions: every right-to-left word reaches one call whole.
      for (const word of plainText(text).split(' ').filter((w) => strongDirections(w).rtl)) expect(drawn.some((c) => c.text.includes(word)), word).toBe(true);
      // Nothing is lost or drawn twice.
      expect([...drawn.map((c) => c.text).join('')].sort()).toEqual([...plainText(text)].sort());
    }
  });

  it('places the pieces in visual order', () => {
    const ar = calls('iOS 18 جديد كلياً', { font: 'Cairo Variable' }, true, 'ar-SA');
    expect(ar.map((c) => [c.text, c.rtl])).toEqual([
      [' جديد كلياً', true],
      ['iOS 18', false],
    ]);
    expect(ar[0].x).toBeLessThan(ar[1].x);
    const en = calls('Now in العربية too', { font: 'Inter Variable' }, false, 'en-US');
    expect(en.map((c) => [c.text, c.rtl])).toEqual([
      ['Now in ', false],
      ['العربية', true],
      [' too', false],
    ]);
    expect(en[0].x).toBeLessThan(en[1].x);
    expect(en[1].x).toBeLessThan(en[2].x);
  });

  it('keeps bracket pairs with the words they enclose', () => {
    expect(calls('جديد Wajha (Pro)', { font: 'Cairo Variable' }, true, 'ar-SA').map((c) => [c.text, c.rtl])).toEqual([
      ['Wajha (Pro)', false],
      ['جديد ', true],
    ]);
    expect(calls('Now in العربية (جديد) too', { font: 'Cairo Variable' }, false, 'en-US').map((c) => [c.text, c.rtl])).toEqual([
      ['Now in ', false],
      ['العربية (جديد)', true],
      [' too', false],
    ]);
  });

  it('keeps a line of one direction in one call per run', () => {
    expect(calls('تتبع عاداتك اليومية!', { font: 'Cairo Variable' }, true, 'ar-SA').map((c) => [c.text, c.rtl])).toEqual([['تتبع عاداتك اليومية!', true]]);
    expect(calls('Track every habit, 24/7', {}, false, 'en-US').map((c) => [c.text, c.rtl])).toEqual([['Track every habit, 24/7', false]]);
  });
});

describe('marker pills', () => {
  const marker: Partial<TextStyle> = { highlightMode: 'marker', highlight: '#ff0000', color: '#000000', size: 0.15 };

  /** Which columns of a drawn canvas hold pill pixels (red) and glyph pixels (black). */
  function columns(ctx: Ctx2D, w: number, h: number): { pill: boolean[]; ink: boolean[] } {
    const d = ctx.getImageData(0, 0, w, h).data;
    const pill = new Array<boolean>(w).fill(false);
    const ink = new Array<boolean>(w).fill(false);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const x = (i / 4) % w;
      if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) pill[x] = true;
      else if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80) ink[x] = true;
    }
    return { pill, ink };
  }

  /** Blank columns between the pill and the glyphs to its left and right. */
  function gaps(layout: LaidText): { left: number; right: number } {
    const W = 1200;
    const { pill, ink } = columns(drawn(layout, W, 200, W / 2, 100), W, 200);
    const start = pill.indexOf(true);
    const end = pill.lastIndexOf(true);
    expect(start).toBeGreaterThan(0);
    const before = ink.slice(0, start).lastIndexOf(true);
    const after = ink.indexOf(true, end + 1);
    expect(before).toBeGreaterThanOrEqual(0);
    expect(after).toBeGreaterThan(end);
    return { left: start - before - 1, right: after - end - 1 };
  }

  it('keeps a full word space between the pill and the words beside it', () => {
    const layout = lay('Plan the *perfect* road trip', marker, { box: 1100 });
    expect(layout.lines).toHaveLength(1);
    const space = measure(' ', marker, layout.fontPx);
    const g = gaps(layout);
    expect(g.left).toBeGreaterThanOrEqual(space - 1);
    expect(g.right).toBeGreaterThanOrEqual(space - 1);
  });

  it('does the same for right-to-left pills', () => {
    const style = { ...marker, font: 'Cairo Variable' };
    const layout = lay('تتبع *عاداتك* اليومية', style, { box: 1100, rtl: true, lang: 'ar-SA' });
    const space = measure(' ', style, layout.fontPx);
    const g = gaps(layout);
    expect(g.left).toBeGreaterThanOrEqual(space - 1);
    expect(g.right).toBeGreaterThanOrEqual(space - 1);
  });

  it('lets the pill hang past the line ends instead of indenting the text', () => {
    const style = { ...marker, align: 'start' as const };
    const plain = lay('Plan the road', style, { box: 1000 });
    const first = lay('*Plan* the road', style, { box: 1000 });
    // Room is reserved after the pill only.
    expect(first.lines[0].width).toBeCloseTo(plain.lines[0].width + 0.14 * first.fontPx, 1);
    const firstInk = (l: LaidText) => columns(drawn(l, 1200, 200, 600, 100), 1200, 200).ink.indexOf(true);
    expect(Math.abs(firstInk(first) - firstInk(plain))).toBeLessThanOrEqual(1);
  });

  it('wraps with the reserved room and draws lines exactly as wide as laid out', () => {
    const text = 'Plan the *perfect* road trip with *friends* and the *whole family*';
    const style = { ...marker, size: 0.08, align: 'end' as const };
    const box = 300;
    const l = lay(text, style, { box });
    expect(l.lines.length).toBeGreaterThan(2);
    for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(box + 0.5);
    expect(l.lines.map(lineText).join(' ')).toBe(plainText(text));
    // Right-aligned: the first piece of every line starts exactly one line width from the right edge.
    const drawnCalls = drawCalls(l);
    const ys = [...new Set(drawnCalls.map((c) => c.y))];
    expect(ys).toHaveLength(l.lines.length);
    ys.forEach((y, i) => {
      const x = Math.min(...drawnCalls.filter((c) => c.y === y).map((c) => c.x));
      expect(box / 2 - x).toBeCloseTo(l.lines[i].width, 3);
    });
  });

  it('reserves nothing for colour highlights, blank or invisible pills', () => {
    const runsWidth = (l: LaidText) => l.lines[0].runs.reduce((s, r) => s + r.width, 0);
    const color = lay('Plan the *perfect* road trip', { ...marker, highlightMode: 'color' }, { box: 1100 });
    expect(color.lines[0].width).toBeCloseTo(runsWidth(color), 6);
    for (const text of ['Plan the * * road', 'Plan the*⁠*road']) {
      const l = lay(text, marker, { box: 1100 });
      expect(l.lines[0].width, JSON.stringify(text)).toBeCloseTo(runsWidth(l), 6);
    }
  });
});

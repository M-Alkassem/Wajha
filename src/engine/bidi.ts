/**
 * Just enough of the Unicode Bidirectional Algorithm (UAX #9) to order the
 * runs of one line. The text painter never hands mixed-direction text to a
 * single fillText: the browser can only reorder text inside each call, so
 * when highlight markup splits a line into runs, "اشترك في Wajha *Pro*"
 * would come out as "Pro Wajha"; and WebKit draws the direction runs of one
 * call from left to right, carrying the vertical offset of a run's first
 * glyph (Arabic marks and dots) over to the next run, so in one call
 * "iOS 18 جديد كلياً" puts "iOS 18" well above the baseline of the Arabic
 * words to its left. Resolving implicit levels here (rules W1-W7, BD16 and
 * N0 for bracket pairs, N1-N2, I1-I2, L1-L2; no explicit embeddings or
 * isolates, which slide copy does not use) lets the painter cut lines at
 * direction changes and place the pieces in visual order.
 *
 * Character classes come from a compact range table covering Latin, Greek,
 * Cyrillic, Hebrew, Arabic (incl. Persian/Urdu digits), CJK, emoji and the
 * common punctuation and symbol blocks. Unlisted code points are L.
 */

export const L = 0;
export const R = 1;
export const AL = 2;
export const EN = 3;
export const ES = 4;
export const ET = 5;
export const AN = 6;
export const CS = 7;
export const NSM = 8;
export const BN = 9;
export const B = 10;
export const S = 11;
export const WS = 12;
export const ON = 13;

export type BidiClass = number;

/** [first, last, class] — sorted, non-overlapping; everything else is L. */
export const BIDI_RANGES: readonly (readonly [number, number, BidiClass])[] = [
  [0x0000, 0x0008, BN],
  [0x0009, 0x0009, S],
  [0x000a, 0x000a, B],
  [0x000b, 0x000b, S],
  [0x000c, 0x000c, WS],
  [0x000d, 0x000d, B],
  [0x000e, 0x001b, BN],
  [0x001c, 0x001e, B],
  [0x001f, 0x001f, S],
  [0x0020, 0x0020, WS],
  [0x0021, 0x0022, ON],
  [0x0023, 0x0025, ET],
  [0x0026, 0x002a, ON],
  [0x002b, 0x002b, ES],
  [0x002c, 0x002c, CS],
  [0x002d, 0x002d, ES],
  [0x002e, 0x002f, CS],
  [0x0030, 0x0039, EN],
  [0x003a, 0x003a, CS],
  [0x003b, 0x0040, ON],
  [0x005b, 0x0060, ON],
  [0x007b, 0x007e, ON],
  [0x007f, 0x0084, BN],
  [0x0085, 0x0085, B],
  [0x0086, 0x009f, BN],
  [0x00a0, 0x00a0, CS],
  [0x00a1, 0x00a1, ON],
  [0x00a2, 0x00a5, ET],
  [0x00a6, 0x00a9, ON],
  [0x00ab, 0x00ac, ON],
  [0x00ad, 0x00ad, BN],
  [0x00ae, 0x00af, ON],
  [0x00b0, 0x00b1, ET],
  [0x00b2, 0x00b3, EN],
  [0x00b4, 0x00b4, ON],
  [0x00b6, 0x00b8, ON],
  [0x00b9, 0x00b9, EN],
  [0x00bb, 0x00bf, ON],
  [0x00d7, 0x00d7, ON],
  [0x00f7, 0x00f7, ON],
  [0x02b9, 0x02ba, ON],
  [0x02c2, 0x02cf, ON],
  [0x02d2, 0x02df, ON],
  [0x02e5, 0x02ed, ON],
  [0x02ef, 0x02ff, ON],
  [0x0300, 0x036f, NSM],
  [0x0374, 0x0375, ON],
  [0x037e, 0x037e, ON],
  [0x0384, 0x0385, ON],
  [0x0387, 0x0387, ON],
  [0x03f6, 0x03f6, ON],
  [0x0483, 0x0489, NSM],
  [0x058a, 0x058a, ON],
  [0x058d, 0x058e, ON],
  [0x058f, 0x058f, ET],
  [0x0590, 0x0590, R],
  [0x0591, 0x05bd, NSM],
  [0x05be, 0x05be, R],
  [0x05bf, 0x05bf, NSM],
  [0x05c0, 0x05c0, R],
  [0x05c1, 0x05c2, NSM],
  [0x05c3, 0x05c3, R],
  [0x05c4, 0x05c5, NSM],
  [0x05c6, 0x05c6, R],
  [0x05c7, 0x05c7, NSM],
  [0x05c8, 0x05ff, R],
  [0x0600, 0x0605, AN],
  [0x0606, 0x0607, ON],
  [0x0608, 0x0608, AL],
  [0x0609, 0x060a, ET],
  [0x060b, 0x060b, AL],
  [0x060c, 0x060c, CS],
  [0x060d, 0x060d, AL],
  [0x060e, 0x060f, ON],
  [0x0610, 0x061a, NSM],
  [0x061b, 0x064a, AL],
  [0x064b, 0x065f, NSM],
  [0x0660, 0x0669, AN],
  [0x066a, 0x066a, ET],
  [0x066b, 0x066c, AN],
  [0x066d, 0x066f, AL],
  [0x0670, 0x0670, NSM],
  [0x0671, 0x06d5, AL],
  [0x06d6, 0x06dc, NSM],
  [0x06dd, 0x06dd, AN],
  [0x06de, 0x06de, ON],
  [0x06df, 0x06e4, NSM],
  [0x06e5, 0x06e6, AL],
  [0x06e7, 0x06e8, NSM],
  [0x06e9, 0x06e9, ON],
  [0x06ea, 0x06ed, NSM],
  [0x06ee, 0x06ef, AL],
  [0x06f0, 0x06f9, EN],
  [0x06fa, 0x0710, AL],
  [0x0711, 0x0711, NSM],
  [0x0712, 0x072f, AL],
  [0x0730, 0x074a, NSM],
  [0x074b, 0x07a5, AL],
  [0x07a6, 0x07b0, NSM],
  [0x07b1, 0x07bf, AL],
  [0x07c0, 0x07ea, R],
  [0x07eb, 0x07f3, NSM],
  [0x07f4, 0x07f5, R],
  [0x07f6, 0x07f9, ON],
  [0x07fa, 0x07fc, R],
  [0x07fd, 0x07fd, NSM],
  [0x07fe, 0x0815, R],
  [0x0816, 0x082d, NSM],
  [0x082e, 0x0858, R],
  [0x0859, 0x085b, NSM],
  [0x085c, 0x085f, R],
  [0x0860, 0x088f, AL],
  [0x0890, 0x0891, AN],
  [0x0892, 0x0897, AL],
  [0x0898, 0x089f, NSM],
  [0x08a0, 0x08c9, AL],
  [0x08ca, 0x08e1, NSM],
  [0x08e2, 0x08e2, AN],
  [0x08e3, 0x08ff, NSM],
  [0x0e3f, 0x0e3f, ET],
  [0x1680, 0x1680, WS],
  [0x180e, 0x180e, BN],
  [0x1ab0, 0x1aff, NSM],
  [0x1dc0, 0x1dff, NSM],
  [0x2000, 0x200a, WS],
  [0x200b, 0x200d, BN],
  [0x200f, 0x200f, R],
  [0x2010, 0x2027, ON],
  [0x2028, 0x2028, WS],
  [0x2029, 0x2029, B],
  [0x202a, 0x202e, BN],
  [0x202f, 0x202f, CS],
  [0x2030, 0x2034, ET],
  [0x2035, 0x2043, ON],
  [0x2044, 0x2044, CS],
  [0x2045, 0x205e, ON],
  [0x205f, 0x205f, WS],
  [0x2060, 0x206f, BN],
  [0x2070, 0x2070, EN],
  [0x2074, 0x2079, EN],
  [0x207a, 0x207b, ES],
  [0x207c, 0x207e, ON],
  [0x2080, 0x2089, EN],
  [0x208a, 0x208b, ES],
  [0x208c, 0x208e, ON],
  [0x20a0, 0x20cf, ET],
  [0x20d0, 0x20f0, NSM],
  [0x2100, 0x2101, ON],
  [0x2103, 0x2106, ON],
  [0x2108, 0x2109, ON],
  [0x2114, 0x2114, ON],
  [0x2116, 0x2118, ON],
  [0x211e, 0x2123, ON],
  [0x2125, 0x2125, ON],
  [0x2127, 0x2127, ON],
  [0x2129, 0x2129, ON],
  [0x212e, 0x212e, ET],
  [0x213a, 0x213b, ON],
  [0x2140, 0x2144, ON],
  [0x214a, 0x214d, ON],
  [0x2150, 0x215f, ON],
  [0x2189, 0x218b, ON],
  [0x2190, 0x2211, ON],
  [0x2212, 0x2212, ES],
  [0x2213, 0x2213, ET],
  [0x2214, 0x2335, ON],
  [0x237b, 0x2394, ON],
  [0x2396, 0x2487, ON],
  [0x2488, 0x249b, EN],
  [0x24ea, 0x26ab, ON],
  [0x26ad, 0x27ff, ON],
  [0x2900, 0x2b73, ON],
  [0x2b76, 0x2bff, ON],
  [0x2ce5, 0x2cea, ON],
  [0x2cef, 0x2cf1, NSM],
  [0x2cf9, 0x2cff, ON],
  [0x2d7f, 0x2d7f, NSM],
  [0x2de0, 0x2dff, NSM],
  [0x2e00, 0x2e7f, ON],
  [0x2e80, 0x2ffb, ON],
  [0x3000, 0x3000, WS],
  [0x3001, 0x3004, ON],
  [0x3008, 0x3020, ON],
  [0x302a, 0x302d, NSM],
  [0x3030, 0x3030, ON],
  [0x3036, 0x3037, ON],
  [0x303d, 0x303f, ON],
  [0x3099, 0x309a, NSM],
  [0x309b, 0x309c, ON],
  [0x30a0, 0x30a0, ON],
  [0x30fb, 0x30fb, ON],
  [0x31c0, 0x31e3, ON],
  [0x321d, 0x321e, ON],
  [0x3250, 0x325f, ON],
  [0x327c, 0x327e, ON],
  [0x32b1, 0x32bf, ON],
  [0x32cc, 0x32cf, ON],
  [0x3377, 0x337a, ON],
  [0x33de, 0x33df, ON],
  [0x33ff, 0x33ff, ON],
  [0x4dc0, 0x4dff, ON],
  [0xa490, 0xa4c6, ON],
  [0xa60d, 0xa60f, ON],
  [0xa66f, 0xa672, NSM],
  [0xa673, 0xa673, ON],
  [0xa674, 0xa67d, NSM],
  [0xa67e, 0xa67f, ON],
  [0xa69e, 0xa69f, NSM],
  [0xa6f0, 0xa6f1, NSM],
  [0xa700, 0xa721, ON],
  [0xa788, 0xa788, ON],
  [0xfb1d, 0xfb1d, R],
  [0xfb1e, 0xfb1e, NSM],
  [0xfb1f, 0xfb28, R],
  [0xfb29, 0xfb29, ES],
  [0xfb2a, 0xfb4f, R],
  [0xfb50, 0xfd3d, AL],
  [0xfd3e, 0xfd4f, ON],
  [0xfd50, 0xfdce, AL],
  [0xfdcf, 0xfdcf, ON],
  [0xfdd0, 0xfdef, BN],
  [0xfdf0, 0xfdfc, AL],
  [0xfdfd, 0xfdff, ON],
  [0xfe00, 0xfe0f, NSM],
  [0xfe10, 0xfe19, ON],
  [0xfe20, 0xfe2f, NSM],
  [0xfe30, 0xfe4f, ON],
  [0xfe50, 0xfe50, CS],
  [0xfe51, 0xfe51, ON],
  [0xfe52, 0xfe52, CS],
  [0xfe54, 0xfe54, ON],
  [0xfe55, 0xfe55, CS],
  [0xfe56, 0xfe5e, ON],
  [0xfe5f, 0xfe5f, ET],
  [0xfe60, 0xfe61, ON],
  [0xfe62, 0xfe63, ES],
  [0xfe64, 0xfe66, ON],
  [0xfe68, 0xfe68, ON],
  [0xfe69, 0xfe6a, ET],
  [0xfe6b, 0xfe6b, ON],
  [0xfe70, 0xfefe, AL],
  [0xfeff, 0xfeff, BN],
  [0xff01, 0xff02, ON],
  [0xff03, 0xff05, ET],
  [0xff06, 0xff0a, ON],
  [0xff0b, 0xff0b, ES],
  [0xff0c, 0xff0c, CS],
  [0xff0d, 0xff0d, ES],
  [0xff0e, 0xff0f, CS],
  [0xff10, 0xff19, EN],
  [0xff1a, 0xff1a, CS],
  [0xff1b, 0xff20, ON],
  [0xff3b, 0xff40, ON],
  [0xff5b, 0xff65, ON],
  [0xffe0, 0xffe1, ET],
  [0xffe2, 0xffe4, ON],
  [0xffe5, 0xffe6, ET],
  [0xffe8, 0xffee, ON],
  [0xfff9, 0xfffd, ON],
  [0x10800, 0x10cff, R],
  [0x10d00, 0x10d23, AL],
  [0x10d24, 0x10d27, NSM],
  [0x10d28, 0x10d2f, AL],
  [0x10d30, 0x10d39, AN],
  [0x10d3a, 0x10e5f, R],
  [0x10e60, 0x10e7e, AN],
  [0x10e7f, 0x10f2f, R],
  [0x10f30, 0x10f45, AL],
  [0x10f46, 0x10f50, NSM],
  [0x10f51, 0x10f6f, AL],
  [0x10f70, 0x10fff, R],
  [0x1e800, 0x1ec6f, R],
  [0x1ec70, 0x1ecbf, AL],
  [0x1ecc0, 0x1ecff, R],
  [0x1ed00, 0x1ed4f, AL],
  [0x1ed50, 0x1edff, R],
  [0x1ee00, 0x1eeef, AL],
  [0x1eef0, 0x1eef1, ON],
  [0x1eef2, 0x1eeff, AL],
  [0x1ef00, 0x1efff, R],
  [0x1f000, 0x1f0ff, ON],
  [0x1f100, 0x1f10a, EN],
  [0x1f10b, 0x1f10f, ON],
  [0x1f12f, 0x1f12f, ON],
  [0x1f16a, 0x1f16f, ON],
  [0x1f1ad, 0x1f1ad, ON],
  [0x1f260, 0x1f265, ON],
  [0x1f300, 0x1fbff, ON],
  [0xe0001, 0xe007f, BN],
  [0xe0100, 0xe01ef, NSM],
];

/** Bidi class of a code point (simplified, see BIDI_RANGES). */
export function bidiClass(cp: number): BidiClass {
  // Fast path for ASCII letters, the bulk of Latin copy.
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return L;
  let lo = 0;
  let hi = BIDI_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = BIDI_RANGES[mid];
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return r[2];
  }
  return L;
}

/** Which strong directions occur in a string (R covers AL too). */
export function strongDirections(text: string): { ltr: boolean; rtl: boolean } {
  let ltr = false;
  let rtl = false;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) ?? 0;
    if (cp > 0xffff) i++;
    const c = bidiClass(cp);
    if (c === L) ltr = true;
    else if (c === R || c === AL) rtl = true;
    if (ltr && rtl) break;
  }
  return { ltr, rtl };
}

/**
 * True when every character of a line resolves to the paragraph level, so
 * the line reads in one direction and needs no reordering (the same answer
 * as resolveLevels, without resolving): an RTL line has no L, EN or AN
 * characters, an LTR line no R, AL or AN.
 */
export function isUnidirectional(text: string, rtl: boolean): boolean {
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) ?? 0;
    if (cp > 0xffff) i++;
    const c = bidiClass(cp);
    if (c === AN || (rtl ? c === L || c === EN : c === R || c === AL)) return false;
  }
  return true;
}

/** Classes per UTF-16 code unit; both halves of a surrogate pair get the pair's class. */
function classify(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) ?? 0;
    const c = bidiClass(cp);
    out[i] = c;
    if (cp > 0xffff && i + 1 < text.length) out[++i] = c;
  }
  return out;
}

const isNeutral = (t: number) => t === B || t === S || t === WS || t === ON;

/** Opening paired bracket -> its closing bracket (BidiBrackets.txt, the brackets the class table marks ON). */
const CLOSER = new Map<number, number>([
  [0x005b, 0x005d],
  [0x007b, 0x007d],
  [0xff3b, 0xff3d],
  [0xff5b, 0xff5d],
]);
// Blocks where every opening bracket is directly followed by its closing one.
for (const [first, last] of [
  [0x0028, 0x0029], [0x2045, 0x2046], [0x207d, 0x207e], [0x208d, 0x208e], [0x2308, 0x230b], [0x2329, 0x232a],
  [0x2768, 0x2775], [0x27c5, 0x27c6], [0x27e6, 0x27ef], [0x2983, 0x2998], [0x29d8, 0x29db], [0x29fc, 0x29fd],
  [0x2e22, 0x2e29], [0x2e55, 0x2e5c], [0x3008, 0x3011], [0x3014, 0x301b], [0xfe59, 0xfe5e], [0xff08, 0xff09],
  [0xff5f, 0xff60], [0xff62, 0xff63],
]) {
  for (let cp = first; cp < last; cp += 2) CLOSER.set(cp, cp + 1);
}
const CLOSERS = new Set(CLOSER.values());
/** U+2329/U+232A are canonically equivalent to U+3008/U+3009 and pair with them. */
const canonicalBracket = (cp: number) => (cp === 0x2329 ? 0x3008 : cp === 0x232a ? 0x3009 : cp);

/**
 * Bracket pairs of a line (rule BD16), sorted by the opening bracket. Only
 * brackets still typed ON take part; at most 63 may be open at once.
 */
function bracketPairs(text: string, t: Uint8Array): [number, number][] {
  const pairs: [number, number][] = [];
  const open: { close: number; at: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    if (t[i] !== ON) continue;
    const cp = text.charCodeAt(i);
    const close = CLOSER.get(cp);
    if (close !== undefined) {
      if (open.length === 63) break;
      open.push({ close: canonicalBracket(close), at: i });
    } else if (CLOSERS.has(cp)) {
      const c = canonicalBracket(cp);
      for (let k = open.length - 1; k >= 0; k--) {
        if (open[k].close !== c) continue;
        pairs.push([open[k].at, i]);
        open.length = k;
        break;
      }
    }
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}

/**
 * Embedding level of every UTF-16 code unit of one line of text, for a
 * paragraph of the given base direction (0 = LTR, 1 = RTL).
 */
export function resolveLevels(text: string, rtl: boolean): Uint8Array {
  const n = text.length;
  const orig = classify(text);
  const t = orig.slice();
  const sos = rtl ? R : L;

  // W1: non-spacing marks (and ignorable format characters) take the previous type.
  let prev: number = sos;
  for (let i = 0; i < n; i++) {
    if (t[i] === NSM || t[i] === BN) t[i] = prev;
    else prev = t[i];
  }
  // W2: European digits after Arabic letters are Arabic digits. W3: AL becomes R.
  let strong: number = sos;
  for (let i = 0; i < n; i++) {
    const c = t[i];
    if (c === EN && strong === AL) t[i] = AN;
    if (c === L || c === R || c === AL) strong = c;
  }
  for (let i = 0; i < n; i++) if (t[i] === AL) t[i] = R;
  // W4: a single separator between two numbers joins them.
  for (let i = 1; i < n - 1; i++) {
    const c = t[i];
    if (c !== ES && c !== CS) continue;
    const a = t[i - 1];
    const b = t[i + 1];
    if (a === EN && b === EN) t[i] = EN;
    else if (c === CS && a === AN && b === AN) t[i] = AN;
  }
  // W5: terminators (%, $, °) next to European numbers belong to them.
  for (let i = 0; i < n; ) {
    if (t[i] !== ET) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && t[j] === ET) j++;
    if ((i > 0 && t[i - 1] === EN) || (j < n && t[j] === EN)) for (let k = i; k < j; k++) t[k] = EN;
    i = j;
  }
  // W6: leftover separators and terminators are neutral.
  for (let i = 0; i < n; i++) if (t[i] === ES || t[i] === ET || t[i] === CS) t[i] = ON;
  // W7: European numbers in a left-to-right context behave as L.
  strong = sos;
  for (let i = 0; i < n; i++) {
    const c = t[i];
    if (c === EN && strong === L) t[i] = L;
    if (c === L || c === R) strong = c;
  }
  // N0: a bracket pair takes the paragraph direction when the text inside it has that
  // direction, else the direction of what it encloses if the text before it runs the same
  // way: "جديد Wajha (Pro)" keeps both brackets with "Pro", as text fields show it.
  // Numbers count as R here.
  const strongOf = (c: number) => (c === L ? L : c === R || c === EN || c === AN ? R : -1);
  for (const [open, close] of bracketPairs(text, t)) {
    let dir = -1;
    let opposite = false;
    for (let k = open + 1; k < close && dir < 0; k++) {
      const s = strongOf(t[k]);
      if (s === sos) dir = sos;
      else if (s >= 0) opposite = true;
    }
    if (dir < 0 && opposite) {
      // The first strong type before the pair: the opposite direction if it continues
      // the bracketed text, else the paragraph direction (sos when there is none).
      dir = sos;
      for (let k = open - 1; k >= 0; k--) {
        const s = strongOf(t[k]);
        if (s >= 0) {
          dir = s;
          break;
        }
      }
    }
    if (dir < 0) continue;
    t[open] = dir;
    t[close] = dir;
    // Marks on a bracket follow it (W1 gave them the bracket's old type).
    for (let k = open + 1; k < n && orig[k] === NSM; k++) t[k] = dir;
    for (let k = close + 1; k < n && orig[k] === NSM; k++) t[k] = dir;
  }
  // N1/N2: neutrals between same-direction text take it, else the paragraph direction.
  const dirOf = (c: number) => (c === L ? L : R);
  for (let i = 0; i < n; ) {
    if (!isNeutral(t[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && isNeutral(t[j])) j++;
    const before = i > 0 ? dirOf(t[i - 1]) : sos;
    const after = j < n ? dirOf(t[j]) : sos;
    const d = before === after ? before : sos;
    for (let k = i; k < j; k++) t[k] = d;
    i = j;
  }
  // I1/I2: implicit levels.
  const levels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = t[i];
    if (rtl) levels[i] = c === R ? 1 : 2;
    else levels[i] = c === L ? 0 : c === R ? 1 : 2;
  }
  // L1: trailing whitespace returns to the paragraph level.
  const base = rtl ? 1 : 0;
  for (let i = n - 1; i >= 0; i--) {
    const c = orig[i];
    if (c !== WS && c !== BN && c !== S && c !== B) break;
    levels[i] = base;
  }
  return levels;
}

/**
 * Visual order (indices into `levels`) of items with the given embedding
 * levels: rule L2, reversing every maximal sequence at or above each level
 * from the highest down to the lowest odd one.
 */
export function visualOrder(levels: ArrayLike<number>): number[] {
  const n = levels.length;
  const order = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return order;
  let max = 0;
  let min = 255;
  for (let i = 0; i < n; i++) {
    max = Math.max(max, levels[i]);
    min = Math.min(min, levels[i]);
  }
  const lowestOdd = min % 2 === 1 ? min : min + 1;
  for (let level = max; level >= lowestOdd; level--) {
    for (let i = 0; i < n; ) {
      if (levels[order[i]] < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && levels[order[j]] >= level) j++;
      for (let a = i, b = j - 1; a < b; a++, b--) {
        const tmp = order[a];
        order[a] = order[b];
        order[b] = tmp;
      }
      i = j;
    }
  }
  return order;
}

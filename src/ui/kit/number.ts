/**
 * Number helpers behind NumberField and the sliders: rounding, clamping,
 * forgiving parsing of what people type (units, Arabic-Indic digits, decimal
 * commas, small arithmetic like "120/2") and the scrub maths.
 */

/** Largest number of decimals we ever keep; beyond this floats only add noise. */
export const MAX_PRECISION = 10;

export interface NumberRange {
  min?: number;
  max?: number;
}

/** Clamps to [min, max]; NaN becomes min (or 0 when min is unbounded). */
export function clamp(value: number, min = -Infinity, max = Infinity): number {
  if (Number.isNaN(value)) return Number.isFinite(min) ? min : 0;
  if (min > max) return min;
  return value < min ? min : value > max ? max : value;
}

/** Decimals needed to represent a step exactly: 1 -> 0, 0.1 -> 1, 0.25 -> 2. */
export function precisionFromStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let p = 0; p <= MAX_PRECISION; p++) {
    const scaled = step * 10 ** p;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return p;
  }
  return MAX_PRECISION;
}

/** Rounds to `precision` decimals without the classic 1.005 -> 1 float error; never returns -0. */
export function roundTo(value: number, precision: number): number {
  if (!Number.isFinite(value)) return value;
  const p = Math.max(0, Math.min(MAX_PRECISION, Math.floor(precision)));
  const factor = 10 ** p;
  // Round the magnitude so halves go away from zero symmetrically, nudged by
  // a relative epsilon so 1.005 (stored as 1.00499...) still rounds up.
  const scaled = Math.abs(value) * factor;
  // Past 2^52 every float is already a whole number at this precision; the nudge would only add error.
  if (scaled >= 2 ** 52) return value === 0 ? 0 : value;
  const magnitude = Math.round(scaled * (1 + Number.EPSILON)) / factor;
  if (magnitude === 0) return 0;
  return value < 0 ? -magnitude : magnitude;
}

/** Wraps into [min, max) — used for angles, so 370° becomes 10° and -10° becomes 350°. */
export function wrap(value: number, min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 0) return clamp(value, min, max);
  const r = (((value - min) % span) + span) % span;
  const out = r + min;
  return out === 0 ? 0 : out;
}

export interface NormalizeOptions extends NumberRange {
  precision?: number;
  /** Wrap around instead of clamping (needs finite min and max). */
  wrap?: boolean;
}

/** Rounds then clamps (or wraps) a candidate value. Non-finite input returns `fallback`. */
export function normalizeNumber(value: number, opts: NormalizeOptions, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  const { min = -Infinity, max = Infinity, precision = MAX_PRECISION } = opts;
  if (opts.wrap && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    const w = wrap(roundTo(value, precision), min, max);
    // Rounding can land exactly on max (359.999 -> 360); fold it back to min.
    const r = roundTo(w, precision);
    return r >= max ? min : r;
  }
  return clamp(roundTo(value, precision), min, max);
}

/**
 * True when a field with `precision` decimals shows `a` and `b` as the same
 * number. Committing one over the other would then change nothing the user
 * can see, only drop decimals the field does not show: a stage drag stores
 * 74.1692 %, which the X field shows as 74.17.
 */
export function sameAtPrecision(a: number, b: number, precision: number): boolean {
  return roundTo(a, precision) === roundTo(b, precision);
}

/** "12.50" -> "12.5", "-0" -> "0"; non-finite values render as an empty string. */
export function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '';
  const p = Math.max(0, Math.min(MAX_PRECISION, Math.floor(precision)));
  let s = roundTo(value, p).toFixed(p);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

const DIGIT_BLOCKS = [
  0x0660, // Arabic-Indic ٠-٩
  0x06f0, // Extended Arabic-Indic (Persian, Urdu) ۰-۹
  0x0966, // Devanagari ०-९
  0x09e6, // Bengali ০-৯
  0xff10, // Fullwidth ０-９
];

/** Maps localized digits and separators to ASCII so "١٢٫٥" parses as 12.5. */
export function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const block = DIGIT_BLOCKS.find((b) => code >= b && code <= b + 9);
    if (block !== undefined) {
      out += String(code - block);
      continue;
    }
    switch (ch) {
      case '٫': // Arabic decimal separator
      case '．':
        out += '.';
        break;
      case '٬': // Arabic thousands separator
      case ' ':
      case ' ':
        break;
      case '،': // Arabic comma
      case '，':
        out += ',';
        break;
      case '−': // minus sign
      case '－':
      case '–':
        out += '-';
        break;
      case '＋':
        out += '+';
        break;
      case '×':
      case '✕':
        out += '*';
        break;
      case '÷':
        out += '/';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

const MAX_EXPRESSION_LENGTH = 200;
const MAX_DEPTH = 32;

/**
 * Evaluates + - * / and parentheses with the usual precedence, e.g.
 * "100/3 + 2". No eval, no variables. Returns null for anything invalid,
 * division by zero or a non-finite result.
 */
export function evaluateExpression(source: string): number | null {
  const text = source.replace(/\s+/g, '');
  if (!text || text.length > MAX_EXPRESSION_LENGTH) return null;
  let pos = 0;
  let depth = 0;
  let failed = false;

  const fail = (): number => {
    failed = true;
    return NaN;
  };

  const parseNumber = (): number => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(pos));
    if (!m) return fail();
    pos += m[0].length;
    return Number(m[0]);
  };

  const parseFactor = (): number => {
    if (failed) return NaN;
    const ch = text[pos];
    if (ch === '+' || ch === '-') {
      pos++;
      if (++depth > MAX_DEPTH) return fail();
      const v = parseFactor();
      depth--;
      return ch === '-' ? -v : v;
    }
    if (ch === '(') {
      pos++;
      if (++depth > MAX_DEPTH) return fail();
      const v = parseExpr();
      depth--;
      if (text[pos] !== ')') return fail();
      pos++;
      return v;
    }
    return parseNumber();
  };

  const parseTerm = (): number => {
    let v = parseFactor();
    while (!failed && (text[pos] === '*' || text[pos] === '/')) {
      const op = text[pos++];
      const rhs = parseFactor();
      if (op === '/') {
        if (rhs === 0) return fail();
        v /= rhs;
      } else {
        v *= rhs;
      }
    }
    return v;
  };

  function parseExpr(): number {
    let v = parseTerm();
    while (!failed && (text[pos] === '+' || text[pos] === '-')) {
      const op = text[pos++];
      const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = parseExpr();
  if (failed || pos !== text.length || !Number.isFinite(result)) return null;
  return result;
}

const UNIT_ALIASES: Record<string, string[]> = {
  '°': ['°', 'deg', 'degrees', 'º'],
  '%': ['%', 'pct', '٪'],
  px: ['px'],
  pt: ['pt'],
  em: ['em'],
  ms: ['ms'],
  s: ['s', 'sec'],
  x: ['x', '×'],
};

export interface ParseNumberOptions {
  /** Unit shown by the field; it (and its aliases) may be typed after the number. */
  unit?: string;
  /** Current value, for relative input such as "*2" or "/2". */
  current?: number;
}

/**
 * Parses what a person typed into a number field. Accepts localized digits,
 * a trailing unit, a decimal comma ("12,5"), arithmetic ("10+5*2") and a
 * leading * or / applied to the current value ("*2" doubles it).
 */
export function parseNumberInput(text: string, opts: ParseNumberOptions = {}): number | null {
  let s = normalizeDigits(text).trim();
  if (!s) return null;
  const unit = opts.unit?.trim();
  if (unit) {
    const aliases = UNIT_ALIASES[unit.toLowerCase()] ?? [unit];
    const lower = s.toLowerCase();
    for (const alias of [unit, ...aliases].sort((a, b) => b.length - a.length)) {
      if (alias && lower.endsWith(alias.toLowerCase())) {
        s = s.slice(0, s.length - alias.length).trim();
        break;
      }
    }
  }
  if (!s) return null;
  // With a dot present, commas group thousands ("1,234.5"). Without one, a
  // comma before exactly three digits groups thousands ("1,000") and any
  // other comma is a decimal separator ("12,5", "1,5+2,5").
  s = s.includes('.') ? s.replaceAll(',', '') : s.replace(/,(?=\d{3}(?!\d))/g, '').replaceAll(',', '.');
  if ((s[0] === '*' || s[0] === '/') && opts.current !== undefined && Number.isFinite(opts.current)) {
    s = `(${opts.current})${s}`;
  }
  return evaluateExpression(s);
}

export interface FieldTextOptions extends NormalizeOptions {
  /** Unit shown by the field (see parseNumberInput). */
  unit?: string;
  /** The field's value now: relative input applies to it, and invalid input falls back to it. */
  current: number;
  /** Value for cleared text, e.g. 0 for "no limit". Without one, clearing changes nothing. */
  emptyValue?: number;
}

/**
 * The value a number field commits for what was typed, or null to keep its
 * current value: for nonsense, for cleared text without an empty value, and
 * for the number the field shows typed again, which must not round away the
 * decimals it does not show. The typed number is compared before clamping
 * or wrapping, so typing the shown 180° of 179.97 keeps it rather than
 * wrapping it to -180°.
 */
export function valueFromFieldText(text: string, opts: FieldTextOptions): number | null {
  if (text.trim() === '') return opts.emptyValue ?? null;
  const parsed = parseNumberInput(text, { unit: opts.unit, current: opts.current });
  if (parsed === null || sameAtPrecision(parsed, opts.current, opts.precision ?? MAX_PRECISION)) return null;
  return normalizeNumber(parsed, opts, opts.current);
}

/** Step multiplier for held modifiers: Shift = x10, Alt/Option = x0.1. */
export function modifierMultiplier(mods: { shiftKey?: boolean; altKey?: boolean }): number {
  return (mods.shiftKey ? 10 : 1) * (mods.altKey ? 0.1 : 1);
}

export interface StepOptions extends NormalizeOptions {
  step: number;
  multiplier?: number;
}

/** One keyboard step up (+1) or down (-1), normalized. */
export function stepValue(value: number, direction: 1 | -1, opts: StepOptions): number {
  const base = Number.isFinite(value) ? value : Number.isFinite(opts.min ?? NaN) ? (opts.min as number) : 0;
  const delta = direction * opts.step * (opts.multiplier ?? 1);
  return normalizeNumber(base + delta, opts, base);
}

export interface ScrubOptions extends NumberRange {
  step: number;
  /** Steps per pixel of pointer travel. */
  speed?: number;
  multiplier?: number;
  wrap?: boolean;
}

/**
 * Advances the unrounded scrub accumulator by a pointer delta. Keeping the
 * raw float (and clamping it) means fine Alt-scrubbing still moves rounded
 * values, and reversing at a limit responds immediately.
 */
export function scrubAccumulate(raw: number, dxPixels: number, opts: ScrubOptions): number {
  if (!Number.isFinite(dxPixels) || dxPixels === 0) return raw;
  const next = raw + dxPixels * opts.step * (opts.speed ?? 1) * (opts.multiplier ?? 1);
  if (!Number.isFinite(next)) return raw;
  return opts.wrap ? next : clamp(next, opts.min, opts.max);
}

/**
 * The value a scrub that began at `start` sends for its accumulator `raw`:
 * `raw` normalized, but `start` itself wherever that equals the normalized
 * start. A scrub back where it began (the accumulator there, give or take
 * float error) then leaves the value exactly as it was, decimals the field
 * does not show included, so the app records no undo step for it.
 */
export function scrubValue(raw: number, start: number, opts: NormalizeOptions): number {
  const next = normalizeNumber(raw, opts, start);
  return next === normalizeNumber(start, opts, start) ? start : next;
}

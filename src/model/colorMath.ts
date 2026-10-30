/**
 * Just enough colour math for the model to pick readable defaults (text on
 * a theme background, highlight colours). The engine has its own helpers;
 * the model stays free of engine imports.
 */
import type { Background, Color, Fill } from './types';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses #rgb, #rrggbb and #rrggbbaa (alpha ignored). Anything else is mid grey. */
function rgb(hex: string): Rgb {
  const s = typeof hex === 'string' ? hex.replace(/^#/, '') : '';
  const full = /^[0-9a-fA-F]{3,4}$/.test(s) ? [...s].map((c) => c + c).join('') : s;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) return { r: 128, g: 128, b: 128 };
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

function toHex(c: Rgb): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = rgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB mix of opaque colours; t = 0 gives a, t = 1 gives b. */
export function mixColors(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return toHex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

/** "#RRGGBB" with an alpha byte appended (alpha 0..1). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  return `${toHex(rgb(hex))}${hex2(a * 255)}`;
}

function average(colors: string[]): string {
  if (colors.length === 0) return '#808080';
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of colors) {
    const v = rgb(c);
    r += v.r;
    g += v.g;
    b += v.b;
  }
  return toHex({ r: r / colors.length, g: g / colors.length, b: b / colors.length });
}

/**
 * One colour that stands for what a fill looks like on average, used to
 * decide between light and dark text. Mesh blobs cover only part of the
 * canvas, so they count for half against the base.
 */
export function fillTone(fill: Fill): Color {
  // Defensive about shape: callers may hand in data that was never validated.
  switch (fill?.type) {
    case 'solid':
      return toHex(rgb(fill.color));
    case 'linear':
    case 'radial':
      return average(Array.isArray(fill.stops) ? fill.stops.map((s) => s.color) : []);
    case 'mesh': {
      const points = Array.isArray(fill.points) ? fill.points : [];
      return points.length ? mixColors(fill.base, average(points.map((p) => p.color)), 0.5) : toHex(rgb(fill.base));
    }
    case 'image':
      // Photos behind store copy are usually darkened; a tint decides when present.
      return fill.tint ? mixColors('#303030', fill.tint, 0.5) : '#303030';
    default:
      return '#808080';
  }
}

/** Representative colour of a background (its fill; patterns are too faint to matter). */
export function backgroundTone(bg: Background): Color {
  return fillTone(bg?.fill);
}

/** True when light text reads better than dark text on `tone`. */
export function prefersLightText(tone: string): boolean {
  return contrast(tone, '#ffffff') >= contrast(tone, '#14121f');
}

/**
 * The palette colour that pops most against `tone` while staying distinct
 * from the body text colour; `fallback` when none reaches 3:1.
 */
export function pickAccent(palette: readonly string[], tone: string, text: string, fallback: string): string {
  let best: string | null = null;
  let bestScore = 0;
  for (const c of palette) {
    const vsBg = contrast(c, tone);
    if (vsBg < 3 || contrast(c, text) < 1.4) continue;
    // Prefer saturated accents over near-greys of equal contrast.
    const { r, g, b } = rgb(c);
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const score = vsBg * (0.5 + chroma);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? toHex(rgb(best)) : fallback;
}

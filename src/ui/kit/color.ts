/**
 * Colour helpers for the kit's pickers. Values are model colours: "#RRGGBB"
 * or "#RRGGBBAA" (alpha dropped when fully opaque), always upper-case so
 * equal colours compare equal as strings.
 */

/** The model's colour rule (see model/validate.ts). */
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

/**
 * Normalizes typed or pasted hex: "#abc", "abc", "#abcd", "aabbcc", "#aabbccdd"
 * (any case, surrounding spaces) -> "#AABBCC" / "#AABBCCDD". Returns null for
 * anything else. With `alpha: false` the alpha channel is dropped.
 */
export function normalizeHex(input: string, opts: { alpha?: boolean } = {}): string | null {
  const s = input.trim().replace(/^#/, '');
  if (!/^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return null;
  let full = s.length <= 4 ? [...s].map((ch) => ch + ch).join('') : s;
  full = full.toUpperCase();
  if (full.length === 8 && (opts.alpha === false || full.endsWith('FF'))) full = full.slice(0, 6);
  return `#${full}`;
}

export interface SplitColor {
  /** "#RRGGBB" */
  rgb: string;
  /** 0..1 */
  alpha: number;
}

/** Splits a hex colour into its opaque part and alpha. Invalid input reads as opaque black. */
export function splitAlpha(hex: string): SplitColor {
  const n = normalizeHex(hex);
  if (!n) return { rgb: '#000000', alpha: 1 };
  if (n.length === 7) return { rgb: n, alpha: 1 };
  return { rgb: n.slice(0, 7), alpha: parseInt(n.slice(7), 16) / 255 };
}

const byte = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0').toUpperCase();

/** Applies an alpha (0..1) to a colour, keeping its RGB. Fully opaque results drop the alpha pair. */
export function withAlpha(hex: string, alpha: number): string {
  const { rgb } = splitAlpha(hex);
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  const pair = byte(a * 255);
  return pair === 'FF' ? rgb : `${rgb}${pair}`;
}

/** 0..1 alpha -> whole percent. */
export function alphaToPercent(alpha: number): number {
  if (!Number.isFinite(alpha)) return 100;
  return Math.round(Math.min(1, Math.max(0, alpha)) * 100);
}

/** True when two colours are the same once normalized ("#fff" equals "#FFFFFFFF"). */
export function colorsEqual(a: string, b: string): boolean {
  const x = normalizeHex(a);
  return x !== null && x === normalizeHex(b);
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string): Rgba {
  const { rgb, alpha } = splitAlpha(hex);
  return {
    r: parseInt(rgb.slice(1, 3), 16),
    g: parseInt(rgb.slice(3, 5), 16),
    b: parseInt(rgb.slice(5, 7), 16),
    a: alpha,
  };
}

export function rgbaToHex(c: Rgba): string {
  return withAlpha(`#${byte(c.r)}${byte(c.g)}${byte(c.b)}`, c.a);
}

/** Linear interpolation in sRGB, alpha included; t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgba(a);
  const y = hexToRgba(b);
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return rgbaToHex({
    r: x.r + (y.r - x.r) * k,
    g: x.g + (y.g - x.g) * k,
    b: x.b + (y.b - x.b) * k,
    a: x.a + (y.a - x.a) * k,
  });
}

/**
 * Parses a CSS colour as returned by the EyeDropper API or pasted from
 * elsewhere: hex in any form, rgb()/rgba() with commas or spaces, alpha as
 * a fraction or a percentage.
 */
export function parseCssColor(input: string): string | null {
  const s = input.trim();
  const hex = normalizeHex(s);
  if (hex) return hex;
  const m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (!m) return null;
  const channel = (v: string) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));
  const alpha = (v: string | undefined) => (v === undefined ? 1 : v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
  const parts = [channel(m[1]), channel(m[2]), channel(m[3]), alpha(m[4])];
  if (parts.some((v) => !Number.isFinite(v))) return null;
  return rgbaToHex({ r: parts[0], g: parts[1], b: parts[2], a: parts[3] });
}

/** WCAG relative luminance of the opaque colour, 0..1. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgba(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Whether marks drawn on top of a swatch (check marks, handles) should be
 * dark. Translucent colours are judged against the mid-grey checkerboard.
 */
export function prefersDarkInk(hex: string): boolean {
  const { alpha } = splitAlpha(hex);
  const lum = relativeLuminance(hex) * alpha + 0.45 * (1 - alpha);
  return lum > 0.42;
}

/* Recent colours ------------------------------------------------------ */

/** How many recently committed colours the pickers remember (memory only). */
export const MAX_RECENT_COLORS = 12;

let recent: readonly string[] = [];
const listeners = new Set<() => void>();

/** Most recent first. A new array is returned after every change (useSyncExternalStore-friendly). */
export function getRecentColors(): readonly string[] {
  return recent;
}

/** Remembers a committed colour for this session; invalid colours are ignored. */
export function addRecentColor(color: string): void {
  const n = normalizeHex(color);
  if (!n) return;
  if (recent[0] === n) return;
  recent = [n, ...recent.filter((c) => c !== n)].slice(0, MAX_RECENT_COLORS);
  for (const fn of [...listeners]) fn();
}

export function subscribeRecentColors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets every recent colour (tests and "reset" actions). */
export function clearRecentColors(): void {
  if (recent.length === 0) return;
  recent = [];
  for (const fn of [...listeners]) fn();
}

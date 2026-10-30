/**
 * Colours of a mock app, derived from the project palette. Palettes often
 * contain background colours (white, near-black, beige) next to the brand
 * colour, so accents are chosen by colourfulness and nudged until they read
 * on the mock's own background.
 */
import type { Color } from '../../../model/types';
import { chroma, contrast, darken, fromHsl, lighten, luminance, mix, parseColor, rotateHue, toHex, toHsl } from '../../color';

export interface MockTheme {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  sidebar: string;
  /** Numerals and icons. */
  text: string;
  text2: string;
  /** Skeleton text: titles, body copy, faint placeholders. */
  bar: string;
  bar2: string;
  bar3: string;
  line: string;
  shadow: string;
  /** Four harmonious accents, the first one is the brand colour. */
  accents: [string, string, string, string];
  accent: string;
  /** Text/bars on top of an accent fill. */
  onAccent: string;
  /** Accent tint for chips and icon tiles. */
  soft: string;
  /** A colour close in hue to the accent, so two-colour gradients never turn muddy. */
  companion: string;
  /** Rich single-hue gradient for hero cards: start and end colours. */
  brand: [string, string];
  good: string;
  bad: string;
  warn: string;
}

/** Vivid, modern defaults for projects without a usable palette. */
export const FALLBACK_PALETTE: readonly string[] = ['#6c5ce7', '#ff7a59', '#00b894', '#0984e3'];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Palette colours that can carry an accent: colourful enough and not almost white or black. */
export function usableAccents(palette: readonly Color[]): string[] {
  const seen = new Set<string>();
  const vividOnes: string[] = [];
  const dullOnes: string[] = [];
  for (const raw of palette) {
    if (typeof raw !== 'string' || !HEX.test(raw.trim())) continue;
    const rgb = parseColor(raw);
    if (rgb.a < 0.5) continue;
    const c = toHex({ ...rgb, a: 1 }, false);
    if (seen.has(c)) continue;
    seen.add(c);
    const L = luminance(c);
    const ch = chroma(c);
    if (ch < 0.16 || L > 0.86 || L < 0.012) continue;
    // Keep the designer's order, but let muted tones follow the vivid ones.
    (ch >= 0.35 ? vividOnes : dullOnes).push(c);
  }
  return [...vividOnes, ...dullOnes];
}

/** Distance between two hues on the colour wheel, 0..180 degrees. */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(toHsl(a).h - toHsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/** Moves a colour towards white or black until it reaches `target` contrast with `bg` (bounded). */
function ensureContrast(c: string, bg: string, target: number): string {
  let out = c;
  const towardsWhite = luminance(bg) < 0.3;
  for (let i = 0; i < 10 && contrast(out, bg) < target; i++) out = towardsWhite ? lighten(out, 0.12) : darken(out, 0.1);
  return out;
}

/** Keeps saturation alive after contrast fixes so accents never turn grey-brown. */
function vivid(c: string): string {
  const hsl = toHsl(c);
  return hsl.s < 0.45 && chroma(c) > 0.12 ? fromHsl({ ...hsl, s: Math.min(1, hsl.s + 0.25) }) : c;
}

export function mockTheme(palette: readonly Color[], dark: boolean): MockTheme {
  const picked = usableAccents(palette);
  const src = picked.length > 0 ? picked : [...FALLBACK_PALETTE];
  const first = src[0];
  // Fill missing accents with hue rotations of the brand colour: always harmonious.
  const rotations = [38, -48, 152];
  const raw: string[] = [first];
  for (let i = 1; i < 4; i++) raw.push(src[i] ?? rotateHue(first, rotations[i - 1]));

  const bg = dark ? '#0b0b0f' : '#f3f4f7';
  const surface = dark ? '#17181d' : '#ffffff';
  const accents = raw.map((c) => vivid(ensureContrast(c, dark ? surface : '#ffffff', dark ? 3.2 : 2.4))) as MockTheme['accents'];
  const accent = accents[0];
  const text = dark ? '#f4f5f7' : '#0e1015';
  const onAccent = contrast('#ffffff', accent) >= 2.3 ? '#ffffff' : '#101114';
  // sRGB blends of distant hues (teal + amber) go olive; keep gradient partners within ~70 degrees.
  const companion = hueDistance(accent, accents[1]) <= 70 ? accents[1] : rotateHue(accent, 34);

  return {
    dark,
    bg,
    surface,
    surface2: dark ? '#22232a' : '#eef0f4',
    sidebar: dark ? '#121217' : '#f7f7f9',
    text,
    text2: dark ? '#8f92a1' : '#7a808c',
    bar: mix(text, surface, dark ? 0.16 : 0.2),
    bar2: mix(text, surface, dark ? 0.66 : 0.74),
    bar3: mix(text, surface, dark ? 0.82 : 0.88),
    line: dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(16, 22, 34, 0.07)',
    shadow: dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(22, 30, 52, 0.1)',
    accents,
    accent,
    onAccent,
    soft: mix(accent, surface, dark ? 0.78 : 0.86),
    companion,
    brand: [lighten(accent, 0.05), darken(mix(accent, companion, 0.6), 0.16)],
    good: dark ? '#34d399' : '#12a46b',
    bad: dark ? '#fb7185' : '#e5484d',
    warn: dark ? '#fbbf24' : '#f59e0b',
  };
}

/** Accent tint over a surface, for icon tiles and chips in any accent. */
export function tint(t: MockTheme, color: string, amount = 0.86): string {
  return mix(color, t.surface, t.dark ? Math.min(amount, 0.8) : amount);
}

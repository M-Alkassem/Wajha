/** Colour helpers shared by the engine (and safe to use from the UI). */

export interface RGBA {
  /** 0..255 */
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Parses #rgb, #rgba, #rrggbb or #rrggbbaa. Anything else becomes opaque black. */
export function parseColor(input: string): RGBA {
  const s = input.trim().replace(/^#/, '');
  const ok = /^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
  if (!ok) return { r: 0, g: 0, b: 0, a: 1 };
  const full = s.length <= 4 ? [...s].map((ch) => ch + ch).join('') : s;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

export function toHex(c: RGBA, withAlpha = c.a < 1): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${withAlpha ? h(c.a * 255) : ''}`;
}

/** CSS rgba() string, optionally multiplying the alpha. */
export function rgba(color: string | RGBA, alphaMul = 1): string {
  const c = typeof color === 'string' ? parseColor(color) : color;
  const a = clamp(c.a * alphaMul, 0, 1);
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+a.toFixed(4)})`;
}

/** Linear mix in sRGB space; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const k = clamp(t, 0, 1);
  return toHex({
    r: x.r + (y.r - x.r) * k,
    g: x.g + (y.g - x.g) * k,
    b: x.b + (y.b - x.b) * k,
    a: x.a + (y.a - x.a) * k,
  });
}

export const lighten = (hex: string, amount: number) => mix(hex, '#ffffff', amount);
export const darken = (hex: string, amount: number) => mix(hex, '#000000', amount);

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = parseColor(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.4;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface HSL {
  /** Hue in degrees, 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  l: number;
}

/** sRGB to HSL. Greys report hue 0. */
export function toHsl(hex: string): HSL {
  const { r, g, b } = parseColor(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s: clamp(s, 0, 1), l };
}

/** HSL to "#rrggbb". Hue wraps; saturation and lightness are clamped. */
export function fromHsl({ h, s, l }: HSL): string {
  const hue = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
  const S = Number.isFinite(s) ? clamp(s, 0, 1) : 0;
  const L = Number.isFinite(l) ? clamp(l, 0, 1) : 0;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 });
}

/** Rotates the hue by `degrees`, keeping saturation and lightness (alpha is dropped). */
export function rotateHue(hex: string, degrees: number): string {
  const c = toHsl(hex);
  return fromHsl({ ...c, h: c.h + degrees });
}

/** Colourfulness 0 (grey) .. 1 (pure hue): max - min channel, like HSV chroma. */
export function chroma(hex: string): number {
  const { r, g, b } = parseColor(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

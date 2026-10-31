/**
 * Pure helpers behind the inspector: unit conversions between the model
 * (fractions of u, of the canvas, of the device width) and what the fields
 * show (percent, degrees), element names, font weights, screenshot status
 * and colour suggestions. No React, no store.
 */
import { BUNDLED_FONTS, languageInfo, type FontInfo } from '../../../model/catalog';
import type { DeviceFrameId, Fill, FamilyId, LangCode, Project, ShapeKind, Slide, SlideElement } from '../../../model/types';
import { RANGES } from '../../../model/rules';
import { deviceGeometry, deviceScreenAspect } from '../../../engine';

import { t } from '../../../i18n';
/* Units ------------------------------------------------------------------ */

/** Rounds away float noise (0.075 * 100 = 7.499999999999999). */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}

/** Model fraction -> percent shown in a field (0.075 -> 7.5). */
export function toPct(fraction: number): number {
  return roundTo(fraction * 100, 4);
}

/** Percent typed in a field -> model fraction (7.5 -> 0.075). */
export function fromPct(percent: number): number {
  return roundTo(percent / 100, 6);
}

/** Smallest font size the size field offers, as a fraction of u (0.4%). */
const MIN_TEXT_SIZE = 0.004;

/** One "Smaller text" step for overflowing text: about 10% smaller, on the size field's 0.1% grid. */
export function smallerTextSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_TEXT_SIZE;
  const pct = toPct(size);
  // Rounding must not cancel the step out at small sizes (0.5% * 0.9 rounds back to 0.5%).
  return Math.max(MIN_TEXT_SIZE, fromPct(Math.min(roundTo(pct * 0.9, 1), roundTo(pct - 0.1, 1))));
}

/** Degrees folded into [-180, 180), the range the rotation field shows. */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return roundTo(r, 4);
}

/**
 * Rotation for a pointer at (dx, dy) from a dial's centre: 0 points up and
 * angles grow clockwise, like the model. Shift snaps to 15°.
 */
export function rotationFromPointer(dx: number, dy: number, snap: boolean): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return normalizeRotation(snap ? Math.round(deg / 15) * 15 : Math.round(deg));
}

/** Pointer travel (px) before a press on the rotation dial turns it. */
const DIAL_DRAG_THRESHOLD = 3;

/**
 * Whether a press on the rotation dial has moved (dx, dy) far enough to turn
 * it: a click only focuses the dial and a double-click only resets it.
 */
export function dialTurnStarted(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DIAL_DRAG_THRESHOLD;
}

/** "1.2 MB", "840 KB", "312 B". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? roundTo(mb, 1) : Math.round(mb)} MB`;
}

/* Names ------------------------------------------------------------------ */

/** "headline" -> "Headline", "caption2" -> "Caption 2", "call_to-action" -> "Call to action". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d+)$/, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return 'Text';
  return spaced[0].toUpperCase() + spaced.slice(1).toLowerCase();
}

export const FRAME_LABEL: Record<DeviceFrameId, string> = {
  iphone: t('iPhone'),
  ipad: t('iPad'),
  'android-phone': t('Android phone'),
  'android-tablet': t('Android tablet'),
  macbook: t('MacBook'),
  watch: t('Watch'),
  tv: t('TV'),
  vision: t('Vision Pro'),
  browser: t('Browser'),
  none: t('Screenshot'),
};

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  circle: t('Circle'),
  rect: t('Rectangle'),
  blob: t('Blob'),
  ring: t('Ring'),
};

/** File name without its extension, for image layers. */
function stem(name: string): string {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).trim();
}

/** What the inspector header (and its placeholder) calls an element when it has no name of its own. */
export function defaultElementName(el: SlideElement, project: Project | null): string {
  switch (el.kind) {
    case 'text':
      return humanizeKey(el.key);
    case 'device':
      return FRAME_LABEL[el.frame] ?? 'Device';
    case 'shape':
      return SHAPE_LABEL[el.shape] ?? 'Shape';
    case 'image': {
      const info = project?.assets[el.assetId];
      return (info && stem(info.name)) || 'Image';
    }
  }
}

/** The element's own name, else its default name. */
export function elementName(el: SlideElement, project: Project | null): string {
  return el.name?.trim() || defaultElementName(el, project);
}

/** English language name for hints ("English", "Arabic"), without the region when it is the only variant shown. */
export function languageLabel(code: LangCode): string {
  return t(languageInfo(code).name);
}

/* Fonts ------------------------------------------------------------------ */

export const WEIGHT_NAMES: Record<number, string> = {
  100: t('Thin'),
  200: t('Extra Light'),
  300: t('Light'),
  400: t('Regular'),
  500: t('Medium'),
  600: t('Semibold'),
  700: t('Bold'),
  800: t('Extra Bold'),
  900: t('Black'),
};

/** The bundled font with this CSS family, if any. */
export function bundledFont(family: string): FontInfo | undefined {
  return BUNDLED_FONTS.find((f) => f.family === family);
}

/** Display name of a font family ("Inter Variable" -> "Inter"). */
export function fontLabel(family: string): string {
  return bundledFont(family)?.label ?? family;
}

/** Weights a font offers: its variable range, or every standard weight for unknown (system) fonts. */
export function weightRange(family: string): [number, number] {
  return bundledFont(family)?.weights ?? [100, 900];
}

/** Multiples of 100 inside the range, plus the current weight when it is not one of them. */
export function weightOptions(range: readonly [number, number], current: number): { value: string; label: string }[] {
  const lo = Math.max(100, Math.ceil(range[0] / 100) * 100);
  const hi = Math.min(900, Math.floor(range[1] / 100) * 100);
  const values: number[] = [];
  for (let w = lo; w <= hi; w += 100) values.push(w);
  if (!values.length) values.push(Math.min(900, Math.max(100, Math.round(range[0] / 100) * 100)));
  const cur = Math.round(current);
  if (Number.isFinite(cur) && !values.includes(cur)) {
    values.push(cur);
    values.sort((a, b) => a - b);
  }
  return values.map((w) => ({ value: String(w), label: WEIGHT_NAMES[w] ? `${w} · ${WEIGHT_NAMES[w]}` : String(w) }));
}

/** The weight to keep when switching to a font with `range`: the nearest one it supports. */
export function clampWeight(weight: number, range: readonly [number, number]): number {
  if (!Number.isFinite(weight)) return 400;
  if (weight >= range[0] && weight <= range[1]) return weight;
  const lo = Math.ceil(range[0] / 100) * 100;
  const hi = Math.floor(range[1] / 100) * 100;
  if (lo > hi) return Math.round(weight < range[0] ? range[0] : range[1]);
  return weight < range[0] ? lo : hi;
}

export interface FontGroup {
  id: string;
  label: string;
  fonts: { family: string; label: string; category: FontInfo['category'] | 'system' }[];
}

const CATEGORY_LABEL: Record<FontInfo['category'], string> = {
  sans: t('Sans serif'),
  display: t('Display'),
  serif: t('Serif'),
  multi: t('Multi-script'),
  arabic: t('Arabic'),
};

const CATEGORY_ORDER: FontInfo['category'][] = ['sans', 'display', 'serif', 'arabic', 'multi'];

/** Bundled fonts by category, then system fonts (minus duplicates of bundled ones), filtered by `query`. */
export function fontGroups(systemFonts: readonly string[], query: string, ownFonts: readonly string[] = []): FontGroup[] {
  const q = query.trim().toLocaleLowerCase();
  // Bundled families end in " Variable", which the picker never shows: "ar" must not match all of them.
  const matches = (label: string, family: string) =>
    !q || label.toLocaleLowerCase().includes(q) || family.replace(/\s+Variable$/i, '').toLocaleLowerCase().includes(q);
  const groups: FontGroup[] = [];
  // Fonts the project brought along come first: they are why someone added them.
  const own = ownFonts.filter((f) => f && matches(f, f)).map((f) => ({ family: f, label: f, category: 'system' as const }));
  if (own.length) groups.push({ id: 'own', label: t('Your fonts'), fonts: own });
  for (const cat of CATEGORY_ORDER) {
    const fonts = BUNDLED_FONTS.filter((f) => f.category === cat && matches(f.label, f.family)).map((f) => ({ family: f.family, label: f.label, category: f.category }));
    if (fonts.length) groups.push({ id: cat, label: CATEGORY_LABEL[cat], fonts });
  }
  const bundled = new Set(BUNDLED_FONTS.flatMap((f) => [f.family.toLocaleLowerCase(), f.label.toLocaleLowerCase()]));
  const seen = new Set<string>(ownFonts.map((f) => f.toLocaleLowerCase()));
  const system: FontGroup['fonts'] = [];
  for (const name of systemFonts) {
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key) || bundled.has(key) || name.startsWith('.')) continue;
    seen.add(key);
    if (matches(name, name)) system.push({ family: name, label: name, category: 'system' });
  }
  if (system.length) groups.push({ id: 'system', label: t('System'), fonts: system });
  return groups;
}

/** CSS font-family for previewing a font name in its own face. */
export function fontPreviewFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '')}", var(--font-ui)`;
}

/* Screenshots ------------------------------------------------------------ */

export type ShotStatus = 'own' | 'base' | 'missing';

/** Whether a slot shows its own screenshot in `lang`, the base language's, or none. */
export function shotStatus(slide: Slide, family: FamilyId, slot: string, lang: LangCode, baseLang: LangCode): ShotStatus {
  const bySlot = slide.shots[family]?.[slot];
  if (bySlot?.[lang]) return 'own';
  if (lang !== baseLang && bySlot?.[baseLang]) return 'base';
  return 'missing';
}

/** Default screen aspect (height / width) shown for a frame without a screenshot. */
export function frameAspect(frame: DeviceFrameId, family: FamilyId): number {
  return deviceScreenAspect(frame, family, null);
}

/**
 * The width (fraction of the slide's short side) that keeps a device in the
 * same space when its frame changes: the new frame fits inside the old
 * frame's outline, so a laptop that becomes a phone does not grow off the
 * slide, and a phone that becomes a laptop stays as wide as the phone was.
 */
export function widthForFrame(width: number, from: DeviceFrameId, to: DeviceFrameId, family: FamilyId): number {
  if (from === to || !(width > 0)) return width;
  const before = deviceGeometry(from, 1000, frameAspect(from, family));
  const after = deviceGeometry(to, 1000, frameAspect(to, family));
  if (!(after.width > 0 && after.height > 0 && before.width > 0 && before.height > 0)) return width;
  const fit = Math.min(before.width / after.width, before.height / after.height);
  const { min, max } = RANGES.deviceWidth;
  return Math.round(Math.min(max, Math.max(min, width * fit)) * 1e3) / 1e3;
}

/* Colours ---------------------------------------------------------------- */

const HEX6 = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** Lower-case "#rrggbb" or "#rrggbbaa" (opaque alpha dropped); other strings unchanged. */
export function canonicalColor(value: string): string {
  const m = HEX6.exec(value);
  if (!m) return value;
  const alpha = m[2]?.toLowerCase();
  return `#${m[1].toLowerCase()}${alpha && alpha !== 'ff' ? alpha : ''}`;
}

function canonical(v: unknown): unknown {
  if (typeof v === 'string') return canonicalColor(v);
  if (typeof v === 'number') return roundTo(v, 6);
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/**
 * True when two fills are the same once colours are normalised: the kit
 * emits "#AABBCC", the store keeps "#aabbcc", so identity is lost on the
 * round trip even though nothing changed.
 */
export function fillsMatch(a: Fill | null | undefined, b: Fill | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = HEX6.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/**
 * A colour to offer when the user adds a palette swatch: the first
 * saturated palette colour rotated round the hue wheel until it lands on a
 * hue the palette does not have yet.
 */
export function suggestPaletteColor(palette: readonly string[]): string {
  const hsl = palette.map(hexToHsl).filter((x): x is [number, number, number] => x !== null);
  const seed = hsl.find(([, s, l]) => s > 0.25 && l > 0.2 && l < 0.85) ?? [258, 0.85, 0.66];
  const hues = hsl.filter(([, s]) => s > 0.2).map(([h]) => h);
  const taken = (h: number) => hues.some((x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 24);
  for (const step of [150, 210, 60, 300, 90, 270, 30, 330, 120, 240, 180]) {
    const h = (seed[0] + step) % 360;
    if (!taken(h)) return hslToHex(h, Math.max(0.55, seed[1]), Math.min(0.68, Math.max(0.5, seed[2])));
  }
  return hslToHex((seed[0] + 180) % 360, seed[1], seed[2]);
}

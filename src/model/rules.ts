/**
 * Rules every persisted value follows: identifier patterns, string and array
 * limits, numeric ranges. The validators enforce them on untrusted files and
 * the editor store applies the same rules to user edits, so anything the UI
 * can produce is something the loader accepts.
 */
import { FAMILIES } from './catalog';
import type { FamilyId, LangCode } from './types';

/** Project, slide and element ids (path-safe; project ids name folders). */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Template ids: kebab-case, e.g. "sunset-glow" (and no Windows device name, see isTemplateId). */
export const TEMPLATE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Names Windows reserves for devices in every folder, whatever the case or extension. */
const WINDOWS_DEVICE_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
/** "<sha256 hex>.<ext>" */
export const ASSET_ID_RE = /^[0-9a-f]{64}\.(png|jpg|webp)$/;
export const COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** BCP-47 shaped language codes: "en-US", "zh-Hans", "es-419", "fil". */
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** Text keys ("headline") and screenshot slots ("main"). */
export const KEY_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * Keys that must never become own properties of objects we build: every
 * member plain objects inherit, because a lookup such as `texts[lang][key]`
 * would find the inherited one ("toString" reads a function, "__proto__"
 * swaps the prototype on assignment).
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

export const LIMITS = {
  /** Project, template, asset, element and author names. */
  name: 200,
  /** Slide texts and descriptions. */
  text: 2000,
  font: 100,
  tag: 40,
  path: 300,
  date: 64,
  langCode: 35,
  id: 64,
  slides: 100,
  templateSlides: 10,
  elements: 200,
  palette: 32,
  stops: 16,
  meshPoints: 16,
  tags: 20,
  languages: 100,
  textKeys: 100,
  slots: 20,
  assets: 5000,
  fonts: 24,
  galleryTemplates: 1000,
  galleryAssets: 200,
} as const;

export interface Range {
  min: number;
  max: number;
  /** Round to an integer after clamping. */
  int?: boolean;
}

/** Sane ranges for every number in the model. Lengths are fractions of u. */
export const RANGES = {
  position: { min: -2, max: 3 },
  rotation: { min: -360, max: 360 },
  unit: { min: 0, max: 1 },
  deviceWidth: { min: 0.02, max: 4 },
  textWidth: { min: 0.02, max: 6 },
  shapeSize: { min: 0.001, max: 8 },
  imageWidth: { min: 0.01, max: 8 },
  cornerRadius: { min: 0, max: 0.5 },
  shapeRadius: { min: 0, max: 1 },
  stroke: { min: 0, max: 2 },
  blur: { min: 0, max: 2 },
  shadowOffset: { min: -2, max: 2 },
  fontSize: { min: 0.004, max: 1 },
  fontWeight: { min: 1, max: 1000, int: true },
  lineHeight: { min: 0.5, max: 4 },
  /** Per-language factor on every text's line height (model/typography.ts). */
  lineSpacing: { min: 0.8, max: 2 },
  letterSpacing: { min: -0.5, max: 2 },
  maxLines: { min: 0, max: 50, int: true },
  seed: { min: 0, max: 2147483647, int: true },
  angle: { min: -360, max: 360 },
  gradientCenter: { min: -2, max: 3 },
  gradientRadius: { min: 0.01, max: 4 },
  patternScale: { min: 0.002, max: 2 },
  imageBlur: { min: 0, max: 1 },
  pixels: { min: 1, max: 100000, int: true },
  bytes: { min: 0, max: Number.MAX_SAFE_INTEGER, int: true },
  timestamp: { min: 0, max: 8.64e15, int: true },
  jpegQuality: { min: 0.5, max: 1 },
  galleryVersion: { min: 0, max: 1e9, int: true },
} as const satisfies Record<string, Range>;

/** Clamps into the range; NaN becomes the minimum so the result is always usable. */
export function clampToRange(v: number, r: Range): number {
  let x = Number.isNaN(v) ? r.min : v < r.min ? r.min : v > r.max ? r.max : v;
  if (r.int) x = Math.round(x);
  return x;
}

/** A catalog family id (own keys of FAMILIES only). */
export function isFamilyId(v: unknown): v is FamilyId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FAMILIES, v);
}

/** A BCP-47 shaped language code of sane length. */
export function isLangCode(v: unknown): v is LangCode {
  return typeof v === 'string' && v.length <= LIMITS.langCode && LANG_RE.test(v);
}

/** A record key we accept for text keys and screenshot slots. */
export function isSafeKey(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && KEY_RE.test(v) && !FORBIDDEN_KEYS.has(v);
}

/** A project, slide or element id. */
export function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= LIMITS.id && ID_RE.test(v);
}

/** "con", "aux", "nul", "prn", "com1", "lpt1"...: Windows cannot create a file or folder with that name. */
export function isWindowsDeviceName(v: string): boolean {
  return WINDOWS_DEVICE_RE.test(v);
}

/**
 * A kebab-case template id of at most 64 characters. Template ids name their
 * folder (templates/<id>/), so device names Windows reserves are refused
 * everywhere: a template made on a Mac must open on Windows too.
 */
export function isTemplateId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= LIMITS.id && TEMPLATE_ID_RE.test(v) && !isWindowsDeviceName(v);
}

/** A content-addressed asset id, "<sha256 hex>.<png|jpg|webp>". */
const FONT_FILE = /^[0-9a-f]{64}\.(ttf|otf|woff|woff2)$/;

/** "<64 hex>.<ttf|otf|woff|woff2>", the only file names allowed in fonts folders. */
export function isFontFile(v: unknown): v is string {
  return typeof v === 'string' && FONT_FILE.test(v);
}

export function isAssetId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 69 && ASSET_ID_RE.test(v);
}

/**
 * "#RRGGBB" / "#RRGGBBAA" in lower case. The short forms "#RGB" and "#RGBA"
 * are expanded because hand-written gallery JSON uses them; anything else is null.
 */
export function normalizeColor(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 9) return null;
  if (COLOR_RE.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3,4}$/.test(v)) {
    return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  }
  return null;
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * Keeps at most `max` code points (what storage counts as "characters") and
 * never splits a surrogate pair, so emoji and astral scripts survive.
 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let i = 0;
  let n = 0;
  while (i < s.length && n < max) {
    i += isHighSurrogate(s.charCodeAt(i)) && isLowSurrogate(s.charCodeAt(i + 1)) ? 2 : 1;
    n++;
  }
  return s.slice(0, i);
}

// C0 and C1 controls (incl. DEL); names are single-line.
// eslint-disable-next-line no-control-regex
const NAME_CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
// Texts keep line breaks and tabs; bidi marks (U+200E, U+2066...) are not controls and stay.
// eslint-disable-next-line no-control-regex
const TEXT_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
// A surrogate pair, or a lone half (no lookbehind: WKWebView before Safari 16.4 cannot parse it).
const SURROGATES = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;

/**
 * Replaces unpaired surrogates with U+FFFD. They are not text: file names,
 * URI encoding and the Rust side all refuse them, so a stored name with one
 * would break every export path built from it.
 */
export function wellFormed(s: string): string {
  return s.replace(SURROGATES, (m) => (m.length === 2 ? m : '\ufffd'));
}

/** Single-line name: no control characters or unpaired surrogates, trimmed, length-limited. */
export function cleanName(s: string, max: number = LIMITS.name): string {
  // Cut before the regex work so a huge hostile string costs nothing.
  const head = s.length > max * 4 + 64 ? s.slice(0, max * 4 + 64) : s;
  return truncate(wellFormed(head).replace(NAME_CONTROLS, ' ').replace(/\s+/g, ' ').trim(), max);
}

/** Slide text: CRLF/CR become LF, other controls and unpaired surrogates are removed or replaced, length-limited. */
export function cleanText(s: string, max: number = LIMITS.text): string {
  const head = s.length > max * 2 + 64 ? s.slice(0, max * 2 + 64) : s;
  return truncate(wellFormed(head).replace(/\r\n?/g, '\n').replace(TEXT_CONTROLS, ''), max);
}

/**
 * CSS family name safe to interpolate into a canvas font string
 * (`800 40px "<font>", ...`): quotes, backslashes and controls removed.
 */
export function cleanFontName(s: string, fallback: string): string {
  const head = s.length > LIMITS.font * 2 ? s.slice(0, LIMITS.font * 2) : s;
  const out = truncate(wellFormed(head).replace(NAME_CONTROLS, '').replace(/["\\;{}<>]/g, '').replace(/\s+/g, ' ').trim(), LIMITS.font);
  return out === '' ? fallback : out;
}

/** Valid catalog families in their given order, without duplicates. */
export function uniqueFamilies(list: readonly unknown[] | null | undefined): FamilyId[] {
  const out: FamilyId[] = [];
  if (!Array.isArray(list)) return out;
  for (const f of list) if (isFamilyId(f) && !out.includes(f)) out.push(f);
  return out;
}

/** Valid language codes in their given order, without duplicates, at most LIMITS.languages. */
export function uniqueLanguages(list: readonly unknown[] | null | undefined): LangCode[] {
  const out: LangCode[] = [];
  if (!Array.isArray(list)) return out;
  for (const l of list) {
    if (out.length >= LIMITS.languages) break;
    if (isLangCode(l) && !out.includes(l)) out.push(l);
  }
  return out;
}

/** Relative gallery path: "templates/sunset-glow/template.json". No "..", no leading "/", no schemes. */
export function isSafeRelPath(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > LIMITS.path) return false;
  if (!/^[A-Za-z0-9._\-/]+$/.test(v)) return false;
  return v.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

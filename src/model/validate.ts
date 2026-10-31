/**
 * Runtime validation of untrusted JSON (imported files, gallery downloads,
 * files on disk). Returns cleaned, fully-typed objects or throws
 * ValidationError naming the offending path. Owned by the model/store work package.
 *
 * Policy, applied the same way to every field:
 *  - A value of the wrong type throws (`slides[2].layouts.iphone.elements[0].width`).
 *  - A missing (or null) required value throws, unless the field has a natural
 *    default (rotation 0, opacity 1, ...), which is then used.
 *  - Numbers: NaN counts as missing, Infinity and out-of-range values are clamped.
 *  - Strings are length-limited (names 200, texts 2 000). Ids, colours, codes
 *    and enums must match their rules; slide/element ids that do not (or that
 *    repeat) are regenerated, short colours (#fff) are expanded.
 *  - Unknown keys are dropped; record entries with invalid keys (unknown
 *    families, malformed language codes, `__proto__`) are dropped.
 *  - Arrays are truncated to their limits, duplicate entries removed.
 *  - References to assets missing from `assets` are dropped: the image element
 *    is removed, an image fill falls back, the screenshot is unassigned.
 *  - Empty families / languages / slides are repaired.
 */
import { adaptLayout } from './adapt';
import { FAMILIES, sizeById } from './catalog';
import { DEFAULT_FAMILY, DEFAULT_FONT, DEFAULT_LANGUAGE, DEFAULT_PROJECT_NAME, defaultBackground, defaultExportSettings, defaultTheme, newSlide } from './defaults';
import { newId } from './ids';
import {
  LIMITS,
  RANGES,
  clampToRange,
  cleanFontName,
  cleanName,
  cleanText,
  isAssetId,
  isFontFile,
  isFamilyId,
  isId,
  isLangCode,
  isSafeKey,
  isSafeRelPath,
  isTemplateId,
  isWindowsDeviceName,
  normalizeColor,
  type Range,
} from './rules';
import type {
  AssetInfo,
  Background,
  DeviceElement,
  ProjectFont,
  DeviceFrameId,
  ElementKind,
  ExportSettings,
  ExportStructure,
  FamilyId,
  Fill,
  FrameFinish,
  GalleryEntry,
  GalleryIndex,
  GradientStop,
  ImageElement,
  LangCode,
  MeshPoint,
  Pattern,
  PatternKind,
  Project,
  Shadow,
  ShapeElement,
  ShapeKind,
  ShotMap,
  Slide,
  SlideElement,
  SlideLayout,
  Template,
  TemplateCategory,
  TemplateSlide,
  TextElement,
  TextStyle,
  Theme,
} from './types';

export class ValidationError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
    this.path = path;
  }
}

/* Allowed values ----------------------------------------------------- */

export const ELEMENT_KINDS: readonly ElementKind[] = ['device', 'text', 'shape', 'image'];
export const DEVICE_FRAMES: readonly DeviceFrameId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'macbook', 'watch', 'tv', 'vision', 'browser', 'none'];
export const FRAME_FINISHES: readonly FrameFinish[] = ['metal', 'matte', 'clay'];
export const SHAPE_KINDS: readonly ShapeKind[] = ['circle', 'rect', 'blob', 'ring'];
export const PATTERN_KINDS: readonly PatternKind[] = ['dots', 'grid', 'diagonal', 'noise', 'waves', 'rings'];
export const FILL_TYPES: readonly Fill['type'][] = ['solid', 'linear', 'radial', 'mesh', 'image'];
export const IMAGE_FITS: readonly ('cover' | 'contain' | 'tile')[] = ['cover', 'contain', 'tile'];
export const TEMPLATE_CATEGORY_LIST: readonly TemplateCategory[] = ['minimal', 'bold', 'gradient', 'dark', 'playful', 'panorama', 'elegant'];
export const EXPORT_STRUCTURES: readonly ExportStructure[] = ['stores', 'fastlane', 'flat'];

const BEZELS = ['black', 'match'] as const;
const VALIGNS = ['top', 'middle', 'bottom'] as const;
const ALIGNS = ['start', 'center', 'end'] as const;
const TRANSFORMS = ['none', 'uppercase'] as const;
const HIGHLIGHT_MODES = ['color', 'marker'] as const;
const FORMATS = ['png', 'jpeg'] as const;

/** The only persisted format version so far. */
export const CURRENT_VERSION = 1;

/* Primitives --------------------------------------------------------- */

type Json = Record<string, unknown>;

/** Asset ids that exist, for reference checks. */
export interface ValidationContext {
  assets: ReadonlySet<string>;
}

/** The reference-check context for a project's or template's asset map. */
export function contextFor(assets: Record<string, AssetInfo> | null | undefined): ValidationContext {
  return { assets: new Set(assets ? Object.keys(assets) : []) };
}

function fail(path: string, message: string): never {
  throw new ValidationError(path || '$', message);
}

/** JSON path segment: `a.b`, `a[3]`, `a["key with.dots"]`. */
function at(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key)) return path ? `${path}.${key}` : key;
  const shown = key.length > 80 ? `${key.slice(0, 80)}…` : key;
  return `${path}[${JSON.stringify(shown)}]`;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Own property only: inherited values (prototype tricks) never count. */
function get(o: Json, key: string): unknown {
  return hasOwn(o, key) ? o[key] : undefined;
}

const isMissing = (v: unknown) => v === undefined || v === null;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asObject(v: unknown, path: string): Json {
  if (!isPlainObject(v)) fail(path, 'must be an object');
  return v;
}

function objectField(o: Json, key: string, path: string): Json {
  const p = at(path, key);
  const v = get(o, key);
  if (isMissing(v)) fail(p, 'is required');
  return asObject(v, p);
}

function arrayField(o: Json, key: string, path: string, max: number, required = false): unknown[] {
  const p = at(path, key);
  const v = get(o, key);
  if (isMissing(v)) {
    if (required) fail(p, 'is required');
    return [];
  }
  if (!Array.isArray(v)) fail(p, 'must be an array');
  return v.length > max ? v.slice(0, max) : v;
}

function numberField(o: Json, key: string, path: string, range: Range, fallback?: number): number {
  const p = at(path, key);
  const v = get(o, key);
  if (isMissing(v) || (typeof v === 'number' && Number.isNaN(v))) {
    if (fallback === undefined) fail(p, 'is required');
    return fallback;
  }
  if (typeof v !== 'number') fail(p, 'must be a number');
  return clampToRange(v, range);
}

function boolField(o: Json, key: string, path: string, fallback: boolean): boolean {
  const v = get(o, key);
  if (isMissing(v)) return fallback;
  if (typeof v !== 'boolean') fail(at(path, key), 'must be true or false');
  return v;
}

function rawString(o: Json, key: string, path: string, fallback?: string): string {
  const p = at(path, key);
  const v = get(o, key);
  if (isMissing(v)) {
    if (fallback === undefined) fail(p, 'is required');
    return fallback;
  }
  if (typeof v !== 'string') fail(p, 'must be a string');
  return v;
}

function nameField(o: Json, key: string, path: string, fallback: string, max: number = LIMITS.name): string {
  return cleanName(rawString(o, key, path, fallback), max);
}

function enumField<T extends string>(o: Json, key: string, path: string, allowed: readonly T[], fallback?: T): T {
  const p = at(path, key);
  const v = get(o, key);
  if (isMissing(v)) {
    if (fallback === undefined) fail(p, 'is required');
    return fallback;
  }
  if (typeof v !== 'string') fail(p, 'must be a string');
  if (!(allowed as readonly string[]).includes(v)) fail(p, `must be one of ${allowed.join(', ')}`);
  return v as T;
}

function colorValue(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'must be a colour string');
  const c = normalizeColor(v);
  if (!c) fail(path, 'must be a hex colour like #RRGGBB or #RRGGBBAA');
  return c;
}

function colorField(o: Json, key: string, path: string, fallback?: string): string {
  const v = get(o, key);
  if (isMissing(v)) {
    if (fallback === undefined) fail(at(path, key), 'is required');
    return fallback;
  }
  return colorValue(v, at(path, key));
}

/** Own keys of a record, at most `max`, skipping keys `accept` rejects. */
function recordKeys(o: Json, max: number, accept: (k: string) => boolean): string[] {
  const out: string[] = [];
  for (const k of Object.keys(o)) {
    if (out.length >= max) break;
    if (accept(k)) out.push(k);
  }
  return out;
}

/* Paint -------------------------------------------------------------- */

/** A shadow, or null when absent. */
export function cleanShadow(v: unknown, path: string): Shadow | null {
  if (isMissing(v)) return null;
  const o = asObject(v, path);
  return {
    color: colorField(o, 'color', path),
    blur: numberField(o, 'blur', path, RANGES.blur, 0.04),
    x: numberField(o, 'x', path, RANGES.shadowOffset, 0),
    y: numberField(o, 'y', path, RANGES.shadowOffset, 0.02),
  };
}

function cleanStops(o: Json, path: string): GradientStop[] {
  const raw = arrayField(o, 'stops', path, LIMITS.stops, true);
  if (raw.length === 0) fail(at(path, 'stops'), 'needs at least one stop');
  return raw.map((s, i) => {
    const p = at(at(path, 'stops'), i);
    const so = asObject(s, p);
    return { offset: numberField(so, 'offset', p, RANGES.unit), color: colorField(so, 'color', p) };
  });
}

/** null when it is an image fill whose asset is missing (callers fall back). */
export function cleanFill(v: unknown, path: string, ctx: ValidationContext): Fill | null {
  const o = asObject(v, path);
  const type = enumField(o, 'type', path, FILL_TYPES);
  switch (type) {
    case 'solid':
      return { type, color: colorField(o, 'color', path) };
    case 'linear':
      return { type, angle: numberField(o, 'angle', path, RANGES.angle, 180), stops: cleanStops(o, path) };
    case 'radial':
      return {
        type,
        cx: numberField(o, 'cx', path, RANGES.gradientCenter, 0.5),
        cy: numberField(o, 'cy', path, RANGES.gradientCenter, 0.5),
        radius: numberField(o, 'radius', path, RANGES.gradientRadius, 0.75),
        stops: cleanStops(o, path),
      };
    case 'mesh': {
      const points: MeshPoint[] = arrayField(o, 'points', path, LIMITS.meshPoints).map((pt, i) => {
        const p = at(at(path, 'points'), i);
        const po = asObject(pt, p);
        return {
          x: numberField(po, 'x', p, RANGES.position),
          y: numberField(po, 'y', p, RANGES.position),
          color: colorField(po, 'color', p),
          radius: numberField(po, 'radius', p, RANGES.gradientRadius, 0.5),
        };
      });
      return { type, base: colorField(o, 'base', path), points };
    }
    case 'image': {
      const assetId = rawString(o, 'assetId', path);
      const tintRaw = get(o, 'tint');
      const fill: Fill = {
        type,
        assetId,
        fit: enumField(o, 'fit', path, IMAGE_FITS, 'cover'),
        opacity: numberField(o, 'opacity', path, RANGES.unit, 1),
        blur: numberField(o, 'blur', path, RANGES.imageBlur, 0),
        tint: isMissing(tintRaw) ? null : colorValue(tintRaw, at(path, 'tint')),
      };
      return isAssetId(assetId) && ctx.assets.has(assetId) ? fill : null;
    }
  }
}

/** A background pattern, or null when absent. */
export function cleanPattern(v: unknown, path: string): Pattern | null {
  if (isMissing(v)) return null;
  const o = asObject(v, path);
  return {
    kind: enumField(o, 'kind', path, PATTERN_KINDS),
    color: colorField(o, 'color', path),
    opacity: numberField(o, 'opacity', path, RANGES.unit, 0.15),
    scale: numberField(o, 'scale', path, RANGES.patternScale, 0.05),
  };
}

/** null when the value is null, or when its image fill points at a missing asset. */
export function cleanBackground(v: unknown, path: string, ctx: ValidationContext): Background | null {
  if (isMissing(v)) return null;
  const o = asObject(v, path);
  const fillRaw = get(o, 'fill');
  if (isMissing(fillRaw)) fail(at(path, 'fill'), 'is required');
  const fill = cleanFill(fillRaw, at(path, 'fill'), ctx);
  const pattern = cleanPattern(get(o, 'pattern'), at(path, 'pattern'));
  return fill ? { fill, pattern } : null;
}

/* Elements ----------------------------------------------------------- */

const DANGLING_SHAPE_FILL: Fill = { type: 'solid', color: '#808080' };

/** Text style; `fallbackFont` replaces a missing or unusable font name. */
export function cleanTextStyle(v: unknown, path: string, fallbackFont = DEFAULT_FONT): TextStyle {
  const o = asObject(v, path);
  const color = colorField(o, 'color', path);
  return {
    font: cleanFontName(rawString(o, 'font', path, fallbackFont), fallbackFont),
    weight: numberField(o, 'weight', path, RANGES.fontWeight, 400),
    size: numberField(o, 'size', path, RANGES.fontSize),
    lineHeight: numberField(o, 'lineHeight', path, RANGES.lineHeight, 1.2),
    letterSpacing: numberField(o, 'letterSpacing', path, RANGES.letterSpacing, 0),
    color,
    highlight: colorField(o, 'highlight', path, color),
    highlightMode: enumField(o, 'highlightMode', path, HIGHLIGHT_MODES, 'color'),
    align: enumField(o, 'align', path, ALIGNS, 'center'),
    transform: enumField(o, 'transform', path, TRANSFORMS, 'none'),
    maxLines: numberField(o, 'maxLines', path, RANGES.maxLines, 0),
    shadow: cleanShadow(get(o, 'shadow'), at(path, 'shadow')),
  };
}

function keyField(o: Json, key: string, path: string, fallback?: string): string {
  const v = rawString(o, key, path, fallback);
  if (!isSafeKey(v)) fail(at(path, key), 'must be 1-40 letters, digits, ".", "_" or "-", and not a reserved name such as "toString"');
  return v;
}

/**
 * Validates one layout element. `ids` collects the ids already used in the
 * layout: a missing, malformed or repeated id is replaced by a fresh one.
 * Returns null for an image element whose asset is missing.
 */
export function cleanElement(v: unknown, path: string, ctx: ValidationContext, ids: Set<string> = new Set()): SlideElement | null {
  const o = asObject(v, path);
  const kind = enumField(o, 'kind', path, ELEMENT_KINDS);
  const rawId = get(o, 'id');
  const id = isId(rawId) && !ids.has(rawId) ? rawId : newId('e');

  const base: { id: string; name?: string; x: number; y: number; rotation: number; opacity: number; hidden?: boolean; locked?: boolean } = {
    id,
    x: numberField(o, 'x', path, RANGES.position),
    y: numberField(o, 'y', path, RANGES.position),
    rotation: numberField(o, 'rotation', path, RANGES.rotation, 0),
    opacity: numberField(o, 'opacity', path, RANGES.unit, 1),
  };
  const name = get(o, 'name');
  if (!isMissing(name)) {
    if (typeof name !== 'string') fail(at(path, 'name'), 'must be a string');
    const clean = cleanName(name);
    if (clean) base.name = clean;
  }
  if (boolField(o, 'hidden', path, false)) base.hidden = true;
  if (boolField(o, 'locked', path, false)) base.locked = true;

  let el: SlideElement | null = null;
  switch (kind) {
    case 'device': {
      const sp = at(path, 'style');
      const so = objectField(o, 'style', path);
      const device: DeviceElement = {
        ...base,
        kind,
        frame: enumField(o, 'frame', path, DEVICE_FRAMES),
        style: {
          color: colorField(so, 'color', sp),
          finish: enumField(so, 'finish', sp, FRAME_FINISHES, 'metal'),
          bezel: enumField(so, 'bezel', sp, BEZELS, 'black'),
        },
        width: numberField(o, 'width', path, RANGES.deviceWidth),
        slot: keyField(o, 'slot', path, 'main'),
        cornerRadius: numberField(o, 'cornerRadius', path, RANGES.cornerRadius, 0),
        shadow: cleanShadow(get(o, 'shadow'), at(path, 'shadow')),
      };
      el = device;
      break;
    }
    case 'text': {
      const styleRaw = get(o, 'style');
      if (isMissing(styleRaw)) fail(at(path, 'style'), 'is required');
      const text: TextElement = {
        ...base,
        kind,
        key: keyField(o, 'key', path),
        width: numberField(o, 'width', path, RANGES.textWidth),
        valign: enumField(o, 'valign', path, VALIGNS, 'top'),
        style: cleanTextStyle(styleRaw, at(path, 'style')),
      };
      el = text;
      break;
    }
    case 'shape': {
      const fillRaw = get(o, 'fill');
      if (isMissing(fillRaw)) fail(at(path, 'fill'), 'is required');
      const shape: ShapeElement = {
        ...base,
        kind,
        shape: enumField(o, 'shape', path, SHAPE_KINDS),
        width: numberField(o, 'width', path, RANGES.shapeSize),
        height: numberField(o, 'height', path, RANGES.shapeSize),
        fill: cleanFill(fillRaw, at(path, 'fill'), ctx) ?? { ...DANGLING_SHAPE_FILL },
        radius: numberField(o, 'radius', path, RANGES.shapeRadius, 0),
        stroke: numberField(o, 'stroke', path, RANGES.stroke, 0),
        blur: numberField(o, 'blur', path, RANGES.blur, 0),
        seed: numberField(o, 'seed', path, RANGES.seed, 0),
      };
      el = shape;
      break;
    }
    case 'image': {
      const assetId = rawString(o, 'assetId', path);
      const image: ImageElement = {
        ...base,
        kind,
        assetId,
        width: numberField(o, 'width', path, RANGES.imageWidth),
        cornerRadius: numberField(o, 'cornerRadius', path, RANGES.cornerRadius, 0),
        shadow: cleanShadow(get(o, 'shadow'), at(path, 'shadow')),
      };
      el = isAssetId(assetId) && ctx.assets.has(assetId) ? image : null;
      break;
    }
  }
  if (el) ids.add(el.id);
  return el;
}

/** A slide layout: at most 200 elements with unique ids; dangling images are dropped. */
export function cleanLayout(v: unknown, path: string, ctx: ValidationContext): SlideLayout {
  const o = asObject(v, path);
  const ids = new Set<string>();
  const elements: SlideElement[] = [];
  arrayField(o, 'elements', path, LIMITS.elements).forEach((e, i) => {
    const el = cleanElement(e, at(at(path, 'elements'), i), ctx, ids);
    if (el) elements.push(el);
  });
  return { background: cleanBackground(get(o, 'background'), at(path, 'background'), ctx), elements };
}

/* Theme, assets, export ----------------------------------------------- */

/** A theme; a missing or dangling background becomes the default one. */
export function cleanTheme(v: unknown, path: string, ctx: ValidationContext): Theme {
  const o = asObject(v, path);
  const bgRaw = get(o, 'background');
  const background = isMissing(bgRaw) ? defaultBackground() : cleanBackground(bgRaw, at(path, 'background'), ctx) ?? defaultBackground();
  const fontsRaw = get(o, 'fonts');
  let fonts = { heading: DEFAULT_FONT, body: DEFAULT_FONT };
  if (!isMissing(fontsRaw)) {
    const fp = at(path, 'fonts');
    const fo = asObject(fontsRaw, fp);
    fonts = {
      heading: cleanFontName(rawString(fo, 'heading', fp, DEFAULT_FONT), DEFAULT_FONT),
      body: cleanFontName(rawString(fo, 'body', fp, DEFAULT_FONT), DEFAULT_FONT),
    };
  }
  const palette: string[] = [];
  arrayField(o, 'palette', path, LIMITS.palette).forEach((c, i) => {
    const color = colorValue(c, at(at(path, 'palette'), i));
    if (!palette.includes(color)) palette.push(color);
  });
  return {
    background,
    panorama: boolField(o, 'panorama', path, false),
    fonts,
    palette,
    mockDark: boolField(o, 'mockDark', path, false),
  };
}

/** One AssetInfo; its id is the record key it was stored under. */
export function cleanAssetInfo(v: unknown, path: string, id: string): AssetInfo {
  const o = asObject(v, path);
  return {
    id,
    name: nameField(o, 'name', path, id) || id,
    width: numberField(o, 'width', path, RANGES.pixels),
    height: numberField(o, 'height', path, RANGES.pixels),
    bytes: numberField(o, 'bytes', path, RANGES.bytes, 0),
    addedAt: numberField(o, 'addedAt', path, RANGES.timestamp, 0),
  };
}

/** An asset map; entries whose key is not an asset id are dropped. */
export function cleanAssets(v: unknown, path: string): Record<string, AssetInfo> {
  const out: Record<string, AssetInfo> = {};
  if (isMissing(v)) return out;
  const o = asObject(v, path);
  for (const k of recordKeys(o, LIMITS.assets, isAssetId)) out[k] = cleanAssetInfo(o[k], at(path, k), k);
  return out;
}

/**
 * A project's font list: entries whose file name is not a font file are
 * dropped, and so is a second entry for a family or file already listed.
 */
export function cleanFonts(v: unknown, path: string): ProjectFont[] {
  if (isMissing(v)) return [];
  const out: ProjectFont[] = [];
  const families = new Set<string>();
  const files = new Set<string>();
  if (!Array.isArray(v)) return out;
  v.slice(0, LIMITS.fonts).forEach((raw: unknown, i) => {
    if (!isPlainObject(raw)) return;
    const file = raw.file;
    if (!isFontFile(file) || files.has(file)) return;
    const family = nameField(raw, 'family', at(path, i), '');
    if (!family || families.has(family.toLowerCase())) return;
    families.add(family.toLowerCase());
    files.add(file);
    out.push({ family, file, name: nameField(raw, 'name', at(path, i), file) || file });
  });
  return out;
}

/** Export settings; `languages` lists the project languages export may pick from. */
export function cleanExportSettings(v: unknown, path: string, languages: readonly LangCode[]): ExportSettings {
  const d = defaultExportSettings();
  if (isMissing(v)) return d;
  const o = asObject(v, path);
  const sizes: string[] = [];
  arrayField(o, 'sizes', path, 64).forEach((s, i) => {
    if (typeof s !== 'string') fail(at(at(path, 'sizes'), i), 'must be a string');
    // Sizes the catalog no longer knows are dropped, not fatal: catalogs change with the stores.
    if (sizeById(s) && !sizes.includes(s)) sizes.push(s);
  });
  const langs: LangCode[] = [];
  arrayField(o, 'languages', path, LIMITS.languages).forEach((l, i) => {
    if (typeof l !== 'string') fail(at(at(path, 'languages'), i), 'must be a string');
    if (languages.includes(l) && !langs.includes(l)) langs.push(l);
  });
  return {
    sizes,
    languages: langs,
    format: enumField(o, 'format', path, FORMATS, d.format),
    jpegQuality: numberField(o, 'jpegQuality', path, RANGES.jpegQuality, d.jpegQuality),
    structure: enumField(o, 'structure', path, EXPORT_STRUCTURES, d.structure),
  };
}

/* Slides ------------------------------------------------------------- */

/** lang -> key -> text. Invalid language codes and keys are dropped. */
export function cleanTexts(v: unknown, path: string): Record<LangCode, Record<string, string>> {
  const out: Record<LangCode, Record<string, string>> = {};
  if (isMissing(v)) return out;
  const o = asObject(v, path);
  for (const lang of recordKeys(o, LIMITS.languages, isLangCode)) {
    const lp = at(path, lang);
    const byKey = asObject(o[lang], lp);
    const texts: Record<string, string> = {};
    for (const key of recordKeys(byKey, LIMITS.textKeys, isSafeKey)) {
      const t = byKey[key];
      if (isMissing(t)) continue;
      if (typeof t !== 'string') fail(at(lp, key), 'must be a string');
      texts[key] = cleanText(t);
    }
    out[lang] = texts;
  }
  return out;
}

function cleanShots(v: unknown, path: string, ctx: ValidationContext): Slide['shots'] {
  const out: Slide['shots'] = {};
  if (isMissing(v)) return out;
  const o = asObject(v, path);
  for (const family of recordKeys(o, 16, isFamilyId)) {
    const fp = at(path, family);
    const bySlot = asObject(o[family], fp);
    const map: ShotMap = {};
    for (const slot of recordKeys(bySlot, LIMITS.slots, isSafeKey)) {
      const sp = at(fp, slot);
      const byLang = asObject(bySlot[slot], sp);
      const langs: Record<LangCode, string> = {};
      for (const lang of recordKeys(byLang, LIMITS.languages, isLangCode)) {
        const id = byLang[lang];
        if (isMissing(id)) continue;
        if (typeof id !== 'string') fail(at(sp, lang), 'must be an asset id string');
        if (isAssetId(id) && ctx.assets.has(id)) langs[lang] = id;
      }
      if (Object.keys(langs).length) map[slot] = langs;
    }
    if (Object.keys(map).length) out[family as FamilyId] = map;
  }
  return out;
}

function cleanLayouts(v: unknown, path: string, ctx: ValidationContext): Slide['layouts'] {
  const out: Slide['layouts'] = {};
  if (isMissing(v)) return out;
  const o = asObject(v, path);
  for (const family of recordKeys(o, 16, isFamilyId)) {
    out[family as FamilyId] = cleanLayout(o[family], at(path, family), ctx);
  }
  return out;
}

function cleanSlide(v: unknown, path: string, ctx: ValidationContext, ids: Set<string>): Slide {
  const o = asObject(v, path);
  const rawId = get(o, 'id');
  const id = isId(rawId) && !ids.has(rawId) ? rawId : newId('s');
  ids.add(id);
  return {
    id,
    texts: cleanTexts(get(o, 'texts'), at(path, 'texts')),
    shots: cleanShots(get(o, 'shots'), at(path, 'shots'), ctx),
    layouts: cleanLayouts(get(o, 'layouts'), at(path, 'layouts'), ctx),
  };
}

function cleanFamilyList(o: Json, path: string): FamilyId[] {
  const out: FamilyId[] = [];
  arrayField(o, 'families', path, 64).forEach((f, i) => {
    if (typeof f !== 'string') fail(at(at(path, 'families'), i), 'must be a string');
    if (isFamilyId(f) && !out.includes(f)) out.push(f);
  });
  return out.length ? out : [DEFAULT_FAMILY];
}

function cleanLanguageList(o: Json, path: string): LangCode[] {
  const out: LangCode[] = [];
  arrayField(o, 'languages', path, LIMITS.languages * 2).forEach((l, i) => {
    if (typeof l !== 'string') fail(at(at(path, 'languages'), i), 'must be a string');
    if (out.length < LIMITS.languages && isLangCode(l) && !out.includes(l)) out.push(l);
  });
  return out.length ? out : [DEFAULT_LANGUAGE];
}

/* Versions ----------------------------------------------------------- */

type Migration = (o: Json) => Json;

/**
 * Upgrades from version N to N + 1, keyed by N. Only version 1 exists; a
 * future format change adds `1: (o) => ({ ...o, version: 2, ... })` here.
 */
const MIGRATIONS: Record<string, Partial<Record<number, Migration>>> = {
  project: {},
  template: {},
  gallery: {},
};

/** Brings a parsed file up to CURRENT_VERSION, or throws when it cannot. */
export function migrate(kind: 'project' | 'template' | 'gallery', json: Json): Json {
  let o = json;
  for (let guard = 0; guard < 100; guard++) {
    const v = get(o, 'version');
    if (isMissing(v)) fail('version', 'is required');
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) fail('version', 'must be a positive integer');
    if (v === CURRENT_VERSION) return o;
    if (v > CURRENT_VERSION) fail('version', `${v} is newer than this app understands (${CURRENT_VERSION}); update Wajha to open it`);
    const step = MIGRATIONS[kind][v];
    if (!step) fail('version', `no upgrade from version ${v}`);
    o = step(o);
  }
  return fail('version', 'migration did not converge');
}

function checkFormat(o: Json, expected: string): void {
  const f = get(o, 'format');
  if (f !== expected) fail('format', `must be "${expected}"`);
}

/* Project ------------------------------------------------------------ */

/** A parsed project.json (or archive manifest) as a well-formed Project. */
export function validateProject(json: unknown): Project {
  const root = asObject(json, '$');
  checkFormat(root, 'wajha.project');
  const o = migrate('project', root);

  const id = rawString(o, 'id', '');
  if (!isId(id)) fail('id', 'must be 1-64 letters, digits, "_" or "-"');
  const now = Date.now();
  const createdAt = numberField(o, 'createdAt', '', RANGES.timestamp, now);
  const updatedAt = numberField(o, 'updatedAt', '', RANGES.timestamp, createdAt);
  const tid = get(o, 'templateId');
  if (!isMissing(tid) && typeof tid !== 'string') fail('templateId', 'must be a string or null');

  const assets = cleanAssets(get(o, 'assets'), 'assets');
  const ctx = contextFor(assets);
  const themeRaw = get(o, 'theme');
  const theme = isMissing(themeRaw) ? defaultTheme() : cleanTheme(themeRaw, 'theme', ctx);
  const families = cleanFamilyList(o, '');
  const languages = cleanLanguageList(o, '');

  const ids = new Set<string>();
  const slides = arrayField(o, 'slides', '', LIMITS.slides).map((s, i) => cleanSlide(s, at('slides', i), ctx, ids));
  if (!slides.length) slides.push(newSlide(families, theme, languages));
  const fonts = cleanFonts(get(o, 'fonts'), 'fonts');

  return {
    format: 'wajha.project',
    version: 1,
    id,
    name: nameField(o, 'name', '', DEFAULT_PROJECT_NAME) || DEFAULT_PROJECT_NAME,
    createdAt,
    updatedAt,
    templateId: isTemplateId(tid) ? tid : null,
    theme,
    families,
    languages,
    slides,
    assets,
    ...(fonts.length ? { fonts } : {}),
    export: cleanExportSettings(get(o, 'export'), 'export', languages),
  };
}

/* Template ----------------------------------------------------------- */

const REFERENCE_CANVAS = { tall: FAMILIES.iphone.design, tablet: FAMILIES.ipad.design, wide: FAMILIES.mac.design };

function cleanTemplateSlide(v: unknown, path: string, ctx: ValidationContext): TemplateSlide {
  const o = asObject(v, path);
  const texts = cleanTexts(get(o, 'texts'), at(path, 'texts'));
  if (!texts[DEFAULT_LANGUAGE]) {
    // Every template must show something in English; borrow the first language's copy.
    const first = Object.keys(texts)[0];
    texts[DEFAULT_LANGUAGE] = first ? { ...texts[first] } : {};
  }
  const lp = at(path, 'layouts');
  const lo = objectField(o, 'layouts', path);
  const read = (cls: 'tall' | 'tablet' | 'wide') => (isMissing(get(lo, cls)) ? undefined : cleanLayout(lo[cls], at(lp, cls), ctx));
  const tablet = read('tablet');
  const wide = read('wide');
  let tall = read('tall');
  if (!tall) {
    if (tablet) tall = adaptLayout(tablet, REFERENCE_CANVAS.tablet, REFERENCE_CANVAS.tall, 'iphone');
    else if (wide) tall = adaptLayout(wide, REFERENCE_CANVAS.wide, REFERENCE_CANVAS.tall, 'iphone');
    else fail(at(lp, 'tall'), 'is required');
  }
  const layouts: TemplateSlide['layouts'] = { tall };
  if (tablet) layouts.tablet = tablet;
  if (wide) layouts.wide = wide;
  return { texts, layouts };
}

function cleanTags(o: Json, path: string): string[] {
  const tags: string[] = [];
  arrayField(o, 'tags', path, LIMITS.tags * 4).forEach((t, i) => {
    if (typeof t !== 'string') fail(at(at(path, 'tags'), i), 'must be a string');
    const tag = cleanName(t, LIMITS.tag);
    if (tag && !tags.includes(tag) && tags.length < LIMITS.tags) tags.push(tag);
  });
  return tags;
}

function templateIdField(o: Json, path: string): string {
  const id = rawString(o, 'id', path);
  if (!isTemplateId(id)) {
    fail(at(path, 'id'), isWindowsDeviceName(id) ? 'must not be a name Windows reserves (con, prn, aux, nul, com1-9, lpt1-9)' : 'must be kebab-case (a-z, 0-9 and "-"), at most 64 characters');
  }
  return id;
}

/** A parsed template.json as a well-formed Template (1..10 slides, a tall layout each). */
export function validateTemplate(json: unknown): Template {
  const root = asObject(json, '$');
  checkFormat(root, 'wajha.template');
  const o = migrate('template', root);
  const id = templateIdField(o, '');
  const assets = cleanAssets(get(o, 'assets'), 'assets');
  const ctx = contextFor(assets);
  const themeRaw = get(o, 'theme');
  const theme = isMissing(themeRaw) ? defaultTheme() : cleanTheme(themeRaw, 'theme', ctx);
  const slides = arrayField(o, 'slides', '', LIMITS.templateSlides).map((s, i) => cleanTemplateSlide(s, at('slides', i), ctx));
  if (!slides.length) {
    const blank = newSlide(['iphone'], theme, [DEFAULT_LANGUAGE]);
    slides.push({ texts: blank.texts, layouts: { tall: blank.layouts.iphone as SlideLayout } });
  }
  return {
    format: 'wajha.template',
    version: 1,
    id,
    name: nameField(o, 'name', '', id) || id,
    author: nameField(o, 'author', '', ''),
    description: cleanText(rawString(o, 'description', '', ''), LIMITS.text),
    category: enumField(o, 'category', '', TEMPLATE_CATEGORY_LIST, 'minimal'),
    tags: cleanTags(o, ''),
    theme,
    slides,
    assets,
  };
}

/* Gallery ------------------------------------------------------------ */

function pathField(o: Json, key: string, path: string): string {
  const v = rawString(o, key, path);
  if (!isSafeRelPath(v)) fail(at(path, key), 'must be a relative path without ".." segments');
  return v;
}

function cleanGalleryEntry(v: unknown, path: string): GalleryEntry {
  const o = asObject(v, path);
  const id = templateIdField(o, path);
  const assets: string[] = [];
  arrayField(o, 'assets', path, LIMITS.galleryAssets).forEach((a, i) => {
    const p = at(at(path, 'assets'), i);
    if (!isSafeRelPath(a)) fail(p, 'must be a relative path without ".." segments');
    if (!assets.includes(a)) assets.push(a);
  });
  return {
    id,
    name: nameField(o, 'name', path, id) || id,
    author: nameField(o, 'author', path, ''),
    description: cleanText(rawString(o, 'description', path, ''), LIMITS.text),
    category: enumField(o, 'category', path, TEMPLATE_CATEGORY_LIST, 'minimal'),
    tags: cleanTags(o, path),
    version: numberField(o, 'version', path, RANGES.galleryVersion, 1),
    template: pathField(o, 'template', path),
    preview: pathField(o, 'preview', path),
    assets,
    bytes: numberField(o, 'bytes', path, RANGES.bytes, 0),
  };
}

/**
 * The community gallery index; duplicate ids keep their first entry. An
 * invalid entry is skipped (with a warning) rather than failing the index:
 * one broken community template must not take the whole gallery down.
 */
export function validateGalleryIndex(json: unknown): GalleryIndex {
  const root = asObject(json, '$');
  checkFormat(root, 'wajha.gallery');
  const o = migrate('gallery', root);
  const seen = new Set<string>();
  const templates: GalleryEntry[] = [];
  arrayField(o, 'templates', '', LIMITS.galleryTemplates).forEach((t, i) => {
    let entry: GalleryEntry;
    try {
      entry = cleanGalleryEntry(t, at('templates', i));
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      console.warn(`[gallery] skipped an invalid template: ${e.message}`);
      return;
    }
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      templates.push(entry);
    }
  });
  return {
    format: 'wajha.gallery',
    version: 1,
    updatedAt: nameField(o, 'updatedAt', '', '', LIMITS.date),
    templates,
  };
}

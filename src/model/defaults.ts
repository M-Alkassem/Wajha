/**
 * Factories for new elements, themes and projects. Owned by the model/store
 * work package; signatures are a contract used across the app.
 *
 * Default layouts are composed in u (fractions of the canvas short side):
 * on portrait canvases the headline starts 0.11u from the top, the subtitle
 * sits below two headline lines, and the device starts below two subtitle
 * lines and bleeds off the bottom edge. Wide canvases (Mac, feature
 * graphic) put the copy on the left half and the device on the right half.
 */
import { FAMILIES } from './catalog';
import { backgroundTone, pickAccent, prefersLightText, withAlpha } from './colorMath';
import { deviceHeightFactor, familyMetrics } from './geometry';
import { newId } from './ids';
import { RANGES, clampToRange, cleanName, uniqueFamilies, uniqueLanguages } from './rules';
import type {
  Background,
  DeviceElement,
  ExportSettings,
  FamilyId,
  FrameStyle,
  ImageElement,
  LangCode,
  Project,
  Shadow,
  ShapeElement,
  Slide,
  SlideLayout,
  TextElement,
  Theme,
} from './types';

export const DEFAULT_FONT = 'Inter Variable';
export const DEFAULT_PROJECT_NAME = 'Untitled';
export const DEFAULT_FAMILY: FamilyId = 'iphone';
export const DEFAULT_LANGUAGE: LangCode = 'en-US';
/** Slides in a blank project. */
export const BLANK_SLIDE_COUNT = 3;

export type TextRole = 'headline' | 'subtitle' | 'caption';

/* Composition, in u ------------------------------------------------ */

const TALL = {
  headTop: 0.11,
  headSize: 0.075,
  headLine: 1.08,
  subSize: 0.04,
  subLine: 1.25,
  gapHeadSub: 0.06,
  gapSubDevice: 0.07,
};

const WIDE = {
  headSize: 0.06,
  subSize: 0.032,
  gapHeadSub: 0.045,
  /** Copy column: x center and width as fractions of the canvas width. */
  columnX: 0.28,
  columnW: 0.44,
  /** Device area: x center and maximum width as fractions of the canvas width. */
  deviceX: 0.74,
  deviceW: 0.42,
};

/** Top of the subtitle on portrait canvases: two headline lines plus a gap below the headline top. */
const tallSubTop = () => TALL.headTop + 2 * TALL.headSize * TALL.headLine + TALL.gapHeadSub;
/** Top of the device on portrait canvases. */
const tallDeviceTop = () => tallSubTop() + 2 * TALL.subSize * TALL.subLine + TALL.gapSubDevice;

/** Top of the copy block on wide canvases (in u), centered vertically. */
function wideCopyTop(hu: number): number {
  const block = 2 * WIDE.headSize * TALL.headLine + WIDE.gapHeadSub + 2 * WIDE.subSize * TALL.subLine;
  return Math.max(0.04, hu / 2 - block / 2);
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/* Theme ------------------------------------------------------------- */

/** Deep violet "aurora" mesh: violet, magenta and blue glows with a warm pink corner. */
export function defaultBackground(): Background {
  return {
    fill: {
      type: 'mesh',
      base: '#130b33',
      points: [
        { x: 0.12, y: 0.06, color: '#6c47ff', radius: 0.62 },
        { x: 0.95, y: 0.28, color: '#b43ce6', radius: 0.5 },
        { x: 0.06, y: 0.74, color: '#3150ff', radius: 0.52 },
        { x: 0.92, y: 0.98, color: '#ff4f9a', radius: 0.42 },
      ],
    },
    pattern: null,
  };
}

/** The theme of blank projects: the violet mesh, Inter everywhere, light mock screens. */
export function defaultTheme(): Theme {
  return {
    background: defaultBackground(),
    panorama: false,
    fonts: { heading: DEFAULT_FONT, body: DEFAULT_FONT },
    // Accent first (mock screens use it), then supporting hues, then light and dark neutrals.
    palette: ['#7c5cff', '#ff5c9d', '#ffc46b', '#3dd6c6', '#ffffff', '#130b33'],
    mockDark: false,
  };
}

/** PNG into store folders, every default size and language. */
export function defaultExportSettings(): ExportSettings {
  return { sizes: [], languages: [], format: 'png', jpegQuality: 0.92, structure: 'stores' };
}

/** Text, secondary text and highlight colours that read well on the theme background. */
export function textColors(theme: Theme): { text: string; secondary: string; caption: string; highlight: string } {
  const tone = backgroundTone(theme?.background);
  const light = prefersLightText(tone);
  const text = light ? '#ffffff' : '#14121f';
  const palette = Array.isArray(theme?.palette) ? theme.palette : [];
  const highlight = pickAccent(palette, tone, text, light ? '#ffc46b' : '#6a4cff');
  return { text, secondary: withAlpha(text, 0.75), caption: withAlpha(text, 0.7), highlight };
}

/* Elements ---------------------------------------------------------- */

const fontsOf = (theme: Theme) => ({
  heading: typeof theme?.fonts?.heading === 'string' && theme.fonts.heading ? theme.fonts.heading : DEFAULT_FONT,
  body: typeof theme?.fonts?.body === 'string' && theme.fonts.body ? theme.fonts.body : DEFAULT_FONT,
});

/** A text element preset for the given role, sized for `family`'s canvas. */
export function newTextElement(role: TextRole, family: FamilyId, theme: Theme): TextElement {
  const m = familyMetrics(family);
  const colors = textColors(theme);
  const fonts = fontsOf(theme);
  const maxW = 0.92 * m.wu;
  const base = {
    id: newId('e'),
    kind: 'text' as const,
    rotation: 0,
    opacity: 1,
    style: {
      font: fonts.body,
      weight: 500,
      size: 0.04,
      lineHeight: 1.25,
      letterSpacing: 0,
      color: colors.text,
      highlight: colors.highlight,
      highlightMode: 'color' as const,
      align: 'center' as const,
      transform: 'none' as const,
      maxLines: 3,
      shadow: null,
    },
  };

  if (role === 'caption') {
    return {
      ...base,
      key: 'caption',
      x: 0.5,
      y: 0.5,
      width: round(Math.min(0.6, maxW)),
      valign: 'middle',
      style: {
        ...base.style,
        weight: 700,
        size: m.wide ? 0.026 : 0.03,
        lineHeight: 1.3,
        letterSpacing: 0.08,
        color: colors.caption,
        transform: 'uppercase',
        maxLines: 2,
      },
    };
  }

  const headline = role === 'headline';
  const size = m.wide ? (headline ? WIDE.headSize : WIDE.subSize) : headline ? TALL.headSize : TALL.subSize;
  let x = 0.5;
  let width = headline ? 0.86 : 0.8;
  let topU: number;
  if (m.wide) {
    x = WIDE.columnX;
    width = WIDE.columnW * m.wu;
    const top = wideCopyTop(m.hu);
    topU = headline ? top : top + 2 * WIDE.headSize * TALL.headLine + WIDE.gapHeadSub;
  } else {
    topU = headline ? TALL.headTop : tallSubTop();
  }
  return {
    ...base,
    key: role,
    x,
    y: round(topU / m.hu),
    width: round(Math.min(width, maxW)),
    valign: 'top',
    style: {
      ...base.style,
      font: headline ? fonts.heading : fonts.body,
      weight: headline ? 800 : 500,
      size,
      lineHeight: headline ? TALL.headLine : TALL.subLine,
      letterSpacing: headline ? -0.02 : 0,
      color: headline ? colors.text : colors.secondary,
    },
  };
}

const DEVICE_STYLE: FrameStyle = { color: '#3a3a3f', finish: 'metal', bezel: 'black' };

function deviceShadow(theme: Theme): Shadow {
  // Dark backgrounds need a deeper shadow to separate the device; light ones a soft tinted one.
  const light = !prefersLightText(backgroundTone(theme?.background));
  return light ? { color: '#1a103340', blur: 0.06, x: 0, y: 0.025 } : { color: '#00000073', blur: 0.07, x: 0, y: 0.03 };
}

/**
 * The family's default device, sized so it sits nicely: on phones about
 * 0.78u wide below the copy, bleeding a little off the bottom; on tablets
 * 0.80u; on wide canvases on the right half (phones bleed, laptops center).
 */
export function newDeviceElement(family: FamilyId, theme: Theme): DeviceElement {
  const fam = FAMILIES[family] ?? FAMILIES[DEFAULT_FAMILY];
  const m = familyMetrics(fam.id);
  const factor = deviceHeightFactor(fam.defaultFrame, fam.screenAspect);
  let width: number;
  let x = 0.5;
  let yU: number;
  if (m.wide) {
    x = WIDE.deviceX;
    const maxW = WIDE.deviceW * m.wu;
    if (maxW * factor > 0.88 * m.hu) {
      // Portrait device on a landscape canvas: start near the top and bleed off the bottom.
      const top = 0.12 * m.hu;
      width = Math.min(maxW, (m.hu - top) / 0.8 / factor);
      yU = top + (width * factor) / 2;
    } else {
      width = maxW;
      yU = m.hu / 2;
    }
  } else {
    const top = tallDeviceTop();
    if (fam.aspectClass === 'tablet') {
      width = 0.8;
    } else {
      // About 5 % of the device hidden below the edge, within a sensible width.
      width = Math.min(0.78, Math.max(0.62, (m.hu - top) / 0.95 / factor));
    }
    yU = top + (width * factor) / 2;
  }
  return {
    id: newId('e'),
    kind: 'device',
    x,
    y: round(yU / m.hu),
    rotation: 0,
    opacity: 1,
    frame: fam.defaultFrame,
    style: { ...DEVICE_STYLE },
    width: round(width),
    slot: 'main',
    cornerRadius: 0.06,
    shadow: deviceShadow(theme),
  };
}

/** A centered decorative shape in the theme's accent colour; blobs get a random seed and a soft glow. */
export function newShapeElement(shape: ShapeElement['shape'], theme: Theme): ShapeElement {
  const palette = Array.isArray(theme?.palette) ? theme.palette : [];
  const color = palette.find((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)) ?? '#7c5cff';
  const base = {
    id: newId('e'),
    kind: 'shape' as const,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    fill: { type: 'solid' as const, color },
    radius: 0,
    stroke: 0,
    blur: 0,
    seed: 0,
  };
  switch (shape) {
    case 'rect':
      return { ...base, shape, width: 0.5, height: 0.32, radius: 0.18 };
    case 'ring':
      return { ...base, shape, width: 0.45, height: 0.45, stroke: 0.025 };
    case 'blob':
      // A soft glow reads as a decorative light, which is how blobs are used.
      return { ...base, shape, width: 0.55, height: 0.55, blur: 0.08, opacity: 0.85, seed: Math.floor(Math.random() * 2147483647) };
    case 'circle':
    default:
      return { ...base, shape: 'circle', width: 0.4, height: 0.4 };
  }
}

/** An image element whose larger side is about 0.6u; `aspect` is height / width. */
export function newImageElement(assetId: string, aspect: number): ImageElement {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = clampToRange(a >= 1 ? 0.6 / a : 0.6, { min: 0.1, max: RANGES.imageWidth.max });
  return {
    id: newId('e'),
    kind: 'image',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    assetId,
    width: round(width),
    cornerRadius: 0.04,
    shadow: null,
  };
}

/* Layouts, slides, projects ----------------------------------------- */

export interface DefaultLayoutIds {
  device: string;
  headline: string;
  subtitle: string;
}

/** Stable ids for derived default layouts, so selection survives re-renders. */
export const DEFAULT_LAYOUT_IDS: DefaultLayoutIds = { device: 'device', headline: 'headline', subtitle: 'subtitle' };

/** Headline + subtitle + device for `family`; the device is drawn first (below the copy). */
export function defaultLayout(family: FamilyId, theme: Theme, ids: DefaultLayoutIds = DEFAULT_LAYOUT_IDS): SlideLayout {
  return {
    background: null,
    elements: [
      { ...newDeviceElement(family, theme), id: ids.device },
      { ...newTextElement('headline', family, theme), id: ids.headline },
      { ...newTextElement('subtitle', family, theme), id: ids.subtitle },
    ],
  };
}

function familiesOrDefault(families: readonly FamilyId[]): FamilyId[] {
  const out = uniqueFamilies(families);
  return out.length ? out : [DEFAULT_FAMILY];
}

function languagesOrDefault(languages: readonly LangCode[]): LangCode[] {
  const out = uniqueLanguages(languages);
  return out.length ? out : [DEFAULT_LANGUAGE];
}

/** An empty slide with a default layout for every family in `families`. */
export function newSlide(families: FamilyId[], theme: Theme, languages: LangCode[]): Slide {
  // One id per role, shared by every family, so an element keeps its identity across families.
  const ids: DefaultLayoutIds = { device: newId('e'), headline: newId('e'), subtitle: newId('e') };
  const layouts: Slide['layouts'] = {};
  for (const f of familiesOrDefault(families)) layouts[f] = defaultLayout(f, theme, ids);
  const texts: Slide['texts'] = {};
  for (const lang of languagesOrDefault(languages)) texts[lang] = { headline: '', subtitle: '' };
  return { id: newId('s'), texts, shots: {}, layouts };
}

/** A blank project (no template). */
export function blankProject(name: string, families: FamilyId[], languages: LangCode[]): Project {
  const fams = familiesOrDefault(families);
  const langs = languagesOrDefault(languages);
  const theme = defaultTheme();
  const now = Date.now();
  const slides: Slide[] = [];
  for (let i = 0; i < BLANK_SLIDE_COUNT; i++) slides.push(newSlide(fams, theme, langs));
  return {
    format: 'wajha.project',
    version: 1,
    id: newId(),
    name: (typeof name === 'string' ? cleanName(name) : '') || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    templateId: null,
    theme,
    families: fams,
    languages: langs,
    slides,
    assets: {},
    export: defaultExportSettings(),
  };
}

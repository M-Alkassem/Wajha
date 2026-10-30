/**
 * Builders for authoring the built-in templates as compact, readable code.
 * Every builder returns plain model objects (see model/types.ts) that pass
 * validateTemplate unchanged; the template modules under ./builtin/ give
 * each design its own palette, type system and compositions on top.
 *
 * Coordinates follow the model: x / y are fractions of the canvas, lengths
 * are fractions of u = min(width, height). Layouts are authored per aspect
 * class on the reference canvases (tall = iPhone 1320 x 2868, tablet = iPad
 * 2064 x 2752, wide = Mac 2880 x 1800); `canvas(cls)` gives their size in u.
 */
import { deviceGeometry, mockSeed } from '../engine';
import { mockArchetype, type MockArchetypeId } from '../engine/mock';
import { FAMILIES } from '../model/catalog';
import { deepClone } from '../model/clone';
import type {
  AspectClass,
  Background,
  Color,
  DeviceElement,
  DeviceFrameId,
  Fill,
  FrameFinish,
  GradientStop,
  Pattern,
  PatternKind,
  Shadow,
  ShapeElement,
  ShapeKind,
  SlideElement,
  SlideLayout,
  Template,
  TemplateCategory,
  TemplateSlide,
  TextElement,
  TextStyle,
  Theme,
} from '../model/types';

/** Every bundled font, by short name (see BUNDLED_FONTS). */
export const F = {
  inter: 'Inter Variable',
  jakarta: 'Plus Jakarta Sans Variable',
  manrope: 'Manrope Variable',
  dmSans: 'DM Sans Variable',
  outfit: 'Outfit Variable',
  sora: 'Sora Variable',
  spaceGrotesk: 'Space Grotesk Variable',
  bricolage: 'Bricolage Grotesque Variable',
  fraunces: 'Fraunces Variable',
  playfair: 'Playfair Display Variable',
  rubik: 'Rubik Variable',
  cairo: 'Cairo Variable',
  readex: 'Readex Pro Variable',
  notoArabic: 'Noto Sans Arabic Variable',
} as const;

export type Cls = AspectClass;

/** Rounds layout numbers so the JSON stays tidy (and diffs stay readable). */
export const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/* ------------------------------------------------------------------ */
/* Canvases and devices                                                */
/* ------------------------------------------------------------------ */

const REFERENCE = { tall: FAMILIES.iphone, tablet: FAMILIES.ipad, wide: FAMILIES.mac } as const;

export interface CanvasSize {
  /** Width and height in u. */
  wu: number;
  hu: number;
  /** Default screen aspect (height / width) of devices without a screenshot. */
  aspect: number;
}

/** Size in u of the reference canvas a class layout is authored on. */
export function canvas(cls: Cls): CanvasSize {
  const fam = REFERENCE[cls];
  const u = Math.min(fam.design.width, fam.design.height);
  return { wu: fam.design.width / u, hu: fam.design.height / u, aspect: fam.screenAspect };
}

/** Outer height (u) of a `frame` device `width` u wide showing the class's default screen. */
export function deviceHeight(cls: Cls, frame: DeviceFrameId, width: number): number {
  return deviceGeometry(frame, width * 1000, canvas(cls).aspect).height / 1000;
}

/* ------------------------------------------------------------------ */
/* Paint                                                               */
/* ------------------------------------------------------------------ */

type StopInput = Color | [Color, number];

function stops(colors: StopInput[]): GradientStop[] {
  const n = colors.length;
  return colors.map((c, i) => (Array.isArray(c) ? { offset: c[1], color: c[0] } : { offset: n > 1 ? r5(i / (n - 1)) : 0, color: c }));
}

export const solid = (color: Color): Fill => ({ type: 'solid', color });

/** CSS-style linear gradient; plain colours are spaced evenly, [colour, offset] pins a stop. */
export const linear = (angle: number, ...colors: StopInput[]): Fill => ({ type: 'linear', angle, stops: stops(colors) });

/** Radial gradient: centre in canvas fractions, radius a fraction of the longer side. */
export const radial = (cx: number, cy: number, radius: number, ...colors: StopInput[]): Fill => ({ type: 'radial', cx, cy, radius, stops: stops(colors) });

/** Mesh ("aurora") fill: soft colour blobs [x, y, colour, radius] over a base colour. */
export const mesh = (base: Color, ...points: [number, number, Color, number][]): Fill => ({
  type: 'mesh',
  base,
  points: points.map(([x, y, color, radius]) => ({ x, y, color, radius })),
});

export const pattern = (kind: PatternKind, color: Color, opacity: number, scale: number): Pattern => ({ kind, color, opacity, scale });

export const background = (fill: Fill, p: Pattern | null = null): Background => ({ fill, pattern: p });

export const shadow = (color: Color, blur: number, y = 0, x = 0): Shadow => ({ color, blur, x, y });

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** Element and style fields of a text element in one flat object. */
export interface TextOptions extends Partial<TextStyle> {
  id?: string;
  key?: string;
  x?: number;
  y?: number;
  width?: number;
  valign?: TextElement['valign'];
  rotation?: number;
  opacity?: number;
}

const DEFAULT_STYLE: TextStyle = {
  font: F.inter,
  weight: 500,
  size: 0.042,
  lineHeight: 1.3,
  letterSpacing: 0,
  color: '#ffffff',
  highlight: '#ffffff',
  highlightMode: 'color',
  align: 'center',
  transform: 'none',
  maxLines: 2,
  shadow: null,
};

/** A text element; `key` names the slide text it shows (default "headline"). */
export function text(o: TextOptions): TextElement {
  const key = o.key ?? 'headline';
  const style: TextStyle = {
    font: o.font ?? DEFAULT_STYLE.font,
    weight: o.weight ?? DEFAULT_STYLE.weight,
    size: o.size ?? DEFAULT_STYLE.size,
    lineHeight: o.lineHeight ?? DEFAULT_STYLE.lineHeight,
    letterSpacing: o.letterSpacing ?? DEFAULT_STYLE.letterSpacing,
    color: o.color ?? DEFAULT_STYLE.color,
    highlight: o.highlight ?? o.color ?? DEFAULT_STYLE.highlight,
    highlightMode: o.highlightMode ?? DEFAULT_STYLE.highlightMode,
    align: o.align ?? DEFAULT_STYLE.align,
    transform: o.transform ?? DEFAULT_STYLE.transform,
    maxLines: o.maxLines ?? DEFAULT_STYLE.maxLines,
    shadow: o.shadow ?? null,
  };
  return {
    id: o.id ?? key,
    kind: 'text',
    x: o.x ?? 0.5,
    y: o.y ?? 0.06,
    rotation: o.rotation ?? 0,
    opacity: o.opacity ?? 1,
    key,
    width: o.width ?? 0.86,
    valign: o.valign ?? 'top',
    style,
  };
}

/** A template's type system: fonts, colours and the headline / subtitle / eyebrow presets. */
export interface TypeSpec {
  heading: string;
  body: string;
  /** Headline colour. */
  ink: Color;
  /** Subtitle colour. */
  soft: Color;
  /** Highlight colour (*words*). */
  accent: Color;
  mode?: TextStyle['highlightMode'];
  align?: TextStyle['align'];
  head?: Partial<TextStyle>;
  sub?: Partial<TextStyle>;
  eyebrow?: Partial<TextStyle>;
}

export interface Typeset {
  spec: TypeSpec;
  headline(o?: TextOptions): TextElement;
  subtitle(o?: TextOptions): TextElement;
  eyebrow(o?: TextOptions): TextElement;
  /** Body-styled text for any other key. */
  body(key: string, o?: TextOptions): TextElement;
}

export function typeset(spec: TypeSpec): Typeset {
  const align = spec.align ?? 'center';
  const head: TextOptions = {
    key: 'headline',
    font: spec.heading,
    weight: 800,
    size: 0.088,
    lineHeight: 1.1,
    letterSpacing: -0.02,
    color: spec.ink,
    highlight: spec.accent,
    highlightMode: spec.mode ?? 'color',
    align,
    maxLines: 2,
    width: 0.86,
    ...spec.head,
  };
  const sub: TextOptions = {
    key: 'subtitle',
    font: spec.body,
    weight: 500,
    size: 0.042,
    lineHeight: 1.32,
    color: spec.soft,
    highlight: spec.accent,
    align,
    maxLines: 2,
    width: 0.8,
    ...spec.sub,
  };
  const brow: TextOptions = {
    key: 'eyebrow',
    font: spec.body,
    weight: 700,
    size: 0.03,
    lineHeight: 1.2,
    letterSpacing: 0.16,
    transform: 'uppercase',
    color: spec.accent,
    highlight: spec.ink,
    align,
    maxLines: 1,
    width: 0.8,
    ...spec.eyebrow,
  };
  return {
    spec,
    headline: (o = {}) => text({ ...head, ...o }),
    subtitle: (o = {}) => text({ ...sub, ...o }),
    eyebrow: (o = {}) => text({ ...brow, ...o }),
    body: (key, o = {}) => text({ ...sub, id: key, key, ...o }),
  };
}

export interface CopyOptions {
  cls?: Cls;
  /**
   * The seam between headline and subtitle, fraction of the canvas height:
   * the headline grows upwards from it and the subtitle downwards, so one-
   * and two-line headlines both keep the pair tight.
   */
  seam: number;
  /** Space between the two blocks, u (default 0.03). */
  gap?: number;
  x?: number;
  width?: number;
  subWidth?: number;
  align?: TextStyle['align'];
  head?: TextOptions;
  sub?: TextOptions;
}

/** Headline + subtitle meeting at a seam (see CopyOptions.seam). */
export function copyAt(t: Typeset, o: CopyOptions): TextElement[] {
  const { hu } = canvas(o.cls ?? 'tall');
  const half = (o.gap ?? 0.03) / hu / 2;
  const shared: TextOptions = { ...(o.x !== undefined ? { x: o.x } : {}), ...(o.align ? { align: o.align } : {}) };
  const subWidth = o.subWidth ?? o.width;
  return [
    t.headline({ ...shared, ...(o.width !== undefined ? { width: o.width } : {}), y: r5(o.seam - half), valign: 'bottom', ...o.head }),
    t.subtitle({ ...shared, ...(subWidth !== undefined ? { width: subWidth } : {}), y: r5(o.seam + half), valign: 'top', ...o.sub }),
  ];
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export interface DeviceOptions {
  id?: string;
  frame?: DeviceFrameId;
  color?: Color;
  finish?: FrameFinish;
  bezel?: 'black' | 'match';
  x?: number;
  /** Centre, fraction of the canvas height. */
  y?: number;
  /** Top edge (unrotated), fraction of the canvas height; overrides `y`. */
  top?: number;
  /** Bottom edge (unrotated), fraction of the canvas height; overrides `y` and `top`. */
  bottom?: number;
  /** Canvas the position is computed for (default "tall"). */
  cls?: Cls;
  width?: number;
  rotation?: number;
  opacity?: number;
  slot?: string;
  cornerRadius?: number;
  shadow?: Shadow | null;
  /** Mock app to show in template previews (the builder orders elements to get it). */
  app?: MockArchetypeId;
}

/** Mock app hints per device element, read by `template()`; never stored in the template. */
const APP_HINTS = new WeakMap<SlideElement, MockArchetypeId>();

const DEFAULT_DEVICE_SHADOW = (): Shadow => shadow('#0000004d', 0.06, 0.03);

export function device(o: DeviceOptions = {}): DeviceElement {
  const frame = o.frame ?? 'iphone';
  const width = o.width ?? 0.78;
  const cls = o.cls ?? 'tall';
  const { hu } = canvas(cls);
  const h = deviceHeight(cls, frame, width) / hu;
  let y = o.y ?? 0.62;
  if (o.bottom !== undefined) y = o.bottom - h / 2;
  else if (o.top !== undefined) y = o.top + h / 2;
  const slot = o.slot ?? 'main';
  const el: DeviceElement = {
    id: o.id ?? (slot === 'main' ? 'device' : `device-${slot}`),
    kind: 'device',
    x: o.x ?? 0.5,
    y: r5(y),
    rotation: o.rotation ?? 0,
    opacity: o.opacity ?? 1,
    frame,
    style: { color: o.color ?? '#2b2c31', finish: o.finish ?? 'metal', bezel: o.bezel ?? 'black' },
    width,
    slot,
    cornerRadius: o.cornerRadius ?? 0.06,
    shadow: o.shadow === undefined ? DEFAULT_DEVICE_SHADOW() : o.shadow,
  };
  if (o.app) APP_HINTS.set(el, o.app);
  return el;
}

/** Frame colours used across templates. */
export const METAL = {
  graphite: '#2b2c31',
  black: '#151518',
  silver: '#e4e4e7',
  white: '#f4f3f0',
  titanium: '#b9b2a6',
  desert: '#c4a688',
  blue: '#3b4b66',
  deepBlue: '#27324a',
  gold: '#d9bf8c',
} as const;

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface ShapeOptions {
  id?: string;
  /** Name shown in the editor's layers list ("Sun", "Neon tube"); defaults to the shape kind. */
  name?: string;
  x?: number;
  y?: number;
  /** Sets width and height together. */
  size?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  fill?: Fill;
  /** Solid fill colour (shorthand for `fill`). */
  color?: Color;
  radius?: number;
  stroke?: number;
  blur?: number;
  seed?: number;
}

function shape(kind: ShapeKind, o: ShapeOptions, defaults: Partial<ShapeElement> = {}): ShapeElement {
  const size = o.size ?? 0.4;
  return {
    id: o.id ?? '',
    ...(o.name ? { name: o.name } : {}),
    kind: 'shape',
    x: o.x ?? 0.5,
    y: o.y ?? 0.5,
    rotation: o.rotation ?? 0,
    opacity: o.opacity ?? defaults.opacity ?? 1,
    shape: kind,
    width: o.width ?? size,
    height: o.height ?? size,
    fill: o.fill ?? solid(o.color ?? '#ffffff'),
    radius: o.radius ?? defaults.radius ?? 0,
    stroke: o.stroke ?? defaults.stroke ?? 0,
    blur: o.blur ?? defaults.blur ?? 0,
    seed: o.seed ?? defaults.seed ?? 0,
  };
}

export const circle = (o: ShapeOptions): ShapeElement => shape('circle', o);
export const rect = (o: ShapeOptions): ShapeElement => shape('rect', o, { radius: 0.2 });
export const ring = (o: ShapeOptions): ShapeElement => shape('ring', o, { stroke: 0.012 });
export const blob = (o: ShapeOptions): ShapeElement => shape('blob', o, { seed: 7 });
/** A soft light: a blurred circle. */
export const glow = (o: ShapeOptions): ShapeElement => shape('circle', o, { blur: 0.14, opacity: 0.85 });

/**
 * Panorama decorations live on the strip of all slides side by side: `X`
 * is measured in slide widths from the left edge of the first slide (1.0 =
 * the seam between slides 1 and 2). Returns what slide `slideIndex` shows of
 * a decoration `halfWidth` slide widths wide: the same shape at the slide's
 * local x, or nothing when it is out of reach. Neighbouring slides cut the
 * shape at the same seam, so it continues across the store listing.
 */
export function onStrip(slideIndex: number, X: number, halfWidth: number, make: (x: number) => SlideElement[]): SlideElement[] {
  const x = r5(X - slideIndex);
  return x + halfWidth > 0 && x - halfWidth < 1 ? make(x) : [];
}

/* ------------------------------------------------------------------ */
/* Theme, slides, templates                                            */
/* ------------------------------------------------------------------ */

export interface ThemeOptions {
  background: Background;
  heading: string;
  body: string;
  /** Accent first (mock screens use it), then supporting colours, then neutrals. */
  palette: Color[];
  mockDark?: boolean;
  panorama?: boolean;
}

export function theme(o: ThemeOptions): Theme {
  return {
    background: o.background,
    panorama: o.panorama ?? false,
    fonts: { heading: o.heading, body: o.body },
    palette: o.palette,
    mockDark: o.mockDark ?? false,
  };
}

/** Sample copy per language: en-US and ar-SA always, de-DE for a few templates. */
export interface Copy {
  en: Record<string, string>;
  ar: Record<string, string>;
  de?: Record<string, string>;
}

export interface SlideSpec {
  copy: Copy;
  tall: SlideElement[];
  tablet?: SlideElement[];
  wide?: SlideElement[];
  /** Slide-level background for every class layout (null = the theme background). */
  background?: Background | null;
}

/** Builds a slide's elements for one canvas class. */
export type Build = (cls: Cls) => SlideElement[];

/** A slide whose class layouts come from one build function (tall only unless `classes` says more). */
export function slide(copy: Copy, build: Build, o: { classes?: readonly Cls[]; background?: Background | null } = {}): SlideSpec {
  const classes = o.classes ?? ['tall'];
  const spec: SlideSpec = { copy, tall: build('tall') };
  if (classes.includes('tablet')) spec.tablet = build('tablet');
  if (classes.includes('wide')) spec.wide = build('wide');
  if (o.background) spec.background = o.background;
  return spec;
}

/** Every class layout: templates that design tablet and wide canvases explicitly. */
export const ALL_CLASSES: readonly Cls[] = ['tall', 'tablet', 'wide'];

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  theme: Theme;
  slides: SlideSpec[];
  /**
   * Mock apps that fit the template's story, best first. Template previews
   * show generated app screens; the builder picks, per slide, a reachable
   * app from this list (preferring ones not shown yet) so the copy and the
   * screens tell one story. Devices may also name their own `app`.
   */
  apps?: MockArchetypeId[];
}

/** Problems found while building templates (empty when every design is consistent); tests assert on it. */
export const BUILD_PROBLEMS: string[] = [];

/** The mock app the device at `elementIndex` of slide `slideIndex` shows (the renderer's own seed). */
export function mockAppAt(slideIndex: number, elementIndex: number): MockArchetypeId {
  return mockArchetype(mockSeed(slideIndex, elementIndex));
}

/** An oriented box in u: centre, half extents, rotation (radians). */
interface Obb {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  a: number;
}

/** A box `w` x `h` centred on (cx, cy), rotated, grown by local margins (top, right, bottom, left). */
function obb(cx: number, cy: number, w: number, h: number, rotation: number, m: [number, number, number, number] = [0, 0, 0, 0]): Obb {
  const a = (rotation * Math.PI) / 180;
  const [top, right, bottom, left] = m;
  // Asymmetric margins move the centre (in the box's own frame).
  const dx = (right - left) / 2;
  const dy = (bottom - top) / 2;
  return { cx: cx + dx * Math.cos(a) - dy * Math.sin(a), cy: cy + dx * Math.sin(a) + dy * Math.cos(a), hw: w / 2 + (left + right) / 2, hh: h / 2 + (top + bottom) / 2, a };
}

/**
 * Painted extent of an element on a class canvas, in u. Device shadows and
 * glow halos are included (a blur of b reaches about b beyond the shape);
 * texts count with their tallest block (maxLines lines), so a longer text a
 * user types later still fits the measured area.
 */
function elementObb(el: SlideElement, cls: Cls, effects = true): Obb {
  const { wu, hu } = canvas(cls);
  const cx = el.x * wu;
  const cy = el.y * hu;
  switch (el.kind) {
    case 'device': {
      const s = effects ? el.shadow : null;
      const m: [number, number, number, number] = s ? [Math.max(0, s.blur - s.y), s.blur + Math.max(0, s.x), s.blur + Math.max(0, s.y), s.blur + Math.max(0, -s.x)] : [0, 0, 0, 0];
      return obb(cx, cy, el.width, deviceHeight(cls, el.frame, el.width), el.rotation, m);
    }
    case 'shape': {
      const b = effects ? el.blur : 0;
      return obb(cx, cy, el.width, el.height, el.rotation, [b, b, b, b]);
    }
    case 'text': {
      const h = (el.style.maxLines > 0 ? el.style.maxLines : 3) * el.style.size * el.style.lineHeight;
      const top = el.valign === 'top' ? cy : el.valign === 'bottom' ? cy - h : cy - h / 2;
      return obb(cx, top + h / 2, el.width, h, el.rotation);
    }
    case 'image':
      return obb(cx, cy, el.width, el.width, el.rotation);
  }
}

/** Separating axis test for two oriented boxes. */
function obbOverlap(p: Obb, q: Obb): boolean {
  const axes = [p.a, p.a + Math.PI / 2, q.a, q.a + Math.PI / 2];
  const dx = q.cx - p.cx;
  const dy = q.cy - p.cy;
  for (const t of axes) {
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    const reach = (b: Obb) => Math.abs(b.hw * (Math.cos(b.a) * ux + Math.sin(b.a) * uy)) + Math.abs(b.hh * (-Math.sin(b.a) * ux + Math.cos(b.a) * uy));
    if (Math.abs(dx * ux + dy * uy) >= reach(p) + reach(q)) return false;
  }
  return true;
}

/**
 * True when two elements on a class canvas may touch: their painted areas
 * (with shadows and glows), or with `effects: false` their bodies only.
 * `margin` (u) grows both boxes, to demand clear space between them.
 */
export function elementsOverlap(a: SlideElement, b: SlideElement, cls: Cls, o: { effects?: boolean; margin?: number } = {}): boolean {
  const grow = (box: Obb): Obb => ({ ...box, hw: box.hw + (o.margin ?? 0) / 2, hh: box.hh + (o.margin ?? 0) / 2 });
  return obbOverlap(grow(elementObb(a, cls, o.effects ?? true)), grow(elementObb(b, cls, o.effects ?? true)));
}

/**
 * Painter's order constraints: element `a` must stay below `b` when `a` comes
 * first and their painted bounds overlap. Any order that keeps every such
 * pair looks exactly the same, so devices can move through everything they
 * do not touch.
 */
function overlapGraph(elements: SlideElement[], cls: Cls): boolean[][] {
  const boxes = elements.map((e) => elementObb(e, cls));
  return boxes.map((a, i) => boxes.map((b, j) => i < j && obbOverlap(a, b)));
}

/** Indices of the elements that must stay below (`dir` = -1) or above (+1) element `k`. */
function closure(edges: boolean[][], k: number, dir: -1 | 1): Set<number> {
  const out = new Set<number>();
  const stack = [k];
  while (stack.length) {
    const v = stack.pop() as number;
    for (let u = 0; u < edges.length; u++) {
      const linked = dir < 0 ? edges[u][v] : edges[v][u];
      if (linked && !out.has(u)) {
        out.add(u);
        stack.push(u);
      }
    }
  }
  return out;
}

/**
 * Re-orders `elements` so the device at `from` lands at index `to` (which
 * must lie in its free range, see deviceRange): the elements it must stay
 * above, plus enough unconstrained ones in their current order, go first.
 */
function placeDevice(elements: SlideElement[], from: number, to: number, edges: boolean[][]): SlideElement[] {
  const below = closure(edges, from, -1);
  const above = closure(edges, from, 1);
  const free = elements.map((_, i) => i).filter((i) => i !== from && !below.has(i) && !above.has(i));
  const freeBefore = free.filter((i) => i < from);
  const freeAfter = free.filter((i) => i > from);
  let chosen: number[];
  const need = to - below.size;
  // Dropping the last ones keeps the set closed downwards (constraints only point forwards), and so does adding the first ones.
  if (need <= freeBefore.length) chosen = freeBefore.slice(0, need);
  else chosen = [...freeBefore, ...freeAfter.slice(0, need - freeBefore.length)];
  const first = new Set<number>([...below, ...chosen]);
  const head = elements.filter((_, i) => first.has(i));
  const tail = elements.filter((_, i) => i !== from && !first.has(i));
  return [...head, elements[from], ...tail];
}

/** The element indices a device can take without changing the picture: [elements it must stay above, n - 1 - elements it must stay below]. */
function deviceRange(edges: boolean[][], from: number): [number, number] {
  return [closure(edges, from, -1).size, edges.length - 1 - closure(edges, from, 1).size];
}

/**
 * Orders each device so its mock screen shows the first preferred app it
 * can reach, preferring apps no earlier slide shows (`used`). `chosen` maps
 * device ids to the app picked in the tall layout, so tablet and wide
 * layouts show the same screen when they can.
 */
function steerMocks(
  elements: SlideElement[],
  slideIndex: number,
  cls: Cls,
  apps: readonly MockArchetypeId[],
  used: Set<MockArchetypeId>,
  chosen: Map<string, MockArchetypeId>,
  previous: ReadonlySet<MockArchetypeId>,
): SlideElement[] {
  let out = [...elements];
  for (const el of elements) {
    if (el.kind !== 'device') continue;
    const hint = APP_HINTS.get(el);
    const first = chosen.get(el.id) ?? hint;
    const prefs = [...new Set([...(first ? [first] : []), ...apps])];
    if (!prefs.length) continue;
    const from = out.indexOf(el);
    const edges = overlapGraph(out, cls);
    const [lo, hi] = deviceRange(edges, from);
    // Nearest index first, so a device only moves when it has to.
    const options = new Map<MockArchetypeId, number>();
    for (let d = 0; d <= hi - lo; d++) {
      for (const i of [from - d, from + d]) {
        if (i < lo || i > hi) continue;
        const app = mockAppAt(slideIndex, i);
        if (!options.has(app)) options.set(app, i);
      }
    }
    const fresh = (a: MockArchetypeId) => options.has(a) && !previous.has(a);
    const pick = chosen.has(el.id)
      ? prefs.find((a) => options.has(a))
      : // An unused preferred app, else a preferred one the previous slide does not show, else any screen that differs from it.
        (prefs.find((a) => fresh(a) && !used.has(a)) ?? prefs.find(fresh) ?? (previous.size ? [...options.keys()].find((a) => !previous.has(a)) : undefined) ?? prefs.find((a) => options.has(a)));
    if (!pick) continue;
    used.add(pick);
    const to = options.get(pick) as number;
    if (to !== from) out = placeDevice(out, from, to, edges);
  }
  // Record what each device finally shows (placing a later device can shift an earlier one).
  out.forEach((el, i) => {
    if (el.kind !== 'device') return;
    const app = mockAppAt(slideIndex, i);
    if (!chosen.has(el.id)) chosen.set(el.id, app);
    used.add(app);
  });
  return out;
}

/** Gives auto-id shapes ("") ids like "glow-1" and reports duplicate ids. */
function assignIds(elements: SlideElement[], where: string): SlideElement[] {
  const counters = new Map<string, number>();
  const seen = new Set<string>();
  return elements.map((el) => {
    let id = el.id;
    if (!id) {
      const prefix = el.kind === 'shape' ? (el.shape === 'circle' && el.blur > 0 ? 'glow' : el.shape) : el.kind;
      do {
        const n = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, n);
        id = `${prefix}-${n}`;
      } while (seen.has(id));
    }
    if (seen.has(id)) BUILD_PROBLEMS.push(`${where}: duplicate element id "${id}"`);
    seen.add(id);
    return id === el.id ? el : { ...el, id };
  });
}

const LANG = { en: 'en-US', ar: 'ar-SA', de: 'de-DE' } as const;

/** A complete, valid Template from a spec. */
export function template(spec: TemplateSpec): Template {
  const used = new Set<MockArchetypeId>();
  let previous = new Set<MockArchetypeId>();
  const slides: TemplateSlide[] = spec.slides.map((s, i) => {
    const chosen = new Map<string, MockArchetypeId>();
    const layout = (cls: Cls, elements: SlideElement[]): SlideLayout => {
      const where = `${spec.id} slide ${i + 1} (${cls})`;
      // Ids first: steering matches devices across class layouts by id.
      const named = assignIds(elements, where);
      named.forEach((el, k) => {
        const hint = APP_HINTS.get(elements[k]);
        if (hint) APP_HINTS.set(el, hint);
      });
      const steered = steerMocks(named, i, cls, spec.apps ?? [], used, chosen, previous);
      // Copies: builder objects shared between layouts must not alias inside the template.
      return { background: s.background ? deepClone(s.background) : null, elements: deepClone(steered) };
    };
    const texts: TemplateSlide['texts'] = {};
    for (const [short, code] of Object.entries(LANG) as [keyof Copy, string][]) {
      const copy = s.copy[short];
      if (copy) texts[code] = { ...copy };
    }
    const layouts: TemplateSlide['layouts'] = { tall: layout('tall', s.tall) };
    if (s.tablet) layouts.tablet = layout('tablet', s.tablet);
    if (s.wide) layouts.wide = layout('wide', s.wide);
    previous = new Set(chosen.values());
    return { texts, layouts };
  });
  return {
    format: 'wajha.template',
    version: 1,
    id: spec.id,
    name: spec.name,
    author: 'Wajha',
    description: spec.description,
    category: spec.category,
    tags: spec.tags,
    theme: deepClone(spec.theme),
    slides,
    assets: {},
  };
}

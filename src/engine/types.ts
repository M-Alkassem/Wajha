/**
 * Public contract of the rendering engine.
 *
 * The engine is pure TypeScript on top of the Canvas 2D API. It never touches
 * the DOM, storage or the store: everything it needs comes in through
 * `RenderInput`, so the same code draws the editor preview, thumbnails,
 * template previews, exports, and runs in Node tests on @napi-rs/canvas.
 *
 * Browser-compat rules (WKWebView on macOS 11+, WebView2, WebKitGTK):
 *  - Do not rely on `ctx.filter`; blur with shadowBlur or downscale tricks.
 *  - Feature-detect `ctx.letterSpacing` and `ctx.roundRect`.
 *  - Text shaping comes from `fillText` with `ctx.direction` set; lines that
 *    mix directions are cut into one-direction pieces first (bidi.ts), since
 *    WebKit misplaces the later direction runs of a single call vertically.
 */
import type {
  Color,
  DeviceElement,
  DeviceFrameId,
  FamilyId,
  LangCode,
  Slide,
  SlideLayout,
  TextStyle,
  Theme,
} from '../model/types';

export type Ctx2D = CanvasRenderingContext2D;

/** Anything drawImage accepts that also reports its pixel size. */
export type ImageLike = CanvasImageSource & { width: number; height: number };

export interface RenderEnv {
  /** Creates a scratch canvas for offscreen effects (blur, patterns, masks). */
  createCanvas(width: number, height: number): { canvas: ImageLike; ctx: Ctx2D };
}

export interface RenderInput {
  /** Output size in pixels. */
  width: number;
  height: number;
  family: FamilyId;
  slide: Slide;
  /** Already resolved for `family` (see model/resolve.ts). */
  layout: SlideLayout;
  theme: Theme;
  lang: LangCode;
  /** Fallback language for missing texts and screenshots. */
  baseLang: LangCode;
  rtl: boolean;
  /** Position of this slide, for panorama backgrounds and mock-screen seeds. */
  slideIndex: number;
  slideCount: number;
  /** Decoded image for an asset id, or null while it is not loaded yet. */
  getImage(assetId: string): ImageLike | null;
  /** Height / width of an asset from its AssetInfo, so layout never waits on decoding. */
  getAssetAspect(assetId: string): number | null;
  /**
   * What to draw in a device whose slot has no screenshot:
   * "mock" = generated fake app screen, "empty" = neutral screen.
   */
  placeholder: 'mock' | 'empty';
  env: RenderEnv;
}

/** Element bounds in output pixels, used for hit-testing and selection UI. */
export interface ElementBox {
  id: string;
  /** Center */
  cx: number;
  cy: number;
  /** Unrotated size */
  w: number;
  h: number;
  /** degrees clockwise */
  rotation: number;
}

export interface RenderResult {
  boxes: ElementBox[];
  /** Device element ids whose slot had no screenshot for `lang` (after fallback). */
  missingShots: string[];
  /** Text element ids that still overflow `maxLines` at the minimum size. */
  overflowingText: string[];
  /** Device element ids whose screenshot is resolved but not decoded yet. */
  pendingImages: string[];
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export interface ScreenRect {
  /** Relative to the device's top-left corner, pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Screen corner radius, pixels. */
  radius: number;
}

export interface DeviceGeometry {
  /** Outer size of the device artwork, pixels. */
  width: number;
  height: number;
  screen: ScreenRect;
}

export interface DrawDeviceOptions {
  /** drawDevice also paints `el.shadow` (shaped like the device body) and honours `el.style`. */
  el: DeviceElement;
  /** Outer device width in pixels. */
  widthPx: number;
  /** u = min(canvas width, height) in pixels; shadow blur/offsets are fractions of it. */
  unit: number;
  /** Screen height / width. */
  screenAspect: number;
  /** Screenshot, or null to draw the placeholder. */
  screen: ImageLike | null;
  placeholder: 'mock' | 'empty';
  /** Seed + palette for mock screens. */
  mock: { seed: number; palette: Color[]; dark: boolean };
  env: RenderEnv;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export interface TextRun {
  text: string;
  highlighted: boolean;
  /** Run width in pixels at the final font size. */
  width: number;
}

export interface TextLine {
  runs: TextRun[];
  width: number;
}

export interface TextLayout {
  lines: TextLine[];
  /** Final font size in pixels after auto-fit. */
  fontPx: number;
  lineHeightPx: number;
  /** Width of the box in pixels (the element width). */
  boxWidth: number;
  /** Total block height in pixels. */
  height: number;
  /** True when the text still needs more than `maxLines` at the minimum size. */
  overflow: boolean;
}

export interface LayoutTextInput {
  text: string;
  style: TextStyle;
  /** Text box width in pixels. */
  boxWidth: number;
  /** u = min(canvas width, height) in pixels. */
  unit: number;
  rtl: boolean;
  lang: LangCode;
}

/* ------------------------------------------------------------------ */
/* Function signatures implemented in src/engine                       */
/* ------------------------------------------------------------------ */

export type RenderSlideFn = (ctx: Ctx2D, input: RenderInput) => RenderResult;
export type DeviceGeometryFn = (frame: DeviceFrameId, widthPx: number, screenAspect: number) => DeviceGeometry;
/** Draws the device centered at the current origin (caller translates/rotates). */
export type DrawDeviceFn = (ctx: Ctx2D, opts: DrawDeviceOptions) => DeviceGeometry;
export type LayoutTextFn = (ctx: Ctx2D, input: LayoutTextInput) => TextLayout;
export type DrawMockScreenFn = (
  ctx: Ctx2D,
  width: number,
  height: number,
  opts: { seed: number; palette: Color[]; dark: boolean; family?: FamilyId },
) => void;

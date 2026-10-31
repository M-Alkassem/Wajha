/**
 * Pure layout of every device frame: body box, screen rect and the extra
 * measurements the painters need. All proportions are fractions of the
 * device width so a frame looks identical at 40 px and at 4 000 px.
 *
 * Kept free of drawing code because the renderer calls `deviceGeometry`
 * for hit-testing and layout on every pointer move.
 */
import type { DeviceFrameId } from '../../model/types';
import type { DeviceGeometry, ScreenRect } from '../types';

export const MIN_ASPECT = 0.3;
export const MAX_ASPECT = 4;
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 100_000;

/** Screen aspect (height / width) used when the caller passes something unusable. */
export const DEFAULT_ASPECT: Record<DeviceFrameId, number> = {
  iphone: 2868 / 1320,
  ipad: 2752 / 2064,
  'android-phone': 2400 / 1080,
  'android-tablet': 2560 / 1600,
  macbook: 1800 / 2880,
  watch: 514 / 422,
  tv: 2160 / 3840,
  vision: 2160 / 3840,
  browser: 1800 / 2880,
  none: 2868 / 1320,
};

/** Corner radius of frame "none" when no element radius is known, fraction of width. */
export const NONE_DEFAULT_RADIUS = 0.1;

const FRAMES: readonly DeviceFrameId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'macbook', 'watch', 'tv', 'vision', 'browser', 'none'];

/** Unknown ids (old or hand-edited files) degrade to the bare screenshot. */
export function knownFrame(frame: string): DeviceFrameId {
  return (FRAMES as readonly string[]).includes(frame) ? (frame as DeviceFrameId) : 'none';
}

export function sanitizeWidth(widthPx: number): number {
  if (Number.isNaN(widthPx)) return MIN_WIDTH;
  return Math.min(Math.max(widthPx, MIN_WIDTH), MAX_WIDTH);
}

export function sanitizeAspect(frame: DeviceFrameId, aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT[frame];
  return Math.min(Math.max(a, MIN_ASPECT), MAX_ASPECT);
}

const clampRadius = (r: number, w: number, h: number) => Math.max(0, Math.min(r, w / 2, h / 2));

/* ------------------------------------------------------------------ */
/* Slabs: phones and tablets                                           */
/* ------------------------------------------------------------------ */

export type SlabFrame = 'iphone' | 'ipad' | 'android-phone' | 'android-tablet' | 'watch' | 'tv';

/** Slabs that can lie on their side (a screen aspect under 1 turns them). */
export const TURNABLE: ReadonlySet<SlabFrame> = new Set(['iphone', 'ipad', 'android-phone', 'android-tablet']);

export interface SlabSpec {
  /** Outer corner radius, fraction of width. */
  radius: number;
  /** Corner smoothing (0 circular .. 1 very continuous). */
  smoothing: number;
  /** Visible metal band, fraction of width. */
  band: number;
  /** Band + bezel: distance from the outer edge to the screen, fraction of width. */
  inset: number;
  /**
   * Screen radius as a fraction of width. Omitted = concentric with the body
   * (outer radius - inset). Tablets use a fixed one because their displays
   * are rounder than a concentric radius would give.
   */
  screenRadius?: number;
  screenSmoothing: number;
}

export const SLAB_SPECS: Record<SlabFrame, SlabSpec> = {
  // iPhone 17 Pro: titanium/aluminium band, thin uniform black border, continuous corners.
  iphone: { radius: 0.158, smoothing: 0.42, band: 0.0125, inset: 0.0125 + 0.022, screenSmoothing: 0.42 },
  // iPad Pro: thin aluminium edge, uniform bezel, softly rounded display.
  ipad: { radius: 0.06, smoothing: 0.3, band: 0.0075, inset: 0.045, screenRadius: 0.016, screenSmoothing: 0.3 },
  // Pixel Pro: polished frame, slim bezel, rounder (less continuous) corners.
  'android-phone': { radius: 0.12, smoothing: 0.12, band: 0.0095, inset: 0.0095 + 0.024, screenSmoothing: 0.12 },
  // Pixel Tablet.
  'android-tablet': { radius: 0.056, smoothing: 0.12, band: 0.0075, inset: 0.05, screenRadius: 0.024, screenSmoothing: 0.12 },
  // Apple Watch: a soft, deep case with a wide black border around a rounded display.
  watch: { radius: 0.26, smoothing: 0.6, band: 0.03, inset: 0.03 + 0.07, screenRadius: 0.17, screenSmoothing: 0.6 },
  // A thin-bezel television.
  tv: { radius: 0.008, smoothing: 0.2, band: 0.003, inset: 0.012, screenRadius: 0.002, screenSmoothing: 0.2 },
};

export interface SlabLayout {
  kind: 'slab';
  frame: SlabFrame;
  w: number;
  h: number;
  radius: number;
  smoothing: number;
  band: number;
  inset: number;
  screen: ScreenRect;
  screenSmoothing: number;
  /**
   * Set on a device lying on its side: the upright layout it is painted
   * from, turned a quarter to the left (its top edge on the left). Its
   * insets and radii follow the short side, as on the real device.
   */
  upright?: SlabLayout;
}

function slabLayout(frame: SlabFrame, w: number, aspect: number): SlabLayout {
  if (aspect < 1 && TURNABLE.has(frame)) {
    // The upright device whose height is this width.
    const k = SLAB_SPECS[frame].inset;
    const up = uprightSlab(frame, w / ((1 - 2 * k) / aspect + 2 * k), 1 / aspect);
    const s = up.screen;
    // `w` itself rather than up.h, which equals it give or take float error.
    return { ...up, w, h: up.w, screen: { x: s.y, y: up.w - s.x - s.w, w: s.h, h: s.w, radius: s.radius }, upright: up };
  }
  return uprightSlab(frame, w, aspect);
}

function uprightSlab(frame: SlabFrame, w: number, aspect: number): SlabLayout {
  const spec = SLAB_SPECS[frame];
  const inset = spec.inset * w;
  const sw = w - 2 * inset;
  const sh = sw * aspect;
  const h = sh + 2 * inset;
  const radius = clampRadius(spec.radius * w, w, h);
  const screenRadius = spec.screenRadius !== undefined ? spec.screenRadius * w : radius - inset;
  return {
    kind: 'slab',
    frame,
    w,
    h,
    radius,
    smoothing: spec.smoothing,
    band: spec.band * w,
    inset,
    screen: { x: inset, y: inset, w: sw, h: sh, radius: clampRadius(screenRadius, sw, sh) },
    screenSmoothing: spec.screenSmoothing,
  };
}

/* ------------------------------------------------------------------ */
/* MacBook                                                             */
/* ------------------------------------------------------------------ */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MacLayout {
  kind: 'macbook';
  w: number;
  h: number;
  /** Display lid; its outer rim is aluminium, the rest black glass. */
  lid: Box & { rTop: number; rBottom: number };
  rim: number;
  hinge: Box;
  /** The thin front slab of the base, as wide as the whole device. */
  base: Box;
  notch: { w: number; h: number };
  screen: ScreenRect;
}

/** Proportions of a 14″ MacBook Pro seen straight on, lid open. */
export const MAC_SPEC = {
  lid: 0.86,
  rim: 0.0032,
  bezel: 0.0165,
  chin: 0.034,
  lidRadiusTop: 0.026,
  lidRadiusBottom: 0.008,
  screenRadius: 0.0105,
  hinge: 0.0062,
  base: 0.0235,
  notchW: 0.082,
  notchH: 0.0215,
};

function macLayout(w: number, aspect: number): MacLayout {
  const S = MAC_SPEC;
  const lidW = w * S.lid;
  const lidX = (w - lidW) / 2;
  const rim = lidW * S.rim;
  const bezel = lidW * S.bezel;
  const chin = lidW * S.chin;
  const sw = lidW - 2 * (rim + bezel);
  const sh = sw * aspect;
  const lidH = rim + bezel + sh + chin + rim;
  const hingeH = w * S.hinge;
  const hingeW = lidW * 0.9;
  const baseY = lidH + hingeH * 0.5;
  const baseH = w * S.base;
  return {
    kind: 'macbook',
    w,
    h: baseY + baseH,
    lid: {
      x: lidX,
      y: 0,
      w: lidW,
      h: lidH,
      rTop: clampRadius(lidW * S.lidRadiusTop, lidW, lidH),
      rBottom: clampRadius(lidW * S.lidRadiusBottom, lidW, lidH),
    },
    rim,
    hinge: { x: (w - hingeW) / 2, y: lidH - hingeH * 0.5, w: hingeW, h: hingeH * 1.4 },
    base: { x: 0, y: baseY, w, h: baseH },
    notch: { w: sw * S.notchW, h: Math.min(sw * S.notchH, sh * 0.25) },
    screen: { x: lidX + rim + bezel, y: rim + bezel, w: sw, h: sh, radius: clampRadius(sw * S.screenRadius, sw, sh) },
  };
}

/* ------------------------------------------------------------------ */
/* Browser window and bare screenshot                                  */
/* ------------------------------------------------------------------ */

export interface BrowserLayout {
  kind: 'browser';
  w: number;
  h: number;
  radius: number;
  toolbar: number;
  screen: ScreenRect;
}

export const BROWSER_SPEC = { radius: 0.018, toolbar: 0.055 };

function browserLayout(w: number, aspect: number): BrowserLayout {
  const toolbar = w * BROWSER_SPEC.toolbar;
  const sh = w * aspect;
  const h = toolbar + sh;
  const radius = clampRadius(w * BROWSER_SPEC.radius, w, h);
  return { kind: 'browser', w, h, radius, toolbar, screen: { x: 0, y: toolbar, w, h: sh, radius: clampRadius(radius, w, sh) } };
}

/** Apple Vision Pro: a floating glass window with its grab bar below. */
export interface VisionLayout {
  kind: 'vision';
  w: number;
  h: number;
  /** The glass window; the grab bar sits under it. */
  window: Box & { radius: number };
  bar: Box;
  screen: ScreenRect;
}

export const VISION_SPEC = { glass: 0.012, radius: 0.04, barGap: 0.022, barW: 0.12, barH: 0.011 };

function visionLayout(w: number, aspect: number): VisionLayout {
  const S = VISION_SPEC;
  const glass = w * S.glass;
  const sw = w - 2 * glass;
  const sh = sw * aspect;
  const winH = sh + 2 * glass;
  const radius = clampRadius(w * S.radius, w, winH);
  const barW = w * S.barW;
  const barH = w * S.barH;
  const barY = winH + w * S.barGap;
  return {
    kind: 'vision',
    w,
    h: barY + barH,
    window: { x: 0, y: 0, w, h: winH, radius },
    bar: { x: (w - barW) / 2, y: barY, w: barW, h: barH },
    screen: { x: glass, y: glass, w: sw, h: sh, radius: clampRadius(radius - glass, sw, sh) },
  };
}

export interface BareLayout {
  kind: 'none';
  w: number;
  h: number;
  screen: ScreenRect;
}

function bareLayout(w: number, aspect: number, cornerRadius: number): BareLayout {
  const h = w * aspect;
  const r = Number.isFinite(cornerRadius) ? cornerRadius : NONE_DEFAULT_RADIUS;
  return { kind: 'none', w, h, screen: { x: 0, y: 0, w, h, radius: clampRadius(r * w, w, h) } };
}

/* ------------------------------------------------------------------ */

export type FrameLayout = SlabLayout | MacLayout | VisionLayout | BrowserLayout | BareLayout;

/**
 * Full layout of a frame. `cornerRadius` (fraction of width) only affects
 * frame "none"; every input is sanitised so the result is always finite.
 */
export function frameLayout(frame: DeviceFrameId, widthPx: number, screenAspect: number, cornerRadius = NONE_DEFAULT_RADIUS): FrameLayout {
  const f = knownFrame(frame);
  const w = sanitizeWidth(widthPx);
  const a = sanitizeAspect(f, screenAspect);
  switch (f) {
    case 'iphone':
    case 'ipad':
    case 'android-phone':
    case 'android-tablet':
    case 'watch':
    case 'tv':
      return slabLayout(f, w, a);
    case 'vision':
      return visionLayout(w, a);
    case 'macbook':
      return macLayout(w, a);
    case 'browser':
      return browserLayout(w, a);
    case 'none':
      return bareLayout(w, a, cornerRadius);
  }
}

/** The public geometry (body box + screen rect) of a layout. */
export function toGeometry(layout: FrameLayout): DeviceGeometry {
  const s = layout.screen;
  return { width: layout.w, height: layout.h, screen: { x: s.x, y: s.y, w: s.w, h: s.h, radius: s.radius } };
}

/**
 * Filmstrip layout of the stage and the zoom maths around it.
 *
 * Zoom is relative to "fit": zoom 1 is the largest slide size at which one
 * slide fits the viewport (its height minus the padding, and never wider
 * than the viewport), and the store's `zoom` multiplies that. Every slide
 * is placed absolutely, so the same pure function tells React where to put
 * things and tells the zoom code where a content point moves to.
 */
import { ZOOM_MAX, ZOOM_MIN } from '../../../store/editor';

/** Space left and right of the strip (CSS px). */
export const PAD_X = 56;
/** Space above the slide headers. */
export const PAD_TOP = 20;
/** Slide header row (label + badge) plus its gap to the slide. */
export const HEADER_H = 32;
/** Space below the slides; equals PAD_TOP + HEADER_H so a fitted slide sits in the middle. */
export const PAD_BOTTOM = PAD_TOP + HEADER_H;
/** Gap between slides at normal sizes (none in panorama mode, where the strip is one picture). */
export const SLIDE_GAP = 32;
/** Gap before the "Add slide" tile at normal sizes. */
export const ADD_GAP = 32;
/** Gaps never shrink below this when zoomed far out. */
export const MIN_GAP = 12;
/** Smallest slide height the stage ever lays out. */
export const MIN_SLIDE_H = 48;


export interface StageLayoutInput {
  viewportW: number;
  viewportH: number;
  /** Design canvas of the active family. */
  design: { width: number; height: number };
  /** Multiplier relative to fit (1 = fit). */
  zoom: number;
  slideCount: number;
  panorama: boolean;
  /** Whether the "Add slide" tile is laid out after the strip. */
  addTile?: boolean;
}

export interface StageLayout {
  /** Slide size in CSS px (whole pixels). */
  slideW: number;
  slideH: number;
  /** Slide height at zoom 1. */
  fitH: number;
  gap: number;
  count: number;
  /** Left edge of the first slide in content coordinates. */
  stripLeft: number;
  /** Width of the slides with their gaps. */
  stripW: number;
  /** Top edge of every slide (headers sit above it). */
  slideTop: number;
  addLeft: number;
  addW: number;
  contentW: number;
  contentH: number;
}

const pos = (v: number, fallback: number) => (Number.isFinite(v) && v > 0 ? v : fallback);
/** A usable length: finite and not negative (broken measurements count as 0). */
const len = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Slide height at zoom 1: the viewport height minus padding, narrowed so one slide never exceeds the viewport width. */
export function fitSlideHeight(viewportW: number, viewportH: number, design: { width: number; height: number }): number {
  const aspect = pos(design.height, 1) / pos(design.width, 1);
  const byHeight = len(viewportH) - PAD_TOP - HEADER_H - PAD_BOTTOM;
  const byWidth = (len(viewportW) - 2 * PAD_X) * aspect;
  return Math.max(MIN_SLIDE_H, Math.floor(Math.min(byHeight, byWidth)));
}

/**
 * Gap after a slide `slideW` wide: SLIDE_GAP at normal sizes, narrowing
 * with the slides when zoomed far out so an overview stays dense.
 */
export function slideGap(slideW: number, base = SLIDE_GAP): number {
  return Math.round(Math.min(base, Math.max(MIN_GAP, len(slideW) * 0.16)));
}

/** Width of the "Add slide" tile for a slide of `slideW` x `slideH`: about a phone's shape, never wider than a slide. */
export function addTileWidth(slideW: number, slideH: number): number {
  return Math.round(Math.max(48, Math.min(slideW, Math.max(120, slideH * 0.45))));
}

export function computeStageLayout(input: StageLayoutInput): StageLayout {
  const viewportW = len(input.viewportW);
  const viewportH = len(input.viewportH);
  const count = Math.max(0, Math.floor(len(input.slideCount)));
  const fitH = fitSlideHeight(viewportW, viewportH, input.design);
  const slideH = Math.max(1, Math.round(fitH * clampZoom(input.zoom)));
  const slideW = Math.max(1, Math.round((slideH * pos(input.design.width, 1)) / pos(input.design.height, 1)));
  const gap = input.panorama ? 0 : slideGap(slideW);
  const addGap = slideGap(slideW, ADD_GAP);
  const stripW = count > 0 ? count * slideW + (count - 1) * gap : 0;
  const withAdd = input.addTile !== false;
  const addW = withAdd ? addTileWidth(slideW, slideH) : 0;
  const addSpan = withAdd ? (count > 0 ? addGap : 0) + addW : 0;
  const totalW = stripW + addSpan;
  const contentW = Math.max(viewportW, Math.ceil(totalW + 2 * PAD_X));
  // Centre the strip when it is narrower than the viewport.
  const stripLeft = Math.max(PAD_X, Math.round((contentW - totalW) / 2));
  const blockH = HEADER_H + slideH;
  const contentH = Math.max(viewportH, PAD_TOP + blockH + PAD_BOTTOM);
  const slideTop = Math.max(PAD_TOP + HEADER_H, Math.round((contentH - slideH) / 2));
  const addLeft = stripLeft + stripW + (count > 0 && withAdd ? addGap : 0);
  return { slideW, slideH, fitH, gap, count, stripLeft, stripW, slideTop, addLeft, addW, contentW, contentH };
}

/** Left edge of slide `i` in content coordinates. */
export function slideLeft(layout: StageLayout, i: number): number {
  return layout.stripLeft + i * (layout.slideW + layout.gap);
}

/* Zoom anchoring -------------------------------------------------------- */

/**
 * A content point described relative to the strip so it can be found again
 * after a zoom: on a slide it is a fraction of that slide; in a gap (gaps do
 * not scale) it is a distance from the slide before it; before the strip a
 * distance from its left edge. Vertically it is a fraction of the slide height.
 */
export type StripAnchor =
  | { kind: 'slide'; index: number; fx: number; fy: number }
  | { kind: 'after'; index: number; dx: number; fy: number }
  | { kind: 'before'; dx: number; fy: number };

export function anchorAt(layout: StageLayout, x: number, y: number): StripAnchor {
  const fy = (y - layout.slideTop) / Math.max(1, layout.slideH);
  if (layout.count === 0 || x < layout.stripLeft) return { kind: 'before', dx: x - layout.stripLeft, fy };
  const pitch = layout.slideW + layout.gap;
  const index = Math.min(layout.count - 1, Math.floor((x - layout.stripLeft) / pitch));
  const left = slideLeft(layout, index);
  const within = x - left;
  if (within <= layout.slideW) return { kind: 'slide', index, fx: within / Math.max(1, layout.slideW), fy };
  return { kind: 'after', index, dx: within - layout.slideW, fy };
}

export function pointOf(layout: StageLayout, anchor: StripAnchor): { x: number; y: number } {
  const y = layout.slideTop + anchor.fy * layout.slideH;
  if (anchor.kind === 'before' || layout.count === 0) {
    return { x: layout.stripLeft + (anchor.kind === 'before' ? anchor.dx : 0), y };
  }
  const index = Math.min(layout.count - 1, Math.max(0, anchor.index));
  const left = slideLeft(layout, index);
  if (anchor.kind === 'slide') return { x: left + anchor.fx * layout.slideW, y };
  return { x: left + layout.slideW + anchor.dx, y };
}

export interface ScrollState {
  scrollLeft: number;
  scrollTop: number;
  viewportW: number;
  viewportH: number;
}

const clampScroll = (v: number, content: number, viewport: number) => Math.round(Math.min(Math.max(0, content - viewport), Math.max(0, v)));

/**
 * Scroll position after a relayout that keeps the content under the
 * viewport point (vx, vy) in place (the cursor for wheel zoom, the
 * viewport centre otherwise).
 */
export function scrollForAnchor(prev: StageLayout, next: StageLayout, scroll: ScrollState, vx: number, vy: number): { scrollLeft: number; scrollTop: number } {
  const anchor = anchorAt(prev, scroll.scrollLeft + vx, scroll.scrollTop + vy);
  const p = pointOf(next, anchor);
  return {
    scrollLeft: clampScroll(p.x - vx, next.contentW, scroll.viewportW),
    scrollTop: clampScroll(p.y - vy, next.contentH, scroll.viewportH),
  };
}

/**
 * The horizontal scroll that brings slide `index` fully into view with a
 * margin, moving as little as possible (centred when it is wider than the
 * viewport), or null when it is already visible. `through` extends the
 * range to reveal (the "Add slide" tile after the last slide) when
 * everything still fits. A target within the strip padding of either end
 * of the content snaps to that end, so the first and last slides come
 * into view with their full margin.
 */
export function scrollToReveal(layout: StageLayout, index: number, scrollLeft: number, viewportW: number, margin = 24, through?: number): number | null {
  if (index < 0 || index >= layout.count) return null;
  const left = slideLeft(layout, index);
  const slideRight = left + layout.slideW;
  const right = through !== undefined && through > slideRight && through - left + 2 * margin <= viewportW ? through : slideRight;
  if (left >= scrollLeft && right <= scrollLeft + viewportW) return null;
  const max = Math.max(0, layout.contentW - viewportW);
  // Smallest scroll that shows the right end, largest that still shows the left edge.
  const lo = right + margin - viewportW;
  const hi = left - margin;
  let target: number;
  if (lo > hi) target = left + layout.slideW / 2 - viewportW / 2;
  else if (left < scrollLeft) target = hi <= PAD_X ? 0 : hi;
  else target = max - lo <= PAD_X ? max : lo;
  const next = clampScroll(target, layout.contentW, viewportW);
  return next === Math.round(scrollLeft) ? null : next;
}

/* Wheel ------------------------------------------------------------------ */

/** Pixels per wheel "line" (deltaMode 1) and "page" (deltaMode 2). */
const LINE_PX = 16;
const PAGE_PX = 400;

/** Wheel delta in pixels whatever the deltaMode. */
export function wheelPixels(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) return 0;
  return deltaMode === 1 ? delta * LINE_PX : deltaMode === 2 ? delta * PAGE_PX : delta;
}

/**
 * Zoom multiplier for one Ctrl/Cmd + wheel event: a mouse notch (100 px)
 * zooms by about 18 %, a trackpad pinch (a few px per event) smoothly.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = Math.max(-120, Math.min(120, wheelPixels(deltaY, deltaMode)));
  return Math.pow(1.002, -px);
}

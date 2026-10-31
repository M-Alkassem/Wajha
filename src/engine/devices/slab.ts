/**
 * Shared painter for "slab" devices (phones and tablets): metal band,
 * uniform bezel, screen, then per-device hardware. Frames plug their
 * cameras and buttons in through `SlabHardware`.
 */
import type { Ctx2D } from '../types';
import type { SlabLayout } from './geometry';
import type { FramePaint } from './finish';
import { sampleStops } from './finish';
import { insetSmoothRect, roundRectPath, smoothRectPath } from './paths';
import type { Rect, ScreenContent } from './screen';
import { paintScreen } from './screen';

export interface SlabHardware {
  /** Side buttons, painted before the body so the body hides where they attach. */
  buttons?(ctx: Ctx2D, L: SlabLayout, paint: FramePaint): void;
  /** Cameras sitting in the bezel, painted before the screen. */
  bezel?(ctx: Ctx2D, L: SlabLayout, px: number): void;
  /** Islands and punch holes, painted over the screen. */
  overlays?(ctx: Ctx2D, L: SlabLayout, px: number): void;
}

/** Fills the ring between two insets of a shape (even-odd), touching only the ring's pixels. */
export function fillRing(ctx: Ctx2D, pathAt: (inset: number) => void, outer: number, inner: number, fill: string | CanvasGradient): void {
  ctx.beginPath();
  pathAt(outer);
  pathAt(inner);
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
}

/**
 * Paints a band from the outer edge of a shape to `band` inside it.
 * `pathAt(inset)` must add the shape inset by `inset`. The profile is
 * built from thin concentric strokes over a base fill, which gives a true
 * cross-band gradient (bright glint, darker edges) that linear gradients
 * cannot, and the base fill hides seams between strokes. Fills are rings,
 * not whole shapes: the inside is covered later anyway and full-size fills
 * dominated the raster cost.
 */
export function paintBand(ctx: Ctx2D, pathAt: (inset: number) => void, band: number, paint: FramePaint, px: number, box: Rect): void {
  // Reaches one pixel under whatever is painted inside the band, so no seam shows.
  fillRing(ctx, pathAt, 0, band + Math.min(1 / px, band), sampleStops(paint.band, 0.55));
  if (band > 0) {
    const n = Math.max(1, Math.min(24, Math.ceil((band * px) / 0.75)));
    const step = band / n;
    ctx.lineWidth = step;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = sampleStops(paint.band, (i + 0.5) / n);
      ctx.beginPath();
      pathAt((i + 0.5) * step);
      ctx.stroke();
    }
  }
  if (paint.sheen && band > 0) {
    const g = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    for (const [offset, color] of paint.sheen) g.addColorStop(offset, color);
    fillRing(ctx, pathAt, 0, band, g);
  }
}

/** Soft shadow cast inwards along a screen's edge, so a body-coloured bezel reads as a raised frame. */
export function paintInnerShadow(ctx: Ctx2D, r: Rect, clip: (ctx: Ctx2D) => void, blur: number, offsetY: number, alpha: number): void {
  ctx.save();
  ctx.beginPath();
  clip(ctx);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(r.x - r.w, r.y - r.h, r.w * 3, r.h * 3);
  clip(ctx);
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  ctx.restore();
}

export type Edge = 'left' | 'right' | 'top';

/**
 * A hardware button sticking out of a straight body edge. `edge` is the
 * x (left/right) or y (top) of that edge, `from`/`to` the span along it.
 */
export function paintButton(ctx: Ctx2D, side: Edge, edge: number, from: number, to: number, out: number, paint: FramePaint): void {
  if (!(to > from) || !(out > 0)) return;
  const root = out * 1.6;
  const len = to - from;
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  let g: CanvasGradient;
  if (side === 'top') {
    x = from;
    y = edge - out;
    w = len;
    h = out + root;
    g = ctx.createLinearGradient(0, edge - out, 0, edge);
  } else {
    x = side === 'left' ? edge - out : edge - root;
    y = from;
    w = out + root;
    h = len;
    g = side === 'left' ? ctx.createLinearGradient(edge - out, 0, edge, 0) : ctx.createLinearGradient(edge + out, 0, edge, 0);
  }
  g.addColorStop(0, paint.buttonEdge);
  g.addColorStop(0.45, paint.buttonFace);
  g.addColorStop(1, paint.buttonFace);
  ctx.fillStyle = g;
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, out * 0.95);
  ctx.fill();
}

/** A front camera lens: dark ring, deep blue glass, one tiny glint. */
export function paintLens(ctx: Ctx2D, cx: number, cy: number, r: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#16171c';
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 0, cx, cy, r * 0.72);
  g.addColorStop(0, '#2a3350');
  g.addColorStop(0.55, '#0d1120');
  g.addColorStop(1, '#05060a');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - r * 0.24, cy - r * 0.26, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(170, 190, 255, 0.35)';
  ctx.fill();
}

/** Body, band, bezel, screen and hardware of a phone or tablet, at the current origin (device top-left). */
export function paintSlab(ctx: Ctx2D, L: SlabLayout, paint: FramePaint, px: number, content: ScreenContent, hw: SlabHardware): void {
  if (L.upright) {
    // Lying on its side: the upright device turned a quarter to the left,
    // its screen content painted the right way up.
    ctx.save();
    ctx.translate(0, L.h);
    ctx.rotate(-Math.PI / 2);
    paintUpright(ctx, L.upright, paint, px, content, hw, true);
    ctx.restore();
    return;
  }
  paintUpright(ctx, L, paint, px, content, hw, false);
}

function paintUpright(ctx: Ctx2D, L: SlabLayout, paint: FramePaint, px: number, content: ScreenContent, hw: SlabHardware, turned: boolean): void {
  const body = (inset: number) => insetSmoothRect(ctx, L.w, L.h, L.radius, L.smoothing, inset);
  hw.buttons?.(ctx, L, paint);
  paintBand(ctx, body, L.band, paint, px, { x: 0, y: 0, w: L.w, h: L.h });

  // Bezel ring. Its hole follows the screen's own corners (tablets use a
  // rounder screen than the body), tucked one pixel under the screen edge.
  const s = L.screen;
  const o = Math.min(1 / px, s.w / 4, s.h / 4);
  ctx.beginPath();
  body(L.band);
  smoothRectPath(ctx, s.x + o, s.y + o, s.w - 2 * o, s.h - 2 * o, Math.max(0, s.radius - o), L.screenSmoothing);
  ctx.fillStyle = paint.bezel;
  ctx.fill('evenodd');
  if (!paint.bezelMatchesBody) {
    // Cover glass catches a hairline of light where it meets the frame.
    const hair = Math.min(1 / px, (L.inset - L.band) * 0.25);
    ctx.lineWidth = hair;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.beginPath();
    body(L.band + hair * 0.5);
    ctx.stroke();
  }
  hw.bezel?.(ctx, L, px);

  const screenPath = (c: Ctx2D) => smoothRectPath(c, s.x, s.y, s.w, s.h, s.radius, L.screenSmoothing);
  if (turned) paintTurnedScreen(ctx, s, screenPath, content, L.w);
  else paintScreen(ctx, s, screenPath, content);
  if (paint.bezelMatchesBody) paintInnerShadow(ctx, s, screenPath, L.w * 0.014 * px, L.w * 0.003 * px, 0.2);
  hw.overlays?.(ctx, L, px);
}

/**
 * The screen of a device painted turned (see paintSlab): clipped to its
 * shape in the device's own coordinates, then filled with the turn undone,
 * so a landscape screenshot or mock reads the right way up. `uprightW` is
 * the upright device's width, the turned device's height.
 */
function paintTurnedScreen(ctx: Ctx2D, s: Rect, clip: (ctx: Ctx2D) => void, content: ScreenContent, uprightW: number): void {
  ctx.save();
  ctx.beginPath();
  clip(ctx);
  ctx.clip();
  ctx.rotate(Math.PI / 2);
  ctx.translate(0, -uprightW);
  const r = { x: s.y, y: uprightW - s.x - s.w, w: s.h, h: s.w };
  paintScreen(ctx, r, (c) => c.rect(r.x, r.y, r.w, r.h), content);
  ctx.restore();
}

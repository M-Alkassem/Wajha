/**
 * Path builders shared by the device frames and the mock screens.
 *
 * Everything is hand-rolled on moveTo/lineTo/arc/bezierCurveTo because
 * `roundRect` is missing on the older WebKit builds we support, and because
 * Apple hardware needs continuous ("squircle") corners that no canvas API
 * offers. Builders only add to the current path; callers begin, fill, stroke
 * or clip.
 */
import type { Ctx2D } from '../types';

/** Corner radii clockwise from the top-left corner. */
export type Radii = readonly [number, number, number, number];

const HALF_PI = Math.PI / 2;

const finitePos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Adds a rectangle with circular corners. Radii are clamped to half of the
 * shorter side, so a huge radius gives a pill or a circle, never a bow tie.
 */
export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number | Radii): void {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(x + y + w + h)) return;
  const max = Math.min(w, h) / 2;
  const [a, b, c, d] = typeof r === 'number' ? [r, r, r, r] : r;
  const tl = Math.min(finitePos(a), max);
  const tr = Math.min(finitePos(b), max);
  const br = Math.min(finitePos(c), max);
  const bl = Math.min(finitePos(d), max);
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arc(x + w - tr, y + tr, tr, -HALF_PI, 0);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arc(x + w - br, y + h - br, br, 0, HALF_PI);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arc(x + bl, y + h - bl, bl, HALF_PI, Math.PI);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arc(x + tl, y + tl, tl, Math.PI, Math.PI + HALF_PI);
  ctx.closePath();
}

/** Corner frames for a clockwise walk: corner point, incoming edge direction, outgoing edge direction. */
type Corner = { ox: number; oy: number; ux: number; uy: number; vx: number; vy: number };

/**
 * Adds a rectangle with continuous-curvature corners (the iOS look), using
 * Figma's corner-smoothing construction: each corner starts `(1 + smoothing)
 * * radius` before the corner point, eases in with a cubic, follows a short
 * circular arc and eases out with a mirrored cubic. `smoothing` 0 is a plain
 * circular corner; 0.6 matches iOS app icons. Smoothing is reduced when the
 * longer corner would not fit, which keeps small shapes well-formed.
 */
export function smoothRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, radius: number, smoothing: number): void {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(x + y + w + h)) return;
  const budget = Math.min(w, h) / 2;
  const R = Math.min(finitePos(radius), budget);
  let xi = Number.isFinite(smoothing) ? Math.min(Math.max(smoothing, 0), 1) : 0;
  if (R > 0) xi = Math.min(xi, budget / R - 1);
  if (R <= 0 || xi < 0.01) {
    roundRectPath(ctx, x, y, w, h, R);
    return;
  }
  const p = Math.min((1 + xi) * R, budget);
  const arcMeasure = HALF_PI * (1 - xi);
  const L = Math.sin(arcMeasure / 2) * R * Math.SQRT2;
  const alpha = (HALF_PI - arcMeasure) / 2;
  const beta = (Math.PI / 4) * xi;
  const c = R * Math.tan(alpha / 2) * Math.cos(beta);
  const d = c * Math.tan(beta);
  const b = (p - L - c - d) / 3;
  const a = 2 * b;

  const corners: Corner[] = [
    { ox: x + w, oy: y, ux: 1, uy: 0, vx: 0, vy: 1 },
    { ox: x + w, oy: y + h, ux: 0, uy: 1, vx: -1, vy: 0 },
    { ox: x, oy: y + h, ux: -1, uy: 0, vx: 0, vy: -1 },
    { ox: x, oy: y, ux: 0, uy: -1, vx: 1, vy: 0 },
  ];
  // Point at (along u, along v) in a corner's frame.
  const at = (k: Corner, su: number, sv: number): [number, number] => [k.ox + k.ux * su + k.vx * sv, k.oy + k.uy * su + k.vy * sv];

  ctx.moveTo(x + p, y);
  for (const k of corners) {
    const [x0, y0] = at(k, -p, 0);
    ctx.lineTo(x0, y0);
    const [c1x, c1y] = at(k, -p + a, 0);
    const [c2x, c2y] = at(k, -p + a + b, 0);
    const [x1, y1] = at(k, -p + a + b + c, d);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1);
    const [cx, cy] = at(k, -R, R);
    const [x2, y2] = at(k, -p + a + b + c + L, d + L);
    const t1 = Math.atan2(y1 - cy, x1 - cx);
    let t2 = Math.atan2(y2 - cy, x2 - cx);
    if (t2 < t1) t2 += Math.PI * 2;
    ctx.arc(cx, cy, R, t1, t2);
    const [c3x, c3y] = at(k, -p + a + b + c + L + d, d + L + c);
    const [c4x, c4y] = at(k, -p + a + b + c + L + d, d + L + b + c);
    const [x3, y3] = at(k, 0, p);
    ctx.bezierCurveTo(c3x, c3y, c4x, c4y, x3, y3);
  }
  ctx.closePath();
}

/** Adds a rounded rectangle inset by `inset` on every side, shrinking the radius to stay concentric. */
export function insetSmoothRect(ctx: Ctx2D, w: number, h: number, radius: number, smoothing: number, inset: number): void {
  smoothRectPath(ctx, inset, inset, w - 2 * inset, h - 2 * inset, Math.max(0, radius - inset), smoothing);
}

/** Adds a horizontal pill (fully rounded ends). */
export function pillPath(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  roundRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
}

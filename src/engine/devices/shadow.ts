/**
 * Soft drop shadows shaped like a device body, without ctx.filter.
 *
 * Canvas shadows ignore the current transform: shadowBlur and shadowOffset
 * are in canvas pixels. That is what we want for the light direction (a
 * tilted phone still casts its shadow straight down), but it means lengths
 * must be scaled by the transform's zoom (DPR, editor zoom) by hand.
 */
import type { Shadow } from '../../model/types';
import type { Ctx2D } from '../types';
import type { RGBA } from '../color';
import { parseColor, rgba } from '../color';

interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** The current transform, or null on engines without getTransform. */
export function currentMatrix(ctx: Ctx2D): Affine | null {
  if (typeof ctx.getTransform !== 'function') return null;
  const m = ctx.getTransform();
  const vals = [m.a, m.b, m.c, m.d, m.e, m.f];
  return vals.every(Number.isFinite) ? { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } : null;
}

/** Canvas pixels per local unit (geometric mean of the axis scales), 1 when unknown. */
export function currentScale(ctx: Ctx2D): number {
  const m = currentMatrix(ctx);
  if (!m) return 1;
  const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  return Number.isFinite(s) && s > 0 ? s : 1;
}

const fin = (v: number) => (Number.isFinite(v) ? v : 0);

/**
 * Contact shading: a few soft strokes along the outline, nudged down,
 * standing in for a tight second shadow that grounds the device like real
 * product shots. Canvas blurs are full-area convolutions and a second one
 * doubled the cost of a device; strokes cost a fraction and read the same.
 * `c` is the falloff in canvas pixels; the inner half of each stroke is
 * hidden under the opaque body painted afterwards.
 */
function contactEdge(ctx: Ctx2D, color: RGBA, c: number, offsetY: number, m: Affine, scale: number, addPath: (ctx: Ctx2D) => void): void {
  if (!(c >= 0.75)) return;
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return;
  ctx.save();
  // A downward canvas offset expressed in local units, so it survives rotation.
  ctx.translate((-m.c * offsetY) / det, (m.a * offsetY) / det);
  ctx.lineJoin = 'round';
  for (const [k, a] of CONTACT_STEPS) {
    ctx.lineWidth = (2 * c * k) / scale;
    ctx.strokeStyle = rgba(color, a);
    ctx.beginPath();
    addPath(ctx);
    ctx.stroke();
  }
  ctx.restore();
}

/** [half-width as a fraction of the falloff, alpha]; overlapping strokes build a smooth ramp. */
const CONTACT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.03],
  [0.62, 0.04],
  [0.36, 0.055],
  [0.16, 0.07],
];

/**
 * Paints only the shadow of the shape that `addPath` describes (local
 * coordinates, box `w` x `h` at the current origin): the designer's shadow
 * as specified, plus optional contact shading (`contact`) along the outline.
 */
export function drawShadow(ctx: Ctx2D, shadow: Shadow, unit: number, w: number, h: number, addPath: (ctx: Ctx2D) => void, contact = true): void {
  const color = parseColor(shadow.color);
  if (!(color.a > 0)) return;
  const m = currentMatrix(ctx);
  const det = m ? m.a * m.d - m.b * m.c : 1;
  const scale = Math.sqrt(Math.abs(det)) || 1;
  const u = Math.max(0, fin(unit)) * scale;
  const blur = Math.max(0, fin(shadow.blur)) * u;
  const x = fin(shadow.x) * u;
  const y = fin(shadow.y) * u;
  if (blur === 0 && x === 0 && y === 0) return;

  ctx.save();
  ctx.shadowColor = rgba(color);
  ctx.shadowBlur = blur;
  if (m && Math.abs(det) > 1e-12) {
    // Draw the casting shape far to the left of the canvas and push its
    // shadow back by the same distance: only the shadow lands on screen,
    // so translucent screens or antialiased edges never show a dark copy.
    const cx = m.a * (w / 2) + m.c * (h / 2) + m.e;
    const extent = (w + h) * scale;
    const canvasW = ctx.canvas && Number.isFinite(ctx.canvas.width) ? ctx.canvas.width : 0;
    const far = Math.abs(cx) + extent + canvasW + blur * 3 + 256;
    ctx.translate((-far * m.d) / det, (far * m.b) / det);
    ctx.shadowOffsetX = far + x;
    ctx.shadowOffsetY = y;
  } else {
    // No transform access: cast from the shape itself but clip the shape
    // away, which is the CSS box-shadow look (shadow only outside the body).
    const pad = blur * 4 + 1e4;
    ctx.beginPath();
    ctx.rect(-w - pad, -h - pad, 3 * w + 2 * pad, 3 * h + 2 * pad);
    addPath(ctx);
    ctx.clip('evenodd');
    ctx.shadowOffsetX = x;
    ctx.shadowOffsetY = y;
  }
  ctx.fillStyle = '#000';
  ctx.beginPath();
  addPath(ctx);
  ctx.fill();
  ctx.restore();

  if (contact && blur > 0 && m) contactEdge(ctx, color, Math.min(blur * 0.2, 24 * scale), Math.max(0, y) * 0.12, m, scale, addPath);
}

/**
 * Decorative shapes: circle (an ellipse filling width x height), rect
 * (corner radius = radius x min(w, h), clamped to half), blob (a smooth
 * closed curve from `seed`) and ring (an ellipse outline `stroke` x u
 * thick, its outer edge on the box). Any Fill works, laid out over the
 * shape's own box.
 *
 * `blur > 0` turns the shape into a soft glow without ctx.filter (missing
 * in WebKit): the shape is drawn far to the left of a scratch canvas with
 * a shadow offset back into view, so only its Gaussian shadow lands. Non
 * solid fills are painted into a second scratch and masked by that blurred
 * silhouette. The scratch is built at reduced resolution (blur hides the
 * detail) and cached, so a glow costs one drawImage per frame.
 */
import type { Fill, ShapeElement } from '../model/types';
import type { Ctx2D, ImageLike } from './types';
import { cssColor, isPaintable, paintFill, simpleFillStyle, type PaintContext } from './paint';
import { clamp, ellipsePath, mulberry32, num, roundedRect, seedInt, TAU, withFastSampling, type Rect } from './geometry';
import { engineCache, objectId } from './cache';

const SHAPES = new Set(['circle', 'rect', 'blob', 'ring']);

/** Outline of a blob as cubic Béziers in a unit box centred on 0: [x0, y0, (c1x, c1y, c2x, c2y, x, y)*]. */
const blobs = engineCache<number, Float64Array>(128);
const glows = engineCache<string, ImageLike>(48, 16 * 1024 * 1024);

/** Blur is rendered at the resolution where its Gaussian sigma is about this many pixels. */
const GLOW_SIGMA = 3;
const GLOW_MAX_PIXELS = 600_000;

/** Pixel size of a shape element (never negative or NaN). */
export function shapeSize(el: ShapeElement, u: number): { w: number; h: number } {
  return { w: Math.max(0, num(el.width, 0) * u), h: Math.max(0, num(el.height, 0) * u) };
}

/** Deterministic blob outline for a seed; the curve exactly fills the unit box. */
export function blobOutline(seed: number): Float64Array {
  const key = seedInt(seed);
  const hit = blobs.get(key);
  if (hit) return hit;
  const rand = mulberry32(key ^ 0x5bd1e995);
  const n = 6 + Math.floor(rand() * 4);
  const rot = rand() * TAU;
  // Radii follow two low harmonics with seeded phases plus a little per-point jitter:
  // independent random radii put neighbours at very different distances and leave kinks.
  const a2 = 0.07 + rand() * 0.09;
  const a3 = 0.04 + rand() * 0.07;
  const p2 = rand() * TAU;
  const p3 = rand() * TAU;
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < n; i++) {
    // Angle jitter stays well under half a step, so points never swap order and the curve never loops.
    const a = rot + ((i + (rand() - 0.5) * 0.3) * TAU) / n;
    const r = 1 + a2 * Math.sin(2 * a + p2) + a3 * Math.sin(3 * a + p3) + (rand() - 0.5) * 0.08;
    px.push(Math.cos(a) * r);
    py.push(Math.sin(a) * r);
  }
  // Catmull-Rom through the points, as cubic Béziers. Standard tension (1/6) sags inside the
  // circle and leaves flat facets; matching the handle length of a circular arc between
  // neighbours (4/3 tan(θ/4) of the radius) keeps the outline full and round.
  const step = TAU / n;
  const k = ((4 / 3) * Math.tan(step / 4)) / (2 * Math.sin(step));
  const out = new Float64Array(2 + n * 6);
  out[0] = px[0];
  out[1] = py[0];
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    const o = 2 + i * 6;
    out[o] = px[i] + (px[i2] - px[i0]) * k;
    out[o + 1] = py[i] + (py[i2] - py[i0]) * k;
    out[o + 2] = px[i2] - (px[i3] - px[i]) * k;
    out[o + 3] = py[i2] - (py[i3] - py[i]) * k;
    out[o + 4] = px[i2];
    out[o + 5] = py[i2];
  }
  // Normalise the curve (not just its control points) to the unit box, so the drawn blob
  // matches the element box the editor shows.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let x0 = out[0];
  let y0 = out[1];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * 6;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      const x = a * x0 + b * out[o] + c * out[o + 2] + d * out[o + 4];
      const y = a * y0 + b * out[o + 1] + c * out[o + 3] + d * out[o + 5];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    x0 = out[o + 4];
    y0 = out[o + 5];
  }
  const sx = 1 / Math.max(1e-6, maxX - minX);
  const sy = 1 / Math.max(1e-6, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < out.length; i += 2) {
    out[i] = (out[i] - cx) * sx;
    out[i + 1] = (out[i + 1] - cy) * sy;
  }
  blobs.set(key, out);
  return out;
}

/**
 * Adds the shape's outline centred on (ox, oy) at scale k. Returns false
 * when there is nothing to draw (unknown kind, zero size, zero ring).
 */
function tracePath(ctx: Ctx2D, el: ShapeElement, w: number, h: number, u: number, ox: number, oy: number, k: number): boolean {
  const W = w * k;
  const H = h * k;
  switch (el.shape) {
    case 'circle':
      ellipsePath(ctx, ox, oy, W / 2, H / 2);
      return true;
    case 'rect':
      roundedRect(ctx, ox - W / 2, oy - H / 2, W, H, clamp(num(el.radius, 0), 0, 0.5) * Math.min(W, H));
      return true;
    case 'blob': {
      const b = blobOutline(el.seed);
      ctx.moveTo(ox + b[0] * W, oy + b[1] * H);
      for (let i = 2; i + 5 < b.length; i += 6) {
        ctx.bezierCurveTo(ox + b[i] * W, oy + b[i + 1] * H, ox + b[i + 2] * W, oy + b[i + 3] * H, ox + b[i + 4] * W, oy + b[i + 5] * H);
      }
      ctx.closePath();
      return true;
    }
    case 'ring': {
      const sw = clamp(num(el.stroke, 0) * u, 0, Math.min(w, h) / 2) * k;
      if (sw < 0.25 * k) return false;
      ellipsePath(ctx, ox, oy, W / 2, H / 2);
      // The hole winds the other way, so the default nonzero rule leaves a ring.
      if (W / 2 - sw > 0 && H / 2 - sw > 0) ellipsePath(ctx, ox, oy, W / 2 - sw, H / 2 - sw, true);
      return true;
    }
    default:
      return false;
  }
}

function drawSharp(ctx: Ctx2D, el: ShapeElement, w: number, h: number, u: number, pc: PaintContext): void {
  ctx.beginPath();
  if (!tracePath(ctx, el, w, h, u, 0, 0, 1)) return;
  const box: Rect = { x: -w / 2, y: -h / 2, w, h };
  const style = simpleFillStyle(ctx, el.fill, box);
  if (style !== null) {
    ctx.fillStyle = style;
    ctx.fill();
    return;
  }
  // Mesh and image fills need several paint calls: clip to the outline and paint the box.
  ctx.save();
  try {
    ctx.clip();
    paintFill(ctx, el.fill, box, pc);
  } finally {
    ctx.restore();
  }
}

function fillKey(fill: Fill, pc: PaintContext): string {
  if (fill.type !== 'image') return JSON.stringify(fill);
  let img: ImageLike | null = null;
  try {
    img = typeof fill.assetId === 'string' ? pc.getImage(fill.assetId) : null;
  } catch {
    img = null;
  }
  return `${JSON.stringify(fill)}|${img ? objectId(img) : 0}`;
}

function drawGlow(ctx: Ctx2D, el: ShapeElement, w: number, h: number, u: number, blurPx: number, pc: PaintContext): void {
  const sigma = blurPx / 2;
  const margin = Math.ceil(blurPx * 1.5) + 2; // ~3 sigma: where the Gaussian has faded out
  const fullW = w + 2 * margin;
  const fullH = h + 2 * margin;
  let s = Math.min(1, GLOW_SIGMA / sigma);
  if (fullW * fullH * s * s > GLOW_MAX_PIXELS) s = Math.sqrt(GLOW_MAX_PIXELS / (fullW * fullH));
  const sw = Math.max(1, Math.ceil(fullW * s));
  const sh = Math.max(1, Math.ceil(fullH * s));
  const fill = el.fill;
  const key = [el.shape, w.toFixed(2), h.toFixed(2), u.toFixed(2), blurPx.toFixed(2), sw, sh, num(el.radius, 0), num(el.stroke, 0), seedInt(el.seed), fillKey(fill, pc)].join('|');
  let glow = glows.get(key);
  if (!glow) {
    let made: ImageLike | null = null;
    try {
      made = renderGlow(el, w, h, u, blurPx, s, sw, sh, pc);
    } catch {
      made = null;
    }
    if (!made) return;
    glow = made;
    glows.set(key, glow, sw * sh * 4);
  }
  // Map scratch pixels back exactly (sw / s rather than fullW, which ceil() rounded).
  const img = glow;
  withFastSampling(ctx, () => ctx.drawImage(img, -sw / (2 * s), -sh / (2 * s), sw / s, sh / s));
}

function renderGlow(el: ShapeElement, w: number, h: number, u: number, blurPx: number, s: number, sw: number, sh: number, pc: PaintContext): ImageLike | null {
  let mask: { canvas: ImageLike; ctx: Ctx2D };
  try {
    mask = pc.env.createCanvas(sw, sh);
  } catch {
    return null;
  }
  const fill = el.fill;
  const solid = fill.type === 'solid' ? cssColor(fill.color) : null;
  const g = mask.ctx;
  // Far enough left that the shape itself never touches the scratch canvas.
  const offset = sw + Math.ceil(blurPx * s * 2) + 16;
  g.shadowColor = solid ?? '#000000';
  g.shadowBlur = blurPx * s;
  g.shadowOffsetX = offset;
  g.shadowOffsetY = 0;
  g.fillStyle = '#000000';
  g.beginPath();
  if (!tracePath(g, el, w, h, u, sw / 2 - offset, sh / 2, s)) return null;
  g.fill();
  if (solid) return mask.canvas;

  // Other fills: paint the fill normally, then keep it only where the blurred silhouette is.
  let painted: { canvas: ImageLike; ctx: Ctx2D };
  try {
    painted = pc.env.createCanvas(sw, sh);
  } catch {
    return null;
  }
  const p = painted.ctx;
  const box: Rect = { x: sw / 2 - (w * s) / 2, y: sh / 2 - (h * s) / 2, w: w * s, h: h * s };
  const all: Rect = { x: 0, y: 0, w: sw, h: sh };
  // Images cover the whole glow so its soft margin is not empty.
  paintFill(p, fill, fill.type === 'image' ? all : box, { ...pc, u: pc.u * s }, all);
  p.globalCompositeOperation = 'destination-in';
  p.drawImage(mask.canvas, 0, 0);
  return painted.canvas;
}

/** Draws a shape element centred on the origin (the caller has translated and rotated). */
export function drawShape(ctx: Ctx2D, el: ShapeElement, u: number, pc: PaintContext): void {
  if (!SHAPES.has(el.shape) || !isPaintable(el.fill)) return;
  const { w, h } = shapeSize(el, u);
  if (!(w >= 0.5) || !(h >= 0.5) || !Number.isFinite(w * h)) return;
  const blurPx = Math.min(Math.max(0, num(el.blur, 0)) * u, 4 * Math.max(w, h) + 4 * u);
  if (blurPx >= 0.5) drawGlow(ctx, el, w, h, u, blurPx, pc);
  else drawSharp(ctx, el, w, h, u, pc);
}

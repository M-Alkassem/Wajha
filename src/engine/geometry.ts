/**
 * Numeric and path helpers shared by the engine's painters. Everything here
 * is defensive: layouts come from user files, so NaN, negative sizes and
 * huge values must be turned into something the canvas accepts (several
 * Canvas 2D calls throw on negative radii).
 */
import type { Ctx2D } from './types';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** `v` when it is a finite number, else `fallback`. */
export function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Overlap of two rectangles, or null when they do not intersect. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bottom > y ? { x, y, w: r - x, h: bottom - y } : null;
}

/**
 * Adds a rounded-rectangle sub-path. Uses `ctx.roundRect` when present
 * (missing in older WebKit) and an arc-based fallback otherwise; the radius
 * is clamped to half the shorter side like CSS does.
 */
export function roundedRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  if (!(w > 0) || !(h > 0)) return;
  const rr = clamp(num(r, 0), 0, Math.min(w, h) / 2);
  if (rr <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Adds an axis-aligned ellipse sub-path centred on (cx, cy); `ccw` reverses the winding (for rings). */
export function ellipsePath(ctx: Ctx2D, cx: number, cy: number, rx: number, ry: number, ccw = false): void {
  if (!(rx > 0) || !(ry > 0)) return;
  // A fresh sub-path, so a second ellipse (ring hole) is not joined to the first by a line.
  ctx.moveTo(cx + rx, cy);
  // The spec only guarantees a full turn when the sweep in the drawing direction is >= 2π,
  // so counter-clockwise runs from 2π down to 0 rather than relying on angle normalisation.
  if (ccw) ctx.ellipse(cx, cy, rx, ry, 0, TAU, 0, true);
  else ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU, false);
  ctx.closePath();
}

export interface GradientLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Gradient line of a CSS `linear-gradient(<angle>)` over a box: it passes
 * through the centre, 0deg points up, 90deg right, and its length is
 * |w sin a| + |h cos a| so the corners get exactly the first/last stop.
 */
export function linearGradientLine(angleDeg: number, box: Rect): GradientLine {
  const a = num(angleDeg, 180) * DEG;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** Deterministic PRNG (mulberry32): same seed, same sequence, on every platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer seed from any number; NaN and Infinity become 0. */
export function seedInt(seed: unknown): number {
  const s = num(seed, 0);
  return Math.abs(s) < 2 ** 31 ? Math.floor(s) | 0 : (Math.floor(s % 2 ** 32) | 0);
}

/** Stateless hash of a lattice point to [0, 1); used for film grain. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Runs `draw` with bilinear image sampling. Soft content (mesh bitmaps,
 * glows, blurred images) and ~1:1 pattern tiles look identical to the
 * 'high' quality filter but cost a fraction of it on CPU rasterisers.
 */
export function withFastSampling(ctx: Ctx2D, draw: () => void): void {
  const prev = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  try {
    draw();
  } finally {
    ctx.imageSmoothingQuality = prev;
  }
}

/**
 * Uniform scale of the context's current transform (device pixels per user
 * unit). Shadow blur and offsets ignore the transform, so painters multiply
 * them by this to stay proportional when a caller renders scaled.
 */
export function transformScale(ctx: Ctx2D): number {
  if (typeof ctx.getTransform !== 'function') return 1;
  try {
    const t = ctx.getTransform();
    const s = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c));
    return Number.isFinite(s) && s > 1e-6 ? s : 1;
  } catch {
    return 1;
  }
}

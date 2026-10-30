/**
 * Drawing primitives for mock screens. Mock code works in "points": the
 * context is scaled so a phone is 390 points wide, like iOS layout, and
 * every size below reads like a real UI spec. Text is language-neutral:
 * rounded skeleton bars, plus digits where a real app shows numbers.
 */
import type { Ctx2D } from '../../types';
import { roundRectPath, type Radii } from '../paths';
import type { Rng } from './rng';
import type { MockTheme } from './theme';

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Form = 'phone' | 'tablet' | 'desktop';

/** Everything a mock painter needs. */
export interface Mk {
  ctx: Ctx2D;
  t: MockTheme;
  rng: Rng;
  /** Canvas pixels per point; shadow blur ignores transforms, so it is scaled by hand. */
  px: number;
  os: 'ios' | 'android';
  form: Form;
  /** Non-negative integer below 1e6 (normalised by paintMockScreen), safe as an array offset. */
  seed: number;
}

export const FONT = '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type Paint = string | CanvasGradient;

export function rr(m: Mk, x: number, y: number, w: number, h: number, r: number | Radii): void {
  m.ctx.beginPath();
  roundRectPath(m.ctx, x, y, w, h, r);
}

/** Filled rounded rectangle. */
export function box(m: Mk, x: number, y: number, w: number, h: number, r: number | Radii, fill: Paint): void {
  rr(m, x, y, w, h, r);
  m.ctx.fillStyle = fill;
  m.ctx.fill();
}

/** A skeleton line of text: a pill of height `h`. */
export function bar(m: Mk, x: number, y: number, w: number, h: number, color: Paint = m.t.bar2): void {
  if (w <= 0) return;
  box(m, x, y, w, h, h / 2, color);
}

/** Title-weight skeleton text for a font of `size` points, top at `y`. */
export function title(m: Mk, x: number, y: number, w: number, size = 17, color: Paint = m.t.bar): void {
  bar(m, x, y + size * 0.22, w, size * 0.56, color);
}

/** Body skeleton text for a font of `size` points, top at `y`. */
export function body(m: Mk, x: number, y: number, w: number, size = 13, color: Paint = m.t.bar2): void {
  bar(m, x, y + size * 0.27, w, size * 0.46, color);
}

/** A paragraph: `count` lines, the last one shorter. */
export function paragraph(m: Mk, x: number, y: number, w: number, count: number, size = 13, color: Paint = m.t.bar2): number {
  const lh = size * 1.45;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1 && count > 1;
    body(m, x, y + i * lh, last ? w * (0.45 + 0.3 * m.rng.next()) : w * (0.88 + 0.12 * m.rng.next()), size, color);
  }
  return count * lh;
}

export function circle(m: Mk, cx: number, cy: number, r: number, fill: Paint): void {
  if (!(r > 0)) return;
  m.ctx.beginPath();
  m.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  m.ctx.fillStyle = fill;
  m.ctx.fill();
}

export function ringStroke(m: Mk, cx: number, cy: number, r: number, lw: number, color: Paint): void {
  if (!(r > 0)) return;
  m.ctx.beginPath();
  m.ctx.arc(cx, cy, r, 0, Math.PI * 2);
  m.ctx.lineWidth = lw;
  m.ctx.strokeStyle = color;
  m.ctx.stroke();
}

/** Progress arc from 12 o'clock, clockwise, with round caps over a track. */
export function progressRing(m: Mk, cx: number, cy: number, r: number, lw: number, p: number, color: Paint, track: Paint | null): void {
  const ctx = m.ctx;
  if (track) ringStroke(m, cx, cy, r, lw, track);
  const k = Math.min(Math.max(p, 0), 1);
  if (k <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

export function linear(m: Mk, x0: number, y0: number, x1: number, y1: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient {
  const g = m.ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function radial(m: Mk, cx: number, cy: number, r: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient {
  const g = m.ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, 0.001));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** The theme's hero gradient across a rect, top-left to bottom-right. */
export function brandFill(m: Mk, x: number, y: number, w: number, h: number): CanvasGradient {
  return linear(m, x, y, x + w, y + h, [
    [0, m.t.brand[0]],
    [1, m.t.brand[1]],
  ]);
}

/** Runs `draw` with a soft drop shadow given in points. */
export function shadowed(m: Mk, blur: number, dy: number, color: string, draw: () => void): void {
  const ctx = m.ctx;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * m.px;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dy * m.px;
  draw();
  ctx.restore();
}

/**
 * A raised card: soft shadow in light mode, a hairline in dark mode where
 * shadows disappear. `fill` defaults to the surface colour.
 */
export function card(m: Mk, x: number, y: number, w: number, h: number, r = 22, fill: Paint = m.t.surface, lift = 1): void {
  if (w <= 0 || h <= 0) return;
  if (!m.t.dark && lift > 0) {
    shadowed(m, 18 * lift, 7 * lift, m.t.shadow, () => box(m, x, y, w, h, r, fill));
  } else {
    box(m, x, y, w, h, r, fill);
    if (m.t.dark && lift > 0) {
      rr(m, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
      m.ctx.lineWidth = 1;
      m.ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
      m.ctx.stroke();
    }
  }
}

/** Draws digits/symbols (never words). Returns the advance width in points. */
export function num(m: Mk, text: string, x: number, y: number, size: number, weight: number, color: Paint, align: CanvasTextAlign = 'left'): number {
  const ctx = m.ctx;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

/** Width of `text` at a size/weight without drawing. */
export function measure(m: Mk, text: string, size: number, weight: number): number {
  m.ctx.font = `${weight} ${size}px ${FONT}`;
  return m.ctx.measureText(text).width;
}

/** Smooth curve through points (Catmull-Rom as cubic Béziers); adds to the current path. */
export function smoothPath(ctx: Ctx2D, pts: ReadonlyArray<readonly [number, number]>, moveFirst = true, tension = 1): void {
  if (pts.length === 0) return;
  if (moveFirst) ctx.moveTo(pts[0][0], pts[0][1]);
  else ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const k = tension / 6;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
  }
}

/** A smooth random walk of `n` values in 0..1, for charts. */
export function series(rng: Rng, n: number, start = 0.45, vol = 0.22, drift = 0.02): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v += (rng.next() - 0.5) * vol + drift;
    v = Math.min(0.92, Math.max(0.08, v));
    out.push(v);
  }
  return out;
}

/** Format helpers for believable numbers. */
export function money(v: number, decimals = 2): string {
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function clock(h: number, min: number): string {
  return `${h}:${String(min).padStart(2, '0')}`;
}

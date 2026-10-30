/**
 * The Fill painter shared by slide backgrounds and shapes. A fill is always
 * painted relative to a box: the slide (or the whole panorama strip) for
 * backgrounds, the shape's own bounds for shapes. `area` only limits how
 * much is actually filled (the visible window), so a gradient or image
 * keeps its geometry no matter which part of the box is on screen.
 */
import type { Fill } from '../model/types';
import type { Ctx2D, ImageLike, RenderEnv } from './types';
import { parseColor, rgba, type RGBA } from './color';
import { clamp, intersect, linearGradientLine, num, withFastSampling, type Rect } from './geometry';
import { engineCache, objectId } from './cache';

export interface PaintContext {
  env: RenderEnv;
  /** u in pixels; image blur radii are fractions of it. */
  u: number;
  /** Decoded image or null; never throws. */
  getImage(assetId: string): ImageLike | null;
  /** Device pixels per canvas unit (the caller's transform); tiles are rendered at this resolution. */
  pxScale?: number;
}

/** Resolution multiplier for cached tiles, from the context's transform scale. */
export function tileResolution(pc: { pxScale?: number }): number {
  return clamp(num(pc.pxScale, 1), 0.1, 4);
}

/** Shown where an image fill has no decoded image yet. */
export const NEUTRAL_FILL = '#e4e6eb';
/** Tiled image fills repeat every u / 4 so the preview and every export size look the same. */
export const TILE_FRACTION = 0.25;

/** A canvas colour string for any value; bad colours become opaque black like parseColor. */
export function cssColor(color: unknown, alphaMul = 1): string {
  return rgba(typeof color === 'string' ? color : '#000000', alphaMul);
}

export interface Stop {
  offset: number;
  color: RGBA;
}

/** Valid, sorted gradient stops (offsets clamped to 0..1, at most 64). */
export function gradientStops(stops: unknown): Stop[] {
  if (!Array.isArray(stops)) return [];
  const out: Stop[] = [];
  for (const s of stops.slice(0, 64)) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    out.push({ offset: clamp(num(o.offset, 0), 0, 1), color: parseColor(typeof o.color === 'string' ? o.color : '#000000') });
  }
  // Array sort is stable: equal offsets keep their order (hard colour edges).
  out.sort((a, b) => a.offset - b.offset);
  return fixTransparentStops(out);
}

const sameRgb = (a: RGBA, b: RGBA) => a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * Canvas gradients interpolate unpremultiplied colours, so "red -> #0000"
 * would pass through murky grey. CSS interpolates premultiplied; giving a
 * fully transparent stop the colour of its neighbours reproduces that.
 */
function fixTransparentStops(stops: Stop[]): Stop[] {
  if (!stops.some((s) => s.color.a === 0)) return stops;
  const nearest = (from: number, step: number): Stop | null => {
    for (let i = from + step; i >= 0 && i < stops.length; i += step) if (stops[i].color.a > 0) return stops[i];
    return null;
  };
  const out: Stop[] = [];
  stops.forEach((s, i) => {
    if (s.color.a > 0) {
      out.push(s);
      return;
    }
    const tinted = (c: RGBA): Stop => ({ offset: s.offset, color: { r: c.r, g: c.g, b: c.b, a: 0 } });
    const prev = nearest(i, -1);
    const next = nearest(i, 1);
    if (prev && next && !sameRgb(prev.color, next.color)) out.push(tinted(prev.color), tinted(next.color));
    else {
      const ref = prev ?? next;
      out.push(ref ? tinted(ref.color) : s);
    }
  });
  return out;
}

function addStops(g: CanvasGradient, stops: Stop[]): void {
  for (const s of stops) g.addColorStop(s.offset, rgba(s.color));
}

/** CSS-style linear gradient across `box`, or a plain colour for degenerate input. */
export function linearGradient(ctx: Ctx2D, angle: number, stops: Stop[], box: Rect): CanvasGradient | string | null {
  if (!stops.length) return null;
  const last = rgba(stops[stops.length - 1].color);
  if (stops.length === 1) return last;
  const l = linearGradientLine(angle, box);
  if (![l.x0, l.y0, l.x1, l.y1].every(Number.isFinite) || (Math.abs(l.x1 - l.x0) < 1e-9 && Math.abs(l.y1 - l.y0) < 1e-9)) return last;
  const g = ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1);
  addStops(g, stops);
  return g;
}

/** Radial gradient: centre in box fractions, radius a fraction of the box's longer side. */
export function radialGradient(ctx: Ctx2D, cx: number, cy: number, radius: number, stops: Stop[], box: Rect): CanvasGradient | string | null {
  if (!stops.length) return null;
  const last = rgba(stops[stops.length - 1].color);
  if (stops.length === 1) return last;
  const x = box.x + clamp(num(cx, 0.5), -100, 100) * box.w;
  const y = box.y + clamp(num(cy, 0.5), -100, 100) * box.h;
  const r = Math.max(0, num(radius, 0.5)) * Math.max(box.w, box.h);
  // Like CSS, a zero-size radial gradient shows its last colour.
  if (!(r > 1e-3) || !Number.isFinite(r) || !Number.isFinite(x) || !Number.isFinite(y)) return last;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  addStops(g, stops);
  return g;
}

/** A single canvas fill style for solid, linear and radial fills; null for mesh, image and invalid fills. */
export function simpleFillStyle(ctx: Ctx2D, fill: Fill | null | undefined, box: Rect): CanvasGradient | string | null {
  if (!fill || typeof fill !== 'object') return null;
  switch (fill.type) {
    case 'solid':
      return cssColor(fill.color);
    case 'linear':
      return linearGradient(ctx, fill.angle, gradientStops(fill.stops), box);
    case 'radial':
      return radialGradient(ctx, fill.cx, fill.cy, fill.radius, gradientStops(fill.stops), box);
    default:
      return null;
  }
}

/** Whether painting the fill produces anything (unknown kinds and stop-less gradients do not). */
export function isPaintable(fill: Fill | null | undefined): boolean {
  if (!fill || typeof fill !== 'object') return false;
  switch (fill.type) {
    case 'solid':
    case 'mesh':
    case 'image':
      return true;
    case 'linear':
    case 'radial':
      return gradientStops(fill.stops).length > 0;
    default:
      return false;
  }
}

/** A representative colour of a fill (glow colour for solid fills, previews). */
export function fillColor(fill: Fill | null | undefined): string {
  if (!fill || typeof fill !== 'object') return '#000000';
  switch (fill.type) {
    case 'solid':
      return typeof fill.color === 'string' ? fill.color : '#000000';
    case 'linear':
    case 'radial': {
      const stops = gradientStops(fill.stops);
      return stops.length ? rgba(stops[0].color) : '#000000';
    }
    case 'mesh':
      return typeof fill.base === 'string' ? fill.base : '#000000';
    default:
      return NEUTRAL_FILL;
  }
}

/* ------------------------------------------------------------------ */
/* Mesh                                                                */
/* ------------------------------------------------------------------ */

const MESH_STOPS = 12;
/**
 * Alpha profile of a mesh blob: 1 - smoothstep(t). Flat at the centre and
 * at the rim, so blobs melt into each other without a visible edge, and a
 * dozen stops keep the piecewise-linear gradient from banding.
 */
const MESH_FALLOFF = Array.from({ length: MESH_STOPS + 1 }, (_, k) => {
  const t = k / MESH_STOPS;
  return 1 - t * t * (3 - 2 * t);
});

/** Rendered meshes: smooth, low-frequency images, so a few hundred pixels hold all the detail. */
const meshes = engineCache<string, ImageLike>(32, 6 * 1024 * 1024);
const MESH_MAX_SIDE = 384;
/** Extra scratch pixels around the window, so upscaling never samples past the bitmap edge. */
const MESH_MARGIN = 2;

/**
 * Mesh fills cost one full-area radial gradient per point. They are drawn
 * once into a small cached bitmap and scaled up each frame (identical
 * looking, since the content is all soft gradients), which keeps editor
 * repaints cheap even on CPU-rasterised canvases.
 */
function paintMesh(ctx: Ctx2D, fill: Extract<Fill, { type: 'mesh' }>, box: Rect, area: Rect, env: RenderEnv): void {
  const s = Math.min(1, MESH_MAX_SIDE / Math.max(area.w, area.h));
  const m = MESH_MARGIN / s; // margin in canvas units
  const outer: Rect = { x: area.x - m, y: area.y - m, w: area.w + 2 * m, h: area.h + 2 * m };
  const sw = Math.max(1, Math.ceil(outer.w * s));
  const sh = Math.max(1, Math.ceil(outer.h * s));
  const f = (v: number) => v.toFixed(2);
  const key = `${JSON.stringify(fill)}|${f(box.x - area.x)},${f(box.y - area.y)},${f(box.w)},${f(box.h)}|${f(area.w)}x${f(area.h)}|${sw}x${sh}`;
  let image = meshes.get(key);
  if (!image) {
    try {
      const made = env.createCanvas(sw, sh);
      made.ctx.scale(sw / outer.w, sh / outer.h);
      made.ctx.translate(-outer.x, -outer.y);
      paintMeshDirect(made.ctx, fill, box, outer);
      image = made.canvas;
      meshes.set(key, image, sw * sh * 4);
    } catch {
      paintMeshDirect(ctx, fill, box, area);
      return;
    }
  }
  const img = image;
  withFastSampling(ctx, () => ctx.drawImage(img, outer.x, outer.y, outer.w, outer.h));
}

function paintMeshDirect(ctx: Ctx2D, fill: Extract<Fill, { type: 'mesh' }>, box: Rect, area: Rect): void {
  ctx.fillStyle = cssColor(fill.base);
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const points: unknown[] = Array.isArray(fill.points) ? fill.points.slice(0, 32) : [];
  const maxDim = Math.max(box.w, box.h);
  for (const p of points) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const x = box.x + num(o.x, 0.5) * box.w;
    const y = box.y + num(o.y, 0.5) * box.h;
    const r = Math.min(Math.max(0, num(o.radius, 0)), 50) * maxDim;
    if (!(r >= 0.5) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const region = intersect({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }, area);
    if (!region) continue;
    const c = parseColor(typeof o.color === 'string' ? o.color : '#000000');
    if (c.a <= 0) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (let k = 0; k <= MESH_STOPS; k++) g.addColorStop(k / MESH_STOPS, rgba(c, MESH_FALLOFF[k]));
    ctx.fillStyle = g;
    ctx.fillRect(region.x, region.y, region.w, region.h);
  }
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

function safeImage(pc: PaintContext, assetId: unknown): ImageLike | null {
  if (typeof assetId !== 'string' || !assetId) return null;
  try {
    const img = pc.getImage(assetId);
    return img && img.width > 0 && img.height > 0 ? img : null;
  } catch {
    return null;
  }
}

/** Blurred / resampled images: small (blur hides detail), keyed by image instance and size. */
const processed = engineCache<string, ImageLike>(24, 12 * 1024 * 1024);

/** Blur is computed at the resolution where the Gaussian sigma is about this many pixels. */
const WORK_SIGMA = 2.5;
const MAX_WORK_PIXELS = 400_000;

/**
 * The image resampled for drawing at `w` x `h` and blurred by `blurPx`
 * (shadowBlur semantics: Gaussian sigma = blurPx / 2). Blurred images are
 * built at reduced resolution, blurred with a 3-pass box filter (an
 * accurate Gaussian), then drawn scaled up; `wrap` blurs seamlessly for
 * tiles. Returns null when nothing better than the source can be made.
 */
export function processedImage(img: ImageLike, w: number, h: number, blurPx: number, wrap: boolean, env: RenderEnv): ImageLike | null {
  if (!(w >= 1) || !(h >= 1) || !Number.isFinite(w * h)) return null;
  const sigma = Math.max(0, num(blurPx, 0)) / 2;
  let s = sigma > 0 ? Math.min(1, WORK_SIGMA / sigma) : 1;
  const cap = sigma > 0 ? MAX_WORK_PIXELS : MAX_WORK_PIXELS * 4;
  if (w * h * s * s > cap) s = Math.sqrt(cap / (w * h));
  const sw = Math.max(1, Math.round(w * s));
  const sh = Math.max(1, Math.round(h * s));
  const workSigma = Math.round(sigma * s * 100) / 100;
  const key = `${objectId(img)}|${sw}x${sh}|${workSigma}|${wrap ? 1 : 0}`;
  const hit = processed.get(key);
  if (hit) return hit;
  let out: { canvas: ImageLike; ctx: Ctx2D };
  try {
    out = env.createCanvas(sw, sh);
  } catch {
    return null;
  }
  const g = out.ctx;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  try {
    g.drawImage(img, 0, 0, sw, sh);
  } catch {
    // A closed or broken bitmap (e.g. evicted by the image cache mid-render).
    return null;
  }
  if (workSigma >= 0.3) {
    try {
      const data = g.getImageData(0, 0, sw, sh);
      gaussianBlur(data.data, sw, sh, workSigma, wrap);
      g.putImageData(data, 0, 0);
    } catch {
      // Tainted or unsupported: the downscale alone still softens the image.
    }
  }
  processed.set(key, out.canvas, sw * sh * 4);
  return out.canvas;
}

/** Box widths whose 3 passes approximate a Gaussian of `sigma` (Kovesi / Kutskir). */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => Math.max(1, i < m ? wl : wu));
}

/** In-place Gaussian blur of RGBA pixels (premultiplied while blurring, so edges do not darken). */
export function gaussianBlur(data: Uint8ClampedArray, w: number, h: number, sigma: number, wrap: boolean): void {
  const n = w * h;
  if (n === 0 || !(sigma > 0)) return;
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i += 4) {
    const al = data[i + 3] / 255;
    a[i] = data[i] * al;
    a[i + 1] = data[i + 1] * al;
    a[i + 2] = data[i + 2] * al;
    a[i + 3] = data[i + 3];
  }
  for (const size of boxesForGauss(sigma)) {
    const r = (size - 1) >> 1;
    boxPass(a, b, w, h, r, true, wrap);
    boxPass(b, a, w, h, r, false, wrap);
  }
  for (let i = 0; i < n * 4; i += 4) {
    const al = a[i + 3];
    if (al < 0.5) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const k = 255 / al;
    data[i] = a[i] * k;
    data[i + 1] = a[i + 1] * k;
    data[i + 2] = a[i + 2] * k;
    data[i + 3] = al;
  }
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean, wrap: boolean): void {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const lineStep = horizontal ? w * 4 : 4;
  const inv = 1 / (2 * r + 1);
  const at = wrap ? (k: number) => ((k % len) + len) % len : (k: number) => (k < 0 ? 0 : k >= len ? len - 1 : k);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[base + at(k) * step + c];
      for (let i = 0; i < len; i++) {
        dst[base + i * step + c] = acc * inv;
        acc += src[base + at(i + r + 1) * step + c] - src[base + at(i - r) * step + c];
      }
    }
  }
}

function paintImage(ctx: Ctx2D, fill: Extract<Fill, { type: 'image' }>, box: Rect, pc: PaintContext, area: Rect): void {
  const img = safeImage(pc, fill.assetId);
  if (!img) {
    ctx.fillStyle = NEUTRAL_FILL;
    ctx.fillRect(area.x, area.y, area.w, area.h);
  } else {
    const opacity = clamp(num(fill.opacity, 1), 0, 1);
    const blurPx = Math.max(0, num(fill.blur, 0)) * pc.u;
    if (opacity > 0) {
      // drawImage throws for closed bitmaps; never leave the state stack unbalanced.
      ctx.save();
      try {
        ctx.globalAlpha *= opacity;
        if (fill.fit === 'tile') paintTiled(ctx, img, box, area, pc, blurPx);
        else {
          const scale = fill.fit === 'contain' ? Math.min(box.w / img.width, box.h / img.height) : Math.max(box.w / img.width, box.h / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          if (dw > 0 && dh > 0 && Number.isFinite(dw * dh)) {
            const src = blurPx >= 0.5 ? (processedImage(img, dw, dh, blurPx, false, pc.env) ?? img) : img;
            // A small blurred bitmap scaled up can fade at its outermost pixels in some engines;
            // overscan by one of its pixels (invisible on a blurred image) so edges stay solid.
            const ex = src === img ? 0 : dw / src.width;
            const ey = src === img ? 0 : dh / src.height;
            const draw = () => ctx.drawImage(src, box.x + (box.w - dw) / 2 - ex, box.y + (box.h - dh) / 2 - ey, dw + 2 * ex, dh + 2 * ey);
            // Sharp photos keep the high-quality filter (they are usually downscaled); blurred ones do not need it.
            if (src === img) draw();
            else withFastSampling(ctx, draw);
          }
        }
      } finally {
        ctx.restore();
      }
    }
  }
  if (typeof fill.tint === 'string' && fill.tint) {
    ctx.fillStyle = cssColor(fill.tint);
    ctx.fillRect(area.x, area.y, area.w, area.h);
  }
}

function paintTiled(ctx: Ctx2D, img: ImageLike, box: Rect, area: Rect, pc: PaintContext, blurPx: number): void {
  const tw = Math.max(1, TILE_FRACTION * pc.u);
  const th = (tw * img.height) / img.width;
  // Rendered at device resolution, so scaled contexts (thumbnails, DPR transforms) stay crisp.
  const res = tileResolution(pc);
  const tileW = Math.max(1, Math.round(tw * res));
  const tileH = Math.max(1, Math.round(th * res));
  // Resampling once to the tile size keeps every frame from filtering a full-size image.
  const tile = processedImage(img, tileW, tileH, blurPx * res, true, pc.env) ?? img;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  const sx = tw / tile.width;
  const sy = th / tile.height;
  ctx.save();
  try {
    ctx.translate(box.x, box.y);
    ctx.scale(sx, sy);
    ctx.fillStyle = pattern;
    ctx.imageSmoothingQuality = 'low';
    ctx.fillRect((area.x - box.x) / sx, (area.y - box.y) / sy, area.w / sx, area.h / sy);
  } finally {
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Paints `fill` laid out over `box`, filling only `area` (defaults to the
 * box). Unknown fill kinds paint nothing.
 */
export function paintFill(ctx: Ctx2D, fill: Fill | null | undefined, box: Rect, pc: PaintContext, area: Rect = box): void {
  if (!fill || typeof fill !== 'object' || !(area.w > 0) || !(area.h > 0)) return;
  switch (fill.type) {
    case 'solid':
    case 'linear':
    case 'radial': {
      const style = simpleFillStyle(ctx, fill, box);
      if (style === null) return;
      ctx.fillStyle = style;
      ctx.fillRect(area.x, area.y, area.w, area.h);
      return;
    }
    case 'mesh':
      paintMesh(ctx, fill, box, area, pc.env);
      return;
    case 'image':
      paintImage(ctx, fill, box, pc, area);
      return;
    default:
      return;
  }
}

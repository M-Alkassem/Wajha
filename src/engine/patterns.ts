/**
 * Background patterns drawn over the fill at `opacity`. `scale` (a fraction
 * of u) sets the spacing between features:
 *   dots      dot grid, one dot per `spacing` square
 *   grid      hairline grid with `spacing` cells
 *   diagonal  45deg lines, `spacing` apart (measured perpendicular)
 *   noise     film grain; grains are spacing / 20 (at least one pixel)
 *   waves     horizontal sine lines, `spacing` apart, wavelength 3 x spacing
 *   rings     concentric circles around the centre of the background box
 * Tiled kinds are rendered once into a small cached tile and filled with a
 * repeating pattern anchored at the background box origin, so in panorama
 * mode (box = the whole strip, translated per slide) the pattern runs on
 * seamlessly from one slide to the next.
 */
import type { Pattern } from '../model/types';
import type { Ctx2D, ImageLike, RenderEnv } from './types';
import { parseColor, rgba, type RGBA } from './color';
import { clamp, hash2, num, TAU, type Rect } from './geometry';
import { engineCache } from './cache';

const tiles = engineCache<string, ImageLike>(48, 8 * 1024 * 1024);
/** CanvasPattern objects belong to a context; keep one per (context, tile) without pinning either. */
const patternCache = new WeakMap<Ctx2D, WeakMap<object, CanvasPattern>>();

interface TileSpec {
  key: string;
  /** Period of the pattern in canvas pixels (may be fractional). */
  pw: number;
  ph: number;
  /** Draws one period in period units; the context is already scaled to the tile. */
  draw(g: Ctx2D, color: string, rgb: RGBA): void;
  /** Noise is drawn pixel by pixel and must not be resampled. */
  exact?: boolean;
}

const KINDS = new Set(['dots', 'grid', 'diagonal', 'noise', 'waves', 'rings']);

/** Spacing in pixels for a pattern on a canvas with unit u (clamped to sane limits). */
export function patternSpacing(pattern: Pattern, u: number): number {
  return clamp(num(pattern.scale, 0) * u, 2, Math.max(4, u * 2));
}

function tileSpec(kind: string, spacing: number, res: number): TileSpec | null {
  const s = spacing;
  switch (kind) {
    case 'dots': {
      const r = clamp(s * 0.09, 0.6, s * 0.45);
      return {
        key: `dots|${s}`,
        pw: s,
        ph: s,
        draw(g, color) {
          g.fillStyle = color;
          g.beginPath();
          g.arc(s / 2, s / 2, r, 0, TAU);
          g.fill();
        },
      };
    }
    case 'grid': {
      const lw = clamp(s * 0.03, 1, s * 0.3);
      // Lines run through the middle of each cell (pixel-snapped), so the slide edge never
      // gets a line that reads as a border.
      const o = Math.round((s - lw) / 2);
      return {
        key: `grid|${s}`,
        pw: s,
        ph: s,
        draw(g, color) {
          g.fillStyle = color;
          g.beginPath();
          g.rect(0, o, s, lw);
          g.rect(o, 0, lw, s);
          // One fill for both lines: crossings are not painted twice with translucent colours.
          g.fill();
        },
      };
    }
    case 'diagonal': {
      const p = s * Math.SQRT2;
      const lw = clamp(s * 0.1, 1, s * 0.45);
      return {
        key: `diagonal|${s}`,
        pw: p,
        ph: p,
        draw(g, color) {
          g.strokeStyle = color;
          g.lineWidth = lw;
          g.beginPath();
          // Three parallel "/" lines so the stroke also covers the tile corners after wrapping.
          for (let k = -1; k <= 1; k++) {
            g.moveTo(k * p - lw, p + lw);
            g.lineTo((k + 1) * p + lw, -lw);
          }
          g.stroke();
        },
      };
    }
    case 'waves': {
      const lambda = s * 3;
      const amp = s * 0.18;
      const lw = clamp(s * 0.06, 1, s * 0.3);
      return {
        key: `waves|${s}`,
        pw: lambda,
        ph: s,
        draw(g, color) {
          g.strokeStyle = color;
          g.lineWidth = lw;
          g.lineJoin = 'round';
          g.beginPath();
          const steps = 48;
          // Rows above and below, and a little past both sides, so strokes meet across tile seams.
          for (const dy of [-s, 0, s]) {
            for (let i = -2; i <= steps + 2; i++) {
              const x = (i / steps) * lambda;
              const y = s / 2 + dy + amp * Math.sin((i / steps) * TAU);
              if (i === -2) g.moveTo(x, y);
              else g.lineTo(x, y);
            }
          }
          g.stroke();
        },
      };
    }
    case 'noise': {
      // Grains are whole device pixels; the period is given in canvas units.
      const grain = Math.max(1, Math.round((s / 20) * res));
      const cells = grain === 1 ? 256 : clamp(Math.floor(384 / grain), 32, 192);
      const size = cells * grain;
      return {
        key: `noise|${grain}`,
        pw: size / res,
        ph: size / res,
        exact: true,
        draw(g, _color, rgb) {
          const img = g.createImageData(size, size);
          const d = img.data;
          for (let cy = 0; cy < cells; cy++) {
            for (let cx = 0; cx < cells; cx++) {
              const a = Math.round(hash2(cx, cy, 0x5eed) * 255 * rgb.a);
              for (let y = cy * grain; y < (cy + 1) * grain; y++) {
                for (let x = cx * grain; x < (cx + 1) * grain; x++) {
                  const i = (y * size + x) * 4;
                  d[i] = rgb.r;
                  d[i + 1] = rgb.g;
                  d[i + 2] = rgb.b;
                  d[i + 3] = a;
                }
              }
            }
          }
          g.putImageData(img, 0, 0);
        },
      };
    }
    default:
      return null;
  }
}

/** Tiles larger than this are rendered at reduced resolution (only for extreme spacings). */
const MAX_TILE_SIDE = 2048;
const MAX_TILE_PIXELS = 1_500_000;

function tileFor(spec: TileSpec, rgb: RGBA, env: RenderEnv, res: number): ImageLike | null {
  const color = rgba(rgb);
  // Device resolution (res = transform scale), capped so huge spacings never allocate a giant
  // tile every frame (it would never fit the cache).
  const k = spec.exact ? 1 : Math.min(res, MAX_TILE_SIDE / Math.max(spec.pw, spec.ph), Math.sqrt(MAX_TILE_PIXELS / (spec.pw * spec.ph)));
  const tw = spec.exact ? Math.round(spec.pw * res) : Math.max(2, Math.round(spec.pw * k));
  const th = spec.exact ? Math.round(spec.ph * res) : Math.max(2, Math.round(spec.ph * k));
  const key = `${spec.key}|${color}|${tw}x${th}`;
  const hit = tiles.get(key);
  if (hit) return hit;
  let made: { canvas: ImageLike; ctx: Ctx2D };
  try {
    made = env.createCanvas(tw, th);
  } catch {
    return null;
  }
  const g = made.ctx;
  g.save();
  if (!spec.exact) g.scale(tw / spec.pw, th / spec.ph);
  spec.draw(g, color, rgb);
  g.restore();
  tiles.set(key, made.canvas, tw * th * 4);
  return made.canvas;
}

function patternFor(ctx: Ctx2D, tile: ImageLike): CanvasPattern | null {
  let perCtx = patternCache.get(ctx);
  if (!perCtx) {
    perCtx = new WeakMap();
    patternCache.set(ctx, perCtx);
  }
  let p = perCtx.get(tile);
  if (!p) {
    p = ctx.createPattern(tile, 'repeat') ?? undefined;
    if (!p) return null;
    perCtx.set(tile, p);
  }
  return p;
}

function drawRings(ctx: Ctx2D, box: Rect, area: Rect, spacing: number, color: string): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nearX = Math.max(0, area.x - cx, cx - (area.x + area.w));
  const nearY = Math.max(0, area.y - cy, cy - (area.y + area.h));
  const farX = Math.max(Math.abs(area.x - cx), Math.abs(area.x + area.w - cx));
  const farY = Math.max(Math.abs(area.y - cy), Math.abs(area.y + area.h - cy));
  const lw = clamp(spacing * 0.05, 1, spacing * 0.4);
  const first = Math.max(1, Math.floor((Math.hypot(nearX, nearY) - lw) / spacing));
  const last = Math.min(first + 1500, Math.ceil((Math.hypot(farX, farY) + lw) / spacing));
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let k = first; k <= last; k++) {
    const r = k * spacing;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, TAU);
  }
  ctx.stroke();
}

/**
 * Paints a pattern laid out over `box` into `area`. Invalid patterns
 * (unknown kind, zero opacity, non-positive scale) paint nothing.
 */
export function paintPattern(ctx: Ctx2D, pattern: Pattern | null | undefined, box: Rect, area: Rect, u: number, env: RenderEnv, pxScale = 1): void {
  if (!pattern || typeof pattern !== 'object' || !KINDS.has(pattern.kind)) return;
  const opacity = clamp(num(pattern.opacity, 0), 0, 1);
  if (opacity <= 0 || !(num(pattern.scale, 0) > 0) || !(area.w > 0) || !(area.h > 0)) return;
  const spacing = patternSpacing(pattern, u);
  const rgb = parseColor(typeof pattern.color === 'string' ? pattern.color : '#000000');
  const color = rgba(rgb);
  ctx.save();
  try {
    ctx.globalAlpha *= opacity;
    if (pattern.kind === 'rings') {
      drawRings(ctx, box, area, spacing, color);
      return;
    }
    const res = clamp(num(pxScale, 1), 0.1, 4);
    const spec = tileSpec(pattern.kind, spacing, res);
    if (!spec) return;
    const tile = tileFor(spec, rgb, env, res);
    if (!tile) return;
    const pat = patternFor(ctx, tile);
    if (!pat) return;
    const sx = spec.pw / tile.width;
    const sy = spec.ph / tile.height;
    ctx.translate(box.x, box.y);
    ctx.scale(sx, sy);
    ctx.fillStyle = pat;
    // Tiles are rendered at device resolution and drawn ~1:1; bilinear sampling is enough.
    ctx.imageSmoothingQuality = 'low';
    ctx.fillRect((area.x - box.x) / sx, (area.y - box.y) / sy, area.w / sx, area.h / sy);
  } finally {
    ctx.restore();
  }
}

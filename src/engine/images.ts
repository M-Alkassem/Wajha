/**
 * Image elements: a picture `width x u` wide with the asset's aspect, clipped
 * to rounded corners, with an optional shadow. The shadow follows CSS
 * box-shadow rules: it is cast by the rounded box and only shows outside
 * it, so a transparent PNG never reveals a dark rectangle behind itself.
 */
import type { ImageElement } from '../model/types';
import type { Ctx2D, ImageLike } from './types';
import { cssColor } from './paint';
import { clamp, num, roundedRect } from './geometry';

/** Fill of an image element whose picture is not decoded (or missing). */
export const MISSING_IMAGE_FILL = 'rgba(148, 154, 166, 0.22)';

export interface ImageSources {
  getImage(assetId: string): ImageLike | null;
  getAssetAspect(assetId: string): number | null;
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Decoded image (or null) and height/width aspect of an image element's asset. */
export function resolveImage(el: ImageElement, src: ImageSources): { image: ImageLike | null; aspect: number } {
  const id = typeof el.assetId === 'string' ? el.assetId : '';
  const raw = id ? safeCall(() => src.getImage(id), null) : null;
  const image = raw && raw.width > 0 && raw.height > 0 ? raw : null;
  const known = id ? safeCall(() => src.getAssetAspect(id), null) : null;
  let aspect = num(known, 0);
  if (!(aspect > 0) && image) aspect = image.height / image.width;
  if (!(aspect > 0) || !Number.isFinite(aspect)) aspect = 1;
  return { image, aspect: clamp(aspect, 0.02, 50) };
}

/**
 * Draws an image element centred on the origin. Returns its unrotated size
 * in pixels. `pxScale` converts shadow sizes to device pixels.
 */
export function drawImageElement(ctx: Ctx2D, el: ImageElement, u: number, pxScale: number, src: ImageSources): { w: number; h: number } {
  const { image, aspect } = resolveImage(el, src);
  const w = Math.max(0, num(el.width, 0) * u);
  const h = w * aspect;
  if (!(w >= 0.5) || !(h >= 0.5) || !Number.isFinite(w * h)) return { w, h };
  const x = -w / 2;
  const y = -h / 2;
  const r = clamp(num(el.cornerRadius, 0), 0, 0.5) * w;

  if (!image) {
    ctx.fillStyle = MISSING_IMAGE_FILL;
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, r);
    ctx.fill();
    return { w, h };
  }

  const sh = el.shadow;
  if (sh && typeof sh === 'object') {
    ctx.save();
    try {
      // Clip to everything outside the box; the filled box itself is then invisible and
      // only its shadow remains (no off-canvas trick needed, so rotation is free).
      const big = 1e6;
      ctx.beginPath();
      ctx.rect(-big, -big, 2 * big, 2 * big);
      roundedRect(ctx, x, y, w, h, r);
      ctx.clip('evenodd');
      ctx.shadowColor = cssColor(sh.color);
      ctx.shadowBlur = Math.max(0, num(sh.blur, 0)) * u * pxScale;
      ctx.shadowOffsetX = num(sh.x, 0) * u * pxScale;
      ctx.shadowOffsetY = num(sh.y, 0) * u * pxScale;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      roundedRect(ctx, x, y, w, h, r);
      ctx.fill();
    } finally {
      ctx.restore();
    }
  }

  ctx.save();
  try {
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, r);
    ctx.clip();
    // Throws for a bitmap the image cache closed meanwhile; the finally keeps the stack balanced.
    ctx.drawImage(image, x, y, w, h);
  } finally {
    ctx.restore();
  }
  return { w, h };
}

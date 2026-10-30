/**
 * Slide backgrounds. A slide-level background (layout.background) is drawn
 * over the slide alone. The theme background is too, unless the theme is a
 * panorama: then it is laid out over one virtual canvas `slideCount x
 * width` wide and each slide shows its own window of it, so gradients,
 * mesh blobs, images and patterns continue across the store listing.
 */
import type { Background } from '../model/types';
import type { Ctx2D } from './types';
import { paintFill, type PaintContext } from './paint';
import { paintPattern } from './patterns';
import { clamp, num, type Rect } from './geometry';

export interface BackgroundInput {
  width: number;
  height: number;
  /** Slide-level override; never panoramic. */
  own: Background | null;
  theme: Background | null;
  panorama: boolean;
  slideIndex: number;
  slideCount: number;
}

/** The painted box and the visible window of a slide background, in slide pixels. */
export function backgroundFrame(input: BackgroundInput): { background: Background | null; box: Rect; offset: number } {
  const { width: w, height: h } = input;
  const own = input.own && typeof input.own === 'object' ? input.own : null;
  const background = own ?? (input.theme && typeof input.theme === 'object' ? input.theme : null);
  const count = Math.floor(clamp(num(input.slideCount, 1), 1, 1000));
  if (own || !input.panorama || count < 2) return { background, box: { x: 0, y: 0, w, h }, offset: 0 };
  const index = Math.floor(clamp(num(input.slideIndex, 0), 0, count - 1));
  return { background, box: { x: 0, y: 0, w: w * count, h }, offset: index * w };
}

/**
 * Paints white (exports are flattened onto white anyway, and JPEG would
 * turn transparency black), then the background fill and its pattern.
 */
export function paintBackground(ctx: Ctx2D, input: BackgroundInput, pc: PaintContext): void {
  const { width: w, height: h } = input;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const { background, box, offset } = backgroundFrame(input);
  if (!background) return;
  ctx.save();
  try {
    ctx.translate(-offset, 0);
    const area: Rect = { x: offset, y: 0, w, h };
    paintFill(ctx, background.fill, box, pc, area);
    paintPattern(ctx, background.pattern, box, area, pc.u, pc.env, pc.pxScale);
  } finally {
    ctx.restore();
  }
}

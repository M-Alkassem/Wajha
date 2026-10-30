/**
 * Browser RenderEnv: scratch canvases for the engine's offscreen effects
 * (blur, patterns, masks, glows).
 *
 * The canvases are not pooled. The engine keeps the scratch canvases it
 * builds in its own bounded caches (pattern tiles, blurred images, glows;
 * see engine/cache.ts) and reuses them across frames, which is what removes
 * the per-frame allocation churn. Recycling them here at the end of a frame
 * would wipe canvases the engine still draws from.
 */
import type { RenderEnv } from '../engine/types';
import { createSurface } from './canvas';

let env: RenderEnv | null = null;

/**
 * The shared browser RenderEnv: OffscreenCanvas when the webview supports a
 * 2D context on it (typed as Ctx2D), detached DOM canvases otherwise. Sides
 * are rounded to whole pixels and clamped to 1..16384 so a degenerate effect
 * size can never throw or allocate an absurd bitmap.
 */
export function browserEnv(): RenderEnv {
  env ??= {
    createCanvas(width, height) {
      const surface = createSurface(width, height);
      return { canvas: surface.canvas, ctx: surface.ctx };
    },
  };
  return env;
}

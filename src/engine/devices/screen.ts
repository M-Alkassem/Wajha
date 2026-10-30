/**
 * What appears on a device screen: the user's screenshot (cover-fit), a
 * generated mock app, or a calm empty gradient. Callers provide the clip
 * path so every frame keeps its own corner shape.
 */
import type { Color, FamilyId } from '../../model/types';
import type { Ctx2D, ImageLike } from '../types';
import { paintMockScreen } from '../mock';

export interface ScreenContent {
  image: ImageLike | null;
  placeholder: 'mock' | 'empty';
  mock: { seed: number; palette: Color[]; dark: boolean };
  /** Mock screen flavour for this frame. */
  family?: FamilyId;
  chrome: 'device' | 'web';
  /** Paint black under the screenshot, like a real panel (devices), or not (bare screenshots). */
  backdrop: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when an image can actually be drawn. */
export function isDrawable(img: ImageLike | null): img is ImageLike {
  return !!img && Number.isFinite(img.width) && Number.isFinite(img.height) && img.width > 0 && img.height > 0;
}

/** Source rectangle that covers a `w` x `h` box with an `iw` x `ih` image, centred. */
export function coverSource(iw: number, ih: number, w: number, h: number): Rect {
  const scale = Math.max(w / iw, h / ih);
  const sw = Math.min(iw, w / scale);
  const sh = Math.min(ih, h / scale);
  return { x: (iw - sw) / 2, y: (ih - sh) / 2, w: sw, h: sh };
}

/** Neutral placeholder: one calm vertical gradient. */
export function paintEmptyScreen(ctx: Ctx2D, r: Rect, dark: boolean): void {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, dark ? '#202026' : '#f8f8fa');
  g.addColorStop(0.55, dark ? '#18181c' : '#eeeef2');
  g.addColorStop(1, dark ? '#101013' : '#e3e3e9');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Fills the screen rect `r`, clipped by the path `clip` adds. Restores all state. */
export function paintScreen(ctx: Ctx2D, r: Rect, clip: (ctx: Ctx2D) => void, content: ScreenContent): void {
  if (!(r.w > 0) || !(r.h > 0)) return;
  ctx.save();
  ctx.beginPath();
  clip(ctx);
  ctx.clip();
  const img = content.image;
  if (isDrawable(img)) {
    if (content.backdrop) {
      ctx.fillStyle = '#000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    const src = coverSource(img.width, img.height, r.w, r.h);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, src.x, src.y, src.w, src.h, r.x, r.y, r.w, r.h);
  } else if (content.placeholder === 'mock') {
    ctx.translate(r.x, r.y);
    paintMockScreen(ctx, r.w, r.h, { ...content.mock, family: content.family, chrome: content.chrome });
  } else {
    paintEmptyScreen(ctx, r, content.mock.dark);
  }
  ctx.restore();
}

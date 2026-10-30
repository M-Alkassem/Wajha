/**
 * Small pure helpers for how a slide is presented on the stage: bitmap
 * density and release, corner radii and the store-limit wording. Kept out
 * of the component files so Fast Refresh keeps working on them.
 */
import type { FamilyId, StoreId } from '../../../model/types';
import { FAMILIES } from '../../../model/catalog';

/** Bitmaps are never denser than this many device pixels per CSS pixel. */
export const MAX_DPR = 2;
/** Per-canvas pixel budget: zoomed-in slides render a little softer instead of allocating huge bitmaps. */
export const MAX_BITMAP_PIXELS = 8_000_000;

/** Device pixel ratio for a bitmap of `width` x `height` CSS px within the caps. */
export function bitmapDpr(width: number, height: number, dpr: number): number {
  const base = Math.min(MAX_DPR, Number.isFinite(dpr) && dpr > 0 ? dpr : 1);
  const area = Math.max(1, (Number.isFinite(width) ? width : 1) * (Number.isFinite(height) ? height : 1));
  return Math.max(0.25, Math.min(base, Math.sqrt(MAX_BITMAP_PIXELS / area)));
}

/**
 * Gives a canvas's bitmap back; the slide repaints when it comes near the
 * viewport again. Every size goes: even fit-zoom bitmaps (about 1 MP at 2x)
 * add up to ~100 MB over a 30-slide project. False when nothing was held.
 */
export function releaseBitmap(canvas: { width: number; height: number }): boolean {
  if (!canvas.width && !canvas.height) return false;
  canvas.width = 0;
  canvas.height = 0;
  return true;
}

/** Corner radius of a displayed slide: about 2.5 % of its short side. */
export function slideRadius(width: number, height: number): number {
  const short = Math.min(width, height);
  return Math.min(24, Math.max(3, Math.round((Number.isFinite(short) ? short : 0) * 0.025)));
}

/** CSS border-radius of slide `index`; in panorama mode only the strip's outer corners are round. */
export function cornerRadius(index: number, count: number, r: number, panorama: boolean): string {
  if (!panorama) return `${r}px`;
  const first = index === 0;
  const last = index === count - 1;
  return `${first ? r : 0}px ${last ? r : 0}px ${last ? r : 0}px ${first ? r : 0}px`;
}

const STORE_NAME: Record<StoreId, string> = { 'app-store': 'the App Store', 'google-play': 'Google Play' };

/** The family's store limit as a phrase, e.g. "the App Store allows 10". */
export function storeAllowance(family: FamilyId): string {
  const info = FAMILIES[family] ?? FAMILIES.iphone;
  return `${STORE_NAME[info.stores[0]] ?? 'the store'} allows ${info.maxSlides}`;
}

/** Tooltip of the "Not exported" badge, e.g. "Not exported: the App Store allows 10". */
export function overLimitText(family: FamilyId): string {
  return `Not exported: ${storeAllowance(family)}`;
}

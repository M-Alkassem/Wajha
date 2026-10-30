/**
 * Canvas plumbing shared by the runtime services. OffscreenCanvas is used
 * when the webview can draw 2D on it (no DOM node, cheaper to create and to
 * read back); otherwise a detached <canvas> element.
 */
import type { Ctx2D } from '../engine/types';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface Surface {
  canvas: AnyCanvas;
  ctx: Ctx2D;
}

/** WebKit refuses to allocate larger canvases; no store size comes close. */
export const MAX_CANVAS_SIDE = 16384;

/** Whole pixels within 1..MAX_CANVAS_SIDE; NaN and infinities become 1. */
export function canvasSide(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.round(value)));
}

/** A new 2D canvas (sides clamped by `canvasSide`). Throws when the environment has no 2D canvas. */
export function createSurface(width: number, height: number): Surface {
  const w = canvasSide(width);
  const h = canvasSide(height);
  if (typeof OffscreenCanvas === 'function') {
    try {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      // Some engines expose OffscreenCanvas without 2D support: use the DOM then.
      if (ctx) return { canvas, ctx: ctx as unknown as Ctx2D };
    } catch {
      /* fall through to a DOM canvas */
    }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx };
  }
  throw new Error(`Could not create a ${w} x ${h} canvas`);
}

/**
 * Clears the bitmap and returns the context to its default state, including
 * the clip region. Without `ctx.reset()` (WebKit before 18), re-assigning the
 * width does the same per the HTML spec.
 */
export function resetSurface(surface: Surface): void {
  const { canvas, ctx } = surface;
  if (typeof ctx.reset === 'function') {
    ctx.reset();
    return;
  }
  const width = canvas.width;
  canvas.width = width;
}

/**
 * Cheap reset for canvases redrawn every frame: re-assigning the width would
 * reallocate the backing store in WebKit. A clip left by unbalanced
 * save/restore cannot be undone this way, which is why the engine must
 * balance them.
 */
export function resetContext(ctx: Ctx2D, width: number, height: number): void {
  if (typeof ctx.reset === 'function') {
    ctx.reset();
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, width, height);
}

/** Frees the backing store now instead of whenever the garbage collector runs (WebKit is slow to). */
export function releaseCanvas(canvas: AnyCanvas): void {
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    /* a detached or transferred canvas has nothing left to free */
  }
}

export function isCanvas(value: unknown): value is AnyCanvas {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getContext?: unknown }).getContext === 'function' &&
    typeof (value as { width?: unknown }).width === 'number'
  );
}

/* Leaving the page ------------------------------------------------------------ */

let unloading = false;

// WebKit refuses every blob read from the moment a navigation away from the
// page goes ahead (beforeunload) until the page is gone, and reports each
// refused read itself ("Cannot load blob ... due to access control checks").
// The page is in use again once it is shown from the back-forward cache, or
// the user acts on it after a navigation that did not happen (stopped, or
// turned into a download).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const leave = () => {
    unloading = true;
  };
  const stay = () => {
    unloading = false;
  };
  window.addEventListener('beforeunload', leave);
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', stay);
  window.addEventListener('pointerdown', stay, true);
  window.addEventListener('keydown', stay, true);
}

/** True while the webview is leaving the page: canvases cannot be read back into bytes now. */
export function pageIsUnloading(): boolean {
  return unloading;
}

/** canvasToBytes gave up because the page is unloading: expected, not a broken canvas. */
export class PageUnloadingError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The page is unloading', options);
    this.name = 'PageUnloadingError';
  }
}

/**
 * Encodes the canvas (convertToBlob on OffscreenCanvas, toBlob on the DOM)
 * into file bytes. Rejects with PageUnloadingError while the page unloads.
 */
export async function canvasToBytes(canvas: AnyCanvas, type: string, quality?: number): Promise<Uint8Array> {
  let blob: Blob;
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    blob = await canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  } else {
    const element = canvas as HTMLCanvasElement;
    blob = await new Promise<Blob>((resolve, reject) => {
      element.toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas could not be encoded'))), type, quality);
    });
  }
  // Not even tried: the read would fail and WebKit would report it as a page error.
  if (unloading) throw new PageUnloadingError();
  try {
    return new Uint8Array(await blob.arrayBuffer());
  } catch (err) {
    // The page began unloading during the read (NotReadableError in WebKit).
    throw unloading ? new PageUnloadingError({ cause: err }) : err;
  }
}

/** Adds a rounded rectangle path (roundRect when available, arcs otherwise). */
export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(Number.isFinite(r) ? r : 0, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

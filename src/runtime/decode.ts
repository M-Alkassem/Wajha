/**
 * Browser image decoding shared by the image cache and the importer:
 * createImageBitmap first, an <img> element as the fallback, and a
 * high-quality step-down downscale for previews.
 */
import type { ImageLike } from '../engine/types';
import { imageWithinLimits } from '../platform/limits';
import { createSurface, isCanvas, releaseCanvas, type Surface } from './canvas';

/** MIME type for an asset id or file name, from its extension. */
export function mimeForName(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/** Wraps bytes in a Blob. Blob parts must be backed by a plain ArrayBuffer, so shared memory is copied. */
export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const part = bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
  return new Blob([part], { type });
}

function canUseImageElement(): boolean {
  return (
    typeof Image === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
  );
}

/** True when this environment can decode images at all. */
export function hasImageDecoder(): boolean {
  return typeof createImageBitmap === 'function' || canUseImageElement();
}

function loaded(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => reject(new Error('The image could not be decoded')), { once: true });
  });
}

async function decodeWithElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await (typeof img.decode === 'function' ? img.decode() : loaded(img));
    } catch (err) {
      // WebKit's decode() can reject for images that still load fine.
      await loaded(img).catch(() => undefined);
      if (!img.naturalWidth || !img.naturalHeight) throw err;
    }
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('The image has no pixels');
    return img;
  } finally {
    // The decoded element keeps its own copy of the data; the URL only pins the blob.
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes encoded image bytes at full resolution. Rejects when neither
 * decoder can read them, and before decoding anything whose header does not
 * state a size within the image limits: every decode in the app passes here,
 * so a file that slipped past the import checks still cannot allocate gigabytes.
 */
export async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageLike> {
  if (!imageWithinLimits(bytes)) throw new Error('The image is larger than supported or damaged');
  const blob = bytesToBlob(bytes, mime);
  let failure: unknown = null;
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width > 0 && bitmap.height > 0) return bitmap;
      bitmap.close();
      failure = new Error('The image has no pixels');
    } catch (err) {
      // Older WebKit cannot build bitmaps from some blobs (WebP): the element path can.
      failure = err;
    }
  }
  if (canUseImageElement()) return decodeWithElement(blob);
  throw failure ?? new Error('No image decoder is available');
}

/** Frees a decoded image: closes ImageBitmaps, empties canvases, leaves <img> elements to the GC. */
export function disposeImage(img: ImageLike): void {
  try {
    const closable = img as { close?: unknown };
    if (typeof closable.close === 'function') {
      (img as ImageBitmap).close();
      return;
    }
    if (isCanvas(img)) releaseCanvas(img);
  } catch {
    /* already released */
  }
}

/** Size of one downscale pass. */
export interface ScaleStep {
  width: number;
  height: number;
}

/**
 * Passes for a high-quality downscale from w x h to tw x th: halve while the
 * remaining factor is below 0.5 (a single big reduction aliases badly, even
 * with imageSmoothingQuality 'high' in WebKit), then one final pass to the
 * exact target. Always returns at least one pass.
 */
export function downscaleSteps(w: number, h: number, tw: number, th: number): ScaleStep[] {
  const steps: ScaleStep[] = [];
  const targetLongest = Math.max(tw, th);
  let cw = w;
  let ch = h;
  // Bounded by log2 of the size, so a bogus huge input cannot spin forever.
  for (let guard = 0; guard < 32 && Math.max(cw, ch) / 2 >= targetLongest; guard++) {
    cw = Math.max(tw, Math.round(cw / 2));
    ch = Math.max(th, Math.round(ch / 2));
    steps.push({ width: cw, height: ch });
  }
  if (steps.length === 0 || cw !== tw || ch !== th) steps.push({ width: tw, height: th });
  return steps;
}

/** Draws `src` into a new tw x th surface through the passes of `downscaleSteps`. The source is not released. */
export function downscaleToSurface(
  src: ImageLike,
  tw: number,
  th: number,
  make: (width: number, height: number) => Surface = createSurface,
): Surface {
  let current: Surface | null = null;
  try {
    for (const step of downscaleSteps(src.width, src.height, tw, th)) {
      const next = make(step.width, step.height);
      next.ctx.imageSmoothingEnabled = true;
      next.ctx.imageSmoothingQuality = 'high';
      next.ctx.drawImage(current ? current.canvas : src, 0, 0, step.width, step.height);
      if (current) releaseCanvas(current.canvas);
      current = next;
    }
  } catch (err) {
    if (current) releaseCanvas(current.canvas);
    throw err;
  }
  // downscaleSteps never returns an empty list.
  return current as Surface;
}

/** Turns a finished surface into an ImageBitmap (closeable, cheap to draw) when the platform can. */
async function surfaceToImage(surface: Surface): Promise<ImageLike> {
  const { canvas } = surface;
  try {
    if ('transferToImageBitmap' in canvas && typeof canvas.transferToImageBitmap === 'function') {
      const bitmap = canvas.transferToImageBitmap();
      releaseCanvas(canvas);
      return bitmap;
    }
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(canvas);
      releaseCanvas(canvas);
      return bitmap;
    }
  } catch {
    /* keep the canvas itself */
  }
  return canvas;
}

/**
 * Returns `img` when its longest side is at most `maxSide`, otherwise a
 * downscaled copy. Takes ownership of `img`: the full-size decode is
 * released as soon as the copy exists (or the downscale failed).
 */
export async function shrinkImage(
  img: ImageLike,
  maxSide: number,
  make: (width: number, height: number) => Surface = createSurface,
): Promise<ImageLike> {
  const { width, height } = img;
  const longest = Math.max(width, height);
  if (!(longest > maxSide) || !(maxSide > 0)) return img;
  const scale = maxSide / longest;
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  let surface: Surface;
  try {
    surface = downscaleToSurface(img, tw, th, make);
  } finally {
    disposeImage(img);
  }
  return surfaceToImage(surface);
}

/**
 * Size limits for everything the app reads from outside (picked and dropped
 * files, archives, gallery downloads, images on disk), in one place, and the
 * header reader that enforces the pixel limits before an image is decoded:
 * a few kilobytes of PNG can declare a canvas that inflates to gigabytes (a
 * "decompression bomb"). The Rust shell applies the same byte limits to the
 * files its dialogs read (src-tauri/src/dialogs.rs).
 *
 * No runtime imports: scripts/build-gallery-index.mjs loads this file with
 * Node's type stripping, so the gallery review refuses exactly what the app
 * would. (tooLargeError, which needs PlatformError, lives in paths.ts.)
 */
import type { ImageExt, OpenFileKind } from './types';

const MB = 1024 * 1024;

/* Files --------------------------------------------------------------- */

/** Largest image file: screenshots, and the images inside archives and gallery templates. */
export const MAX_IMAGE_BYTES = 100 * MB;
/** Largest .wajha file, and the most its entries may hold once inflated. */
export const ARCHIVE_MAX_BYTES = 500 * MB;
/** The same for a .wajha-template, which carries design images only. */
export const TEMPLATE_ARCHIVE_MAX_BYTES = 100 * MB;
/** Most entries in an archive. */
export const ARCHIVE_MAX_ENTRIES = 2000;
/** Largest project.json or template.json in an archive or from the gallery; real ones stay far below 1 MB. */
export const MAX_MANIFEST_BYTES = 16 * MB;
/** Largest translations spreadsheet. */
export const MAX_CSV_BYTES = 10 * MB;
/** Largest font file (a full CJK font is about 20 MB). */
export const MAX_FONT_BYTES = 30 * MB;
/** Largest logo picked for the brand kit. */
export const MAX_LOGO_BYTES = 20 * MB;

/** Largest file Platform.openFile reads, per kind. */
export const OPEN_FILE_MAX_BYTES: Readonly<Record<OpenFileKind, number>> = {
  project: ARCHIVE_MAX_BYTES,
  template: TEMPLATE_ARCHIVE_MAX_BYTES,
  csv: MAX_CSV_BYTES,
  font: MAX_FONT_BYTES,
  image: MAX_LOGO_BYTES,
};

/** "100 MB", for messages. */
export const megabytes = (bytes: number): string => `${Math.round(bytes / MB)} MB`;

/* Images -------------------------------------------------------------- */

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageLimits {
  maxBytes: number;
  /** Longest side, in pixels. */
  maxSide: number;
  /** Largest area, in pixels. */
  maxPixels: number;
}

/** Screenshots and design images (a 48 MP phone photo fits; it decodes to ~190 MB for a moment). */
export const IMAGE_LIMITS: Readonly<ImageLimits> = { maxBytes: MAX_IMAGE_BYTES, maxSide: 16384, maxPixels: 8192 * 8192 };
/** Project thumbnails and template previews (thumb.jpg, preview.jpg): small pictures by design. */
export const THUMBNAIL_LIMITS: Readonly<ImageLimits> = { maxBytes: 4 * MB, maxSide: 4096, maxPixels: 2048 * 2048 };

/** Image type from the file signature; null for anything that is not PNG, JPEG or WebP. */
export function sniffImageExt(data: Uint8Array): ImageExt | null {
  const b = data;
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) return 'webp';
  return null;
}

const ascii = (b: Uint8Array, at: number, text: string) => {
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** IHDR must be the first chunk; Apple's CgBI variant (a chunk before it) is not a standard PNG. */
function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || u32be(b, 8) !== 13 || !ascii(b, 12, 'IHDR')) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // End of image or start of scan before any frame header: no size here.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (i + 9 > b.length) return null;
      return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  if (ascii(b, 12, 'VP8 ')) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null;
    return {
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  if (ascii(b, 12, 'VP8X')) return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return null;
}

/**
 * Pixel size read from the file header without decoding, or null when the
 * header is not understood. EXIF rotation is ignored, which does not matter
 * for the size limits.
 */
export function readImageSize(b: Uint8Array, type: ImageExt): ImageSize | null {
  const size = type === 'png' ? pngSize(b) : type === 'jpg' ? jpegSize(b) : webpSize(b);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/** True when an image of `size` is within `limits` (pixels only). */
export function fitsImageLimits({ width, height }: ImageSize, limits: Readonly<ImageLimits> = IMAGE_LIMITS): boolean {
  return width <= limits.maxSide && height <= limits.maxSide && width * height <= limits.maxPixels;
}

/**
 * True for PNG, JPEG or WebP bytes within `limits` whose header declares
 * their size: the only images worth decoding. Anything else is refused
 * unread, because its size is unknown until the decode has already happened.
 */
export function imageWithinLimits(b: Uint8Array, limits: Readonly<ImageLimits> = IMAGE_LIMITS): boolean {
  if (b.byteLength > limits.maxBytes) return false;
  const type = sniffImageExt(b);
  const size = type ? readImageSize(b, type) : null;
  return size !== null && fitsImageLimits(size, limits);
}

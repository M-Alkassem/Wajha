import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_MAX_BYTES,
  IMAGE_LIMITS,
  MAX_CSV_BYTES,
  MAX_IMAGE_BYTES,
  OPEN_FILE_MAX_BYTES,
  TEMPLATE_ARCHIVE_MAX_BYTES,
  THUMBNAIL_LIMITS,
  fitsImageLimits,
  imageWithinLimits,
  megabytes,
  readImageSize,
} from './limits';
import { tooLargeError } from './paths';
import { PlatformError } from './types';

const MB = 1024 * 1024;

function png(width: number, height: number, ihdrLength = 13): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(b.buffer);
  view.setUint32(8, ihdrLength);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return b;
}

describe('file limits', () => {
  it('match the limits the desktop shell applies before reading a file', () => {
    expect(OPEN_FILE_MAX_BYTES).toEqual({ project: 500 * MB, template: 100 * MB, csv: 10 * MB });
    expect([ARCHIVE_MAX_BYTES, TEMPLATE_ARCHIVE_MAX_BYTES, MAX_CSV_BYTES, MAX_IMAGE_BYTES]).toEqual([500 * MB, 100 * MB, 10 * MB, 100 * MB]);
  });

  it('words the error like the shell', () => {
    const e = tooLargeError('sheet.csv', MAX_CSV_BYTES);
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.code).toBe('invalid_data');
    expect(e.message).toBe('sheet.csv is larger than 10 MB');
    expect(tooLargeError('', ARCHIVE_MAX_BYTES).message).toBe('The file is larger than 500 MB');
    expect(megabytes(TEMPLATE_ARCHIVE_MAX_BYTES)).toBe('100 MB');
  });
});

describe('readImageSize', () => {
  it('reads the size each format declares in its header', () => {
    expect(readImageSize(png(1290, 2796), 'png')).toEqual({ width: 1290, height: 2796 });
    expect(readImageSize(jpeg(4032, 3024), 'jpg')).toEqual({ width: 4032, height: 3024 });
    expect(readImageSize(webpVp8x(16384, 9000), 'webp')).toEqual({ width: 16384, height: 9000 });
  });

  it('only accepts IHDR as the first chunk, with its fixed length', () => {
    const cgbi = png(16000, 16000);
    cgbi.set([0, 0, 0, 4, 0x43, 0x67, 0x42, 0x49], 8);
    expect(readImageSize(cgbi, 'png')).toBeNull();
    expect(readImageSize(png(100, 100, 14), 'png')).toBeNull();
    expect(readImageSize(png(0, 100), 'png')).toBeNull();
  });
});

describe('image limits', () => {
  it('allow up to 16384 px per side and 8192 x 8192 px in all', () => {
    expect(fitsImageLimits({ width: 16384, height: 4096 })).toBe(true);
    expect(fitsImageLimits({ width: 16385, height: 1 })).toBe(false);
    expect(fitsImageLimits({ width: 8193, height: 8192 })).toBe(false);
    expect(fitsImageLimits({ width: 2048, height: 2048 }, THUMBNAIL_LIMITS)).toBe(true);
    expect(fitsImageLimits({ width: 4097, height: 100 }, THUMBNAIL_LIMITS)).toBe(false);
    expect(fitsImageLimits({ width: 2049, height: 2048 }, THUMBNAIL_LIMITS)).toBe(false);
  });

  it('accept only images whose header states a size within the limits', () => {
    expect(imageWithinLimits(png(1320, 2868))).toBe(true);
    expect(imageWithinLimits(jpeg(8000, 6000))).toBe(true);
    expect(imageWithinLimits(webpVp8x(30000, 30000))).toBe(false);
    expect(imageWithinLimits(png(30000, 30000))).toBe(false);
    // Unknown size: no header, an unknown type, or empty.
    expect(imageWithinLimits(png(10, 10).subarray(0, 20))).toBe(false);
    expect(imageWithinLimits(new TextEncoder().encode('GIF89a....'))).toBe(false);
    expect(imageWithinLimits(new Uint8Array(0))).toBe(false);
  });

  it('check the byte size first', () => {
    const big = new Uint8Array(THUMBNAIL_LIMITS.maxBytes + 1);
    big.set(png(100, 100));
    expect(imageWithinLimits(big, THUMBNAIL_LIMITS)).toBe(false);
    expect(imageWithinLimits(big, IMAGE_LIMITS)).toBe(true);
  });
});

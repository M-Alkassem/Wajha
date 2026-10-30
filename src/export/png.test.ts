import { createCanvas, loadImage } from '@napi-rs/canvas';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng, MAX_IDAT_BYTES } from './png';

/* ------------------------------------------------------------------ */
/* An independent decoder, so the tests do not trust the encoder's code */
/* ------------------------------------------------------------------ */

/** Bit-by-bit CRC-32, deliberately not table driven. */
function slowCrc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Chunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

function chunks(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  let o = 8;
  while (o < png.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    const crc = view.getUint32(o + 8 + len);
    out.push({ type, data, crcOk: crc === slowCrc(png.subarray(o + 4, o + 8 + len)) });
    o += 12 + len;
  }
  expect(o).toBe(png.length);
  return out;
}

interface Decoded {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  /** RGB, 3 bytes per pixel */
  rgb: Uint8Array;
  filters: number[];
  /** raw filtered stream, for checking the filter choice */
  stream: Uint8Array;
}

const paethRef = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function decode(png: Uint8Array): Decoded {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const list = chunks(png);
  for (const c of list) expect(c.crcOk, `${c.type} CRC`).toBe(true);
  expect(list[0].type).toBe('IHDR');
  expect(list.at(-1)?.type).toBe('IEND');
  expect(list.at(-1)?.data.length).toBe(0);
  const types = list.map((c) => c.type);
  // IDAT chunks must be consecutive.
  const first = types.indexOf('IDAT');
  const last = types.lastIndexOf('IDAT');
  expect(first).toBeGreaterThan(0);
  expect(types.slice(first, last + 1).every((t) => t === 'IDAT')).toBe(true);

  const ihdr = new DataView(list[0].data.buffer, list[0].data.byteOffset, 13);
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);
  const [bitDepth, colorType, compression, filterMethod, interlace] = list[0].data.subarray(8, 13);
  expect(compression).toBe(0);
  expect(filterMethod).toBe(0);

  const idat = list.filter((c) => c.type === 'IDAT');
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let k = 0;
  for (const c of idat) {
    joined.set(c.data, k);
    k += c.data.length;
  }
  const stream = unzlibSync(joined);
  const stride = width * 3;
  expect(stream.length).toBe(height * (stride + 1));

  const rgb = new Uint8Array(width * height * 3);
  const filters: number[] = [];
  for (let y = 0; y < height; y++) {
    const f = stream[y * (stride + 1)];
    filters.push(f);
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = stream[src + i];
      const a = i >= 3 ? rgb[row + i - 3] : 0;
      const b = y > 0 ? rgb[row - stride + i] : 0;
      const c = i >= 3 && y > 0 ? rgb[row - stride + i - 3] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + Math.floor((a + b) / 2);
      else if (f === 4) v = x + paethRef(a, b, c);
      else throw new Error(`bad filter ${f}`);
      rgb[row + i] = v & 255;
    }
  }
  return { width, height, bitDepth, colorType, interlace, rgb, filters, stream };
}

/** Expected RGB of a non-premultiplied RGBA pixel over white, computed in floating point. */
const over = (c: number, a: number) => Math.round((c * a) / 255 + 255 * (1 - a / 255));

function expectedRgb(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let p = 0; p < rgba.length / 4; p++) {
    const a = rgba[p * 4 + 3];
    for (let ch = 0; ch < 3; ch++) out[p * 3 + ch] = over(rgba[p * 4 + ch], a);
  }
  return out;
}

/** Deterministic pseudo-random bytes (LCG). */
function noise(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out.set(pixel(x, y), (y * width + x) * 4);
  }
  return out;
}

function roundTrip(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, level?: number): Decoded {
  const png = encodePng(rgba, width, height, level);
  const d = decode(png);
  expect(d.width).toBe(width);
  expect(d.height).toBe(height);
  expect(d.bitDepth).toBe(8);
  expect(d.colorType).toBe(2);
  expect(d.interlace).toBe(0);
  expect(Buffer.from(d.rgb).equals(Buffer.from(expectedRgb(rgba)))).toBe(true);
  return d;
}

const signedCost = (row: Uint8Array) => row.reduce((sum, v) => sum + (v < 128 ? v : 256 - v), 0);

/* ------------------------------------------------------------------ */

describe('crc32', () => {
  it('matches the reference CRC-32', () => {
    const ascii = new TextEncoder().encode('123456789');
    expect(crc32(ascii)).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    const data = noise(10_000, 7);
    expect(crc32(data)).toBe(slowCrc(data));
    // Continuing from a previous result equals one pass over everything.
    expect(crc32(data, 5000, data.length, crc32(data, 0, 5000))).toBe(crc32(data));
  });
});

describe('encodePng', () => {
  it('encodes a 1x1 opaque pixel', () => {
    const d = roundTrip(new Uint8ClampedArray([12, 34, 56, 255]), 1, 1);
    expect([...d.rgb]).toEqual([12, 34, 56]);
  });

  it('writes only IHDR, IDAT and IEND, and never an alpha channel', () => {
    const png = encodePng(new Uint8ClampedArray([1, 2, 3, 0, 4, 5, 6, 128]), 2, 1);
    const types = chunks(png).map((c) => c.type);
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(types).not.toContain('tRNS');
    expect(png[8 + 8 + 9]).toBe(2); // colour type byte inside IHDR
  });

  it('round-trips odd widths and heights exactly', () => {
    for (const [w, h] of [
      [1, 7],
      [3, 3],
      [5, 2],
      [17, 9],
      [101, 13],
    ]) {
      roundTrip(noise(w * h * 4, w * 31 + h).map((v, i) => (i % 4 === 3 ? 255 : v)), w, h);
    }
  });

  it('composites alpha over white', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 128, 255, 0, 0, 1, 10, 200, 90, 254, 255, 255, 255, 77]);
    const d = roundTrip(rgba, 6, 1);
    expect([...d.rgb.subarray(0, 3)]).toEqual([255, 255, 255]); // transparent
    expect([...d.rgb.subarray(3, 6)]).toEqual([0, 0, 0]); // opaque black
    expect([...d.rgb.subarray(6, 9)]).toEqual([127, 127, 127]); // half black
    expect([...d.rgb.subarray(15, 18)]).toEqual([255, 255, 255]); // white stays white at any alpha
  });

  it('turns a fully transparent image into plain white', () => {
    const d = roundTrip(new Uint8ClampedArray(40 * 30 * 4), 40, 30);
    expect(d.rgb.every((v) => v === 255)).toBe(true);
  });

  it('composites every alpha value exactly like the floating-point formula', () => {
    // 256 alpha values x 16 colours, so the integer rounding is checked across its whole range.
    const d = roundTrip(
      image(256, 16, (x, y) => [y * 17, 255 - y * 17, (x * 7 + y) & 255, x]),
      256,
      16,
    );
    expect(d.rgb.length).toBe(256 * 16 * 3);
  });

  it('accepts Uint8Array as well as Uint8ClampedArray', () => {
    const bytes = noise(9 * 4 * 4, 3);
    expect(encodePng(bytes, 9, 4)).toEqual(encodePng(new Uint8ClampedArray(bytes), 9, 4));
  });

  it('decodes identically at every compression level and clamps odd levels', () => {
    const rgba = image(64, 48, (x, y) => [x * 4, y * 5, (x ^ y) * 3, 255]);
    for (const level of [0, 1, 6, 9, -3, 42, 4.6, Number.NaN]) roundTrip(rgba, 64, 48, level);
    expect(encodePng(rgba, 64, 48, Number.NaN)).toEqual(encodePng(rgba, 64, 48, 6));
    expect(encodePng(rgba, 64, 48, 42)).toEqual(encodePng(rgba, 64, 48, 9));
    expect(encodePng(rgba, 64, 48, -1)).toEqual(encodePng(rgba, 64, 48, 0));
  });

  it('picks, per row, a filter with the minimum sum of absolute signed differences', () => {
    // Rows that favour different filters: flat, horizontal ramp, vertical ramp, noise, diagonal.
    const w = 48;
    const h = 60;
    const rows = noise(w * h * 4, 99);
    const rgba = image(w, h, (x, y) => {
      const band = Math.floor(y / 12);
      if (band === 0) return [200, 100, 50, 255];
      if (band === 1) return [x * 5, x * 5, x * 5, 255];
      if (band === 2) return [y * 4, 120, 255 - y * 4, 255];
      if (band === 3) return [rows[(y * w + x) * 4], rows[(y * w + x) * 4 + 1], rows[(y * w + x) * 4 + 2], 255];
      return [(x + y) * 3, (x * 2 + y) & 255, (x * y) & 255, 255];
    });
    const d = roundTrip(rgba, w, h);
    const stride = w * 3;
    for (let y = 0; y < h; y++) {
      const cur = d.rgb.subarray(y * stride, (y + 1) * stride);
      const prev = y > 0 ? d.rgb.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
      const candidates = [0, 1, 2, 3, 4].map((f) =>
        cur.map((x, i) => {
          const a = i >= 3 ? cur[i - 3] : 0;
          const b = prev[i];
          const c = i >= 3 ? prev[i - 3] : 0;
          const pred = [0, a, b, (a + b) >> 1, paethRef(a, b, c)][f];
          return (x - pred) & 255;
        }),
      );
      const costs = candidates.map(signedCost);
      const chosen = d.filters[y];
      expect(costs[chosen], `row ${y}`).toBe(Math.min(...costs));
      // Ties go to the earliest filter type.
      expect(chosen, `row ${y}`).toBe(costs.indexOf(Math.min(...costs)));
    }
    // The fixture really exercises several filter types.
    expect(new Set(d.filters).size).toBeGreaterThanOrEqual(3);
  });

  it('splits IDAT into chunks of at most 1 MiB', () => {
    // Incompressible noise: the zlib stream is larger than 1 MiB.
    const w = 700;
    const h = 600;
    const rgba = noise(w * h * 4, 5).map((v, i) => (i % 4 === 3 ? 255 : v));
    const png = encodePng(rgba, w, h);
    const idat = chunks(png).filter((c) => c.type === 'IDAT');
    expect(idat.length).toBeGreaterThan(1);
    for (const c of idat) expect(c.data.length).toBeLessThanOrEqual(MAX_IDAT_BYTES);
    expect(idat.slice(0, -1).every((c) => c.data.length === MAX_IDAT_BYTES)).toBe(true);
    roundTrip(rgba, w, h);
  });

  it('is read back pixel-exact by a production decoder (Skia)', async () => {
    const w = 123;
    const h = 77;
    const rgba = noise(w * h * 4, 21);
    // A third of the pixels opaque, the rest with assorted alpha.
    for (let p = 0; p < w * h; p++) if (p % 3 === 0) rgba[p * 4 + 3] = 255;
    const img = await loadImage(Buffer.from(encodePng(rgba, w, h)));
    expect([img.width, img.height]).toEqual([w, h]);
    const ctx = createCanvas(w, h).getContext('2d');
    ctx.drawImage(img, 0, 0);
    const back = ctx.getImageData(0, 0, w, h).data;
    const want = expectedRgb(rgba);
    let mismatches = 0;
    for (let p = 0; p < w * h; p++) {
      if (back[p * 4 + 3] !== 255) mismatches++;
      for (let ch = 0; ch < 3; ch++) if (back[p * 4 + ch] !== want[p * 3 + ch]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('compresses flat images to a tiny file', () => {
    const png = encodePng(image(1000, 1000, () => [30, 60, 90, 255]), 1000, 1000);
    expect(png.length).toBeLessThan(10_000);
  });

  it('returns a buffer it owns exactly (transferable)', () => {
    const png = encodePng(new Uint8ClampedArray(16), 2, 2);
    expect(png.byteOffset).toBe(0);
    expect(png.byteLength).toBe(png.buffer.byteLength);
  });

  it('does not modify the input pixels', () => {
    const rgba = noise(10 * 10 * 4, 11);
    const copy = rgba.slice();
    encodePng(rgba, 10, 10);
    expect(rgba).toEqual(copy);
  });

  it('rejects impossible sizes and mismatched buffers', () => {
    const px = new Uint8ClampedArray(16);
    expect(() => encodePng(px, 0, 4)).toThrow(RangeError);
    expect(() => encodePng(px, 2, -2)).toThrow(RangeError);
    expect(() => encodePng(px, 1.5, 2)).toThrow(RangeError);
    expect(() => encodePng(px, Number.NaN, 2)).toThrow(RangeError);
    expect(() => encodePng(px, Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
    expect(() => encodePng(px, 2, 3)).toThrow(/Expected 24 bytes/);
    expect(() => encodePng(new Uint8ClampedArray(20), 2, 2)).toThrow(RangeError);
    expect(() => encodePng(new Uint8ClampedArray(0), 1, 1)).toThrow(RangeError);
  });

  it('encodes a 1320 x 2868 screenshot in about half a second', () => {
    const w = 1320;
    const h = 2868;
    const grain = noise(w * h, 2024);
    // Dithered gradient background, flat UI cards and a photo-like band: harder than a typical screenshot.
    const rgba = image(w, h, (x, y) => {
      const g = grain[y * w + x] & 3;
      if (x > 130 && x < 1190 && y > 860 && y < 2720) {
        if (y < 1500) return [(128 + 60 * Math.sin(x / 37) + (grain[y * w + x] & 31)) | 0, (100 + 50 * Math.cos(y / 23)) | 0, 90 + (grain[y * w + x] >> 3), 255];
        return Math.floor(y / 180) % 2 === 0 ? [245, 245, 250, 255] : [20, 20, 24, 255];
      }
      return [((x / w) * 200 + 30 + g) | 0, ((y / h) * 120 + 60 + g) | 0, (220 - (x / w) * 80) | 0, 255];
    });
    let best = Number.POSITIVE_INFINITY;
    let png: Uint8Array = new Uint8Array(0);
    for (let run = 0; run < 3; run++) {
      const t = performance.now();
      png = encodePng(rgba, w, h);
      best = Math.min(best, performance.now() - t);
    }
    console.info(`encodePng 1320x2868: ${best.toFixed(0)} ms, ${(png.length / 1024).toFixed(0)} KiB`);
    // About 0.4 s on an idle laptop. The full suite runs ~100 test files in
    // parallel, so the ceiling only catches real regressions, not load.
    expect(best).toBeLessThan(2000);
    const d = decode(png);
    expect(d.width).toBe(w);
    expect(d.height).toBe(h);
    expect(Buffer.from(d.rgb).equals(Buffer.from(expectedRgb(rgba)))).toBe(true);
  });
});

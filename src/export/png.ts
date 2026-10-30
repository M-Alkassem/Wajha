/**
 * Minimal, fast PNG encoder for export renders.
 *
 * Output is always 8-bit truecolour without alpha (colour type 2): Google
 * Play rejects screenshots with an alpha channel and App Store Connect
 * rejects transparency, so any alpha in the canvas pixels is composited over
 * white here. Rows use the adaptive filter heuristic libpng uses (the filter
 * with the smallest sum of absolute signed bytes wins), then fflate deflates
 * the whole image in one go.
 */
import { zlibSync } from 'fflate';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Bytes per pixel of the encoded image (RGB). */
const BPP = 3;
/** Largest IDAT payload we write. Any size is legal; 1 MiB keeps chunks friendly to streaming readers. */
export const MAX_IDAT_BYTES = 1 << 20;
const MAX_DIMENSION = 0x7fffffff;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** CRC-32 (ISO 3309, as used by PNG chunks) of `data[start..end)`. Pass a previous result as `seed` to continue it. */
export function crc32(data: Uint8Array, start = 0, end = data.length, seed = 0): number {
  let c = ~seed;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** Throws a RangeError unless `rgba` holds exactly width x height RGBA pixels. */
export function assertPngInput(rgba: ArrayLike<number>, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new RangeError(`Invalid PNG size ${width} x ${height}`);
  }
  const expected = width * height * 4;
  if (rgba.length !== expected) throw new RangeError(`Expected ${expected} bytes of RGBA pixels for ${width} x ${height}, got ${rgba.length}`);
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function deflateLevel(level: number): (typeof LEVELS)[number] {
  if (!Number.isFinite(level)) return 6;
  return LEVELS[Math.min(9, Math.max(0, Math.round(level)))];
}

/**
 * Copies one row of RGBA pixels into `out` as RGB composited over white.
 * Canvas ImageData is not premultiplied, so a pixel with alpha `a` becomes
 * c * a/255 + 255 * (1 - a/255), rounded to nearest (no ties exist).
 */
function compositeRow(rgba: Uint8ClampedArray | Uint8Array, src: number, out: Uint8Array, width: number): void {
  for (let x = 0, i = src, j = 0; x < width; x++, i += 4, j += 3) {
    const a = rgba[i + 3];
    if (a === 255) {
      out[j] = rgba[i];
      out[j + 1] = rgba[i + 1];
      out[j + 2] = rgba[i + 2];
    } else if (a === 0) {
      out[j] = 255;
      out[j + 1] = 255;
      out[j + 2] = 255;
    } else {
      out[j] = 255 - ((((255 - rgba[i]) * a + 127) / 255) | 0);
      out[j + 1] = 255 - ((((255 - rgba[i + 1]) * a + 127) / 255) | 0);
      out[j + 2] = 255 - ((((255 - rgba[i + 2]) * a + 127) / 255) | 0);
    }
  }
}

/** |b| for a filtered byte read as a signed int8, the per-byte cost of the MSAD heuristic. */
const cost = (v: number) => (v < 128 ? v : 256 - v);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = p > a ? p - a : a - p;
  const pb = p > b ? p - b : b - p;
  const pc = p > c ? p - c : c - p;
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Filter type (0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth) with the smallest cost for this row; earlier types win ties. */
function chooseFilter(cur: Uint8Array, prev: Uint8Array, stride: number): number {
  let none = 0;
  let sub = 0;
  let up = 0;
  let avg = 0;
  let pae = 0;
  // The first pixel has no left neighbour (a = c = 0), which removes branches from the main loop.
  const head = Math.min(BPP, stride);
  for (let i = 0; i < head; i++) {
    const x = cur[i];
    const b = prev[i];
    none += cost(x);
    sub += cost(x);
    up += cost((x - b) & 255);
    avg += cost((x - (b >> 1)) & 255);
    pae += cost((x - b) & 255);
  }
  for (let i = BPP; i < stride; i++) {
    const x = cur[i];
    const a = cur[i - BPP];
    const b = prev[i];
    const c = prev[i - BPP];
    none += cost(x);
    sub += cost((x - a) & 255);
    up += cost((x - b) & 255);
    avg += cost((x - ((a + b) >> 1)) & 255);
    pae += cost((x - paeth(a, b, c)) & 255);
  }
  let best = 0;
  let min = none;
  if (sub < min) {
    best = 1;
    min = sub;
  }
  if (up < min) {
    best = 2;
    min = up;
  }
  if (avg < min) {
    best = 3;
    min = avg;
  }
  return pae < min ? 4 : best;
}

/** Writes the filter byte and the filtered row at `out[o]`. */
function writeRow(out: Uint8Array, o: number, filter: number, cur: Uint8Array, prev: Uint8Array, stride: number): void {
  out[o] = filter;
  const d = o + 1;
  const head = Math.min(BPP, stride);
  switch (filter) {
    case 0:
      out.set(cur, d);
      break;
    case 1:
      for (let i = 0; i < head; i++) out[d + i] = cur[i];
      for (let i = BPP; i < stride; i++) out[d + i] = cur[i] - cur[i - BPP];
      break;
    case 2:
      for (let i = 0; i < stride; i++) out[d + i] = cur[i] - prev[i];
      break;
    case 3:
      for (let i = 0; i < head; i++) out[d + i] = cur[i] - (prev[i] >> 1);
      for (let i = BPP; i < stride; i++) out[d + i] = cur[i] - ((cur[i - BPP] + prev[i]) >> 1);
      break;
    default:
      for (let i = 0; i < head; i++) out[d + i] = cur[i] - prev[i];
      for (let i = BPP; i < stride; i++) out[d + i] = cur[i] - paeth(cur[i - BPP], prev[i], prev[i - BPP]);
  }
}

/** Composites and filters every row into the byte stream that IDAT compresses. */
function filterImage(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * BPP;
  const out = new Uint8Array(height * (stride + 1));
  // Uint8Array stores wrap modulo 256, which is exactly the filter arithmetic.
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    compositeRow(rgba, y * width * 4, cur, width);
    writeRow(out, y * (stride + 1), chooseFilter(cur, prev, stride), cur, prev, stride);
    const t = prev;
    prev = cur;
    cur = t;
  }
  return out;
}

const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0));
const IHDR = ascii('IHDR');
const IDAT = ascii('IDAT');
const IEND = ascii('IEND');

/** Writes one chunk (length, type, data, CRC of type + data) at `o`; returns the offset after it. */
function writeChunk(png: Uint8Array, view: DataView, o: number, type: number[], data: Uint8Array): number {
  view.setUint32(o, data.length);
  png.set(type, o + 4);
  png.set(data, o + 8);
  const end = o + 8 + data.length;
  view.setUint32(end, crc32(png, o + 4, end));
  return end + 4;
}

/** encodePng with the precise buffer type, so the worker can transfer the result. */
export function encodePngBuffer(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, level = 6): Uint8Array<ArrayBuffer> {
  assertPngInput(rgba, width, height);
  const idat = zlibSync(filterImage(rgba, width, height), { level: deflateLevel(level) });

  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  // compression, filter and interlace methods stay 0

  const idatChunks = Math.max(1, Math.ceil(idat.length / MAX_IDAT_BYTES));
  const png = new Uint8Array(SIGNATURE.length + (12 + 13) + idat.length + 12 * idatChunks + 12);
  const view = new DataView(png.buffer);
  png.set(SIGNATURE, 0);
  let o = writeChunk(png, view, SIGNATURE.length, IHDR, header);
  for (let start = 0; start < idat.length; start += MAX_IDAT_BYTES) {
    o = writeChunk(png, view, o, IDAT, idat.subarray(start, Math.min(idat.length, start + MAX_IDAT_BYTES)));
  }
  writeChunk(png, view, o, IEND, new Uint8Array(0));
  return png;
}

/**
 * RGBA (canvas ImageData order) -> PNG bytes with color type 2 (RGB, 8-bit).
 * Alpha is composited over white. `level` is the deflate level 0..9.
 */
export function encodePng(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, level = 6): Uint8Array {
  return encodePngBuffer(rgba, width, height, level);
}

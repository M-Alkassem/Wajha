import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadImage } from '@napi-rs/canvas';
import type { ImageExt, PickedImage } from '../platform/types';
import { PlatformError } from '../platform/types';

const fake = vi.hoisted(() => ({
  putAsset: vi.fn<(projectId: string, data: Uint8Array, ext: ImageExt) => Promise<string>>(),
  pickImages: vi.fn<(projectId: string) => Promise<PickedImage[]>>(),
  readAsset: vi.fn<(projectId: string, assetId: string) => Promise<Uint8Array | null>>(),
}));
vi.mock('../platform', () => ({ getPlatform: () => ({ pickImages: fake.pickImages }) }));
vi.mock('../storage', () => ({ readAsset: fake.readAsset, putProjectAsset: fake.putAsset }));

import {
  importImages,
  importImagesWithReport,
  MAX_IMPORT_BYTES,
  pickAndImportImages,
  pickAndImportImagesWithReport,
  readImageSize,
  sniffImageType,
} from './importer';
import { encodedImage, fakeBitmap, type FakeBitmap } from './fixtures.node';

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/** PNG signature + an IHDR chunk claiming the given size (no pixel data). */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

function riff(chunk: string, payload: number[]): Uint8Array {
  const b = new Uint8Array(Math.max(30, 20 + payload.length));
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  b.set([...chunk].map((c) => c.charCodeAt(0)), 12);
  b.set(payload, 20);
  return b;
}

function vp8(width: number, height: number): Uint8Array {
  return riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f]);
}

function vp8l(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]);
}

/** The Apple CgBI variant: a CgBI chunk before IHDR. WebKit decodes it; its header size is not where a PNG's is. */
function cgbi(width: number, height: number): Uint8Array {
  const b = pngHeader(width, height);
  b.set([0, 0, 0, 4, 0x43, 0x67, 0x42, 0x49], 8);
  return b;
}

/** A dropped file that logs reads of its content, and can claim a size it does not hold. */
class FakeFile extends Blob {
  readonly label: string;
  readonly log: string[];
  readonly claimed: number | null;
  constructor(label: string, content: Uint8Array, log: string[], claimed: number | null = null) {
    super([content.slice()]);
    this.label = label;
    this.log = log;
    this.claimed = claimed;
  }
  override get size() {
    return this.claimed ?? super.size;
  }
  override async arrayBuffer() {
    this.log.push(`read ${this.label}`);
    return super.arrayBuffer();
  }
}

function jpegWithApp1(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xff, // fill byte
    0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, // APP1, length 6
    0xff, 0xc4, 0x00, 0x03, 0x00, // DHT is not a frame header
    0xff, 0xc2, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
  ]);
}

const decoded: FakeBitmap[] = [];

beforeEach(() => {
  decoded.length = 0;
  fake.putAsset.mockReset();
  fake.putAsset.mockImplementation(async (_p, data, ext) => `${sha(data)}.${ext}`);
  fake.pickImages.mockReset();
  fake.readAsset.mockReset();
  // A real decoder: @napi-rs/canvas reads the bytes, like createImageBitmap would.
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const img = await loadImage(Buffer.from(await blob.arrayBuffer()));
    const bmp = fakeBitmap(img.width, img.height);
    decoded.push(bmp);
    return bmp;
  });
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sniffImageType', () => {
  it('recognises PNG, JPEG and WebP by magic bytes', () => {
    expect(sniffImageType(encodedImage(4, 4, 'image/png'))).toBe('png');
    expect(sniffImageType(encodedImage(4, 4, 'image/jpeg'))).toBe('jpg');
    expect(sniffImageType(encodedImage(4, 4, 'image/webp'))).toBe('webp');
  });

  it('rejects HEIC, SVG, GIF, truncated and empty data', () => {
    const heic = new Uint8Array([0, 0, 0, 0x18, ...[...'ftypheic'].map((c) => c.charCodeAt(0))]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const gif = new TextEncoder().encode('GIF89a......');
    expect(sniffImageType(heic)).toBeNull();
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(gif)).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('RIFF1234WAVE'))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});

describe('readImageSize', () => {
  it('reads real PNG, JPEG and WebP (VP8X) headers', () => {
    expect(readImageSize(encodedImage(300, 170, 'image/png'), 'png')).toEqual({ width: 300, height: 170 });
    expect(readImageSize(encodedImage(300, 170, 'image/jpeg'), 'jpg')).toEqual({ width: 300, height: 170 });
    expect(readImageSize(encodedImage(300, 170, 'image/webp'), 'webp')).toEqual({ width: 300, height: 170 });
  });

  it('reads lossy (VP8) and lossless (VP8L) WebP headers', () => {
    expect(readImageSize(vp8(1320, 2868), 'webp')).toEqual({ width: 1320, height: 2868 });
    expect(readImageSize(vp8l(300, 170), 'webp')).toEqual({ width: 300, height: 170 });
    expect(readImageSize(vp8l(16384, 16384), 'webp')).toEqual({ width: 16384, height: 16384 });
  });

  it('skips JPEG fill bytes, APP and DHT segments before the frame header', () => {
    expect(readImageSize(jpegWithApp1(4032, 3024), 'jpg')).toEqual({ width: 4032, height: 3024 });
  });

  it('returns null for headers it does not understand', () => {
    expect(readImageSize(pngHeader(0, 10), 'png')).toBeNull();
    expect(readImageSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png')).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), 'jpg')).toBeNull();
    expect(readImageSize(jpegWithApp1(10, 10).subarray(0, 20), 'jpg')).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0, 0]), 'jpg')).toBeNull();
    expect(readImageSize(riff('ALPH', []), 'webp')).toBeNull();
    expect(readImageSize(riff('VP8 ', [0, 0, 0, 1, 2, 3]), 'webp')).toBeNull();
    expect(readImageSize(riff('VP8L', [0x00]), 'webp')).toBeNull();
    expect(readImageSize(new Uint8Array(12), 'webp')).toBeNull();
  });
});

describe('importImages', () => {
  it('stores PNG, JPEG and WebP files with their decoded size, in order', async () => {
    const png = encodedImage(120, 260, 'image/png');
    const jpg = encodedImage(64, 32, 'image/jpeg');
    const webp = encodedImage(50, 40, 'image/webp');
    const assets = await importImages('proj', [
      { name: 'home.png', data: png },
      { name: 'notes.txt', data: new TextEncoder().encode('hello') },
      { name: 'photo.jpeg', data: jpg },
      { name: 'banner.webp', data: webp },
    ]);
    expect(assets).toEqual([
      { id: `${sha(png)}.png`, name: 'home.png', width: 120, height: 260, bytes: png.byteLength, addedAt: 1_700_000_000_000 },
      { id: `${sha(jpg)}.jpg`, name: 'photo.jpeg', width: 64, height: 32, bytes: jpg.byteLength, addedAt: 1_700_000_000_000 },
      { id: `${sha(webp)}.webp`, name: 'banner.webp', width: 50, height: 40, bytes: webp.byteLength, addedAt: 1_700_000_000_000 },
    ]);
    expect(fake.putAsset.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['proj', 'png'],
      ['proj', 'jpg'],
      ['proj', 'webp'],
    ]);
    // every measurement decode was released
    expect(decoded).toHaveLength(3);
    expect(decoded.every((b) => b.closed)).toBe(true);
  });

  it('trusts magic bytes over the file extension', async () => {
    const png = encodedImage(10, 10, 'image/png');
    const [asset] = await importImages('proj', [{ name: 'actually-png.jpg', data: png }]);
    expect(asset.id.endsWith('.png')).toBe(true);
  });

  it('reports skipped files with a reason', async () => {
    const png = encodedImage(10, 10, 'image/png');
    const big = new Uint8Array(MAX_IMPORT_BYTES + 1);
    big.set(png.subarray(0, 8));
    const garbage = new Uint8Array(200);
    garbage.set(png.subarray(0, 8));
    const report = await importImagesWithReport('proj', [
      { name: 'big.png', data: big },
      { name: 'image.heic', data: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) },
      { name: 'empty.png', data: new Uint8Array(0) },
      { name: 'bomb.png', data: pngHeader(20000, 20000) },
      { name: 'wide.png', data: pngHeader(16385, 10) },
      { name: 'broken.png', data: garbage },
      { name: 'fine.png', data: png },
    ]);
    expect(report.assets.map((a) => a.name)).toEqual(['fine.png']);
    expect(report.skipped.map((s) => [s.name, s.reason])).toEqual([
      ['big.png', 'too-large'],
      ['image.heic', 'unsupported'],
      ['empty.png', 'unsupported'],
      ['bomb.png', 'too-large'],
      ['wide.png', 'too-large'],
      ['broken.png', 'unreadable'],
    ]);
    expect(report.skipped[0].message).toBe('The file is larger than 100 MB');
    // nothing was decoded or stored for the files refused up front
    expect(fake.putAsset).toHaveBeenCalledTimes(1);
    expect(decoded).toHaveLength(1);
  });

  it('never decodes an image whose header does not state its size', async () => {
    // WebKit decodes a 16000 x 16000 CgBI PNG at full size (2 GB) before the size could be checked.
    const report = await importImagesWithReport('proj', [{ name: 'apple.png', data: cgbi(16000, 16000) }]);
    expect(report.skipped).toEqual([{ name: 'apple.png', reason: 'unreadable', message: 'The image is damaged or uses a variant Wajha cannot read' }]);
    expect(decoded).toHaveLength(0);
    expect(fake.putAsset).not.toHaveBeenCalled();
  });

  it('reads dropped files one at a time, and never reads one over the size limit', async () => {
    const log: string[] = [];
    fake.putAsset.mockImplementation(async (_p, data, ext) => {
      log.push(`store ${data.byteLength}`);
      return `${sha(data)}.${ext}`;
    });
    const a = new FakeFile('a', encodedImage(10, 10, 'image/png', '#ff0000'), log);
    const b = new FakeFile('b', encodedImage(12, 12, 'image/png', '#00ff00'), log);
    const huge = new FakeFile('huge', encodedImage(4, 4, 'image/png'), log, MAX_IMPORT_BYTES + 1);
    const video = new FakeFile('video', new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypmp42'), log, 2 * MAX_IMPORT_BYTES);
    const report = await importImagesWithReport('proj', [
      { name: 'a.png', data: a },
      { name: 'huge.png', data: huge },
      { name: 'clip.mov', data: video },
      { name: 'b.png', data: b },
    ]);
    expect(report.assets.map((x) => [x.name, x.width])).toEqual([
      ['a.png', 10],
      ['b.png', 12],
    ]);
    // Only the signature of an oversized file is looked at, so a video is "unsupported", not "too large".
    expect(report.skipped.map((x) => [x.name, x.reason])).toEqual([
      ['huge.png', 'too-large'],
      ['clip.mov', 'unsupported'],
    ]);
    expect(log).toEqual(['read a', `store ${a.size}`, 'read b', `store ${b.size}`]);
  });

  it('reports a file that cannot be read (a dropped folder)', async () => {
    class Folder extends Blob {
      override async arrayBuffer(): Promise<ArrayBuffer> {
        throw new DOMException('The requested file could not be read', 'NotReadableError');
      }
    }
    const report = await importImagesWithReport('proj', [{ name: 'Screenshots', data: new Folder() }]);
    expect(report.skipped).toEqual([{ name: 'Screenshots', reason: 'unreadable', message: 'The file could not be read' }]);
  });

  it('keeps going when storing one file fails', async () => {
    const a = encodedImage(10, 10, 'image/png', '#ff0000');
    const b = encodedImage(10, 10, 'image/png', '#00ff00');
    fake.putAsset.mockRejectedValueOnce(new PlatformError('io', 'disk full'));
    const report = await importImagesWithReport('proj', [
      { name: 'a.png', data: a },
      { name: 'b.png', data: b },
    ]);
    expect(report.skipped).toEqual([{ name: 'a.png', reason: 'failed', message: 'disk full' }]);
    expect(report.assets.map((x) => x.name)).toEqual(['b.png']);
  });

  it('processes files one at a time', async () => {
    let active = 0;
    let peak = 0;
    fake.putAsset.mockImplementation(async (_p, data, ext) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return `${sha(data)}.${ext}`;
    });
    const files = [1, 2, 3, 4].map((i) => ({ name: `${i}.png`, data: encodedImage(i, i, 'image/png') }));
    const assets = await importImages('proj', files);
    expect(assets).toHaveLength(4);
    expect(peak).toBe(1);
  });

  it('cleans file names', async () => {
    const png = encodedImage(10, 10, 'image/png');
    const long = `${'ش'.repeat(250)}.png`;
    const assets = await importImages('proj', [
      { name: 'C:\\fakepath\\shot.png', data: png },
      { name: 'folder/sub/\u202egnp.exe\u0007', data: png },
      { name: long, data: png },
      { name: '   ', data: png },
    ]);
    expect(assets.map((a) => a.name)).toEqual(['shot.png', 'gnp.exe', 'ش'.repeat(200), 'image.png']);
  });

  it('falls back to header sizes where nothing can decode', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', undefined);
    const png = encodedImage(77, 33, 'image/png');
    const [asset] = await importImages('proj', [{ name: 'a.png', data: png }]);
    expect([asset.width, asset.height]).toEqual([77, 33]);
    const report = await importImagesWithReport('proj', [{ name: 'odd.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }]);
    expect(report.skipped[0].reason).toBe('unreadable');
  });

  it('returns nothing for an empty list', async () => {
    expect(await importImages('proj', [])).toEqual([]);
  });
});

describe('pickAndImportImages', () => {
  it('reads each picked asset back to measure it', async () => {
    const png = encodedImage(90, 180, 'image/png');
    const idA = `${sha(png)}.png`;
    const idMissing = `${'e'.repeat(64)}.png`;
    fake.pickImages.mockResolvedValue([
      { assetId: idA, name: '/Users/me/Desktop/a.png', bytes: png.byteLength },
      { assetId: idMissing, name: 'gone.png', bytes: 10 },
    ]);
    fake.readAsset.mockImplementation(async (_p, id) => (id === idA ? png : null));
    const report = await pickAndImportImagesWithReport('proj');
    expect(report.assets).toEqual([{ id: idA, name: 'a.png', width: 90, height: 180, bytes: png.byteLength, addedAt: 1_700_000_000_000 }]);
    expect(report.skipped.map((s) => [s.name, s.reason])).toEqual([['gone.png', 'unreadable']]);
    expect(fake.pickImages).toHaveBeenCalledWith('proj');
    expect(fake.readAsset).toHaveBeenCalledWith('proj', idA);
    expect(decoded.every((b) => b.closed)).toBe(true);
  });

  it('refuses oversized picks and survives decode errors', async () => {
    const bomb = pngHeader(30000, 30000);
    const broken = new Uint8Array(100);
    broken.set(encodedImage(2, 2, 'image/png').subarray(0, 8));
    const lying = pngHeader(20, 20);
    fake.pickImages.mockResolvedValue([
      { assetId: 'bomb.png', name: 'bomb.png', bytes: bomb.byteLength },
      { assetId: 'broken.png', name: 'broken.png', bytes: broken.byteLength },
      { assetId: 'apple.png', name: 'apple.png', bytes: 64 },
      { assetId: 'lying.png', name: 'lying.png', bytes: lying.byteLength },
    ]);
    const stored: Record<string, Uint8Array> = { 'bomb.png': bomb, 'broken.png': broken, 'apple.png': cgbi(16000, 16000), 'lying.png': lying };
    fake.readAsset.mockImplementation(async (_p, id) => stored[id]);
    const report = await pickAndImportImagesWithReport('proj');
    expect(report.assets).toEqual([]);
    // The last one has a readable header but no pixels: only its decode fails.
    expect(report.skipped.map((s) => s.reason)).toEqual(['too-large', 'unreadable', 'unreadable', 'unreadable']);
    expect(decoded).toHaveLength(0);
  });

  it('returns [] when the user cancels and rethrows other platform errors', async () => {
    fake.pickImages.mockRejectedValueOnce(new PlatformError('cancelled', 'closed'));
    expect(await pickAndImportImages('proj')).toEqual([]);
    fake.pickImages.mockResolvedValueOnce([]);
    expect(await pickAndImportImages('proj')).toEqual([]);
    fake.pickImages.mockRejectedValueOnce(new PlatformError('permission', 'denied'));
    await expect(pickAndImportImages('proj')).rejects.toThrow('denied');
  });
});

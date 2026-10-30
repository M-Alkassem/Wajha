import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type { Ctx2D, ImageLike } from '../engine/types';
import type { Surface } from './canvas';
import {
  bytesToBlob,
  decodeImage,
  disposeImage,
  downscaleSteps,
  downscaleToSurface,
  hasImageDecoder,
  mimeForName,
  shrinkImage,
} from './decode';
import { fakeBitmap } from './fixtures.node';

/** Real canvases that remember every surface they created. */
function recordingFactory() {
  const made: Surface[] = [];
  const make = (w: number, h: number): Surface => {
    const canvas = createCanvas(w, h);
    const surface = { canvas, ctx: canvas.getContext('2d') } as unknown as Surface;
    made.push(surface);
    return surface;
  };
  return { made, make };
}

function solid(width: number, height: number, color: string): ImageLike {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas as unknown as ImageLike;
}

function pixel(ctx: Ctx2D, x: number, y: number): number[] {
  return [...ctx.getImageData(x, y, 1, 1).data];
}

/** PNG signature + an IHDR chunk declaring the size (the stubbed decoders never look at pixels). */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

const SMALL = pngHeader(320, 640);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mimeForName', () => {
  it('maps image extensions case-insensitively', () => {
    expect(mimeForName(`${'a'.repeat(64)}.png`)).toBe('image/png');
    expect(mimeForName('photo.JPG')).toBe('image/jpeg');
    expect(mimeForName('photo.jpeg')).toBe('image/jpeg');
    expect(mimeForName('x.webp')).toBe('image/webp');
    expect(mimeForName('x.heic')).toBe('application/octet-stream');
    expect(mimeForName('noext')).toBe('application/octet-stream');
  });
});

describe('bytesToBlob', () => {
  it('keeps the bytes of a subarray view and sets the type', async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const blob = bytesToBlob(backing.subarray(2, 5), 'image/png');
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('copies bytes backed by shared memory', async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(3));
    shared.set([4, 5, 6]);
    const blob = bytesToBlob(shared, 'image/jpeg');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([4, 5, 6]);
  });
});

describe('downscaleSteps', () => {
  it('draws directly when the factor is at least 0.5', () => {
    expect(downscaleSteps(1290, 2796, 646, 1400)).toEqual([{ width: 646, height: 1400 }]);
    expect(downscaleSteps(1500, 1500, 1400, 1400)).toEqual([{ width: 1400, height: 1400 }]);
    expect(downscaleSteps(2800, 1400, 1400, 700)).toEqual([{ width: 1400, height: 700 }]);
  });

  it('halves until within a factor of two, then hits the exact target', () => {
    expect(downscaleSteps(4032, 3024, 1400, 1050)).toEqual([
      { width: 2016, height: 1512 },
      { width: 1400, height: 1050 },
    ]);
    const steps = downscaleSteps(12000, 9000, 1400, 1050);
    expect(steps.at(-1)).toEqual({ width: 1400, height: 1050 });
    expect(steps.map((s) => s.width)).toEqual([6000, 3000, 1500, 1400]);
  });

  it('never returns an empty plan and never goes below the target', () => {
    expect(downscaleSteps(100, 100, 100, 100)).toEqual([{ width: 100, height: 100 }]);
    for (const s of downscaleSteps(9999, 33, 1400, 5)) {
      expect(s.width).toBeGreaterThanOrEqual(1400);
      expect(s.height).toBeGreaterThanOrEqual(5);
    }
  });

  it('is bounded for absurd inputs', () => {
    expect(downscaleSteps(Number.MAX_SAFE_INTEGER, 10, 1, 1).length).toBeLessThanOrEqual(33);
    expect(downscaleSteps(Number.POSITIVE_INFINITY, 10, 1, 1).length).toBeLessThanOrEqual(33);
  });
});

describe('downscaleToSurface', () => {
  it('draws through every pass with high-quality smoothing and frees intermediates', () => {
    const { made, make } = recordingFactory();
    const src = solid(4000, 3000, '#3366ff');
    const out = downscaleToSurface(src, 1400, 1050, make);
    expect(made.map((s) => [s.canvas.width, s.canvas.height])).toEqual([
      [0, 0], // intermediate 2000 x 1500, released
      [1400, 1050],
    ]);
    expect(out).toBe(made[1]);
    expect(out.ctx.imageSmoothingQuality).toBe('high');
    expect(pixel(out.ctx, 700, 525)).toEqual([0x33, 0x66, 0xff, 255]);
    expect(src.width).toBe(4000); // the source is not released here
  });

  it('frees what it allocated when a pass fails', () => {
    const { made, make } = recordingFactory();
    let calls = 0;
    const failing = (w: number, h: number) => {
      calls++;
      if (calls === 2) throw new Error('out of memory');
      return make(w, h);
    };
    expect(() => downscaleToSurface(solid(4000, 3000, '#000'), 1400, 1050, failing)).toThrow('out of memory');
    expect(made[0].canvas.width).toBe(0);
  });
});

describe('shrinkImage', () => {
  it('returns small images untouched', async () => {
    const img = fakeBitmap(1400, 900);
    expect(await shrinkImage(img, 1400)).toBe(img);
    expect(img.closed).toBe(false);
  });

  it('downscales large images, releases the full decode and keeps a bitmap', async () => {
    const made: ImageLike[] = [];
    vi.stubGlobal('createImageBitmap', async (source: ImageLike) => {
      const bmp = fakeBitmap(source.width, source.height, 'preview');
      made.push(bmp);
      return bmp;
    });
    const { make } = recordingFactory();
    const full = solid(2000, 4000, '#ff0000');
    const closeSpy = { closed: false };
    Object.assign(full, { close: () => (closeSpy.closed = true) });
    const preview = await shrinkImage(full, 1400, make);
    expect(closeSpy.closed).toBe(true);
    expect(preview).toBe(made[0]);
    expect([preview.width, preview.height]).toEqual([700, 1400]);
  });

  it('keeps the canvas when no bitmap can be made', async () => {
    const { make } = recordingFactory();
    const full = fakeBitmap(3000, 1000);
    // fakeBitmap cannot be drawn by a real canvas, so give the factory a drawable source instead
    const drawable = solid(3000, 1000, '#00ff00');
    Object.assign(drawable, { close: full.close });
    const preview = await shrinkImage(drawable, 1400, make);
    expect(full.closed).toBe(true);
    expect([preview.width, preview.height]).toEqual([1400, 467]);
    expect(typeof (preview as unknown as { getContext: unknown }).getContext).toBe('function');
  });

  it('ignores a non-positive limit', async () => {
    const img = fakeBitmap(5000, 5000);
    expect(await shrinkImage(img, 0)).toBe(img);
    expect(await shrinkImage(img, Number.NaN)).toBe(img);
  });
});

describe('decodeImage', () => {
  it('uses createImageBitmap with a typed blob', async () => {
    const seen: Blob[] = [];
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      seen.push(blob);
      return fakeBitmap(320, 640);
    });
    const img = await decodeImage(SMALL, 'image/png');
    expect([img.width, img.height]).toEqual([320, 640]);
    expect(seen[0].type).toBe('image/png');
    expect(seen[0].size).toBe(SMALL.length);
    expect(hasImageDecoder()).toBe(true);
  });

  it('never decodes an image over the limits or one whose header does not state its size', async () => {
    const decode = vi.fn(async () => fakeBitmap(1, 1));
    vi.stubGlobal('createImageBitmap', decode);
    // A CgBI chunk where IHDR must be first: WebKit would decode this Apple PNG variant at any size.
    const cgbi = pngHeader(16000, 16000);
    cgbi.set([0, 0, 0, 4, 0x43, 0x67, 0x42, 0x49], 8);
    for (const bytes of [pngHeader(50000, 50000), pngHeader(16385, 1), pngHeader(9000, 9000), cgbi, new Uint8Array([1, 2, 3])]) {
      await expect(decodeImage(bytes, 'image/png')).rejects.toThrow('larger than supported or damaged');
    }
    expect(decode).not.toHaveBeenCalled();
    await expect(decodeImage(pngHeader(16384, 4096), 'image/png')).resolves.toBeDefined();
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('falls back to an <img> element and always revokes the object URL', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('unsupported');
    });
    class FakeImage extends EventTarget {
      decoding = '';
      src = '';
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      get width() {
        return this.naturalWidth;
      }
      get height() {
        return this.naturalHeight;
      }
      async decode() {
        if (this.src === 'blob:bad') {
          this.complete = true; // broken images are "complete" with no pixels
          throw new Error('broken');
        }
        if (this.src === 'blob:flaky') {
          // decode() gives up, but the load event arrives a little later
          setTimeout(() => {
            this.naturalWidth = 300;
            this.naturalHeight = 200;
            this.complete = true;
            this.dispatchEvent(new Event('load'));
          }, 1);
          throw new Error('EncodingError');
        }
        this.naturalWidth = 800;
        this.naturalHeight = 600;
        this.complete = true;
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:good')
      .mockReturnValueOnce('blob:bad')
      .mockReturnValueOnce('blob:flaky');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const img = await decodeImage(SMALL, 'image/webp');
    expect([img.width, img.height]).toEqual([800, 600]);
    await expect(decodeImage(SMALL, 'image/webp')).rejects.toThrow('broken');
    const flaky = await decodeImage(SMALL, 'image/webp');
    expect([flaky.width, flaky.height]).toEqual([300, 200]);
    expect(create).toHaveBeenCalledTimes(3);
    expect(revoke.mock.calls).toEqual([['blob:good'], ['blob:bad'], ['blob:flaky']]);
  });

  it('rejects empty bitmaps and reports the bitmap error without other decoders', async () => {
    const empty = fakeBitmap(0, 0);
    vi.stubGlobal('createImageBitmap', async () => empty);
    vi.stubGlobal('Image', undefined);
    await expect(decodeImage(SMALL, 'image/png')).rejects.toThrow('no pixels');
    expect(empty.closed).toBe(true);
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('bad data');
    });
    await expect(decodeImage(SMALL, 'image/png')).rejects.toThrow('bad data');
  });

  it('rejects when no decoder exists at all', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', undefined);
    expect(hasImageDecoder()).toBe(false);
    await expect(decodeImage(SMALL, 'image/png')).rejects.toThrow('No image decoder');
  });
});

describe('disposeImage', () => {
  it('closes bitmaps, empties canvases and ignores the rest', () => {
    const bmp = fakeBitmap(10, 10);
    disposeImage(bmp);
    expect(bmp.closed).toBe(true);
    const canvas = solid(50, 50, '#000');
    disposeImage(canvas);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    const element = { width: 5, height: 5 } as unknown as ImageLike;
    expect(() => disposeImage(element)).not.toThrow();
    const throwing = {
      width: 1,
      height: 1,
      close() {
        throw new Error('already closed');
      },
    } as unknown as ImageLike;
    expect(() => disposeImage(throwing)).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type { Ctx2D } from '../engine/types';
import { canvasSide, canvasToBytes, isCanvas, releaseCanvas, resetSurface, roundRectPath, type AnyCanvas, type Surface } from './canvas';

function napiSurface(w: number, h: number): Surface {
  const canvas = createCanvas(w, h);
  return { canvas: canvas as unknown as AnyCanvas, ctx: canvas.getContext('2d') as unknown as Ctx2D };
}

const px = (ctx: Ctx2D, x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];

describe('canvasSide', () => {
  it('rounds and clamps to 1..16384', () => {
    expect(canvasSide(10.5)).toBe(11);
    expect(canvasSide(0)).toBe(1);
    expect(canvasSide(-3)).toBe(1);
    expect(canvasSide(Number.NaN)).toBe(1);
    expect(canvasSide(Number.POSITIVE_INFINITY)).toBe(1);
    expect(canvasSide(1e9)).toBe(16384);
  });
});

describe('resetSurface', () => {
  it('clears pixels and state through width re-assignment when ctx.reset is missing', () => {
    const s = napiSurface(10, 10);
    Object.defineProperty(s.ctx, 'reset', { value: undefined });
    s.ctx.fillStyle = '#ff0000';
    s.ctx.fillRect(0, 0, 10, 10);
    s.ctx.translate(3, 3);
    s.ctx.globalAlpha = 0.5;
    resetSurface(s);
    expect(px(s.ctx, 5, 5)).toEqual([0, 0, 0, 0]);
    expect(s.ctx.getTransform().e).toBe(0);
    expect(s.ctx.globalAlpha).toBe(1);
    expect([s.canvas.width, s.canvas.height]).toEqual([10, 10]);
  });

  it('uses ctx.reset when available', () => {
    const s = napiSurface(4, 4);
    s.ctx.fillRect(0, 0, 4, 4);
    resetSurface(s);
    expect(px(s.ctx, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('releaseCanvas and isCanvas', () => {
  it('empties canvases and tolerates ones that refuse', () => {
    const s = napiSurface(8, 8);
    releaseCanvas(s.canvas);
    expect([s.canvas.width, s.canvas.height]).toEqual([0, 0]);
    const frozen = Object.freeze({ width: 5, height: 5, getContext: () => null });
    expect(() => releaseCanvas(frozen as unknown as AnyCanvas)).not.toThrow();
    expect(isCanvas(s.canvas)).toBe(true);
    expect(isCanvas({ width: 1, height: 1 })).toBe(false);
    expect(isCanvas(null)).toBe(false);
  });
});

describe('canvasToBytes', () => {
  it('uses convertToBlob on OffscreenCanvas-like canvases', async () => {
    const s = napiSurface(6, 6);
    s.ctx.fillStyle = '#00ff00';
    s.ctx.fillRect(0, 0, 6, 6);
    const bytes = await canvasToBytes(s.canvas, 'image/jpeg', 0.8);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const png = await canvasToBytes(s.canvas, 'image/png');
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it('uses toBlob on DOM canvases and rejects when encoding fails', async () => {
    const calls: unknown[][] = [];
    const element = {
      width: 1,
      height: 1,
      getContext: () => null,
      toBlob(cb: (b: Blob | null) => void, type: string, quality: number) {
        calls.push([type, quality]);
        cb(type === 'image/jpeg' ? new Blob([new Uint8Array([1, 2, 3])]) : null);
      },
    } as unknown as AnyCanvas;
    expect([...(await canvasToBytes(element, 'image/jpeg', 0.5))]).toEqual([1, 2, 3]);
    expect(calls).toEqual([['image/jpeg', 0.5]]);
    await expect(canvasToBytes(element, 'image/png')).rejects.toThrow('could not be encoded');
  });
});

describe('canvasToBytes while the page unloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A fresh canvas module in a page (`win`) that can go through beforeunload, pagehide and pageshow. */
  async function inPage() {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    vi.resetModules();
    return { win, mod: await import('./canvas') };
  }

  /** An OffscreenCanvas-like canvas whose encoded blob is read by `read`. */
  function encoder(read: () => Promise<ArrayBuffer>) {
    const blob = { arrayBuffer: vi.fn(read) };
    const canvas = { width: 1, height: 1, getContext: () => null, convertToBlob: vi.fn(async () => blob) } as unknown as AnyCanvas;
    return { canvas, blob };
  }
  const bytes = async () => new Uint8Array([7, 8]).buffer;

  it('does not read the bytes back once a navigation away goes ahead', async () => {
    const { win, mod } = await inPage();
    const { canvas, blob } = encoder(bytes);
    expect([...(await mod.canvasToBytes(canvas, 'image/jpeg'))]).toEqual([7, 8]);
    expect(mod.pageIsUnloading()).toBe(false);

    win.dispatchEvent(new Event('beforeunload'));
    expect(mod.pageIsUnloading()).toBe(true);
    // WebKit would refuse the read and report it as a page error: it is never started.
    await expect(mod.canvasToBytes(canvas, 'image/jpeg')).rejects.toBeInstanceOf(mod.PageUnloadingError);
    win.dispatchEvent(new Event('pagehide'));
    await expect(mod.canvasToBytes(canvas, 'image/png')).rejects.toThrow('The page is unloading');
    expect(blob.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('reads again when the page is back in use', async () => {
    const { win, mod } = await inPage();
    const { canvas } = encoder(bytes);
    // Restored from the back-forward cache.
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('pageshow'));
    expect([...(await mod.canvasToBytes(canvas, 'image/jpeg'))]).toEqual([7, 8]);
    // A navigation that did not happen (stopped, or a download): the user carries on.
    for (const input of ['pointerdown', 'keydown']) {
      win.dispatchEvent(new Event('beforeunload'));
      await expect(mod.canvasToBytes(canvas, 'image/jpeg')).rejects.toBeInstanceOf(mod.PageUnloadingError);
      win.dispatchEvent(new Event(input));
      expect(mod.pageIsUnloading()).toBe(false);
      expect([...(await mod.canvasToBytes(canvas, 'image/jpeg'))]).toEqual([7, 8]);
    }
  });

  it('tells a read cut short by unloading from a real failure', async () => {
    const { win, mod } = await inPage();
    const refused = new DOMException('The I/O read operation failed.', 'NotReadableError');
    const cut = encoder(async () => {
      win.dispatchEvent(new Event('beforeunload'));
      throw refused;
    });
    const err = await mod.canvasToBytes(cut.canvas, 'image/jpeg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(mod.PageUnloadingError);
    expect((err as Error).cause).toBe(refused);

    win.dispatchEvent(new Event('pageshow'));
    const broken = encoder(async () => {
      throw refused;
    });
    await expect(mod.canvasToBytes(broken.canvas, 'image/jpeg')).rejects.toBe(refused);
  });
});

describe('roundRectPath', () => {
  it('draws rounded corners with arcTo when roundRect is missing', () => {
    const s = napiSurface(40, 40);
    Object.defineProperty(s.ctx, 'roundRect', { value: undefined });
    s.ctx.fillStyle = '#0000ff';
    roundRectPath(s.ctx, 0, 0, 40, 40, 12);
    s.ctx.fill();
    expect(px(s.ctx, 1, 1)[3]).toBe(0); // outside the corner arc
    expect(px(s.ctx, 20, 20)).toEqual([0, 0, 255, 255]);
    expect(px(s.ctx, 20, 1)).toEqual([0, 0, 255, 255]); // straight edge
  });

  it('clamps the radius to half the smaller side and ignores NaN', () => {
    const s = napiSurface(20, 10);
    s.ctx.fillStyle = '#ff00ff';
    roundRectPath(s.ctx, 0, 0, 20, 10, 999);
    s.ctx.fill();
    expect(px(s.ctx, 10, 5)[3]).toBe(255);
    const t = napiSurface(10, 10);
    roundRectPath(t.ctx, 0, 0, 10, 10, Number.NaN);
    t.ctx.fill();
    expect(px(t.ctx, 0, 0)[3]).toBe(255); // square corners
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserEnv } from './env';
import { NodeOffscreenCanvas, flushPromises } from './fixtures.node';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserEnv', () => {
  it('is a shared env that creates OffscreenCanvas scratch canvases', () => {
    vi.stubGlobal('OffscreenCanvas', NodeOffscreenCanvas);
    const env = browserEnv();
    expect(browserEnv()).toBe(env);
    const { canvas, ctx } = env.createCanvas(40, 30);
    expect([canvas.width, canvas.height]).toEqual([40, 30]);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 40, 30);
    expect([...ctx.getImageData(5, 5, 1, 1).data]).toEqual([255, 0, 0, 255]);
  });

  it('never hands out a canvas the engine may still be caching', async () => {
    vi.stubGlobal('OffscreenCanvas', NodeOffscreenCanvas);
    const env = browserEnv();
    const tile = env.createCanvas(8, 8);
    tile.ctx.fillStyle = '#00ff00';
    tile.ctx.fillRect(0, 0, 8, 8);
    await flushPromises(); // a frame boundary
    const next = env.createCanvas(8, 8);
    expect(next.canvas).not.toBe(tile.canvas);
    expect([...tile.ctx.getImageData(1, 1, 1, 1).data]).toEqual([0, 255, 0, 255]);
  });

  it('rounds and clamps requested sizes', () => {
    vi.stubGlobal('OffscreenCanvas', NodeOffscreenCanvas);
    const env = browserEnv();
    const a = env.createCanvas(10.4, 0);
    expect([a.canvas.width, a.canvas.height]).toEqual([10, 1]);
    const b = env.createCanvas(Number.NaN, 99999);
    expect([b.canvas.width, b.canvas.height]).toEqual([1, 16384]);
  });

  it('falls back to a DOM canvas when OffscreenCanvas has no 2D context', () => {
    class NoContextOffscreen {
      getContext() {
        return null;
      }
    }
    const domCanvas = new NodeOffscreenCanvas(1, 1) as unknown as { width: number; height: number };
    const createElement = vi.fn(() => domCanvas);
    vi.stubGlobal('OffscreenCanvas', NoContextOffscreen);
    vi.stubGlobal('document', { createElement });
    const { canvas } = browserEnv().createCanvas(20, 10);
    expect(createElement).toHaveBeenCalledWith('canvas');
    expect(canvas).toBe(domCanvas);
    expect([canvas.width, canvas.height]).toEqual([20, 10]);
  });

  it('throws when no canvas is available at all', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(() => browserEnv().createCanvas(10, 10)).toThrow(/Could not create a 10 x 10 canvas/);
  });
});

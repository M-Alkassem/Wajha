import { describe, expect, it } from 'vitest';
import type { Fill } from '../model/types';
import { boxesForGauss, fillColor, gaussianBlur, gradientStops, isPaintable, NEUTRAL_FILL, paintFill, processedImage, TILE_FRACTION, type PaintContext } from './paint';
import { nodeEnv, pixel, solidImage, testCanvas } from './testing/canvas.node';
import { parseColor } from './color';
import type { ImageLike } from './types';

const W = 200;
const H = 100;
const box = { x: 0, y: 0, w: W, h: H };

function paint(fill: Fill, images: Record<string, ImageLike> = {}, size = { w: W, h: H }) {
  const { ctx, canvas } = testCanvas(size.w, size.h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.w, size.h);
  const pc: PaintContext = { env: nodeEnv, u: Math.min(size.w, size.h), getImage: (id) => images[id] ?? null };
  paintFill(ctx, fill, { x: 0, y: 0, w: size.w, h: size.h }, pc);
  return { ctx, canvas };
}

const near = (a: number[], b: number[], tol = 6) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const rgb = (hex: string) => {
  const c = parseColor(hex);
  return [c.r, c.g, c.b];
};

describe('gradient stops', () => {
  it('sorts, clamps and validates', () => {
    const s = gradientStops([
      { offset: 1.5, color: '#0000ff' },
      { offset: -1, color: '#ff0000' },
      { offset: NaN, color: 'nope' },
      null,
    ]);
    expect(s.map((x) => x.offset)).toEqual([0, 0, 1]);
    expect(s[0].color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(s[1].color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(gradientStops('nope')).toEqual([]);
  });

  it('gives transparent stops their neighbours colour (premultiplied look)', () => {
    const s = gradientStops([
      { offset: 0, color: '#ff0000' },
      { offset: 0.5, color: '#00000000' },
      { offset: 1, color: '#0000ff' },
    ]);
    expect(s).toHaveLength(4);
    expect(s[1].color).toEqual({ r: 255, g: 0, b: 0, a: 0 });
    expect(s[2].color).toEqual({ r: 0, g: 0, b: 255, a: 0 });
  });

  it('reports paintability and representative colours', () => {
    expect(isPaintable({ type: 'linear', angle: 0, stops: [] })).toBe(false);
    expect(isPaintable({ type: 'mesh', base: '#000', points: [] })).toBe(true);
    expect(isPaintable({ type: 'bogus' } as unknown as Fill)).toBe(false);
    expect(fillColor({ type: 'solid', color: '#123456' })).toBe('#123456');
    expect(fillColor({ type: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000' }] })).toBe('rgba(255, 0, 0, 1)');
  });
});

describe('solid and linear fills', () => {
  it('paints solid colours', () => {
    const { ctx } = paint({ type: 'solid', color: '#3366ff' });
    expect(pixel(ctx, 100, 50)).toEqual([0x33, 0x66, 0xff, 255]);
  });

  it('linear 90deg goes left to right', () => {
    const { ctx } = paint({ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] });
    expect(near(pixel(ctx, 0, 50), rgb('#ff0000'), 4)).toBe(true);
    expect(near(pixel(ctx, W - 1, 50), rgb('#0000ff'), 4)).toBe(true);
    expect(near(pixel(ctx, 100, 0), pixel(ctx, 100, 99))).toBe(true);
  });

  it('linear 0deg goes bottom to top', () => {
    const { ctx } = paint({ type: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] });
    expect(near(pixel(ctx, 100, H - 1), rgb('#ff0000'), 6)).toBe(true);
    expect(near(pixel(ctx, 100, 0), rgb('#0000ff'), 6)).toBe(true);
  });

  it('linear 45deg reaches the end colours exactly in the corners (CSS length)', () => {
    const { ctx } = paint({ type: 'linear', angle: 45, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] });
    expect(pixel(ctx, 0, H - 1)[0]).toBeLessThan(6);
    expect(pixel(ctx, W - 1, 0)[0]).toBeGreaterThan(249);
  });

  it('keeps red when fading to transparent (no grey band)', () => {
    const { ctx } = paint({ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#ff000000' }] });
    const mid = pixel(ctx, 100, 50);
    expect(mid[0]).toBeGreaterThan(245);
    expect(mid[1]).toBeGreaterThan(100);
    const toBlack = paint({ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#00000000' }] });
    expect(pixel(toBlack.ctx, 100, 50)[0]).toBeGreaterThan(245);
  });

  it('degenerates gracefully', () => {
    const one = paint({ type: 'linear', angle: 30, stops: [{ offset: 0.3, color: '#00ff00' }] });
    expect(pixel(one.ctx, 10, 10)).toEqual([0, 255, 0, 255]);
    const none = paint({ type: 'linear', angle: 30, stops: [] });
    expect(pixel(none.ctx, 10, 10)).toEqual([255, 255, 255, 255]);
    const nan = paint({ type: 'linear', angle: NaN, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] });
    expect(near(pixel(nan.ctx, 100, 0), rgb('#ff0000'), 8)).toBe(true); // NaN angle = 180deg
  });
});

describe('radial fill', () => {
  it('is centred on cx/cy with radius relative to the longer side', () => {
    const { ctx } = paint({ type: 'radial', cx: 0.25, cy: 0.5, radius: 0.25, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] });
    expect(pixel(ctx, 50, 50)[0]).toBeGreaterThan(245);
    // 50px from the centre = the radius (0.25 x 200): last stop.
    expect(pixel(ctx, 100, 50)[0]).toBeLessThan(10);
    expect(pixel(ctx, 199, 50)[0]).toBeLessThan(10);
  });

  it('shows the last colour for a zero radius', () => {
    const { ctx } = paint({ type: 'radial', cx: 0.5, cy: 0.5, radius: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#00ff00' }] });
    expect(pixel(ctx, 100, 50)).toEqual([0, 255, 0, 255]);
  });
});

describe('mesh fill', () => {
  const mesh: Fill = { type: 'mesh', base: '#101030', points: [{ x: 0.25, y: 0.5, color: '#ff4080', radius: 0.3 }] };

  it('paints the base with soft blobs on top', () => {
    const { ctx } = paint(mesh);
    expect(near(pixel(ctx, 50, 50), rgb('#ff4080'), 6)).toBe(true);
    expect(near(pixel(ctx, 199, 99), rgb('#101030'), 2)).toBe(true);
  });

  it('falls off smoothly and monotonically (no rim, no banding steps)', () => {
    const { ctx } = paint(mesh);
    let prev = 256;
    let maxJump = 0;
    for (let x = 50; x <= 115; x++) {
      const r = pixel(ctx, x, 50)[0];
      expect(r).toBeLessThanOrEqual(prev + 1);
      if (prev <= 255) maxJump = Math.max(maxJump, prev - r);
      prev = r;
    }
    expect(maxJump).toBeLessThan(12);
    expect(pixel(ctx, 111, 50)[0]).toBeLessThan(0x10 + 8);
  });

  it('ignores invalid points', () => {
    const bad: Fill = { type: 'mesh', base: '#000000', points: [null, { x: NaN, y: 0.5, color: '#fff', radius: 0.2 }, { x: 0.5, y: 0.5, color: '#fff', radius: -1 }] as unknown as never[] };
    expect(() => paint(bad)).not.toThrow();
  });
});

describe('image fill', () => {
  const id = `${'b'.repeat(64)}.png`;
  const img = solidImage(100, 100, '#00ff00', '#ff0000'); // red marker in the top-left 20x20

  it('covers the box (centred crop)', () => {
    const { ctx } = paint({ type: 'image', assetId: id, fit: 'cover', opacity: 1, blur: 0, tint: null }, { [id]: img });
    // Scaled 2x to 200x200, cropped vertically by 50: the marker spans x 0..40, y 0..(40-50) -> hidden.
    expect(near(pixel(ctx, 10, 2), rgb('#00ff00'))).toBe(true);
    expect(near(pixel(ctx, 190, 90), rgb('#00ff00'))).toBe(true);
  });

  it('contains the image with white bars', () => {
    const { ctx } = paint({ type: 'image', assetId: id, fit: 'contain', opacity: 1, blur: 0, tint: null }, { [id]: img });
    expect(pixel(ctx, 20, 50)).toEqual([255, 255, 255, 255]);
    expect(near(pixel(ctx, 55, 5), rgb('#ff0000'))).toBe(true);
    expect(near(pixel(ctx, 140, 80), rgb('#00ff00'))).toBe(true);
  });

  it('tiles every u / 4', () => {
    const { ctx } = paint({ type: 'image', assetId: id, fit: 'tile', opacity: 1, blur: 0, tint: null }, { [id]: img });
    const tile = TILE_FRACTION * 100; // u = 100 -> 25px tiles, marker 5px
    expect(near(pixel(ctx, 2, 2), rgb('#ff0000'), 30)).toBe(true);
    expect(near(pixel(ctx, tile + 2, 2), rgb('#ff0000'), 30)).toBe(true);
    expect(near(pixel(ctx, tile * 3 + 2, tile + 2), rgb('#ff0000'), 30)).toBe(true);
    expect(near(pixel(ctx, tile / 2, tile / 2), rgb('#00ff00'), 30)).toBe(true);
  });

  it('applies opacity and tint', () => {
    const { ctx } = paint({ type: 'image', assetId: id, fit: 'cover', opacity: 0.5, blur: 0, tint: '#0000ff80' }, { [id]: img });
    const p = pixel(ctx, 150, 50);
    // green at 50% over white, then 50% blue on top
    expect(p[0]).toBeGreaterThan(55);
    expect(p[0]).toBeLessThan(75);
    expect(p[2]).toBeGreaterThan(120);
  });

  it('blurs edges softly without darkening the borders', () => {
    const sharp = paint({ type: 'image', assetId: id, fit: 'contain', opacity: 1, blur: 0, tint: null }, { [id]: img });
    const soft = paint({ type: 'image', assetId: id, fit: 'contain', opacity: 1, blur: 0.1, tint: null }, { [id]: img });
    // Marker edge at x = 70 (50 + 20): sharp is a step, blurred is a ramp.
    expect(sharp.ctx.getImageData(66, 10, 1, 1).data[0]).toBeGreaterThan(240);
    const ramp = [62, 66, 70, 74, 78].map((x) => pixel(soft.ctx, x, 10)[0]);
    expect(ramp[0]).toBeGreaterThan(ramp[4]);
    expect(ramp[2]).toBeGreaterThan(20);
    expect(ramp[2]).toBeLessThan(235);
    // Edge replication: the image border stays green, it does not fade to transparent/white.
    expect(near(pixel(soft.ctx, 147, 95), rgb('#00ff00'), 20)).toBe(true);
  });

  it('shows a neutral fill while the image is missing', () => {
    const { ctx } = paint({ type: 'image', assetId: id, fit: 'cover', opacity: 1, blur: 0, tint: null });
    expect(near(pixel(ctx, 50, 50), rgb(NEUTRAL_FILL), 1)).toBe(true);
  });
});

describe('blur helpers', () => {
  it('chooses box sizes that approximate the Gaussian variance', () => {
    // Three boxes cannot match tiny sigmas well; the painter works at sigma ~2.5 and above.
    for (const sigma of [2, 2.5, 5, 10]) {
      const sizes = boxesForGauss(sigma);
      expect(sizes).toHaveLength(3);
      const variance = sizes.reduce((s, w) => s + (w * w - 1) / 12, 0);
      expect(Math.abs(Math.sqrt(variance) - sigma) / sigma).toBeLessThan(0.15);
      for (const w of sizes) expect(w % 2).toBe(1);
    }
  });

  it('spreads a point and conserves energy, seamlessly with wrap', () => {
    const w = 21;
    const h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w; i++) data[i * 4 + 3] = 255; // opaque black line
    data[0] = 255; // a red pixel at x = 0
    gaussianBlur(data, w, h, 2, true);
    expect(data[0]).toBeLessThan(255);
    expect(data[0]).toBeGreaterThan(0);
    // Wrapped: the right end receives the same energy as x = 1.
    expect(Math.abs(data[(w - 1) * 4] - data[4])).toBeLessThanOrEqual(1);
    let sum = 0;
    for (let i = 0; i < w; i++) sum += data[i * 4];
    expect(Math.abs(sum - 255)).toBeLessThan(12);
  });

  it('caches processed images and returns null for impossible sizes', () => {
    const img = solidImage(40, 40, '#123456');
    const a = processedImage(img, 30, 30, 4, false, nodeEnv);
    expect(a).not.toBeNull();
    expect(processedImage(img, 30, 30, 4, false, nodeEnv)).toBe(a);
    expect(processedImage(img, 0, 30, 4, false, nodeEnv)).toBeNull();
    expect(processedImage(img, NaN, 30, 4, false, nodeEnv)).toBeNull();
  });
});

describe('robustness', () => {
  it('ignores unknown fills and empty areas', () => {
    expect(() => paint({ type: 'plaid' } as unknown as Fill)).not.toThrow();
    const { ctx } = testCanvas(10, 10);
    const pc: PaintContext = { env: nodeEnv, u: 10, getImage: () => null };
    expect(() => paintFill(ctx, null, box, pc)).not.toThrow();
    expect(() => paintFill(ctx, { type: 'solid', color: '#000' }, box, pc, { x: 0, y: 0, w: 0, h: 10 })).not.toThrow();
    const throwing: PaintContext = {
      env: nodeEnv,
      u: 10,
      getImage: () => {
        throw new Error('boom');
      },
    };
    expect(() => paintFill(ctx, { type: 'image', assetId: 'x', fit: 'cover', opacity: 1, blur: 0, tint: null }, box, throwing)).not.toThrow();
  });
});

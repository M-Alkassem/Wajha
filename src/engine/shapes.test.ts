import { describe, expect, it } from 'vitest';
import type { Fill, ShapeElement } from '../model/types';
import { blobOutline, drawShape, shapeSize } from './shapes';
import type { PaintContext } from './paint';
import { shapeEl } from './testing/fixtures';
import { nodeEnv, pixel, testCanvas } from './testing/canvas.node';
import type { Ctx2D } from './types';

const S = 200;
const U = 200;
const pc: PaintContext = { env: nodeEnv, u: U, getImage: () => null };

function draw(el: ShapeElement, size = S): Ctx2D {
  const { ctx } = testCanvas(size, size);
  ctx.translate(size / 2, size / 2);
  drawShape(ctx, el, U, pc);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

const a = (ctx: Ctx2D, x: number, y: number) => pixel(ctx, x, y)[3];

function inkBox(ctx: Ctx2D, size = S) {
  const d = ctx.getImageData(0, 0, size, size).data;
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (d[(y * size + x) * 4 + 3] > 127) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

describe('shape geometry', () => {
  it('sizes shapes in u and never goes negative', () => {
    expect(shapeSize(shapeEl({ width: 0.5, height: 0.25 }), 200)).toEqual({ w: 100, h: 50 });
    expect(shapeSize(shapeEl({ width: -1, height: NaN }), 200)).toEqual({ w: 0, h: 0 });
  });

  it('draws circles as ellipses filling the box', () => {
    const ctx = draw(shapeEl({ shape: 'circle', width: 0.6, height: 0.3 }));
    expect(a(ctx, 100, 100)).toBe(255);
    expect(a(ctx, 100 + 55, 100)).toBe(255);
    expect(a(ctx, 100, 100 + 35)).toBe(0);
    expect(a(ctx, 100 + 58, 100 + 28)).toBe(0); // box corner region
    const b = inkBox(ctx);
    expect(b.maxX - b.minX + 1).toBeGreaterThanOrEqual(118);
    expect(b.maxY - b.minY + 1).toBeGreaterThanOrEqual(58);
  });

  it('rounds rect corners by radius x min(w, h), clamped to a pill', () => {
    const square = draw(shapeEl({ shape: 'rect', width: 0.6, height: 0.4, radius: 0 }));
    expect(a(square, 100 - 59, 100 - 39)).toBe(255);
    const rounded = draw(shapeEl({ shape: 'rect', width: 0.6, height: 0.4, radius: 0.25 })); // r = 20
    expect(a(rounded, 100 - 59, 100 - 39)).toBe(0);
    expect(a(rounded, 100, 100 - 39)).toBe(255);
    const pill = draw(shapeEl({ shape: 'rect', width: 0.6, height: 0.4, radius: 9 }));
    expect(a(pill, 100 - 50, 100 - 30)).toBe(0); // inside the r = 40 corner arc
    expect(a(pill, 100, 100 - 39)).toBe(255);
  });

  it('draws rings with a transparent hole', () => {
    const ctx = draw(shapeEl({ shape: 'ring', width: 0.6, height: 0.6, stroke: 0.05 })); // 10px ring
    expect(a(ctx, 100, 100)).toBe(0);
    expect(a(ctx, 100 + 55, 100)).toBe(255);
    expect(a(ctx, 100 + 45, 100)).toBe(0);
    expect(inkBox(draw(shapeEl({ shape: 'ring', stroke: 0 }))).maxX).toBe(-1);
    // A stroke thicker than the radius gives a full disc.
    expect(a(draw(shapeEl({ shape: 'ring', width: 0.4, height: 0.4, stroke: 1 })), 100, 100)).toBe(255);
  });

  it('makes deterministic blobs that exactly fill their box', () => {
    expect(blobOutline(7)).toBe(blobOutline(7));
    expect(Array.from(blobOutline(7))).not.toEqual(Array.from(blobOutline(8)));
    for (const seed of [1, 2, 3, 42, -5, 1e9]) {
      const b = inkBox(draw(shapeEl({ shape: 'blob', width: 0.7, height: 0.5, seed })));
      expect(Math.abs(b.maxX - b.minX + 1 - 140)).toBeLessThanOrEqual(3);
      expect(Math.abs(b.maxY - b.minY + 1 - 100)).toBeLessThanOrEqual(3);
      expect(a(draw(shapeEl({ shape: 'blob', width: 0.7, height: 0.5, seed })), 100, 100)).toBe(255);
    }
    expect(blobOutline(NaN)).toBe(blobOutline(0));
  });

  it('fills shapes with gradients laid out over the shape box', () => {
    const fill: Fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const ctx = draw(shapeEl({ shape: 'rect', width: 0.5, height: 0.5, fill }));
    expect(pixel(ctx, 51, 100)[0]).toBeGreaterThan(240);
    expect(pixel(ctx, 148, 100)[2]).toBeGreaterThan(240);
  });

  it('clips mesh fills to the outline', () => {
    const fill: Fill = { type: 'mesh', base: '#00ff00', points: [{ x: 0.5, y: 0.5, color: '#ff0000', radius: 0.3 }] };
    const ctx = draw(shapeEl({ shape: 'circle', width: 0.5, height: 0.5, fill }));
    expect(pixel(ctx, 100, 100)[0]).toBeGreaterThan(240);
    expect(a(ctx, 100 + 49, 100 + 49)).toBe(0);
    expect(pixel(ctx, 100 + 45, 100)[1]).toBeGreaterThan(150);
  });
});

describe('glow (blur)', () => {
  it('blurs a solid shape softly beyond its edge', () => {
    const sharp = draw(shapeEl({ shape: 'circle', width: 0.4, height: 0.4, fill: { type: 'solid', color: '#ff0000' } }));
    const soft = draw(shapeEl({ shape: 'circle', width: 0.4, height: 0.4, blur: 0.08, fill: { type: 'solid', color: '#ff0000' } }));
    expect(a(sharp, 100 + 48, 100)).toBe(0);
    const outside = a(soft, 100 + 48, 100);
    expect(outside).toBeGreaterThan(10);
    expect(outside).toBeLessThan(200);
    expect(a(soft, 100, 100)).toBeGreaterThan(230);
    expect(pixel(soft, 100, 100)[0]).toBeGreaterThan(240);
    expect(a(soft, 2, 2)).toBe(0);
    // Edge sits at roughly half intensity, like a Gaussian-blurred step.
    const edge = a(soft, 100 + 40, 100);
    expect(edge).toBeGreaterThan(90);
    expect(edge).toBeLessThan(170);
  });

  it('respects the alpha of the fill colour once', () => {
    const soft = draw(shapeEl({ shape: 'circle', width: 0.6, height: 0.6, blur: 0.02, fill: { type: 'solid', color: '#ff000080' } }));
    const centre = a(soft, 100, 100);
    expect(centre).toBeGreaterThan(115);
    expect(centre).toBeLessThan(140);
  });

  it('keeps gradient colours in a blurred shape', () => {
    const fill: Fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const ctx = draw(shapeEl({ shape: 'rect', width: 0.6, height: 0.6, blur: 0.05, fill }));
    const left = pixel(ctx, 100 - 40, 100);
    const right = pixel(ctx, 100 + 40, 100);
    expect(left[0]).toBeGreaterThan(left[2]);
    expect(right[2]).toBeGreaterThan(right[0]);
    expect(a(ctx, 100 + 66, 100)).toBeGreaterThan(0);
    expect(a(ctx, 100 + 66, 100)).toBeLessThan(160);
  });

  it('reuses cached glows across frames', () => {
    const el = shapeEl({ shape: 'blob', width: 0.5, height: 0.5, blur: 0.06, seed: 3, fill: { type: 'solid', color: '#00aaff' } });
    const first = draw(el).getImageData(0, 0, S, S).data;
    const second = draw(el).getImageData(0, 0, S, S).data;
    expect(second).toEqual(first);
  });
});

describe('robustness', () => {
  it('draws nothing for unknown shapes, unpaintable fills and tiny sizes', () => {
    for (const el of [
      shapeEl({ shape: 'star' as ShapeElement['shape'] }),
      shapeEl({ fill: { type: 'linear', angle: 0, stops: [] } }),
      shapeEl({ fill: { type: 'weird' } as unknown as Fill }),
      shapeEl({ width: 0.001, height: 0.001 }),
      shapeEl({ width: NaN }),
      shapeEl({ blur: NaN }),
    ]) {
      expect(() => draw(el)).not.toThrow();
    }
    expect(inkBox(draw(shapeEl({ shape: 'star' as ShapeElement['shape'] }))).maxX).toBe(-1);
    expect(() => draw(shapeEl({ blur: 1e9 }))).not.toThrow();
  });
});

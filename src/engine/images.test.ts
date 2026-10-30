import { describe, expect, it } from 'vitest';
import { drawImageElement, MISSING_IMAGE_FILL, resolveImage, type ImageSources } from './images';
import { imageEl } from './testing/fixtures';
import { pixel, solidImage, testCanvas } from './testing/canvas.node';
import type { ImageLike } from './types';
import type { ImageElement } from '../model/types';

const ID = `${'c'.repeat(64)}.png`;

function sources(img: ImageLike | null, aspect: number | null = null): ImageSources {
  return { getImage: (id) => (id === ID ? img : null), getAssetAspect: (id) => (id === ID ? aspect : null) };
}

function draw(el: ImageElement, src: ImageSources, size = 200) {
  const { ctx } = testCanvas(size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  const out = drawImageElement(ctx, el, 200, 1, src);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { ctx, out };
}

describe('resolveImage', () => {
  it('prefers the asset aspect, then the decoded size, then 1', () => {
    const img = solidImage(100, 50, '#000');
    expect(resolveImage(imageEl({ assetId: ID }), sources(img, 2)).aspect).toBe(2);
    expect(resolveImage(imageEl({ assetId: ID }), sources(img, null)).aspect).toBe(0.5);
    expect(resolveImage(imageEl({ assetId: ID }), sources(null, null)).aspect).toBe(1);
    expect(resolveImage(imageEl({ assetId: ID }), sources(null, NaN)).aspect).toBe(1);
    const throwing: ImageSources = {
      getImage: () => {
        throw new Error('x');
      },
      getAssetAspect: () => {
        throw new Error('y');
      },
    };
    expect(resolveImage(imageEl({ assetId: ID }), throwing)).toEqual({ image: null, aspect: 1 });
  });
});

describe('drawImageElement', () => {
  it('draws the image width x u wide with its aspect', () => {
    const img = solidImage(100, 50, '#00ff00');
    const { ctx, out } = draw(imageEl({ assetId: ID, width: 0.5 }), sources(img, 0.5));
    expect(out).toEqual({ w: 100, h: 50 });
    expect(pixel(ctx, 100, 100)).toEqual([0, 255, 0, 255]);
    expect(pixel(ctx, 52, 77)).toEqual([0, 255, 0, 255]);
    expect(pixel(ctx, 100, 70)).toEqual([255, 255, 255, 255]);
  });

  it('clips rounded corners (cornerRadius x width)', () => {
    const img = solidImage(100, 100, '#00ff00');
    const { ctx } = draw(imageEl({ assetId: ID, width: 0.5, cornerRadius: 0.2 }), sources(img, 1)); // r = 20
    expect(pixel(ctx, 51, 51)).toEqual([255, 255, 255, 255]);
    expect(pixel(ctx, 100, 51)).toEqual([0, 255, 0, 255]);
  });

  it('casts a box shadow only outside the picture', () => {
    const img = solidImage(100, 100, '#00ff00');
    const { ctx } = draw(imageEl({ assetId: ID, width: 0.5, shadow: { color: '#ff0000', blur: 0, x: 0, y: 0.05 } }), sources(img, 1));
    expect(pixel(ctx, 100, 155)).toEqual([255, 0, 0, 255]);
    expect(pixel(ctx, 100, 140)).toEqual([0, 255, 0, 255]);
  });

  it('does not reveal the shadow through transparent pixels', () => {
    const { canvas, ctx: g } = testCanvas(100, 100);
    g.fillStyle = '#0000ff';
    g.fillRect(0, 0, 100, 30); // only the top 30% is opaque
    const { ctx } = draw(imageEl({ assetId: ID, width: 0.5, shadow: { color: '#ff0000', blur: 0, x: 0, y: 0.05 } }), sources(canvas, 1));
    expect(pixel(ctx, 100, 120)).toEqual([255, 255, 255, 255]);
    expect(pixel(ctx, 100, 155)).toEqual([255, 0, 0, 255]);
  });

  it('shows a neutral placeholder while the image is missing', () => {
    const { ctx, out } = draw(imageEl({ assetId: ID, width: 0.5 }), sources(null, 2));
    expect(out).toEqual({ w: 100, h: 200 });
    const p = pixel(ctx, 100, 100);
    expect(p[0]).toBeLessThan(255);
    expect(MISSING_IMAGE_FILL.startsWith('rgba(')).toBe(true);
  });

  it('survives degenerate sizes', () => {
    expect(() => draw(imageEl({ assetId: ID, width: NaN }), sources(solidImage(4, 4, '#000'), 1))).not.toThrow();
    expect(draw(imageEl({ assetId: ID, width: -1 }), sources(null, 1)).out).toEqual({ w: 0, h: 0 });
  });
});

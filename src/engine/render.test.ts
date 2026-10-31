import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawDeviceOptions, ImageLike } from './types';

vi.mock('./devices', async () => {
  const fake = await import('./testing/fakeDevices');
  return { deviceGeometry: vi.fn(fake.fakeDeviceGeometry), drawDevice: vi.fn(fake.fakeDrawDevice) };
});
vi.mock('./mock', () => ({ drawMockScreen: vi.fn() }));

import { renderSlide } from './render';
import { drawDevice } from './devices';
import { FAKE_EMPTY_COLOR, FAKE_MOCK_COLOR, fakeDrawDevice } from './testing/fakeDevices';
import { background, deviceEl, imageEl, renderInput, shapeEl, slide, textEl, theme } from './testing/fixtures';
import { nodeEnv, pixel, registerPrimaryFonts, solidImage, testCanvas } from './testing/canvas.node';
import { parseColor } from './color';
import { FAMILIES } from '../model/catalog';
import type { Fill, SlideElement } from '../model/types';

registerPrimaryFonts();

const W = 360;
const H = 780;
const drawDeviceMock = vi.mocked(drawDevice);

beforeEach(() => {
  drawDeviceMock.mockClear();
  drawDeviceMock.mockImplementation(fakeDrawDevice);
});

const rgb = (hex: string) => {
  const c = parseColor(hex);
  return [c.r, c.g, c.b];
};
const near = (p: number[], hex: string, tol = 6) => rgb(hex).every((v, i) => Math.abs(v - p[i]) <= tol);

function render(elements: SlideElement[] = [], extra: Partial<Parameters<typeof renderInput>[0]> = {}) {
  const width = extra.width ?? W;
  const height = extra.height ?? H;
  const { ctx } = testCanvas(Math.max(1, Math.round(Number.isFinite(width) ? width : 1)), Math.max(1, Math.round(Number.isFinite(height) ? height : 1)));
  const result = renderSlide(ctx, renderInput({ env: nodeEnv, elements, ...extra }));
  return { ctx, result };
}

describe('renderSlide: guards', () => {
  it('returns an empty result for unusable sizes and draws nothing', () => {
    for (const [width, height] of [
      [0, 100],
      [100, 0.5],
      [NaN, 100],
      [100, Infinity],
      [-5, 100],
    ]) {
      const { ctx } = testCanvas(10, 10);
      const result = renderSlide(ctx, renderInput({ env: nodeEnv, width, height, elements: [shapeEl()] }));
      expect(result).toEqual({ boxes: [], missingShots: [], overflowingText: [], pendingImages: [] });
      expect(pixel(ctx, 5, 5)[3]).toBe(0);
    }
  });

  it('restores the context state', () => {
    const { ctx } = testCanvas(W, H);
    ctx.globalAlpha = 0.7;
    ctx.translate(3, 4);
    ctx.fillStyle = '#123456';
    renderSlide(ctx, renderInput({ env: nodeEnv, elements: [shapeEl({ opacity: 0.5, rotation: 30 }), textEl({ style: { letterSpacing: 0.1 } })] }));
    expect(ctx.globalAlpha).toBeCloseTo(0.7);
    expect(ctx.getTransform().e).toBe(3);
    expect(ctx.getTransform().f).toBe(4);
    expect(ctx.fillStyle).toBe('#123456');
  });

  it('survives bad data anywhere', () => {
    const bad = [
      null,
      42,
      { kind: 'video', id: 'v' },
      { ...shapeEl(), x: NaN, y: Infinity, rotation: NaN, opacity: NaN, width: NaN },
      { ...shapeEl(), fill: { type: 'plaid' } },
      { ...shapeEl(), shape: 'star' },
      { ...textEl(), style: null, width: -1, key: 7 },
      { ...deviceEl(), width: NaN, slot: undefined },
      { ...imageEl(), assetId: null, cornerRadius: NaN },
    ] as unknown as SlideElement[];
    const { ctx } = testCanvas(W, H);
    const input = renderInput({ env: nodeEnv, elements: bad, slide: { id: 'x' } as never, theme: { background: { fill: { type: 'mesh', base: 5, points: 'no' } } } as never });
    expect(() => renderSlide(ctx, input)).not.toThrow();
    const missingTheme = { ...renderInput({ env: nodeEnv, elements: [shapeEl()], theme: undefined as never }), layout: undefined as never };
    expect(() => renderSlide(ctx, missingTheme)).not.toThrow();
    const throwingImages = renderInput({
      env: nodeEnv,
      elements: [imageEl(), deviceEl()],
      slide: slide({ shots: { iphone: { main: { 'en-US': 'x.png' } } } }),
      getImage: () => {
        throw new Error('decode');
      },
      getAssetAspect: () => {
        throw new Error('aspect');
      },
    });
    expect(() => renderSlide(ctx, throwingImages)).not.toThrow();
  });
  it('keeps the canvas state balanced when drawImage throws (closed bitmap)', () => {
    // An ImageLike that the canvas refuses, like an ImageBitmap closed by the image cache.
    const broken = { width: 10, height: 20 } as unknown as ImageLike;
    const id = `${'7'.repeat(64)}.png`;
    const t = theme({ background: background({ type: 'image', assetId: id, fit: 'cover', opacity: 0.5, blur: 0.02, tint: null }) });
    const after = shapeEl({ id: 'after', shape: 'rect', width: 0.1, height: 0.1, y: 0.9, fill: { type: 'solid', color: '#ff0000' } });
    const s = slide({ shots: { iphone: { main: { 'en-US': id } } } });
    drawDeviceMock.mockImplementation(() => {
      throw new Error('device failed');
    });
    const { ctx } = testCanvas(W, H);
    ctx.translate(1, 2);
    const result = renderSlide(
      ctx,
      renderInput({ env: nodeEnv, theme: t, slide: s, images: { [id]: broken }, elements: [imageEl({ assetId: id, shadow: { color: '#000', blur: 0.02, x: 0, y: 0 } }), deviceEl({ width: 0.3 }), after] }),
    );
    expect(result.boxes.map((b) => b.id)).toContain('after');
    // The shape after the failures is drawn opaque and in the right place.
    expect(pixel(ctx, 181, 704)).toEqual([255, 0, 0, 255]);
    expect(ctx.getTransform().e).toBe(1);
    expect(ctx.getTransform().f).toBe(2);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('renderSlide: backgrounds', () => {
  it('paints the theme background, or the slide override', () => {
    const t = theme({ background: background({ type: 'solid', color: '#ff0000' }) });
    expect(near(pixel(render([], { theme: t }).ctx, 10, 10), '#ff0000')).toBe(true);
    const own = background({ type: 'solid', color: '#00ff00' });
    expect(near(pixel(render([], { theme: t, layoutBackground: own }).ctx, 10, 10), '#00ff00')).toBe(true);
  });

  it('starts from opaque white so translucent backgrounds export like the preview', () => {
    const t = theme({ background: background({ type: 'solid', color: '#00000000' }) });
    expect(pixel(render([], { theme: t }).ctx, 10, 10)).toEqual([255, 255, 255, 255]);
  });

  it('draws a pattern over the fill', () => {
    const t = theme({ background: background({ type: 'solid', color: '#ffffff' }, { kind: 'grid', color: '#000000', opacity: 1, scale: 0.1 }) });
    const { ctx } = render([], { theme: t });
    expect(pixel(ctx, 17, 5)[0]).toBeLessThan(80); // 36px cells (0.1 x 360), lines mid-cell
    expect(pixel(ctx, 17 + 36, 5)[0]).toBeLessThan(80);
    expect(pixel(ctx, 0, 5)[0]).toBe(255);
    expect(pixel(ctx, 5, 5)[0]).toBe(255);
  });

  it('continues a linear panorama seamlessly across slides', () => {
    const fill: Fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const t = theme({ panorama: true, background: background(fill, { kind: 'dots', color: '#ffffff', opacity: 0.5, scale: 0.07 }) });
    const a = render([], { theme: t, slideIndex: 0, slideCount: 2 }).ctx;
    const b = render([], { theme: t, slideIndex: 1, slideCount: 2 }).ctx;
    for (const y of [3, 200, 400, 777]) {
      const right = pixel(a, W - 1, y);
      const left = pixel(b, 0, y);
      for (let k = 0; k < 3; k++) expect(Math.abs(right[k] - left[k])).toBeLessThanOrEqual(6);
    }
    // Each slide shows only its half of the strip.
    expect(pixel(a, 0, 400)[0]).toBeGreaterThan(240);
    expect(pixel(b, W - 1, 400)[2]).toBeGreaterThan(240);
    expect(pixel(a, W - 1, 400)[0]).toBeGreaterThan(110);
    expect(pixel(a, W - 1, 400)[0]).toBeLessThan(145);
  });

  it('continues a mesh panorama seamlessly (each slide caches its own window)', () => {
    const mesh: Fill = {
      type: 'mesh',
      base: '#101030',
      points: [
        { x: 0.5, y: 0.4, color: '#ff4080', radius: 0.3 },
        { x: 0.2, y: 0.8, color: '#40c0ff', radius: 0.25 },
      ],
    };
    const t = theme({ panorama: true, background: background(mesh) });
    const a = render([], { theme: t, slideIndex: 0, slideCount: 2 }).ctx;
    const b = render([], { theme: t, slideIndex: 1, slideCount: 2 }).ctx;
    let worst = 0;
    for (let y = 0; y < H; y += 37) {
      const right = pixel(a, W - 1, y);
      const left = pixel(b, 0, y);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(right[k] - left[k]));
    }
    expect(worst).toBeLessThanOrEqual(6);
    // The pink blob straddles the seam: both edges are clearly pink there.
    expect(pixel(a, W - 1, 312)[0]).toBeGreaterThan(200);
    expect(pixel(b, 0, 312)[0]).toBeGreaterThan(200);
  });

  it('never makes slide-level backgrounds panoramic', () => {
    const fill: Fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const t = theme({ panorama: true });
    const { ctx } = render([], { theme: t, layoutBackground: background(fill), slideIndex: 1, slideCount: 3 });
    expect(pixel(ctx, 0, 100)[0]).toBeGreaterThan(245);
    expect(pixel(ctx, W - 1, 100)[2]).toBeGreaterThan(245);
  });

  it('clamps bad panorama indices', () => {
    const t = theme({ panorama: true, background: background({ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] }) });
    expect(() => render([], { theme: t, slideIndex: 99, slideCount: 2 })).not.toThrow();
    expect(() => render([], { theme: t, slideIndex: NaN, slideCount: NaN })).not.toThrow();
  });
});

describe('renderSlide: elements and boxes', () => {
  it('draws in painter order and reports a box per visible element', () => {
    const under = shapeEl({ id: 'under', shape: 'rect', width: 0.5, height: 0.5, fill: { type: 'solid', color: '#ff0000' } });
    const over = shapeEl({ id: 'over', shape: 'rect', width: 0.2, height: 0.2, fill: { type: 'solid', color: '#0000ff' } });
    const { ctx, result } = render([under, over]);
    expect(near(pixel(ctx, 180, 390), '#0000ff')).toBe(true);
    expect(near(pixel(ctx, 180 + 60, 390), '#ff0000')).toBe(true);
    expect(result.boxes).toEqual([
      { id: 'under', cx: 180, cy: 390, w: 180, h: 180, rotation: 0 },
      { id: 'over', cx: 180, cy: 390, w: 72, h: 72, rotation: 0 },
    ]);
  });

  it('skips hidden and fully transparent elements', () => {
    const hidden = shapeEl({ id: 'h', hidden: true });
    const clear = shapeEl({ id: 'c', opacity: 0 });
    const { ctx, result } = render([hidden, clear]);
    expect(result.boxes).toEqual([]);
    expect(pixel(ctx, 180, 390)).toEqual([255, 255, 255, 255]);
  });

  it('applies opacity', () => {
    const { ctx } = render([shapeEl({ opacity: 0.5, fill: { type: 'solid', color: '#000000' } })]);
    const p = pixel(ctx, 180, 390);
    expect(p[0]).toBeGreaterThan(120);
    expect(p[0]).toBeLessThan(135);
  });

  it('rotates around the element centre', () => {
    const el = shapeEl({ id: 'r', shape: 'rect', x: 0.5, y: 0.5, width: 0.6, height: 0.1, rotation: 90, fill: { type: 'solid', color: '#000000' } });
    const { ctx, result } = render([el]);
    expect(result.boxes[0]).toMatchObject({ cx: 180, cy: 390, w: 216, h: 36, rotation: 90 });
    expect(pixel(ctx, 180, 390 - 100)[0]).toBe(0);
    expect(pixel(ctx, 180 + 100, 390)[0]).toBe(255);
  });

  it('clips elements to the slide', () => {
    const { ctx } = testCanvas(2 * W, H);
    renderSlide(ctx, renderInput({ env: nodeEnv, elements: [shapeEl({ x: 1, width: 0.6, fill: { type: 'solid', color: '#000000' } })] }));
    expect(pixel(ctx, W - 2, 390)[0]).toBe(0);
    expect(pixel(ctx, W + 5, 390)[3]).toBe(0);
  });

  it('anchors text by valign and centres the box on the block', () => {
    const s = slide({ texts: { 'en-US': { headline: 'Line one\nLine two' } } });
    const top = textEl({ id: 'top', y: 0.1, valign: 'top' });
    const mid = textEl({ id: 'mid', y: 0.5, valign: 'middle' });
    const bot = textEl({ id: 'bot', y: 0.9, valign: 'bottom' });
    const { result } = render([top, mid, bot], { slide: s });
    const h = 2 * 0.08 * 360 * 1.15;
    const [bt, bm, bb] = result.boxes;
    expect(bt.h).toBeCloseTo(h);
    expect(bt.cy).toBeCloseTo(78 + h / 2);
    expect(bm.cy).toBeCloseTo(390);
    expect(bb.cy).toBeCloseTo(702 - h / 2);
    expect(bt.w).toBeCloseTo(0.86 * 360);
    expect(bt.cx).toBe(180);
  });

  it('keeps empty text selectable with a one-line box', () => {
    const s = slide({ texts: { 'en-US': {} } });
    const { result, ctx } = render([textEl({ id: 'e', key: 'missing', style: { color: '#000000' } })], { slide: s });
    expect(result.boxes[0].h).toBeCloseTo(0.08 * 360 * 1.15);
    expect(pixel(ctx, 180, 100)).toEqual([255, 255, 255, 255]);
  });

  it('falls back to base-language text and reports overflow', () => {
    const s = slide({ texts: { 'en-US': { headline: 'A very long headline that cannot possibly fit in one line' }, 'de-DE': {} } });
    const el = textEl({ id: 'o', width: 0.3, style: { maxLines: 1 } });
    const { result } = render([el], { slide: s, lang: 'de-DE', baseLang: 'en-US' });
    expect(result.overflowingText).toEqual(['o']);
  });

  it('draws image elements with their asset aspect', () => {
    const id = `${'d'.repeat(64)}.png`;
    const el = imageEl({ id: 'img', assetId: id, width: 0.5 });
    const { result, ctx } = render([el], { images: { [id]: solidImage(50, 100, '#00ff00') }, aspects: { [id]: 2 } });
    expect(result.boxes[0]).toMatchObject({ w: 180, h: 360 });
    expect(near(pixel(ctx, 180, 390), '#00ff00')).toBe(true);
  });
});

describe('renderSlide: devices', () => {
  const shotId = `${'e'.repeat(64)}.png`;

  it('reports missing screenshots and draws the requested placeholder', () => {
    const el = deviceEl({ id: 'dev', width: 0.5, shadow: null });
    const { result, ctx } = render([el], { placeholder: 'mock' });
    expect(result.missingShots).toEqual(['dev']);
    expect(result.pendingImages).toEqual([]);
    const opts = drawDeviceMock.mock.calls[0][1] as DrawDeviceOptions;
    expect(opts.placeholder).toBe('mock');
    expect(opts.screen).toBeNull();
    expect(opts.screenAspect).toBeCloseTo(FAMILIES.iphone.screenAspect);
    expect(near(pixel(ctx, 180, 482), FAKE_MOCK_COLOR)).toBe(true);
    const box = result.boxes[0];
    expect(box.w).toBeCloseTo(180);
    expect(box.h).toBeCloseTo(180 * FAMILIES.iphone.screenAspect);
  });

  it('marks resolved but undecoded screenshots as pending and shows an empty screen', () => {
    const s = slide({ shots: { iphone: { main: { 'en-US': shotId } } } });
    const { result, ctx } = render([deviceEl({ id: 'dev', width: 0.5 })], { slide: s, aspects: { [shotId]: 2 } });
    expect(result.missingShots).toEqual([]);
    expect(result.pendingImages).toEqual(['dev']);
    const opts = drawDeviceMock.mock.calls[0][1] as DrawDeviceOptions;
    expect(opts.placeholder).toBe('empty');
    expect(opts.screenAspect).toBe(2);
    expect(near(pixel(ctx, 180, 482), FAKE_EMPTY_COLOR)).toBe(true);
  });

  it('passes the decoded screenshot, unit, seed and palette', () => {
    const s = slide({ shots: { iphone: { main: { 'en-US': shotId } } } });
    const img = solidImage(50, 100, '#ff00ff');
    const t = theme({ palette: ['#111111', '#222222'], mockDark: true });
    const { result, ctx } = render([shapeEl(), deviceEl({ id: 'dev', width: 0.5 })], { slide: s, theme: t, images: { [shotId]: img }, slideIndex: 2, slideCount: 3 });
    expect(result.missingShots).toEqual([]);
    expect(result.pendingImages).toEqual([]);
    const opts = drawDeviceMock.mock.calls[0][1] as DrawDeviceOptions;
    expect(opts.screen).toBe(img);
    expect(opts.unit).toBe(360);
    expect(opts.widthPx).toBe(180);
    // Layout never depends on decoding: without AssetInfo the family aspect is used.
    expect(opts.screenAspect).toBeCloseTo(FAMILIES.iphone.screenAspect);
    expect(opts.mock).toEqual({ seed: 2 * 31 + 1 * 7 + 3, palette: ['#111111', '#222222'], dark: true });
    expect(opts.env).toBe(nodeEnv);
    expect(near(pixel(ctx, 180, 482), '#ff00ff')).toBe(true);
  });

  it('falls back to the base language screenshot', () => {
    const s = slide({ shots: { iphone: { main: { 'en-US': shotId } } } });
    const { result } = render([deviceEl({ id: 'dev' })], { slide: s, lang: 'ar-SA', baseLang: 'en-US', rtl: true });
    expect(result.missingShots).toEqual([]);
    expect(result.pendingImages).toEqual(['dev']);
  });

  it('uses the geometry drawDevice returns for the box', () => {
    drawDeviceMock.mockImplementation(() => ({ width: 111, height: 222, screen: { x: 0, y: 0, w: 1, h: 1, radius: 0 } }));
    const { result } = render([deviceEl({ id: 'dev', x: 0.25, y: 0.75, rotation: -8 })]);
    expect(result.boxes[0]).toEqual({ id: 'dev', cx: 90, cy: 585, w: 111, h: 222, rotation: -8 });
  });

  it('keeps going when the device painter throws', () => {
    drawDeviceMock.mockImplementation(() => {
      throw new Error('not implemented');
    });
    const { result, ctx } = render([deviceEl({ id: 'dev', width: 0.5 }), shapeEl({ id: 'after', width: 0.05, height: 0.05, y: 0.05, fill: { type: 'solid', color: '#ff0000' } })]);
    expect(result.boxes.map((b) => b.id)).toEqual(['dev', 'after']);
    expect(result.boxes[0].w).toBeCloseTo(180);
    expect(near(pixel(ctx, 180, 39), '#ff0000')).toBe(true);
    // The stand-in body is drawn so the layout stays legible.
    expect(pixel(ctx, 180, 390)[0]).toBeLessThan(100);
  });

  it("gives a frame its own screen shape and frame none the slide family's", () => {
    const aspect = () => (drawDeviceMock.mock.calls.at(-1)![1] as DrawDeviceOptions).screenAspect;
    render([deviceEl({ frame: 'macbook' })], { family: 'iphone' });
    expect(aspect()).toBeCloseTo(FAMILIES.mac.screenAspect);
    render([deviceEl({ frame: 'iphone' })], { family: 'mac' });
    expect(aspect()).toBeCloseTo(FAMILIES.iphone.screenAspect);
    render([deviceEl({ frame: 'none' })], { family: 'android-phone' });
    expect(aspect()).toBeCloseTo(FAMILIES['android-phone'].screenAspect);
    render([deviceEl({ frame: 'none' })], { family: 'toaster' as never });
    expect(aspect()).toBeCloseTo(2868 / 1320);
  });

  it('crops a screenshot of another shape into the frame instead of reshaping the frame', () => {
    const s = slide({ shots: { iphone: { main: { 'en-US': shotId } } } });
    const aspect = () => (drawDeviceMock.mock.calls.at(-1)![1] as DrawDeviceOptions).screenAspect;
    // A phone screenshot in a MacBook keeps the laptop's screen.
    render([deviceEl({ frame: 'macbook' })], { slide: s, aspects: { [shotId]: 2.2 } });
    expect(aspect()).toBeCloseTo(FAMILIES.mac.screenAspect);
    // Without a frame the screenshot shows as it is.
    render([deviceEl({ frame: 'none' })], { slide: s, aspects: { [shotId]: 0.6 } });
    expect(aspect()).toBe(0.6);
  });
});

describe('renderSlide: performance', () => {
  it('renders a full scene and re-renders faster from caches', () => {
    const t = theme({
      background: background(
        {
          type: 'mesh',
          base: '#0b1026',
          points: [
            { x: 0.1, y: 0.1, color: '#7c3aed', radius: 0.6 },
            { x: 0.9, y: 0.3, color: '#ec4899', radius: 0.5 },
            { x: 0.4, y: 0.9, color: '#06b6d4', radius: 0.6 },
          ],
        },
        { kind: 'noise', color: '#ffffff', opacity: 0.06, scale: 0.04 },
      ),
    });
    const s = slide({ texts: { 'en-US': { headline: 'Track *every* habit', subtitle: 'Build streaks that last, one day at a time' } } });
    const elements = [
      shapeEl({ shape: 'blob', x: 0.8, y: 0.25, width: 0.5, height: 0.5, blur: 0.08, fill: { type: 'solid', color: '#f472b6' } }),
      textEl({ y: 0.06, style: { color: '#ffffff', highlight: '#f0abfc', size: 0.085, maxLines: 2 } }),
      textEl({ key: 'subtitle', y: 0.17, style: { color: '#e0e7ff', weight: 400, size: 0.042 } }),
      deviceEl({ y: 0.66 }),
    ];
    const { ctx } = testCanvas(720, 1564);
    const input = renderInput({ env: nodeEnv, width: 720, height: 1564, theme: t, slide: s, elements });
    renderSlide(ctx, input);
    ctx.getImageData(0, 0, 1, 1);
    const t0 = performance.now();
    const runs = 5;
    for (let i = 0; i < runs; i++) {
      renderSlide(ctx, input);
      // @napi-rs/canvas records draw calls; reading a pixel forces the actual rasterisation.
      ctx.getImageData(0, 0, 1, 1);
    }
    const ms = (performance.now() - t0) / runs;
    // CPU raster in Node is several times slower than a GPU canvas; this only guards regressions.
    expect(ms).toBeLessThan(250);
  });
});

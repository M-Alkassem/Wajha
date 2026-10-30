import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FamilyId, Project, Slide, SlideLayout } from '../model/types';
import type { Ctx2D, ImageLike, RenderInput, RenderResult, RenderSlideFn } from '../engine/types';
import type { ExportJob } from '../export';

const h = vi.hoisted(() => ({
  renderSlide: vi.fn<RenderSlideFn>(),
  resolveLayout: vi.fn<(project: Project, slide: Slide, family: FamilyId) => SlideLayout>(),
  encodePngAsync: vi.fn<(rgba: Uint8ClampedArray, width: number, height: number) => Promise<Uint8Array>>(),
  ensureFonts: vi.fn<(project: Project) => Promise<void>>(),
  waitForPreviews: vi.fn<(projectId: string, ids: readonly string[], timeoutMs: number) => Promise<void>>(),
  cache: {
    getPreview: vi.fn<(projectId: string, assetId: string) => ImageLike | null>(),
    loadFull: vi.fn<(projectId: string, assetId: string) => Promise<ImageLike>>(),
    release: vi.fn<(img: ImageLike) => void>(),
    subscribe: vi.fn(() => () => {}),
    evictProject: vi.fn(),
    memoryBytes: vi.fn(() => 0),
  },
  env: { createCanvas: vi.fn() },
}));
vi.mock('../engine', () => ({ renderSlide: h.renderSlide }));
vi.mock('../export', () => ({ encodePngAsync: h.encodePngAsync }));
vi.mock('../model/resolve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/resolve')>()),
  resolveLayout: h.resolveLayout,
}));
vi.mock('./images', () => ({ getImageCache: () => h.cache, waitForPreviews: h.waitForPreviews }));
vi.mock('./fonts', () => ({ ensureFonts: h.ensureFonts }));
vi.mock('./env', () => ({ browserEnv: () => h.env }));

import { renderJobBytes, renderJobWithResult, renderThumbnail, renderToCanvas, slideAssetIds, thumbnailLayout } from './renderer';
import {
  ASSET_A,
  ASSET_B,
  ASSET_C,
  ASSET_D,
  NodeOffscreenCanvas,
  assetInfo,
  device,
  fakeBitmap,
  flushPromises,
  image,
  imageFill,
  layout,
  project,
  shape,
  slide,
  text,
  theme,
} from './fixtures.node';

const RESULT: RenderResult = { boxes: [], missingShots: ['x'], overflowingText: ['t1'], pendingImages: [] };

const lastInput = (): RenderInput => {
  const call = h.renderSlide.mock.calls.at(-1);
  if (!call) throw new Error('renderSlide was not called');
  return call[1];
};

function job(overrides: Partial<ExportJob> = {}): ExportJob {
  return { family: 'iphone', sizeId: 'ios-6.9', width: 132, height: 287, lang: 'en-US', slideIndex: 0, path: 'a/01.png', ...overrides };
}

/** A canvas double that records size assignments. */
function trackedCanvas(width: number, height: number) {
  let w = width;
  let hgt = height;
  const sets: string[] = [];
  const ctx = { reset: vi.fn() };
  const canvas = {
    get width() {
      return w;
    },
    set width(v: number) {
      sets.push(`width=${v}`);
      w = v;
    },
    get height() {
      return hgt;
    },
    set height(v: number) {
      sets.push(`height=${v}`);
      hgt = v;
    },
    getContext: vi.fn(() => ctx),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, sets };
}

/** OffscreenCanvas stand-in that remembers every canvas it created. */
const created: { width: number; height: number }[] = [];
class TrackingOffscreenCanvas {
  constructor(width: number, height: number) {
    const canvas = new NodeOffscreenCanvas(width, height) as unknown as { width: number; height: number };
    created.push(canvas);
    return canvas as unknown as TrackingOffscreenCanvas;
  }
}

async function decodeJpeg(bytes: Uint8Array) {
  const img = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return {
    width: img.width,
    height: img.height,
    pixel: (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)],
  };
}

const near = (actual: number[], expected: number[], tolerance = 24) =>
  actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', TrackingOffscreenCanvas);
  created.length = 0;
  h.renderSlide.mockReset();
  h.renderSlide.mockReturnValue(RESULT);
  h.resolveLayout.mockReset();
  h.resolveLayout.mockImplementation((_p, s, family) => s.layouts[family] ?? s.layouts.iphone ?? layout([]));
  h.encodePngAsync.mockReset();
  h.encodePngAsync.mockResolvedValue(new Uint8Array([0x89, 0x50]));
  h.ensureFonts.mockReset();
  h.ensureFonts.mockResolvedValue(undefined);
  h.waitForPreviews.mockReset();
  h.waitForPreviews.mockResolvedValue(undefined);
  h.cache.getPreview.mockReset();
  h.cache.getPreview.mockReturnValue(null);
  h.cache.loadFull.mockReset();
  h.cache.loadFull.mockImplementation(async (_p, id) => fakeBitmap(10, 20, id));
  h.cache.release.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('slideAssetIds', () => {
  it('lists the background, resolved screenshots, images and shape fills once each', () => {
    const p = project({ theme: theme({ background: { fill: imageFill(ASSET_D), pattern: null } }) });
    const s = slide('s', { shots: { iphone: { main: { 'en-US': ASSET_A }, second: { 'ar-SA': ASSET_B } } } });
    const l = layout([
      device('d1'),
      device('d2', { slot: 'second' }),
      device('d3', { slot: 'empty' }),
      image('i1', ASSET_C),
      image('i2', ASSET_C),
      shape('sh', imageFill(ASSET_B)),
      shape('plain', { type: 'solid', color: '#fff' }),
      text('t', 'headline'),
    ]);
    // theme background applies when the slide has none
    expect(slideAssetIds(p, s, l, 'iphone', 'en-US', 'en-US')).toEqual([ASSET_D, ASSET_A, ASSET_C, ASSET_B]);
    // Arabic falls back to the base language for "main" and has its own "second"
    expect(slideAssetIds(p, s, l, 'iphone', 'ar-SA', 'en-US')).toEqual([ASSET_D, ASSET_A, ASSET_B, ASSET_C]);
  });

  it('uses the slide background instead of the theme and skips hidden elements', () => {
    const p = project({ theme: theme({ background: { fill: imageFill(ASSET_D), pattern: null } }) });
    const l = layout(
      [device('d1', { hidden: true }), image('i1', ASSET_C, { hidden: true }), image('i2', ASSET_B, { opacity: 0 }), image('i3', ASSET_D, { opacity: Number.NaN })],
      { fill: { type: 'solid', color: '#000' }, pattern: null },
    );
    // an unreadable opacity is drawn opaque by the engine, so its image is still needed
    expect(slideAssetIds(p, slide('s'), l, 'iphone', 'en-US', 'en-US')).toEqual([ASSET_D]);
    const withImage = layout([], { fill: imageFill(ASSET_B), pattern: null });
    expect(slideAssetIds(p, slide('s'), withImage, 'iphone', 'en-US', 'en-US')).toEqual([ASSET_B]);
  });

  it('ignores screenshots of other families', () => {
    const s = slide('s', { shots: { ipad: { main: { 'en-US': ASSET_B } } } });
    expect(slideAssetIds(project(), s, layout([device('d')]), 'iphone', 'en-US', 'en-US')).toEqual([]);
  });
});

describe('renderToCanvas', () => {
  it('sizes the canvas only when the size changes', () => {
    const t = trackedCanvas(300, 150);
    const p = project();
    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: 100, height: 200 });
    expect(t.sets).toEqual(['width=100', 'height=200']);
    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: 100, height: 200 });
    expect(t.sets).toHaveLength(2);
    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: 100.4, height: 250 });
    expect(t.sets).toEqual(['width=100', 'height=200', 'height=250']);
    expect(t.ctx.reset).toHaveBeenCalledTimes(3);
    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: Number.NaN, height: -5 });
    expect([t.canvas.width, t.canvas.height]).toEqual([1, 1]);
  });

  it('passes the resolved layout, language info and preview images to the engine', () => {
    const t = trackedCanvas(10, 10);
    const p = project();
    const s = p.slides[1];
    const special = layout([device('dev1'), text('t1', 'headline')]);
    h.resolveLayout.mockReturnValueOnce(special);
    const result = renderToCanvas(t.canvas, { project: p, slideIndex: 1, family: 'iphone', lang: 'ar-SA', width: 360, height: 782 });
    expect(result).toBe(RESULT);
    expect(h.resolveLayout).toHaveBeenCalledWith(p, s, 'iphone');
    const [ctx, input] = h.renderSlide.mock.calls[0];
    expect(ctx).toBe(t.ctx);
    expect(input).toMatchObject({
      width: 360,
      height: 782,
      family: 'iphone',
      slide: s,
      layout: special,
      theme: p.theme,
      lang: 'ar-SA',
      baseLang: 'en-US',
      rtl: true,
      slideIndex: 1,
      slideCount: 4,
      placeholder: 'mock',
    });
    expect(input.env).toBe(h.env);

    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: 360, height: 782, placeholder: 'empty' });
    expect(lastInput()).toMatchObject({ rtl: false, placeholder: 'empty', slideIndex: 0 });
  });

  it('serves preview images from the cache and aspects from AssetInfo first', () => {
    const t = trackedCanvas(10, 10);
    const preview = fakeBitmap(50, 25);
    h.cache.getPreview.mockImplementation((_p, id) => (id === ASSET_B ? preview : null));
    const p = project({ id: 'proj-x', assets: { [ASSET_A]: assetInfo(ASSET_A, 1000, 2000), [ASSET_C]: assetInfo(ASSET_C, 0, 100) } });
    renderToCanvas(t.canvas, { project: p, slideIndex: 0, family: 'iphone', lang: 'en-US', width: 10, height: 10 });
    const input = lastInput();
    expect(input.getImage(ASSET_B)).toBe(preview);
    expect(h.cache.getPreview).toHaveBeenCalledWith('proj-x', ASSET_B);
    expect(input.getImage(ASSET_A)).toBeNull();
    expect(input.getAssetAspect(ASSET_A)).toBe(2);
    // not registered: the decoded preview's aspect
    expect(input.getAssetAspect(ASSET_B)).toBe(0.5);
    // degenerate AssetInfo and nothing decoded
    expect(input.getAssetAspect(ASSET_C)).toBeNull();
    expect(input.getAssetAspect('unknown')).toBeNull();
  });

  it('clears and returns an empty result for a stale slide index', () => {
    const t = trackedCanvas(10, 10);
    const result = renderToCanvas(t.canvas, { project: project(), slideIndex: 9, family: 'iphone', lang: 'en-US', width: 10, height: 10 });
    expect(result).toEqual({ boxes: [], missingShots: [], overflowingText: [], pendingImages: [] });
    expect(h.renderSlide).not.toHaveBeenCalled();
    expect(t.ctx.reset).toHaveBeenCalled();
  });

  it('clears a real canvas between frames without ctx.reset', () => {
    const canvas = createCanvas(20, 20);
    const ctx = canvas.getContext('2d') as unknown as Ctx2D & { reset?: unknown };
    Object.defineProperty(ctx, 'reset', { value: undefined });
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 20, 20);
    ctx.globalAlpha = 0.2;
    ctx.translate(5, 5);
    renderToCanvas(canvas as unknown as HTMLCanvasElement, { project: project(), slideIndex: 9, family: 'iphone', lang: 'en-US', width: 20, height: 20 });
    expect([...ctx.getImageData(10, 10, 1, 1).data]).toEqual([0, 0, 0, 0]);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.getTransform().e).toBe(0);
  });

  it('throws when the canvas has no 2D context', () => {
    const canvas = { width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => renderToCanvas(canvas, { project: project(), slideIndex: 0, family: 'iphone', lang: 'en-US', width: 1, height: 1 })).toThrow(/2D context/);
  });
});

describe('renderJobBytes', () => {
  it('renders PNG jobs with full-size images, releases them before encoding, and encodes the pixels', async () => {
    const log: string[] = [];
    const p = project({ theme: theme({ background: { fill: imageFill(ASSET_D), pattern: null } }) });
    h.resolveLayout.mockReturnValue(layout([device('dev1'), image('img', ASSET_B), shape('sh', imageFill(ASSET_C)), device('off', { hidden: true, slot: 'x' })]));
    h.cache.loadFull.mockImplementation(async (_p, id) => {
      log.push(`load ${id.slice(0, 1)}`);
      return fakeBitmap(10, 20, id);
    });
    h.cache.release.mockImplementation((img) => log.push(`release ${(img as unknown as { label: string }).label.slice(0, 1)}`));
    h.renderSlide.mockImplementation((ctx, input) => {
      log.push('render');
      expect((input.getImage(ASSET_A) as unknown as { label: string }).label).toBe(ASSET_A);
      expect(input.getImage('missing')).toBeNull();
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, input.width, input.height);
      return RESULT;
    });
    h.encodePngAsync.mockImplementation(async (rgba, w, hgt) => {
      log.push('encode');
      expect(rgba.length).toBe(w * hgt * 4);
      expect([...rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
      return new Uint8Array([7, 7]);
    });
    const bytes = await renderJobBytes(p, job({ lang: 'ar-SA', width: 132, height: 287 }), 'png', 1);
    expect([...bytes]).toEqual([7, 7]);
    expect(h.cache.loadFull.mock.calls.map((c) => c[0])).toEqual(['proj1', 'proj1', 'proj1', 'proj1']);
    expect(log).toEqual(['load d', 'load a', 'load b', 'load c', 'render', 'release d', 'release a', 'release b', 'release c', 'encode']);
    expect(h.encodePngAsync).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 132, 287);
    expect(lastInput()).toMatchObject({ width: 132, height: 287, lang: 'ar-SA', baseLang: 'en-US', rtl: true, placeholder: 'mock', slideIndex: 0 });
  });

  it('returns the engine report with renderJobWithResult', async () => {
    const out = await renderJobWithResult(project(), job(), 'png', 1);
    expect(out.result).toBe(RESULT);
    expect([...out.bytes]).toEqual([0x89, 0x50]);
  });

  it('encodes JPEG on white, honouring the quality', async () => {
    h.renderSlide.mockImplementation((ctx, input) => {
      // left half transparent, right half noisy (so quality changes the size)
      let seed = 7;
      for (let y = 0; y < input.height; y += 2) {
        for (let x = Math.ceil(input.width / 2); x < input.width; x += 2) {
          seed = (seed * 16807) % 2147483647;
          ctx.fillStyle = `rgb(${seed % 256}, ${(seed >> 8) % 256}, ${(seed >> 16) % 256})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
      return RESULT;
    });
    const high = await renderJobBytes(project(), job({ width: 200, height: 120 }), 'jpeg', 1);
    const low = await renderJobBytes(project(), job({ width: 200, height: 120 }), 'jpeg', 0.3);
    expect([...high.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(high.byteLength).toBeGreaterThan(low.byteLength);
    const img = await decodeJpeg(high);
    expect([img.width, img.height]).toEqual([200, 120]);
    expect(near(img.pixel(20, 60), [255, 255, 255], 6)).toBe(true);
    expect(h.encodePngAsync).not.toHaveBeenCalled();
  });

  it('reuses one export canvas and frees it after 10 idle seconds', async () => {
    // a fresh module: the export canvas is module state shared by the tests above
    vi.resetModules();
    const fresh = await import('./renderer');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await fresh.renderJobBytes(project(), job({ width: 50, height: 60 }), 'png', 1);
    await fresh.renderJobBytes(project(), job({ width: 70, height: 80 }), 'png', 1);
    expect(h.encodePngAsync.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [50, 60],
      [70, 80],
    ]);
    const exportCanvases = created.filter((c) => c.width === 70);
    expect(exportCanvases).toHaveLength(1);
    vi.advanceTimersByTime(9999);
    expect(exportCanvases[0].width).toBe(70);
    vi.advanceTimersByTime(1);
    expect(exportCanvases[0].width).toBe(0);
  });

  it('ensures fonts once per project version', async () => {
    const p = project({ id: 'fonts-a', updatedAt: 10 });
    await renderJobBytes(p, job(), 'png', 1);
    await renderJobBytes(p, job({ slideIndex: 1 }), 'png', 1);
    expect(h.ensureFonts).toHaveBeenCalledTimes(1);
    await renderJobBytes({ ...p, updatedAt: 11 }, job(), 'png', 1);
    expect(h.ensureFonts).toHaveBeenCalledTimes(2);
  });

  it('survives a failing ensureFonts', async () => {
    h.ensureFonts.mockImplementation(() => {
      throw new Error('fonts broke');
    });
    await expect(renderJobBytes(project({ id: 'fonts-b' }), job(), 'png', 1)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('fails the job when an image cannot be loaded, releasing the others', async () => {
    h.resolveLayout.mockReturnValue(layout([device('dev1'), image('img', ASSET_B)]));
    h.cache.loadFull.mockImplementation(async (_p, id) => {
      if (id === ASSET_B) throw new Error('decode failed');
      return fakeBitmap(10, 10, id);
    });
    await expect(renderJobBytes(project(), job(), 'png', 1)).rejects.toThrow(new RegExp(`${ASSET_B}.*decode failed`));
    expect(h.renderSlide).not.toHaveBeenCalled();
    expect(h.cache.release).toHaveBeenCalledTimes(1);
  });

  it('releases images when rendering throws', async () => {
    h.renderSlide.mockImplementation(() => {
      throw new Error('engine bug');
    });
    await expect(renderJobBytes(project(), job(), 'png', 1)).rejects.toThrow('engine bug');
    expect(h.cache.release).toHaveBeenCalledTimes(1);
    expect(h.encodePngAsync).not.toHaveBeenCalled();
  });

  it('rejects jobs for slides that do not exist', async () => {
    await expect(renderJobBytes(project(), job({ slideIndex: 4 }), 'png', 1)).rejects.toThrow(RangeError);
    expect(h.cache.loadFull).not.toHaveBeenCalled();
  });

  it('runs one job at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.cache.loadFull.mockImplementationOnce(async (_p, id) => {
      await gate;
      return fakeBitmap(1, 1, id);
    });
    const first = renderJobBytes(project(), job(), 'png', 1);
    const second = renderJobBytes(project(), job({ slideIndex: 1 }), 'png', 1);
    await flushPromises(20);
    expect(h.cache.loadFull).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(h.cache.loadFull).toHaveBeenCalledTimes(2);
    expect(h.renderSlide.mock.calls.map((c) => c[1].slideIndex)).toEqual([0, 1]);
  });

  it('keeps working after a failed job', async () => {
    h.cache.loadFull.mockRejectedValueOnce(new Error('gone'));
    await expect(renderJobBytes(project(), job(), 'png', 1)).rejects.toThrow('gone');
    await expect(renderJobBytes(project(), job(), 'png', 1)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('renderThumbnail', () => {
  const COLORS = ['#e8505b', '#14b8a6', '#7c6cff', '#f5b544'];
  const RGB = COLORS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));

  function paintSlides() {
    h.renderSlide.mockImplementation((ctx, input) => {
      const g = ctx.createLinearGradient(0, 0, 0, input.height);
      g.addColorStop(0, COLORS[input.slideIndex]);
      g.addColorStop(1, COLORS[input.slideIndex]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, input.width, input.height);
      // a phone-like silhouette for the visual QA image
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.roundRect(input.width * 0.14, input.height * 0.3, input.width * 0.72, input.height * 0.64, input.width * 0.08);
      ctx.fill();
      return RESULT;
    });
  }

  const size = async (p: Project) => {
    const img = await decodeJpeg(await renderThumbnail(p));
    return [img.width, img.height];
  };

  it('holds only the first slides of the primary family, each in its own cell', async () => {
    paintSlides();
    const p = project({ id: 'thumb-1', updatedAt: 99, families: ['iphone', 'ipad'] });
    const bytes = await renderThumbnail(p);
    const qaDir = join(import.meta.dirname, '..', '..', '.qa');
    mkdirSync(qaDir, { recursive: true });
    writeFileSync(join(qaDir, 'runtime-thumbnail.jpg'), bytes);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const img = await decodeJpeg(bytes);
    // iPhone slides are 122 x 264; each sits 3 px into a 128 px cell (a multiple of JPEG's 16 px blocks).
    expect([img.width, img.height]).toEqual([3 * 128, 264]);
    expect(h.renderSlide).toHaveBeenCalledTimes(3);
    for (const [i, call] of h.renderSlide.mock.calls.entries()) {
      expect(call[1]).toMatchObject({ width: 122, height: 264, family: 'iphone', lang: 'en-US', slideIndex: i, slideCount: 4, placeholder: 'mock' });
    }
    expect(h.waitForPreviews).toHaveBeenCalledWith('thumb-1', [ASSET_A], 1500);
    expect(h.ensureFonts).toHaveBeenCalledWith(p);
    const layoutOf = thumbnailLayout(img.width, img.height, p.families);
    expect(layoutOf).toEqual({ slideWidth: 122, slideHeight: 264, lefts: [3, 131, 259] });
    for (const left of layoutOf?.lefts ?? []) {
      // The slide's middle, its outer columns and the margins beside them carry its own colour: no backdrop,
      // no gap colour, nothing from a neighbour. (Decoders blend chroma 1 px across a cell boundary; the
      // margins keep that away from the slide.)
      const k = (left - 3) / 128;
      for (const x of [left + 61, left, left + 121, left - 2, left + 122]) expect(near(img.pixel(x, 30), RGB[k], 16)).toBe(true);
    }
    // every canvas it drew on is freed
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((c) => c.width === 0)).toBe(true);
  });

  it('picks as many slides as fill a card: three phones, two iPads, one Mac or feature graphic', async () => {
    paintSlides();
    expect(await size(project({ families: ['ipad'] }))).toEqual([2 * 208, 264]);
    expect(await size(project({ families: ['android-phone'] }))).toEqual([3 * 160, 264]);
    expect(await size(project({ families: ['android-tablet', 'iphone'] }))).toEqual([3 * 160, 264]);
    expect(await size(project({ families: ['mac'] }))).toEqual([432, 264]);
    expect(await size(project({ families: ['play-feature'] }))).toEqual([560, 264]);
    expect(await size(project({ slides: [slide('s1'), slide('s2')] }))).toEqual([2 * 128, 264]);
    expect(await size(project({ families: ['tv' as FamilyId] }))).toEqual([3 * 128, 264]);
    expect(thumbnailLayout(432, 264, ['mac'])).toEqual({ slideWidth: 422, slideHeight: 264, lefts: [5] });
    expect(thumbnailLayout(2 * 208, 264, ['ipad', 'iphone'])).toEqual({ slideWidth: 198, slideHeight: 264, lefts: [5, 213] });
  });

  it('only accepts images it would draw for those families today', () => {
    expect(thumbnailLayout(384, 264, ['iphone'])).not.toBeNull();
    // the earlier layout (slides on a dark backdrop), another first family, too many cells, nothing
    expect(thumbnailLayout(351, 244, ['iphone'])).toBeNull();
    expect(thumbnailLayout(384, 264, ['ipad'])).toBeNull();
    expect(thumbnailLayout(384, 263, ['iphone'])).toBeNull();
    expect(thumbnailLayout(4 * 128, 264, ['iphone'])).toBeNull();
    expect(thumbnailLayout(0, 0, ['iphone'])).toBeNull();
  });

  it('serves previews through the cache while drawing', async () => {
    paintSlides();
    await renderThumbnail(project({ id: 'thumb-p' }));
    lastInput().getImage(ASSET_A);
    expect(h.cache.getPreview).toHaveBeenCalledWith('thumb-p', ASSET_A);
  });

  it('leaves out a slide that fails and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    paintSlides();
    const paint = h.renderSlide.getMockImplementation();
    h.renderSlide.mockImplementation((ctx, input) => {
      if (input.slideIndex === 1) throw new Error('bad slide');
      return paint ? paint(ctx, input) : RESULT;
    });
    h.resolveLayout.mockImplementation((_p, s) => {
      if (s.id === 's3') throw new Error('no layout');
      return s.layouts.iphone ?? layout([]);
    });
    const img = await decodeJpeg(await renderThumbnail(project()));
    expect([img.width, img.height]).toEqual([128, 264]);
    expect(near(img.pixel(3 + 61, 30), RGB[0], 16)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(created.every((c) => c.width === 0)).toBe(true);
  });

  it('rejects when no slide can be drawn', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.renderSlide.mockImplementation(() => {
      throw new Error('broken engine');
    });
    await expect(renderThumbnail(project())).rejects.toThrow('No slide could be drawn');
    expect(created.every((c) => c.width === 0)).toBe(true);
    h.renderSlide.mockClear();
    await expect(renderThumbnail(project({ slides: [] }))).rejects.toThrow('No slide could be drawn');
    expect(h.renderSlide).not.toHaveBeenCalled();
  });

  it('puts see-through slide pixels on white, as an export does', async () => {
    h.renderSlide.mockImplementation((ctx, input) => {
      ctx.clearRect(0, 0, input.width, input.height);
      return RESULT;
    });
    const img = await decodeJpeg(await renderThumbnail(project()));
    expect(near(img.pixel(64, 132), [255, 255, 255], 6)).toBe(true);
  });

  it('still renders when waiting for previews fails', async () => {
    h.waitForPreviews.mockRejectedValue(new Error('cache gone'));
    await expect(renderThumbnail(project())).resolves.toBeInstanceOf(Uint8Array);
  });
});

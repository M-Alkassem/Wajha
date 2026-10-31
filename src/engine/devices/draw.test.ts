import { describe, expect, it } from 'vitest';
import type { DeviceElement, DeviceFrameId, FrameFinish, FrameStyle, Shadow } from '../../model/types';
import type { Ctx2D, DrawDeviceOptions, ImageLike } from '../types';
import { nodeEnv, pixel, solidImage, testCanvas } from '../testing/canvas.node';
import { deviceGeometry, drawDevice } from './index';
import { frameLayout } from './geometry';
import { islandRect } from './iphone';
import { punchHole } from './android';

const FRAMES: DeviceFrameId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'macbook', 'watch', 'tv', 'vision', 'browser', 'none'];
const FINISHES: FrameFinish[] = ['metal', 'matte', 'clay'];
const ASPECT: Record<DeviceFrameId, number> = {
  iphone: 2868 / 1320,
  ipad: 2752 / 2064,
  'android-phone': 2400 / 1080,
  'android-tablet': 2560 / 1600,
  macbook: 0.625,
  watch: 514 / 422,
  tv: 0.5625,
  vision: 0.5625,
  browser: 0.625,
  none: 2,
};

function element(frame: DeviceFrameId, style: Partial<FrameStyle> = {}, shadow: Shadow | null = null): DeviceElement {
  return {
    id: 'device-1',
    kind: 'device',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    frame,
    style: { color: '#2b2b30', finish: 'metal', bezel: 'black', ...style },
    width: 0.8,
    slot: 'main',
    cornerRadius: 0.08,
    shadow,
  };
}

function options(el: DeviceElement, widthPx: number, overrides: Partial<DrawDeviceOptions> = {}): DrawDeviceOptions {
  return {
    el,
    widthPx,
    unit: 600,
    screenAspect: ASPECT[el.frame],
    screen: null,
    placeholder: 'mock',
    mock: { seed: 2, palette: ['#6c5ce7', '#ff7a59'], dark: false },
    env: nodeEnv,
    ...overrides,
  };
}

/** Draws centred on a canvas sized to the device plus a margin; returns the canvas, context and top-left of the device box. */
function render(o: DrawDeviceOptions, margin = 40, prepare?: (ctx: Ctx2D) => void) {
  const g = deviceGeometry(o.el.frame, o.widthPx, o.screenAspect);
  const w = Math.ceil(g.width + margin * 2);
  const h = Math.ceil(g.height + margin * 2);
  const { canvas, ctx } = testCanvas(w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  prepare?.(ctx);
  const result = drawDevice(ctx, o);
  ctx.restore();
  return { canvas, ctx, g, result, left: w / 2 - g.width / 2, top: h / 2 - g.height / 2 };
}

const isNearBlack = ([r, g, b, a]: number[]) => r < 40 && g < 40 && b < 40 && a === 255;

describe('drawDevice smoke tests', () => {
  const red = solidImage(300, 650, '#ff0000');
  for (const frame of FRAMES) {
    it(`${frame}: every finish x bezel x screen draws and reports its geometry`, () => {
      for (const finish of FINISHES) {
        for (const bezel of ['black', 'match'] as const) {
          for (const variant of ['shot', 'mock', 'empty'] as const) {
            const el = element(frame, { finish, bezel, color: finish === 'clay' ? '#f6d5c8' : '#b7aea3' }, { color: '#00000055', blur: 0.04, x: 0, y: 0.02 });
            const o = options(el, 180, {
              screen: variant === 'shot' ? red : null,
              placeholder: variant === 'empty' ? 'empty' : 'mock',
              mock: { seed: 3, palette: [], dark: bezel === 'match' },
            });
            const { ctx, g, result, left, top } = render(o);
            if (frame === 'none') {
              expect({ ...result, screen: { ...result.screen, radius: 0 } }).toEqual({ ...g, screen: { ...g.screen, radius: 0 } });
            } else {
              expect(result).toEqual(g);
            }
            const center = pixel(ctx, left + g.screen.x + g.screen.w / 2, top + g.screen.y + g.screen.h * 0.6);
            expect(center[3]).toBe(255);
          }
        }
      }
    });
  }
});

describe('drawDevice pixels', () => {
  it('shows the screenshot colour in the middle of the screen', () => {
    const blue = solidImage(400, 900, '#1e64ff');
    for (const frame of FRAMES) {
      const { ctx, g, left, top } = render(options(element(frame), 260, { screen: blue }));
      const [r, gr, b, a] = pixel(ctx, left + g.screen.x + g.screen.w / 2, top + g.screen.y + g.screen.h / 2);
      expect([r, gr, b, a]).toEqual([0x1e, 0x64, 0xff, 255]);
    }
  });

  it('cover-fits screenshots of another aspect without leaving gaps', () => {
    const wide = solidImage(800, 200, '#00c853');
    const { ctx, g, left, top } = render(options(element('iphone'), 240, { screen: wide }));
    for (const fy of [0.15, 0.5, 0.85]) {
      const p = pixel(ctx, left + g.screen.x + g.screen.w * 0.5, top + g.screen.y + g.screen.h * fy);
      expect(p).toEqual([0, 0xc8, 0x53, 255]);
    }
  });

  it('keeps the corners outside the body transparent', () => {
    // A television's corners are nearly square, like the real thing.
    for (const frame of FRAMES.filter((f) => f !== 'tv')) {
      const { ctx, g, left, top } = render(options(element(frame), 400));
      expect(pixel(ctx, left + 0.5, top + 0.5)[3], frame).toBe(0);
      expect(pixel(ctx, left + g.width - 1.5, top + 0.5)[3]).toBe(0);
      expect(pixel(ctx, left + 0.5, top + g.height - 1.5)[3]).toBe(0);
      expect(pixel(ctx, left + g.width - 1.5, top + g.height - 1.5)[3]).toBe(0);
    }
  });

  it('leaves no gap between bezel and screen at rounded screen corners', () => {
    const white = solidImage(300, 650, '#ffffff');
    for (const frame of ['iphone', 'ipad', 'android-phone', 'android-tablet'] as const) {
      const o = options(element(frame, { color: '#d9d9de' }), 900, { screen: white });
      const { ctx, left, top } = render(o);
      const L = frameLayout(frame, 900, o.screenAspect);
      // Two pixels outside each rounded screen corner, on its diagonal: bezel, fully opaque.
      const r = L.screen.radius;
      const d = (r + 2) / Math.SQRT2;
      for (const [fx, fy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const cx = left + L.screen.x + (fx ? L.screen.w - r : r);
        const cy = top + L.screen.y + (fy ? L.screen.h - r : r);
        expect(pixel(ctx, cx + (fx ? d : -d), cy + (fy ? d : -d))[3], frame).toBe(255);
      }
    }
  });

  it('paints the Dynamic Island near-black on a bright screen', () => {
    const white = solidImage(300, 650, '#ffffff');
    const o = options(element('iphone', { color: '#f5f5f7' }), 300, { screen: white });
    const { ctx, left, top } = render(o);
    const L = frameLayout('iphone', 300, o.screenAspect);
    const r = islandRect(L.screen);
    expect(isNearBlack(pixel(ctx, left + r.x + r.w / 2, top + r.y + r.h / 2))).toBe(true);
    expect(isNearBlack(pixel(ctx, left + r.x + r.h / 2, top + r.y + r.h / 2))).toBe(true);
    // Just below the island the screenshot shows again.
    expect(pixel(ctx, left + r.x + r.w / 2, top + r.y + r.h + 4)).toEqual([255, 255, 255, 255]);
  });

  it('paints the punch-hole camera near-black', () => {
    const white = solidImage(300, 650, '#ffffff');
    const o = options(element('android-phone', { color: '#d9d9de' }), 300, { screen: white });
    const { ctx, left, top } = render(o);
    const L = frameLayout('android-phone', 300, o.screenAspect);
    const hole = punchHole(L.screen, L.w);
    expect(isNearBlack(pixel(ctx, left + hole.cx, top + hole.cy))).toBe(true);
  });

  it('paints the MacBook notch in the bezel colour', () => {
    const white = solidImage(600, 375, '#ffffff');
    const o = options(element('macbook'), 600, { screen: white });
    const { ctx, left, top } = render(o);
    const L = frameLayout('macbook', 600, 0.625);
    if (L.kind !== 'macbook') throw new Error('expected macbook');
    const nx = left + L.screen.x + L.screen.w / 2 - L.notch.w * 0.3;
    expect(isNearBlack(pixel(ctx, nx, top + L.screen.y + L.notch.h * 0.5))).toBe(true);
    expect(pixel(ctx, nx, top + L.screen.y + L.notch.h + 3)).toEqual([255, 255, 255, 255]);
  });

  it('uses a near-black bezel for "black" and the body colour for "match"', () => {
    const white = solidImage(300, 650, '#ffffff');
    const black = render(options(element('ipad', { color: '#cfe3ff', finish: 'clay', bezel: 'black' }), 400, { screen: white }));
    const matched = render(options(element('ipad', { color: '#cfe3ff', finish: 'clay', bezel: 'match' }), 400, { screen: white }));
    const L = frameLayout('ipad', 400, ASPECT.ipad);
    if (L.kind !== 'slab') throw new Error('expected slab');
    const bx = L.w * 0.3;
    const by = L.band + (L.inset - L.band) / 2;
    expect(isNearBlack(pixel(black.ctx, black.left + bx, black.top + by))).toBe(true);
    const [r, g, b] = pixel(matched.ctx, matched.left + bx, matched.top + by);
    expect(Math.abs(r - 0xcf)).toBeLessThan(6);
    expect(Math.abs(g - 0xe3)).toBeLessThan(6);
    expect(Math.abs(b - 0xff)).toBeLessThan(6);
  });

  it('browser chrome follows the frame colour luminance', () => {
    const light = render(options(element('browser', { color: '#f5f5f7' }), 500));
    const dark = render(options(element('browser', { color: '#1b1b1f' }), 500));
    const lum = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    const at = (r: typeof light) => pixel(r.ctx, r.left + r.g.width * 0.2, r.top + r.g.screen.y * 0.2);
    expect(lum(at(light))).toBeGreaterThan(200);
    expect(lum(at(dark))).toBeLessThan(80);
  });
});

describe('drawDevice shadow', () => {
  const shadow: Shadow = { color: '#000000', blur: 0.03, x: 0, y: 0.05 };

  it('casts a soft shadow below the body only when el.shadow is set', () => {
    const withShadow = render(options(element('none', {}, shadow), 200), 80);
    const without = render(options(element('none'), 200), 80);
    const below = (r: typeof withShadow) => pixel(r.ctx, r.left + r.g.width / 2, r.top + r.g.height + 20);
    expect(below(withShadow)[3]).toBeGreaterThan(40);
    expect(below(without)[3]).toBe(0);
    // Light comes from above: nothing above the device.
    expect(pixel(withShadow.ctx, withShadow.left + withShadow.g.width / 2, withShadow.top - 30)[3]).toBe(0);
  });

  it('paints only the shadow, never a copy of the casting shape', () => {
    const clear = solidImage(100, 200, 'rgba(0, 0, 0, 0)');
    const far: Shadow = { color: '#000000', blur: 0, x: 0, y: 0.5 };
    const r = render(options(element('none', {}, far), 100, { screen: clear, unit: 400 }), 240);
    // The body area stays empty: the casting shape was drawn off-canvas.
    expect(pixel(r.ctx, r.left + 50, r.top + 100)[3]).toBe(0);
    // The hard shadow lands exactly 0.5 * unit lower.
    expect(pixel(r.ctx, r.left + 50, r.top + 200 + 100)[3]).toBe(255);
  });

  it('keeps the light direction when the device is rotated', () => {
    const r = render(options(element('none', {}, shadow), 160), 140, (ctx) => ctx.rotate(Math.PI / 2));
    const cx = r.canvas.width / 2;
    const cy = r.canvas.height / 2;
    // Rotated 90 degrees the body spans 160 px vertically around the centre; the shadow still falls downwards.
    const below = pixel(r.ctx, cx, cy + 80 + 20);
    const above = pixel(r.ctx, cx, cy - 80 - 20);
    expect(below[3]).toBeGreaterThan(above[3] + 30);
  });

  it('scales blur and offsets with the canvas transform (DPR)', () => {
    const hard: Shadow = { color: '#000000', blur: 0, x: 0, y: 0.05 };
    const o = options(element('none', {}, hard), 100, { unit: 400 });
    const { canvas, ctx } = testCanvas(400, 600);
    ctx.save();
    ctx.translate(200, 250);
    ctx.scale(2, 2);
    drawDevice(ctx, o);
    ctx.restore();
    // Device is 100 x 200 local units -> 200 x 400 px, bottom edge at y = 450. Offset 20 units -> 40 px.
    expect(pixel(ctx, 200, 450 + 35)[3]).toBe(255);
    expect(pixel(ctx, 200, 450 + 45)[3]).toBe(0);
    expect(canvas.width).toBe(400);
  });

  it('ignores invisible or malformed shadows', () => {
    for (const s of [
      { color: '#00000000', blur: 0.05, x: 0, y: 0.05 },
      { color: '#000000', blur: NaN, x: NaN, y: NaN },
      { color: 'not a colour', blur: 0, x: 0, y: 0 },
    ]) {
      const r = render(options(element('iphone', {}, s), 120), 60);
      expect(pixel(r.ctx, r.left + r.g.width / 2, r.top + r.g.height + 30)[3]).toBe(0);
    }
  });
});

describe('drawDevice robustness', () => {
  it('restores the context and ignores a shadow left on it by the caller', () => {
    const { ctx } = testCanvas(300, 600);
    ctx.translate(150, 300);
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = 'red';
    ctx.shadowBlur = 30;
    ctx.lineWidth = 7;
    ctx.fillStyle = '#123456';
    const before = ctx.getTransform();
    drawDevice(ctx, options(element('iphone'), 200));
    const after = ctx.getTransform();
    expect([after.a, after.b, after.c, after.d, after.e, after.f]).toEqual([before.a, before.b, before.c, before.d, before.e, before.f]);
    expect(ctx.globalAlpha).toBeCloseTo(0.9, 5);
    expect(ctx.shadowBlur).toBe(30);
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.fillStyle).toBe('#123456');
    // No red glow around the body.
    expect(pixel(ctx, 150, 300 + 220)[3]).toBe(0);
  });

  it('survives tiny widths, NaN inputs, zero-size images and extreme aspects', () => {
    const empty = { width: 0, height: 0 } as unknown as ImageLike;
    for (const frame of FRAMES) {
      for (const w of [0.4, 1, 3, 9]) render(options(element(frame), w), 4);
      const nan = render(options(element(frame), NaN, { screenAspect: NaN, unit: NaN }), 4);
      for (const v of [nan.result.width, nan.result.height, nan.result.screen.radius]) expect(Number.isFinite(v)).toBe(true);
      const zero = render(options(element(frame), 120, { screen: empty }));
      expect(pixel(zero.ctx, zero.left + zero.g.screen.x + zero.g.screen.w / 2, zero.top + zero.g.screen.y + zero.g.screen.h * 0.6)[3]).toBe(255);
      render(options(element(frame), 120, { screenAspect: 4 }));
      render(options(element(frame), 300, { screenAspect: 0.3 }));
    }
  });

  it('tolerates odd styles: bad colours, unknown finishes, translucent colours', () => {
    const odd = [
      { color: 'oops', finish: 'metal', bezel: 'black' },
      { color: '#ff000080', finish: 'chrome', bezel: 'match' },
      { color: '#abc', finish: 'matte', bezel: 'sideways' },
    ] as unknown as FrameStyle[];
    for (const style of odd) {
      const r = render(options({ ...element('android-phone'), style }, 150));
      const edge = pixel(r.ctx, r.left + 1.2, r.top + r.g.height / 2);
      expect(edge[3]).toBeGreaterThan(200);
    }
  });
});

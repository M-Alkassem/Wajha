import { describe, expect, it } from 'vitest';
import type { DeviceFrameId } from '../../model/types';
import type { DeviceGeometry } from '../types';
import { DEFAULT_ASPECT, frameLayout, knownFrame, MAC_SPEC, MAX_ASPECT, MAX_WIDTH, MIN_ASPECT, MIN_WIDTH, sanitizeAspect, sanitizeWidth, SLAB_SPECS } from './geometry';
import { deviceGeometry } from './index';

const FRAMES: DeviceFrameId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'macbook', 'browser', 'none'];
const ASPECTS = [0.3, 0.45, 0.625, 1, 4 / 3, 1.6, 2868 / 1320, 2400 / 1080, 3, 4];
const WIDTHS = [1, 2.5, 17, 120, 333.3, 1320, 4000];
const EPS = 1e-6;

function numbers(g: DeviceGeometry): number[] {
  return [g.width, g.height, g.screen.x, g.screen.y, g.screen.w, g.screen.h, g.screen.radius];
}

function expectInvariants(g: DeviceGeometry, width: number, aspect: number): void {
  for (const n of numbers(g)) expect(Number.isFinite(n)).toBe(true);
  expect(g.width).toBeCloseTo(width, 9);
  expect(g.height).toBeGreaterThan(0);
  expect(g.screen.w).toBeGreaterThan(0);
  expect(g.screen.h).toBeGreaterThan(0);
  expect(g.screen.x).toBeGreaterThanOrEqual(0);
  expect(g.screen.y).toBeGreaterThanOrEqual(0);
  expect(g.screen.x + g.screen.w).toBeLessThanOrEqual(g.width + EPS);
  expect(g.screen.y + g.screen.h).toBeLessThanOrEqual(g.height + EPS);
  expect(g.screen.radius).toBeGreaterThanOrEqual(0);
  expect(g.screen.radius).toBeLessThanOrEqual(Math.min(g.screen.w, g.screen.h) / 2 + EPS);
  expect(g.screen.h / g.screen.w).toBeCloseTo(aspect, 9);
}

describe('deviceGeometry invariants', () => {
  for (const frame of FRAMES) {
    it(`${frame}: screen inside body, positive, aspect kept, radius bounded`, () => {
      for (const aspect of ASPECTS) {
        for (const width of WIDTHS) expectInvariants(deviceGeometry(frame, width, aspect), width, aspect);
      }
    });
  }

  it('is deterministic and pure', () => {
    for (const frame of FRAMES) {
      const a = deviceGeometry(frame, 417.25, 2.1);
      const b = deviceGeometry(frame, 417.25, 2.1);
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      a.screen.x = -999;
      expect(deviceGeometry(frame, 417.25, 2.1).screen.x).not.toBe(-999);
    }
  });

  it('every frame but "none" has a body around the screen', () => {
    for (const frame of FRAMES) {
      const g = deviceGeometry(frame, 300, 2);
      if (frame === 'none') {
        expect(g.screen).toMatchObject({ x: 0, y: 0, w: 300, h: 600 });
      } else {
        expect(g.height).toBeGreaterThan(g.screen.h);
        expect(g.screen.y).toBeGreaterThan(0);
      }
    }
  });

  it('scales linearly with width', () => {
    for (const frame of FRAMES) {
      const a = deviceGeometry(frame, 100, 2);
      const b = deviceGeometry(frame, 1000, 2);
      numbers(a).forEach((v, i) => expect(numbers(b)[i]).toBeCloseTo(v * 10, 6));
    }
  });
});

describe('deviceGeometry input sanitising', () => {
  it('never returns NaN for NaN, infinite, zero or negative inputs', () => {
    const bad = [NaN, Infinity, -Infinity, 0, -5, 1e-9];
    for (const frame of FRAMES) {
      for (const w of bad) {
        for (const a of bad) {
          const g = deviceGeometry(frame, w, a);
          for (const n of numbers(g)) expect(Number.isFinite(n)).toBe(true);
          expect(g.width).toBeGreaterThanOrEqual(MIN_WIDTH);
          expect(g.width).toBeLessThanOrEqual(MAX_WIDTH);
          expect(g.screen.w).toBeGreaterThan(0);
          expect(g.screen.h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('clamps width and aspect', () => {
    expect(sanitizeWidth(NaN)).toBe(MIN_WIDTH);
    expect(sanitizeWidth(-3)).toBe(MIN_WIDTH);
    expect(sanitizeWidth(0.2)).toBe(MIN_WIDTH);
    expect(sanitizeWidth(Infinity)).toBe(MAX_WIDTH);
    expect(sanitizeWidth(640)).toBe(640);
    expect(sanitizeAspect('iphone', 10)).toBe(MAX_ASPECT);
    expect(sanitizeAspect('iphone', 0.01)).toBe(MIN_ASPECT);
    expect(sanitizeAspect('iphone', NaN)).toBeCloseTo(DEFAULT_ASPECT.iphone, 9);
    expect(sanitizeAspect('macbook', -1)).toBeCloseTo(DEFAULT_ASPECT.macbook, 9);
    expect(sanitizeAspect('ipad', 0)).toBeCloseTo(DEFAULT_ASPECT.ipad, 9);
    const g = deviceGeometry('iphone', 200, 9);
    expect(g.screen.h / g.screen.w).toBeCloseTo(MAX_ASPECT, 9);
    const wide = deviceGeometry('ipad', 200, 0.05);
    expect(wide.screen.h / wide.screen.w).toBeCloseTo(MIN_ASPECT, 9);
  });

  it('falls back to the frame default aspect for NaN', () => {
    for (const frame of FRAMES) {
      const g = deviceGeometry(frame, 500, NaN);
      expect(g.screen.h / g.screen.w).toBeCloseTo(DEFAULT_ASPECT[frame], 9);
    }
  });

  it('treats unknown frame ids as a bare screenshot', () => {
    const odd = 'television' as unknown as DeviceFrameId;
    expect(knownFrame('television')).toBe('none');
    expect(deviceGeometry(odd, 300, 2)).toEqual(deviceGeometry('none', 300, 2));
  });
});

describe('frame proportions', () => {
  it('iphone: Pro proportions, concentric screen corners', () => {
    const L = frameLayout('iphone', 1000, 2868 / 1320);
    if (L.kind !== 'slab') throw new Error('expected slab');
    expect(L.radius / 1000).toBeCloseTo(0.158, 3);
    expect(L.band / 1000).toBeCloseTo(0.0125, 4);
    expect(L.inset / 1000).toBeGreaterThan(0.03);
    expect(L.inset / 1000).toBeLessThan(0.04);
    expect(L.screen.radius).toBeCloseTo(L.radius - L.inset, 6);
    // Real iPhone 16 Pro Max: 163 x 77.6 mm.
    expect(L.h / L.w).toBeGreaterThan(2.05);
    expect(L.h / L.w).toBeLessThan(2.15);
  });

  it('screen radius never goes negative or beyond half the screen', () => {
    for (const frame of ['iphone', 'ipad', 'android-phone', 'android-tablet'] as const) {
      for (const aspect of [0.3, 1, 4]) {
        const L = frameLayout(frame, 50, aspect);
        expect(L.screen.radius).toBeGreaterThanOrEqual(0);
        expect(L.screen.radius).toBeLessThanOrEqual(Math.min(L.screen.w, L.screen.h) / 2 + EPS);
      }
    }
    for (const spec of Object.values(SLAB_SPECS)) {
      expect(spec.inset).toBeGreaterThan(spec.band);
      expect(spec.radius).toBeGreaterThan(0);
    }
  });

  it('ipad and tablets have uniform bezels', () => {
    for (const frame of ['ipad', 'android-tablet'] as const) {
      const g = deviceGeometry(frame, 800, 1.4);
      const left = g.screen.x;
      const right = g.width - g.screen.x - g.screen.w;
      const top = g.screen.y;
      const bottom = g.height - g.screen.y - g.screen.h;
      for (const b of [right, top, bottom]) expect(b).toBeCloseTo(left, 6);
    }
    expect(deviceGeometry('ipad', 1000, 1.33).screen.x / 1000).toBeCloseTo(0.045, 4);
    expect(deviceGeometry('android-tablet', 1000, 1.6).screen.x / 1000).toBeCloseTo(0.05, 4);
  });

  it('macbook: base spans the width, screen sits inside the narrower lid', () => {
    const L = frameLayout('macbook', 1000, 0.625);
    if (L.kind !== 'macbook') throw new Error('expected macbook');
    expect(L.base.x).toBe(0);
    expect(L.base.w).toBe(1000);
    expect(L.base.y + L.base.h).toBeCloseTo(L.h, 9);
    expect(L.lid.w).toBeCloseTo(1000 * MAC_SPEC.lid, 6);
    expect(L.screen.x).toBeGreaterThan(L.lid.x);
    expect(L.screen.x + L.screen.w).toBeLessThan(L.lid.x + L.lid.w);
    expect(L.screen.y + L.screen.h).toBeLessThan(L.lid.h);
    // Thicker chin than top bezel.
    const top = L.screen.y - L.lid.y;
    const chin = L.lid.h - (L.screen.y + L.screen.h);
    expect(chin).toBeGreaterThan(top * 1.5);
    expect(L.notch.w).toBeGreaterThan(0);
    expect(L.notch.h).toBeLessThan(L.screen.h * 0.25 + EPS);
  });

  it('browser: toolbar on top, full-width page below', () => {
    const g = deviceGeometry('browser', 1000, 0.625);
    expect(g.screen.x).toBe(0);
    expect(g.screen.w).toBe(1000);
    expect(g.screen.y / 1000).toBeCloseTo(0.055, 6);
    expect(g.height).toBeCloseTo(55 + 625, 6);
  });

  it('none: radius follows the element corner radius, clamped', () => {
    const r = (cr: number, aspect = 2) => frameLayout('none', 200, aspect, cr).screen.radius;
    expect(r(0.1)).toBeCloseTo(20, 9);
    expect(r(0)).toBe(0);
    expect(r(-1)).toBe(0);
    expect(r(5)).toBeCloseTo(100, 9);
    expect(r(5, 0.3)).toBeCloseTo(30, 9);
    expect(Number.isFinite(r(NaN))).toBe(true);
  });
});

describe('devices on their side', () => {
  it('turns a phone whose screen is wider than tall, keeping its bezel and screen inside the body', () => {
    const g = deviceGeometry('iphone', 1000, 1320 / 2868);
    expect(g.width).toBeCloseTo(1000);
    expect(g.height).toBeLessThan(g.width);
    expect(g.screen.w / g.screen.h).toBeCloseTo(2868 / 1320, 2);
    expect(g.screen.x).toBeGreaterThan(0);
    expect(g.screen.y).toBeGreaterThan(0);
    expect(g.screen.x + g.screen.w).toBeLessThan(g.width);
    expect(g.screen.y + g.screen.h).toBeLessThan(g.height);
    // The border is as thick as on the upright phone of the same short side.
    const up = deviceGeometry('iphone', g.height, 2868 / 1320);
    expect(g.screen.y).toBeCloseTo(up.screen.x);
  });

  it('never turns a laptop, a television or a watch', () => {
    for (const frame of ['macbook', 'tv', 'watch'] as const) {
      const g = deviceGeometry(frame, 1000, frame === 'watch' ? 1.2 : 0.56);
      expect(g.screen.w, frame).toBeLessThan(g.width);
    }
    expect(deviceGeometry('tv', 1000, 0.5625).height).toBeLessThan(1000 * 0.62);
  });
});

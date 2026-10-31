/**
 * Every device frame on every kind of slide, with the real device painter:
 * each keeps its own shape, whatever the slide's family.
 */
import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_ORDER } from '../model/catalog';
import type { DeviceFrameId } from '../model/types';
import { deviceScreenAspect, renderSlide } from './render';
import { deviceEl, renderInput } from './testing/fixtures';
import { nodeEnv, registerPrimaryFonts, testCanvas } from './testing/canvas.node';

registerPrimaryFonts();

const FRAMES: DeviceFrameId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'macbook', 'browser', 'none'];
const PORTRAIT = new Set<DeviceFrameId>(['iphone', 'ipad', 'android-phone', 'android-tablet']);
const LANDSCAPE = new Set<DeviceFrameId>(['macbook', 'browser']);

describe('deviceScreenAspect', () => {
  it("keeps the frame's screen without a screenshot", () => {
    expect(deviceScreenAspect('macbook', 'iphone', null)).toBeCloseTo(FAMILIES.mac.screenAspect);
    expect(deviceScreenAspect('ipad', 'mac', null)).toBeCloseTo(FAMILIES.ipad.screenAspect);
    expect(deviceScreenAspect('none', 'ipad', null)).toBeCloseTo(FAMILIES.ipad.screenAspect);
  });

  it('takes a screenshot of nearly the same shape, and ignores one of another shape', () => {
    expect(deviceScreenAspect('iphone', 'iphone', 2.2)).toBe(2.2);
    expect(deviceScreenAspect('iphone', 'iphone', 0.625)).toBeCloseTo(FAMILIES.iphone.screenAspect);
    expect(deviceScreenAspect('macbook', 'mac', 2.17)).toBeCloseTo(FAMILIES.mac.screenAspect);
    expect(deviceScreenAspect('none', 'iphone', 0.625)).toBe(0.625);
    expect(deviceScreenAspect('iphone', 'iphone', Number.NaN)).toBeCloseTo(FAMILIES.iphone.screenAspect);
  });
});

describe('every frame on every slide family', () => {
  for (const family of FAMILY_ORDER) {
    it(`keeps each frame's shape on ${family} slides`, () => {
      const { width, height } = FAMILIES[family].design;
      const scale = 400 / Math.max(width, height);
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      for (const frame of FRAMES) {
        const { ctx } = testCanvas(w, h);
        const el = deviceEl({ id: frame, frame, width: 0.5, rotation: 0, shadow: null });
        const { boxes } = renderSlide(ctx, renderInput({ env: nodeEnv, width: w, height: h, family, elements: [el] }));
        const box = boxes[0];
        expect(box.w, `${frame} on ${family}`).toBeGreaterThan(0);
        if (PORTRAIT.has(frame)) expect(box.h / box.w, `${frame} on ${family} stays upright`).toBeGreaterThan(1.1);
        if (LANDSCAPE.has(frame)) expect(box.h / box.w, `${frame} on ${family} stays wide`).toBeLessThan(0.9);
      }
    });
  }
});

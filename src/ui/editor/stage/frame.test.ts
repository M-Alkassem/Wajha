import { describe, expect, it } from 'vitest';
import { MAX_BITMAP_PIXELS, bitmapDpr, cornerRadius, overLimitText, releaseBitmap, slideRadius, storeAllowance } from './frame';

describe('bitmapDpr', () => {
  it('follows the screen up to 2x', () => {
    expect(bitmapDpr(340, 740, 1)).toBe(1);
    expect(bitmapDpr(340, 740, 2)).toBe(2);
    expect(bitmapDpr(340, 740, 3)).toBe(2);
    expect(bitmapDpr(340, 740, Number.NaN)).toBe(1);
  });

  it('keeps huge slides within the pixel budget', () => {
    const k = bitmapDpr(1400, 3000, 2);
    expect(k).toBeLessThan(2);
    expect(1400 * k * 3000 * k).toBeLessThanOrEqual(MAX_BITMAP_PIXELS + 1);
  });
});

describe('releaseBitmap', () => {
  it('frees offscreen bitmaps of every size, fit-zoom slides included', () => {
    // A slide at fit zoom on a 1440 x 900 window at 2x: under 1 MP, which used to stay allocated.
    const fit = { width: 662, height: 1440 };
    expect(releaseBitmap(fit)).toBe(true);
    expect(fit).toEqual({ width: 0, height: 0 });
    const zoomed = { width: 2400, height: 5200 };
    expect(releaseBitmap(zoomed)).toBe(true);
    expect(zoomed).toEqual({ width: 0, height: 0 });
  });

  it('says when there was nothing to free', () => {
    expect(releaseBitmap({ width: 0, height: 0 })).toBe(false);
  });
});

describe('slide radii', () => {
  it('rounds about 2.5 % of the short side within bounds', () => {
    expect(slideRadius(340, 740)).toBe(9);
    expect(slideRadius(20, 40)).toBe(3);
    expect(slideRadius(4000, 3000)).toBe(24);
  });

  it('rounds only the outer corners of a panorama strip', () => {
    expect(cornerRadius(1, 3, 9, false)).toBe('9px');
    expect(cornerRadius(0, 3, 9, true)).toBe('9px 0px 0px 9px');
    expect(cornerRadius(1, 3, 9, true)).toBe('0px 0px 0px 0px');
    expect(cornerRadius(2, 3, 9, true)).toBe('0px 9px 9px 0px');
    expect(cornerRadius(0, 1, 9, true)).toBe('9px 9px 9px 9px');
  });
});

describe('overLimitText', () => {
  it('names the store and its limit', () => {
    expect(storeAllowance('mac')).toBe('the App Store allows 10');
    expect(storeAllowance('play-feature')).toBe('Google Play allows 1');
    expect(overLimitText('iphone')).toBe('Not exported: the App Store allows 10');
    expect(overLimitText('android-phone')).toBe('Not exported: Google Play allows 8');
  });
});

import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_ORDER } from './catalog';
import { BEZEL_ALLOWANCE, canvasMetrics, deviceHeightFactor, familyForCanvas, familyMetrics, isFamilyDefaultFrame } from './geometry';

describe('canvas metrics', () => {
  it('measures in u = the short side', () => {
    const m = canvasMetrics({ width: 1320, height: 2868 });
    expect(m.u).toBe(1320);
    expect(m.wu).toBe(1);
    expect(m.hu).toBeCloseTo(2868 / 1320);
    expect(m.wide).toBe(false);
    const w = canvasMetrics({ width: 2880, height: 1800 });
    expect(w.u).toBe(1800);
    expect(w.wu).toBeCloseTo(1.6);
    expect(w.wide).toBe(true);
  });

  it('never divides by zero', () => {
    for (const bad of [{ width: 0, height: 0 }, { width: NaN, height: -3 }, { width: Infinity, height: 10 }, null, undefined]) {
      const m = canvasMetrics(bad as never);
      expect(Number.isFinite(m.u) && m.u > 0).toBe(true);
      expect(Number.isFinite(m.wu) && Number.isFinite(m.hu)).toBe(true);
    }
  });

  it('classifies the catalog families', () => {
    expect(FAMILY_ORDER.filter((f) => familyMetrics(f).wide)).toEqual(['mac', 'play-feature']);
  });
});

describe('device estimates', () => {
  it('adds a per-frame bezel allowance to the screen aspect', () => {
    expect(deviceHeightFactor('iphone', 2)).toBeCloseTo(2 + BEZEL_ALLOWANCE.iphone);
    expect(deviceHeightFactor('none', 2)).toBe(2);
    expect(deviceHeightFactor('browser', 0.625)).toBeGreaterThan(0.625);
  });

  it('keeps aspects sane', () => {
    expect(deviceHeightFactor('iphone', NaN)).toBeCloseTo(2 + BEZEL_ALLOWANCE.iphone);
    expect(deviceHeightFactor('iphone', 1e9)).toBeLessThanOrEqual(5.1);
    expect(deviceHeightFactor('iphone', -1)).toBeGreaterThan(0);
  });

  it('knows which frames are family defaults', () => {
    for (const f of FAMILY_ORDER) expect(isFamilyDefaultFrame(FAMILIES[f].defaultFrame)).toBe(true);
    expect(isFamilyDefaultFrame('browser')).toBe(false);
    expect(isFamilyDefaultFrame('none')).toBe(false);
  });
});

describe('familyForCanvas', () => {
  it('finds a family by its exact design size', () => {
    for (const f of FAMILY_ORDER) expect(familyForCanvas(FAMILIES[f].design)).toBe(f);
  });

  it('falls back to the closest aspect', () => {
    expect(familyForCanvas({ width: 1290, height: 2796 })).toBe('iphone');
    expect(familyForCanvas({ width: 2560, height: 1600 })).toBe('mac');
    expect(familyForCanvas({ width: 2048, height: 1000 })).toBe('play-feature');
    expect(familyForCanvas({ width: 1668, height: 2420 })).toBe('ipad');
  });
});

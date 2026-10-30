import { describe, expect, it } from 'vitest';
import type { FamilyId } from '../../../model/types';
import { TOPBAR_METRICS, topBarDensity, topBarNeeds } from './density';
import { projectFileName } from './actions';
import { zoomChoice, zoomLabel } from './zoom';

const ALL: FamilyId[] = ['iphone', 'ipad', 'android-phone', 'android-tablet', 'mac', 'play-feature'];
const TWO: FamilyId[] = ['iphone', 'android-phone'];
const full = { familyLabels: true, languageName: true };

describe('topBarDensity', () => {
  it('shows everything when there is room', () => {
    expect(topBarDensity(1920, ALL)).toEqual(full);
    expect(topBarDensity(1440, ALL)).toEqual(full);
    // The minimum desktop window (1100 px) still fits two labelled families and the language name.
    expect(topBarDensity(1100, TWO)).toEqual(full);
  });
  it('drops the language name before the family names', () => {
    const tight = topBarNeeds(ALL, { familyLabels: true, languageName: false });
    expect(topBarDensity(tight, ALL)).toEqual({ familyLabels: true, languageName: false });
    expect(topBarDensity(1100, ['iphone', 'ipad', 'android-phone'])).toEqual({ familyLabels: true, languageName: false });
  });
  it('falls back to icons, then to the bare code, on narrow windows with many families', () => {
    expect(topBarDensity(1100, ALL)).toEqual({ familyLabels: false, languageName: true });
    expect(topBarDensity(800, ALL)).toEqual({ familyLabels: false, languageName: false });
  });
  it('accounts for the macOS window buttons on the left', () => {
    const w = topBarNeeds(TWO, full);
    expect(topBarDensity(w, TWO, 0)).toEqual(full);
    expect(topBarNeeds(TWO, full, 400)).toBeGreaterThan(w);
    expect(topBarDensity(w, TWO, 400)).not.toEqual(full);
  });
  it('needs more room for more families and never gets richer as the bar shrinks', () => {
    for (let n = 1; n < ALL.length; n++) {
      expect(topBarNeeds(ALL.slice(0, n + 1), full)).toBeGreaterThan(topBarNeeds(ALL.slice(0, n), full));
    }
    let last = 0;
    for (let w = 600; w <= 2000; w += 20) {
      const d = topBarDensity(w, ALL.slice(0, 4));
      const score = (d.familyLabels ? 2 : 0) + (d.languageName ? 1 : 0);
      expect(score).toBeGreaterThanOrEqual(last);
      last = score;
    }
  });
  it('treats an unmeasured bar as roomy and an empty family list as one tab', () => {
    expect(topBarDensity(0, TWO)).toEqual(full);
    expect(topBarDensity(Number.NaN, TWO)).toEqual(full);
    expect(topBarNeeds([], full)).toBe(topBarNeeds(['iphone'], full));
    expect(TOPBAR_METRICS.rightFull).toBeGreaterThan(TOPBAR_METRICS.rightCompact);
  });
});

describe('zoom labels', () => {
  it('shows Fit or the rounded percentage', () => {
    expect(zoomLabel(0.27, true)).toBe('Fit');
    expect(zoomLabel(0.333, false)).toBe('33%');
    expect(zoomLabel(2, false)).toBe('200%');
    expect(zoomLabel(Number.NaN, false)).toBe('100%');
  });
  it('checks the matching menu choice', () => {
    expect(zoomChoice(0.3, true)).toBe('fit');
    expect(zoomChoice(1, false)).toBe('1');
    expect(zoomChoice(0.5004, false)).toBe('0.5');
    expect(zoomChoice(0.75, false)).toBe('');
  });
});

describe('projectFileName', () => {
  it('makes a safe .wajha file name', () => {
    expect(projectFileName('My App: v2/beta')).toBe('My App v2beta.wajha');
    expect(projectFileName('   ')).toBe('Untitled.wajha');
    expect(projectFileName('تطبيقي')).toBe('تطبيقي.wajha');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECENT_COLORS,
  addRecentColor,
  alphaToPercent,
  clearRecentColors,
  colorsEqual,
  getRecentColors,
  hexToRgba,
  isHexColor,
  mixHex,
  normalizeHex,
  parseCssColor,
  prefersDarkInk,
  relativeLuminance,
  rgbaToHex,
  splitAlpha,
  subscribeRecentColors,
  withAlpha,
} from './color';

describe('normalizeHex', () => {
  it('accepts 3, 4, 6 and 8 digits with or without #, in any case', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('#abcd')).toBe('#AABBCCDD');
    expect(normalizeHex('ff8a3d')).toBe('#FF8A3D');
    expect(normalizeHex('  #FF8A3D80  ')).toBe('#FF8A3D80');
  });
  it('drops a fully opaque alpha pair', () => {
    expect(normalizeHex('#FF8A3DFF')).toBe('#FF8A3D');
    expect(normalizeHex('#abcf')).toBe('#AABBCC');
  });
  it('drops any alpha when alpha is disabled', () => {
    expect(normalizeHex('#FF8A3D80', { alpha: false })).toBe('#FF8A3D');
    expect(normalizeHex('#FF8A3D', { alpha: false })).toBe('#FF8A3D');
  });
  it('rejects everything else', () => {
    for (const bad of ['', '#', '#12', '#12345', '#1234567', '#123456789', 'red', 'rgb(1,2,3)', '#ggg', '##fff', '#ff ff ff']) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe('isHexColor', () => {
  it('matches the model rule exactly', () => {
    expect(isHexColor('#FF8A3D')).toBe(true);
    expect(isHexColor('#ff8a3d80')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('FF8A3D')).toBe(false);
    expect(isHexColor(42)).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });
});

describe('alpha helpers', () => {
  it('splits colour and alpha, reading invalid input as opaque black', () => {
    expect(splitAlpha('#FF8A3D')).toEqual({ rgb: '#FF8A3D', alpha: 1 });
    const half = splitAlpha('#FF8A3D80');
    expect(half.rgb).toBe('#FF8A3D');
    expect(half.alpha).toBeCloseTo(128 / 255);
    expect(splitAlpha('nope')).toEqual({ rgb: '#000000', alpha: 1 });
  });
  it('applies alpha, clamping and dropping full opacity', () => {
    expect(withAlpha('#FF8A3D', 0.5)).toBe('#FF8A3D80');
    expect(withAlpha('#FF8A3D80', 1)).toBe('#FF8A3D');
    expect(withAlpha('#FF8A3D', 0)).toBe('#FF8A3D00');
    expect(withAlpha('#FF8A3D', 7)).toBe('#FF8A3D');
    expect(withAlpha('#FF8A3D', -1)).toBe('#FF8A3D00');
    expect(withAlpha('#FF8A3D', Number.NaN)).toBe('#FF8A3D');
    expect(withAlpha('#FF8A3D', 0.999)).toBe('#FF8A3D');
  });
  it('converts alpha to whole percents', () => {
    expect(alphaToPercent(1)).toBe(100);
    expect(alphaToPercent(0.5)).toBe(50);
    expect(alphaToPercent(128 / 255)).toBe(50);
    expect(alphaToPercent(2)).toBe(100);
    expect(alphaToPercent(Number.NaN)).toBe(100);
  });
});

describe('colorsEqual', () => {
  it('compares normalized colours', () => {
    expect(colorsEqual('#fff', '#FFFFFF')).toBe(true);
    expect(colorsEqual('#fff', '#FFFFFFFF')).toBe(true);
    expect(colorsEqual('#fff', '#FFFFFFFE')).toBe(false);
    expect(colorsEqual('nope', 'nope')).toBe(false);
  });
});

describe('rgba conversions and mixing', () => {
  it('round-trips through rgba', () => {
    expect(hexToRgba('#FF8A3D80')).toEqual({ r: 255, g: 138, b: 61, a: 128 / 255 });
    expect(rgbaToHex({ r: 255, g: 138, b: 61, a: 1 })).toBe('#FF8A3D');
    expect(rgbaToHex({ r: 300, g: -5, b: 12.6, a: 0.5 })).toBe('#FF000D80');
  });
  it('mixes in sRGB including alpha', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#FF000000', '#FF0000', 0.5)).toBe('#FF000080');
    expect(mixHex('#000000', '#FFFFFF', 5)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', Number.NaN)).toBe('#000000');
  });
});

describe('parseCssColor', () => {
  it('parses hex and rgb() forms the EyeDropper and clipboards produce', () => {
    expect(parseCssColor('#ff8a3d')).toBe('#FF8A3D');
    expect(parseCssColor('rgb(255, 138, 61)')).toBe('#FF8A3D');
    expect(parseCssColor('rgb(255 138 61)')).toBe('#FF8A3D');
    expect(parseCssColor('rgba(255, 138, 61, 0.5)')).toBe('#FF8A3D80');
    expect(parseCssColor('rgb(255 138 61 / 50%)')).toBe('#FF8A3D80');
    expect(parseCssColor('rgb(100%, 0%, 0%)')).toBe('#FF0000');
  });
  it('rejects other syntaxes', () => {
    expect(parseCssColor('hsl(0, 100%, 50%)')).toBeNull();
    expect(parseCssColor('rgb(1, 2)')).toBeNull();
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('contrast helpers', () => {
  it('computes WCAG luminance', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
  });
  it('picks dark ink on light swatches and light ink on dark ones', () => {
    expect(prefersDarkInk('#FFFFFF')).toBe(true);
    expect(prefersDarkInk('#FFD166')).toBe(true);
    expect(prefersDarkInk('#0E0B1C')).toBe(false);
    expect(prefersDarkInk('#7C6CFF')).toBe(false);
    // Nearly transparent black sits on the light checkerboard.
    expect(prefersDarkInk('#00000010')).toBe(true);
  });
});

describe('recent colours', () => {
  afterEach(() => clearRecentColors());

  it('keeps most recent first, deduplicated and normalized', () => {
    addRecentColor('#ff0000');
    addRecentColor('#00FF00');
    addRecentColor('#FF0000FF');
    expect(getRecentColors()).toEqual(['#FF0000', '#00FF00']);
  });
  it('ignores invalid colours and repeats of the newest', () => {
    addRecentColor('#123456');
    const before = getRecentColors();
    addRecentColor('nope');
    addRecentColor('#123456');
    expect(getRecentColors()).toBe(before);
  });
  it('caps the list', () => {
    for (let i = 0; i < MAX_RECENT_COLORS + 5; i++) addRecentColor(`#0000${i.toString(16).padStart(2, '0')}`);
    expect(getRecentColors()).toHaveLength(MAX_RECENT_COLORS);
    expect(getRecentColors()[0]).toBe(`#0000${(MAX_RECENT_COLORS + 4).toString(16).padStart(2, '0').toUpperCase()}`);
  });
  it('notifies subscribers with a fresh array, and unsubscribes', () => {
    const listener = vi.fn();
    const off = subscribeRecentColors(listener);
    const first = getRecentColors();
    addRecentColor('#ABCDEF');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getRecentColors()).not.toBe(first);
    off();
    addRecentColor('#FEDCBA');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('clears (and only notifies when something changed)', () => {
    const listener = vi.fn();
    const off = subscribeRecentColors(listener);
    clearRecentColors();
    expect(listener).not.toHaveBeenCalled();
    addRecentColor('#ABCDEF');
    clearRecentColors();
    expect(getRecentColors()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
});

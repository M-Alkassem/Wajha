import { describe, expect, it } from 'vitest';
import type { FrameStyle } from '../../model/types';
import { chroma, fromHsl, luminance, parseColor, rotateHue, toHsl } from '../color';
import { BLACK_BEZEL, framePaint, sampleStops } from './finish';
import { browserChrome } from './browser';

const HEX6 = /^#[0-9a-f]{6}$/;
const BODY_COLORS = ['#2b2b30', '#d9d9de', '#b7aea3', '#2f4b6e', '#c8a27a', '#f5f5f7', '#111114', '#f6d5c8', '#cfe3ff'];

describe('sampleStops', () => {
  const stops = [
    [0, '#000000'],
    [0.5, '#ff0000'],
    [1, '#ffffff'],
  ] as const;

  it('returns the end colours outside the range and interpolates inside', () => {
    expect(sampleStops(stops, -1)).toBe('#000000');
    expect(sampleStops(stops, 0)).toBe('#000000');
    expect(sampleStops(stops, 2)).toBe('#ffffff');
    expect(sampleStops(stops, 0.5)).toBe('#ff0000');
    expect(sampleStops(stops, 0.25)).toBe('#800000');
    expect(sampleStops(stops, NaN)).toBe('#000000');
    expect(sampleStops([], 0.5)).toBe('#000000');
  });
});

describe('framePaint', () => {
  it('derives opaque tones for every finish and colour', () => {
    for (const color of BODY_COLORS) {
      for (const finish of ['metal', 'matte', 'clay'] as const) {
        const p = framePaint({ color, finish, bezel: 'black' });
        expect(p.base).toBe(color);
        expect(p.finish).toBe(finish);
        for (const [offset, c] of p.band) {
          expect(c).toMatch(HEX6);
          expect(offset).toBeGreaterThanOrEqual(0);
          expect(offset).toBeLessThanOrEqual(1);
        }
        expect(p.buttonEdge).toMatch(HEX6);
        expect(p.buttonFace).toMatch(HEX6);
      }
    }
  });

  it('gives metal a bright glint and darker edges, clay no shine', () => {
    for (const color of BODY_COLORS) {
      const metal = framePaint({ color, finish: 'metal', bezel: 'black' });
      const lums = metal.band.map(([, c]) => luminance(c));
      const glint = Math.max(...lums);
      expect(glint).toBeGreaterThan(luminance(color));
      expect(lums[0]).toBeLessThan(glint);
      expect(lums[lums.length - 1]).toBeLessThan(luminance(color));
      expect(metal.sheen).not.toBeNull();
      const clay = framePaint({ color, finish: 'clay', bezel: 'match' });
      expect(clay.sheen).toBeNull();
      expect(Math.max(...clay.band.map(([, c]) => luminance(c)))).toBeLessThanOrEqual(luminance(color) + 1e-9);
    }
  });

  it('maps bezel modes', () => {
    expect(framePaint({ color: '#f6d5c8', finish: 'clay', bezel: 'black' }).bezel).toBe(BLACK_BEZEL);
    const match = framePaint({ color: '#f6d5c8', finish: 'clay', bezel: 'match' });
    expect(match.bezel).toBe('#f6d5c8');
    expect(match.bezelMatchesBody).toBe(true);
  });

  it('sanitises unusual styles', () => {
    const odd = framePaint({ color: '#ff000080', finish: 'chrome', bezel: 'match' } as unknown as FrameStyle);
    expect(odd.finish).toBe('metal');
    expect(odd.base).toBe('#ff0000');
    expect(framePaint({ color: 'garbage', finish: 'matte', bezel: 'black' }).base).toBe('#000000');
    expect(framePaint({ color: '#abc', finish: 'matte', bezel: 'black' }).base).toBe('#aabbcc');
    const missing = framePaint(undefined as unknown as FrameStyle);
    expect(missing.finish).toBe('metal');
    expect(missing.base).toBe('#000000');
    expect(framePaint({ color: 42 } as unknown as FrameStyle).base).toBe('#000000');
  });

  it('browser chrome is light for light colours and dark for dark ones', () => {
    const light = browserChrome(framePaint({ color: '#f5f5f7', finish: 'metal', bezel: 'black' }));
    const dark = browserChrome(framePaint({ color: '#2b2b30', finish: 'metal', bezel: 'black' }));
    const pastel = browserChrome(framePaint({ color: '#cfe3ff', finish: 'clay', bezel: 'match' }));
    expect(light.dark).toBe(false);
    expect(dark.dark).toBe(true);
    expect(luminance(light.toolbar)).toBeGreaterThan(0.7);
    expect(luminance(dark.toolbar)).toBeLessThan(0.05);
    expect(pastel.toolbar).toBe('#cfe3ff');
  });
});

describe('colour helpers added for frames and mocks', () => {
  it('round-trips through HSL', () => {
    for (const c of ['#ff0000', '#00ff00', '#0000ff', '#6c5ce7', '#c8a27a', '#808080', '#ffffff', '#000000', '#2f4b6e']) {
      const back = parseColor(fromHsl(toHsl(c)));
      const orig = parseColor(c);
      expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(1);
    }
  });

  it('rotates hue, wraps, and reports chroma', () => {
    expect(rotateHue('#ff0000', 120)).toBe('#00ff00');
    expect(rotateHue('#ff0000', 360)).toBe('#ff0000');
    expect(rotateHue('#ff0000', -120)).toBe('#0000ff');
    expect(rotateHue('#777777', 90)).toBe('#777777');
    expect(toHsl('#808080').s).toBe(0);
    expect(chroma('#808080')).toBe(0);
    expect(chroma('#ff0000')).toBe(1);
    expect(fromHsl({ h: NaN, s: NaN, l: NaN })).toBe('#000000');
    expect(fromHsl({ h: -30, s: 2, l: 0.5 })).toBe(fromHsl({ h: 330, s: 1, l: 0.5 }));
  });
});

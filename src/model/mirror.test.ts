import { describe, expect, it } from 'vitest';
import { mirrorElement, mirrorLayout, mirrorPatch, mirrorsLayout } from './mirror';
import { newDeviceElement, newShapeElement, newTextElement, defaultTheme } from './defaults';
import type { DeviceElement, ShapeElement, TextElement } from './types';

const theme = defaultTheme();
const device = (): DeviceElement => ({ ...newDeviceElement('iphone', theme), x: 0.7, rotation: 8, shadow: { color: '#00000066', blur: 0.05, x: 0.02, y: 0.04 } });
const text = (): TextElement => {
  const el = newTextElement('headline', 'iphone', theme);
  return { ...el, x: 0.3, style: { ...el.style, shadow: { color: '#000000', blur: 0.01, x: -0.01, y: 0.01 } } };
};
const shape = (): ShapeElement => ({ ...newShapeElement('blob', theme), x: 0.9, rotation: -20 });

describe('mirrorsLayout', () => {
  it('mirrors right-to-left languages unless the project turned it off', () => {
    expect(mirrorsLayout({}, 'ar-SA')).toBe(true);
    expect(mirrorsLayout({}, 'he')).toBe(true);
    expect(mirrorsLayout({ mirrorRtl: true }, 'fa')).toBe(true);
    expect(mirrorsLayout({ mirrorRtl: false }, 'ar-SA')).toBe(false);
    expect(mirrorsLayout({}, 'en-US')).toBe(false);
    expect(mirrorsLayout(null, 'ar-SA')).toBe(true);
  });
});

describe('mirrorElement', () => {
  it('moves the element to the other side and reverses its lean and shadow', () => {
    const m = mirrorElement(device());
    expect(m.x).toBeCloseTo(0.3);
    expect(m.rotation).toBe(-8);
    expect(m.shadow).toEqual({ color: '#00000066', blur: 0.05, x: -0.02, y: 0.04 });
    expect(m.y).toBe(device().y);
    expect(m.width).toBe(device().width);
  });

  it('reverses text shadows and keeps the logical alignment', () => {
    const m = mirrorElement(text());
    expect(m.x).toBeCloseTo(0.7);
    expect(m.style.shadow?.x).toBe(0.01);
    expect(m.style.align).toBe(text().style.align);
  });

  it('gives the original back when applied twice, without touching the input', () => {
    for (const el of [device(), text(), shape()]) {
      const before = structuredClone(el);
      const twice = mirrorElement(mirrorElement(el));
      expect(twice.x).toBeCloseTo(el.x);
      expect(twice).toEqual({ ...el, x: twice.x });
      expect(el).toEqual(before);
    }
  });

  it('keeps a straight element straight and leaves bad values alone', () => {
    expect(Object.is(mirrorElement({ ...shape(), rotation: 0 }).rotation, 0)).toBe(true);
    const bad = mirrorElement({ ...device(), x: NaN as number, shadow: null });
    expect(bad.x).toBeNaN();
    expect(bad.shadow).toBeNull();
  });
});

describe('mirrorLayout and mirrorPatch', () => {
  it('mirrors every element and keeps the background', () => {
    const layout = { background: null, elements: [device(), shape()] };
    const m = mirrorLayout(layout);
    expect(m.background).toBeNull();
    expect(m.elements.map((e) => +e.x.toFixed(3))).toEqual([0.3, 0.1]);
  });

  it('turns an edit made on the mirrored slide into the stored one', () => {
    expect(mirrorPatch({ x: 0.25, y: 0.4 })).toEqual({ x: 0.75, y: 0.4 });
    expect(mirrorPatch({ rotation: 15 })).toEqual({ rotation: -15 });
    const resize: { x?: number; width: number } = { width: 0.5 };
    expect(mirrorPatch(resize)).toEqual({ width: 0.5 });
  });
});

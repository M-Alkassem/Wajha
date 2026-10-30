import { freeze } from 'immer';
import { describe, expect, it } from 'vitest';
import { TEXT_MAX_WIDTH, adaptLayout } from './adapt';
import { FAMILIES, FAMILY_ORDER } from './catalog';
import { defaultLayout, defaultTheme, newDeviceElement, newImageElement, newShapeElement, newTextElement } from './defaults';
import { assetId, byId, deviceBox, devices, numbersIn, texts } from './fixtures.node';
import { familyMetrics } from './geometry';
import type { DeviceElement, FamilyId, ShapeElement, SlideElement, SlideLayout, TextElement } from './types';

const theme = defaultTheme();
const pairs: [FamilyId, FamilyId][] = FAMILY_ORDER.flatMap((a) => FAMILY_ORDER.map((b): [FamilyId, FamilyId] => [a, b]));
const adapt = (layout: SlideLayout, from: FamilyId, to: FamilyId) => adaptLayout(layout, FAMILIES[from].design, FAMILIES[to].design, to);

/** The default layout with its device shrunk to 55 % of the canvas height, fully inside. */
function visibleLayout(family: FamilyId): SlideLayout {
  const m = familyMetrics(family);
  const base = defaultLayout(family, theme, { device: 'd', headline: 'h', subtitle: 's' });
  const d = base.elements[0] as DeviceElement;
  const box = deviceBox(d, family);
  const visible: DeviceElement = { ...d, width: d.width * Math.min(1, 0.55 / (box.bottom - box.top)) };
  const vb = deviceBox(visible, family);
  visible.y = m.wide ? 0.5 : 0.9 - (vb.bottom - vb.top) / 2;
  return { background: null, elements: [visible, ...base.elements.slice(1)] };
}

describe('adaptLayout invariants (every family pair)', () => {
  it.each(pairs)('%s -> %s keeps ids and kinds, never NaN, stays in range', (from, to) => {
    const src = defaultLayout(from, theme, { device: 'd', headline: 'h', subtitle: 's' });
    src.elements.push({ ...newShapeElement('blob', theme), id: 'blob', seed: 7 });
    src.elements.push({ ...newImageElement(assetId(1), 1), id: 'img' });
    const out = adapt(src, from, to);
    expect(out.elements.map((e) => [e.id, e.kind])).toEqual(src.elements.map((e) => [e.id, e.kind]));
    for (const n of numbersIn(out)) expect(Number.isFinite(n.value), n.path).toBe(true);
    for (const el of out.elements) {
      expect(el.x).toBeGreaterThanOrEqual(-2);
      expect(el.x).toBeLessThanOrEqual(3);
      expect(el.y).toBeGreaterThanOrEqual(-2);
      expect(el.y).toBeLessThanOrEqual(3);
    }
  });

  it.each(pairs)('%s -> %s switches default frames to the target family', (from, to) => {
    const out = adapt(defaultLayout(from, theme), from, to);
    for (const d of devices(out)) expect(d.frame).toBe(FAMILIES[to].defaultFrame);
  });

  it.each(pairs)('%s -> %s keeps texts within 92 %% of the canvas width', (from, to) => {
    const out = adapt(defaultLayout(from, theme), from, to);
    const m = familyMetrics(to);
    for (const t of texts(out)) {
      expect(t.width).toBeLessThanOrEqual(TEXT_MAX_WIDTH * m.wu + 1e-6);
      expect(t.x - t.width / 2 / m.wu).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.width / 2 / m.wu).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it.each(pairs)('%s -> %s is deterministic', (from, to) => {
    const src = defaultLayout(from, theme);
    expect(adapt(src, from, to)).toEqual(adapt(src, from, to));
  });

  it.each(pairs)('%s -> %s keeps a fully visible device inside the canvas with margins', (from, to) => {
    const src = visibleLayout(from);
    const srcBox = deviceBox(devices(src)[0], from);
    expect(srcBox.top).toBeGreaterThanOrEqual(0);
    expect(srcBox.bottom).toBeLessThanOrEqual(1);
    const box = deviceBox(devices(adapt(src, from, to))[0], to);
    expect(box.top).toBeGreaterThanOrEqual(-1e-6);
    expect(box.bottom).toBeLessThanOrEqual(1 + 1e-6);
    expect(box.bottom - box.top).toBeLessThanOrEqual(1 - 2 * 0.06 + 1e-6);
    expect(box.left).toBeGreaterThanOrEqual(-1e-6);
    expect(box.right).toBeLessThanOrEqual(1 + 1e-6);
  });

  it.each(pairs.filter(([, to]) => to !== 'mac'))('%s -> %s keeps a bleeding device bleeding off the bottom', (from, to) => {
    const src = defaultLayout(from, theme);
    if (from === 'mac') return; // the Mac default is a centered laptop, it does not bleed
    expect(deviceBox(devices(src)[0], from).bottom).toBeGreaterThan(1);
    const box = deviceBox(devices(adapt(src, from, to))[0], to);
    expect(box.bottom).toBeGreaterThan(1);
    // ...but most of the device stays visible.
    expect(box.top).toBeLessThan(0.75);
    expect(box.top).toBeGreaterThan(0);
  });
});

describe('portrait <-> portrait', () => {
  it('keeps the copy above the device and the gap to it', () => {
    for (const [from, to] of [['iphone', 'ipad'], ['ipad', 'iphone'], ['iphone', 'android-phone'], ['android-tablet', 'ipad']] as const) {
      const out = adapt(defaultLayout(from, theme), from, to);
      const sub = byId(out, 'subtitle') as TextElement;
      const m = familyMetrics(to);
      const subBottom = sub.y + (2 * sub.style.size * sub.style.lineHeight) / m.hu;
      expect(deviceBox(byId(out, 'device') as DeviceElement, to).top).toBeGreaterThan(subBottom);
    }
  });

  it('keeps line spacing in u so headline and subtitle never collide', () => {
    const out = adapt(defaultLayout('iphone', theme), 'iphone', 'ipad');
    const h = byId(out, 'headline') as TextElement;
    const s = byId(out, 'subtitle') as TextElement;
    const m = familyMetrics('ipad');
    expect((s.y - h.y) * m.hu).toBeGreaterThanOrEqual(2 * h.style.size * h.style.lineHeight);
  });

  it('is the identity for the same canvas and family', () => {
    for (const f of FAMILY_ORDER) {
      const src = defaultLayout(f, theme);
      const out = adapt(src, f, f);
      for (const el of out.elements) {
        const s = byId(src, el.id) as SlideElement;
        expect(el.x).toBeCloseTo(s.x, 4);
        expect(el.y).toBeCloseTo(s.y, 4);
        if ('width' in el && 'width' in s) expect(el.width).toBeCloseTo(s.width, 4);
      }
    }
  });

  it('round trips iPhone -> iPad -> iPhone close to the original', () => {
    const src = defaultLayout('iphone', theme);
    const back = adapt(adapt(src, 'iphone', 'ipad'), 'ipad', 'iphone');
    const a = byId(src, 'device') as DeviceElement;
    const b = byId(back, 'device') as DeviceElement;
    expect(b.width).toBeCloseTo(a.width, 1);
    expect(b.y).toBeCloseTo(a.y, 1);
    expect((byId(back, 'headline') as TextElement).y).toBeCloseTo((byId(src, 'headline') as TextElement).y, 3);
  });

  it('pins copy near the bottom to the bottom edge', () => {
    const caption: TextElement = { ...newTextElement('caption', 'iphone', theme), id: 'cap', y: 0.95, valign: 'bottom' };
    const out = adapt({ background: null, elements: [caption] }, 'iphone', 'ipad');
    expect((byId(out, 'cap') as TextElement).y).toBeCloseTo(0.95, 1);
    expect((byId(out, 'cap') as TextElement).y).toBeLessThanOrEqual(1);
  });

  it('keeps a device that bleeds off the top bleeding off the top', () => {
    const d: DeviceElement = { ...newDeviceElement('iphone', theme), id: 'd', y: 0.3 };
    const cap: TextElement = { ...newTextElement('caption', 'iphone', theme), id: 'c', y: 0.9 };
    expect(deviceBox(d, 'iphone').top).toBeLessThan(0);
    const out = adapt({ background: null, elements: [d, cap] }, 'iphone', 'android-phone');
    const box = deviceBox(byId(out, 'd') as DeviceElement, 'android-phone');
    expect(box.top).toBeLessThan(0);
    expect(box.bottom).toBeGreaterThan(0.25);
  });

  it('handles rotated and multiple devices', () => {
    const a: DeviceElement = { ...newDeviceElement('iphone', theme), id: 'a', x: 0.35, width: 0.5, rotation: -12, y: 0.62 };
    const b: DeviceElement = { ...newDeviceElement('iphone', theme), id: 'b', x: 0.68, width: 0.5, rotation: 10, y: 0.7 };
    for (const to of FAMILY_ORDER) {
      const out = adapt({ background: null, elements: [a, b, newTextElement('headline', 'iphone', theme)] }, 'iphone', to);
      const [oa, ob] = devices(out);
      expect(oa.rotation).toBe(-12);
      expect(ob.rotation).toBe(10);
      // Order of the pair is preserved left to right.
      expect(oa.x).toBeLessThan(ob.x);
      for (const n of numbersIn(out)) expect(Number.isFinite(n.value)).toBe(true);
    }
  });
});

describe('to and from wide canvases', () => {
  it.each(['mac', 'play-feature'] as const)('iPhone -> %s puts copy left (centered) and the device right', (to) => {
    const out = adapt(defaultLayout('iphone', theme), 'iphone', to);
    const m = familyMetrics(to);
    for (const t of texts(out)) {
      expect(t.x).toBeCloseTo(0.28, 1);
      expect(t.style.align).toBe('center');
      expect(t.x + t.width / 2 / m.wu).toBeLessThanOrEqual(0.52);
    }
    const box = deviceBox(devices(out)[0], to);
    expect(box.left).toBeGreaterThanOrEqual(0.5);
    expect(devices(out)[0].x).toBeGreaterThan(0.6);
  });

  it('scales copy down to fit the Mac column', () => {
    const out = adapt(defaultLayout('iphone', theme), 'iphone', 'mac');
    const h = byId(out, 'headline') as TextElement;
    expect(h.style.size).toBeLessThan(0.075);
    expect(h.style.size).toBeGreaterThan(0.05);
    expect(h.width).toBeLessThanOrEqual(0.44 * familyMetrics('mac').wu + 1e-6);
  });

  it('centers a laptop vertically rather than parking it at the bottom', () => {
    const d = devices(adapt(defaultLayout('iphone', theme), 'iphone', 'mac'))[0];
    expect(d.frame).toBe('macbook');
    expect(d.y).toBeCloseTo(0.5, 2);
  });

  it('lets a phone on the feature graphic bleed like the source did', () => {
    const box = deviceBox(devices(adapt(defaultLayout('iphone', theme), 'iphone', 'play-feature'))[0], 'play-feature');
    expect(box.top).toBeGreaterThan(0.05);
    expect(box.bottom).toBeGreaterThan(1);
  });

  it('stacks wide copy on top of portrait canvases with the device below', () => {
    for (const to of ['iphone', 'ipad', 'android-phone', 'android-tablet'] as const) {
      const out = adapt(defaultLayout('mac', theme), 'mac', to);
      const head = byId(out, 'headline') as TextElement;
      const sub = byId(out, 'subtitle') as TextElement;
      expect(head.x).toBeCloseTo(0.5, 2);
      expect(head.y).toBeLessThan(sub.y);
      const m = familyMetrics(to);
      const subBottom = sub.y + (2 * sub.style.size * sub.style.lineHeight) / m.hu;
      const box = deviceBox(devices(out)[0], to);
      expect(box.top).toBeGreaterThan(subBottom);
      expect(box.bottom).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('keeps side-by-side wide layouts side by side between Mac and banner', () => {
    for (const [from, to] of [['mac', 'play-feature'], ['play-feature', 'mac']] as const) {
      const out = adapt(defaultLayout(from, theme), from, to);
      const m = familyMetrics(to);
      const box = deviceBox(devices(out)[0], to);
      for (const t of texts(out)) expect(t.x + t.width / 2 / m.wu).toBeLessThanOrEqual(box.left + 0.02);
      expect(box.right).toBeLessThanOrEqual(1);
    }
  });

  it('re-centers text-only slides between portrait and wide', () => {
    const layout: SlideLayout = { background: null, elements: [newTextElement('headline', 'mac', theme)] };
    const out = adapt(layout, 'mac', 'iphone');
    expect(texts(out)[0].x).toBeCloseTo(0.5, 3);
    const back = adapt({ background: null, elements: [newTextElement('headline', 'iphone', theme)] }, 'iphone', 'mac');
    expect(texts(back)[0].x).toBeCloseTo(0.5, 3);
  });
});

describe('decorations on side-by-side and stacked canvases', () => {
  const ring = (id: string, x: number, y: number, size: number, extra: Partial<ShapeElement> = {}): ShapeElement => ({ ...newShapeElement('ring', theme), id, x, y, width: size, height: size, stroke: 0.01, ...extra });
  const glowAt = (id: string, x: number, y: number, size: number): ShapeElement => ({ ...newShapeElement('circle', theme), id, x, y, width: size, height: size, blur: 0.2 * size });
  /** The default layout of `family` with decorations drawn first (behind everything). */
  const withDecor = (family: FamilyId, ...decor: SlideElement[]): SlideLayout => {
    const base = defaultLayout(family, theme, { device: 'd', headline: 'h', subtitle: 's' });
    return { background: null, elements: [...decor, ...base.elements] };
  };
  const phone = devices(withDecor('iphone'))[0];
  /** Bottom of the copy (u), with adaptLayout's two-line estimate. */
  const copyBottom = (l: SlideLayout, family: FamilyId) => {
    const m = familyMetrics(family);
    return Math.max(...texts(l).map((t) => t.y * m.hu + (t.valign === 'top' ? 2 : t.valign === 'middle' ? 1 : 0) * t.style.size * t.style.lineHeight));
  };
  const copyRight = (l: SlideLayout, family: FamilyId) => Math.max(...texts(l).map((t) => t.x * familyMetrics(family).wu + t.width / 2));

  it.each(['mac', 'play-feature'] as const)('moves a ring around the phone to the device side of %s, clear of the copy', (to) => {
    const out = adapt(withDecor('iphone', ring('r', phone.x, phone.y, 1.0)), 'iphone', to);
    const r = byId(out, 'r') as ShapeElement;
    const dev = devices(out)[0];
    expect(r.x).toBeCloseTo(dev.x, 4);
    expect(r.y).toBeCloseTo(dev.y, 4);
    expect(r.width).toBeLessThan(1);
    expect(r.x * familyMetrics(to).wu - r.width / 2).toBeGreaterThanOrEqual(copyRight(out, to));
  });

  it('keeps a decoration at the same place of the device box when a phone turns into a laptop', () => {
    const src = deviceBox(phone, 'iphone');
    const at = { x: phone.x + 0.7 * ((src.right - src.left) / 2), y: phone.y - 0.7 * ((src.bottom - src.top) / 2) };
    const out = adapt(withDecor('iphone', ring('dot', at.x, at.y, 0.08)), 'iphone', 'mac');
    const dot = byId(out, 'dot') as ShapeElement;
    const dev = devices(out)[0];
    const box = deviceBox(dev, 'mac');
    expect((dot.x - dev.x) / ((box.right - box.left) / 2)).toBeCloseTo(0.7, 2);
    expect((dot.y - dev.y) / ((box.bottom - box.top) / 2)).toBeCloseTo(-0.7, 2);
    // Sizes follow the devices: one scale, so circles stay round.
    expect(dot.width / 0.08).toBeCloseTo(dev.width / phone.width, 3);
    expect(dot.height).toBe(dot.width);
  });

  it('leaves backdrops and decorations away from the devices and the copy where they were', () => {
    const ground = { ...newShapeElement('circle', theme), id: 'ground', x: 0.5, y: 1.0, width: 2.4, height: 0.6 };
    const seam = ring('seam', 0, 0.56, 1.2);
    for (const to of ['mac', 'play-feature', 'ipad', 'android-phone'] as const) {
      const out = adapt(withDecor('iphone', ground, seam), 'iphone', to);
      expect(byId(out, 'ground')).toEqual(ground);
      expect(byId(out, 'seam')).toEqual(seam);
    }
  });

  it('keeps a decoration of the copy in its place when the copy keeps its distance to the top', () => {
    const head = byId(withDecor('iphone'), 'h') as TextElement;
    const rule = { ...newShapeElement('rect', theme), id: 'rule', x: 0.5, y: head.y - 0.01, width: 0.08, height: 0.003, radius: 0 };
    for (const to of ['android-phone', 'ipad'] as const) {
      const out = adapt(withDecor('iphone', rule), 'iphone', to);
      const h = byId(out, 'h') as TextElement;
      const r = byId(out, 'rule') as ShapeElement;
      // Same distance (u) above the headline as on the iPhone, not the same fraction of a shorter canvas.
      expect((h.y - r.y) * familyMetrics(to).hu).toBeCloseTo(0.01 * familyMetrics('iphone').hu, 4);
      expect(r.width).toBe(0.08);
    }
  });

  it('shrinks the decorations of the device group that would reach the copy, and only those', () => {
    const big = ring('big', phone.x, phone.y, 1.4);
    const small = ring('small', phone.x, phone.y + 0.05, 0.3);
    const out = adapt(withDecor('iphone', big, small), 'iphone', 'mac');
    const m = familyMetrics('mac');
    const b = byId(out, 'big') as ShapeElement;
    const s = byId(out, 'small') as ShapeElement;
    const g = devices(out)[0].width / phone.width;
    expect(b.x * m.wu - b.width / 2).toBeGreaterThanOrEqual(copyRight(out, 'mac') + 0.03 - 1e-6);
    expect(b.width).toBeLessThan(1.4 * g);
    expect(b.width).toBeGreaterThanOrEqual(0.5 * 1.4 * g - 1e-6);
    // One shrink for the whole group keeps the composition: the small ring shrank as much.
    expect(s.width / (0.3 * g)).toBeCloseTo(b.width / (1.4 * g), 4);
    expect(b.stroke).toBeCloseTo(0.01 * (b.width / 1.4), 6);
  });

  it('lets soft glows light the copy without shrinking the group', () => {
    // As a drawn ring this size would have to shrink (see above); a glow may reach the copy.
    const out = adapt(withDecor('iphone', glowAt('light', phone.x, phone.y, 1.0), ring('small', phone.x, phone.y, 0.3)), 'iphone', 'mac');
    const g = devices(out)[0].width / phone.width;
    const light = byId(out, 'light') as ShapeElement;
    expect((byId(out, 'small') as ShapeElement).width).toBeCloseTo(0.3 * g, 4);
    expect(light.width).toBeCloseTo(1.0 * g, 4);
    expect(light.x * familyMetrics('mac').wu - light.width / 2 - light.blur).toBeLessThan(copyRight(out, 'mac'));
  });

  it('keeps the copy column above a shape rising from the bottom edge', () => {
    const hill = { ...newShapeElement('circle', theme), id: 'hill', x: 0.25, y: 1.0, width: 1.2, height: 0.9 };
    for (const to of ['mac', 'play-feature'] as const) {
      const plain = adapt(withDecor('iphone'), 'iphone', to);
      const out = adapt(withDecor('iphone', hill), 'iphone', to);
      const hillTop = familyMetrics(to).hu - 0.45;
      expect(copyBottom(plain, to)).toBeGreaterThan(hillTop);
      expect(copyBottom(out, to)).toBeLessThanOrEqual(hillTop - 0.03 + 1e-6);
      // Moved, not shrunk: the copy keeps its size when the room above is enough.
      expect((byId(out, 'h') as TextElement).style.size).toBeCloseTo((byId(plain, 'h') as TextElement).style.size, 6);
    }
  });

  it('moves a ring around the laptop below the copy on portrait canvases', () => {
    const laptop = devices(withDecor('mac'))[0];
    for (const to of ['iphone', 'ipad', 'android-phone'] as const) {
      const out = adapt(withDecor('mac', ring('r', laptop.x, laptop.y, 0.9)), 'mac', to);
      const r = byId(out, 'r') as ShapeElement;
      const dev = devices(out)[0];
      expect(r.x).toBeCloseTo(dev.x, 4);
      expect(r.y * familyMetrics(to).hu - r.height / 2).toBeGreaterThanOrEqual(copyBottom(out, to) + 0.03 - 1e-6);
    }
  });
});

describe('other elements and hygiene', () => {
  it('keeps shapes and images at their relative position and u size', () => {
    const shape = { ...newShapeElement('circle', theme), id: 's', x: 0.2, y: 0.8, width: 0.3, height: 0.3 };
    const image = { ...newImageElement(assetId(2), 1.5), id: 'i', x: 0.7, y: 0.1 };
    for (const to of FAMILY_ORDER) {
      const out = adapt({ background: null, elements: [shape, image] }, 'iphone', to);
      expect(byId(out, 's')).toEqual(shape);
      expect(byId(out, 'i')).toEqual(image);
    }
  });

  it('keeps non-default frames and the background', () => {
    const browser: DeviceElement = { ...newDeviceElement('mac', theme), id: 'b', frame: 'browser' };
    const none: DeviceElement = { ...newDeviceElement('iphone', theme), id: 'n', frame: 'none' };
    const bg = { fill: { type: 'solid' as const, color: '#112233' }, pattern: null };
    const out = adapt({ background: bg, elements: [browser, none] }, 'mac', 'iphone');
    expect(devices(out).map((d) => d.frame)).toEqual(['browser', 'none']);
    expect(out.background).toEqual(bg);
    expect(out.background).not.toBe(bg);
  });

  it('never mutates its (frozen) input', () => {
    const src = freeze(defaultLayout('iphone', theme), true);
    const snapshot = JSON.stringify(src);
    for (const to of FAMILY_ORDER) adapt(src, 'iphone', to);
    expect(JSON.stringify(src)).toBe(snapshot);
    const out = adapt(src, 'iphone', 'ipad');
    (out.elements[0] as DeviceElement).width = 0.1;
    expect((src.elements[0] as DeviceElement).width).not.toBe(0.1);
  });

  it('survives empty, broken and extreme input', () => {
    expect(adaptLayout({ background: null, elements: [] }, FAMILIES.iphone.design, FAMILIES.mac.design, 'mac')).toEqual({ background: null, elements: [] });
    expect(adaptLayout({} as SlideLayout, { width: 0, height: NaN }, { width: -1, height: Infinity }, 'iphone').elements).toEqual([]);
    const weird: SlideElement[] = [
      { ...newDeviceElement('iphone', theme), id: 'd', x: NaN, y: Infinity, width: NaN, rotation: NaN },
      { ...newTextElement('headline', 'iphone', theme), id: 't', width: 1e9, y: -1e9 },
      null as unknown as SlideElement,
    ];
    for (const to of FAMILY_ORDER) {
      const out = adaptLayout({ background: null, elements: weird }, FAMILIES.iphone.design, FAMILIES[to].design, to);
      expect(out.elements.map((e) => e.id)).toEqual(['d', 't']);
      for (const n of numbersIn(out)) expect(Number.isFinite(n.value), `${to}${n.path}`).toBe(true);
    }
    // Unknown target family falls back to the iPhone rules instead of throwing.
    expect(() => adaptLayout(defaultLayout('iphone', theme), FAMILIES.iphone.design, FAMILIES.ipad.design, 'watch' as FamilyId)).not.toThrow();
  });

  it('handles hundreds of elements quickly', () => {
    const many: SlideElement[] = [];
    for (let i = 0; i < 200; i++) {
      many.push(i % 3 === 0 ? { ...newDeviceElement('iphone', theme), id: `d${i}` } : { ...newTextElement('subtitle', 'iphone', theme), id: `t${i}`, y: (i % 50) / 50 });
    }
    const t0 = performance.now();
    for (const to of FAMILY_ORDER) adapt({ background: null, elements: many }, 'iphone', to);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

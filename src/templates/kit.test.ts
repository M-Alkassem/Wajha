import { describe, expect, it } from 'vitest';
import { mockSeed } from '../engine';
import { mockArchetype } from '../engine/mock';
import { validateTemplate } from '../model/validate';
import type { DeviceElement, SlideElement } from '../model/types';
import {
  BUILD_PROBLEMS,
  F,
  background,
  canvas,
  circle,
  copyAt,
  device,
  deviceHeight,
  elementsOverlap,
  glow,
  linear,
  mockAppAt,
  onStrip,
  slide,
  solid,
  template,
  text,
  theme,
  typeset,
} from './kit';

const t = typeset({ heading: F.sora, body: F.inter, ink: '#ffffff', soft: '#eeeeee', accent: '#ffcc00' });

describe('template kit', () => {
  it('spaces plain gradient stops evenly and keeps pinned ones', () => {
    expect(linear(90, '#000000', '#808080', '#ffffff')).toEqual({
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 0.5, color: '#808080' },
        { offset: 1, color: '#ffffff' },
      ],
    });
    expect(linear(0, ['#000000', 0.2], ['#ffffff', 0.9])).toMatchObject({ stops: [{ offset: 0.2 }, { offset: 0.9 }] });
  });

  it('meets headline and subtitle at the seam, the gap measured in u', () => {
    const [head, sub] = copyAt(t, { seam: 0.2, gap: 0.04 });
    const hu = canvas('tall').hu;
    expect(head).toMatchObject({ key: 'headline', valign: 'bottom' });
    expect(sub).toMatchObject({ key: 'subtitle', valign: 'top' });
    expect((sub.y - head.y) * hu).toBeCloseTo(0.04, 4);
    // The subtitle inherits the column width unless it has its own.
    const [, narrow] = copyAt(t, { cls: 'wide', seam: 0.5, width: 0.5 });
    expect(narrow.width).toBe(0.5);
  });

  it('places devices by their top or bottom edge', () => {
    const top = device({ width: 0.8, top: 0.25 });
    const h = deviceHeight('tall', 'iphone', 0.8) / canvas('tall').hu;
    expect(top.y - h / 2).toBeCloseTo(0.25, 4);
    const bottom = device({ width: 0.8, bottom: 0.7 });
    expect(bottom.y + h / 2).toBeCloseTo(0.7, 4);
    const pad = device({ cls: 'tablet', frame: 'ipad', width: 0.7, top: 0.3 });
    expect(pad.y - deviceHeight('tablet', 'ipad', 0.7) / canvas('tablet').hu / 2).toBeCloseTo(0.3, 4);
    expect(device({ slot: 'second' }).id).toBe('device-second');
  });

  it('cuts panorama decorations at the seams', () => {
    const make = (x: number): SlideElement[] => [circle({ x, y: 0.5, size: 0.4 })];
    // A shape on the seam between slides 1 and 2 shows on both, at their edges.
    expect(onStrip(0, 1, 0.2, make).map((e) => e.x)).toEqual([1]);
    expect(onStrip(1, 1, 0.2, make).map((e) => e.x)).toEqual([0]);
    expect(onStrip(2, 1, 0.2, make)).toEqual([]);
  });

  it('measures overlap with rotation, shadows and glow halos', () => {
    const phone = device({ width: 0.7, top: 0.3 });
    const above = text({ key: 'headline', y: 0.05, size: 0.08, maxLines: 2 });
    expect(elementsOverlap(phone, above, 'tall')).toBe(false);
    expect(elementsOverlap(phone, glow({ x: 0.5, y: 0.6, size: 0.4 }), 'tall')).toBe(true);
    // A small dot in a top corner stays clear of a phone below the copy, unless its glow reaches it.
    expect(elementsOverlap(phone, circle({ x: 0.05, y: 0.05, size: 0.02 }), 'tall')).toBe(false);
    expect(elementsOverlap(phone, circle({ x: 0.05, y: 0.27, size: 0.02, blur: 0.2 }), 'tall')).toBe(true);
  });

  it('steers mock screens without changing what overlaps what', () => {
    const before = BUILD_PROBLEMS.length;
    const decor = (i: number) => circle({ x: 0.04 + i * 0.03, y: 0.03, size: 0.01 });
    const built = template({
      id: 'kit-test',
      name: 'Kit test',
      description: 'A template that only exists in this test.',
      category: 'minimal',
      tags: ['test'],
      apps: ['meditation', 'music'],
      theme: theme({ background: background(solid('#101010')), heading: F.inter, body: F.inter, palette: ['#7c5cff', '#ffffff'] }),
      slides: [
        slide({ en: { headline: 'A *b*', subtitle: 'c' }, ar: { headline: 'أ *ب*', subtitle: 'ج' } }, () => [
          glow({ x: 0.5, y: 0.6, size: 0.8 }),
          decor(0),
          decor(1),
          decor(2),
          decor(3),
          decor(4),
          ...copyAt(t, { seam: 0.15 }),
          device({ width: 0.8, top: 0.26 }),
        ]),
      ],
    });
    expect(BUILD_PROBLEMS.length).toBe(before);
    const els = built.slides[0].layouts.tall.elements;
    const index = els.findIndex((e) => e.kind === 'device');
    // Five dots and the copy are free to go either side of the phone, so index 8 (meditation) is reachable.
    expect(mockAppAt(0, index)).toBe('meditation');
    // The glow behind the phone stays behind it.
    expect(els.findIndex((e) => e.kind === 'shape' && e.blur > 0)).toBeLessThan(index);
    expect(validateTemplate(JSON.parse(JSON.stringify(built)))).toEqual(built);
    expect((els[index] as DeviceElement).id).toBe('device');
  });

  it('uses the same mock seed as the renderer', () => {
    expect(mockAppAt(2, 1)).toBe(mockArchetype(mockSeed(2, 1)));
    expect(mockSeed(2, 1)).toBe(2 * 31 + 1 * 7 + 3);
  });
});

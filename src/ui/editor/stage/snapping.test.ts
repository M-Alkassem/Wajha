import { describe, expect, it } from 'vitest';
import { SAFE_MARGIN, SNAP_PX, combineTargets, elementTargets, slideTargets, snapRect } from './snapping';

const W = 300;
const H = 600;
const slide = slideTargets(W, H);

describe('slideTargets', () => {
  it('offers edges, safe margins and centre lines', () => {
    const m = Math.min(W, H) * SAFE_MARGIN;
    expect(slide.x.map((l) => l.pos).sort((a, b) => a - b)).toEqual([0, m, W / 2, W - m, W]);
    expect(slide.y.map((l) => l.pos).sort((a, b) => a - b)).toEqual([0, m, H / 2, H - m, H]);
    expect(slide.x.every((l) => l.from === 0 && l.to === H && l.kind === 'slide')).toBe(true);
  });

  it('skips margins that do not fit', () => {
    expect(slideTargets(10, 10, 20).x).toHaveLength(3);
  });
});

describe('snapRect', () => {
  it('centres an element on the slide within the threshold', () => {
    const r = { left: 100 + 4, right: 200 + 4, top: 10, bottom: 50 };
    const s = snapRect(r, slide);
    expect(s.dx).toBe(-4);
    expect(s.guides.some((g) => g.axis === 'x' && g.pos === W / 2 && g.from === 0 && g.to === H)).toBe(true);
  });

  it('leaves elements alone outside the threshold', () => {
    const r = { left: 100 + SNAP_PX + 1, right: 200 + SNAP_PX + 1, top: 100, bottom: 140 };
    const s = snapRect(r, combineTargets(slide));
    expect(s.dx).toBe(0);
    expect(s.guides.filter((g) => g.axis === 'x')).toEqual([]);
  });

  it('snaps edges to other elements and draws a guide spanning both', () => {
    const other = { left: 20, right: 120, top: 300, bottom: 360 };
    const targets = combineTargets(slide, elementTargets([other]));
    const r = { left: 23, right: 83, top: 100, bottom: 140 };
    const s = snapRect(r, targets);
    expect(s.dx).toBe(-3);
    const g = s.guides.find((x) => x.axis === 'x' && x.pos === 20);
    expect(g).toBeDefined();
    expect(g!.from).toBe(100);
    expect(g!.to).toBe(360);
    expect(g!.kind).toBe('element');
  });

  it('snaps both axes independently and can turn one off', () => {
    const r = { left: -3, right: 47, top: H - 52, bottom: H + 2 };
    const both = snapRect(r, slide);
    expect(both.dx).toBe(3);
    expect(both.dy).toBe(-2);
    const xOnly = snapRect(r, slide, SNAP_PX, { x: true, y: false });
    expect(xOnly.dy).toBe(0);
    expect(xOnly.guides.every((g) => g.axis === 'x')).toBe(true);
  });

  it('prefers the closest line, and slide lines on ties', () => {
    const targets = {
      x: [
        { pos: 147, from: 0, to: 10, kind: 'element' as const },
        { pos: 150, from: 0, to: H, kind: 'slide' as const },
      ],
      y: [],
    };
    // The left edge is 1.5 px from both lines: the slide line wins.
    expect(snapRect({ left: 148.5, right: 248.5, top: 200, bottom: 210 }, targets).dx).toBeCloseTo(1.5);
    // 1 px from the element line, 2 px from the slide line: the closer one wins.
    expect(snapRect({ left: 148, right: 248, top: 200, bottom: 210 }, targets).dx).toBeCloseTo(-1);
  });

  it('merges guides at the same position', () => {
    const a = { left: 0, right: 50, top: 400, bottom: 450 };
    const b = { left: 0, right: 50, top: 500, bottom: 560 };
    const s = snapRect({ left: 1, right: 51, top: 100, bottom: 120 }, combineTargets(slide, elementTargets([a, b])));
    const at0 = s.guides.filter((g) => g.axis === 'x' && g.pos === 0);
    expect(at0).toHaveLength(1);
    expect(at0[0].kind).toBe('slide');
    expect(at0[0].to).toBe(H);
  });
});

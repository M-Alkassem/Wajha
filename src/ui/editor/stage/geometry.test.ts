import { describe, expect, it } from 'vitest';
import {
  angleOf,
  boxBounds,
  boxCorners,
  boxesOverlap,
  crisp,
  handlePoint,
  hitTest,
  normalizeAngle,
  pointInBox,
  resizeCursor,
  rotate,
  rotationStem,
  scaleBox,
  toLocal,
  toWorld,
  type Box,
} from './geometry';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('rotate / toLocal / toWorld', () => {
  it('rotates clockwise with y pointing down', () => {
    const p = rotate({ x: 1, y: 0 }, 90);
    close(p.x, 0);
    close(p.y, 1);
  });

  it('round-trips through the box frame', () => {
    const box: Box = { cx: 40, cy: -12, w: 30, h: 10, rotation: 33 };
    const p = { x: 17, y: 25 };
    const back = toWorld(box, toLocal(box, p));
    close(back.x, p.x);
    close(back.y, p.y);
  });

  it('treats a non-finite angle as no rotation', () => {
    expect(rotate({ x: 3, y: 4 }, Number.NaN)).toEqual({ x: 3, y: 4 });
  });
});

describe('pointInBox', () => {
  const box: Box = { cx: 100, cy: 100, w: 100, h: 20, rotation: 0 };

  it('tests the unrotated rectangle inclusively', () => {
    expect(pointInBox(box, { x: 150, y: 110 })).toBe(true);
    expect(pointInBox(box, { x: 151, y: 100 })).toBe(false);
    expect(pointInBox(box, { x: 100, y: 111 })).toBe(false);
  });

  it('follows the rotation', () => {
    const r = { ...box, rotation: 90 };
    // Rotated a quarter turn the long side is vertical.
    expect(pointInBox(r, { x: 100, y: 145 })).toBe(true);
    expect(pointInBox(r, { x: 145, y: 100 })).toBe(false);
  });

  it('grows by the tolerance and keeps hairlines clickable', () => {
    expect(pointInBox(box, { x: 153, y: 100 }, 4)).toBe(true);
    const line: Box = { cx: 0, cy: 0, w: 200, h: 0, rotation: 0 };
    expect(pointInBox(line, { x: 10, y: 2 })).toBe(false);
    expect(pointInBox(line, { x: 10, y: 2 }, 0, 6)).toBe(true);
  });

  it('never matches broken boxes', () => {
    expect(pointInBox({ cx: Number.NaN, cy: 0, w: 10, h: 10, rotation: 0 }, { x: 0, y: 0 })).toBe(false);
  });
});

describe('hitTest', () => {
  const boxes = [
    { id: 'bottom', cx: 50, cy: 50, w: 100, h: 100, rotation: 0 },
    { id: 'top', cx: 50, cy: 50, w: 20, h: 20, rotation: 0 },
  ];

  it('returns the topmost box (last in painter order) under the point', () => {
    expect(hitTest(boxes, { x: 50, y: 50 })?.id).toBe('top');
    expect(hitTest(boxes, { x: 5, y: 5 })?.id).toBe('bottom');
    expect(hitTest(boxes, { x: 500, y: 5 })).toBeNull();
  });

  it('skips boxes the filter rejects', () => {
    expect(hitTest(boxes, { x: 50, y: 50 }, (b) => b.id !== 'top')?.id).toBe('bottom');
  });
});

describe('corners and bounds', () => {
  it('lists corners clockwise from the top-left', () => {
    const [tl, tr, br, bl] = boxCorners({ cx: 0, cy: 0, w: 20, h: 10, rotation: 0 });
    expect([tl, tr, br, bl]).toEqual([
      { x: -10, y: -5 },
      { x: 10, y: -5 },
      { x: 10, y: 5 },
      { x: -10, y: 5 },
    ]);
  });

  it('bounds a rotated box', () => {
    const b = boxBounds({ cx: 0, cy: 0, w: 20, h: 10, rotation: 90 });
    close(b.left, -5);
    close(b.right, 5);
    close(b.top, -10);
    close(b.bottom, 10);
    const d = boxBounds({ cx: 0, cy: 0, w: 10, h: 10, rotation: 45 });
    close(d.right, Math.SQRT2 * 5);
  });

  it('scales boxes from canvas pixels to CSS pixels', () => {
    expect(scaleBox({ id: 'a', cx: 20, cy: 40, w: 10, h: 6, rotation: 12 }, 0.5)).toEqual({ id: 'a', cx: 10, cy: 20, w: 5, h: 3, rotation: 12 });
  });
});

describe('boxesOverlap', () => {
  const a: Box = { cx: 0, cy: 0, w: 20, h: 10, rotation: 0 };

  it('detects overlapping and separate axis-aligned boxes', () => {
    expect(boxesOverlap(a, { cx: 15, cy: 0, w: 20, h: 10, rotation: 0 })).toBe(true);
    expect(boxesOverlap(a, { cx: 40, cy: 0, w: 20, h: 10, rotation: 0 })).toBe(false);
    // A box inside another overlaps it.
    expect(boxesOverlap(a, { cx: 1, cy: 1, w: 2, h: 2, rotation: 0 })).toBe(true);
  });

  it('does not count boxes that only touch', () => {
    expect(boxesOverlap(a, { cx: 20, cy: 0, w: 20, h: 10, rotation: 0 })).toBe(false);
    expect(boxesOverlap(a, { cx: 0, cy: 10, w: 20, h: 10, rotation: 0 })).toBe(false);
  });

  it('uses the rotated outlines, not their bounds', () => {
    // A diamond whose bounds overlap the corner of `a` while the shapes stay apart.
    const diamond: Box = { cx: 17, cy: 12, w: 10, h: 10, rotation: 45 };
    const db = boxBounds(diamond);
    expect(db.left < 10 && db.top < 5).toBe(true);
    expect(boxesOverlap(a, diamond)).toBe(false);
    expect(boxesOverlap(a, { ...diamond, cx: 13, cy: 8 })).toBe(true);
  });

  it('never reports an overlap for broken boxes', () => {
    expect(boxesOverlap(a, { cx: Number.NaN, cy: 0, w: 10, h: 10, rotation: 0 })).toBe(false);
  });
});

describe('handles', () => {
  const box: Box = { cx: 50, cy: 50, w: 40, h: 20, rotation: 0 };

  it('places handles on corners and edge midpoints', () => {
    expect(handlePoint(box, 'nw')).toEqual({ x: 30, y: 40 });
    expect(handlePoint(box, 'e')).toEqual({ x: 70, y: 50 });
    expect(handlePoint(box, 's')).toEqual({ x: 50, y: 60 });
  });

  it('rotates handles and the rotation stem with the box', () => {
    const r = { ...box, rotation: 180 };
    const nw = handlePoint(r, 'nw');
    close(nw.x, 70);
    close(nw.y, 60);
    const stem = rotationStem(box, 20);
    expect(stem.base).toEqual({ x: 50, y: 40 });
    expect(stem.knob).toEqual({ x: 50, y: 20 });
  });

  it('picks resize cursors that follow the rotation', () => {
    expect(resizeCursor('n', 0)).toBe('ns-resize');
    expect(resizeCursor('e', 0)).toBe('ew-resize');
    expect(resizeCursor('ne', 0)).toBe('nesw-resize');
    expect(resizeCursor('se', 0)).toBe('nwse-resize');
    expect(resizeCursor('nw', 0)).toBe('nwse-resize');
    expect(resizeCursor('n', 90)).toBe('ew-resize');
    expect(resizeCursor('n', 45)).toBe('nesw-resize');
    expect(resizeCursor('e', -45)).toBe('nesw-resize');
    expect(resizeCursor('w', 180)).toBe('ew-resize');
  });
});

describe('angles', () => {
  it('normalizes into (-180, 180]', () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(720)).toBe(0);
    expect(Object.is(normalizeAngle(-360), -0)).toBe(false);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('measures pointer angles clockwise from the x axis', () => {
    close(angleOf({ x: 0, y: 0 }, { x: 0, y: 10 }), 90);
    close(angleOf({ x: 0, y: 0 }, { x: -10, y: 0 }), 180);
  });
});

describe('crisp', () => {
  it('centres 1 px lines on half pixels at 1x', () => {
    expect(crisp(10, 1)).toBe(10.5);
    expect(crisp(10.9, 1)).toBe(10.5);
    expect(crisp(11.2, 1)).toBe(11.5);
  });

  it('centres 1 px lines on whole device pixels at 2x', () => {
    expect(crisp(10, 2)).toBe(10);
    expect(crisp(10.3, 2)).toBe(10.5);
    expect(crisp(10.2, 2)).toBe(10);
  });

  it('copes with odd and broken ratios', () => {
    expect((crisp(10, 3) * 3) % 1).toBeCloseTo(0.5);
    expect(crisp(4, Number.NaN)).toBe(4.5);
  });
});

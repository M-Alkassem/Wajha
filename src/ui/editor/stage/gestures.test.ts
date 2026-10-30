import { describe, expect, it } from 'vitest';
import type { DeviceElement, ShapeElement, TextElement } from '../../../model/types';
import { newDeviceElement, newShapeElement, newTextElement, defaultTheme } from '../../../model/defaults';
import { handlePoint, type Box } from './geometry';
import {
  angleLabel,
  constrainDelta,
  handlesFor,
  movedPosition,
  resizeBehaviour,
  resizeBox,
  resizePatch,
  rotationFor,
  sizeLabel,
  textAnchorOffset,
} from './gestures';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const box: Box = { cx: 50, cy: 50, w: 40, h: 20, rotation: 0 };

describe('move', () => {
  it('constrains Shift drags to the dominant axis', () => {
    expect(constrainDelta(10, 4, false)).toEqual({ dx: 10, dy: 4 });
    expect(constrainDelta(10, 4, true)).toEqual({ dx: 10, dy: 0 });
    expect(constrainDelta(-3, 9, true)).toEqual({ dx: 0, dy: 9 });
  });

  it('turns CSS px into canvas fractions and clamps to the model range', () => {
    expect(movedPosition({ x: 0.5, y: 0.25 }, 30, -60, { width: 300, height: 600 })).toEqual({ x: 0.6, y: 0.15 });
    expect(movedPosition({ x: 2.9, y: 0 }, 1000, 0, { width: 100, height: 100 }).x).toBe(3);
    // A broken (zero) size counts as 1 px, and the result stays within the position range.
    expect(movedPosition({ x: 0.5, y: 0.5 }, 10, 10, { width: 0, height: 0 }).x).toBe(3);
  });
});

describe('resize rules', () => {
  it('picks one behaviour per kind and handle', () => {
    expect(resizeBehaviour('device', 'e', false)).toBe('proportional');
    expect(resizeBehaviour('image', 'nw', false)).toBe('proportional');
    expect(resizeBehaviour('shape', 'nw', false)).toBe('proportional');
    expect(resizeBehaviour('shape', 'nw', true)).toBe('free');
    expect(resizeBehaviour('shape', 'n', false)).toBe('free');
    expect(resizeBehaviour('text', 'e', false)).toBe('width');
    expect(resizeBehaviour('text', 'se', false)).toBe('proportional');
  });

  it('gives text no top or bottom handles', () => {
    expect(handlesFor('text')).not.toContain('n');
    expect(handlesFor('text')).not.toContain('s');
    expect(handlesFor('shape')).toHaveLength(8);
  });
});

describe('resizeBox', () => {
  it('scales proportionally from a corner, keeping the opposite corner', () => {
    const out = resizeBox({ box, handle: 'se', pointer: { x: 90, y: 70 }, behaviour: 'proportional', fromCenter: false });
    close(out.sx, 1.5);
    close(out.sy, 1.5);
    close(out.box.w, 60);
    close(out.box.h, 30);
    close(out.box.cx - out.box.w / 2, 30);
    close(out.box.cy - out.box.h / 2, 40);
  });

  it('scales about the centre with Alt', () => {
    const out = resizeBox({ box, handle: 'se', pointer: { x: 90, y: 70 }, behaviour: 'proportional', fromCenter: true });
    close(out.sx, 2);
    close(out.box.cx, 50);
    close(out.box.cy, 50);
  });

  it('scales proportionally from a side, growing both ways on the other axis', () => {
    const out = resizeBox({ box, handle: 'e', pointer: { x: 80, y: 99 }, behaviour: 'proportional', fromCenter: false });
    close(out.sx, 1.25);
    close(out.box.h, 25);
    close(out.box.cx - out.box.w / 2, 30);
    close(out.box.cy, 50);
  });

  it('changes one dimension in free mode', () => {
    const out = resizeBox({ box, handle: 'n', pointer: { x: 10, y: 30 }, behaviour: 'free', fromCenter: false });
    close(out.sx, 1);
    close(out.sy, 1.5);
    close(out.box.cy + out.box.h / 2, 60);
  });

  it('changes the text box width from a side, keeping the other side', () => {
    const out = resizeBox({ box, handle: 'w', pointer: { x: 20, y: 50 }, behaviour: 'width', fromCenter: false });
    close(out.sx, 1.25);
    close(out.sy, 1);
    close(out.box.cx + out.box.w / 2, 70);
  });

  it('works in the rotated frame', () => {
    const r: Box = { cx: 0, cy: 0, w: 40, h: 20, rotation: 90 };
    const out = resizeBox({ box: r, handle: 'e', pointer: { x: 0, y: 30 }, behaviour: 'proportional', fromCenter: false });
    close(out.sx, 1.25);
    close(out.box.cx, 0);
    close(out.box.cy, 5);
    // The opposite (west) side stays where it was.
    const w = handlePoint(out.box, 'w');
    close(w.x, 0);
    close(w.y, -20);
  });

  it('never collapses below the minimum size, even past the anchor', () => {
    const out = resizeBox({ box, handle: 'se', pointer: { x: -500, y: -500 }, behaviour: 'proportional', fromCenter: false, minSize: 8 });
    close(out.box.w, 8);
    const free = resizeBox({ box, handle: 'e', pointer: { x: -500, y: 50 }, behaviour: 'free', fromCenter: false, minSize: 8 });
    close(free.box.w, 8);
  });

  it('honours the grab offset so the handle does not jump', () => {
    const grab = { x: 3, y: -2 };
    const plain = resizeBox({ box, handle: 'se', pointer: { x: 90, y: 70 }, behaviour: 'proportional', fromCenter: false });
    const grabbed = resizeBox({ box, handle: 'se', pointer: { x: 93, y: 68 }, grab, behaviour: 'proportional', fromCenter: false });
    close(grabbed.sx, plain.sx);
  });
});

describe('resizePatch', () => {
  const theme = defaultTheme();
  const size = { width: 300, height: 600 };

  it('scales device and image widths and moves their centre', () => {
    const device: DeviceElement = { ...newDeviceElement('iphone', theme), width: 0.5 };
    const start: Box = { cx: 150, cy: 300, w: 150, h: 320, rotation: 0 };
    const out = { box: { ...start, cx: 165, w: 180 }, sx: 1.2, sy: 1.2 };
    expect(resizePatch(device, start, out, size)).toEqual({ x: 0.55, y: 0.5, width: 0.6 });
  });

  it('sets shape width and height separately', () => {
    const shape: ShapeElement = { ...newShapeElement('rect', theme), width: 0.5, height: 0.2 };
    const start: Box = { cx: 150, cy: 300, w: 150, h: 60, rotation: 0 };
    const patch = resizePatch(shape, start, { box: start, sx: 2, sy: 0.5 }, size);
    expect(patch).toMatchObject({ width: 1, height: 0.1 });
  });

  it('keeps the text anchor edge when only the width changes', () => {
    const text: TextElement = { ...newTextElement('headline', 'iphone', theme), width: 0.8, valign: 'top', y: 0.1 };
    // Box centred 30 px below the anchor (60 px tall), unrotated.
    const start: Box = { cx: 150, cy: 90, w: 240, h: 60, rotation: 0 };
    const out = resizeBox({ box: start, handle: 'e', pointer: { x: 300, y: 90 }, behaviour: 'width', fromCenter: false });
    const patch = resizePatch(text, start, out, size);
    expect(patch).not.toHaveProperty('style');
    close((patch as { y: number }).y, 0.1);
    close((patch as { width: number }).width, 0.8 * (270 / 240));
  });

  it('scales the font with a corner and anchors the scaled block', () => {
    const text: TextElement = { ...newTextElement('subtitle', 'iphone', theme), width: 0.8, valign: 'bottom', y: 0.5 };
    const start: Box = { cx: 150, cy: 270, w: 240, h: 60, rotation: 0 };
    const out = { box: { ...start, cy: 285, w: 360, h: 90 }, sx: 1.5, sy: 1.5 };
    const patch = resizePatch(text, start, out, size) as { y: number; width: number; style: { size: number } };
    close(patch.width, 1.2);
    close(patch.style.size, Math.round(text.style.size * 1.5 * 1e6) / 1e6);
    // Bottom-anchored: y is the block's bottom edge, 285 + 45.
    close(patch.y, 330 / 600);
  });

  it('measures the anchor offset per valign', () => {
    expect(textAnchorOffset('top', 10)).toBe(-5);
    expect(textAnchorOffset('middle', 10)).toBe(0);
    expect(textAnchorOffset('bottom', 10)).toBe(5);
  });
});

describe('rotationFor', () => {
  const c = { x: 0, y: 0 };

  it('adds the swept angle to the start rotation', () => {
    expect(rotationFor(c, { x: 10, y: 0 }, { x: 0, y: 10 }, 0)).toBe(90);
    expect(rotationFor(c, { x: 10, y: 0 }, { x: 10, y: -10 }, 10)).toBe(-35);
  });

  it('snaps to steps with Shift and settles near right angles otherwise', () => {
    const p = { x: Math.cos((22 * Math.PI) / 180), y: Math.sin((22 * Math.PI) / 180) };
    expect(rotationFor(c, { x: 1, y: 0 }, p, 0, { step: 15 })).toBe(15);
    const near = { x: Math.cos((91.5 * Math.PI) / 180), y: Math.sin((91.5 * Math.PI) / 180) };
    expect(rotationFor(c, { x: 1, y: 0 }, near, 0, { magnet: 2 })).toBe(90);
    expect(rotationFor(c, { x: 1, y: 0 }, near, 0)).toBeCloseTo(91.5, 1);
  });

  it('stays within (-180, 180]', () => {
    expect(rotationFor(c, { x: 10, y: 0 }, { x: -10, y: 1 }, 170)).toBeLessThanOrEqual(180);
    expect(rotationFor(c, { x: 10, y: 0 }, { x: -10, y: 1 }, 170)).toBeGreaterThan(-180);
    expect(rotationFor(c, { x: 1, y: 0 }, { x: 0, y: 1 }, Number.NaN)).toBe(90);
  });
});

describe('labels', () => {
  it('reports sizes in design pixels', () => {
    expect(sizeLabel({ cx: 0, cy: 0, w: 150, h: 300, rotation: 0 }, { width: 300, height: 600 }, { width: 1320, height: 2868 })).toBe('660 × 1320');
  });

  it('formats angles without negative zero', () => {
    expect(angleLabel(-0.01)).toBe('0°');
    expect(angleLabel(370)).toBe('10°');
    expect(angleLabel(-45.26)).toBe('-45.3°');
  });
});

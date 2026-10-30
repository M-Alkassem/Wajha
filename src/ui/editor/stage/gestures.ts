/**
 * Pure maths behind direct manipulation on the stage: what a drag, a handle
 * resize or a rotation does to an element. Inputs are CSS px of the slide
 * as displayed; outputs are element patches in model units (fractions of
 * the canvas for positions, of u for lengths), clamped to the model ranges.
 *
 * Resize rules (one predictable behaviour per kind):
 *  - The handle opposite the dragged one stays put; with Alt the element
 *    resizes about its centre instead.
 *  - Devices and images always scale proportionally (their height follows
 *    the screenshot or image aspect), from any handle.
 *  - Shapes: side handles change width or height alone; corner handles
 *    scale proportionally, and Shift frees them.
 *  - Text: left/right handles change the text box width (the text re-wraps
 *    and its anchored edge, see `valign`, stays put); corner handles scale
 *    the font size and the width together.
 */
import { RANGES, clampToRange, type Range } from '../../../model/rules';
import type { ElementKind, SlideElement, TextElement } from '../../../model/types';
import type { ElementPatch } from '../../../store/editor';
import { HANDLE_DIRS, angleOf, isCorner, normalizeAngle, toLocal, toWorld, type Box, type HandleId, type Point } from './geometry';

export interface SlideSize {
  /** Displayed slide size in CSS px. */
  width: number;
  height: number;
}

/** Pointer travel before a press becomes a drag (CSS px). */
export const DRAG_THRESHOLD = 3;
/** Smallest size a resize can produce, on screen. */
export const MIN_RESIZE_PX = 8;
/** Shift-rotation step. */
export const ROTATION_STEP = 15;
/** Without Shift, rotations this close to a multiple of 90 degrees settle on it. */
export const ROTATION_MAGNET = 2;

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, r: Range) => round6(clampToRange(v, r));

/* Move ------------------------------------------------------------------ */

/** With Shift, a drag moves along its dominant axis only. */
export function constrainDelta(dx: number, dy: number, shift: boolean): { dx: number; dy: number } {
  if (!shift) return { dx, dy };
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

/** New anchor position after moving by (dx, dy) CSS px. */
export function movedPosition(start: { x: number; y: number }, dx: number, dy: number, size: SlideSize): { x: number; y: number } {
  return {
    x: clamp(start.x + dx / Math.max(1, size.width), RANGES.position),
    y: clamp(start.y + dy / Math.max(1, size.height), RANGES.position),
  };
}

/* Resize ------------------------------------------------------------------ */

export type ResizeBehaviour = 'proportional' | 'free' | 'width';

/** How `kind` resizes from `handle` (see the module comment). */
export function resizeBehaviour(kind: ElementKind, handle: HandleId, shift: boolean): ResizeBehaviour {
  const corner = isCorner(handle);
  switch (kind) {
    case 'text':
      return corner ? 'proportional' : 'width';
    case 'shape':
      return corner && !shift ? 'proportional' : 'free';
    default:
      return 'proportional';
  }
}

/** Handles shown for an element kind: text has no top/bottom handles (its height follows the text). */
export function handlesFor(kind: ElementKind): readonly HandleId[] {
  return kind === 'text' ? (['nw', 'ne', 'e', 'se', 'sw', 'w'] as const) : (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const);
}

export interface ResizeInput {
  /** The element's box when the drag started (slide CSS px). */
  box: Box;
  handle: HandleId;
  /** Current pointer position (slide CSS px). */
  pointer: Point;
  /** Pointer minus handle position at pointerdown, so the handle does not jump under the cursor. */
  grab?: Point;
  behaviour: ResizeBehaviour;
  /** Alt: resize about the centre. */
  fromCenter: boolean;
  /** Smallest resulting size (CSS px). */
  minSize?: number;
}

export interface ResizeOutput {
  box: Box;
  /** Scale factors applied to the box width and height. */
  sx: number;
  sy: number;
}

export function resizeBox(input: ResizeInput): ResizeOutput {
  const { box, handle, behaviour, fromCenter } = input;
  const { hx, hy } = HANDLE_DIRS[handle];
  const min = Math.max(0.5, input.minSize ?? MIN_RESIZE_PX);
  const w0 = Math.max(1e-6, Math.abs(box.w));
  const h0 = Math.max(1e-6, Math.abs(box.h));
  const pointer = input.grab ? { x: input.pointer.x - input.grab.x, y: input.pointer.y - input.grab.y } : input.pointer;
  const L = toLocal(box, pointer);
  // The fixed point in the box's own frame: the opposite handle, or the centre.
  const ax = fromCenter ? 0 : (-hx * w0) / 2;
  const ay = fromCenter ? 0 : (-hy * h0) / 2;
  const reach = fromCenter ? 2 : 1;
  // Raw extents the pointer asks for along the axes this handle moves.
  const rawW = hx !== 0 ? (L.x - ax) * hx * reach : w0;
  const rawH = hy !== 0 ? (L.y - ay) * hy * reach : h0;

  let sx: number;
  let sy: number;
  if (behaviour === 'proportional') {
    let s: number;
    if (hx !== 0 && hy !== 0) {
      // Project the pointer onto the diagonal through the fixed point and the handle.
      const dx = (hx * w0) / (fromCenter ? 2 : 1);
      const dy = (hy * h0) / (fromCenter ? 2 : 1);
      s = ((L.x - ax) * dx + (L.y - ay) * dy) / (dx * dx + dy * dy);
    } else {
      s = hx !== 0 ? rawW / w0 : rawH / h0;
    }
    s = Math.max(s, min / Math.max(w0, h0));
    sx = s;
    sy = s;
  } else if (behaviour === 'width') {
    sx = hx !== 0 ? Math.max(rawW, min) / w0 : 1;
    sy = 1;
  } else {
    sx = hx !== 0 ? Math.max(rawW, min) / w0 : 1;
    sy = hy !== 0 ? Math.max(rawH, min) / h0 : 1;
  }

  const w = w0 * sx;
  const h = h0 * sy;
  const cx = fromCenter || hx === 0 ? 0 : ax + (hx * w) / 2;
  const cy = fromCenter || hy === 0 ? 0 : ay + (hy * h) / 2;
  const c = toWorld(box, { x: cx, y: cy });
  return { box: { cx: c.x, cy: c.y, w, h, rotation: box.rotation }, sx, sy };
}

/** How far the anchor `y` of a text block sits from the centre of a block `h` tall (canvas axes). */
export function textAnchorOffset(valign: TextElement['valign'], h: number): number {
  return valign === 'top' ? -h / 2 : valign === 'bottom' ? h / 2 : 0;
}

/**
 * The patch that gives `el` the resized box. `start` is the box the resize
 * started from (the text anchor offset is measured from it).
 */
export function resizePatch(el: SlideElement, start: Box, out: ResizeOutput, size: SlideSize): ElementPatch {
  const W = Math.max(1, size.width);
  const H = Math.max(1, size.height);
  const x = clamp(out.box.cx / W, RANGES.position);
  const y = clamp(out.box.cy / H, RANGES.position);
  switch (el.kind) {
    case 'device':
      return { x, y, width: clamp(el.width * out.sx, RANGES.deviceWidth) };
    case 'image':
      return { x, y, width: clamp(el.width * out.sx, RANGES.imageWidth) };
    case 'shape':
      return { x, y, width: clamp(el.width * out.sx, RANGES.shapeSize), height: clamp(el.height * out.sy, RANGES.shapeSize) };
    case 'text': {
      const scaled = out.sy !== 1;
      // The block's height after the resize: it scales with the type, or stays (until re-wrapped) when only the width changes.
      const h = start.h * out.sy;
      const ay = clamp((out.box.cy + textAnchorOffset(el.valign, h)) / H, RANGES.position);
      const patch: ElementPatch = { x, y: ay, width: clamp(el.width * out.sx, RANGES.textWidth) };
      if (scaled) return { ...patch, style: { size: clamp(el.style.size * out.sy, RANGES.fontSize) } };
      return patch;
    }
    default:
      return {};
  }
}

/* Rotate ------------------------------------------------------------------ */

export interface RotateOptions {
  /** Snap to multiples of this many degrees (Shift). */
  step?: number;
  /** Settle on multiples of 90 degrees within this many degrees (0 = off). */
  magnet?: number;
}

/** Rotation after dragging the knob from `startPointer` to `pointer` around `center`. */
export function rotationFor(center: Point, startPointer: Point, pointer: Point, startRotation: number, opts: RotateOptions = {}): number {
  const delta = angleOf(center, pointer) - angleOf(center, startPointer);
  let r = (Number.isFinite(startRotation) ? startRotation : 0) + delta;
  if (opts.step && opts.step > 0) {
    r = Math.round(r / opts.step) * opts.step;
  } else if (opts.magnet && opts.magnet > 0) {
    const nearest = Math.round(r / 90) * 90;
    if (Math.abs(r - nearest) <= opts.magnet) r = nearest;
  }
  return Math.round(normalizeAngle(r) * 100) / 100;
}

/* Labels ------------------------------------------------------------------- */

/** "W × H" of a box in design-canvas pixels of the family. */
export function sizeLabel(box: Box, size: SlideSize, design: { width: number; height: number }): string {
  const k = design.width / Math.max(1, size.width);
  return `${Math.round(Math.abs(box.w) * k)} × ${Math.round(Math.abs(box.h) * k)}`;
}

/** "15°" for the rotation readout. */
export function angleLabel(rotation: number): string {
  const r = Math.round(normalizeAngle(rotation) * 10) / 10;
  return `${Object.is(r, -0) ? 0 : r}°`;
}

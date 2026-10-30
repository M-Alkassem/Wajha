/**
 * Rotated-box geometry for the stage overlay: hit-testing, corners and
 * bounds, handle positions and cursors, and crisp hairline placement.
 *
 * Everything works in one 2D space with y pointing down (CSS px of a slide
 * or canvas px, the maths is the same) and angles in degrees clockwise, the
 * model's convention. A box is centred on (cx, cy) and rotated about its
 * centre, exactly like the engine draws elements.
 */

export interface Point {
  x: number;
  y: number;
}

/** A rectangle centred on (cx, cy), `w` x `h` before rotation, rotated clockwise by `rotation` degrees. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const DEG = Math.PI / 180;

const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** `p` rotated clockwise by `deg` about the origin (y down). */
export function rotate(p: Point, deg: number): Point {
  const a = finite(deg) * DEG;
  if (a === 0) return { x: p.x, y: p.y };
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** World point -> the box's own frame (origin at its centre, axes along its sides). */
export function toLocal(box: Box, p: Point): Point {
  return rotate({ x: p.x - box.cx, y: p.y - box.cy }, -box.rotation);
}

/** The box's own frame -> world point. */
export function toWorld(box: Box, local: Point): Point {
  const r = rotate(local, box.rotation);
  return { x: box.cx + r.x, y: box.cy + r.y };
}

/**
 * True when `p` lies inside the rotated box. `tolerance` grows the box on
 * every side (CSS px), and tiny boxes are treated as at least `minSize`
 * wide and tall so hairline elements stay clickable.
 */
export function pointInBox(box: Box, p: Point, tolerance = 0, minSize = 0): boolean {
  if (!Number.isFinite(box.cx) || !Number.isFinite(box.cy)) return false;
  const l = toLocal(box, p);
  const hw = Math.max(Math.abs(finite(box.w)), minSize) / 2 + tolerance;
  const hh = Math.max(Math.abs(finite(box.h)), minSize) / 2 + tolerance;
  return Math.abs(l.x) <= hw && Math.abs(l.y) <= hh;
}

/** Topmost box (last in painter's order) containing `p` that `accept` allows, or null. */
export function hitTest<T extends Box>(boxes: readonly T[], p: Point, accept?: (box: T) => boolean, tolerance = 0, minSize = 6): T | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (accept && !accept(b)) continue;
    if (pointInBox(b, p, tolerance, minSize)) return b;
  }
  return null;
}

/** Corners clockwise from the top-left (as drawn before rotation). */
export function boxCorners(box: Box): [Point, Point, Point, Point] {
  const hw = box.w / 2;
  const hh = box.h / 2;
  return [toWorld(box, { x: -hw, y: -hh }), toWorld(box, { x: hw, y: -hh }), toWorld(box, { x: hw, y: hh }), toWorld(box, { x: -hw, y: hh })];
}

/** Axis-aligned bounds of the rotated box. */
export function boxBounds(box: Box): Rect {
  if (!box.rotation) return { left: box.cx - box.w / 2, top: box.cy - box.h / 2, right: box.cx + box.w / 2, bottom: box.cy + box.h / 2 };
  const a = box.rotation * DEG;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (box.w * c + box.h * s) / 2;
  const hh = (box.w * s + box.h * c) / 2;
  return { left: box.cx - hw, top: box.cy - hh, right: box.cx + hw, bottom: box.cy + hh };
}

/**
 * True when two rotated boxes overlap by more than `slack` px (separating
 * axis test on the four side directions). Boxes that only touch do not count.
 */
export function boxesOverlap(a: Box, b: Box, slack = 0.5): boolean {
  const ca = boxCorners(a);
  const cb = boxCorners(b);
  if (![...ca, ...cb].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  for (const deg of [a.rotation, a.rotation + 90, b.rotation, b.rotation + 90]) {
    const axis = rotate({ x: 1, y: 0 }, deg);
    const span = (pts: readonly Point[]) => {
      let min = Infinity;
      let max = -Infinity;
      for (const p of pts) {
        const d = p.x * axis.x + p.y * axis.y;
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
      return { min, max };
    };
    const sa = span(ca);
    const sb = span(cb);
    if (sa.max - sb.min <= slack || sb.max - sa.min <= slack) return false;
  }
  return true;
}

/** The box scaled by (kx, ky) about the origin: canvas pixels -> CSS pixels. Rotation is kept. */
export function scaleBox<T extends Box>(box: T, kx: number, ky = kx): T {
  return { ...box, cx: box.cx * kx, cy: box.cy * ky, w: box.w * kx, h: box.h * ky };
}

/* Handles ------------------------------------------------------------- */

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type Dir = -1 | 0 | 1;

/** Direction of each handle from the box centre, in the box's own frame. */
export const HANDLE_DIRS: Readonly<Record<HandleId, { hx: Dir; hy: Dir }>> = {
  nw: { hx: -1, hy: -1 },
  n: { hx: 0, hy: -1 },
  ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 },
  se: { hx: 1, hy: 1 },
  s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 },
  w: { hx: -1, hy: 0 },
};

export const CORNER_HANDLES: readonly HandleId[] = ['nw', 'ne', 'se', 'sw'];
export const SIDE_HANDLES: readonly HandleId[] = ['n', 'e', 's', 'w'];

export const isCorner = (h: HandleId): boolean => h.length === 2;

/** World position of a handle. */
export function handlePoint(box: Box, handle: HandleId): Point {
  const { hx, hy } = HANDLE_DIRS[handle];
  return toWorld(box, { x: (hx * box.w) / 2, y: (hy * box.h) / 2 });
}

/** Top-centre of the box and the rotation knob `stem` px above it (both rotate with the box). */
export function rotationStem(box: Box, stem: number): { base: Point; knob: Point } {
  return { base: toWorld(box, { x: 0, y: -box.h / 2 }), knob: toWorld(box, { x: 0, y: -box.h / 2 - stem }) };
}

const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;

/**
 * Resize cursor for a handle on a box rotated by `rotation`: the handle's
 * direction is rotated and snapped to the nearest of the four cursor axes.
 */
export function resizeCursor(handle: HandleId, rotation: number): (typeof RESIZE_CURSORS)[number] {
  const { hx, hy } = HANDLE_DIRS[handle];
  // Screen angle of the handle direction, 0 = up, clockwise.
  const base = Math.atan2(hx, -hy) / DEG;
  const angle = (((base + finite(rotation)) % 180) + 180) % 180;
  // 0 = vertical (n/s), 45 = ne/sw, 90 = horizontal, 135 = nw/se.
  const index = Math.round(angle / 45) % 4;
  return RESIZE_CURSORS[index];
}

/* Angles ---------------------------------------------------------------- */

/** Angle in (-180, 180]. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = deg % 360;
  if (a <= -180) a += 360;
  else if (a > 180) a -= 360;
  // -0 reads badly in the inspector.
  return a === 0 ? 0 : a;
}

/** Clockwise angle in degrees of the vector from `center` to `p` (0 = pointing right). */
export function angleOf(center: Point, p: Point): number {
  return Math.atan2(p.y - center.y, p.x - center.x) / DEG;
}

/* Crisp hairlines --------------------------------------------------------- */

/**
 * Position for the centre of a 1 CSS px line so it covers whole device
 * pixels: on odd ratios (1x) the centre sits on a half pixel, on even ones
 * (2x) on a whole device pixel.
 */
export function crisp(v: number, dpr = 1): number {
  const d = Math.max(1, Math.round(finite(dpr, 1)));
  const half = (d % 2) / 2;
  return (Math.round(v * d - half) + half) / d;
}

/** Device pixel ratio of the window (1 outside a browser). */
export function windowDpr(): number {
  return typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

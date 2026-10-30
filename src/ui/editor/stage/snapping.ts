/**
 * Smart guides for dragging: the moving element's edges and centre snap to
 * the slide's centre lines, edges and safe margins, and to other elements'
 * edges and centres. All values are CSS px of one slide.
 */
import type { Rect } from './geometry';

export interface SnapLine {
  /** Position on the snapping axis (x for vertical lines, y for horizontal ones). */
  pos: number;
  /** Extent along the other axis, used to draw the guide. */
  from: number;
  to: number;
  kind: 'slide' | 'element';
}

export interface SnapTargets {
  /** Vertical lines (snap x). */
  x: SnapLine[];
  /** Horizontal lines (snap y). */
  y: SnapLine[];
}

export interface Guide {
  /** "x": a vertical line at x = pos; "y": a horizontal line at y = pos. */
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: 'slide' | 'element';
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Snapping distance on screen. */
export const SNAP_PX = 6;
/** Safe margin from the slide edges, as a fraction of the slide's short side. */
export const SAFE_MARGIN = 0.06;

const EPS = 0.5;

function addLine(lines: SnapLine[], line: SnapLine): void {
  if (!Number.isFinite(line.pos)) return;
  lines.push(line);
}

/** The slide's edges, safe margins and centre lines. */
export function slideTargets(width: number, height: number, margin = Math.min(width, height) * SAFE_MARGIN): SnapTargets {
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  const xs = [0, width / 2, width];
  const ys = [0, height / 2, height];
  if (margin > 0 && margin < width / 2) xs.push(margin, width - margin);
  if (margin > 0 && margin < height / 2) ys.push(margin, height - margin);
  for (const pos of xs) addLine(x, { pos, from: 0, to: height, kind: 'slide' });
  for (const pos of ys) addLine(y, { pos, from: 0, to: width, kind: 'slide' });
  return { x, y };
}

/** Edges and centres of other elements' bounds. */
export function elementTargets(rects: readonly Rect[]): SnapTargets {
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  for (const r of rects) {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    for (const pos of [r.left, cx, r.right]) addLine(x, { pos, from: r.top, to: r.bottom, kind: 'element' });
    for (const pos of [r.top, cy, r.bottom]) addLine(y, { pos, from: r.left, to: r.right, kind: 'element' });
  }
  return { x, y };
}

export function combineTargets(...all: SnapTargets[]): SnapTargets {
  return { x: all.flatMap((t) => t.x), y: all.flatMap((t) => t.y) };
}

/** Offset that brings the closest of `candidates` onto the closest line within `threshold`, or 0. */
function bestOffset(candidates: readonly number[], lines: readonly SnapLine[], threshold: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (const c of candidates) {
    for (const line of lines) {
      const d = line.pos - c;
      const dist = Math.abs(d);
      // Slide lines win ties: centring on the slide is the most common intent.
      if (dist <= threshold && (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && line.kind === 'slide'))) {
        best = d;
        bestDist = dist;
      }
    }
  }
  return bestDist === Infinity ? 0 : best;
}

function guidesFor(axis: 'x' | 'y', candidates: readonly number[], lines: readonly SnapLine[], spanFrom: number, spanTo: number): Guide[] {
  const out = new Map<string, Guide>();
  for (const c of candidates) {
    for (const line of lines) {
      if (Math.abs(line.pos - c) > EPS) continue;
      const key = `${Math.round(line.pos * 2)}`;
      const from = Math.min(line.from, spanFrom);
      const to = Math.max(line.to, spanTo);
      const prev = out.get(key);
      if (prev) {
        prev.from = Math.min(prev.from, from);
        prev.to = Math.max(prev.to, to);
        if (line.kind === 'slide') prev.kind = 'slide';
      } else {
        out.set(key, { axis, pos: line.pos, from, to, kind: line.kind });
      }
    }
  }
  return [...out.values()];
}

/**
 * Snaps a moved rectangle (the dragged element's bounds) to the targets.
 * Each axis snaps independently; `axes` turns one off (Shift-constrained
 * drags only move, and so only snap, along one axis). Returns the extra
 * offset to apply and the guides to draw at the snapped position.
 */
export function snapRect(rect: Rect, targets: SnapTargets, threshold = SNAP_PX, axes: { x: boolean; y: boolean } = { x: true, y: true }): SnapResult {
  const xs = [rect.left, (rect.left + rect.right) / 2, rect.right];
  const ys = [rect.top, (rect.top + rect.bottom) / 2, rect.bottom];
  const dx = axes.x ? bestOffset(xs, targets.x, threshold) : 0;
  const dy = axes.y ? bestOffset(ys, targets.y, threshold) : 0;
  const moved: Rect = { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy };
  const guides: Guide[] = [];
  if (axes.x) {
    const mx = [moved.left, (moved.left + moved.right) / 2, moved.right];
    guides.push(...guidesFor('x', mx, targets.x, moved.top, moved.bottom));
  }
  if (axes.y) {
    const my = [moved.top, (moved.top + moved.bottom) / 2, moved.bottom];
    guides.push(...guidesFor('y', my, targets.y, moved.left, moved.right));
  }
  return { dx, dy, guides };
}

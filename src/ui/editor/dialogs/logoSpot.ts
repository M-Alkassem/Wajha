/**
 * Where a brand logo goes on a slide: a small mark in the first corner
 * (top left, top right, bottom left, bottom right) where it covers no text.
 * Text boxes are estimated from their width, size and line limit, which is
 * enough to stay clear of headlines and subtitles. Pure.
 */
import { familyMetrics } from '../../../model/geometry';
import type { FamilyId, SlideLayout } from '../../../model/types';

export interface LogoSpot {
  /** Centre, fractions of the canvas. */
  x: number;
  y: number;
  /** Fraction of the canvas' short side. */
  width: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Margin from the canvas edges and gap kept to text, in u. */
const MARGIN = 0.05;
const GAP = 0.02;

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The logo spot for one slide layout; `aspect` is the logo's height / width. */
export function logoSpot(layout: SlideLayout | undefined, family: FamilyId, aspect: number): LogoSpot {
  const m = familyMetrics(family);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  // About an eighth of the short side wide, never taller than a tenth of it.
  const width = Math.min(0.14, 0.1 / a);
  const height = width * a;
  const texts: Box[] = (layout?.elements ?? []).flatMap((el) => {
    if (el.kind !== 'text' || el.hidden) return [];
    const cx = el.x * m.wu;
    const cy = el.y * m.hu;
    const w = el.width;
    const lines = el.style.maxLines > 0 ? el.style.maxLines : 2;
    const h = el.style.size * el.style.lineHeight * lines;
    return [{ left: cx - w / 2 - GAP, top: cy - h / 2 - GAP, right: cx + w / 2 + GAP, bottom: cy + h / 2 + GAP }];
  });
  const corners: Array<[number, number]> = [
    [MARGIN + width / 2, MARGIN + height / 2],
    [m.wu - MARGIN - width / 2, MARGIN + height / 2],
    [MARGIN + width / 2, m.hu - MARGIN - height / 2],
    [m.wu - MARGIN - width / 2, m.hu - MARGIN - height / 2],
  ];
  const free = corners.find(([cx, cy]) => !texts.some((t) => overlaps(t, { left: cx - width / 2, top: cy - height / 2, right: cx + width / 2, bottom: cy + height / 2 }))) ?? corners[0];
  return { x: free[0] / m.wu, y: free[1] / m.hu, width };
}

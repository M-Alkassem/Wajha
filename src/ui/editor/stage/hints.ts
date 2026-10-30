/**
 * Where the stage's editor-only marks go, as pure geometry: the screen of a
 * device (empty-slot hints, drop highlights), the layers that cover a mark
 * (everything above it in painter's order), a spot for a label that no
 * upper layer covers, and which text layers are empty. The overlay draws
 * marks under their covers, so a mark never paints over the picture.
 */
import type { FamilyId, LangCode, Slide, SlideLayout } from '../../../model/types';
import { FAMILIES } from '../../../model/catalog';
import { resolveText } from '../../../model/resolve';
import { deviceGeometry, plainText } from '../../../engine';
import { DEG, boxBounds, boxesOverlap, toWorld, type Box } from './geometry';
import type { StageBox } from './stageStore';

/** A screen (or other mark area) in slide CSS px; it rotates with its element. */
export interface MarkBox extends Box {
  /** Corner radius in CSS px. */
  radius: number;
}

/**
 * The device's screen in slide CSS px. The screen aspect is read back from
 * the painted box, so it also fits screenshots whose shape differs from the
 * family's. Other elements get their whole box.
 */
export function screenBox(box: StageBox, family: FamilyId): MarkBox {
  const whole: MarkBox = { cx: box.cx, cy: box.cy, w: box.w, h: box.h, rotation: box.rotation, radius: 0 };
  if (box.element.kind !== 'device') return whole;
  const frame = box.element.frame;
  try {
    let g = deviceGeometry(frame, box.w, FAMILIES[family]?.screenAspect ?? 0);
    // The outer height is the screen height plus width-bound bezels: solve for the painted aspect.
    const k = g.width > 0 ? box.w / g.width : 0;
    if (k > 0 && g.screen.w > 0 && Math.abs(g.height * k - box.h) > 0.5) {
      const aspect = (box.h / k - (g.height - g.screen.h)) / g.screen.w;
      if (Number.isFinite(aspect) && aspect > 0) g = deviceGeometry(frame, box.w, aspect);
    }
    const s = g.screen;
    if (k > 0 && [s.x, s.y, s.w, s.h, s.radius].every(Number.isFinite)) {
      const c = toWorld(box, { x: (s.x + s.w / 2) * k - box.w / 2, y: (s.y + s.h / 2) * k - box.h / 2 });
      return { cx: c.x, cy: c.y, w: s.w * k, h: s.h * k, rotation: box.rotation, radius: s.radius * k };
    }
  } catch {
    // Fall back to the whole box.
  }
  return { ...whole, radius: Math.min(box.w, box.h) * 0.08 };
}

/** Layers above `boxes[index]` (painted after it) that overlap `area`. */
export function coveringBoxes(boxes: readonly StageBox[], index: number, area: Box): StageBox[] {
  const out: StageBox[] = [];
  for (let i = index + 1; i < boxes.length; i++) if (boxesOverlap(boxes[i], area)) out.push(boxes[i]);
  return out;
}

/** Label centres tried along an area's vertical axis, from -1 (top) to 1 (bottom) of the free span: the middle first. */
const SPOTS = [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9];

/**
 * An upright `w` x `h` label inside `area` (`inset` px clear of its edges,
 * however the area is turned) that none of `covers` overlaps and that stays
 * on the slide: the middle when it is free, else a spot above or below it
 * along the area. Labels are UI, so they never tilt with a tilted phone.
 * Null when the label does not fit or every spot is covered.
 */
export function labelSpot(
  area: Box,
  size: { w: number; h: number },
  covers: readonly Box[],
  slide: { width: number; height: number },
  inset = 4,
): Box | null {
  const a = (Number.isFinite(area.rotation) ? area.rotation : 0) * DEG;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  // Half-extents of the upright label along the area's own axes.
  const ex = (size.w * cos + size.h * sin) / 2;
  const ey = (size.w * sin + size.h * cos) / 2;
  const free = area.h / 2 - inset - ey;
  if (area.w / 2 - inset < ex || free < 0) return null;
  for (const f of SPOTS) {
    const c = toWorld(area, { x: 0, y: f * free });
    const spot: Box = { cx: c.x, cy: c.y, w: size.w, h: size.h, rotation: 0 };
    const b = boxBounds(spot);
    if (b.left < 0 || b.top < 0 || b.right > slide.width || b.bottom > slide.height) continue;
    if (!covers.some((o) => boxesOverlap(o, spot))) return spot;
  }
  return null;
}

/** Visible text layers of `layout` without words in `lang` (after base-language fallback), in painter's order. */
export function emptyTextIds(slide: Slide, layout: SlideLayout, lang: LangCode, baseLang: LangCode): string[] {
  const out: string[] = [];
  for (const el of layout.elements) {
    if (el.kind !== 'text' || el.hidden || !(el.opacity > 0)) continue;
    if (plainText(resolveText(slide, el.key, lang, baseLang)).trim() === '') out.push(el.id);
  }
  return out;
}

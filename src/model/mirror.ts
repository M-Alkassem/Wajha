/**
 * Right-to-left mirroring. An Arabic or Hebrew store listing reads from the
 * right, so a slide whose phone sits on the right in English puts it on the
 * left: every element moves to the other side of the slide's centre line
 * and leans the other way. Nothing is stored mirrored; renderers mirror the
 * one shared layout when they draw a mirrored language, and the editor maps
 * its edits back. Mirroring twice gives the original back.
 */
import { isRtl } from './catalog';
import type { LangCode, Project, Shadow, SlideElement, SlideLayout } from './types';

/** Whether slides in `lang` are drawn mirrored: right-to-left languages, unless the project turned it off. */
export function mirrorsLayout(project: Pick<Project, 'mirrorRtl'> | null | undefined, lang: LangCode): boolean {
  return isRtl(lang) && project?.mirrorRtl !== false;
}

const flipX = (x: unknown) => (typeof x === 'number' ? 1 - x : x);
const flipAngle = (a: unknown) => (typeof a === 'number' && a !== 0 ? -a : a);
const flipShadow = (s: Shadow | null): Shadow | null => (s && typeof s === 'object' && typeof s.x === 'number' && s.x !== 0 ? { ...s, x: -s.x } : s);

/** The element on the other side of the slide: x mirrored, rotation and shadow offsets reversed. */
export function mirrorElement<T extends SlideElement>(el: T): T {
  const out = { ...el, x: flipX(el.x), rotation: flipAngle(el.rotation) } as T;
  if (out.kind === 'text') {
    if (out.style && typeof out.style === 'object') out.style = { ...out.style, shadow: flipShadow(out.style.shadow) };
  } else if (out.kind !== 'shape' && 'shadow' in out) {
    out.shadow = flipShadow(out.shadow);
  }
  return out;
}

/** The layout with every element mirrored (the background is mirrored by the painter). */
export function mirrorLayout(layout: SlideLayout): SlideLayout {
  return { ...layout, elements: layout.elements.map(mirrorElement) };
}

/** Mirrors the position and angle of an element patch, to store an edit made on a mirrored slide. */
export function mirrorPatch<P extends { x?: number; rotation?: number }>(patch: P): P {
  const out = { ...patch };
  if (typeof out.x === 'number') out.x = 1 - out.x;
  if (typeof out.rotation === 'number' && out.rotation !== 0) out.rotation = -out.rotation;
  return out;
}

/**
 * Shared drag-and-drop setup for the sortable slide and layer lists:
 * pointer drags start after 4 px (so clicks still select) and stay on their
 * column. The keyboard moves the focused row one place per press with
 * Mod+ArrowUp / Mod+ArrowDown instead of a dnd-kit keyboard drag: a drag
 * picked up with Space grabbed the row whenever Space was pressed to pan the
 * stage, and held every editor shortcut until Escape.
 */
import { PointerSensor, useSensor, useSensors, type Modifier } from '@dnd-kit/core';
import { matchShortcut, platformIsMac, shortcutLabel, type ShortcutEventLike } from '../../kit';

/** Keeps a dragged row on its column. */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Moves the focused row one place up (kit shortcut syntax). */
export const MOVE_UP_KEYS = 'mod+arrowup';
/** Moves the focused row one place down. */
export const MOVE_DOWN_KEYS = 'mod+arrowdown';

/** Pointer sensor for a vertical sortable list. */
export function useListSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
}

/** -1 or 1 when `event` asks to move the focused row up or down, else 0. */
export function moveDelta(event: ShortcutEventLike, isMac: boolean = platformIsMac()): -1 | 0 | 1 {
  if (matchShortcut(event, MOVE_UP_KEYS, isMac)) return -1;
  if (matchShortcut(event, MOVE_DOWN_KEYS, isMac)) return 1;
  return 0;
}

/** Screen reader instructions for a sortable row (`noun` e.g. "slide"). */
export function sortInstructions(noun: string, isMac: boolean = platformIsMac()): string {
  return `To move this ${noun}, press ${shortcutLabel(MOVE_UP_KEYS, isMac)} or ${shortcutLabel(MOVE_DOWN_KEYS, isMac)}.`;
}

/**
 * Keeps `el` visible inside the scrolling `container` without touching any
 * other scroll position (scrollIntoView would also scroll clipped ancestors).
 */
export function scrollIntoViewWithin(container: HTMLElement, el: HTMLElement, margin = 8, smooth = false): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let delta = 0;
  if (r.top < c.top + margin) delta = r.top - c.top - margin;
  else if (r.bottom > c.bottom - margin) delta = Math.min(r.bottom - c.bottom + margin, r.top - c.top - margin);
  if (delta === 0) return;
  const top = container.scrollTop + delta;
  if (smooth && typeof container.scrollTo === 'function') container.scrollTo({ top, behavior: 'smooth' });
  else container.scrollTop = top;
}

/** True when the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Keyboard movement inside a grid of tiles (template pickers): arrow keys
 * move focus between tiles marked [data-tile], rows wrap, Home and End jump.
 */
import type { KeyboardEvent } from 'react';
import { gridNeighbor, isGridKey } from './format';

/** Number of columns a CSS grid lays out right now (its resolved track list). */
export function gridColumns(grid: Element): number {
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
}

/** Put on the grid container. */
export function onTemplateGridKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (!isGridKey(e.key) || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const target = e.target as HTMLElement;
  if (!target.matches('[data-tile]')) return;
  const tiles = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-tile]'));
  const index = tiles.indexOf(target);
  if (index < 0) return;
  const next = gridNeighbor(index, e.key, tiles.length, gridColumns(e.currentTarget));
  e.preventDefault();
  if (next === null) return;
  tiles[next].focus();
  tiles[next].scrollIntoView({ block: 'nearest' });
}

/**
 * iPhone Pro: continuous corners, metal band, thin uniform black border,
 * Dynamic Island, Action button + volume on the left, side button on the right.
 */
import type { ScreenRect } from '../types';
import type { SlabHardware } from './slab';
import { paintButton } from './slab';
import { pillPath } from './paths';

/** Dynamic Island, as fractions of the screen width. */
export const ISLAND = { width: 0.3, height: 0.088, top: 0.032 };

/** Buttons as [from, to] spans in fractions of the device width, measured from the top edge. */
const LEFT_BUTTONS: ReadonlyArray<readonly [number, number]> = [
  [0.3, 0.385], // Action button
  [0.47, 0.6], // volume up
  [0.64, 0.77], // volume down
];
const RIGHT_BUTTONS: ReadonlyArray<readonly [number, number]> = [[0.5, 0.71]];
const BUTTON_OUT = 0.006;

export function islandRect(screen: ScreenRect): { x: number; y: number; w: number; h: number } {
  const w = screen.w * ISLAND.width;
  const h = Math.min(screen.w * ISLAND.height, screen.h * 0.5);
  return { x: screen.x + (screen.w - w) / 2, y: screen.y + Math.min(screen.w * ISLAND.top, screen.h * 0.1), w, h };
}

export const iphoneHardware: SlabHardware = {
  buttons(ctx, L, paint) {
    const out = L.w * BUTTON_OUT;
    // Spans are tied to the width so tall screens do not stretch them; skip any that would reach the bottom corner.
    const limit = L.h - L.radius;
    for (const [a, b] of LEFT_BUTTONS) if (b * L.w < limit) paintButton(ctx, 'left', 0, a * L.w, b * L.w, out, paint);
    for (const [a, b] of RIGHT_BUTTONS) if (b * L.w < limit) paintButton(ctx, 'right', L.w, a * L.w, b * L.w, out, paint);
  },
  overlays(ctx, L) {
    const r = islandRect(L.screen);
    ctx.beginPath();
    pillPath(ctx, r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#000000';
    ctx.fill();
    // The front camera hides at the right end of the island; just a hint of glass.
    const lr = r.h * 0.2;
    const lx = r.x + r.w - r.h * 0.5;
    const ly = r.y + r.h / 2;
    const g = ctx.createRadialGradient(lx - lr * 0.3, ly - lr * 0.3, 0, lx, ly, lr);
    g.addColorStop(0, 'rgba(70, 82, 120, 0.55)');
    g.addColorStop(0.6, 'rgba(18, 22, 40, 0.6)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  },
};

/**
 * Android hardware: a Pixel-like phone (punch-hole camera, power above the
 * volume rocker on the right) and tablet (camera on the top bezel).
 */
import type { ScreenRect } from '../types';
import type { SlabHardware } from './slab';
import { paintButton, paintLens } from './slab';

/** Punch-hole camera: diameter as a fraction of the device width, centre as a fraction of the screen width below its top. */
export const PUNCH_HOLE = { diameter: 0.034, centerY: 0.052 };

export function punchHole(screen: ScreenRect, deviceWidth: number): { cx: number; cy: number; r: number } {
  const r = Math.min(deviceWidth * PUNCH_HOLE.diameter, screen.h * 0.2) / 2;
  return { cx: screen.x + screen.w / 2, cy: screen.y + Math.max(screen.w * PUNCH_HOLE.centerY, r * 1.6), r };
}

export const androidPhoneHardware: SlabHardware = {
  buttons(ctx, L, paint) {
    const out = L.w * 0.0058;
    const limit = L.h - L.radius;
    if (L.w * 0.55 < limit) paintButton(ctx, 'right', L.w, L.w * 0.42, L.w * 0.55, out, paint);
    if (L.w * 0.92 < limit) paintButton(ctx, 'right', L.w, L.w * 0.64, L.w * 0.92, out, paint);
  },
  overlays(ctx, L) {
    const { cx, cy, r } = punchHole(L.screen, L.w);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    // Lens glass: a darker core with a faint blue reflection, readable only up close.
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r * 0.62);
    g.addColorStop(0, 'rgba(70, 86, 130, 0.5)');
    g.addColorStop(0.5, 'rgba(14, 18, 32, 0.7)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  },
};

export const androidTabletHardware: SlabHardware = {
  buttons(ctx, L, paint) {
    const out = L.w * 0.0042;
    paintButton(ctx, 'top', 0, L.w * 0.7, L.w * 0.8, out, paint);
    const limit = L.h - L.radius;
    if (L.w * 0.3 < limit) paintButton(ctx, 'right', L.w, L.w * 0.12, L.w * 0.3, out, paint);
  },
  bezel(ctx, L) {
    const bezel = L.inset - L.band;
    paintLens(ctx, L.w / 2, L.band + bezel / 2, Math.min(L.w * 0.0046, bezel * 0.3));
  },
};

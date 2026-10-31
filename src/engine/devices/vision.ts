/**
 * Apple Vision Pro: an app window as visionOS shows it, a sheet of frosted
 * glass floating in space with the grab bar under it. The glass ignores the
 * frame colour: visionOS windows are always glass.
 */
import type { Ctx2D } from '../types';
import type { VisionLayout } from './geometry';
import { pillPath, roundRectPath } from './paths';
import type { ScreenContent } from './screen';
import { paintScreen } from './screen';

export function visionBodyPath(ctx: Ctx2D, L: VisionLayout): void {
  const g = L.window;
  roundRectPath(ctx, g.x, g.y, g.w, g.h, g.radius);
}

export function paintVision(ctx: Ctx2D, L: VisionLayout, px: number, content: ScreenContent): void {
  const g = L.window;
  // Frosted glass: a light tint that brightens towards the top edge.
  const tint = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
  tint.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
  tint.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
  ctx.beginPath();
  visionBodyPath(ctx, L);
  ctx.fillStyle = tint;
  ctx.fill();
  // A bright hairline where the glass catches the light.
  const hair = Math.max(1 / px, g.w * 0.0012);
  ctx.lineWidth = hair;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  roundRectPath(ctx, g.x + hair / 2, g.y + hair / 2, g.w - hair, g.h - hair, Math.max(0, g.radius - hair / 2));
  ctx.stroke();

  const s = L.screen;
  paintScreen(ctx, s, (c) => roundRectPath(c, s.x, s.y, s.w, s.h, s.radius), content);

  const b = L.bar;
  ctx.beginPath();
  pillPath(ctx, b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.fill();
}

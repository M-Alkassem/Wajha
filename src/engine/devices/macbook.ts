/**
 * MacBook Pro seen straight on: aluminium-rimmed glass lid with a notch,
 * a glimpse of the hinge, and the thin front slab of the base with its
 * thumb scoop. The base is the widest part and spans the whole geometry.
 */
import type { Ctx2D } from '../types';
import { darken, lighten, mix } from '../color';
import type { MacLayout } from './geometry';
import type { FramePaint } from './finish';
import { roundRectPath } from './paths';
import type { ScreenContent } from './screen';
import { paintScreen } from './screen';
import { paintBand, paintInnerShadow, paintLens } from './slab';

function lidPath(ctx: Ctx2D, L: MacLayout, inset: number): void {
  const { lid } = L;
  const t = Math.max(0, lid.rTop - inset);
  const b = Math.max(0, lid.rBottom - inset);
  roundRectPath(ctx, lid.x + inset, lid.y + inset, lid.w - 2 * inset, lid.h - 2 * inset, [t, t, b, b]);
}

/** Front slab of the base: tiny top corners, soft elliptical bottom corners where the case curves under. */
export function basePath(ctx: Ctx2D, L: MacLayout): void {
  const { x, y, w, h } = L.base;
  if (!(w > 0) || !(h > 0)) return;
  const rt = Math.min(h * 0.22, w / 4);
  const rx = Math.min(w * 0.034, w / 4);
  const ry = Math.min(h * 0.78, h - rt);
  const k = 0.5523; // cubic circle constant
  ctx.moveTo(x + rt, y);
  ctx.lineTo(x + w - rt, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rt);
  ctx.lineTo(x + w, y + h - ry);
  ctx.bezierCurveTo(x + w, y + h - ry * (1 - k), x + w - rx * (1 - k), y + h, x + w - rx, y + h);
  ctx.lineTo(x + rx, y + h);
  ctx.bezierCurveTo(x + rx * (1 - k), y + h, x, y + h - ry * (1 - k), x, y + h - ry);
  ctx.lineTo(x, y + rt);
  ctx.quadraticCurveTo(x, y, x + rt, y);
  ctx.closePath();
}

/** Lid and base outlines, for the drop shadow. */
export function macBodyPath(ctx: Ctx2D, L: MacLayout): void {
  lidPath(ctx, L, 0);
  basePath(ctx, L);
}

function paintBase(ctx: Ctx2D, L: MacLayout, paint: FramePaint, px: number): void {
  const { x, y, w, h } = L.base;
  const c = paint.base;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (paint.finish === 'clay') {
    g.addColorStop(0, lighten(c, 0.05));
    g.addColorStop(1, darken(c, 0.12));
  } else if (paint.finish === 'matte') {
    g.addColorStop(0, lighten(c, 0.16));
    g.addColorStop(0.5, c);
    g.addColorStop(1, darken(c, 0.28));
  } else {
    g.addColorStop(0, lighten(c, 0.5));
    g.addColorStop(0.1, lighten(c, 0.2));
    g.addColorStop(0.45, c);
    g.addColorStop(0.82, darken(c, 0.2));
    g.addColorStop(1, darken(c, 0.45));
  }
  ctx.beginPath();
  basePath(ctx, L);
  ctx.fillStyle = g;
  ctx.fill();

  if (paint.finish !== 'clay') {
    // Brushed aluminium falls off towards the ends and brightens in the middle.
    const hg = ctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    hg.addColorStop(0.07, 'rgba(0, 0, 0, 0)');
    hg.addColorStop(0.5, `rgba(255, 255, 255, ${paint.finish === 'metal' ? 0.1 : 0.05})`);
    hg.addColorStop(0.93, 'rgba(0, 0, 0, 0)');
    hg.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.beginPath();
    basePath(ctx, L);
    ctx.fillStyle = hg;
    ctx.fill();
  }

  // Thumb scoop in the top edge.
  const nw = w * 0.13;
  const nh = h * 0.42;
  const nx = x + (w - nw) / 2;
  const sg = ctx.createLinearGradient(0, y, 0, y + nh);
  sg.addColorStop(0, darken(c, paint.finish === 'clay' ? 0.16 : 0.38));
  sg.addColorStop(1, darken(c, paint.finish === 'clay' ? 0.05 : 0.1));
  ctx.beginPath();
  ctx.moveTo(nx, y);
  ctx.bezierCurveTo(nx + nh * 0.9, y, nx + nh * 0.55, y + nh, nx + nh * 1.9, y + nh);
  ctx.lineTo(nx + nw - nh * 1.9, y + nh);
  ctx.bezierCurveTo(nx + nw - nh * 0.55, y + nh, nx + nw - nh * 0.9, y, nx + nw, y);
  ctx.closePath();
  ctx.fillStyle = sg;
  ctx.fill();

  if (paint.finish === 'metal') {
    // Chamfered top edge catching the light.
    const hair = Math.min(1 / px, h * 0.08);
    ctx.fillStyle = lighten(c, 0.72);
    ctx.fillRect(x + w * 0.004, y, w * 0.992, hair);
  }
  // Underside in shadow, with the case curving away from view.
  const ug = ctx.createLinearGradient(0, y + h * 0.82, 0, y + h);
  ug.addColorStop(0, 'rgba(0, 0, 0, 0)');
  ug.addColorStop(1, `rgba(0, 0, 0, ${paint.finish === 'clay' ? 0.12 : 0.28})`);
  ctx.beginPath();
  basePath(ctx, L);
  ctx.fillStyle = ug;
  ctx.fill();
}

function paintHinge(ctx: Ctx2D, L: MacLayout, paint: FramePaint): void {
  const { x, y, w, h } = L.hinge;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (paint.finish === 'clay') {
    g.addColorStop(0, darken(paint.base, 0.35));
    g.addColorStop(1, darken(paint.base, 0.2));
  } else {
    g.addColorStop(0, '#0b0b0d');
    g.addColorStop(0.55, mix('#26262a', paint.base, 0.15));
    g.addColorStop(1, '#0e0e10');
  }
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, [0, 0, h * 0.5, h * 0.5]);
  ctx.fillStyle = g;
  ctx.fill();
}

function paintNotch(ctx: Ctx2D, L: MacLayout, paint: FramePaint, px: number): void {
  const s = L.screen;
  const nw = L.notch.w;
  const nh = L.notch.h;
  if (!(nw > 0) || !(nh > 0)) return;
  const x = s.x + (s.w - nw) / 2;
  const y = s.y - Math.min(1 / px, (s.y - L.rim) * 0.5); // overlap the bezel so no seam shows
  const r = nh * 0.36;
  const f = Math.min(nh * 0.24, nw * 0.1);
  const bottom = s.y + nh;
  ctx.beginPath();
  ctx.moveTo(x - f, y);
  ctx.quadraticCurveTo(x, y, x, y + f);
  ctx.lineTo(x, bottom - r);
  ctx.quadraticCurveTo(x, bottom, x + r, bottom);
  ctx.lineTo(x + nw - r, bottom);
  ctx.quadraticCurveTo(x + nw, bottom, x + nw, bottom - r);
  ctx.lineTo(x + nw, y + f);
  ctx.quadraticCurveTo(x + nw, y, x + nw + f, y);
  ctx.closePath();
  ctx.fillStyle = paint.bezel;
  ctx.fill();
  paintLens(ctx, s.x + s.w / 2, s.y + nh * 0.46, nh * 0.17);
}

/** Paints the whole laptop with its top-left at the current origin. */
export function paintMacbook(ctx: Ctx2D, L: MacLayout, paint: FramePaint, px: number, content: ScreenContent): void {
  paintHinge(ctx, L, paint);
  paintBase(ctx, L, paint, px);

  const lidBox = { x: L.lid.x, y: L.lid.y, w: L.lid.w, h: L.lid.h };
  paintBand(ctx, (inset) => lidPath(ctx, L, inset), L.rim, paint, px, lidBox);
  // Black glass around the display, as a ring that tucks one pixel under the screen.
  const s = L.screen;
  const o = Math.min(1 / px, s.w * 0.01, s.h * 0.01);
  ctx.beginPath();
  lidPath(ctx, L, L.rim);
  roundRectPath(ctx, s.x + o, s.y + o, s.w - 2 * o, s.h - 2 * o, [s.radius, s.radius, 0, 0]);
  ctx.fillStyle = paint.bezel;
  ctx.fill('evenodd');
  if (!paint.bezelMatchesBody) {
    const hair = Math.min(1 / px, L.rim);
    ctx.lineWidth = hair;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    lidPath(ctx, L, L.rim + hair * 0.5);
    ctx.stroke();
  }

  const screenPath = (c: Ctx2D) => roundRectPath(c, s.x, s.y, s.w, s.h, [s.radius, s.radius, 0, 0]);
  paintScreen(ctx, s, screenPath, content);
  if (paint.bezelMatchesBody) paintInnerShadow(ctx, s, screenPath, L.lid.w * 0.008 * px, L.lid.w * 0.0015 * px, 0.18);
  paintNotch(ctx, L, paint, px);
}

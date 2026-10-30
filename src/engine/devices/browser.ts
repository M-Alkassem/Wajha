/**
 * Desktop browser window: rounded window, toolbar with traffic lights,
 * navigation chevrons, a URL field and a few actions. The chrome is light
 * or dark following the luminance of the frame colour.
 */
import type { Ctx2D } from '../types';
import { darken, lighten, luminance, mix } from '../color';
import type { BrowserLayout } from './geometry';
import type { FramePaint } from './finish';
import { roundRectPath } from './paths';
import type { ScreenContent } from './screen';
import { paintScreen } from './screen';

export const TRAFFIC_LIGHTS = ['#ff5f57', '#febc2e', '#28c840'] as const;

/** Toolbar tones for a frame colour; exported for tests. */
export function browserChrome(paint: FramePaint): { dark: boolean; toolbar: string; top: string; bottom: string } {
  const dark = luminance(paint.base) < 0.4;
  const toolbar = paint.finish === 'clay' ? paint.base : dark ? mix('#232327', paint.base, 0.45) : mix('#f3f3f5', paint.base, 0.4);
  if (paint.finish === 'metal') return { dark, toolbar, top: lighten(toolbar, dark ? 0.07 : 0.4), bottom: darken(toolbar, dark ? 0.12 : 0.035) };
  if (paint.finish === 'matte') return { dark, toolbar, top: lighten(toolbar, dark ? 0.03 : 0.2), bottom: darken(toolbar, dark ? 0.05 : 0.015) };
  return { dark, toolbar, top: toolbar, bottom: toolbar };
}

function stroke(ctx: Ctx2D, color: string, width: number, draw: () => void): void {
  ctx.beginPath();
  draw();
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Paints window and toolbar with the top-left at the current origin, then the page. */
export function paintBrowser(ctx: Ctx2D, L: BrowserLayout, paint: FramePaint, px: number, content: ScreenContent): void {
  const { w, h, radius: R, toolbar: T } = L;
  const chrome = browserChrome(paint);
  const ink = chrome.dark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.5)';
  const faint = chrome.dark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(0, 0, 0, 0.2)';

  // Only the toolbar needs painting: the page covers the rest of the window.
  const tg = ctx.createLinearGradient(0, 0, 0, T);
  tg.addColorStop(0, chrome.top);
  tg.addColorStop(1, chrome.bottom);
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, Math.min(h, T + Math.min(1 / px, T * 0.1)), [R, R, 0, 0]);
  ctx.fillStyle = tg;
  ctx.fill();

  // Traffic lights.
  const r = T * 0.115;
  const gap = T * 0.38;
  const x0 = T * 0.42;
  const cy = T / 2;
  TRAFFIC_LIGHTS.forEach((color, i) => {
    const cx = x0 + i * gap;
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, lighten(color, 0.12));
    g.addColorStop(1, darken(color, 0.06));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.min(r * 0.18, 0.8 / px);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.stroke();
  });

  // Back / forward.
  const icon = T * 0.13;
  const lw = Math.max(T * 0.038, 0.5 / px);
  const navX = x0 + 2 * gap + r + T * 0.62;
  stroke(ctx, ink, lw, () => {
    ctx.moveTo(navX + icon * 0.5, cy - icon);
    ctx.lineTo(navX - icon * 0.5, cy);
    ctx.lineTo(navX + icon * 0.5, cy + icon);
  });
  const fwdX = navX + T * 0.55;
  stroke(ctx, faint, lw, () => {
    ctx.moveTo(fwdX - icon * 0.5, cy - icon);
    ctx.lineTo(fwdX + icon * 0.5, cy);
    ctx.lineTo(fwdX - icon * 0.5, cy + icon);
  });

  // URL field, centred, with a padlock, the address as a skeleton bar and a reload arrow.
  const leftEnd = fwdX + T * 0.5;
  const rightStart = w - T * 1.75;
  const pw = Math.min(w * 0.44, Math.max(0, 2 * Math.min(w / 2 - leftEnd, rightStart - w / 2)));
  const ph = T * 0.58;
  if (pw > T * 2) {
    const px0 = (w - pw) / 2;
    const py0 = cy - ph / 2;
    ctx.beginPath();
    roundRectPath(ctx, px0, py0, pw, ph, ph * 0.32);
    ctx.fillStyle = chrome.dark ? 'rgba(255, 255, 255, 0.085)' : 'rgba(0, 0, 0, 0.06)';
    ctx.fill();
    const barW = pw * 0.34;
    const barH = ph * 0.26;
    const lockW = ph * 0.26;
    const groupW = lockW + ph * 0.22 + barW;
    const gx = w / 2 - groupW / 2;
    // Padlock.
    const lockH = lockW * 0.8;
    const ly = cy - lockH * 0.28;
    ctx.beginPath();
    roundRectPath(ctx, gx, ly, lockW, lockH, lockW * 0.18);
    ctx.fillStyle = ink;
    ctx.fill();
    stroke(ctx, ink, lockW * 0.17, () => {
      ctx.moveTo(gx + lockW * 0.24, ly);
      ctx.arc(gx + lockW / 2, ly - lockW * 0.08, lockW * 0.26, Math.PI, 0);
      ctx.lineTo(gx + lockW * 0.76, ly);
    });
    ctx.beginPath();
    roundRectPath(ctx, gx + lockW + ph * 0.22, cy - barH / 2, barW, barH, barH / 2);
    ctx.fillStyle = chrome.dark ? 'rgba(255, 255, 255, 0.42)' : 'rgba(0, 0, 0, 0.34)';
    ctx.fill();
    // Reload.
    const rx = px0 + pw - ph * 0.5;
    const rr = ph * 0.16;
    stroke(ctx, faint, Math.max(ph * 0.05, 0.5 / px), () => {
      ctx.arc(rx, cy, rr, -Math.PI * 0.35, Math.PI * 1.45);
    });
  }

  // Share and new tab.
  const sx = w - T * 1.15;
  const s = T * 0.15;
  stroke(ctx, ink, lw, () => {
    ctx.moveTo(sx - s * 0.6, cy - s * 0.15);
    ctx.lineTo(sx - s * 0.9, cy - s * 0.15);
    ctx.lineTo(sx - s * 0.9, cy + s * 1.05);
    ctx.lineTo(sx + s * 0.9, cy + s * 1.05);
    ctx.lineTo(sx + s * 0.9, cy - s * 0.15);
    ctx.lineTo(sx + s * 0.6, cy - s * 0.15);
    ctx.moveTo(sx, cy + s * 0.35);
    ctx.lineTo(sx, cy - s * 1.15);
    ctx.moveTo(sx - s * 0.45, cy - s * 0.7);
    ctx.lineTo(sx, cy - s * 1.15);
    ctx.lineTo(sx + s * 0.45, cy - s * 0.7);
  });
  const nx = w - T * 0.5;
  stroke(ctx, ink, lw, () => {
    ctx.moveTo(nx - s, cy);
    ctx.lineTo(nx + s, cy);
    ctx.moveTo(nx, cy - s);
    ctx.lineTo(nx, cy + s);
  });

  // Toolbar separator.
  const hair = Math.min(1 / px, T * 0.05);
  ctx.fillStyle = chrome.dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, T - hair, w, hair);

  const sc = L.screen;
  paintScreen(ctx, sc, (c) => roundRectPath(c, sc.x, sc.y, sc.w, sc.h, [0, 0, sc.radius, sc.radius]), content);

  // Window outline: a hairline that keeps the window crisp on any background.
  const outline = paint.bezelMatchesBody
    ? darken(chrome.toolbar, chrome.dark ? 0.3 : 0.14)
    : chrome.dark
      ? 'rgba(255, 255, 255, 0.16)'
      : 'rgba(0, 0, 0, 0.16)';
  ctx.lineWidth = hair;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  roundRectPath(ctx, hair / 2, hair / 2, w - hair, h - hair, Math.max(0, R - hair / 2));
  ctx.stroke();
}

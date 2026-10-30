/**
 * Stand-ins for the device painter in engine tests (vi.mock('./devices')),
 * so renderer tests do not depend on another package's artwork.
 *  - fakeDrawDevice: a plain rectangle widthPx x widthPx * screenAspect,
 *    filled with the screenshot, or a flat colour per placeholder kind.
 *  - qaDrawDevice: a softer phone silhouette for visual QA sheets.
 */
import type { DeviceGeometry, DeviceGeometryFn, DrawDeviceFn } from '../types';

export const FAKE_MOCK_COLOR = '#2050e0';
export const FAKE_EMPTY_COLOR = '#808080';

export const fakeDeviceGeometry: DeviceGeometryFn = (_frame, widthPx, screenAspect) => ({
  width: widthPx,
  height: widthPx * screenAspect,
  screen: { x: 0, y: 0, w: widthPx, h: widthPx * screenAspect, radius: 0 },
});

export const fakeDrawDevice: DrawDeviceFn = (ctx, opts) => {
  const g = fakeDeviceGeometry(opts.el.frame, opts.widthPx, opts.screenAspect);
  if (opts.screen) ctx.drawImage(opts.screen, -g.width / 2, -g.height / 2, g.width, g.height);
  else {
    ctx.fillStyle = opts.placeholder === 'mock' ? FAKE_MOCK_COLOR : FAKE_EMPTY_COLOR;
    ctx.fillRect(-g.width / 2, -g.height / 2, g.width, g.height);
  }
  return g;
};

/** A phone-like silhouette with a shadow and a screen, for QA renders only. */
export const qaDrawDevice: DrawDeviceFn = (ctx, opts) => {
  const bezel = opts.widthPx * 0.035;
  const w = opts.widthPx;
  const sw = w - 2 * bezel;
  const sh = sw * opts.screenAspect;
  const h = sh + 2 * bezel;
  const geometry: DeviceGeometry = { width: w, height: h, screen: { x: bezel, y: bezel, w: sw, h: sh, radius: sw * 0.11 } };
  const r = w * 0.14;
  ctx.save();
  const shadow = opts.el.shadow;
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur * opts.unit;
    ctx.shadowOffsetX = shadow.x * opts.unit;
    ctx.shadowOffsetY = shadow.y * opts.unit;
  }
  ctx.fillStyle = opts.el.style.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-sw / 2, -sh / 2, sw, sh, geometry.screen.radius);
  ctx.clip();
  if (opts.screen) {
    const k = Math.max(sw / opts.screen.width, sh / opts.screen.height);
    ctx.drawImage(opts.screen, -(opts.screen.width * k) / 2, -(opts.screen.height * k) / 2, opts.screen.width * k, opts.screen.height * k);
  } else {
    const g = ctx.createLinearGradient(0, -sh / 2, 0, sh / 2);
    const accent = opts.mock.palette[0] ?? '#7c3aed';
    g.addColorStop(0, opts.mock.dark ? '#161622' : '#f5f6fa');
    g.addColorStop(1, opts.mock.dark ? '#22223a' : '#e6e8f2');
    ctx.fillStyle = g;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    if (opts.placeholder === 'mock') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(-sw * 0.4, -sh * 0.38, sw * 0.8, sh * 0.22, sw * 0.06);
      ctx.fill();
      ctx.fillStyle = opts.mock.dark ? '#ffffff22' : '#00000014';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.roundRect(-sw * 0.4, -sh * 0.1 + i * sh * 0.11, sw * 0.8, sh * 0.08, sw * 0.04);
        ctx.fill();
      }
    }
  }
  // Dynamic Island
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(-sw * 0.16, -sh / 2 + sh * 0.018, sw * 0.32, sw * 0.09, sw * 0.045);
  ctx.fill();
  ctx.restore();
  return geometry;
};

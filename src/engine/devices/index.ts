/**
 * Device frames: procedural vector artwork for every `DeviceFrameId`.
 *
 *   geometry.ts   pure layout (body box, screen rect) used for hit-testing
 *   finish.ts     metal / matte / clay colour recipes
 *   shadow.ts     body-shaped drop shadows without ctx.filter
 *   screen.ts     screenshot cover-fit, mock and empty placeholders
 *   slab.ts       shared phone/tablet/watch/TV painter (+ iphone, ipad, android, watch)
 *   macbook.ts, vision.ts, browser.ts
 */
import type { FamilyId } from '../../model/types';
import type { Ctx2D, DeviceGeometryFn, DrawDeviceFn } from '../types';
import { androidPhoneHardware, androidTabletHardware } from './android';
import { paintBrowser } from './browser';
import { framePaint } from './finish';
import type { FrameLayout, SlabFrame } from './geometry';
import { frameLayout, knownFrame, toGeometry } from './geometry';
import { iphoneHardware } from './iphone';
import { ipadHardware } from './ipad';
import { macBodyPath, paintMacbook } from './macbook';
import { insetSmoothRect, roundRectPath, smoothRectPath } from './paths';
import type { ScreenContent } from './screen';
import { paintScreen } from './screen';
import { currentScale, drawShadow } from './shadow';
import type { SlabHardware } from './slab';
import { paintSlab } from './slab';
import { paintVision, visionBodyPath } from './vision';
import { tvHardware, watchHardware } from './watch';

export { frameLayout } from './geometry';
export type { FrameLayout } from './geometry';

/** Corner smoothing used for frame "none", so bare screenshots get iOS-like corners. */
const BARE_SMOOTHING = 0.45;

const HARDWARE: Record<SlabFrame, SlabHardware> = {
  iphone: iphoneHardware,
  ipad: ipadHardware,
  'android-phone': androidPhoneHardware,
  'android-tablet': androidTabletHardware,
  watch: watchHardware,
  tv: tvHardware,
};

const MOCK_FAMILY: Partial<Record<string, FamilyId>> = {
  iphone: 'iphone',
  ipad: 'ipad',
  'android-phone': 'android-phone',
  'android-tablet': 'android-tablet',
  macbook: 'mac',
  watch: 'watch',
  tv: 'apple-tv',
  vision: 'vision',
};

/** Outline of the device body (what casts the shadow), top-left at the origin. */
function bodyPath(ctx: Ctx2D, L: FrameLayout): void {
  switch (L.kind) {
    case 'slab':
      insetSmoothRect(ctx, L.w, L.h, L.radius, L.smoothing, 0);
      return;
    case 'macbook':
      macBodyPath(ctx, L);
      return;
    case 'vision':
      visionBodyPath(ctx, L);
      return;
    case 'browser':
      roundRectPath(ctx, 0, 0, L.w, L.h, L.radius);
      return;
    case 'none':
      smoothRectPath(ctx, 0, 0, L.w, L.h, L.screen.radius, BARE_SMOOTHING);
      return;
  }
}

/**
 * Outer size and screen rect of a frame at `widthPx`. Pure and cheap.
 * Inputs are sanitised (aspect clamped to 0.3..4, NaN replaced by the
 * frame's default), so the result is always finite and positive. For
 * frame "none" the radius is a nominal default; drawDevice reports the
 * element's own corner radius.
 */
export const deviceGeometry: DeviceGeometryFn = (frame, widthPx, screenAspect) => toGeometry(frameLayout(frame, widthPx, screenAspect));

/**
 * Draws the device centred at the current origin: shadow, body and finish,
 * bezel, screen (screenshot, mock or empty), hardware overlays. Side buttons
 * are painted just before the body so it hides where they attach. Restores
 * every context property it touches. Returns the geometry it drew, which
 * equals `deviceGeometry` except for the corner radius of frame "none".
 */
export const drawDevice: DrawDeviceFn = (ctx, opts) => {
  const el = opts.el;
  const frame = knownFrame(el.frame);
  const L = frameLayout(frame, opts.widthPx, opts.screenAspect, el.cornerRadius);
  const geometry = toGeometry(L);
  const paint = framePaint(el.style);

  ctx.save();
  // Never inherit a caller's shadow: every fill below would cast one.
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(-L.w / 2, -L.h / 2);
  const px = currentScale(ctx);

  // Bare screenshots may be translucent, so they get no contact shading under their edges.
  if (el.shadow) drawShadow(ctx, el.shadow, opts.unit, L.w, L.h, (c) => bodyPath(c, L), L.kind !== 'none');

  const content: ScreenContent = {
    image: opts.screen,
    placeholder: opts.placeholder,
    mock: opts.mock ?? { seed: 0, palette: [], dark: false },
    family: MOCK_FAMILY[frame],
    chrome: frame === 'browser' ? 'web' : 'device',
    backdrop: frame !== 'none',
  };

  switch (L.kind) {
    case 'slab':
      paintSlab(ctx, L, paint, px, content, HARDWARE[L.frame]);
      break;
    case 'macbook':
      paintMacbook(ctx, L, paint, px, content);
      break;
    case 'vision':
      paintVision(ctx, L, px, content);
      break;
    case 'browser':
      paintBrowser(ctx, L, paint, px, content);
      break;
    case 'none': {
      const s = L.screen;
      paintScreen(ctx, s, (c) => smoothRectPath(c, s.x, s.y, s.w, s.h, s.radius, BARE_SMOOTHING), content);
      break;
    }
  }
  ctx.restore();
  return geometry;
};

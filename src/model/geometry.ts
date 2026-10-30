/**
 * Canvas and device size estimates shared by the default layouts and
 * adaptLayout. The model never imports the engine, so device heights are
 * estimated from the screen aspect plus a per-frame bezel allowance. The
 * allowances err on the large side: a fitted device may end up a little
 * smaller than it could be, never taller than planned.
 */
import { FAMILIES, FAMILY_ORDER } from './catalog';
import type { DeviceFrameId, FamilyId } from './types';

export interface CanvasMetrics {
  width: number;
  height: number;
  /** min(width, height) in pixels; every length in a layout is a fraction of it. */
  u: number;
  /** Canvas width and height in u. */
  wu: number;
  hu: number;
  /** Landscape enough for side-by-side layouts (Mac, feature graphic). */
  wide: boolean;
}

/** Width / height above which a canvas counts as wide. */
export const WIDE_RATIO = 1.15;

const positive = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

/** Metrics for any canvas shape; broken sizes count as 1 px so nothing divides by zero. */
export function canvasMetrics(shape: { width: number; height: number } | null | undefined): CanvasMetrics {
  const width = positive(shape?.width, 1);
  const height = positive(shape?.height, 1);
  const u = Math.min(width, height);
  return { width, height, u, wu: width / u, hu: height / u, wide: width > height * WIDE_RATIO };
}

/** Metrics of a family's design canvas (unknown families measure like the iPhone). */
export function familyMetrics(family: FamilyId): CanvasMetrics {
  return canvasMetrics((FAMILIES[family] ?? FAMILIES.iphone).design);
}

/** Extra outer height per unit of device width, on top of the screen aspect. */
export const BEZEL_ALLOWANCE: Readonly<Record<DeviceFrameId, number>> = {
  iphone: 0.06,
  'android-phone': 0.06,
  ipad: 0.08,
  'android-tablet': 0.08,
  // Lid bezel plus the aluminium base.
  macbook: 0.07,
  // Title bar and URL bar.
  browser: 0.09,
  none: 0,
};

/** Estimated outer height / width of a device whose screen has `screenAspect` (height / width). */
export function deviceHeightFactor(frame: DeviceFrameId, screenAspect: number): number {
  const aspect = Math.min(5, Math.max(0.2, positive(screenAspect, 2)));
  return aspect + (BEZEL_ALLOWANCE[frame] ?? 0.06);
}

/** Frames that are some family's default; adaptLayout swaps these for the target family's. */
const DEFAULT_FRAMES: ReadonlySet<DeviceFrameId> = new Set(FAMILY_ORDER.map((f) => FAMILIES[f].defaultFrame));

/** True for frames that are some family's default ("browser" and "none" are not). */
export function isFamilyDefaultFrame(frame: DeviceFrameId): boolean {
  return DEFAULT_FRAMES.has(frame);
}

/**
 * The family whose design canvas `shape` is: an exact size match first,
 * else the closest aspect ratio (earlier families win ties).
 */
export function familyForCanvas(shape: { width: number; height: number }): FamilyId {
  const m = canvasMetrics(shape);
  for (const f of FAMILY_ORDER) {
    const d = FAMILIES[f].design;
    if (d.width === m.width && d.height === m.height) return f;
  }
  const target = Math.log(m.width / m.height);
  let best: FamilyId = 'iphone';
  let bestDiff = Infinity;
  for (const f of FAMILY_ORDER) {
    const d = FAMILIES[f].design;
    const diff = Math.abs(Math.log(d.width / d.height) - target);
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff;
      best = f;
    }
  }
  return best;
}

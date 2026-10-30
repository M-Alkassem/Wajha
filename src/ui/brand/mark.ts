/**
 * Geometry of the Wajha mark, shared by <Logo> and scripts/make-icon.mjs so
 * the in-app logo and the app icon never drift apart.
 *
 * The mark is an arched shop window (a vitrine, the "storefront" of واجهة)
 * glowing with a sunset, with a phone standing in it as a dark silhouette.
 * Coordinates live in a 64 x 64 square. Plain data only: the icon script
 * imports this file directly with Node's type stripping.
 */

export const MARK_VIEWBOX = 64;

/** Arch: a 40-unit-wide window with a semicircular head and softly rounded sill corners. */
export const ARCH = { left: 12, right: 52, top: 6, bottom: 58, springY: 26, radius: 20, corner: 3 } as const;

/** Phone silhouette inside the arch, standing a little above the sill. */
export const PHONE = { x: 24, y: 22, w: 16, h: 31, radius: 4.25 } as const;

/** Dynamic-island pill near the top of the phone (drawn at large sizes only). */
export const ISLAND = { x: 29.4, y: 24.7, w: 5.2, h: 1.9 } as const;

export const ARCH_PATH =
  `M${ARCH.left} ${ARCH.springY}` +
  `A${ARCH.radius} ${ARCH.radius} 0 0 1 ${ARCH.right} ${ARCH.springY}` +
  `V${ARCH.bottom - ARCH.corner}` +
  `A${ARCH.corner} ${ARCH.corner} 0 0 1 ${ARCH.right - ARCH.corner} ${ARCH.bottom}` +
  `H${ARCH.left + ARCH.corner}` +
  `A${ARCH.corner} ${ARCH.corner} 0 0 1 ${ARCH.left} ${ARCH.bottom - ARCH.corner}Z`;

/** Rounded rectangle as an SVG path (clockwise), for the phone, its screen and the island. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return (
    `M${n(x + k)} ${n(y)}H${n(x + w - k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + w)} ${n(y + k)}` +
    `V${n(y + h - k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + w - k)} ${n(y + h)}` +
    `H${n(x + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x)} ${n(y + h - k)}` +
    `V${n(y + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + k)} ${n(y)}Z`
  );
}

export const PHONE_PATH = roundedRectPath(PHONE.x, PHONE.y, PHONE.w, PHONE.h, PHONE.radius);
export const ISLAND_PATH = roundedRectPath(ISLAND.x, ISLAND.y, ISLAND.w, ISLAND.h, ISLAND.h / 2);

/** Sunset down the arch: violet sky, rose, orange, a warm horizon at the sill. */
export const SUNSET_STOPS: ReadonlyArray<readonly [offset: number, color: string]> = [
  [0, '#7C6CFF'],
  [0.46, '#FF4D7E'],
  [0.84, '#FF8A3D'],
  [1, '#FFB65C'],
];

/** The night the phone is cut from (also the app icon background). */
export const NIGHT = '#0E0B1C';

/**
 * Closed superellipse |x/r|^n + |y/r|^n = 1 as an SVG path: the continuous
 * "squircle" of macOS app icons (n ≈ 5). Used by the icon script.
 */
export function superellipsePath(cx: number, cy: number, r: number, n = 5, segments = 360): string {
  const steps = Math.max(8, Math.floor(segments));
  const e = 2 / (Number.isFinite(n) && n > 0 ? n : 5);
  const round = (v: number) => Math.round(v * 100) / 100;
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + r * Math.sign(c) * Math.abs(c) ** e;
    const y = cy + r * Math.sign(s) * Math.abs(s) ** e;
    d += `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
  }
  return `${d}Z`;
}

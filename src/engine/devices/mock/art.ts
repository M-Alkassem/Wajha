/**
 * Procedural "photography" for mock screens: landscapes, abstract auras,
 * album covers, product shots, avatars and a stylised map. Each piece is
 * seeded by its own key, so it does not depend on drawing order.
 */
import type { Ctx2D } from '../../types';
import { darken, lighten, mix, rgba, rotateHue } from '../../color';
import { roundRectPath, type Radii } from '../paths';
import type { Mk } from './kit';
import { circle, linear, radial, smoothPath } from './kit';
import { icon, type IconName } from './icons';
import { createRng, type Rng } from './rng';

/** Index into a list of `n` items for any key, including negatives, fractions and NaN. */
function slot(k: number, n: number): number {
  const i = Number.isFinite(k) ? Math.floor(k) : 0;
  return ((i % n) + n) % n;
}

interface Scene {
  sky: [string, string];
  sun: string;
  ridges: [string, string, string];
}

const SCENES: readonly Scene[] = [
  { sky: ['#ff9f7a', '#ffe0c2'], sun: '#fff6e8', ridges: ['#e89c8f', '#b96a78', '#5e3a5c'] },
  { sky: ['#6aa8ff', '#d9eaff'], sun: '#ffffff', ridges: ['#a3bfe0', '#5f86b8', '#2b4b78'] },
  { sky: ['#2a1c52', '#d07a8c'], sun: '#ffd7a8', ridges: ['#8a5583', '#523065', '#21153a'] },
  { sky: ['#8fd9cb', '#f2f8e6'], sun: '#ffffff', ridges: ['#94caa9', '#4f9b7b', '#1f5c4b'] },
  { sky: ['#ffc65c', '#fff0c4'], sun: '#fffaf0', ridges: ['#eaa65c', '#c5733a', '#7a3f20'] },
  { sky: ['#0e2346', '#4a78b0'], sun: '#eef4ff', ridges: ['#36608f', '#1f3f68', '#0b1b33'] },
];

/** Blends a scene towards the brand colour so photos feel part of the same app. */
function sceneFor(m: Mk, k: number): Scene {
  const base = SCENES[slot(k, SCENES.length)];
  const a = m.t.accent;
  const tintC = (c: string) => mix(c, a, 0.12);
  return {
    sky: [tintC(base.sky[0]), tintC(base.sky[1])],
    sun: base.sun,
    ridges: [tintC(base.ridges[0]), tintC(base.ridges[1]), tintC(base.ridges[2])],
  };
}

function clipRound(m: Mk, x: number, y: number, w: number, h: number, r: number | Radii): void {
  m.ctx.beginPath();
  roundRectPath(m.ctx, x, y, w, h, r);
  m.ctx.clip();
}

function ridge(ctx: Ctx2D, rng: Rng, x: number, y: number, w: number, h: number, base: number, amp: number, n: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const px = x + (w * i) / n;
    const peak = i % 2 === 0 ? rng.range(0.35, 1) : rng.range(0, 0.3);
    pts.push([px, y + h * base - amp * h * peak]);
  }
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  smoothPath(ctx, pts, false, 0.75);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/** A landscape or abstract photo filling the rounded rect. */
export function photo(m: Mk, x: number, y: number, w: number, h: number, r: number | Radii, k: number): void {
  if (!(w > 0) || !(h > 0)) return;
  const ctx = m.ctx;
  const rng = createRng(k * 7919 + 17);
  const kind = slot(k, 4);
  const sc = sceneFor(m, Math.floor(k / 4) + k);
  ctx.save();
  clipRound(m, x, y, w, h, r);
  if (kind === 3) {
    aura(m, x, y, w, h, rng);
    ctx.restore();
    return;
  }
  ctx.fillStyle = linear(m, 0, y, 0, y + h, [
    [0, sc.sky[0]],
    [0.7, sc.sky[1]],
  ]);
  ctx.fillRect(x, y, w, h);
  const sx = x + w * rng.range(0.25, 0.75);
  const sy = y + h * (kind === 1 ? 0.56 : rng.range(0.28, 0.42));
  const sr = Math.min(w, h) * rng.range(0.08, 0.13);
  ctx.fillStyle = radial(m, sx, sy, sr * 4.5, [
    [0, rgba(sc.sun, 0.75)],
    [0.25, rgba(sc.sun, 0.25)],
    [1, rgba(sc.sun, 0)],
  ]);
  ctx.fillRect(x, y, w, h);
  circle(m, sx, sy, sr, sc.sun);

  if (kind === 1) {
    // Sea: horizon, water gradient and a broken sun reflection.
    const hy = y + h * 0.6;
    ctx.fillStyle = linear(m, 0, hy, 0, y + h, [
      [0, mix(sc.ridges[1], sc.sky[1], 0.35)],
      [1, sc.ridges[2]],
    ]);
    ctx.fillRect(x, hy, w, y + h - hy);
    for (let i = 0; i < 7; i++) {
      const ry = hy + (y + h - hy) * (0.08 + i * 0.13);
      const rw = sr * (2.2 - i * 0.2) * rng.range(0.7, 1.2);
      ctx.fillStyle = rgba(sc.sun, 0.5 - i * 0.05);
      ctx.beginPath();
      roundRectPath(ctx, sx - rw / 2, ry, rw, Math.max(1, h * 0.012), h * 0.006);
      ctx.fill();
    }
  } else {
    // Mountains (kind 0) or dunes (kind 2) with atmospheric perspective.
    const n = kind === 0 ? 6 : 3;
    const amp = kind === 0 ? 0.3 : 0.12;
    [0.66, 0.78, 0.9].forEach((base, i) => {
      ridge(ctx, rng, x - w * 0.05, y, w * 1.1, h, base, amp * (1 - i * 0.18), n + i);
      ctx.fillStyle = linear(m, 0, y + h * (base - amp), 0, y + h, [
        [0, sc.ridges[i]],
        [1, darken(sc.ridges[i], 0.18)],
      ]);
      ctx.fill();
    });
  }
  ctx.restore();
}

/** Soft colour blobs, the iOS-wallpaper look. */
export function aura(m: Mk, x: number, y: number, w: number, h: number, rng: Rng): void {
  const ctx = m.ctx;
  const t = m.t;
  // Analogous hues only: overlapping blobs of distant hues blend into mud.
  const spin = rng.range(-30, 30);
  const base = rotateHue(t.accent, spin);
  ctx.fillStyle = linear(m, x, y, x + w, y + h, [
    [0, lighten(base, 0.38)],
    [1, darken(rotateHue(t.companion, spin), 0.12)],
  ]);
  ctx.fillRect(x, y, w, h);
  const blobs = [rotateHue(base, 42), rotateHue(base, -38), lighten(base, 0.62), rotateHue(t.companion, spin)];
  blobs.forEach((c, i) => {
    const cx = x + w * rng.range(0.1, 0.9);
    const cy = y + h * rng.range(0.1, 0.9);
    const r = Math.max(w, h) * rng.range(0.35, 0.6);
    ctx.fillStyle = radial(m, cx, cy, r, [
      [0, rgba(c, i === 2 ? 0.7 : 0.85)],
      [1, rgba(c, 0)],
    ]);
    ctx.fillRect(x, y, w, h);
  });
}

/** Square album cover in one of four graphic styles. */
export function albumArt(m: Mk, x: number, y: number, s: number, r: number, k: number): void {
  if (!(s > 0)) return;
  const ctx = m.ctx;
  const rng = createRng(k * 104729 + 3);
  const hue = rng.range(-60, 60);
  const c0 = rotateHue(m.t.accent, hue);
  const c1 = rotateHue(c0, rng.chance(0.5) ? 38 : -42);
  ctx.save();
  clipRound(m, x, y, s, s, r);
  const style = slot(k, 4);
  if (style === 0) {
    aura(m, x, y, s, s, rng);
  } else if (style === 1) {
    // Sunset stripes behind a sun disc.
    ctx.fillStyle = linear(m, 0, y, 0, y + s, [
      [0, darken(c0, 0.45)],
      [1, c1],
    ]);
    ctx.fillRect(x, y, s, s);
    circle(m, x + s / 2, y + s * 0.52, s * 0.28, linear(m, 0, y + s * 0.24, 0, y + s * 0.8, [
      [0, lighten(c1, 0.6)],
      [1, c0],
    ]));
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = darken(c0, 0.45);
      ctx.fillRect(x, y + s * (0.58 + i * 0.055), s, s * (0.012 + i * 0.006));
    }
  } else if (style === 2) {
    // Bauhaus shapes.
    ctx.fillStyle = lighten(c1, 0.75);
    ctx.fillRect(x, y, s, s);
    circle(m, x + s * 0.36, y + s * 0.4, s * 0.26, c0);
    ctx.fillStyle = darken(c1, 0.25);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.95);
    ctx.lineTo(x + s * 0.95, y + s * 0.95);
    ctx.lineTo(x + s * 0.95, y + s * 0.5);
    ctx.closePath();
    ctx.fill();
    circle(m, x + s * 0.74, y + s * 0.26, s * 0.08, darken(c0, 0.35));
  } else {
    // Concentric waves.
    ctx.fillStyle = darken(c0, 0.55);
    ctx.fillRect(x, y, s, s);
    for (let i = 9; i >= 1; i--) {
      circle(m, x + s * 0.5, y + s * 1.05, s * 0.12 * i, mix(c0, c1, i / 9));
      circle(m, x + s * 0.5, y + s * 1.05, s * 0.12 * i - s * 0.03, darken(mix(c0, c1, i / 9), 0.25));
    }
  }
  // Gentle vignette, like printed cover art.
  ctx.fillStyle = radial(m, x + s / 2, y + s / 2, s * 0.75, [
    [0.55, 'rgba(0, 0, 0, 0)'],
    [1, 'rgba(0, 0, 0, 0.18)'],
  ]);
  ctx.fillRect(x, y, s, s);
  ctx.restore();
}

const SKIN = ['#f2c9a9', '#e0aa84', '#c68863', '#9a613f', '#6e432b', '#f6d8c0'];
const HAIR = ['#2b1d16', '#4a2f20', '#7a4b2a', '#1b1b1f', '#b98554', '#3a2a24'];

/** Person avatar: pastel backdrop, shoulders, head and hair. */
export function avatar(m: Mk, cx: number, cy: number, d: number, k: number): void {
  if (!(d > 0)) return;
  const ctx = m.ctx;
  const rng = createRng(k * 31337 + 11);
  const r = d / 2;
  const hue = rng.range(0, 360);
  const bgA = rotateHue('#9db7ff', hue);
  const bgB = rotateHue('#ffd0e0', hue);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = linear(m, cx - r, cy - r, cx + r, cy + r, [
    [0, lighten(bgA, 0.25)],
    [1, lighten(bgB, 0.1)],
  ]);
  ctx.fillRect(cx - r, cy - r, d, d);
  if (d < 14) {
    ctx.restore();
    return;
  }
  const skin = rng.pick(SKIN);
  const hair = rng.pick(HAIR);
  const shirt = rotateHue(m.t.accents[rng.int(0, 3)], rng.range(-20, 20));
  const longHair = rng.chance(0.45);
  if (longHair) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.05, r * 0.42, r * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 1.08, r * 0.78, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(skin, 0.12);
  ctx.fillRect(cx - r * 0.13, cy + r * 0.2, r * 0.26, r * 0.32);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.06, r * 0.32, r * 0.39, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.26, r * 0.35, r * 0.24, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(cx + r * 0.05, cy - r * 0.27, r * 0.3, r * 0.12, -0.2, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}

/** A row of overlapping avatars with a ring in the surface colour. */
export function avatarStack(m: Mk, x: number, cy: number, d: number, count: number, k: number, ring: string): void {
  for (let i = count - 1; i >= 0; i--) {
    const cx = x + d / 2 + i * d * 0.66;
    circle(m, cx, cy, d / 2 + Math.max(1, d * 0.07), ring);
    avatar(m, cx, cy, d, k + i);
  }
}

/** Product photo: soft studio backdrop (unless `studio` is false), floor shadow and one of four objects. */
export function product(m: Mk, x: number, y: number, w: number, h: number, r: number | Radii, k: number, studio = true): void {
  if (!(w > 0) || !(h > 0)) return;
  const ctx = m.ctx;
  const rng = createRng(k * 6007 + 5);
  const hue = rng.range(-40, 40);
  const col = rotateHue(m.t.accents[slot(k, 4)], hue);
  ctx.save();
  clipRound(m, x, y, w, h, r);
  if (studio) {
    const backdrop = m.t.dark ? mix(col, '#15161b', 0.82) : mix(col, '#ffffff', 0.84);
    ctx.fillStyle = linear(m, 0, y, 0, y + h, [
      [0, lighten(backdrop, 0.25)],
      [1, darken(backdrop, 0.05)],
    ]);
    ctx.fillRect(x, y, w, h);
  }
  const s = Math.min(w, h);
  const cx = x + w / 2;
  const floor = y + h * 0.82;
  ctx.fillStyle = radial(m, cx, floor, s * 0.36, [
    [0, 'rgba(0, 0, 0, 0.22)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ]);
  ctx.save();
  ctx.translate(cx, floor);
  ctx.scale(1, 0.18);
  ctx.translate(-cx, -floor);
  ctx.fillRect(cx - s * 0.4, floor - s * 0.4, s * 0.8, s * 0.8);
  ctx.restore();

  const shade = (x0: number, x1: number, c: string) =>
    linear(m, x0, 0, x1, 0, [
      [0, darken(c, 0.28)],
      [0.35, lighten(c, 0.22)],
      [0.6, c],
      [1, darken(c, 0.35)],
    ]);
  // Cycle objects and colours at different rates so neighbours rarely repeat.
  const kind = slot(slot(k, 4) + Math.floor(k / 4), 4);
  if (kind === 0) {
    // Bottle.
    const bw = s * 0.26;
    const bh = s * 0.52;
    const bx = cx - bw / 2;
    const by = floor - bh;
    ctx.fillStyle = shade(bx, bx + bw, col);
    ctx.beginPath();
    roundRectPath(ctx, bx, by, bw, bh, bw * 0.28);
    ctx.fill();
    ctx.fillStyle = shade(cx - bw * 0.22, cx + bw * 0.22, darken(col, 0.5));
    ctx.beginPath();
    roundRectPath(ctx, cx - bw * 0.22, by - bh * 0.16, bw * 0.44, bh * 0.2, bw * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    roundRectPath(ctx, bx + bw * 0.18, by + bh * 0.42, bw * 0.64, bh * 0.22, bw * 0.06);
    ctx.fill();
  } else if (kind === 1) {
    // Headphones.
    const hw = s * 0.5;
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.05;
    ctx.strokeStyle = darken(col, 0.2);
    ctx.beginPath();
    ctx.arc(cx, floor - s * 0.28, hw * 0.46, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    for (const side of [-1, 1]) {
      const ex = cx + side * hw * 0.46 - s * 0.075;
      ctx.fillStyle = shade(ex, ex + s * 0.15, col);
      ctx.beginPath();
      roundRectPath(ctx, ex, floor - s * 0.36, s * 0.15, s * 0.24, s * 0.07);
      ctx.fill();
    }
  } else if (kind === 2) {
    // Watch.
    const bw = s * 0.17;
    ctx.fillStyle = shade(cx - bw / 2, cx + bw / 2, darken(col, 0.1));
    ctx.beginPath();
    roundRectPath(ctx, cx - bw / 2, floor - s * 0.62, bw, s * 0.6, bw * 0.4);
    ctx.fill();
    const cw = s * 0.28;
    const cy = floor - s * 0.32;
    ctx.fillStyle = shade(cx - cw / 2, cx + cw / 2, '#c9ccd3');
    ctx.beginPath();
    roundRectPath(ctx, cx - cw / 2, cy - cw * 0.6, cw, cw * 1.2, cw * 0.3);
    ctx.fill();
    ctx.fillStyle = '#0c0d10';
    ctx.beginPath();
    roundRectPath(ctx, cx - cw * 0.42, cy - cw * 0.5, cw * 0.84, cw, cw * 0.24);
    ctx.fill();
    ctx.lineWidth = cw * 0.07;
    ctx.lineCap = 'round';
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.26, -Math.PI / 2, Math.PI * 0.9);
    ctx.stroke();
  } else {
    // Glossy speaker / sphere.
    const rr = s * 0.24;
    const cy = floor - rr;
    ctx.fillStyle = radial(m, cx - rr * 0.35, cy - rr * 0.4, rr * 1.6, [
      [0, lighten(col, 0.55)],
      [0.45, col],
      [1, darken(col, 0.45)],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const PIN_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [0.14, 0.3],
  [0.84, 0.74],
  [0.86, 0.22],
  [0.48, 0.96],
];

/**
 * Stylised city map with water, parks, a road grid, a route and pins.
 * `focus` is the part of the map left uncovered by floating UI; the route
 * and pins stay inside it.
 */
export function mapArt(
  m: Mk,
  x: number,
  y: number,
  w: number,
  h: number,
  k: number,
  pinIcons: readonly IconName[] = ['leaf', 'bag', 'star'],
  focus: { x: number; y: number; w: number; h: number } = { x, y, w, h },
): void {
  const ctx = m.ctx;
  const t = m.t;
  const rng = createRng(k * 2713 + 29);
  const f = focus;
  const land = t.dark ? '#1b1f27' : '#f1efe9';
  const block = t.dark ? '#20252e' : '#e9e6de';
  const park = t.dark ? '#1c3428' : '#d3eac0';
  const water = t.dark ? '#0f2a45' : '#a9d3f2';
  const road = t.dark ? '#2e3440' : '#ffffff';
  const casing = t.dark ? '#151920' : '#dedbd2';
  const major = t.dark ? '#4a4537' : '#fde6a0';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = land;
  ctx.fillRect(x, y, w, h);

  const u = Math.max(w, h);
  // Blocks between minor roads, on a slightly rotated grid.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.21);
  const cell = u * 0.11;
  ctx.fillStyle = block;
  for (let gx = -6; gx <= 6; gx++) {
    for (let gy = -7; gy <= 7; gy++) {
      if (rng.chance(0.35)) continue;
      ctx.beginPath();
      roundRectPath(ctx, gx * cell + cell * 0.12, gy * cell + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.08);
      ctx.fill();
    }
  }
  ctx.strokeStyle = road;
  ctx.lineWidth = u * 0.008;
  ctx.beginPath();
  for (let g = -7; g <= 7; g++) {
    ctx.moveTo(g * cell, -u);
    ctx.lineTo(g * cell, u);
    ctx.moveTo(-u, g * cell);
    ctx.lineTo(u, g * cell);
  }
  ctx.stroke();
  ctx.restore();

  // Parks.
  for (let i = 0; i < 3; i++) {
    const px = x + w * rng.range(0.05, 0.85);
    const py = y + h * rng.range(0.1, 0.85);
    const pr = u * rng.range(0.06, 0.12);
    const pts: [number, number][] = [];
    for (let j = 0; j < 7; j++) {
      const a = (j / 6) * Math.PI * 2;
      const rr = pr * rng.range(0.75, 1.15);
      pts.push([px + Math.cos(a) * rr * 1.3, py + Math.sin(a) * rr]);
    }
    ctx.beginPath();
    smoothPath(ctx, pts);
    ctx.closePath();
    ctx.fillStyle = park;
    ctx.fill();
  }

  // A river crossing the map.
  const flip = rng.chance(0.5);
  const riverPts: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const ty = y - h * 0.05 + (h * 1.1 * i) / 5;
    riverPts.push([x + w * (flip ? 0.78 : 0.18) + Math.sin(i * 1.3 + k) * w * 0.12, ty]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  smoothPath(ctx, riverPts);
  ctx.strokeStyle = water;
  ctx.lineWidth = u * 0.07;
  ctx.stroke();

  // Major roads: two sweeping avenues with casings.
  const avenues: [number, number][][] = [
    [
      [x - w * 0.1, y + h * rng.range(0.25, 0.4)],
      [x + w * 0.35, y + h * rng.range(0.35, 0.5)],
      [x + w * 0.7, y + h * rng.range(0.4, 0.55)],
      [x + w * 1.1, y + h * rng.range(0.5, 0.65)],
    ],
    [
      [x + w * rng.range(0.4, 0.6), y - h * 0.05],
      [x + w * rng.range(0.45, 0.65), y + h * 0.4],
      [x + w * rng.range(0.3, 0.5), y + h * 0.75],
      [x + w * rng.range(0.35, 0.55), y + h * 1.05],
    ],
  ];
  for (const pts of avenues) {
    ctx.beginPath();
    smoothPath(ctx, pts);
    ctx.strokeStyle = casing;
    ctx.lineWidth = u * 0.03;
    ctx.stroke();
    ctx.strokeStyle = major;
    ctx.lineWidth = u * 0.022;
    ctx.stroke();
  }

  // Route from the user to the destination.
  const start: [number, number] = [f.x + f.w * 0.26, f.y + f.h * 0.86];
  const end: [number, number] = [f.x + f.w * 0.66, f.y + f.h * 0.34];
  const route: [number, number][] = [start, [f.x + f.w * 0.33, f.y + f.h * 0.64], [f.x + f.w * 0.52, f.y + f.h * 0.6], [f.x + f.w * 0.6, f.y + f.h * 0.46], end];
  ctx.beginPath();
  smoothPath(ctx, route);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = u * 0.024;
  ctx.stroke();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = u * 0.016;
  ctx.stroke();

  // Points of interest.
  const pinD = u * 0.06;
  for (let i = 0; i < pinIcons.length; i++) {
    // Fixed spots clear of the route, with a little jitter so maps differ.
    const [sx, sy] = PIN_SPOTS[i % PIN_SPOTS.length];
    const px = f.x + f.w * (sx + rng.range(-0.04, 0.04));
    const py = f.y + f.h * (sy + rng.range(-0.05, 0.05));
    const c = t.accents[(i + 1) % 4];
    circle(m, px, py, pinD * 0.62, '#ffffff');
    circle(m, px, py, pinD * 0.52, c);
    icon(ctx, pinIcons[i], px, py, pinD * 0.56, '#ffffff', false, 2.4);
  }
  // Destination pin.
  const [ex, ey] = end;
  const pr = u * 0.045;
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.bezierCurveTo(ex - pr * 0.3, ey - pr * 0.8, ex - pr, ey - pr * 1.25, ex - pr, ey - pr * 2);
  ctx.arc(ex, ey - pr * 2, pr, Math.PI, 0);
  ctx.bezierCurveTo(ex + pr, ey - pr * 1.25, ex + pr * 0.3, ey - pr * 0.8, ex, ey);
  ctx.closePath();
  ctx.fill();
  circle(m, ex, ey - pr * 2, pr * 0.42, '#ffffff');
  // User location.
  const [ux, uy] = start;
  circle(m, ux, uy, u * 0.05, rgba('#3b82f6', 0.18));
  circle(m, ux, uy, u * 0.019, '#ffffff');
  circle(m, ux, uy, u * 0.014, '#3b82f6');
  ctx.restore();
}

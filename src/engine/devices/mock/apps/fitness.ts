/** Fitness: activity rings, stat tiles, weekly bars, workouts. */
import { rgba } from '../../../color';
import { avatar, photo } from '../art';
import { icon, type IconName } from '../icons';
import type { Area, Mk } from '../kit';
import { bar, body, card, circle, linear, money, num, progressRing, series, smoothPath, title } from '../kit';
import { tint } from '../theme';
import type { MockApp } from '../widgets';
import { barChart, chip, segmented } from '../widgets';

/** Ring colours: vivid, Apple-like, but drawn from the palette. */
function ringColors(m: Mk): [string, string, string] {
  const a = m.t.accents;
  return [a[0], a[1], a[2]];
}

function rings(m: Mk, cx: number, cy: number, r: number, lw: number): void {
  const cols = ringColors(m);
  const prog = [0.82, 0.64, 0.92];
  cols.forEach((c, i) => {
    const rr = r - i * (lw + 4);
    progressRing(m, cx, cy, rr, lw, prog[i], linear(m, cx - rr, cy - rr, cx + rr, cy + rr, [
      [0, c],
      [1, rgba(c, 0.82)],
    ]), rgba(c, m.t.dark ? 0.2 : 0.14));
  });
}

const STATS: { icon: IconName; value: (m: Mk) => string }[] = [
  { icon: 'flame', value: (m) => money(m.rng.int(320, 780), 0) },
  { icon: 'activity', value: (m) => money(m.rng.int(5200, 12800), 0) },
  { icon: 'drop', value: (m) => (m.rng.range(1.2, 2.6)).toFixed(1) },
  { icon: 'moon', value: (m) => `${m.rng.int(6, 8)}:${String(m.rng.int(0, 59)).padStart(2, '0')}` },
];

function statTile(m: Mk, r: Area, i: number): void {
  const t = m.t;
  const c = t.accents[i % 4];
  card(m, r.x, r.y, r.w, r.h, 22);
  circle(m, r.x + 34, r.y + 34, 18, tint(t, c, 0.84));
  icon(m.ctx, STATS[i].icon, r.x + 34, r.y + 34, 19, c, false, 2.1);
  num(m, STATS[i].value(m), r.x + 18, r.y + r.h - 34, Math.min(26, r.w * 0.17), 700, t.text);
  body(m, r.x + 18, r.y + r.h - 26, r.w * 0.38, 12);
  // Tiny trend line.
  const vals = series(m.rng, 7, 0.4, 0.3, 0.03);
  const sx = r.x + r.w - 70;
  const sy = r.y + 22;
  const ctx = m.ctx;
  ctx.beginPath();
  smoothPath(ctx, vals.map((v, j) => [sx + j * 9, sy + 26 - v * 26] as [number, number]));
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function ringCard(m: Mk, r: Area): void {
  const t = m.t;
  card(m, r.x, r.y, r.w, r.h, 26);
  const rad = Math.min(r.h * 0.38, r.w * 0.22);
  const cx = r.x + 22 + rad;
  const cy = r.y + r.h / 2;
  rings(m, cx, cy, rad, Math.max(10, rad * 0.21));
  const cols = ringColors(m);
  const vals = [`${m.rng.int(380, 560)}/600`, `${m.rng.int(20, 34)}/45`, `${m.rng.int(9, 12)}/12`];
  const tx = cx + rad + 26;
  const step = Math.min(46, (r.h - 40) / 3);
  vals.forEach((v, i) => {
    const ty = cy - step + i * step;
    circle(m, tx + 5, ty - 5, 5, cols[i]);
    num(m, v, tx + 18, ty + 1, 18, 700, t.text);
    body(m, tx + 18, ty + 6, 54, 11);
  });
}

function weekCard(m: Mk, r: Area): void {
  const t = m.t;
  card(m, r.x, r.y, r.w, r.h, 24);
  title(m, r.x + 20, r.y + 18, 100, 15);
  chip(m, r.x + r.w - 100, r.y + 14, 26, { icon: 'arrowUpRight', text: '+12%', fill: rgba(t.good, 0.13), ink: t.good });
  const vals = series(m.rng, 7, 0.55, 0.45, 0);
  barChart(m, { x: r.x + 14, y: r.y + 58, w: r.w - 28, h: r.h - 96 }, vals, t.accent, 4);
  for (let i = 0; i < 7; i++) bar(m, r.x + 14 + ((r.w - 28) * (i + 0.5)) / 7 - 6, r.y + r.h - 24, 12, 5, i === 4 ? t.accent : t.bar3);
}

function workoutRow(m: Mk, x: number, y: number, w: number, k: number): void {
  const t = m.t;
  photo(m, x, y, 58, 58, 16, m.seed + k * 3 + 1);
  title(m, x + 72, y + 8, 110 + (k % 3) * 20, 15);
  icon(m.ctx, 'clock', x + 79, y + 41, 13, t.text2, false, 2.2);
  num(m, `${m.rng.int(20, 59)}:00`, x + 90, y + 45.5, 12.5, 500, t.text2);
  icon(m.ctx, 'flame', x + 146, y + 41, 13, t.text2, false, 2.2);
  num(m, String(m.rng.int(180, 640)), x + 157, y + 45.5, 12.5, 500, t.text2);
  icon(m.ctx, 'chevronRight', x + w - 10, y + 29, 18, t.text2, false, 2.2);
}

export const fitness: MockApp = {
  id: 'fitness',
  nav: ['activity', 'flame', 'calendar', 'chart', 'users', 'settings'],
  glyph: 'activity',
  tabs: ['activity', 'flame', 'chart', 'user'],
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const M = 20;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    bar(m, x, y + 6, 92, 6, t.bar2);
    title(m, x, y + 18, 130, 28);
    avatar(m, x + w - 21, y + 24, 42, m.seed + 4);
    y += 74;
    ringCard(m, { x, y, w, h: 196 });
    y += 214;
    const gap = 14;
    const tw = (w - gap) / 2;
    for (let i = 0; i < 4; i++) statTile(m, { x: x + (i % 2) * (tw + gap), y: y + Math.floor(i / 2) * (128 + gap), w: tw, h: 128 }, i);
    y += 2 * 128 + gap + 18;
    weekCard(m, { x, y, w, h: 196 });
    y += 214;
    title(m, x, y, 120, 17);
    y += 36;
    for (let k = 0; y < a.y + a.h + 30; k++, y += 76) workoutRow(m, x, y, w, k);
  },
  wide(m, a) {
    const gap = 20;
    const leftW = a.w * 0.4;
    ringCard(m, { x: a.x, y: a.y, w: leftW, h: 260 });
    const rx = a.x + leftW + gap;
    const rw = a.w - leftW - gap;
    const tw = (rw - gap) / 2;
    for (let i = 0; i < 4; i++) statTile(m, { x: rx + (i % 2) * (tw + gap), y: a.y + Math.floor(i / 2) * (120 + gap), w: tw, h: 120 }, i);
    const y2 = a.y + 260 + gap;
    const h2 = Math.max(160, a.y + a.h - y2);
    const cw = a.w * 0.6;
    weekCard(m, { x: a.x, y: y2, w: cw, h: h2 });
    const lx = a.x + cw + gap;
    const lw = a.w - cw - gap;
    card(m, lx, y2, lw, h2 + 30, 24);
    title(m, lx + 20, y2 + 18, 110, 15);
    segmented(m, lx + lw - 150, y2 + 12, 130, 3, 0, 28);
    for (let k = 0, y = y2 + 62; y < a.y + a.h; k++, y += 74) workoutRow(m, lx + 20, y, lw - 40, k);
  },
};

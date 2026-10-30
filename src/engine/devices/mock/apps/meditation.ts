/** Meditation timer: calm gradient, breathing halo, big countdown ring, sessions. */
import { lighten, mix, rgba } from '../../../color';
import { photo } from '../art';
import { icon, type IconName } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, card, circle, linear, num, radial, shadowed, title } from '../kit';
import type { MockApp } from '../widgets';

function halo(m: Mk, cx: number, cy: number, r: number, progress: number, ink: string): void {
  const t = m.t;
  const ctx = m.ctx;
  for (let i = 3; i >= 1; i--) circle(m, cx, cy, r * (1 + i * 0.13), rgba(t.accent, t.dark ? 0.05 + (3 - i) * 0.03 : 0.06 + (3 - i) * 0.035));
  circle(m, cx, cy, r, radial(m, cx, cy - r * 0.3, r * 1.3, [
    [0, t.dark ? rgba(lighten(t.accent, 0.2), 0.32) : rgba('#ffffff', 0.95)],
    [1, t.dark ? rgba(t.accent, 0.1) : rgba(lighten(t.accent, 0.7), 0.9)],
  ]));
  const lw = Math.max(8, r * 0.075);
  const rr = r * 0.86;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.lineWidth = lw;
  ctx.strokeStyle = rgba(t.accent, t.dark ? 0.2 : 0.14);
  ctx.stroke();
  const a1 = -Math.PI / 2 + Math.PI * 2 * progress;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, -Math.PI / 2, a1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = linear(m, cx - rr, cy - rr, cx + rr, cy + rr, [
    [0, t.companion],
    [1, t.accent],
  ]);
  ctx.stroke();
  ctx.lineCap = 'butt';
  const kx = cx + Math.cos(a1) * rr;
  const ky = cy + Math.sin(a1) * rr;
  shadowed(m, 10, 3, rgba(t.accent, 0.4), () => circle(m, kx, ky, lw * 0.95, '#ffffff'));
  circle(m, kx, ky, lw * 0.45, t.accent);
  num(m, '12:45', cx, cy + r * 0.13, Math.min(60, r * 0.42), 300, ink, 'center');
  bar(m, cx - r * 0.22, cy + r * 0.28, r * 0.44, 6, rgba(ink, 0.35));
}

const STATS: { icon: IconName; value: string }[] = [
  { icon: 'flame', value: '7' },
  { icon: 'clock', value: '128' },
  { icon: 'heart', value: '14' },
];

function sessionCard(m: Mk, x: number, y: number, w: number, h: number, k: number): void {
  photo(m, x, y, w, h, 22, m.seed + k * 4 + 3);
  box(m, x, y + h * 0.4, w, h * 0.6, [0, 0, 22, 22], linear(m, 0, y + h * 0.4, 0, y + h, [
    [0, 'rgba(0, 0, 0, 0)'],
    [1, 'rgba(0, 0, 0, 0.5)'],
  ]));
  bar(m, x + 14, y + h - 40, w * 0.55, 8, 'rgba(255, 255, 255, 0.95)');
  num(m, `${5 + ((k * 7) % 20)}:00`, x + 14, y + h - 14, 12, 600, 'rgba(255, 255, 255, 0.85)');
  circle(m, x + w - 24, y + 24, 14, 'rgba(255, 255, 255, 0.3)');
  icon(m.ctx, 'play', x + w - 23, y + 24, 12, '#ffffff', false, 1.6);
}

function inkFor(m: Mk): string {
  return m.t.dark ? '#ffffff' : m.t.text;
}

export const meditation: MockApp = {
  id: 'meditation',
  nav: ['moon', 'leaf', 'music', 'chart', 'heart', 'settings'],
  glyph: 'leaf',
  tabs: null,
  tabSelected: 0,
  backdrop(m, W, H) {
    const t = m.t;
    const ctx = m.ctx;
    ctx.fillStyle = linear(m, 0, 0, 0, H, t.dark
      ? [
          [0, mix(t.accent, '#090912', 0.72)],
          [0.6, '#0b0b14'],
          [1, '#07070b'],
        ]
      : [
          [0, lighten(t.accent, 0.82)],
          [0.55, lighten(t.companion, 0.9)],
          [1, '#f7f7fa'],
        ]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(m, W * 0.15, H * 0.12, W * 0.8, [
      [0, rgba(t.companion, t.dark ? 0.22 : 0.25)],
      [1, rgba(t.companion, 0)],
    ]);
    ctx.fillRect(0, 0, W, H);
  },
  ink: inkFor,
  narrow(m, a) {
    const t = m.t;
    const ink = inkFor(m);
    const M = 22;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    icon(m.ctx, 'close', x + 10, y + 18, 22, ink, false, 2.2);
    bar(m, a.x + a.w / 2 - 40, y + 14, 80, 8, rgba(ink, 0.7));
    icon(m.ctx, 'more', x + w - 10, y + 18, 24, ink, false);
    y += 54;
    bar(m, a.x + a.w / 2 - 92, y, 184, 16, rgba(ink, 0.92));
    bar(m, a.x + a.w / 2 - 70, y + 30, 140, 8, rgba(ink, 0.4));
    y += 64;
    const r = Math.min(w * 0.38, a.h * 0.21, 170);
    halo(m, a.x + a.w / 2, y + r * 1.3, r, 0.62, ink);
    y += r * 2.6 + 18;
    const step = w / 3;
    STATS.forEach((s, i) => {
      const cx = x + step * (i + 0.5);
      icon(m.ctx, s.icon, cx - 20, y + 10, 18, t.accent, false, 2.2);
      num(m, s.value, cx - 6, y + 16, 18, 700, ink);
      bar(m, cx - 20, y + 30, 40, 5, rgba(ink, 0.3));
    });
    y += 64;
    const cy = y + 40;
    const glass = t.dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.8)';
    circle(m, a.x + a.w / 2 - 92, cy, 26, glass);
    icon(m.ctx, 'prev', a.x + a.w / 2 - 92, cy, 20, ink, false, 1.6);
    shadowed(m, 28, 12, rgba(t.accent, 0.45), () => circle(m, a.x + a.w / 2, cy, 40, t.accent));
    icon(m.ctx, 'pause', a.x + a.w / 2, cy, 30, t.onAccent, false);
    circle(m, a.x + a.w / 2 + 92, cy, 26, glass);
    icon(m.ctx, 'next', a.x + a.w / 2 + 92, cy, 20, ink, false, 1.6);
    y += 112;
    title(m, x, y, 120, 17, rgba(ink, 0.85));
    y += 36;
    const cw = Math.min(170, w * 0.46);
    for (let i = 0; x + i * (cw + 12) < a.x + a.w; i++) sessionCard(m, x + i * (cw + 12), y, cw, Math.max(120, Math.min(170, a.y + a.h - y + 40)), i);
  },
  wide(m, a) {
    const t = m.t;
    const gap = 20;
    const lw = a.w * 0.5;
    card(m, a.x, a.y, lw, a.h + 40, 28, linear(m, a.x, a.y, a.x + lw, a.y + a.h, t.dark
      ? [
          [0, mix(t.accent, '#0b0b14', 0.7)],
          [1, '#0b0b12'],
        ]
      : [
          [0, lighten(t.accent, 0.85)],
          [1, lighten(t.companion, 0.9)],
        ]), 1);
    const ink = inkFor(m);
    const r = Math.min(lw * 0.3, a.h * 0.3);
    halo(m, a.x + lw / 2, a.y + a.h * 0.44, r, 0.62, ink);
    const cy = a.y + a.h * 0.44 + r * 1.55;
    shadowed(m, 24, 10, rgba(t.accent, 0.4), () => circle(m, a.x + lw / 2, cy, 34, t.accent));
    icon(m.ctx, 'pause', a.x + lw / 2, cy, 26, t.onAccent, false);
    const rx = a.x + lw + gap;
    const rw = a.w - lw - gap;
    title(m, rx, a.y + 4, 140, 18);
    const cw = (rw - gap) / 2;
    const ch = Math.min(200, (a.h - 200) / 2);
    for (let i = 0; i < 4; i++) sessionCard(m, rx + (i % 2) * (cw + gap), a.y + 40 + Math.floor(i / 2) * (ch + gap), cw, ch, i);
    const sy = a.y + 40 + 2 * (ch + gap);
    const sw = (rw - gap * 2) / 3;
    STATS.forEach((s, i) => {
      const sx = rx + i * (sw + gap);
      card(m, sx, sy, sw, 110, 22);
      circle(m, sx + 32, sy + 32, 16, rgba(t.accents[i], 0.14));
      icon(m.ctx, s.icon, sx + 32, sy + 32, 17, t.accents[i], false, 2.2);
      num(m, s.value, sx + 18, sy + 86, 26, 700, t.text);
      body(m, sx + 18 + 44, sy + 72, sw * 0.3, 12);
    });
  },
};

/** Task manager: progress card, filter chips, checklist; desktop shows a kanban board. */
import { darken, rgba } from '../../../color';
import { avatar, avatarStack, photo } from '../art';
import { icon } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, brandFill, card, circle, num, progressRing, shadowed, title } from '../kit';
import { tint } from '../theme';
import type { MockApp } from '../widgets';
import { chip } from '../widgets';

function checkbox(m: Mk, cx: number, cy: number, done: boolean, color: string): void {
  const t = m.t;
  if (done) {
    circle(m, cx, cy, 12, color);
    icon(m.ctx, 'check', cx, cy, 15, '#ffffff', false, 3.2);
  } else {
    m.ctx.beginPath();
    m.ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    m.ctx.lineWidth = 2;
    m.ctx.strokeStyle = t.dark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(16, 22, 34, 0.22)';
    m.ctx.stroke();
  }
}

function taskCard(m: Mk, x: number, y: number, w: number, i: number, done: boolean): void {
  const t = m.t;
  const color = t.accents[i % 4];
  card(m, x, y, w, 78, 20, t.surface, 0.55);
  checkbox(m, x + 30, y + 39, done, t.accent);
  const tw = Math.min(w - 150, 120 + ((i * 37) % 70));
  title(m, x + 54, y + 16, tw, 15, done ? t.bar3 : t.bar);
  if (done) {
    m.ctx.fillStyle = t.bar2;
    m.ctx.fillRect(x + 50, y + 25, tw + 8, 1.4);
  }
  icon(m.ctx, 'clock', x + 61, y + 54, 13, t.text2, false, 2.2);
  num(m, `${8 + ((i * 3) % 10)}:${i % 2 === 0 ? '30' : '00'}`, x + 72, y + 58.5, 12.5, 500, t.text2);
  chip(m, x + 116, y + 44, 22, { fill: tint(t, color, 0.84), ink: t.dark ? color : darken(color, 0.15), barW: 34 + (i % 3) * 8 });
  if (i % 3 !== 1) avatarStack(m, x + w - 64, y + 39, 24, 2, m.seed + i * 3, t.surface);
  else circle(m, x + w - 30, y + 39, 5, t.bad);
}

export const tasks: MockApp = {
  id: 'tasks',
  nav: ['inbox', 'calendar', 'list', 'layers', 'users', 'settings'],
  glyph: 'check',
  tabs: ['home', 'calendar', 'list', 'user'],
  tabSelected: 2,
  narrow(m, a) {
    const t = m.t;
    const M = 20;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    bar(m, x, y + 6, 74, 6, t.accent);
    title(m, x, y + 18, 150, 28);
    avatar(m, x + w - 21, y + 24, 42, m.seed + 2);
    y += 70;
    const ch = 134;
    card(m, x, y, w, ch, 26, brandFill(m, x, y, w, ch), 1.1);
    const p = 0.68;
    bar(m, x + 22, y + 28, w * 0.36, 9, 'rgba(255, 255, 255, 0.95)');
    bar(m, x + 22, y + 48, w * 0.26, 6, 'rgba(255, 255, 255, 0.7)');
    box(m, x + 22, y + 86, w * 0.48, 8, 4, 'rgba(255, 255, 255, 0.28)');
    box(m, x + 22, y + 86, w * 0.48 * p, 8, 4, '#ffffff');
    num(m, '12/18', x + 22, y + 116, 13, 600, 'rgba(255, 255, 255, 0.85)');
    const rcx = x + w - 66;
    progressRing(m, rcx, y + ch / 2, 40, 9, p, '#ffffff', 'rgba(255, 255, 255, 0.25)');
    num(m, '68%', rcx, y + ch / 2 + 7, 19, 700, '#ffffff', 'center');
    y += ch + 22;
    let cx = x;
    [56, 64, 72, 58].forEach((bw, i) => {
      const on = i === 0;
      const cw = chip(m, cx, y, 36, { fill: on ? t.accent : t.surface, ink: on ? t.onAccent : t.bar2, barW: bw * 0.62, text: on ? '18' : undefined });
      cx += cw + 10;
    });
    y += 58;
    title(m, x, y, 104, 17);
    num(m, '6', x + 116, y + 15, 15, 700, t.text2);
    y += 34;
    for (let i = 0; y < a.y + a.h + 40; i++) {
      taskCard(m, x, y, w, i + m.seed, i === 1 || i === 4);
      y += 90;
    }
    const fx = a.x + a.w - M - 30;
    const fy = a.y + a.h - 44;
    shadowed(m, 22, 10, rgba(t.accent, 0.45), () => circle(m, fx, fy, 30, t.accent));
    icon(m.ctx, 'plus', fx, fy, 26, t.onAccent, false, 2.8);
  },
  wide(m, a) {
    const t = m.t;
    const cols = a.w > 900 ? 4 : 3;
    const gap = 18;
    const cw = (a.w - gap * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const x = a.x + c * (cw + gap);
      box(m, x, a.y, cw, a.h + 40, 22, t.dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(16, 22, 34, 0.035)');
      circle(m, x + 22, a.y + 24, 5, t.accents[c % 4]);
      title(m, x + 34, a.y + 16, 76, 15);
      box(m, x + 120, a.y + 13, 28, 22, 11, t.surface2);
      num(m, String(3 + ((c * 5 + m.seed) % 7)), x + 134, a.y + 28.5, 12, 700, t.text2, 'center');
      icon(m.ctx, 'plus', x + cw - 24, a.y + 24, 18, t.text2, false, 2.2);
      let y = a.y + 52;
      for (let i = 0; y < a.y + a.h; i++) {
        const k = c * 7 + i;
        const cover = (k + m.seed) % 4 === 1;
        const h = cover ? 230 : 150;
        card(m, x + 10, y, cw - 20, h, 18, t.surface, 0.5);
        let iy = y + 16;
        if (cover) {
          photo(m, x + 20, iy, cw - 40, 82, 12, m.seed + k);
          iy += 96;
        }
        chip(m, x + 24, iy, 22, { fill: tint(t, t.accents[k % 4], 0.84), ink: t.dark ? t.accents[k % 4] : darken(t.accents[k % 4], 0.15), barW: 30 + (k % 3) * 10 });
        title(m, x + 24, iy + 32, (cw - 70) * (0.6 + 0.35 * ((k * 13) % 10) / 10), 15);
        body(m, x + 24, iy + 54, (cw - 70) * 0.8, 12);
        const fy = y + h - 30;
        avatarStack(m, x + 24, fy, 24, 2 + (k % 2), m.seed + k, t.surface);
        icon(m.ctx, 'chat', x + cw - 74, fy, 15, t.text2, false, 2);
        num(m, String(1 + (k % 9)), x + cw - 62, fy + 4.5, 12, 600, t.text2);
        if (c === cols - 1) {
          circle(m, x + cw - 36, fy, 10, t.good);
          icon(m.ctx, 'check', x + cw - 36, fy, 12, '#ffffff', false, 3);
        } else {
          progressRing(m, x + cw - 36, fy, 8, 3, 0.3 + ((k * 17) % 60) / 100, t.accents[c % 4], t.surface2);
        }
        y += h + 14;
      }
    }
  },
};

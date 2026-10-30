/** Calendar / agenda: week strip, hourly timeline with coloured events, now indicator. */
import { darken, mix, rgba } from '../../../color';
import { avatarStack } from '../art';
import { icon } from '../icons';
import type { Area, Mk } from '../kit';
import { bar, box, card, circle, num, title } from '../kit';
import { tint } from '../theme';
import type { MockApp } from '../widgets';
import { iconButton } from '../widgets';

interface Event {
  start: number;
  end: number;
  color: number;
  people: number;
}

const EVENTS: readonly Event[] = [
  { start: 9, end: 10, color: 0, people: 3 },
  { start: 10.5, end: 12, color: 1, people: 0 },
  { start: 13, end: 13.75, color: 2, people: 2 },
  { start: 14.5, end: 16, color: 3, people: 4 },
  { start: 16.5, end: 17.5, color: 0, people: 0 },
  { start: 18.5, end: 20, color: 2, people: 2 },
];

const hourLabel = (h: number) => {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function eventBlock(m: Mk, x: number, y: number, w: number, h: number, ev: Event, k: number): void {
  const t = m.t;
  const c = t.accents[ev.color % 4];
  box(m, x, y, w, h, 14, tint(t, c, t.dark ? 0.76 : 0.85));
  box(m, x + 6, y + 8, 4, Math.max(4, h - 16), 2, c);
  const ink = t.dark ? mix(c, '#ffffff', 0.35) : darken(c, 0.35);
  bar(m, x + 20, y + 13, Math.min(w - 40, 100 + ((k * 23) % 60)), 7.5, ink);
  if (h > 46) num(m, `${hourLabel(ev.start)} - ${hourLabel(ev.end)}`, x + 20, y + 41, 12, 600, rgba(ink, 0.75));
  if (ev.people > 0 && h > 60 && w > 160) avatarStack(m, x + w - 16 - 24 * (1 + (ev.people - 1) * 0.66), y + h - 24, 24, ev.people, m.seed + k * 5, tint(t, c, t.dark ? 0.76 : 0.85));
}

function weekStrip(m: Mk, x: number, y: number, w: number, first: number, selected: number): void {
  const t = m.t;
  const step = w / 7;
  for (let i = 0; i < 7; i++) {
    const cx = x + step * (i + 0.5);
    const on = i === selected;
    if (on) box(m, cx - Math.min(23, step * 0.42), y, Math.min(46, step * 0.84), 70, 18, t.accent);
    bar(m, cx - 6, y + 14, 12, 5, on ? rgba(t.onAccent, 0.75) : t.bar3);
    num(m, String(first + i), cx, y + 48, 18, 700, on ? t.onAccent : t.text, 'center');
    if (i % 3 !== 2 && !on) circle(m, cx, y + 62, 2.6, t.accents[i % 4]);
  }
}

function timeline(m: Mk, a: Area, top: number, startHour: number, hourH: number, labelW: number): void {
  const t = m.t;
  const ctx = m.ctx;
  const hours = Math.ceil((a.y + a.h - top) / hourH) + 1;
  for (let i = 0; i < hours; i++) {
    const hy = top + i * hourH;
    num(m, `${startHour + i}:00`, a.x + labelW - 10, hy + 4, 11.5, 500, t.text2, 'right');
    ctx.fillStyle = t.line;
    ctx.fillRect(a.x + labelW, hy, a.w - labelW, 1);
  }
  EVENTS.forEach((ev, k) => {
    const y = top + (ev.start - startHour) * hourH + 2;
    const h = (ev.end - ev.start) * hourH - 4;
    if (y > a.y + a.h + 40) return;
    eventBlock(m, a.x + labelW + 6, y, a.w - labelW - 6, h, ev, k);
  });
  const ny = top + (11.3 - startHour) * hourH;
  ctx.fillStyle = t.bad;
  ctx.fillRect(a.x + labelW, ny - 1, a.w - labelW, 2);
  circle(m, a.x + labelW, ny, 5, t.bad);
}

export const calendar: MockApp = {
  id: 'calendar',
  nav: ['calendar', 'list', 'clock', 'users', 'inbox', 'settings'],
  glyph: 'calendar',
  tabs: ['calendar', 'list', 'users', 'settings'],
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const M = 20;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    num(m, '2026', x, y + 14, 14, 600, t.accent);
    title(m, x, y + 20, 136, 28);
    iconButton(m, x + w - 73, y + 26, 42, 'search');
    circle(m, x + w - 21, y + 26, 21, t.accent);
    icon(m.ctx, 'plus', x + w - 21, y + 26, 20, t.onAccent, false, 2.6);
    y += 72;
    const first = 12 + (m.seed % 9);
    weekStrip(m, x, y, w, first, 2);
    y += 86;
    card(m, x - 6, y, w + 12, a.y + a.h - y + 60, 26);
    timeline(m, { x: x + 4, y: a.y, w: w - 8, h: a.h }, y + 24, 9, 74, 52);
  },
  wide(m, a) {
    const t = m.t;
    const ctx = m.ctx;
    card(m, a.x, a.y, a.w, a.h + 40, 24);
    const labelW = 64;
    const top = a.y + 78;
    const cols = 7;
    const cw = (a.w - labelW - 16) / cols;
    const first = 12 + (m.seed % 9);
    for (let i = 0; i < cols; i++) {
      const cx = a.x + labelW + cw * (i + 0.5);
      const on = i === 2;
      bar(m, cx - 10, a.y + 18, 20, 5, t.bar3);
      if (on) circle(m, cx, a.y + 46, 18, t.accent);
      num(m, String(first + i), cx, a.y + 52, 17, 700, on ? t.onAccent : t.text, 'center');
      if (i > 0) {
        ctx.fillStyle = t.line;
        ctx.fillRect(a.x + labelW + cw * i, top, 1, a.h);
      }
    }
    const hourH = 64;
    const hours = Math.ceil((a.y + a.h - top) / hourH) + 1;
    for (let i = 0; i < hours; i++) {
      const hy = top + i * hourH;
      num(m, `${8 + i}:00`, a.x + labelW - 12, hy + 4, 11.5, 500, t.text2, 'right');
      ctx.fillStyle = t.line;
      ctx.fillRect(a.x + labelW, hy, a.w - labelW - 16, 1);
    }
    for (let d = 0; d < cols; d++) {
      for (let j = 0; j < 2 + ((d * 5 + m.seed) % 2); j++) {
        const ev = EVENTS[(d * 2 + j + m.seed) % EVENTS.length];
        const start = 8.5 + ((d * 3 + j * 4) % 9);
        const len = ev.end - ev.start;
        const y = top + (start - 8) * hourH + 2;
        if (y > a.y + a.h) continue;
        eventBlock(m, a.x + labelW + cw * d + 4, y, cw - 8, len * hourH - 4, { ...ev, start, end: start + len }, d * 3 + j);
      }
    }
    const ny = top + 3.3 * hourH;
    ctx.fillStyle = t.bad;
    ctx.fillRect(a.x + labelW, ny - 1, a.w - labelW - 16, 2);
    circle(m, a.x + labelW + cw * 2, ny, 5, t.bad);
  },
};

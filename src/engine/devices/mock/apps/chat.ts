/** Messaging: a conversation laid out bottom-up like a real chat, with photo and voice bubbles. */
import { mix, rgba } from '../../../color';
import { avatar, photo } from '../art';
import { icon } from '../icons';
import type { Area, Mk } from '../kit';
import { bar, body, box, card, circle, linear, num, title } from '../kit';
import type { MockApp } from '../widgets';

type Msg =
  | { kind: 'text'; out: boolean; lines: number[]; time?: string }
  | { kind: 'image'; out: boolean }
  | { kind: 'voice'; out: boolean }
  | { kind: 'typing' }
  | { kind: 'date' };

const THREAD: readonly Msg[] = [
  { kind: 'date' },
  { kind: 'text', out: false, lines: [0.92, 0.58] },
  { kind: 'text', out: true, lines: [0.52] },
  { kind: 'text', out: true, lines: [0.96, 0.7], time: '9:38' },
  { kind: 'image', out: false },
  { kind: 'text', out: false, lines: [0.48] },
  { kind: 'voice', out: true },
  { kind: 'text', out: false, lines: [1, 0.86, 0.42], time: '9:40' },
  { kind: 'text', out: true, lines: [0.62], time: '9:41' },
  { kind: 'typing' },
];

function msgHeight(msg: Msg, maxW: number): number {
  switch (msg.kind) {
    case 'text':
      return 20 + msg.lines.length * 19 + (msg.time ? 16 : 0);
    case 'image':
      return Math.round(maxW * 0.66);
    case 'voice':
      return 54;
    case 'typing':
      return 42;
    case 'date':
      return 28;
  }
}

function sender(msg: Msg): 'in' | 'out' | 'none' {
  if (msg.kind === 'date') return 'none';
  if (msg.kind === 'typing') return 'in';
  return msg.out ? 'out' : 'in';
}

function bubbleFill(m: Mk, out: boolean, x: number, y: number, w: number, h: number): string | CanvasGradient {
  const t = m.t;
  if (out)
    return linear(m, x, y, x + w, y + h, [
      [0, t.accent],
      [1, mix(t.accent, t.companion, 0.45)],
    ]);
  return t.dark ? t.surface2 : t.surface;
}

function drawMsg(m: Mk, msg: Msg, a: Area, y: number, h: number, maxW: number, k: number): void {
  const t = m.t;
  const M = 16;
  if (msg.kind === 'date') {
    box(m, a.x + a.w / 2 - 44, y, 88, 24, 12, t.dark ? t.surface2 : rgba(t.text, 0.06));
    bar(m, a.x + a.w / 2 - 24, y + 9.5, 48, 5, t.bar2);
    return;
  }
  const out = msg.kind !== 'typing' && msg.out;
  const radii: [number, number, number, number] = out ? [20, 20, 6, 20] : [20, 20, 20, 6];
  let w: number;
  if (msg.kind === 'text') w = Math.max(...msg.lines) * (maxW - 28) + 28;
  else if (msg.kind === 'image') w = maxW * 0.8;
  else if (msg.kind === 'voice') w = Math.min(maxW, 236);
  else w = 70;
  const x = out ? a.x + a.w - M - w : a.x + M;
  if (msg.kind === 'image') {
    photo(m, x, y, w, h, radii, m.seed + k);
    return;
  }
  const fill = bubbleFill(m, out, x, y, w, h);
  if (!out && !t.dark) card(m, x, y, w, h, radii[0], fill, 0.3);
  box(m, x, y, w, h, radii, fill);
  const ink = out ? rgba(t.onAccent, 0.88) : t.bar2;
  if (msg.kind === 'text') {
    msg.lines.forEach((f, i) => bar(m, x + 14, y + 16 + i * 19, (maxW - 28) * f, 7, ink));
    if (msg.time) {
      num(m, msg.time, x + w - 14 - (out ? 18 : 0), y + h - 9, 11, 500, out ? rgba(t.onAccent, 0.7) : t.text2, 'right');
      if (out) {
        icon(m.ctx, 'check', x + w - 22, y + h - 13, 12, rgba(t.onAccent, 0.8), false, 2.6);
        icon(m.ctx, 'check', x + w - 17, y + h - 13, 12, rgba(t.onAccent, 0.8), false, 2.6);
      }
    }
  } else if (msg.kind === 'voice') {
    circle(m, x + 28, y + h / 2, 16, out ? 'rgba(255, 255, 255, 0.22)' : t.accent);
    icon(m.ctx, 'play', x + 29.5, y + h / 2, 14, t.onAccent, false, 1.6);
    const bars = 22;
    const bx0 = x + 54;
    const bw = (w - 54 - 52) / bars;
    for (let i = 0; i < bars; i++) {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + k) * Math.cos(i * 0.6));
      const bh = 4 + v * 22;
      box(m, bx0 + i * bw, y + h / 2 - bh / 2, Math.max(1.5, bw * 0.55), bh, 2, i < 9 ? (out ? t.onAccent : t.accent) : out ? 'rgba(255, 255, 255, 0.45)' : t.bar3);
    }
    num(m, '0:24', x + w - 14, y + h / 2 + 4.5, 12, 600, out ? rgba(t.onAccent, 0.85) : t.text2, 'right');
  } else {
    for (let i = 0; i < 3; i++) circle(m, x + 22 + i * 13, y + h / 2, 4.2, rgba(t.text2, 0.4 + i * 0.2));
  }
}

/** Lays the thread out from `bottom` upwards until `top`, cycling when the screen is tall. */
function thread(m: Mk, a: Area, top: number, bottom: number): void {
  const maxW = Math.min(a.w * 0.74, 360);
  let y = bottom;
  let i = THREAD.length - 1;
  let prev: Msg | null = null;
  for (let n = 0; n < 80 && y > top; n++) {
    const msg = THREAD[((i % THREAD.length) + THREAD.length) % THREAD.length];
    const h = msgHeight(msg, maxW);
    const gap = prev && sender(prev) === sender(msg) ? 6 : 14;
    y -= h + (prev ? gap : 0);
    drawMsg(m, msg, a, y, h, maxW, n);
    prev = msg;
    i--;
  }
}

function inputBar(m: Mk, x: number, y: number, w: number): void {
  const t = m.t;
  circle(m, x + 20, y + 22, 20, t.dark ? t.surface2 : t.surface);
  icon(m.ctx, 'plus', x + 20, y + 22, 20, t.text2, false, 2.3);
  const fx = x + 50;
  const fw = w - 100;
  if (!t.dark) card(m, fx, y, fw, 44, 22, t.surface, 0.35);
  else box(m, fx, y, fw, 44, 22, t.surface2);
  bar(m, fx + 18, y + 19, fw * 0.42, 6, t.bar3);
  icon(m.ctx, 'camera', fx + fw - 22, y + 22, 20, t.text2, false, 2);
  circle(m, x + w - 22, y + 22, 22, t.accent);
  icon(m.ctx, 'mic', x + w - 22, y + 22, 20, t.onAccent, false, 2.3);
}

function header(m: Mk, x: number, y: number, w: number): void {
  const t = m.t;
  icon(m.ctx, 'chevronLeft', x + 8, y + 22, 24, t.accent, false, 2.6);
  avatar(m, x + 52, y + 22, 42, m.seed + 21);
  circle(m, x + 67, y + 37, 6.5, t.dark ? t.bg : t.surface);
  circle(m, x + 67, y + 37, 4.5, t.good);
  title(m, x + 82, y + 4, 112, 16);
  bar(m, x + 82, y + 30, 46, 5.5, t.good);
  icon(m.ctx, 'video', x + w - 52, y + 22, 24, t.accent, false, 2);
  icon(m.ctx, 'phone', x + w - 10, y + 22, 22, t.accent, false, 2);
}

export const chat: MockApp = {
  id: 'chat',
  nav: ['chat', 'users', 'phone', 'bookmark', 'folder', 'settings'],
  glyph: 'chat',
  tabs: null,
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const x = a.x + 12;
    const w = a.w - 24;
    const inputY = a.y + a.h - 52;
    thread(m, a, a.y + 64, inputY - 14);
    // Header and input sit on solid panels so the cut-off thread slides under them.
    m.ctx.fillStyle = linear(m, 0, a.y - 60, 0, a.y + 76, [
      [0.75, t.bg],
      [1, rgba(t.bg, 0)],
    ]);
    m.ctx.fillRect(a.x, a.y - 60, a.w, 136);
    header(m, x, a.y + 4, w);
    m.ctx.fillStyle = linear(m, 0, inputY - 24, 0, inputY + 6, [
      [0, rgba(t.bg, 0)],
      [1, t.bg],
    ]);
    m.ctx.fillRect(a.x, inputY - 24, a.w, a.y + a.h - inputY + 60);
    inputBar(m, x, inputY, w);
  },
  wide(m, a) {
    const t = m.t;
    const lw = Math.min(330, a.w * 0.34);
    card(m, a.x, a.y, lw, a.h + 40, 22);
    box(m, a.x + 16, a.y + 16, lw - 32, 38, 12, t.surface2);
    icon(m.ctx, 'search', a.x + 36, a.y + 35, 16, t.text2, false, 2.2);
    bar(m, a.x + 52, a.y + 32, 70, 5.5, t.bar3);
    for (let i = 0, y = a.y + 70; y < a.y + a.h; i++, y += 72) {
      const on = i === 1;
      if (on) box(m, a.x + 8, y - 6, lw - 16, 68, 16, t.dark ? rgba(t.accent, 0.16) : rgba(t.accent, 0.08));
      avatar(m, a.x + 40, y + 28, 48, m.seed + 20 + i);
      title(m, a.x + 74, y + 8, 90 + (i % 3) * 18, 15);
      body(m, a.x + 74, y + 30, lw - 140, 12);
      num(m, `${9 - (i % 6)}:${String((i * 17) % 60).padStart(2, '0')}`, a.x + lw - 18, y + 22, 11.5, 500, t.text2, 'right');
      if (i % 3 === 0) {
        circle(m, a.x + lw - 30, y + 38, 10, t.accent);
        num(m, String(1 + (i % 4)), a.x + lw - 30, y + 42, 11, 700, t.onAccent, 'center');
      }
    }
    const tx = a.x + lw + 20;
    const tw = a.w - lw - 20;
    card(m, tx, a.y, tw, a.h + 40, 22);
    header(m, tx + 16, a.y + 14, tw - 32);
    m.ctx.fillStyle = t.line;
    m.ctx.fillRect(tx, a.y + 72, tw, 1);
    const ta: Area = { x: tx + 8, y: a.y, w: tw - 16, h: a.h };
    m.ctx.save();
    m.ctx.beginPath();
    m.ctx.rect(tx, a.y + 73, tw, a.h - 73);
    m.ctx.clip();
    thread(m, ta, a.y + 73, a.y + a.h - 72);
    m.ctx.restore();
    inputBar(m, tx + 16, a.y + a.h - 58, tw - 32);
  },
};

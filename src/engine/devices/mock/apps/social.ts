/** Photo feed: stories, a post with a full-bleed photo, actions; desktop shows a masonry grid. */
import { rgba, rotateHue } from '../../../color';
import { avatar, avatarStack, photo } from '../art';
import { icon } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, card, circle, linear, num, paragraph, title } from '../kit';
import type { MockApp } from '../widgets';

function storyRing(m: Mk, cx: number, cy: number, d: number, k: number, seen: boolean): void {
  const t = m.t;
  const r = d / 2;
  if (seen) circle(m, cx, cy, r, t.bar3);
  else
    circle(m, cx, cy, r, linear(m, cx - r, cy + r, cx + r, cy - r, [
      [0, t.companion],
      [0.5, t.accent],
      [1, rotateHue(t.accent, -32)],
    ]));
  circle(m, cx, cy, r - 2.6, t.bg);
  avatar(m, cx, cy, d - 9, k);
}

function stories(m: Mk, x: number, y: number, w: number, d: number): void {
  const t = m.t;
  const step = d + 16;
  const count = Math.ceil(w / step) + 1;
  for (let i = 0; i < count; i++) {
    const cx = x + d / 2 + i * step;
    if (i === 0) {
      avatar(m, cx, y + d / 2, d - 6, m.seed + 40);
      circle(m, cx + d * 0.32, y + d * 0.82, 11, t.bg);
      circle(m, cx + d * 0.32, y + d * 0.82, 9, t.accent);
      icon(m.ctx, 'plus', cx + d * 0.32, y + d * 0.82, 12, t.onAccent, false, 3);
    } else {
      storyRing(m, cx, y + d / 2, d, m.seed + 40 + i, i > 4);
    }
    bar(m, cx - d * 0.32, y + d + 10, d * 0.64, 5, i === 0 ? t.bar3 : t.bar2);
  }
}

function postHeader(m: Mk, x: number, y: number, w: number, k: number): void {
  avatar(m, x + 18, y + 18, 36, k);
  title(m, x + 46, y + 1, 92 + (k % 3) * 14, 14);
  body(m, x + 46, y + 19, 60, 12);
  icon(m.ctx, 'more', x + w - 12, y + 18, 22, m.t.text, false);
}

function actions(m: Mk, x: number, y: number, w: number, liked: boolean): void {
  const t = m.t;
  icon(m.ctx, 'heart', x + 12, y, 27, liked ? t.bad : t.text, liked, 2);
  num(m, String(m.rng.int(120, 980)), x + 30, y + 5, 14, 600, t.text);
  icon(m.ctx, 'chat', x + 84, y, 25, t.text, false, 2);
  num(m, String(m.rng.int(8, 99)), x + 100, y + 5, 14, 600, t.text);
  icon(m.ctx, 'send', x + 146, y, 24, t.text, false, 2);
  icon(m.ctx, 'bookmark', x + w - 12, y, 25, t.text, false, 2);
}

export const social: MockApp = {
  id: 'social',
  nav: ['home', 'search', 'compass', 'heart', 'chat', 'user'],
  glyph: 'camera',
  tabs: ['home', 'search', 'plus', 'heart', 'user'],
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const M = 16;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 6;
    box(m, x, y + 6, 106, 22, 11, linear(m, x, 0, x + 106, 0, [
      [0, t.accent],
      [1, t.companion],
    ]));
    icon(m.ctx, 'heart', x + w - 46, y + 17, 26, t.text, false, 2);
    circle(m, x + w - 36, y + 7, 4.5, t.bad);
    icon(m.ctx, 'send', x + w - 8, y + 17, 25, t.text, false, 2);
    y += 48;
    const d = Math.min(70, a.w * 0.17);
    stories(m, x, y, a.w, d);
    y += d + 32;
    m.ctx.fillStyle = t.line;
    m.ctx.fillRect(a.x, y, a.w, 1);
    y += 12;
    let k = m.seed * 3;
    while (y < a.y + a.h) {
      postHeader(m, x, y, w, m.seed + 60 + k);
      y += 48;
      const ph = Math.round(a.w * 1.05);
      photo(m, a.x, y, a.w, ph, 0, m.seed + k);
      // Carousel dots over the photo.
      for (let i = 0; i < 4; i++) circle(m, a.x + a.w / 2 - 18 + i * 12, y + ph - 16, 3.2, i === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.5)');
      y += ph + 24;
      actions(m, x, y, w, k % 2 === 0);
      y += 26;
      avatarStack(m, x, y + 9, 20, 3, m.seed + 80 + k, t.bg);
      body(m, x + 54, y + 2, 150, 13, t.bar);
      y += 28;
      y += paragraph(m, x, y, w, 2, 13) + 18;
      k++;
    }
  },
  wide(m, a) {
    const t = m.t;
    const sideW = Math.min(320, a.w * 0.3);
    const gridW = a.w - sideW - 24;
    const cols = gridW > 720 ? 4 : 3;
    const gap = 16;
    const cw = (gridW - gap * (cols - 1)) / cols;
    const heights = [1.25, 0.9, 1.4, 1.05, 0.8, 1.3, 1.1, 0.95];
    for (let c = 0; c < cols; c++) {
      let y = a.y + (c % 2) * 26;
      let i = c;
      while (y < a.y + a.h) {
        const h = cw * heights[(i + m.seed) % heights.length];
        const x = a.x + c * (cw + gap);
        photo(m, x, y, cw, h, 18, m.seed + i * 5 + c);
        box(m, x, y + h - 56, cw, 56, [0, 0, 18, 18], linear(m, 0, y + h - 56, 0, y + h, [
          [0, 'rgba(0, 0, 0, 0)'],
          [1, 'rgba(0, 0, 0, 0.45)'],
        ]));
        avatar(m, x + 26, y + h - 26, 28, m.seed + 100 + i);
        bar(m, x + 48, y + h - 29, cw * 0.36, 6, 'rgba(255, 255, 255, 0.9)');
        icon(m.ctx, 'heart', x + cw - 24, y + h - 26, 20, '#ffffff', i % 3 === 0, 2);
        y += h + gap;
        i += cols;
      }
    }
    // Right column: profile and suggestions.
    const sx = a.x + gridW + 24;
    card(m, sx, a.y, sideW, 210, 22);
    avatar(m, sx + sideW / 2, a.y + 56, 64, m.seed + 7);
    title(m, sx + sideW / 2 - 60, a.y + 98, 120, 16);
    body(m, sx + sideW / 2 - 44, a.y + 122, 88, 13);
    const stats = ['248', '18.4k', '612'];
    stats.forEach((s, i) => {
      const cx = sx + sideW * (0.2 + i * 0.3);
      num(m, s, cx, a.y + 172, 18, 700, t.text, 'center');
      bar(m, cx - 18, a.y + 182, 36, 5, t.bar3);
    });
    let y = a.y + 230;
    card(m, sx, y, sideW, a.y + a.h - y + 30, 22);
    title(m, sx + 18, y + 18, 120, 15);
    y += 56;
    for (let i = 0; y + 56 < a.y + a.h + 20; i++, y += 60) {
      avatar(m, sx + 38, y + 20, 40, m.seed + 120 + i);
      title(m, sx + 68, y + 6, 80 + (i % 3) * 16, 14);
      body(m, sx + 68, y + 24, 60, 12);
      box(m, sx + sideW - 92, y + 6, 74, 30, 15, i === 0 ? t.accent : rgba(t.accent, 0.12));
      bar(m, sx + sideW - 72, y + 18.5, 34, 5, i === 0 ? t.onAccent : t.accent);
    }
  },
};

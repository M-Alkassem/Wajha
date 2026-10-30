/** Shop: search, promo banner, category chips and a product grid. */
import { darken } from '../../../color';
import { product } from '../art';
import { icon, type IconName } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, brandFill, card, circle, num, title } from '../kit';
import type { MockApp } from '../widgets';
import { chip, iconButton, sectionHeader } from '../widgets';

const CATEGORIES: IconName[] = ['grid', 'sparkle', 'heart', 'bag', 'star', 'leaf'];

function productCard(m: Mk, x: number, y: number, w: number, h: number, k: number): void {
  const t = m.t;
  card(m, x, y, w, h, 22, t.surface, 0.6);
  const ih = h - 82;
  product(m, x + 6, y + 6, w - 12, ih, 18, m.seed + k);
  circle(m, x + w - 26, y + 26, 15, t.dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.9)');
  icon(m.ctx, 'heart', x + w - 26, y + 26.5, 16, k % 3 === 0 ? t.bad : t.dark ? '#ffffff' : t.text, k % 3 === 0, 2.2);
  title(m, x + 14, y + ih + 16, w * 0.62, 14);
  body(m, x + 14, y + ih + 36, w * 0.4, 12);
  num(m, String(29 + ((k * 37) % 170)), x + 14, y + h - 14, 18, 700, t.text);
  circle(m, x + w - 26, y + h - 26, 15, t.accent);
  icon(m.ctx, 'plus', x + w - 26, y + h - 26, 15, t.onAccent, false, 2.8);
}

function promo(m: Mk, x: number, y: number, w: number, h: number): void {
  const t = m.t;
  card(m, x, y, w, h, 26, brandFill(m, x, y, w, h), 1.1);
  m.ctx.save();
  m.ctx.beginPath();
  m.ctx.rect(x, y, w, h);
  m.ctx.clip();
  circle(m, x + w * 0.8, y + h * 0.5, h * 0.62, 'rgba(255, 255, 255, 0.14)');
  circle(m, x + w * 0.8, y + h * 0.5, h * 0.42, 'rgba(255, 255, 255, 0.12)');
  m.ctx.restore();
  product(m, x + w * 0.56, y + 6, w * 0.44, h - 12, 0, m.seed + 4, false);
  bar(m, x + 22, y + 24, 64, 6, 'rgba(255, 255, 255, 0.75)');
  num(m, `${20 + (m.seed % 4) * 10}%`, x + 22, y + 72, Math.min(40, h * 0.27), 800, '#ffffff');
  bar(m, x + 22, y + 86, w * 0.3, 7, 'rgba(255, 255, 255, 0.85)');
  box(m, x + 22, y + h - 46, 96, 32, 16, '#ffffff');
  bar(m, x + 44, y + h - 33, 52, 6, darken(t.accents[0], 0.15));
}

export const shop: MockApp = {
  id: 'shop',
  nav: ['home', 'grid', 'heart', 'bag', 'user', 'settings'],
  glyph: 'bag',
  tabs: ['home', 'grid', 'heart', 'bag', 'user'],
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const M = 20;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    body(m, x, y + 2, 70, 12);
    title(m, x, y + 18, 120, 18);
    icon(m.ctx, 'chevronDown', x + 132, y + 29, 16, t.text2, false, 2.4);
    iconButton(m, x + w - 21, y + 22, 42, 'bag');
    circle(m, x + w - 6, y + 6, 10, t.accent);
    num(m, '3', x + w - 6, y + 10, 11, 700, t.onAccent, 'center');
    y += 62;
    const fw = w - 62;
    if (!t.dark) card(m, x, y, fw, 50, 16, t.surface, 0.45);
    else box(m, x, y, fw, 50, 16, t.surface2);
    icon(m.ctx, 'search', x + 24, y + 25, 19, t.text2, false, 2.2);
    bar(m, x + 44, y + 22, fw * 0.4, 6, t.bar3);
    box(m, x + w - 50, y, 50, 50, 16, t.accent);
    icon(m.ctx, 'filter', x + w - 25, y + 25, 21, t.onAccent, false, 2.2);
    y += 68;
    const ph = Math.min(170, Math.max(140, w * 0.46));
    promo(m, x, y, w, ph);
    y += ph + 22;
    let cx = x;
    CATEGORIES.forEach((name, i) => {
      if (cx > a.x + a.w) return;
      const on = i === 0;
      const cw = chip(m, cx, y, 38, { icon: name, fill: on ? t.accent : t.surface, ink: on ? t.onAccent : t.bar2, barW: 30 + ((i * 7) % 18) });
      cx += cw + 10;
    });
    y += 58;
    sectionHeader(m, x, y, w, 132);
    y += 38;
    const gap = 14;
    const cols = a.w > 460 ? 3 : 2;
    const cw = (w - gap * (cols - 1)) / cols;
    const chh = cw + 84;
    for (let row = 0; y < a.y + a.h + 30; row++, y += chh + gap) {
      for (let c = 0; c < cols; c++) productCard(m, x + c * (cw + gap), y, cw, chh, row * cols + c);
    }
  },
  wide(m, a) {
    const t = m.t;
    const bh = Math.min(220, a.h * 0.34);
    promo(m, a.x, a.y, a.w, bh);
    let y = a.y + bh + 22;
    let cx = a.x;
    CATEGORIES.forEach((name, i) => {
      const on = i === 0;
      const w = chip(m, cx, y, 38, { icon: name, fill: on ? t.accent : t.surface, ink: on ? t.onAccent : t.bar2, barW: 40 + ((i * 7) % 18) });
      cx += w + 10;
    });
    const sw = Math.min(200, a.w * 0.2);
    box(m, a.x + a.w - sw, y, sw, 38, 19, t.surface);
    bar(m, a.x + a.w - sw + 18, y + 16, sw * 0.4, 6, t.bar3);
    icon(m.ctx, 'chevronDown', a.x + a.w - 22, y + 19, 16, t.text2, false, 2.4);
    y += 60;
    const cols = a.w > 1000 ? 5 : 4;
    const gap = 18;
    const cw = (a.w - gap * (cols - 1)) / cols;
    const ch = cw * 0.9 + 84;
    for (let row = 0; y < a.y + a.h; row++, y += ch + gap) {
      for (let c = 0; c < cols; c++) productCard(m, a.x + c * (cw + gap), y, cw, ch, row * cols + c + 3);
    }
  },
};

/** Travel / maps: full-bleed stylised map, floating search, a place sheet with photo and rating. */
import { rgba } from '../../../color';
import { avatar, mapArt, photo } from '../art';
import { icon, type IconName } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, card, circle, num, rr, shadowed, title } from '../kit';
import type { MockApp } from '../widgets';
import { chip, primaryButton, stars } from '../widgets';

const CHIPS: IconName[] = ['bag', 'star', 'flame', 'leaf', 'compass'];

function searchBar(m: Mk, x: number, y: number, w: number): void {
  const t = m.t;
  card(m, x, y, w, 52, 18, t.surface, 0.8);
  icon(m.ctx, 'search', x + 26, y + 26, 19, t.text2, false, 2.2);
  bar(m, x + 46, y + 23, w * 0.4, 6.5, t.bar3);
  icon(m.ctx, 'mic', x + w - 62, y + 26, 19, t.text2, false, 2);
  avatar(m, x + w - 26, y + 26, 34, m.seed + 33);
}

function chipRow(m: Mk, x: number, y: number, right: number): void {
  const t = m.t;
  let cx = x;
  CHIPS.forEach((name, i) => {
    if (cx > right) return;
    const bw = 34 + ((i * 11) % 20);
    const w = 34 + 8 + bw + 14;
    card(m, cx, y, w, 34, 17, t.surface, 0.45);
    circle(m, cx + 17, y + 17, 11, rgba(t.accents[(i + 1) % 4], 0.16));
    icon(m.ctx, name, cx + 17, y + 17, 13, t.accents[(i + 1) % 4], false, 2.4);
    bar(m, cx + 34, y + 14.5, bw, 5, t.bar2);
    cx += w + 8;
  });
}

function placeSheet(m: Mk, x: number, y: number, w: number, h: number, k: number): void {
  const t = m.t;
  const M = 20;
  shadowed(m, 30, -6, t.dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(20, 28, 48, 0.14)', () => box(m, x, y, w, h + 40, [30, 30, 0, 0], t.surface));
  bar(m, x + w / 2 - 18, y + 8, 36, 5, t.bar3);
  const ix = x + M;
  const iw = w - 2 * M;
  let cy = y + 26;
  const ph = Math.min(132, h * 0.36);
  photo(m, ix, cy, iw * 0.64, ph, 18, m.seed + k);
  photo(m, ix + iw * 0.64 + 8, cy, iw * 0.36 - 8, ph / 2 - 4, 14, m.seed + k + 1);
  photo(m, ix + iw * 0.64 + 8, cy + ph / 2 + 4, iw * 0.36 - 8, ph / 2 - 4, 14, m.seed + k + 2);
  cy += ph + 18;
  title(m, ix, cy, iw * 0.55, 21);
  icon(m.ctx, 'bookmark', ix + iw - 12, cy + 12, 22, t.text, false, 2);
  cy += 34;
  num(m, '4.8', ix, cy + 12, 14, 700, t.text);
  stars(m, ix + 28, cy + 7.5, 13, 5);
  num(m, '(2,184)', ix + 104, cy + 12, 13, 500, t.text2);
  cy += 30;
  let cx = ix;
  cx += chip(m, cx, cy, 30, { icon: 'clock', text: '12', fill: t.surface2, ink: t.text2, barW: 22 }) + 8;
  cx += chip(m, cx, cy, 30, { icon: 'pin', text: '2.4', fill: t.surface2, ink: t.text2, barW: 18 }) + 8;
  chip(m, cx, cy, 30, { icon: 'star', fill: t.surface2, ink: t.text2, barW: 30 });
  cy += 48;
  primaryButton(m, ix, cy, iw - 64, 50, t.accent, 'compass');
  circle(m, ix + iw - 25, cy + 25, 25, t.surface2);
  icon(m.ctx, 'share', ix + iw - 25, cy + 25, 20, t.text, false, 2);
}

export const travel: MockApp = {
  id: 'travel',
  nav: ['compass', 'map', 'bookmark', 'calendar', 'users', 'settings'],
  glyph: 'pin',
  tabs: null,
  tabSelected: 0,
  narrow(m, a, full) {
    const t = m.t;
    const sheetH = Math.min(420, Math.max(300, full.h * 0.46));
    const focusTop = a.y + 120;
    mapArt(m, a.x, full.y, a.w, full.h, m.seed, undefined, { x: a.x, y: focusTop, w: a.w - 60, h: Math.max(80, full.y + full.h - sheetH - focusTop - 10) });
    // Keep the status bar readable over the map.
    const g = m.ctx.createLinearGradient(0, full.y, 0, a.y + 40);
    g.addColorStop(0, rgba(t.bg, 0.85));
    g.addColorStop(1, rgba(t.bg, 0));
    m.ctx.fillStyle = g;
    m.ctx.fillRect(a.x, full.y, a.w, a.y + 40 - full.y);
    const M = 16;
    searchBar(m, a.x + M, a.y + 6, a.w - 2 * M);
    chipRow(m, a.x + M, a.y + 70, a.x + a.w);
    // Map controls.
    const bx = a.x + a.w - M - 46;
    const by = a.y + 128;
    card(m, bx, by, 46, 92, 14, t.surface, 0.6);
    icon(m.ctx, 'layers', bx + 23, by + 23, 19, t.text, false, 2);
    m.ctx.fillStyle = t.line;
    m.ctx.fillRect(bx + 8, by + 46, 30, 1);
    icon(m.ctx, 'send', bx + 23, by + 69, 18, t.accent, false, 2.2);
    placeSheet(m, a.x, full.y + full.h - sheetH, a.w, sheetH, 3);
  },
  wide(m, a) {
    const t = m.t;
    m.ctx.save();
    rr(m, a.x, a.y, a.w, a.h + 40, 24);
    m.ctx.clip();
    const pw0 = Math.min(340, a.w * 0.36);
    mapArt(m, a.x, a.y, a.w, a.h + 40, m.seed, ['leaf', 'bag', 'star', 'flame'], { x: a.x + pw0 + 40, y: a.y + 70, w: a.w - pw0 - 70, h: a.h - 100 });
    m.ctx.restore();
    const pw = Math.min(340, a.w * 0.36);
    const px = a.x + 16;
    const py = a.y + 16;
    card(m, px, py, pw, a.h - 32, 22, t.surface, 1);
    box(m, px + 14, py + 14, pw - 28, 40, 12, t.surface2);
    icon(m.ctx, 'search', px + 34, py + 34, 16, t.text2, false, 2.2);
    bar(m, px + 50, py + 31, 90, 5.5, t.bar3);
    let y = py + 70;
    for (let i = 0; y + 90 < py + a.h - 32; i++, y += 104) {
      photo(m, px + 14, y, 92, 88, 14, m.seed + i * 2);
      title(m, px + 118, y + 8, pw - 160, 15);
      body(m, px + 118, y + 30, pw - 190, 12);
      stars(m, px + 118, y + 60, 11, 4 + (i % 2));
      num(m, (4.4 + (i % 5) / 10).toFixed(1), px + 186, y + 64, 12, 700, t.text);
    }
    chipRow(m, px + pw + 16, a.y + 16, a.x + a.w - 40);
  },
};

/** Finance dashboard: balance, smooth area chart, quick actions, transactions. */
import { rgba } from '../../../color';
import { avatar, avatarStack } from '../art';
import { icon, type IconName } from '../icons';
import type { Area, Mk } from '../kit';
import { bar, body, box, brandFill, card, circle, money, num, series, title } from '../kit';
import type { MockApp } from '../widgets';
import { areaChart, chip, iconButton, listRow, sectionHeader, segmented } from '../widgets';

const TX_ICONS: IconName[] = ['bag', 'music', 'card', 'flame', 'compass', 'phone', 'leaf'];

function transactions(m: Mk, x: number, y: number, w: number, rows: number, rowH = 66): void {
  const t = m.t;
  for (let i = 0; i < rows; i++) {
    const income = i % 4 === 2;
    const v = income ? m.rng.range(800, 3200) : m.rng.range(4, 180);
    listRow(m, x, y + i * rowH, w, {
      icon: TX_ICONS[(i + m.seed) % TX_ICONS.length],
      color: t.accents[i % 4],
      titleW: 80 + m.rng.range(0, 60),
      subW: 50 + m.rng.range(0, 40),
      value: `${income ? '+' : '-'}${money(v)}`,
      valueColor: income ? t.good : t.text,
    });
  }
}

function balanceCard(m: Mk, x: number, y: number, w: number, h: number): void {
  card(m, x, y, w, h, 26, brandFill(m, x, y, w, h), 1.2);
  const ctx = m.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  circle(m, x + w * 0.92, y + h * 0.05, h * 0.62, 'rgba(255, 255, 255, 0.10)');
  circle(m, x + w * 0.98, y + h * 0.95, h * 0.42, 'rgba(255, 255, 255, 0.08)');
  ctx.restore();
  bar(m, x + 22, y + 24, 70, 6, 'rgba(255, 255, 255, 0.7)');
  const big = money(m.rng.range(12000, 68000), 0);
  num(m, big, x + 22, y + 72, Math.min(36, w * 0.11), 700, '#ffffff');
  num(m, '•••• 4821', x + 22, y + h - 22, 14, 600, 'rgba(255, 255, 255, 0.82)');
  circle(m, x + w - 50, y + h - 28, 13, 'rgba(255, 255, 255, 0.55)');
  circle(m, x + w - 34, y + h - 28, 13, 'rgba(255, 255, 255, 0.32)');
}

function chartCard(m: Mk, r: Area, points: number, labels: number): void {
  const t = m.t;
  card(m, r.x, r.y, r.w, r.h, 26);
  title(m, r.x + 20, r.y + 18, 96, 16);
  segmented(m, r.x + r.w - Math.min(200, r.w * 0.5) - 16, r.y + 14, Math.min(200, r.w * 0.5), 4, 2, 30);
  const values = series(m.rng, points, 0.35, 0.2, 0.025);
  const hi = Math.max(1, points - 4);
  areaChart(m, { x: r.x + 18, y: r.y + 70, w: r.w - 36, h: r.h - 112 }, values, {
    color: t.accent,
    highlight: hi,
    tooltip: money(4000 + values[hi] * 9000, 0),
    grid: r.w > 420,
  });
  for (let i = 0; i < labels; i++) {
    const lx = r.x + 18 + ((r.w - 36) * (i + 0.5)) / labels;
    bar(m, lx - 11, r.y + r.h - 26, 22, 5, t.bar3);
  }
}

const ACTIONS: IconName[] = ['arrowUpRight', 'arrowDown', 'plus', 'grid'];

export const finance: MockApp = {
  id: 'finance',
  nav: ['home', 'chart', 'card', 'layers', 'users', 'settings'],
  glyph: 'card',
  tabs: ['home', 'chart', 'card', 'user'],
  tabSelected: 0,
  narrow(m, a) {
    const t = m.t;
    const M = 20;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    avatar(m, x + 21, y + 22, 42, m.seed);
    body(m, x + 54, y + 4, 62, 12);
    title(m, x + 54, y + 20, 108, 17);
    iconButton(m, x + w - 21, y + 22, 42, 'bell', { badge: true });
    iconButton(m, x + w - 73, y + 22, 42, 'search');
    y += 70;
    body(m, x, y, 96, 13);
    const big = money(m.rng.range(9000, 86000), 0);
    const bw = num(m, big, x, y + 56, 46, 700, t.text);
    num(m, `.${String(m.rng.int(10, 99))}`, x + bw + 2, y + 56, 26, 600, t.text2);
    chip(m, x, y + 72, 28, { icon: 'arrowUpRight', text: `+${(m.rng.range(1.2, 9.8)).toFixed(1)}%`, fill: rgba(t.good, t.dark ? 0.16 : 0.12), ink: t.good });
    y += 122;
    const ch = Math.min(236, Math.max(180, a.h * 0.3));
    chartCard(m, { x, y, w, h: ch }, 13, 6);
    y += ch + 22;
    const slot = w / ACTIONS.length;
    ACTIONS.forEach((name, i) => {
      const cx = x + slot * (i + 0.5);
      const on = i === 0;
      if (on) circle(m, cx, y + 28, 28, t.accent);
      else iconButton(m, cx, y + 28, 56, name, { fill: t.surface });
      if (on) icon(m.ctx, name, cx, y + 28, 24, t.onAccent, false, 2.2);
      bar(m, cx - 18, y + 68, 36, 5.5, t.bar2);
    });
    y += 98;
    sectionHeader(m, x, y, w);
    y += 40;
    const rows = Math.max(3, Math.ceil((a.y + a.h - y) / 66));
    card(m, x - 6, y - 10, w + 12, rows * 66 + 14, 24);
    transactions(m, x + 8, y, w - 16, rows);
  },
  wide(m, a) {
    const t = m.t;
    const gap = 20;
    const cols = a.w > 860 ? 4 : 3;
    const cw = (a.w - gap * (cols - 1)) / cols;
    const statIcons: IconName[] = ['card', 'arrowUpRight', 'arrowDown', 'flame'];
    for (let i = 0; i < cols; i++) {
      const x = a.x + i * (cw + gap);
      card(m, x, a.y, cw, 122, 22);
      box(m, x + 18, a.y + 18, 38, 38, 12, rgba(t.accents[i], t.dark ? 0.2 : 0.12));
      icon(m.ctx, statIcons[i], x + 37, a.y + 37, 19, t.accents[i], false, 2.1);
      body(m, x + 66, a.y + 23, 70, 13);
      num(m, money(m.rng.range(1200, 48000), 0), x + 18, a.y + 98, Math.min(28, cw * 0.13), 700, t.text);
      const up = i !== 2;
      chip(m, x + cw - 82, a.y + 76, 24, { icon: up ? 'arrowUpRight' : 'arrowDown', text: `${(m.rng.range(1, 12)).toFixed(1)}%`, fill: rgba(up ? t.good : t.bad, 0.12), ink: up ? t.good : t.bad });
    }
    const y2 = a.y + 122 + gap;
    const h2 = Math.min(340, Math.max(220, (a.h - 142) * 0.58));
    const leftW = a.w * 0.64;
    chartCard(m, { x: a.x, y: y2, w: leftW, h: h2 }, 22, 12);
    const rx = a.x + leftW + gap;
    const rw = a.w - leftW - gap;
    const bh = h2 * 0.58;
    balanceCard(m, rx, y2, rw, bh);
    card(m, rx, y2 + bh + gap, rw, h2 - bh - gap, 22);
    title(m, rx + 18, y2 + bh + gap + 16, 92, 15);
    avatarStack(m, rx + 18, y2 + bh + gap + (h2 - bh - gap) * 0.62, 34, 4, m.seed + 3, t.surface);
    circle(m, rx + rw - 36, y2 + bh + gap + (h2 - bh - gap) * 0.62, 17, t.accent);
    icon(m.ctx, 'plus', rx + rw - 36, y2 + bh + gap + (h2 - bh - gap) * 0.62, 16, t.onAccent, false, 2.6);

    const y3 = y2 + h2 + gap;
    const h3 = a.y + a.h - y3;
    if (h3 < 80) return;
    card(m, a.x, y3, a.w, h3 + 40, 22);
    sectionHeader(m, a.x + 20, y3 + 18, a.w - 40, 120);
    const rows = Math.max(1, Math.ceil((h3 - 60) / 62));
    for (let i = 0; i < rows; i++) {
      const ry = y3 + 60 + i * 62;
      listRow(m, a.x + 20, ry, a.w * 0.38, {
        icon: TX_ICONS[(i + m.seed) % TX_ICONS.length],
        color: t.accents[i % 4],
        titleW: 90 + m.rng.range(0, 50),
        subW: 60,
      });
      num(m, `${m.rng.int(1, 28)}.${String(m.rng.int(1, 12)).padStart(2, '0')}.2026`, a.x + a.w * 0.5, ry + 29, 13.5, 500, t.text2);
      const ok = i % 3 !== 1;
      chip(m, a.x + a.w * 0.68, ry + 10, 26, { fill: rgba(ok ? t.good : t.warn, 0.14), ink: ok ? t.good : t.warn, barW: 44 });
      num(m, `-${money(m.rng.range(8, 420))}`, a.x + a.w - 22, ry + 29, 15, 650, t.text, 'right');
      if (i < rows - 1) {
        m.ctx.fillStyle = t.line;
        m.ctx.fillRect(a.x + 20, ry + 54, a.w - 40, 1);
      }
    }
  },
};

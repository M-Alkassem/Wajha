/**
 * System chrome around mock apps: status bars aligned with the frames'
 * Dynamic Island / punch hole, tab and navigation bars, home indicators,
 * and the sidebar + toolbar shells used on tablets and desktops.
 */
import { mix, rgba } from '../../color';
import { ISLAND } from '../iphone';
import { PUNCH_HOLE } from '../android';
import type { Area, Mk } from './kit';
import { bar, body, box, brandFill, card, circle, num, rr, shadowed, title } from './kit';
import { icon, type IconName } from './icons';
import { avatar } from './art';

/** Status bar heights in points. */
export function statusHeight(m: Mk): number {
  if (m.form === 'desktop') return 0;
  if (m.form === 'tablet') return m.os === 'ios' ? 26 : 30;
  return m.os === 'ios' ? 54 : 42;
}

function signalBars(m: Mk, x: number, base: number, ink: string, scale = 1): number {
  const w = 3 * scale;
  const gap = 1.6 * scale;
  [4.2, 6.6, 9, 11.4].forEach((h, i) => box(m, x + i * (w + gap), base - h * scale, w, h * scale, 0.9 * scale, ink));
  return 4 * w + 3 * gap;
}

function wifi(m: Mk, cx: number, base: number, ink: string, scale = 1): void {
  const ctx = m.ctx;
  const a0 = -Math.PI * 0.75;
  const a1 = -Math.PI * 0.25;
  for (let i = 0; i < 3; i++) {
    const r = (3.4 + i * 3.6) * scale;
    ctx.beginPath();
    ctx.arc(cx, base, r, a0, a1);
    if (i === 0) {
      ctx.lineTo(cx, base);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
    } else {
      ctx.lineWidth = 2.2 * scale;
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

function battery(m: Mk, x: number, cy: number, ink: string, level: number, scale = 1): number {
  const w = 25 * scale;
  const h = 12 * scale;
  rr(m, x + 0.5, cy - h / 2 + 0.5, w - 1, h - 1, 3.6 * scale);
  m.ctx.lineWidth = 1;
  m.ctx.strokeStyle = rgba(ink, 0.4);
  m.ctx.stroke();
  box(m, x + 2 * scale, cy - h / 2 + 2 * scale, (w - 4 * scale) * level, h - 4 * scale, 2 * scale, ink);
  box(m, x + w + 1 * scale, cy - 2 * scale, 1.6 * scale, 4 * scale, 0.8 * scale, rgba(ink, 0.45));
  return w + 2.6 * scale;
}

function androidGlyphs(m: Mk, right: number, cy: number, ink: string, scale = 1): void {
  const ctx = m.ctx;
  // Battery: vertical pill.
  const bw = 7.5 * scale;
  const bh = 13 * scale;
  let x = right - bw;
  rr(m, x, cy - bh / 2, bw, bh, 2 * scale);
  ctx.fillStyle = rgba(ink, 0.35);
  ctx.fill();
  box(m, x, cy - bh / 2 + bh * 0.22, bw, bh * 0.78, 2 * scale, ink);
  box(m, x + bw * 0.3, cy - bh / 2 - 1.5 * scale, bw * 0.4, 2 * scale, 0.6 * scale, ink);
  // Signal: filled right triangle.
  x -= 18 * scale;
  ctx.beginPath();
  ctx.moveTo(x, cy + 6 * scale);
  ctx.lineTo(x + 12 * scale, cy + 6 * scale);
  ctx.lineTo(x + 12 * scale, cy - 6 * scale);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();
  // Wi-Fi: filled fan.
  x -= 10 * scale;
  ctx.beginPath();
  ctx.moveTo(x, cy + 6 * scale);
  ctx.arc(x, cy + 6 * scale, 13 * scale, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.closePath();
  ctx.fill();
}

/** Status bar in `ink`, phone or tablet, iOS or Android. */
export function statusBar(m: Mk, W: number, ink: string): void {
  if (m.form === 'desktop') return;
  if (m.form === 'phone' && m.os === 'ios') {
    const cy = (ISLAND.top + ISLAND.height / 2) * W;
    const ear = (W * (1 - ISLAND.width)) / 4;
    num(m, '9:41', ear + 2, cy + 6.2, 17, 600, ink, 'center');
    const groupW = 18 + 6 + 16 + 6 + 27.6;
    let x = W - ear - groupW / 2 - 2;
    x += signalBars(m, x, cy + 5.4, ink) + 6;
    wifi(m, x + 8, cy + 5.4, ink);
    x += 16 + 6;
    battery(m, x, cy, ink, 0.82);
    return;
  }
  if (m.form === 'phone') {
    const cy = PUNCH_HOLE.centerY * W;
    num(m, '9:30', 24, cy + 5, 14.5, 500, ink, 'left');
    androidGlyphs(m, W - 24, cy, ink);
    return;
  }
  // Tablets: compact bar, time and date on the left.
  const cy = m.os === 'ios' ? 13 : 15;
  const tw = num(m, m.os === 'ios' ? '9:41' : '9:30', 22, cy + 4.6, 13.5, 600, ink, 'left');
  bar(m, 22 + tw + 7, cy - 2.6, 62, 5.2, rgba(ink, 0.55));
  if (m.os === 'ios') {
    const bx = W - 22 - 25 * 0.86 - 2;
    battery(m, bx, cy, ink, 0.82, 0.86);
    wifi(m, bx - 13, cy + 4.6, ink, 0.86);
    signalBars(m, bx - 46, cy + 4.6, ink, 0.86);
  } else {
    androidGlyphs(m, W - 22, cy, ink, 0.86);
  }
}

/** iOS home indicator / Android gesture handle. */
export function homeIndicator(m: Mk, W: number, H: number, ink: string): void {
  if (m.form === 'desktop') return;
  if (m.os === 'ios') {
    const w = m.form === 'tablet' ? 300 : 136;
    bar(m, (W - w) / 2, H - 8 - 5, w, 5, rgba(ink, 0.9));
  } else {
    bar(m, (W - 104) / 2, H - 10 - 4, 104, 4, rgba(ink, 0.65));
  }
}

/** Space the tab bar takes at the bottom of a phone, in points. */
export function tabBarHeight(m: Mk): number {
  return m.os === 'ios' ? 100 : 98;
}

/**
 * Phone tab bar. iOS draws the floating glass capsule of iOS 26; Android a
 * Material 3 navigation bar with a pill behind the selected icon.
 */
export function tabBar(m: Mk, W: number, H: number, icons: readonly IconName[], selected: number): void {
  const t = m.t;
  const n = icons.length;
  if (n === 0) return;
  if (m.os === 'ios') {
    const bh = 64;
    const y = H - 34 - bh + 6;
    const x = 20;
    const w = W - 40;
    shadowed(m, 30, 8, t.dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(20, 28, 48, 0.16)', () =>
      box(m, x, y, w, bh, bh / 2, t.dark ? rgba(mix(t.surface, '#ffffff', 0.08), 0.94) : 'rgba(255, 255, 255, 0.94)'),
    );
    rr(m, x + 0.5, y + 0.5, w - 1, bh - 1, bh / 2 - 0.5);
    m.ctx.lineWidth = 1;
    m.ctx.strokeStyle = t.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.9)';
    m.ctx.stroke();
    const slot = (w - 12) / n;
    icons.forEach((name, i) => {
      const cx = x + 6 + slot * (i + 0.5);
      const on = i === selected;
      if (on) box(m, cx - slot / 2 + 2, y + 6, slot - 4, bh - 12, (bh - 12) / 2, t.dark ? 'rgba(255, 255, 255, 0.1)' : rgba(t.accent, 0.1));
      icon(m.ctx, name, cx, y + 25, 24, on ? t.accent : t.text2, false, on ? 2.3 : 2);
      bar(m, cx - 13, y + 43, 26, 4.6, on ? t.accent : t.bar3);
    });
    return;
  }
  const bh = 80;
  const y = H - 18 - bh;
  m.ctx.fillStyle = t.dark ? mix(t.surface, t.accent, 0.04) : mix('#ffffff', t.accent, 0.035);
  m.ctx.fillRect(0, y, W, H - y);
  const slot = W / n;
  icons.forEach((name, i) => {
    const cx = slot * (i + 0.5);
    const on = i === selected;
    if (on) box(m, cx - 32, y + 12, 64, 32, 16, t.soft);
    icon(m.ctx, name, cx, y + 28, 24, on ? t.accent : t.text2, false, 2);
    bar(m, cx - 15, y + 54, 30, 5, on ? t.bar : t.bar3);
  });
}

function logoTile(m: Mk, x: number, y: number, s: number, glyph: IconName): void {
  box(m, x, y, s, s, s * 0.3, brandFill(m, x, y, s, s));
  icon(m.ctx, glyph, x + s / 2, y + s / 2, s * 0.56, '#ffffff', false, 2.4);
}

/** Navigation rows with icons; returns the y below the last row. */
function navList(m: Mk, x: number, y: number, w: number, icons: readonly IconName[], selected: number, rowH: number): number {
  const t = m.t;
  const widths = [64, 82, 58, 74, 70, 60, 78];
  icons.forEach((name, i) => {
    const on = i === selected;
    const ry = y + i * rowH;
    if (on) box(m, x, ry, w, rowH - 4, 10, t.dark ? rgba(t.accent, 0.18) : rgba(t.accent, 0.1));
    icon(m.ctx, name, x + 20, ry + (rowH - 4) / 2, 18, on ? t.accent : t.text2, false, 2);
    body(m, x + 40, ry + (rowH - 4) / 2 - 7, widths[i % widths.length], 14, on ? t.accent : t.bar2);
  });
  return y + icons.length * rowH;
}

function tagList(m: Mk, x: number, y: number, count: number): number {
  const t = m.t;
  bar(m, x + 8, y, 52, 5, t.bar3);
  const widths = [70, 54, 84, 62];
  for (let i = 0; i < count; i++) {
    const ry = y + 22 + i * 32;
    circle(m, x + 14, ry + 6, 4.5, t.accents[i % 4]);
    body(m, x + 28, ry, widths[i % widths.length], 13);
  }
  return y + 22 + count * 32;
}

export interface Shell {
  /** Navigation icons, first one selected unless `selected` says otherwise. */
  nav: readonly IconName[];
  selected: number;
  /** Glyph in the app's logo tile. */
  glyph: IconName;
}

/**
 * Desktop app shell: sidebar (window controls when `windowControls`),
 * toolbar with search and a primary action. Returns the content area.
 */
export function desktopShell(m: Mk, W: number, H: number, shell: Shell, windowControls: boolean): Area {
  const t = m.t;
  const ctx = m.ctx;
  const SW = Math.min(250, Math.max(190, W * 0.18));
  ctx.fillStyle = t.sidebar;
  ctx.fillRect(0, 0, SW, H);
  ctx.fillStyle = t.line;
  ctx.fillRect(SW - 1, 0, 1, H);
  let y = 22;
  if (windowControls) {
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => circle(m, 22 + i * 20, 22, 6, c));
    y = 54;
  }
  logoTile(m, 18, y, 30, shell.glyph);
  title(m, 58, y + 6, 86, 16);
  y += 50;
  box(m, 14, y, SW - 28, 32, 9, t.dark ? t.surface2 : '#ffffff');
  if (!t.dark) {
    rr(m, 14.5, y + 0.5, SW - 29, 31, 8.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.line;
    ctx.stroke();
  }
  icon(ctx, 'search', 32, y + 16, 15, t.text2, false, 2.2);
  bar(m, 46, y + 13.5, 60, 5, t.bar3);
  y = navList(m, 10, y + 48, SW - 20, shell.nav, shell.selected, 40);
  y = tagList(m, 10, y + 22, 3);
  // Profile at the bottom.
  if (H - 56 > y + 12) {
    ctx.fillStyle = t.line;
    ctx.fillRect(14, H - 64, SW - 28, 1);
    avatar(m, 34, H - 34, 32, m.seed + 5);
    title(m, 58, H - 47, 70, 13);
    body(m, 58, H - 31, 96, 11);
  }

  // Toolbar.
  const cx = SW + 28;
  const right = W - 24;
  title(m, cx, 22, Math.min(170, (W - SW) * 0.2), 24);
  body(m, cx, 52, Math.min(230, (W - SW) * 0.26), 13);
  circle(m, right - 18, 40, 18, t.surface2);
  avatar(m, right - 18, 40, 34, m.seed + 9);
  const bw = 118;
  const bx = right - 44 - bw;
  shadowed(m, 14, 5, t.dark ? 'rgba(0, 0, 0, 0.4)' : rgba(t.accent, 0.3), () => box(m, bx, 22, bw, 36, 11, t.accent));
  icon(ctx, 'plus', bx + 22, 40, 16, t.onAccent, false, 2.6);
  bar(m, bx + 38, 37.5, 60, 5, rgba(t.onAccent, 0.9));
  const sx = bx - 52;
  circle(m, sx + 18, 40, 18, t.dark ? t.surface2 : '#ffffff');
  icon(ctx, 'bell', sx + 18, 40, 17, t.text2, false, 2);
  circle(m, sx + 26, 31, 4, t.bad);
  const fw = Math.min(240, Math.max(0, sx - 14 - (cx + Math.min(230, (W - SW) * 0.26) + 30)));
  if (fw > 90) {
    const fx = sx - 14 - fw;
    box(m, fx, 22, fw, 36, 11, t.dark ? t.surface2 : '#ffffff');
    icon(ctx, 'search', fx + 20, 40, 15, t.text2, false, 2.2);
    bar(m, fx + 36, 37.5, fw * 0.36, 5, t.bar3);
  }
  return { x: cx, y: 84, w: W - SW - 52, h: H - 84 - 24 };
}

/** Tablet shell: floating sidebar panel next to the content. Returns the content area. */
export function tabletShell(m: Mk, W: number, H: number, top: number, shell: Shell): Area {
  const t = m.t;
  const ctx = m.ctx;
  const SW = Math.min(300, Math.max(210, W * 0.31));
  const x = 10;
  const y = top + 6;
  const h = H - y - 26;
  card(m, x, y, SW, h, 26, t.dark ? t.surface : '#ffffff', 0.8);
  let cy = y + 22;
  logoTile(m, x + 18, cy, 34, shell.glyph);
  title(m, x + 64, cy + 7, 92, 18);
  cy += 54;
  box(m, x + 14, cy, SW - 28, 36, 11, t.surface2);
  icon(ctx, 'search', x + 34, cy + 18, 16, t.text2, false, 2.2);
  bar(m, x + 50, cy + 15.5, 70, 5, t.bar3);
  cy = navList(m, x + 10, cy + 52, SW - 20, shell.nav, shell.selected, 46);
  tagList(m, x + 10, cy + 24, Math.max(0, Math.min(4, Math.floor((y + h - cy - 70) / 32))));
  return { x: x + SW + 18, y: top, w: W - SW - x - 18 - 6, h: H - top };
}

/** Shell for pages in a browser: slim top navigation instead of a sidebar. Returns the content area. */
export function webShell(m: Mk, W: number, H: number, shell: Shell): Area {
  const t = m.t;
  const ctx = m.ctx;
  ctx.fillStyle = t.dark ? t.sidebar : '#ffffff';
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = t.line;
  ctx.fillRect(0, 63, W, 1);
  logoTile(m, 28, 17, 30, shell.glyph);
  title(m, 68, 22, 84, 16);
  const widths = [52, 64, 48, 58, 44];
  let x = 190;
  shell.nav.slice(0, 5).forEach((_, i) => {
    const on = i === shell.selected;
    if (x + widths[i] > W - 260) return;
    if (on) box(m, x - 12, 18, widths[i] + 24, 28, 14, t.dark ? rgba(t.accent, 0.18) : rgba(t.accent, 0.1));
    body(m, x, 25, widths[i], 14, on ? t.accent : t.bar2);
    x += widths[i] + 40;
  });
  avatar(m, W - 46, 32, 34, m.seed + 9);
  const bw = 118;
  shadowed(m, 14, 5, t.dark ? 'rgba(0, 0, 0, 0.4)' : rgba(t.accent, 0.3), () => box(m, W - 76 - bw, 14, bw, 36, 18, t.accent));
  bar(m, W - 76 - bw + 30, 29.5, bw - 60, 5, rgba(t.onAccent, 0.9));
  return { x: 28, y: 92, w: W - 56, h: H - 92 - 24 };
}

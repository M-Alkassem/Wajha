/** Reusable app widgets: buttons, chips, section headers, charts, list rows. */
import { mix, rgba } from '../../color';
import type { Area, Mk } from './kit';
import { bar, body, box, card, circle, linear, measure, num, smoothPath, title } from './kit';
import { icon, type IconName } from './icons';
import { tint } from './theme';

/** The app types every mock screen can show. */
export type MockArchetypeId = 'finance' | 'social' | 'tasks' | 'fitness' | 'chat' | 'music' | 'travel' | 'shop' | 'calendar' | 'meditation';

export interface MockApp {
  id: MockArchetypeId;
  /** Sidebar navigation on tablets and desktops. */
  nav: readonly IconName[];
  /** Logo glyph. */
  glyph: IconName;
  /** Phone tab bar icons, or null when the app has its own bottom controls. */
  tabs: readonly IconName[] | null;
  tabSelected: number;
  /** Full-screen backdrop; defaults to the theme background. */
  backdrop?(m: Mk, W: number, H: number): void;
  /** Status bar ink when the app's top is not the theme background. */
  ink?(m: Mk): string;
  /**
   * Phone / tablet content. `a` runs from below the status bar to above the
   * tab bar; `full` is the whole screen (for full-bleed apps).
   */
  narrow(m: Mk, a: Area, full: Area): void;
  /** Desktop content inside the app shell. */
  wide(m: Mk, a: Area): void;
}

/** Round icon button; `badge` adds a notification dot. */
export function iconButton(m: Mk, cx: number, cy: number, d: number, name: IconName, opts: { badge?: boolean; fill?: string; ink?: string; lift?: boolean } = {}): void {
  const t = m.t;
  const fill = opts.fill ?? t.surface;
  if (opts.lift !== false && !t.dark && fill === t.surface) {
    card(m, cx - d / 2, cy - d / 2, d, d, d / 2, fill, 0.5);
  } else {
    circle(m, cx, cy, d / 2, fill);
  }
  icon(m.ctx, name, cx, cy, d * 0.46, opts.ink ?? t.text, false, 2);
  if (opts.badge) {
    circle(m, cx + d * 0.22, cy - d * 0.22, d * 0.12, fill);
    circle(m, cx + d * 0.22, cy - d * 0.22, d * 0.085, t.bad);
  }
}

/** Section title with a "see all" link on the right. */
export function sectionHeader(m: Mk, x: number, y: number, w: number, titleW = 118): void {
  title(m, x, y, titleW, 18);
  bar(m, x + w - 46, y + 7, 46, 6, m.t.accent);
}

/** A pill chip with an optional icon and number. Returns its width. */
export function chip(m: Mk, x: number, y: number, h: number, opts: { text?: string; icon?: IconName; fill: string; ink: string; barW?: number }): number {
  const pad = h * 0.42;
  const iconW = opts.icon ? h * 0.52 : 0;
  const textW = opts.text ? measure(m, opts.text, h * 0.46, 600) : 0;
  const barW = opts.barW ?? 0;
  const gap = h * 0.22;
  const parts = [iconW, textW, barW].filter((v) => v > 0);
  const w = pad * 2 + parts.reduce((s, v) => s + v, 0) + gap * Math.max(0, parts.length - 1);
  box(m, x, y, w, h, h / 2, opts.fill);
  let cx = x + pad;
  if (opts.icon) {
    icon(m.ctx, opts.icon, cx + iconW / 2, y + h / 2, iconW, opts.ink, false, 2.6);
    cx += iconW + gap;
  }
  if (opts.text) {
    num(m, opts.text, cx, y + h * 0.66, h * 0.46, 600, opts.ink);
    cx += textW + gap;
  }
  if (barW > 0) bar(m, cx, y + h / 2 - h * 0.1, barW, h * 0.2, opts.ink);
  return w;
}

/** Segmented control of `n` skeleton labels with one selected. */
export function segmented(m: Mk, x: number, y: number, w: number, n: number, selected: number, h = 30): void {
  const t = m.t;
  box(m, x, y, w, h, h / 2, t.surface2);
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const on = i === selected;
    if (on) card(m, x + i * sw + 3, y + 3, sw - 6, h - 6, (h - 6) / 2, t.dark ? mix(t.surface2, '#ffffff', 0.12) : '#ffffff', 0.25);
    bar(m, x + i * sw + sw * 0.32, y + h / 2 - 2.6, sw * 0.36, 5.2, on ? t.bar : t.bar2);
  }
}

export interface ChartOptions {
  color: string;
  lw?: number;
  /** Index of a highlighted point with marker and tooltip. */
  highlight?: number;
  tooltip?: string;
  grid?: boolean;
  fillAlpha?: number;
  /** Stretch values to the chart height (default true). */
  normalize?: boolean;
}

/** Smooth area chart of values in 0..1 over the rect. */
export function areaChart(m: Mk, r: Area, values: readonly number[], o: ChartOptions): void {
  if (values.length < 2 || !(r.w > 0) || !(r.h > 0)) return;
  const ctx = m.ctx;
  const t = m.t;
  // Stretch the series over the chart height so every chart looks lively.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  const norm = (v: number) => (o.normalize === false ? v : 0.1 + ((v - lo) / span) * 0.78);
  const pts = values.map((v, i) => [r.x + (r.w * i) / (values.length - 1), r.y + r.h - norm(v) * r.h] as [number, number]);
  if (o.grid) {
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.line;
    for (let i = 0; i <= 3; i++) {
      const gy = r.y + (r.h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(r.x, gy);
      ctx.lineTo(r.x + r.w, gy);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h);
  ctx.closePath();
  ctx.fillStyle = linear(m, 0, r.y, 0, r.y + r.h, [
    [0, rgba(o.color, o.fillAlpha ?? (m.t.dark ? 0.32 : 0.26))],
    [1, rgba(o.color, 0)],
  ]);
  ctx.fill();
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.lineWidth = o.lw ?? 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = o.color;
  ctx.stroke();
  if (o.highlight !== undefined) {
    const [hx, hy] = pts[Math.max(0, Math.min(pts.length - 1, o.highlight))];
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(o.color, 0.5);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, r.y + r.h);
    ctx.stroke();
    ctx.restore();
    circle(m, hx, hy, 9, rgba(o.color, 0.18));
    circle(m, hx, hy, 5.2, t.surface);
    ctx.beginPath();
    ctx.arc(hx, hy, 5.2, 0, Math.PI * 2);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = o.color;
    ctx.stroke();
    if (o.tooltip) {
      const tw = measure(m, o.tooltip, 12.5, 600) + 20;
      const th = 28;
      const tx = Math.min(Math.max(hx - tw / 2, r.x), r.x + r.w - tw);
      const ty = hy - th - 14;
      const ink = t.dark ? '#ffffff' : '#111318';
      box(m, tx, ty, tw, th, 9, ink);
      ctx.beginPath();
      ctx.moveTo(hx - 5, ty + th - 0.5);
      ctx.lineTo(hx + 5, ty + th - 0.5);
      ctx.lineTo(hx, ty + th + 5);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      num(m, o.tooltip, tx + tw / 2, ty + 18.5, 12.5, 600, t.dark ? '#111318' : '#ffffff', 'center');
    }
  }
  ctx.lineCap = 'butt';
}

/** Vertical bar chart with rounded bars; `hi` is the highlighted bar. */
export function barChart(m: Mk, r: Area, values: readonly number[], color: string, hi: number, track: string | null = null): void {
  const n = values.length;
  if (n === 0) return;
  const gap = r.w / n;
  const bw = Math.min(gap * 0.5, 26);
  values.forEach((v, i) => {
    const bx = r.x + gap * (i + 0.5) - bw / 2;
    if (track) box(m, bx, r.y, bw, r.h, bw / 2, track);
    const bh = Math.max(bw, r.h * v);
    box(m, bx, r.y + r.h - bh, bw, bh, bw / 2, i === hi ? color : rgba(color, m.t.dark ? 0.35 : 0.25));
  });
}

/** A list row: icon tile, title and subtitle bars, trailing value. */
export function listRow(m: Mk, x: number, y: number, w: number, opts: { icon: IconName; color: string; titleW: number; subW: number; value?: string; valueColor?: string; sub?: string }): void {
  const t = m.t;
  box(m, x, y, 46, 46, 15, tint(t, opts.color));
  icon(m.ctx, opts.icon, x + 23, y + 23, 21, opts.color, false, 2.1);
  title(m, x + 60, y + 4, opts.titleW, 15);
  if (opts.sub) num(m, opts.sub, x + 60, y + 39, 12.5, 500, t.text2);
  else body(m, x + 60, y + 25, opts.subW, 13);
  if (opts.value) num(m, opts.value, x + w, y + 29, 15.5, 650, opts.valueColor ?? t.text, 'right');
}

/** Rating stars, `value` of 5. */
export function stars(m: Mk, x: number, cy: number, size: number, value: number): void {
  for (let i = 0; i < 5; i++) {
    const on = i < Math.round(value);
    icon(m.ctx, 'star', x + size / 2 + i * size * 1.1, cy, size, on ? '#f5b014' : m.t.bar3, on, 1.6);
  }
}

/** A primary call-to-action button with a skeleton label. */
export function primaryButton(m: Mk, x: number, y: number, w: number, h: number, color: string = m.t.accent, glyph?: IconName): void {
  const t = m.t;
  box(m, x, y, w, h, h / 2, color);
  const labelW = Math.min(w * 0.36, 110);
  const ink = color === t.accent ? t.onAccent : '#ffffff';
  if (glyph) {
    icon(m.ctx, glyph, x + w / 2 - labelW / 2 - 6, y + h / 2, h * 0.4, ink, false, 2.4);
    bar(m, x + w / 2 - labelW / 2 + 12, y + h / 2 - 3, labelW, 6, rgba(ink, 0.92));
  } else {
    bar(m, x + (w - labelW) / 2, y + h / 2 - 3, labelW, 6, rgba(ink, 0.92));
  }
}

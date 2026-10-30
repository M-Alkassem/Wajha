/**
 * A small outline icon set (24-unit grid, 2-unit strokes, round caps), in
 * the spirit of SF Symbols / Lucide. Drawn as vectors so they stay crisp
 * at any size and need no assets.
 */
import type { Ctx2D } from '../../types';

export type IconName =
  | 'home'
  | 'search'
  | 'heart'
  | 'user'
  | 'users'
  | 'bell'
  | 'chart'
  | 'calendar'
  | 'plus'
  | 'chat'
  | 'settings'
  | 'grid'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'shuffle'
  | 'repeat'
  | 'pin'
  | 'bag'
  | 'star'
  | 'check'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowUpRight'
  | 'more'
  | 'send'
  | 'camera'
  | 'bookmark'
  | 'phone'
  | 'video'
  | 'mic'
  | 'filter'
  | 'card'
  | 'clock'
  | 'flame'
  | 'list'
  | 'compass'
  | 'share'
  | 'moon'
  | 'music'
  | 'image'
  | 'folder'
  | 'inbox'
  | 'layers'
  | 'activity'
  | 'leaf'
  | 'map'
  | 'close'
  | 'menu'
  | 'edit'
  | 'sparkle'
  | 'wave'
  | 'drop';

type Draw = (ctx: Ctx2D) => void;

interface IconDef {
  /** Outline parts. */
  stroke?: Draw;
  /** Solid parts (dots, play triangles). */
  fill?: Draw;
}

const TAU = Math.PI * 2;

function poly(ctx: Ctx2D, pts: number[], close = false): void {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
}

function rrect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circ(ctx: Ctx2D, cx: number, cy: number, r: number): void {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, TAU);
}

function heart(ctx: Ctx2D): void {
  ctx.moveTo(12, 20.3);
  ctx.bezierCurveTo(12, 20.3, 3, 14.8, 3, 9.1);
  ctx.bezierCurveTo(3, 6.2, 5.2, 4, 8, 4);
  ctx.bezierCurveTo(9.8, 4, 11.2, 5, 12, 6.3);
  ctx.bezierCurveTo(12.8, 5, 14.2, 4, 16, 4);
  ctx.bezierCurveTo(18.8, 4, 21, 6.2, 21, 9.1);
  ctx.bezierCurveTo(21, 14.8, 12, 20.3, 12, 20.3);
  ctx.closePath();
}

function star(ctx: Ctx2D): void {
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9.6 : 4.3;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = 12 + Math.cos(a) * r;
    const y = 12.8 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Crescent between circle A and an offset circle B. */
function crescent(ctx: Ctx2D): void {
  const ax = 12, ay = 12, ar = 8.6;
  const bx = 16.6, by = 7.6, br = 7.4;
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy);
  const a = (ar * ar - br * br + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ar * ar - a * a));
  const px = ax + (a * dx) / d, py = ay + (a * dy) / d;
  const i1x = px + (h * -dy) / d, i1y = py + (h * dx) / d;
  const i2x = px - (h * -dy) / d, i2y = py - (h * dx) / d;
  const a1 = Math.atan2(i1y - ay, i1x - ax);
  const a2 = Math.atan2(i2y - ay, i2x - ax);
  const b1 = Math.atan2(i2y - by, i2x - bx);
  const b2 = Math.atan2(i1y - by, i1x - bx);
  ctx.moveTo(i1x, i1y);
  ctx.arc(ax, ay, ar, a1, a2, false);
  ctx.arc(bx, by, br, b1, b2, true);
  ctx.closePath();
}

const ICONS: Record<IconName, IconDef> = {
  home: { stroke: (c) => poly(c, [3.5, 10.5, 12, 3.5, 20.5, 10.5, 20.5, 20.5, 14.5, 20.5, 14.5, 14.5, 9.5, 14.5, 9.5, 20.5, 3.5, 20.5], true) },
  search: {
    stroke: (c) => {
      circ(c, 11, 11, 6.8);
      c.moveTo(16, 16);
      c.lineTo(20.5, 20.5);
    },
  },
  heart: { stroke: heart },
  user: {
    stroke: (c) => {
      circ(c, 12, 8.2, 4);
      c.moveTo(4.5, 20.5);
      c.bezierCurveTo(4.5, 16.4, 7.8, 14, 12, 14);
      c.bezierCurveTo(16.2, 14, 19.5, 16.4, 19.5, 20.5);
    },
  },
  users: {
    stroke: (c) => {
      circ(c, 9, 8.5, 3.6);
      c.moveTo(2.8, 20);
      c.bezierCurveTo(2.8, 16.5, 5.6, 14.3, 9, 14.3);
      c.bezierCurveTo(12.4, 14.3, 15.2, 16.5, 15.2, 20);
      c.moveTo(15.5, 5.2);
      c.arc(16, 8.5, 3.3, -Math.PI * 0.55, Math.PI * 0.5);
      c.moveTo(17.6, 14.4);
      c.bezierCurveTo(19.7, 15, 21.2, 16.9, 21.2, 19.6);
    },
  },
  bell: {
    stroke: (c) => {
      c.moveTo(6, 16.5);
      c.lineTo(6, 11);
      c.arc(12, 11, 6, Math.PI, 0);
      c.lineTo(18, 16.5);
      c.lineTo(19.5, 18.2);
      c.lineTo(4.5, 18.2);
      c.closePath();
      c.moveTo(10, 21);
      c.lineTo(14, 21);
    },
  },
  chart: {
    stroke: (c) => {
      c.moveTo(5, 20);
      c.lineTo(5, 13);
      c.moveTo(12, 20);
      c.lineTo(12, 5);
      c.moveTo(19, 20);
      c.lineTo(19, 10);
    },
  },
  calendar: {
    stroke: (c) => {
      rrect(c, 3.5, 5, 17, 15.5, 3);
      c.moveTo(3.5, 10);
      c.lineTo(20.5, 10);
      c.moveTo(8, 3);
      c.lineTo(8, 6.5);
      c.moveTo(16, 3);
      c.lineTo(16, 6.5);
    },
  },
  plus: {
    stroke: (c) => {
      c.moveTo(12, 5);
      c.lineTo(12, 19);
      c.moveTo(5, 12);
      c.lineTo(19, 12);
    },
  },
  chat: {
    stroke: (c) => {
      c.moveTo(7.5, 17.5);
      c.lineTo(4.5, 20.5);
      c.lineTo(4.5, 7.5);
      c.arcTo(4.5, 4, 8, 4, 3.5);
      c.lineTo(16.5, 4);
      c.arcTo(20, 4, 20, 7.5, 3.5);
      c.lineTo(20, 14);
      c.arcTo(20, 17.5, 16.5, 17.5, 3.5);
      c.closePath();
    },
  },
  settings: {
    stroke: (c) => {
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 2 === 0 ? 9 : 7;
        const x = 12 + Math.cos(a) * r;
        const y = 12 + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      circ(c, 12, 12, 3);
    },
  },
  grid: {
    stroke: (c) => {
      rrect(c, 4, 4, 6.5, 6.5, 1.8);
      rrect(c, 13.5, 4, 6.5, 6.5, 1.8);
      rrect(c, 4, 13.5, 6.5, 6.5, 1.8);
      rrect(c, 13.5, 13.5, 6.5, 6.5, 1.8);
    },
  },
  play: { fill: (c) => poly(c, [8, 5, 19, 12, 8, 19], true), stroke: (c) => poly(c, [8, 5, 19, 12, 8, 19], true) },
  pause: {
    fill: (c) => {
      rrect(c, 6.5, 4.5, 4, 15, 1.4);
      rrect(c, 13.5, 4.5, 4, 15, 1.4);
    },
  },
  next: {
    fill: (c) => poly(c, [5, 6, 15, 12, 5, 18], true),
    stroke: (c) => {
      poly(c, [5, 6, 15, 12, 5, 18], true);
      c.moveTo(18.5, 6);
      c.lineTo(18.5, 18);
    },
  },
  prev: {
    fill: (c) => poly(c, [19, 6, 9, 12, 19, 18], true),
    stroke: (c) => {
      poly(c, [19, 6, 9, 12, 19, 18], true);
      c.moveTo(5.5, 6);
      c.lineTo(5.5, 18);
    },
  },
  shuffle: {
    stroke: (c) => {
      c.moveTo(3.5, 7);
      c.lineTo(7, 7);
      c.bezierCurveTo(12, 7, 12, 17, 17, 17);
      c.lineTo(20.5, 17);
      c.moveTo(3.5, 17);
      c.lineTo(7, 17);
      c.bezierCurveTo(12, 17, 12, 7, 17, 7);
      c.lineTo(20.5, 7);
      poly(c, [18, 4.5, 20.5, 7, 18, 9.5]);
      poly(c, [18, 14.5, 20.5, 17, 18, 19.5]);
    },
  },
  repeat: {
    stroke: (c) => {
      c.moveTo(4, 12);
      c.lineTo(4, 10);
      c.arcTo(4, 6.5, 7.5, 6.5, 3.5);
      c.lineTo(20, 6.5);
      poly(c, [17, 3.5, 20, 6.5, 17, 9.5]);
      c.moveTo(20, 12);
      c.lineTo(20, 14);
      c.arcTo(20, 17.5, 16.5, 17.5, 3.5);
      c.lineTo(4, 17.5);
      poly(c, [7, 14.5, 4, 17.5, 7, 20.5]);
    },
  },
  pin: {
    stroke: (c) => {
      c.moveTo(12, 21.5);
      c.bezierCurveTo(12, 21.5, 5, 15.2, 5, 10);
      c.arc(12, 10, 7, Math.PI, 0);
      c.bezierCurveTo(19, 15.2, 12, 21.5, 12, 21.5);
      c.closePath();
      circ(c, 12, 10, 2.5);
    },
  },
  bag: {
    stroke: (c) => {
      rrect(c, 4, 8, 16, 13, 2.8);
      c.moveTo(8.5, 8);
      c.lineTo(8.5, 7);
      c.arc(12, 7, 3.5, Math.PI, 0);
      c.lineTo(15.5, 8);
    },
  },
  star: { stroke: star },
  check: { stroke: (c) => poly(c, [5, 12.5, 10, 17.5, 19.5, 7]) },
  chevronLeft: { stroke: (c) => poly(c, [15, 5, 8, 12, 15, 19]) },
  chevronRight: { stroke: (c) => poly(c, [9, 5, 16, 12, 9, 19]) },
  chevronDown: { stroke: (c) => poly(c, [6, 9, 12, 15, 18, 9]) },
  arrowUp: {
    stroke: (c) => {
      c.moveTo(12, 19);
      c.lineTo(12, 5);
      poly(c, [6, 11, 12, 5, 18, 11]);
    },
  },
  arrowDown: {
    stroke: (c) => {
      c.moveTo(12, 5);
      c.lineTo(12, 19);
      poly(c, [6, 13, 12, 19, 18, 13]);
    },
  },
  arrowUpRight: {
    stroke: (c) => {
      c.moveTo(7, 17);
      c.lineTo(17, 7);
      poly(c, [8.5, 7, 17, 7, 17, 15.5]);
    },
  },
  more: {
    fill: (c) => {
      circ(c, 5.5, 12, 1.8);
      circ(c, 12, 12, 1.8);
      circ(c, 18.5, 12, 1.8);
    },
  },
  send: {
    stroke: (c) => {
      poly(c, [20.5, 3.5, 3.5, 10.5, 10.5, 13.5, 13.5, 20.5], true);
      c.moveTo(20.5, 3.5);
      c.lineTo(10.5, 13.5);
    },
  },
  camera: {
    stroke: (c) => {
      c.moveTo(3.5, 9.5);
      c.arcTo(3.5, 7, 6, 7, 2.5);
      c.lineTo(8, 7);
      c.lineTo(9.5, 4.5);
      c.lineTo(14.5, 4.5);
      c.lineTo(16, 7);
      c.lineTo(18, 7);
      c.arcTo(20.5, 7, 20.5, 9.5, 2.5);
      c.lineTo(20.5, 17.5);
      c.arcTo(20.5, 20, 18, 20, 2.5);
      c.lineTo(6, 20);
      c.arcTo(3.5, 20, 3.5, 17.5, 2.5);
      c.closePath();
      circ(c, 12, 13.2, 3.6);
    },
  },
  bookmark: { stroke: (c) => poly(c, [6.5, 3.5, 17.5, 3.5, 17.5, 20.5, 12, 16.3, 6.5, 20.5], true) },
  phone: {
    stroke: (c) => {
      rrect(c, 7, 2.5, 10, 19, 2.6);
      c.moveTo(11, 18.3);
      c.lineTo(13, 18.3);
    },
  },
  video: {
    stroke: (c) => {
      rrect(c, 2.5, 6.5, 13, 11, 2.6);
      poly(c, [15.5, 10.3, 21.5, 7, 21.5, 17, 15.5, 13.7]);
    },
  },
  mic: {
    stroke: (c) => {
      rrect(c, 9, 3, 6, 11, 3);
      c.moveTo(5.5, 11);
      c.arc(12, 11, 6.5, Math.PI, 0, true);
      c.moveTo(12, 17.5);
      c.lineTo(12, 21);
    },
  },
  filter: {
    stroke: (c) => {
      c.moveTo(4, 7);
      c.lineTo(12, 7);
      c.moveTo(18, 7);
      c.lineTo(20, 7);
      circ(c, 15, 7, 2.8);
      c.moveTo(4, 17);
      c.lineTo(6, 17);
      c.moveTo(12, 17);
      c.lineTo(20, 17);
      circ(c, 9, 17, 2.8);
    },
  },
  card: {
    stroke: (c) => {
      rrect(c, 2.5, 5, 19, 14, 3);
      c.moveTo(2.5, 10);
      c.lineTo(21.5, 10);
      c.moveTo(6, 15);
      c.lineTo(10, 15);
    },
  },
  clock: {
    stroke: (c) => {
      circ(c, 12, 12, 8.8);
      poly(c, [12, 7, 12, 12, 15.5, 14]);
    },
  },
  flame: {
    stroke: (c) => {
      c.moveTo(12, 21.5);
      c.bezierCurveTo(7.6, 21.5, 5, 18.5, 5, 15.2);
      c.bezierCurveTo(5, 10.8, 9, 8.8, 9.5, 3.5);
      c.bezierCurveTo(12.6, 5.6, 14.2, 8.3, 14, 11);
      c.bezierCurveTo(15, 10.2, 15.7, 9, 16, 7.8);
      c.bezierCurveTo(18, 9.8, 19, 12.4, 19, 15.2);
      c.bezierCurveTo(19, 18.8, 16.4, 21.5, 12, 21.5);
      c.closePath();
    },
  },
  list: {
    stroke: (c) => {
      for (const y of [6, 12, 18]) {
        c.moveTo(9, y);
        c.lineTo(20, y);
      }
    },
    fill: (c) => {
      for (const y of [6, 12, 18]) circ(c, 4.5, y, 1.5);
    },
  },
  compass: {
    stroke: (c) => {
      circ(c, 12, 12, 8.8);
      poly(c, [15.6, 8.4, 13.6, 13.6, 8.4, 15.6, 10.4, 10.4], true);
    },
  },
  share: {
    stroke: (c) => {
      poly(c, [8.5, 9, 6, 9, 6, 20.5, 18, 20.5, 18, 9, 15.5, 9]);
      c.moveTo(12, 14);
      c.lineTo(12, 3.5);
      poly(c, [8.5, 7, 12, 3.5, 15.5, 7]);
    },
  },
  moon: { stroke: crescent },
  music: {
    stroke: (c) => {
      circ(c, 7, 17.5, 2.8);
      circ(c, 17, 15.5, 2.8);
      poly(c, [9.8, 17.5, 9.8, 5.5, 19.8, 3.5, 19.8, 15.5]);
    },
  },
  image: {
    stroke: (c) => {
      rrect(c, 3, 4, 18, 16, 3);
      circ(c, 8.5, 9.5, 1.8);
      poly(c, [3.5, 17.5, 9, 12.5, 13, 16, 16, 13, 20.5, 17]);
    },
  },
  folder: {
    stroke: (c) => {
      c.moveTo(3.5, 7);
      c.arcTo(3.5, 5, 5.5, 5, 2);
      c.lineTo(9.5, 5);
      c.lineTo(11.5, 7.5);
      c.lineTo(18.5, 7.5);
      c.arcTo(20.5, 7.5, 20.5, 9.5, 2);
      c.lineTo(20.5, 18);
      c.arcTo(20.5, 20, 18.5, 20, 2);
      c.lineTo(5.5, 20);
      c.arcTo(3.5, 20, 3.5, 18, 2);
      c.closePath();
    },
  },
  inbox: {
    stroke: (c) => {
      poly(c, [3.5, 13, 6.5, 5, 17.5, 5, 20.5, 13, 20.5, 19.5, 3.5, 19.5], true);
      poly(c, [3.5, 13, 8.5, 13, 10, 15.5, 14, 15.5, 15.5, 13, 20.5, 13]);
    },
  },
  layers: {
    stroke: (c) => {
      poly(c, [12, 3.5, 21, 8.2, 12, 13, 3, 8.2], true);
      poly(c, [3, 12.3, 12, 17, 21, 12.3]);
      poly(c, [3, 16.3, 12, 21, 21, 16.3]);
    },
  },
  activity: { stroke: (c) => poly(c, [3, 12, 7, 12, 10, 4.5, 14, 19.5, 17, 12, 21, 12]) },
  leaf: {
    stroke: (c) => {
      c.moveTo(5, 19);
      c.bezierCurveTo(5, 10, 10, 5, 20, 4);
      c.bezierCurveTo(19, 14, 14, 19, 5, 19);
      c.closePath();
      c.moveTo(5, 19);
      c.lineTo(12.5, 11.5);
    },
  },
  map: {
    stroke: (c) => {
      poly(c, [3.5, 6, 9, 4, 15, 6, 20.5, 4, 20.5, 18, 15, 20, 9, 18, 3.5, 20], true);
      c.moveTo(9, 4);
      c.lineTo(9, 18);
      c.moveTo(15, 6);
      c.lineTo(15, 20);
    },
  },
  close: {
    stroke: (c) => {
      c.moveTo(6, 6);
      c.lineTo(18, 18);
      c.moveTo(18, 6);
      c.lineTo(6, 18);
    },
  },
  menu: {
    stroke: (c) => {
      c.moveTo(4, 7);
      c.lineTo(20, 7);
      c.moveTo(4, 12);
      c.lineTo(20, 12);
      c.moveTo(4, 17);
      c.lineTo(14, 17);
    },
  },
  edit: {
    stroke: (c) => {
      poly(c, [4, 20, 4.6, 16.4, 16, 5, 19, 8, 7.6, 19.4], true);
      c.moveTo(13.5, 7.5);
      c.lineTo(16.5, 10.5);
    },
  },
  sparkle: {
    fill: (c) => {
      c.moveTo(12, 3);
      c.quadraticCurveTo(12.8, 11.2, 21, 12);
      c.quadraticCurveTo(12.8, 12.8, 12, 21);
      c.quadraticCurveTo(11.2, 12.8, 3, 12);
      c.quadraticCurveTo(11.2, 11.2, 12, 3);
      c.closePath();
    },
  },
  wave: {
    stroke: (c) => {
      const hs = [4, 9, 14, 7, 11, 5];
      hs.forEach((h, i) => {
        const x = 4 + i * 3.2;
        c.moveTo(x, 12 - h / 2);
        c.lineTo(x, 12 + h / 2);
      });
    },
  },
  drop: {
    stroke: (c) => {
      c.moveTo(12, 3.5);
      c.bezierCurveTo(12, 3.5, 5.5, 10.5, 5.5, 14.5);
      c.arc(12, 14.5, 6.5, Math.PI, 0, true);
      c.bezierCurveTo(18.5, 10.5, 12, 3.5, 12, 3.5);
      c.closePath();
    },
  },
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/**
 * Draws an icon centred at (cx, cy), `size` points wide. `filled` paints
 * outline icons solid (selected tab, liked heart).
 */
export function icon(ctx: Ctx2D, name: IconName, cx: number, cy: number, size: number, color: string | CanvasGradient, filled = false, weight = 2): void {
  const def = ICONS[name];
  if (!def || !(size > 0)) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = weight;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (def.fill) {
    ctx.beginPath();
    def.fill(ctx);
    ctx.fill();
  }
  if (def.stroke) {
    ctx.beginPath();
    def.stroke(ctx);
    if (filled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

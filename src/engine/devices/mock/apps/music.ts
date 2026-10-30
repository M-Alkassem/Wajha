/** Music player: large cover art on a colour-matched backdrop, waveform scrubber, transport controls. */
import { darken, lighten, mix, rgba, rotateHue } from '../../../color';
import { albumArt } from '../art';
import { icon } from '../icons';
import type { Mk } from '../kit';
import { bar, body, box, card, circle, linear, num, paragraph, radial, shadowed, title } from '../kit';
import type { MockApp } from '../widgets';
import { sectionHeader } from '../widgets';

/** Colour the backdrop takes from the cover. */
function coverTone(m: Mk): string {
  return rotateHue(m.t.accents[0], ((m.seed * 37) % 60) - 30);
}

function waveform(m: Mk, x: number, cy: number, w: number, played: number, color: string, rest: string): void {
  const n = Math.max(12, Math.floor(w / 6));
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const v = 0.18 + 0.82 * Math.abs(Math.sin(i * 0.9 + m.seed) * 0.6 + Math.sin(i * 0.31) * 0.4);
    const h = 4 + v * 26;
    box(m, x + i * step, cy - h / 2, step * 0.55, h, step * 0.27, i / n < played ? color : rest);
  }
}

function controls(m: Mk, cx: number, cy: number, w: number, ink: string): void {
  const t = m.t;
  const ctx = m.ctx;
  const sp = Math.min(w / 4.6, 82);
  icon(ctx, 'shuffle', cx - sp * 2, cy, 22, rgba(ink, 0.55), false, 2);
  icon(ctx, 'prev', cx - sp, cy, 32, ink, false, 1.6);
  shadowed(m, 24, 10, rgba(t.accent, 0.4), () => circle(m, cx, cy, 37, t.accent));
  icon(ctx, 'pause', cx, cy, 30, t.onAccent, false);
  icon(ctx, 'next', cx + sp, cy, 32, ink, false, 1.6);
  icon(ctx, 'repeat', cx + sp * 2, cy, 22, t.accent, false, 2);
}

export const music: MockApp = {
  id: 'music',
  nav: ['home', 'search', 'music', 'list', 'heart', 'settings'],
  glyph: 'music',
  tabs: null,
  tabSelected: 0,
  backdrop(m, W, H) {
    const t = m.t;
    const c = coverTone(m);
    const ctx = m.ctx;
    ctx.fillStyle = linear(m, 0, 0, 0, H, t.dark
      ? [
          [0, darken(c, 0.45)],
          [0.55, mix(darken(c, 0.7), t.bg, 0.4)],
          [1, t.bg],
        ]
      : [
          [0, lighten(c, 0.72)],
          [0.6, lighten(c, 0.9)],
          [1, t.bg],
        ]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(m, W * 0.8, H * 0.1, W * 0.9, [
      [0, rgba(rotateHue(c, 40), t.dark ? 0.35 : 0.28)],
      [1, rgba(c, 0)],
    ]);
    ctx.fillRect(0, 0, W, H);
  },
  ink: (m) => (m.t.dark ? '#ffffff' : m.t.text),
  narrow(m, a) {
    const t = m.t;
    const ink = t.dark ? '#ffffff' : t.text;
    const M = 26;
    const x = a.x + M;
    const w = a.w - 2 * M;
    let y = a.y + 8;
    icon(m.ctx, 'chevronDown', x + 10, y + 18, 26, ink, false, 2.4);
    bar(m, a.x + a.w / 2 - 34, y + 6, 68, 5, rgba(ink, 0.45));
    bar(m, a.x + a.w / 2 - 54, y + 20, 108, 8, rgba(ink, 0.85));
    icon(m.ctx, 'more', x + w - 10, y + 18, 24, ink, false);
    y += 58;
    const s = Math.min(w, a.h * 0.46);
    const ax = a.x + (a.w - s) / 2;
    shadowed(m, 46, 22, rgba(darken(coverTone(m), 0.4), 0.45), () => box(m, ax, y, s, s, 24, coverTone(m)));
    albumArt(m, ax, y, s, 24, m.seed + 2);
    y += s + 30;
    bar(m, x, y + 4, w * 0.56, 13, ink);
    bar(m, x, y + 30, w * 0.36, 8, rgba(ink, 0.5));
    icon(m.ctx, 'heart', x + w - 14, y + 18, 26, t.accent, true, 2);
    y += 66;
    waveform(m, x, y + 14, w, 0.38, ink, rgba(ink, 0.22));
    num(m, '1:24', x, y + 48, 12.5, 600, rgba(ink, 0.6));
    num(m, '-2:31', x + w, y + 48, 12.5, 600, rgba(ink, 0.6), 'right');
    y += 98;
    controls(m, a.x + a.w / 2, y, w, ink);
    y += 70;
    icon(m.ctx, 'phone', x + 10, y, 20, rgba(ink, 0.55), false, 2);
    icon(m.ctx, 'share', a.x + a.w / 2, y, 20, rgba(ink, 0.55), false, 2);
    icon(m.ctx, 'list', x + w - 10, y, 20, rgba(ink, 0.55), false, 2);
    y += 34;
    if (y < a.y + a.h - 60) {
      const lh = Math.max(120, a.y + a.h - y + 40);
      box(m, x - 8, y, w + 16, lh, 26, t.dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.6)');
      bar(m, x + 12, y + 22, 70, 8, rgba(ink, 0.8));
      paragraph(m, x + 12, y + 50, w - 24, Math.max(1, Math.min(6, Math.floor((lh - 60) / 30))), 18, rgba(ink, 0.32));
    }
  },
  wide(m, a) {
    const t = m.t;
    const c = coverTone(m);
    const heroH = Math.min(240, a.h * 0.36);
    card(m, a.x, a.y, a.w, heroH, 26, linear(m, a.x, a.y, a.x + a.w, a.y + heroH, [
      [0, darken(c, 0.25)],
      [1, rotateHue(c, 50)],
    ]), 1);
    bar(m, a.x + 32, a.y + 38, 80, 7, 'rgba(255, 255, 255, 0.7)');
    bar(m, a.x + 32, a.y + 62, Math.min(320, a.w * 0.34), 22, '#ffffff');
    bar(m, a.x + 32, a.y + 98, Math.min(240, a.w * 0.26), 8, 'rgba(255, 255, 255, 0.7)');
    box(m, a.x + 32, a.y + heroH - 70, 128, 42, 21, '#ffffff');
    icon(m.ctx, 'play', a.x + 58, a.y + heroH - 49, 16, c, false, 1.6);
    bar(m, a.x + 76, a.y + heroH - 52, 58, 6, darken(c, 0.2));
    const as = heroH - 48;
    albumArt(m, a.x + a.w - as - 24, a.y + 24, as, 18, m.seed + 5);
    albumArt(m, a.x + a.w - as * 1.7 - 40, a.y + 24 + as * 0.15, as * 0.7, 16, m.seed + 6);

    let y = a.y + heroH + 26;
    sectionHeader(m, a.x, y, a.w, 150);
    y += 40;
    const cols = a.w > 900 ? 6 : 5;
    const gap = 18;
    const cw = (a.w - gap * (cols - 1)) / cols;
    for (let row = 0; y + cw * 0.5 < a.y + a.h - 70; row++) {
      for (let i = 0; i < cols; i++) {
        const cx = a.x + i * (cw + gap);
        albumArt(m, cx, y, cw, 16, m.seed + row * cols + i + 9);
        title(m, cx, y + cw + 10, cw * 0.7, 14);
        body(m, cx, y + cw + 30, cw * 0.48, 12);
      }
      y += cw + 64;
    }
    // Now playing bar.
    const py = a.y + a.h - 64;
    card(m, a.x, py, a.w, 76, 22, t.dark ? t.surface2 : t.surface, 1.2);
    albumArt(m, a.x + 12, py + 10, 56, 12, m.seed + 2);
    title(m, a.x + 82, py + 16, 120, 15);
    body(m, a.x + 82, py + 38, 80, 12);
    const ccx = a.x + a.w / 2;
    icon(m.ctx, 'prev', ccx - 54, py + 32, 22, t.text, false, 1.6);
    circle(m, ccx, py + 32, 22, t.accent);
    icon(m.ctx, 'pause', ccx, py + 32, 18, t.onAccent, false);
    icon(m.ctx, 'next', ccx + 54, py + 32, 22, t.text, false, 1.6);
    const wx = ccx + 100;
    const ww = Math.max(0, a.x + a.w - 40 - wx);
    if (ww > 60) waveform(m, wx, py + 32, ww, 0.42, t.accent, t.bar3);
  },
};

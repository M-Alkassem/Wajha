/**
 * Visual QA contact sheets for device frames and mock screens. Skipped in
 * normal runs; render with: WAJHA_QA=1 npx vitest run src/engine/devices/qa.test.ts
 * Output goes to .qa/devices/ (git-ignored).
 */
import { describe, it } from 'vitest';
import type { DeviceElement, DeviceFrameId, FamilyId, FrameFinish, FrameStyle } from '../../model/types';
import type { Ctx2D, ImageLike } from '../types';
import { nodeEnv, registerBundledFonts, saveQa, testCanvas } from '../testing/canvas.node';
import { drawMockScreen, MOCK_ARCHETYPES } from '../mock';
import { drawDevice } from './index';

const QA = !!process.env.WAJHA_QA;

const FRAMES: DeviceFrameId[] = ['iphone', 'android-phone', 'ipad', 'android-tablet', 'macbook', 'browser', 'none'];
const ASPECT: Record<DeviceFrameId, number> = {
  iphone: 2868 / 1320,
  'android-phone': 2400 / 1080,
  ipad: 2752 / 2064,
  'android-tablet': 2560 / 1600,
  macbook: 1800 / 2880,
  browser: 1800 / 2880,
  none: 2868 / 1320,
};
/** Device width relative to a phone so every frame fills a similar cell. */
const REL_WIDTH: Record<DeviceFrameId, number> = { iphone: 0.6, 'android-phone': 0.6, ipad: 0.8, 'android-tablet': 0.76, macbook: 0.96, browser: 0.94, none: 0.56 };

const PALETTES: string[][] = [
  ['#6c5ce7', '#ff7a59', '#00b894'],
  ['#ff4d6d', '#ffb703', '#3a86ff'],
  ['#0f766e', '#f59e0b'],
  [],
];

function element(frame: DeviceFrameId, style: FrameStyle, shadow = true): DeviceElement {
  return {
    id: 'd',
    kind: 'device',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    frame,
    style,
    width: 0.8,
    slot: 'main',
    cornerRadius: 0.08,
    shadow: shadow ? { color: '#0b0d1a55', blur: 0.05, x: 0, y: 0.022 } : null,
  };
}

/** A synthetic "screenshot": gradient, cards, and bright corner markers so cover-fit and clipping are visible. */
function synthetic(w: number, h: number): ImageLike {
  const { canvas, ctx } = testCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ff7a59');
  g.addColorStop(1, '#6c5ce7');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    ctx.beginPath();
    ctx.roundRect(w * 0.06, h * (0.3 + i * 0.11), w * 0.88, h * 0.085, Math.min(w, h) * 0.03);
    ctx.fill();
  }
  ctx.fillStyle = '#00e0a0';
  const k = Math.min(w, h) * 0.16;
  ctx.fillRect(0, 0, k, k);
  ctx.fillRect(w - k, h - k, k, k);
  return canvas;
}

function background(ctx: Ctx2D, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function drawAt(ctx: Ctx2D, el: DeviceElement, cx: number, cy: number, widthPx: number, unit: number, screen: ImageLike | null, seed: number, dark: boolean, palette: string[], rotation = 0): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  drawDevice(ctx, {
    el,
    widthPx,
    unit,
    screenAspect: ASPECT[el.frame],
    screen,
    placeholder: 'mock',
    mock: { seed, palette, dark },
    env: nodeEnv,
  });
  ctx.restore();
}

function mockSheet(name: string, family: FamilyId | undefined, cw: number, ch: number, scale: number): void {
  const n = MOCK_ARCHETYPES.length;
  const gap = 24;
  const w = Math.round(cw * scale);
  const h = Math.round(ch * scale);
  const { canvas, ctx } = testCanvas((w + gap) * n + gap, (h + gap) * 2 + gap);
  background(ctx, (w + gap) * n + gap, (h + gap) * 2 + gap, '#d4d5dc');
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(gap + i * (w + gap), gap + r * (h + gap));
      drawMockScreen(ctx, w, h, { seed: i, palette: PALETTES[(i + r) % 3], dark: r === 1, family });
      ctx.restore();
    }
  }
  saveQa(canvas, `devices/${name}.png`);
}

describe.skipIf(!QA)('visual QA', () => {
  registerBundledFonts();

  it('every frame in every finish, mock and screenshot', () => {
    const finishes: FrameFinish[] = ['metal', 'matte', 'clay'];
    const colors: Record<FrameFinish, string[]> = {
      metal: ['#2b2b30', '#d9d9de', '#b7aea3', '#2f4b6e', '#c8a27a', '#111114', '#f5f5f7'],
      matte: ['#f5f5f7', '#111114', '#2f4b6e', '#cfe3ff', '#c8a27a', '#2b2b30', '#d9d9de'],
      clay: ['#f6d5c8', '#cfe3ff', '#d9f2e3', '#f5f5f7', '#2b2b30', '#ffe7a3', '#e9d5ff'],
    };
    for (const finish of finishes) {
      const cellW = 420;
      const cellH = 640;
      const cols = FRAMES.length;
      const { canvas, ctx } = testCanvas(cellW * cols, cellH * 2);
      background(ctx, cellW * cols, cellH * 2, '#ececf1');
      ctx.fillStyle = '#cfd0d8';
      ctx.fillRect(0, cellH, cellW * cols, cellH);
      FRAMES.forEach((frame, i) => {
        for (let r = 0; r < 2; r++) {
          const color = colors[finish][(i + r * 3) % colors[finish].length];
          const bezel = finish === 'clay' ? 'match' : 'black';
          const el = element(frame, { color, finish, bezel });
          const shot = r === 1 ? synthetic(600, Math.round(600 * ASPECT[frame])) : null;
          drawAt(ctx, el, cellW * (i + 0.5), cellH * (r + 0.5), cellW * REL_WIDTH[frame], 640, shot, i + r * 3, r === 0 && i % 2 === 1, PALETTES[i % 4]);
        }
      });
      saveQa(canvas, `devices/frames-${finish}.png`);
    }
  });

  it('large frame details', () => {
    const { canvas, ctx } = testCanvas(2400, 1500);
    background(ctx, 2400, 1500, '#ececf1');
    drawAt(ctx, element('iphone', { color: '#b7aea3', finish: 'metal', bezel: 'black' }), 330, 760, 560, 1500, null, 0, false, PALETTES[0]);
    drawAt(ctx, element('android-phone', { color: '#2b2b30', finish: 'metal', bezel: 'black' }), 950, 760, 540, 1500, null, 1, true, PALETTES[1]);
    drawAt(ctx, element('ipad', { color: '#d9d9de', finish: 'metal', bezel: 'black' }), 1780, 760, 1000, 1500, null, 2, false, PALETTES[2]);
    saveQa(canvas, 'devices/large-phones.png');

    const mac = testCanvas(2400, 1500);
    background(mac.ctx, 2400, 1500, '#e6e7ec');
    drawAt(mac.ctx, element('macbook', { color: '#d9d9de', finish: 'metal', bezel: 'black' }), 1200, 740, 1900, 1500, null, 4, false, PALETTES[0]);
    saveQa(mac.canvas, 'devices/large-macbook.png');

    const big = testCanvas(2400, 1500);
    background(big.ctx, 2400, 1500, '#e6e7ec');
    drawAt(big.ctx, element('browser', { color: '#f5f5f7', finish: 'metal', bezel: 'black' }), 760, 520, 1300, 1500, null, 6, false, PALETTES[1]);
    drawAt(big.ctx, element('browser', { color: '#2b2b30', finish: 'matte', bezel: 'black' }), 760, 1150, 1300, 1500, null, 8, true, PALETTES[2]);
    drawAt(big.ctx, element('android-tablet', { color: '#2f4b6e', finish: 'matte', bezel: 'black' }), 1900, 760, 760, 1500, null, 7, true, PALETTES[2], -6);
    saveQa(big.canvas, 'devices/large-wide.png');
  });

  it('close-ups of hardware details', () => {
    const { canvas, ctx } = testCanvas(2600, 1300);
    background(ctx, 2600, 1300, '#ececf1');
    // Top halves of huge phones: band profile, buttons, island, punch hole.
    drawAt(ctx, element('iphone', { color: '#b7aea3', finish: 'metal', bezel: 'black' }), 620, 1250, 1100, 1300, null, 0, false, PALETTES[0]);
    drawAt(ctx, element('android-phone', { color: '#d9d9de', finish: 'metal', bezel: 'black' }), 1900, 1250, 1100, 1300, null, 3, true, PALETTES[1]);
    saveQa(canvas, 'devices/closeup-phones.png');
    const mac = testCanvas(1600, 900);
    background(mac.ctx, 1600, 900, '#e6e7ec');
    drawAt(mac.ctx, element('macbook', { color: '#2b2b30', finish: 'metal', bezel: 'black' }), 1550, -60, 3000, 900, null, 4, true, PALETTES[2]);
    drawAt(mac.ctx, element('macbook', { color: '#d9d9de', finish: 'metal', bezel: 'black' }), 1550 + 1400, -60 + 1000, 3000, 900, null, 4, false, PALETTES[2]);
    saveQa(mac.canvas, 'devices/closeup-macbook.png');
  });

  it('small sizes and extreme aspects', () => {
    const { canvas, ctx } = testCanvas(1400, 520);
    background(ctx, 1400, 520, '#ececf1');
    FRAMES.forEach((frame, i) => {
      const el = element(frame, { color: '#2b2b30', finish: 'metal', bezel: 'black' });
      drawAt(ctx, el, 60 + i * 110, 90, 70 * (REL_WIDTH[frame] / 0.6), 300, null, i, false, PALETTES[0]);
      drawAt(ctx, el, 40 + i * 50, 240, 30 * (REL_WIDTH[frame] / 0.6), 300, null, i, true, PALETTES[1]);
    });
    // Extreme aspects: very tall and very wide screens in a phone frame.
    ctx.save();
    ctx.translate(980, 260);
    drawDevice(ctx, { el: element('iphone', { color: '#d9d9de', finish: 'metal', bezel: 'black' }), widthPx: 110, unit: 500, screenAspect: 4, screen: null, placeholder: 'mock', mock: { seed: 3, palette: [], dark: false }, env: nodeEnv });
    ctx.restore();
    ctx.save();
    ctx.translate(1230, 260);
    drawDevice(ctx, { el: element('android-phone', { color: '#c8a27a', finish: 'metal', bezel: 'black' }), widthPx: 300, unit: 500, screenAspect: 0.3, screen: null, placeholder: 'mock', mock: { seed: 5, palette: [], dark: true }, env: nodeEnv });
    ctx.restore();
    ctx.save();
    ctx.translate(1230, 420);
    drawDevice(ctx, { el: element('macbook', { color: '#2b2b30', finish: 'matte', bezel: 'black' }), widthPx: 300, unit: 500, screenAspect: 0.3, screen: null, placeholder: 'empty', mock: { seed: 5, palette: [], dark: true }, env: nodeEnv });
    ctx.restore();
    saveQa(canvas, 'devices/small-and-extreme.png');
  });

  it('colour sweep: every recommended body colour and some vivid ones', () => {
    const colors = ['#2b2b30', '#d9d9de', '#b7aea3', '#2f4b6e', '#c8a27a', '#f5f5f7', '#111114', '#f6d5c8', '#cfe3ff', '#ff3b30', '#34c759', '#7c3aed'];
    const finishes: FrameFinish[] = ['metal', 'matte', 'clay'];
    const cw = 200;
    const ch = 380;
    const { canvas, ctx } = testCanvas(cw * colors.length, ch * finishes.length);
    background(ctx, cw * colors.length, ch * finishes.length, '#f1f1f4');
    finishes.forEach((finish, r) => {
      colors.forEach((color, i) => {
        const el = element('iphone', { color, finish, bezel: finish === 'clay' ? 'match' : 'black' });
        drawAt(ctx, el, cw * (i + 0.5), ch * (r + 0.5), 150, 380, null, i, i % 2 === 0, PALETTES[i % 3]);
      });
    });
    saveQa(canvas, 'devices/colour-sweep.png');
  });

  it('template-like previews: small devices on gradient slides', () => {
    const sw = 300;
    const sh = 650;
    const n = 6;
    const { canvas, ctx } = testCanvas(sw * n + 20 * (n + 1), sh + 40);
    background(ctx, sw * n + 20 * (n + 1), sh + 40, '#1b1b20');
    const looks: { bg: [string, string]; style: FrameStyle; frame: DeviceFrameId; dark: boolean; rot: number }[] = [
      { bg: ['#6c5ce7', '#a29bfe'], style: { color: '#2b2b30', finish: 'metal', bezel: 'black' }, frame: 'iphone', dark: false, rot: 0 },
      { bg: ['#ff9a8b', '#ff6a88'], style: { color: '#f6d5c8', finish: 'clay', bezel: 'match' }, frame: 'iphone', dark: false, rot: -8 },
      { bg: ['#0f2027', '#2c5364'], style: { color: '#d9d9de', finish: 'metal', bezel: 'black' }, frame: 'android-phone', dark: true, rot: 0 },
      { bg: ['#f6d365', '#fda085'], style: { color: '#f5f5f7', finish: 'matte', bezel: 'black' }, frame: 'iphone', dark: false, rot: 6 },
      { bg: ['#11998e', '#38ef7d'], style: { color: '#111114', finish: 'metal', bezel: 'black' }, frame: 'iphone', dark: true, rot: 0 },
      { bg: ['#e0e7ff', '#f5f3ff'], style: { color: '#cfe3ff', finish: 'clay', bezel: 'match' }, frame: 'android-phone', dark: false, rot: 0 },
    ];
    looks.forEach((look, i) => {
      const x = 20 + i * (sw + 20);
      ctx.save();
      ctx.translate(x, 20);
      const g = ctx.createLinearGradient(0, 0, sw, sh);
      g.addColorStop(0, look.bg[0]);
      g.addColorStop(1, look.bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sw, sh);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.roundRect(sw * 0.12, 36, sw * 0.76, 22, 11);
      ctx.roundRect(sw * 0.2, 70, sw * 0.6, 22, 11);
      ctx.fill();
      ctx.translate(sw / 2, sh * 0.6);
      ctx.rotate((look.rot * Math.PI) / 180);
      drawDevice(ctx, {
        el: element(look.frame, look.style),
        widthPx: sw * 0.74,
        unit: sw,
        screenAspect: ASPECT[look.frame],
        screen: null,
        placeholder: 'mock',
        mock: { seed: i, palette: [look.bg[0], look.bg[1]], dark: look.dark },
        env: nodeEnv,
      });
      ctx.restore();
    });
    saveQa(canvas, 'devices/template-previews.png');
  });

  it('browser and bare frames with tall pages', () => {
    const { canvas, ctx } = testCanvas(900, 760);
    background(ctx, 900, 760, '#ececf1');
    ctx.save();
    ctx.translate(230, 380);
    drawDevice(ctx, { el: element('browser', { color: '#f5f5f7', finish: 'metal', bezel: 'black' }), widthPx: 330, unit: 760, screenAspect: 2, screen: null, placeholder: 'mock', mock: { seed: 2, palette: PALETTES[0], dark: false }, env: nodeEnv });
    ctx.restore();
    ctx.save();
    ctx.translate(660, 380);
    drawDevice(ctx, { el: element('none', { color: '#000000', finish: 'metal', bezel: 'black' }), widthPx: 320, unit: 760, screenAspect: 2.1, screen: null, placeholder: 'mock', mock: { seed: 5, palette: PALETTES[1], dark: true }, env: nodeEnv });
    ctx.restore();
    saveQa(canvas, 'devices/browser-bare-tall.png');
  });

  it('mock screens: phone, android, tablet, desktop, light and dark', () => {
    mockSheet('mocks-iphone', 'iphone', 390, 847, 1);
    mockSheet('mocks-android', 'android-phone', 390, 867, 1);
    mockSheet('mocks-ipad', 'ipad', 820, 1093, 0.55);
    mockSheet('mocks-mac', 'mac', 1280, 800, 0.5);
  });
});

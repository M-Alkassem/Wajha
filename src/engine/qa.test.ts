/**
 * Visual QA: renders contact sheets of the engine's fills, patterns, shapes,
 * text and full slides to .qa/engine-core/*.png (git-ignored) for review.
 * Devices use the real painter when it works and a stand-in otherwise, so
 * these sheets are independent of the devices package.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./devices', async (importOriginal) => {
  const fake = await import('./testing/fakeDevices');
  const real = await importOriginal<typeof import('./devices')>();
  return {
    deviceGeometry: (...args: Parameters<typeof real.deviceGeometry>) => {
      try {
        return real.deviceGeometry(...args);
      } catch {
        return fake.fakeDeviceGeometry(...args);
      }
    },
    drawDevice: (...args: Parameters<typeof real.drawDevice>) => {
      const [ctx, opts] = args;
      ctx.save();
      try {
        return real.drawDevice(...args);
      } catch {
        return fake.qaDrawDevice(ctx, opts);
      } finally {
        ctx.restore();
      }
    },
  };
});

import { renderSlide } from './render';
import type { Background, Fill, Pattern, Slide, SlideElement, TextStyle, Theme } from '../model/types';
import type { Ctx2D, ImageLike, RenderInput } from './types';
import { background, deviceEl, imageEl, renderInput, shapeEl, slide, textEl, theme } from './testing/fixtures';
import { nodeEnv, registerPrimaryFonts, saveQa, testCanvas } from './testing/canvas.node';

registerPrimaryFonts();

const PHOTO = `${'f'.repeat(64)}.jpg`;
const SHOT = `${'9'.repeat(64)}.png`;

/** A recognisable landscape: sky gradient, sun, hills; stands in for user photos. */
function makePhoto(): ImageLike {
  const { canvas, ctx } = testCanvas(600, 400);
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#1e3a8a');
  sky.addColorStop(0.55, '#f472b6');
  sky.addColorStop(1, '#fdba74');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(420, 230, 60, 0, Math.PI * 2);
  ctx.fill();
  const hills: [string, number][] = [
    ['#7c2d12', 290],
    ['#431407', 330],
  ];
  for (const [color, base] of hills) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 400);
    for (let x = 0; x <= 600; x += 20) ctx.lineTo(x, base + Math.sin(x / 70 + base) * 25);
    ctx.lineTo(600, 400);
    ctx.fill();
  }
  return canvas;
}

/** A fake app screenshot (cards on a light background). */
function makeShot(): ImageLike {
  const { canvas, ctx } = testCanvas(390, 844);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 390, 844);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 30px "Inter Variable"';
  ctx.fillText('Today', 24, 110);
  const colors = ['#8b5cf6', '#f97316', '#10b981', '#0ea5e9'];
  colors.forEach((c, i) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(20, 150 + i * 150, 350, 130, 22);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(40, 172 + i * 150, 86, 86, 20);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(146, 190 + i * 150, 170, 14);
    ctx.fillRect(146, 220 + i * 150, 110, 12);
  });
  return canvas;
}

const images: Record<string, ImageLike> = { [PHOTO]: makePhoto(), [SHOT]: makeShot() };
const aspects: Record<string, number> = { [PHOTO]: 400 / 600, [SHOT]: 844 / 390 };

interface Cell {
  w: number;
  h: number;
  input: Partial<RenderInput> & { elements?: SlideElement[]; layoutBackground?: Background | null };
}

/** Renders cells left to right, wrapping into rows, onto one sheet. */
function sheet(name: string, cells: Cell[], columns: number, gap = 24): string {
  const cw = Math.max(...cells.map((c) => c.w));
  const ch = Math.max(...cells.map((c) => c.h));
  const rows = Math.ceil(cells.length / columns);
  const { canvas, ctx } = testCanvas(gap + columns * (cw + gap), gap + rows * (ch + gap));
  ctx.fillStyle = '#26262b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((cell, i) => {
    const x = gap + (i % columns) * (cw + gap);
    const y = gap + Math.floor(i / columns) * (ch + gap);
    ctx.save();
    ctx.translate(x, y);
    const result = renderSlide(ctx, renderInput({ env: nodeEnv, width: cell.w, height: cell.h, images, aspects, ...cell.input }));
    ctx.restore();
    expect(result.boxes.length).toBe((cell.input.elements ?? []).filter((e) => !e.hidden && e.opacity > 0).length);
  });
  return saveQa(canvas, `engine-core/${name}`);
}

const label = (text: string, color = '#ffffff'): { el: SlideElement; slide: Slide } => ({
  el: textEl({ key: 'label', y: 0.93, valign: 'bottom', width: 0.9, style: { size: 0.075, weight: 650, color, align: 'center' } }),
  slide: slide({ texts: { 'en-US': { label: text } } }),
});

function fillCell(name: string, fill: Fill, pattern: Pattern | null = null, ink = '#ffffff'): Cell {
  const l = label(name, ink);
  return { w: 270, h: 480, input: { theme: theme({ background: background(fill, pattern) }), slide: l.slide, elements: [l.el] } };
}

const aurora: Fill = {
  type: 'mesh',
  base: '#0b1026',
  points: [
    { x: 0.15, y: 0.15, color: '#7c3aed', radius: 0.55 },
    { x: 0.9, y: 0.3, color: '#db2777', radius: 0.45 },
    { x: 0.3, y: 0.85, color: '#0891b2', radius: 0.55 },
    { x: 0.85, y: 0.95, color: '#4f46e5', radius: 0.4 },
  ],
};
const pastel: Fill = {
  type: 'mesh',
  base: '#fdf2f8',
  points: [
    { x: 0.1, y: 0.2, color: '#fbcfe8', radius: 0.5 },
    { x: 0.9, y: 0.1, color: '#bfdbfe', radius: 0.5 },
    { x: 0.6, y: 0.9, color: '#ddd6fe', radius: 0.6 },
  ],
};
const sunset: Fill = { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#4c1d95' }, { offset: 0.55, color: '#db2777' }, { offset: 1, color: '#fb923c' }] };

describe('visual QA sheets', () => {
  it('fills', () => {
    const out = sheet(
      'fills',
      [
        fillCell('solid', { type: 'solid', color: '#0f766e' }),
        fillCell('linear 90°', { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff7e5f' }, { offset: 1, color: '#feb47b' }] }),
        fillCell('linear 160°', sunset),
        fillCell('fade to clear', { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#2563eb' }, { offset: 1, color: '#2563eb00' }] }, null, '#0f172a'),
        fillCell('radial', { type: 'radial', cx: 0.5, cy: 0.35, radius: 0.7, stops: [{ offset: 0, color: '#fef08a' }, { offset: 0.4, color: '#f97316' }, { offset: 1, color: '#7c2d12' }] }),
        fillCell('mesh aurora', aurora),
        fillCell('mesh pastel', pastel, null, '#1f2937'),
        fillCell('image cover', { type: 'image', assetId: PHOTO, fit: 'cover', opacity: 1, blur: 0, tint: null }),
        fillCell('image contain', { type: 'image', assetId: PHOTO, fit: 'contain', opacity: 1, blur: 0, tint: null }, null, '#111827'),
        fillCell('image tile', { type: 'image', assetId: PHOTO, fit: 'tile', opacity: 1, blur: 0, tint: null }),
        fillCell('blur + tint', { type: 'image', assetId: PHOTO, fit: 'cover', opacity: 1, blur: 0.06, tint: '#0f172a66' }),
        fillCell('missing image', { type: 'image', assetId: `${'0'.repeat(64)}.png`, fit: 'cover', opacity: 1, blur: 0, tint: null }, null, '#374151'),
      ],
      4,
    );
    expect(out).toContain('.qa');
  });

  it('patterns', () => {
    const p = (kind: Pattern['kind'], color: string, opacity: number, scale: number): Pattern => ({ kind, color, opacity, scale });
    sheet(
      'patterns',
      [
        fillCell('dots', { type: 'solid', color: '#1e1b4b' }, p('dots', '#a5b4fc', 0.5, 0.06)),
        fillCell('grid', { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#0f172a' }, { offset: 1, color: '#1e293b' }] }, p('grid', '#ffffff', 0.12, 0.1)),
        fillCell('diagonal', { type: 'solid', color: '#fef3c7' }, p('diagonal', '#d97706', 0.25, 0.05), '#78350f'),
        fillCell('noise', aurora, p('noise', '#ffffff', 0.1, 0.04)),
        fillCell('waves', sunset, p('waves', '#ffffff', 0.18, 0.08)),
        fillCell('rings', { type: 'radial', cx: 0.5, cy: 0.5, radius: 0.8, stops: [{ offset: 0, color: '#0e7490' }, { offset: 1, color: '#083344' }] }, p('rings', '#ffffff', 0.12, 0.09)),
      ],
      3,
    );
  });

  it('shapes', () => {
    const s = slide({ texts: { 'en-US': { label: 'shapes, glows, rotation' } } });
    const lin: Fill = { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#f472b6' }, { offset: 1, color: '#8b5cf6' }] };
    const elements: SlideElement[] = [
      shapeEl({ shape: 'blob', x: 0.25, y: 0.16, width: 0.5, height: 0.42, blur: 0.12, seed: 4, fill: { type: 'solid', color: '#ec4899' } }),
      shapeEl({ shape: 'circle', x: 0.78, y: 0.2, width: 0.45, height: 0.45, blur: 0.1, fill: lin }),
      shapeEl({ shape: 'circle', x: 0.22, y: 0.42, width: 0.3, height: 0.3, fill: { type: 'radial', cx: 0.35, cy: 0.3, radius: 0.7, stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#f59e0b' }] } }),
      shapeEl({ shape: 'rect', x: 0.72, y: 0.43, width: 0.42, height: 0.28, radius: 0.25, rotation: -12, fill: lin }),
      shapeEl({ shape: 'ring', x: 0.5, y: 0.62, width: 0.62, height: 0.62, stroke: 0.025, fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#22d3ee' }, { offset: 1, color: '#a78bfa' }] } }),
      shapeEl({ shape: 'blob', x: 0.5, y: 0.62, width: 0.4, height: 0.4, seed: 11, fill: aurora }),
      shapeEl({ shape: 'blob', x: 0.18, y: 0.82, width: 0.26, height: 0.2, seed: 2, rotation: 25, fill: { type: 'solid', color: '#34d399' } }),
      shapeEl({ shape: 'rect', x: 0.5, y: 0.83, width: 0.3, height: 0.12, radius: 0.5, opacity: 0.5, fill: { type: 'solid', color: '#ffffff' } }),
      shapeEl({ shape: 'ring', x: 0.82, y: 0.82, width: 0.22, height: 0.22, stroke: 0.04, blur: 0.03, fill: { type: 'solid', color: '#fbbf24' } }),
      textEl({ key: 'label', y: 0.95, valign: 'bottom', style: { size: 0.05, color: '#e5e7eb', weight: 500 } }),
    ];
    sheet('shapes', [{ w: 540, h: 960, input: { theme: theme({ background: background({ type: 'solid', color: '#111827' }) }), slide: s, elements } }], 1);
  });

  it('text', () => {
    const cell = (text: string, style: Partial<TextStyle>, o: { lang?: string; rtl?: boolean; fill?: Fill; w?: number; width?: number } = {}): Cell => {
      const lang = o.lang ?? 'en-US';
      return {
        // Taller than wide like a store canvas, so u = width and text boxes are realistic.
        w: o.w ?? 480,
        h: 560,
        input: {
          lang,
          baseLang: lang,
          rtl: o.rtl ?? false,
          slide: slide({ texts: { [lang]: { headline: text } } }),
          theme: theme({ background: background(o.fill ?? { type: 'solid', color: '#ffffff' }) }),
          elements: [textEl({ y: 0.5, valign: 'middle', width: o.width ?? 0.86, style: { size: 0.1, ...style } })],
        },
      };
    };
    const dark: Fill = { type: 'solid', color: '#0f172a' };
    sheet(
      'text',
      [
        cell('Track *every* habit,\nevery day', { weight: 800, color: '#0f172a', highlight: '#7c3aed', letterSpacing: -0.02, lineHeight: 1.05 }),
        cell('Plan your *perfect* week', { font: 'Bricolage Grotesque Variable', weight: 750, color: '#111827', highlight: '#fde047', highlightMode: 'marker' }),
        cell('new · habits 2.0', { size: 0.05, weight: 700, color: '#a5b4fc', transform: 'uppercase', letterSpacing: 0.25 }, { fill: dark }),
        cell('تتبع *عاداتك* اليومية بسهولة', { font: 'Cairo Variable', weight: 800, color: '#ffffff', highlight: '#f59e0b', highlightMode: 'marker', lineHeight: 1.3 }, { lang: 'ar-SA', rtl: true, fill: dark }),
        cell('Gesundheitsversicherung für die ganze Familie verwalten', { weight: 800, color: '#0f172a', size: 0.085, maxLines: 3, align: 'start' }),
        cell('毎日の習慣を簡単に記録しましょう。', { weight: 700, color: '#0f172a', size: 0.09 }, { lang: 'ja' }),
        cell('עקבו אחר *ההרגלים* שלכם', { font: 'Rubik Variable', weight: 700, color: '#0f172a', highlight: '#0ea5e9', align: 'start' }, { lang: 'he', rtl: true }),
        cell('اشترك في Wajha *Pro* الآن', { font: 'Readex Pro Variable', weight: 700, color: '#ffffff', highlight: '#22d3ee', highlightMode: 'marker' }, { lang: 'ar-SA', rtl: true, fill: dark }),
        cell('Golden *hour*', { font: 'Fraunces Variable', weight: 600, color: '#ffffff', highlight: '#fde68a', shadow: { color: '#00000099', blur: 0.03, x: 0, y: 0.008 } }, { fill: { type: 'image', assetId: PHOTO, fit: 'cover', opacity: 1, blur: 0, tint: null } }),
        cell('Elegant *serif* headline', { font: 'Playfair Display Variable', weight: 700, color: '#1c1917', highlight: '#b45309', align: 'end' }),
      ],
      4,
    );
  });

  it('blobs', () => {
    const cells: Cell[] = Array.from({ length: 12 }, (_, i) => {
      const seed = i + 1;
      const l = label(`seed ${seed}`, '#e5e7eb');
      return {
        w: 220,
        h: 260,
        input: {
          theme: theme({ background: background({ type: 'solid', color: '#111827' }) }),
          slide: l.slide,
          elements: [shapeEl({ shape: 'blob', y: 0.42, width: 0.7, height: 0.62, seed, fill: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#22d3ee' }, { offset: 1, color: '#a855f7' }] } }), l.el],
        },
      };
    });
    sheet('blobs', cells, 6);
  });

  function scene(t: Theme, texts: Record<string, string>, elements: SlideElement[], o: { lang?: string; rtl?: boolean; index?: number; count?: number } = {}): Cell {
    const lang = o.lang ?? 'en-US';
    return {
      w: 405,
      h: 880,
      input: {
        theme: t,
        lang,
        baseLang: lang,
        rtl: o.rtl ?? false,
        slideIndex: o.index ?? 0,
        slideCount: o.count ?? 1,
        slide: slide({ texts: { [lang]: texts }, shots: { iphone: { main: { [lang]: SHOT } } } }),
        elements,
      },
    };
  }

  it('slides', () => {
    const headline = (style: Partial<TextStyle>, y = 0.065) => textEl({ y, style: { size: 0.088, lineHeight: 1.08, maxLines: 2, ...style } });
    const subtitle = (style: Partial<TextStyle>, y = 0.19) => textEl({ key: 'subtitle', y, width: 0.8, style: { size: 0.042, weight: 450, lineHeight: 1.35, ...style } });
    const device = (o: Partial<Parameters<typeof deviceEl>[0]> = {}) => deviceEl({ y: 0.68, width: 0.74, ...o });
    sheet(
      'slides',
      [
        scene(
          theme({ background: background(aurora, { kind: 'noise', color: '#ffffff', opacity: 0.07, scale: 0.04 }), mockDark: true }),
          { headline: 'Track *every* habit', subtitle: 'Build streaks that last, one day at a time.' },
          [
            shapeEl({ shape: 'blob', x: 0.85, y: 0.45, width: 0.6, height: 0.5, blur: 0.12, seed: 9, fill: { type: 'solid', color: '#db277799' } }),
            headline({ color: '#ffffff', highlight: '#f0abfc', weight: 800 }),
            subtitle({ color: '#c7d2fe' }),
            device(),
          ],
        ),
        scene(
          theme({ background: background(sunset, { kind: 'waves', color: '#ffffff', opacity: 0.1, scale: 0.07 }) }),
          { headline: 'Plan your *perfect* week', subtitle: 'Everything in one calm calendar.' },
          [headline({ color: '#ffffff', highlight: '#fde047', highlightMode: 'marker', font: 'Bricolage Grotesque Variable', weight: 750 }), subtitle({ color: '#ffe4e6' }), device({ rotation: -6, x: 0.53 })],
        ),
        scene(
          theme({ background: background(pastel, { kind: 'dots', color: '#6d28d9', opacity: 0.12, scale: 0.05 }) }),
          { headline: 'تتبع *عاداتك* اليومية', subtitle: 'ابنِ سلاسل نجاح تدوم، يومًا بعد يوم.' },
          [headline({ color: '#1e1b4b', highlight: '#7c3aed', highlightMode: 'marker', font: 'Cairo Variable', weight: 800, lineHeight: 1.25 }), subtitle({ color: '#4c1d95', font: 'Cairo Variable' }), device()],
          { lang: 'ar-SA', rtl: true },
        ),
        scene(
          theme({ background: background({ type: 'image', assetId: PHOTO, fit: 'cover', opacity: 1, blur: 0.04, tint: '#0f172a55' }) }),
          { headline: 'Golden *hour*,\nevery day', subtitle: 'Photo backgrounds with blur and tint.' },
          [headline({ color: '#ffffff', highlight: '#fde68a', font: 'Fraunces Variable', weight: 650, shadow: { color: '#00000066', blur: 0.03, x: 0, y: 0.006 } }), subtitle({ color: '#f1f5f9' }, 0.23), device({ y: 0.72 })],
        ),
      ],
      4,
    );
  });

  it('panorama', () => {
    const t = theme({
      panorama: true,
      background: background(
        { type: 'mesh', base: '#0c0a24', points: [{ x: 0.2, y: 0.3, color: '#7c3aed', radius: 0.35 }, { x: 0.5, y: 0.7, color: '#db2777', radius: 0.3 }, { x: 0.85, y: 0.25, color: '#0891b2', radius: 0.35 }] },
        { kind: 'rings', color: '#ffffff', opacity: 0.08, scale: 0.08 },
      ),
      mockDark: true,
    });
    const elements = (i: number): SlideElement[] => [
      textEl({ y: 0.07, style: { color: '#ffffff', highlight: '#f0abfc', size: 0.085, weight: 800, maxLines: 2 } }),
      deviceEl({ y: 0.66, width: 0.72, rotation: i === 0 ? 4 : -4 }),
    ];
    const texts = [{ headline: 'One *continuous*\nbackground' }, { headline: 'Across *every*\nscreenshot' }, { headline: 'In the *store*\nlisting' }];
    sheet(
      'panorama',
      texts.map((tx, i) => scene(t, tx, elements(i), { index: i, count: 3 })),
      3,
      0,
    );
  });

  it('image elements and opacity', () => {
    const s = slide({ texts: { 'en-US': { headline: 'Images & shadows' } } });
    const elements: SlideElement[] = [
      imageEl({ assetId: PHOTO, x: 0.5, y: 0.32, width: 0.8, cornerRadius: 0.06, shadow: { color: '#0f172a59', blur: 0.06, x: 0, y: 0.025 } }),
      imageEl({ assetId: PHOTO, x: 0.3, y: 0.68, width: 0.42, cornerRadius: 0.5, rotation: -8, shadow: { color: '#00000040', blur: 0.04, x: 0, y: 0.015 } }),
      imageEl({ assetId: PHOTO, x: 0.72, y: 0.7, width: 0.4, cornerRadius: 0.1, opacity: 0.55 }),
      imageEl({ assetId: `${'1'.repeat(64)}.png`, x: 0.5, y: 0.9, width: 0.3, cornerRadius: 0.1 }),
      textEl({ y: 0.04, style: { size: 0.07, color: '#0f172a' } }),
    ];
    sheet('images', [{ w: 540, h: 960, input: { theme: theme({ background: background(pastel) }), slide: s, elements } }], 1);
  });

  it('times the reference scene', () => {
    const t = theme({ background: background(aurora, { kind: 'noise', color: '#ffffff', opacity: 0.06, scale: 0.04 }) });
    const texts = { headline: 'Track *every* habit', subtitle: 'Build streaks that last, one day at a time.' };
    const words = [textEl({ y: 0.06, style: { color: '#ffffff', size: 0.085, maxLines: 2 } }), textEl({ key: 'subtitle', y: 0.18, style: { color: '#c7d2fe', size: 0.042, weight: 400 } })];
    const frame = (elements: SlideElement[]): number => {
      const cell = scene(t, texts, elements);
      const { ctx } = testCanvas(720, 1564);
      const input = renderInput({ env: nodeEnv, images, aspects, ...cell.input, width: 720, height: 1564 });
      renderSlide(ctx as Ctx2D, input);
      ctx.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      for (let i = 0; i < 5; i++) {
        renderSlide(ctx, input);
        // @napi-rs/canvas records draw calls; reading a pixel forces the actual rasterisation.
        ctx.getImageData(0, 0, 1, 1);
      }
      return (performance.now() - t0) / 5;
    };
    const engine = frame(words);
    const full = frame([...words, deviceEl({ y: 0.66 })]);
    console.info(`[qa] 720x1564, Node CPU raster: mesh + noise + 2 texts ${engine.toFixed(1)} ms; with device + screenshot ${full.toFixed(1)} ms`);
    expect(engine).toBeLessThan(60);
    expect(full).toBeLessThan(250);
  });
});

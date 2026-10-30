/**
 * Renders gallery/templates/<id>/preview.jpg for every community template:
 * its first three slides side by side (iPhone, English sample copy) on a
 * 1200 x 860 card. Run it after adding or changing a template:
 *
 *   WAJHA_GALLERY=1 npx vitest run scripts/gallery-previews.test.ts
 *   WAJHA_GALLERY=1 WAJHA_GALLERY_ONLY=lagoon npx vitest run scripts/gallery-previews.test.ts
 *
 * Then run `npm run gallery:index` to refresh gallery/index.json.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testCanvas } from '../src/engine/testing/canvas.node';
import { validateTemplate } from '../src/model/validate';
import { projectFor, registerFonts, renderProjectSlide } from '../src/templates/testing/render.node';

const TEMPLATES = join(import.meta.dirname, '..', 'gallery', 'templates');
const only = (process.env.WAJHA_GALLERY_ONLY ?? '').split(',').filter(Boolean);

export const PREVIEW = { width: 1200, height: 860, slideWidth: 340, gap: 30, radius: 20, quality: 84 } as const;

const folders = existsSync(TEMPLATES)
  ? readdirSync(TEMPLATES).filter((d) => statSync(join(TEMPLATES, d)).isDirectory() && existsSync(join(TEMPLATES, d, 'template.json')) && (!only.length || only.includes(d)))
  : [];

describe.skipIf(process.env.WAJHA_GALLERY !== '1')('gallery previews', () => {
  registerFonts('latin');

  for (const id of folders) {
    it(`renders ${id}/preview.jpg`, () => {
      const template = validateTemplate(JSON.parse(readFileSync(join(TEMPLATES, id, 'template.json'), 'utf8')));
      const project = projectFor(template, ['iphone'], ['en-US']);
      const { canvas, ctx } = testCanvas(PREVIEW.width, PREVIEW.height);
      // A calm neutral card that suits light and dark galleries alike.
      const bg = ctx.createRadialGradient(PREVIEW.width / 2, PREVIEW.height * 0.35, 0, PREVIEW.width / 2, PREVIEW.height * 0.35, PREVIEW.width * 0.75);
      bg.addColorStop(0, '#26262c');
      bg.addColorStop(1, '#141417');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, PREVIEW.width, PREVIEW.height);

      const count = Math.min(3, project.slides.length);
      const total = count * PREVIEW.slideWidth + (count - 1) * PREVIEW.gap;
      for (let i = 0; i < count; i++) {
        const slide = renderProjectSlide(project, i, 'iphone', 'en-US', PREVIEW.slideWidth);
        const x = Math.round((PREVIEW.width - total) / 2 + i * (PREVIEW.slideWidth + PREVIEW.gap));
        const y = Math.round((PREVIEW.height - slide.height) / 2);
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 12;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(x, y, slide.width, slide.height, PREVIEW.radius);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, slide.width, slide.height, PREVIEW.radius);
        ctx.clip();
        ctx.drawImage(slide.canvas, x, y);
        ctx.restore();
      }
      const jpeg = (canvas as unknown as { toBuffer(mime: 'image/jpeg', quality: number): Buffer }).toBuffer('image/jpeg', PREVIEW.quality);
      const out = join(TEMPLATES, id, 'preview.jpg');
      writeFileSync(out, jpeg);
      expect(jpeg.byteLength).toBeLessThan(400 * 1024);
    });
  }
});

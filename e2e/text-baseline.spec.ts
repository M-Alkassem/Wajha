/**
 * Mixed-direction lines in WebKit, the engine of the desktop app. WebKit
 * draws the direction runs of one fillText call one after another and
 * carries the vertical offset of a run's first glyph (Arabic marks and dots)
 * over to the next run: drawn in one call, "iOS 18 جديد كلياً" puts "iOS 18"
 * a third of the font size above the baseline, on the stage and in exports.
 * The engine draws one direction per call (src/engine/text.ts). Node's
 * canvas has no such quirk, so only a real WebKit render catches a
 * regression: this draws lines with the engine and checks that no group of
 * glyphs floats above the baseline of a Latin reference line.
 */
import { expect, test } from './fixtures';
import type { TextStyle } from '../src/model/types.ts';

type TextModule = typeof import('../src/engine/text.ts');
type CatalogModule = typeof import('../src/model/catalog.ts');
const TEXT_URL = '/src/engine/text.ts';
const CATALOG_URL = '/src/model/catalog.ts';

/** Lines whose glyphs all reach down to the baseline (no hyphens, quotes, Hebrew yod or Persian zero). */
const LINES = [
  { text: 'iOS 18 جديد كلياً', font: 'Cairo Variable', lang: 'ar-SA', rtl: true },
  { text: 'iOS 18 جديد كلياً', font: 'Noto Sans Arabic Variable', lang: 'ar-SA', rtl: true },
  { text: 'السعر $9.99 شهرياً', font: 'Noto Sans Arabic Variable', lang: 'ar-SA', rtl: true },
  { text: 'النسخة *2.0* متاحة', font: 'Noto Sans Arabic Variable', lang: 'ar-SA', rtl: true },
  { text: 'Now in العربية too', font: 'Inter Variable', lang: 'en-US', rtl: false },
];

test('mixed-direction lines sit on one baseline', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(
    async ({ url, catalogUrl, lines }) => {
      const { drawTextBlock, layoutTextBlock } = (await import(/* @vite-ignore */ url)) as TextModule;
      const { FONT_FALLBACK_STACK } = (await import(/* @vite-ignore */ catalogUrl)) as CatalogModule;
      // The whole stack the engine draws with: characters a font lacks ("HIH" and "2.0" in Noto Sans Arabic)
      // come from the fallbacks, and a fallback still loading would draw them in yet another font.
      for (const line of lines) await document.fonts.load(`700 40px "${line.font}", ${FONT_FALLBACK_STACK}`, `${line.text}HIH`);
      await document.fonts.ready;
      const W = 900;
      const H = 120;
      const FONT_PX = 0.08 * 500;
      /** Draws one line with the engine; returns the lowest dark pixel of every group of inked columns. */
      const draw = (text: string, font: string, lang: string, rtl: boolean) => {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        const style: TextStyle = { font, weight: 700, size: 0.08, lineHeight: 1.2, letterSpacing: 0, color: '#000000', highlight: '#000000', highlightMode: 'color', align: 'center', transform: 'none', maxLines: 0, shadow: null };
        const layout = layoutTextBlock(ctx, { text, style, boxWidth: W - 20, unit: 500, rtl, lang });
        ctx.translate(W / 2, H / 2);
        drawTextBlock(ctx, layout, { unit: 500 });
        const d = ctx.getImageData(0, 0, W, H).data;
        const groups: { x: number; bottom: number }[] = [];
        let open = false;
        for (let x = 0; x < W; x++) {
          let bottom = -1;
          for (let y = 0; y < H; y++) if (d[(y * W + x) * 4] < 110) bottom = y;
          if (bottom < 0) open = false;
          else if (open) groups[groups.length - 1].bottom = Math.max(groups[groups.length - 1].bottom, bottom);
          else {
            groups.push({ x, bottom });
            open = true;
          }
        }
        return groups;
      };
      return lines.map((line) => {
        // Flat-bottomed capitals in the same font mark the baseline every line is placed on.
        const baseline = Math.max(...draw('HIH', line.font, line.lang, false).map((g) => g.bottom));
        const raised = draw(line.text, line.font, line.lang, line.rtl).filter((g) => g.bottom < baseline - 2);
        // The quirk lifts a whole run (every glyph of "iOS 18") by about a third of the font size. One glyph a
        // few pixels high is the rasteriser (WebKitGTK on Linux draws some fonts slightly differently), not a floating run.
        const floating = raised.length >= 2 || raised.some((g) => g.bottom < baseline - FONT_PX / 5);
        return { text: line.text, font: line.font, raised: floating ? raised : [] };
      });
    },
    { url: TEXT_URL, catalogUrl: CATALOG_URL, lines: LINES },
  );
  for (const r of results) expect(r.raised, `glyphs above the baseline in "${r.text}" (${r.font})`).toEqual([]);
});

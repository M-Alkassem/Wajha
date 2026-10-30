/**
 * Node-only helpers for engine tests and visual QA renders, on @napi-rs/canvas.
 * Never import this from app code.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Ctx2D, ImageLike, RenderEnv } from '../types';
import { BUNDLED_FONTS } from '../../model/catalog';

const ROOT = join(import.meta.dirname, '..', '..', '..');

export interface TestCanvas {
  canvas: ImageLike & { toBuffer(mime: 'image/png'): Buffer };
  ctx: Ctx2D;
}

/** A canvas whose context is typed as the DOM context the engine expects. */
export function testCanvas(width: number, height: number): TestCanvas {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D;
  return { canvas: canvas as unknown as TestCanvas['canvas'], ctx };
}

export const nodeEnv: RenderEnv = {
  createCanvas(width: number, height: number) {
    const { canvas, ctx } = testCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    return { canvas, ctx };
  },
};

/** Registers every bundled variable font (latin, latin-ext, arabic, hebrew, cyrillic subsets). */
/**
 * Registers every bundled variable font. @napi-rs/canvas only uses the first
 * file registered under a family name, so this delegates to
 * registerPrimaryFonts, which registers each family's main subset first
 * (latin, or arabic for Arabic-first fonts).
 */
export function registerBundledFonts(): void {
  registerPrimaryFonts();
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** Writes a PNG under <repo>/.qa/ (git-ignored) for visual inspection. Returns the absolute path. */
export function saveQa(canvas: TestCanvas['canvas'], name: string): string {
  const out = join(ROOT, '.qa', name.endsWith('.png') ? name : `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, canvas.toBuffer('image/png'));
  return out;
}

/** RGBA of one pixel. */
export function pixel(ctx: Ctx2D, x: number, y: number): [number, number, number, number] {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** A solid-colour test image, optionally with a contrasting marker square in the top-left corner. */
export function solidImage(width: number, height: number, color: string, marker?: string): ImageLike {
  const { canvas, ctx } = testCanvas(width, height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  if (marker) {
    ctx.fillStyle = marker;
    ctx.fillRect(0, 0, Math.round(width / 5), Math.round(width / 5));
  }
  return canvas;
}

let primaryFontsRegistered = false;

/**
 * Like registerBundledFonts, but in an order that makes each family render
 * its main script with its own glyphs. @napi-rs/canvas only looks glyphs up
 * in the first file registered under a family name (later files with the
 * same name are ignored), and registerBundledFonts goes alphabetically, so
 * Inter's cyrillic subset wins and Latin text falls back to a system serif.
 * Here the Arabic families (catalog category "arabic") register their arabic
 * subset first and every other family its latin subset first. Call it
 * before anything else registers fonts in the test process.
 */
export function registerPrimaryFonts(): void {
  if (primaryFontsRegistered) return;
  primaryFontsRegistered = true;
  const arabicFamilies = new Set(BUNDLED_FONTS.filter((f) => f.category === 'arabic').map((f) => f.family));
  const base = join(ROOT, 'node_modules', '@fontsource-variable');
  for (const pkg of readdirSync(base)) {
    const css = readFileSafe(join(base, pkg, 'index.css'));
    const family = /font-family:\s*'([^']+)'/.exec(css)?.[1];
    if (!family) continue;
    const filesDir = join(base, pkg, 'files');
    const order = arabicFamilies.has(family) ? ['arabic', 'latin', 'latin-ext', 'hebrew', 'cyrillic'] : ['latin', 'latin-ext', 'cyrillic', 'hebrew', 'arabic'];
    const files = readdirSync(filesDir)
      .map((file) => ({ file, subset: /-(latin-ext|latin|arabic|hebrew|cyrillic)-wght-normal\.woff2$/.exec(file)?.[1] }))
      .filter((f): f is { file: string; subset: string } => typeof f.subset === 'string')
      .sort((a, b) => order.indexOf(a.subset) - order.indexOf(b.subset));
    for (const { file } of files) GlobalFonts.registerFromPath(join(filesDir, file), family);
  }
}

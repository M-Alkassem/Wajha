/**
 * Node-only helpers that render templates on @napi-rs/canvas, for the
 * template tests and the visual QA contact sheets. Never import from app code.
 */
import { GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderSlide } from '../../engine';
import { nodeEnv, testCanvas, type TestCanvas } from '../../engine/testing/canvas.node';
import type { Ctx2D, RenderResult } from '../../engine/types';
import { FAMILIES, isRtl } from '../../model/catalog';
import { projectFromTemplate } from '../../model/instantiate';
import { resolveLayout } from '../../model/resolve';
import type { FamilyId, LangCode, Project, SlideLayout, Template } from '../../model/types';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * Which script the registered fonts favour. @napi-rs/canvas only uses the
 * first file registered under a family name (no unicode-range fallback inside
 * a family), so one process renders one script faithfully:
 *  - "latin": every family registers its latin subset first (English, German);
 *  - "arabic": families with Arabic glyphs (Cairo, Readex Pro, Noto Sans
 *    Arabic, Rubik) register their arabic subset first, like the browser
 *    would pick for Arabic text; the others fall back to Noto Sans Arabic.
 */
export type FontScript = 'latin' | 'arabic';

let registered: FontScript | null = null;

export function registerFonts(script: FontScript): void {
  if (registered === script) return;
  if (registered) throw new Error(`fonts already registered for ${registered}; use one script per test file`);
  registered = script;
  const base = join(REPO_ROOT, 'node_modules', '@fontsource-variable');
  for (const pkg of readdirSync(base)) {
    let css = '';
    try {
      css = readFileSync(join(base, pkg, 'index.css'), 'utf8');
    } catch {
      continue;
    }
    const family = /font-family:\s*'([^']+)'/.exec(css)?.[1];
    if (!family) continue;
    const dir = join(base, pkg, 'files');
    const files = readdirSync(dir)
      .map((file) => ({ file, subset: /-(latin-ext|latin|arabic|hebrew|cyrillic)-wght-normal\.woff2$/.exec(file)?.[1] }))
      .filter((f): f is { file: string; subset: string } => typeof f.subset === 'string');
    const hasArabic = files.some((f) => f.subset === 'arabic');
    const order = script === 'arabic' && hasArabic ? ['arabic', 'latin', 'latin-ext', 'hebrew', 'cyrillic'] : ['latin', 'latin-ext', 'cyrillic', 'hebrew', 'arabic'];
    files.sort((a, b) => order.indexOf(a.subset) - order.indexOf(b.subset));
    for (const { file } of files) GlobalFonts.registerFromPath(join(dir, file), family);
  }
}

/** A project from a template with the given families and languages (first language = base). */
export function projectFor(template: Template, families: FamilyId[], languages: LangCode[]): Project {
  return projectFromTemplate(template, { name: template.name, families, languages });
}

export interface RenderedSlide {
  canvas: TestCanvas['canvas'];
  ctx: Ctx2D;
  result: RenderResult;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Keep only some elements (e.g. drop texts to sample the background behind them). */
  filter?: (layout: SlideLayout) => SlideLayout;
}

/** Renders slide `index` of `project` for `family` / `lang` at `width` px (height from the family canvas). */
export function renderProjectSlide(project: Project, index: number, family: FamilyId, lang: LangCode, width: number, o: RenderOptions = {}): RenderedSlide {
  const design = FAMILIES[family].design;
  const height = Math.round((width * design.height) / design.width);
  const { canvas, ctx } = testCanvas(width, height);
  const slide = project.slides[index];
  const resolved = resolveLayout(project, slide, family);
  const layout = o.filter ? o.filter(resolved) : resolved;
  const result = renderSlide(ctx, {
    width,
    height,
    family,
    slide,
    layout,
    theme: project.theme,
    lang,
    baseLang: project.languages[0],
    rtl: isRtl(lang),
    slideIndex: index,
    slideCount: project.slides.length,
    getImage: () => null,
    getAssetAspect: () => null,
    placeholder: 'mock',
    env: nodeEnv,
  });
  return { canvas, ctx, result, width, height };
}

export interface SheetCell {
  image: RenderedSlide;
  label?: string;
}

/** Lays rendered slides out in rows of `columns` on a neutral backdrop. */
export function contactSheet(cells: SheetCell[], columns: number, gap = 16, labelHeight = 0): TestCanvas['canvas'] {
  const cw = Math.max(...cells.map((c) => c.image.width));
  const ch = Math.max(...cells.map((c) => c.image.height));
  const rows = Math.ceil(cells.length / columns);
  const { canvas, ctx } = testCanvas(gap + columns * (cw + gap), gap + rows * (ch + labelHeight + gap));
  ctx.fillStyle = '#1c1c21';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((cell, i) => {
    const x = gap + (i % columns) * (cw + gap);
    const y = gap + Math.floor(i / columns) * (ch + labelHeight + gap);
    ctx.drawImage(cell.image.canvas, x, y);
    if (cell.label && labelHeight > 0) {
      ctx.fillStyle = '#d8d8de';
      ctx.font = `600 ${Math.round(labelHeight * 0.48)}px "Inter Variable", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.label, x + 2, y + ch + labelHeight / 2 + 1);
    }
  });
  return canvas;
}

/** Writes a PNG (or JPEG when the name ends in .jpg) under <repo>/.qa/; returns the absolute path. */
export function saveSheet(canvas: TestCanvas['canvas'], name: string): string {
  const out = join(REPO_ROOT, '.qa', name);
  mkdirSync(dirname(out), { recursive: true });
  const encoder = canvas as unknown as { toBuffer(mime: string, quality?: number): Buffer };
  writeFileSync(out, name.endsWith('.jpg') ? encoder.toBuffer('image/jpeg', 88) : encoder.toBuffer('image/png'));
  return out;
}

/**
 * Glue between the engine and the browser: renders slides into on-screen
 * canvases with cached previews, renders export jobs at full resolution with
 * full-size images (loaded per job, released right after drawing), and
 * draws the home-screen thumbnail.
 */
import type { AssetInfo, FamilyId, Fill, LangCode, Project, Slide, SlideLayout } from '../model/types';
import type { Ctx2D, ImageLike, RenderInput, RenderResult } from '../engine/types';
import type { ExportJob } from '../export';
import { renderSlide } from '../engine';
import { encodePngAsync } from '../export';
import { FAMILIES, isRtl } from '../model/catalog';
import { mirrorsLayout } from '../model/mirror';
import { resolveLayout, resolveShot } from '../model/resolve';
import { languageTypography } from '../model/typography';
import {
  canvasSide,
  canvasToBytes,
  createSurface,
  releaseCanvas,
  resetContext,
  resetSurface,
  type AnyCanvas,
  type Surface,
} from './canvas';
import { browserEnv } from './env';
import { ensureFonts } from './fonts';
import { getImageCache, waitForPreviews, type ImageCacheApi } from './images';
import { errorMessage, noop } from './util';

export interface CanvasRenderRequest {
  project: Project;
  slideIndex: number;
  family: FamilyId;
  lang: LangCode;
  /** Output pixel size (canvas.width/height are set to this). */
  width: number;
  height: number;
  placeholder?: 'mock' | 'empty';
}

export interface RenderedJob {
  bytes: Uint8Array;
  /** What the engine reported (text overflow, missing screenshots) for export warnings. */
  result: RenderResult;
}

/** Slide height in a thumbnail: about what a library card shows at 2x DPR. */
export const THUMB_SLIDE_HEIGHT = 264;
export const THUMB_MAX_SLIDES = 3;
export const THUMB_QUALITY = 0.82;
export const THUMB_WAIT_MS = 1500;
/**
 * Copies of a slide's outer columns on each side of it, at least: a scaled
 * card never samples its neighbour, and decoders blend chroma 1 px across a
 * block edge, which stays inside these margins.
 */
const THUMB_BLEED = 3;
/** JPEG's largest block (16 px with subsampled chroma): slides in separate blocks never smear into each other. */
const THUMB_BLOCK = 16;
/** The library card's picture inside its padding, in CSS px at a usual width: the slide count is picked to fill it. */
const THUMB_WELL = { width: 224, height: 130, gap: 6 } as const;

/** The export canvas is kept between jobs and freed after this long without one. */
const EXPORT_CANVAS_IDLE_MS = 10_000;

const emptyResult = (): RenderResult => ({ boxes: [], missingShots: [], overflowingText: [], pendingImages: [] });

/** Height / width from AssetInfo, or null when it is missing or degenerate. */
function infoAspect(info: AssetInfo | undefined): number | null {
  if (!info) return null;
  const { width, height } = info;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? height / width : null;
}

function imageAspect(img: ImageLike | null): number | null {
  return img && img.width > 0 && img.height > 0 ? img.height / img.width : null;
}

function addFillAsset(ids: Set<string>, fill: Fill | null | undefined): void {
  if (fill && fill.type === 'image' && fill.assetId) ids.add(fill.assetId);
}

/**
 * Asset ids drawn by one slide x family x language: the effective
 * background's image fill (the slide's own, else the theme's), device
 * screenshots after language fallback, image elements and shape image fills.
 * Hidden and fully transparent elements are not drawn (same rule as the
 * engine), so their images are not needed. Pure.
 */
export function slideAssetIds(
  project: Project,
  slide: Slide,
  layout: SlideLayout,
  family: FamilyId,
  lang: LangCode,
  baseLang: LangCode,
): string[] {
  const ids = new Set<string>();
  addFillAsset(ids, (layout.background ?? project.theme.background)?.fill);
  for (const el of layout.elements) {
    if (el.hidden || (Number.isFinite(el.opacity) && el.opacity <= 0)) continue;
    if (el.kind === 'device') {
      const shot = resolveShot(slide, family, el.slot, lang, baseLang);
      if (shot) ids.add(shot);
    } else if (el.kind === 'image') {
      if (el.assetId) ids.add(el.assetId);
    } else if (el.kind === 'shape') {
      addFillAsset(ids, el.fill);
    }
  }
  return [...ids];
}

interface InputSpec {
  project: Project;
  slide: Slide;
  layout: SlideLayout;
  slideIndex: number;
  family: FamilyId;
  lang: LangCode;
  width: number;
  height: number;
  placeholder: 'mock' | 'empty';
  getImage(assetId: string): ImageLike | null;
}

function renderInput(spec: InputSpec): RenderInput {
  const { project, getImage } = spec;
  return {
    width: spec.width,
    height: spec.height,
    family: spec.family,
    slide: spec.slide,
    layout: spec.layout,
    theme: project.theme,
    lang: spec.lang,
    baseLang: project.languages[0] ?? spec.lang,
    rtl: isRtl(spec.lang),
    mirror: mirrorsLayout(project, spec.lang),
    typography: languageTypography(project, spec.lang),
    slideIndex: spec.slideIndex,
    slideCount: project.slides.length,
    getImage,
    // AssetInfo first so layout never waits on decoding; the decoded size only
    // covers assets the project forgot to register.
    getAssetAspect: (assetId) => infoAspect(project.assets[assetId]) ?? imageAspect(getImage(assetId)),
    placeholder: spec.placeholder,
    env: browserEnv(),
  };
}

const previewGetter = (cache: ImageCacheApi, projectId: string) => (assetId: string) =>
  cache.getPreview(projectId, assetId);

/** Renders a slide into a canvas with preview images. */
export function renderToCanvas(canvas: HTMLCanvasElement, req: CanvasRenderRequest): RenderResult {
  const width = canvasSide(req.width);
  const height = canvasSide(req.height);
  // Assigning a size reallocates and clears the canvas, even to the same value.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The canvas has no 2D context');
  resetContext(ctx, width, height);

  const { project } = req;
  const slide = project.slides[req.slideIndex];
  // A stale index (slide deleted while a frame was queued) draws nothing instead of crashing the editor.
  if (!slide) return emptyResult();
  const layout = resolveLayout(project, slide, req.family);
  return renderSlide(
    ctx,
    renderInput({
      project,
      slide,
      layout,
      slideIndex: req.slideIndex,
      family: req.family,
      lang: req.lang,
      width,
      height,
      placeholder: req.placeholder ?? 'mock',
      getImage: previewGetter(getImageCache(), project.id),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

let fontsMemo: { key: string; ready: Promise<void> } | null = null;

/** ensureFonts once per project version: an export runs hundreds of jobs on the same project. */
function fontsReady(project: Project): Promise<void> {
  const key = `${project.id}\u0000${project.updatedAt}`;
  if (fontsMemo?.key !== key) {
    fontsMemo = { key, ready: Promise.resolve().then(() => ensureFonts(project)).catch(noop) };
  }
  return fontsMemo.ready;
}

let exportSurface: Surface | null = null;
let exportIdleTimer: ReturnType<typeof setTimeout> | null = null;

function exportCanvas(width: number, height: number): Surface {
  if (exportIdleTimer !== null) {
    clearTimeout(exportIdleTimer);
    exportIdleTimer = null;
  }
  if (!exportSurface) {
    exportSurface = createSurface(width, height);
    return exportSurface;
  }
  const { canvas } = exportSurface;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  resetSurface(exportSurface);
  return exportSurface;
}

function scheduleExportCanvasRelease(): void {
  if (exportIdleTimer !== null) clearTimeout(exportIdleTimer);
  exportIdleTimer = setTimeout(() => {
    exportIdleTimer = null;
    if (exportSurface) releaseCanvas(exportSurface.canvas);
    exportSurface = null;
  }, EXPORT_CANVAS_IDLE_MS);
}

// One job at a time: the export canvas is shared and memory stays bounded
// even if a caller starts jobs in parallel.
let jobChain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = jobChain.then(task, task);
  jobChain = run.then(noop, noop);
  return run;
}

async function loadFullImages(cache: ImageCacheApi, projectId: string, ids: string[]): Promise<Map<string, ImageLike>> {
  const settled = await Promise.allSettled(ids.map((id) => cache.loadFull(projectId, id)));
  const images = new Map<string, ImageLike>();
  let failure: { id: string; reason: unknown } | null = null;
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') images.set(ids[i], outcome.value);
    else failure ??= { id: ids[i], reason: outcome.reason };
  });
  if (failure) {
    for (const img of images.values()) cache.release(img);
    const { id, reason } = failure;
    // A missing image would silently export a mock screen; fail the job instead.
    throw new Error(`Image ${id} could not be loaded: ${errorMessage(reason)}`, { cause: reason });
  }
  return images;
}

function clampQuality(q: number): number {
  return Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0.92;
}

/**
 * Starts JPEG encoding of the current pixels. JPEG has no alpha, so the image
 * is composited over white first, like the PNG encoder does. Both
 * convertToBlob and toBlob copy the bitmap synchronously, so the shared
 * canvas may be redrawn while the returned promise is pending.
 */
function startJpeg(surface: Surface, width: number, height: number, quality: number): Promise<Uint8Array> {
  const { ctx } = surface;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  return canvasToBytes(surface.canvas, 'image/jpeg', clampQuality(quality));
}

/** Like renderJobBytes, but also returns the engine's report for the job. */
export function renderJobWithResult(
  project: Project,
  job: ExportJob,
  format: 'png' | 'jpeg',
  quality: number,
): Promise<RenderedJob> {
  return exclusive(async () => {
    const slide = project.slides[job.slideIndex];
    if (!slide) throw new RangeError(`Slide ${job.slideIndex + 1} does not exist`);
    const width = canvasSide(job.width);
    const height = canvasSide(job.height);
    await fontsReady(project);
    const layout = resolveLayout(project, slide, job.family);
    const baseLang = project.languages[0] ?? job.lang;
    const cache = getImageCache();
    const images = await loadFullImages(cache, project.id, slideAssetIds(project, slide, layout, job.family, job.lang, baseLang));

    let surface: Surface;
    let result: RenderResult;
    let pixels: ImageData | null = null;
    try {
      surface = exportCanvas(width, height);
      result = renderSlide(
        surface.ctx,
        renderInput({
          project,
          slide,
          layout,
          slideIndex: job.slideIndex,
          family: job.family,
          lang: job.lang,
          width,
          height,
          placeholder: 'mock',
          getImage: (assetId) => images.get(assetId) ?? null,
        }),
      );
      if (format === 'png') pixels = surface.ctx.getImageData(0, 0, width, height);
    } finally {
      // Full-size decodes are the biggest allocations of an export: free them before encoding.
      for (const img of images.values()) cache.release(img);
      scheduleExportCanvasRelease();
    }
    // Still synchronous since rendering, so nothing else has drawn on the shared canvas.
    const bytes = pixels
      ? await encodePngAsync(pixels.data, width, height)
      : await startJpeg(surface, width, height, quality);
    return { bytes, result };
  });
}

/** Renders one export job at full resolution and encodes it. */
export async function renderJobBytes(project: Project, job: ExportJob, format: 'png' | 'jpeg', quality: number): Promise<Uint8Array> {
  return (await renderJobWithResult(project, job, format, quality)).bytes;
}

/* ------------------------------------------------------------------ */
/* Thumbnail                                                           */
/* ------------------------------------------------------------------ */

/** Where a slide sits in a thumbnail: cell i starts at i * pitch, the slide `inset` px into it. */
interface ThumbnailCell {
  slideWidth: number;
  slideHeight: number;
  pitch: number;
  inset: number;
}

/** The family a thumbnail shows: the project's first known one. */
function thumbnailFamily(families: readonly FamilyId[]): FamilyId {
  return families.find((f) => f in FAMILIES) ?? 'iphone';
}

/** Block-aligned cells, each a little wider than a slide, so every slide has its own JPEG blocks and margins. */
function thumbnailCell(family: FamilyId): ThumbnailCell {
  const { design } = FAMILIES[family];
  const slideHeight = THUMB_SLIDE_HEIGHT;
  const slideWidth = Math.max(1, Math.round((slideHeight * design.width) / design.height));
  const pitch = Math.ceil((slideWidth + 2 * THUMB_BLEED) / THUMB_BLOCK) * THUMB_BLOCK;
  return { slideWidth, slideHeight, pitch, inset: Math.floor((pitch - slideWidth) / 2) };
}

/** How many of `available` slides fill the card's picture best: three phones, two iPads, one Mac. */
function thumbnailSlideCount(cell: ThumbnailCell, available: number): number {
  const aspect = cell.slideHeight / cell.slideWidth;
  const limit = Math.min(THUMB_MAX_SLIDES, Math.max(0, Math.floor(available)));
  let best = Math.min(1, limit);
  let bestArea = 0;
  for (let n = 1; n <= limit; n++) {
    const width = Math.min((THUMB_WELL.width - THUMB_WELL.gap * (n - 1)) / n, THUMB_WELL.height / aspect);
    const area = n * width * width * aspect;
    if (area > bestArea + 1e-6) {
      best = n;
      bestArea = area;
    }
  }
  return best;
}

/** The slides inside a thumbnail made by renderThumbnail, in image pixels. */
export interface ThumbnailLayout {
  slideWidth: number;
  slideHeight: number;
  /** Left edge of each slide, in slide order. */
  lefts: number[];
}

/**
 * Where the slides are in a `width` x `height` thumbnail of a project with
 * these families, or null when renderThumbnail would not draw an image of
 * that size for them today (an older layout, or the first family changed
 * since it was drawn). Pure.
 */
export function thumbnailLayout(width: number, height: number, families: readonly FamilyId[]): ThumbnailLayout | null {
  const { slideWidth, slideHeight, pitch, inset } = thumbnailCell(thumbnailFamily(families));
  const count = width / pitch;
  if (height !== slideHeight || !Number.isInteger(count) || count < 1 || count > THUMB_MAX_SLIDES) return null;
  return { slideWidth, slideHeight, lefts: Array.from({ length: count }, (_, i) => i * pitch + inset) };
}

/** Draws a slide picture into the cell at `x` and repeats its outer columns across the cell's margins. */
function drawIntoCell(ctx: Ctx2D, picture: AnyCanvas, x: number, cell: ThumbnailCell): void {
  const { slideWidth: w, slideHeight: h, pitch, inset } = cell;
  ctx.drawImage(picture, x + inset, 0);
  // Exact copies, not interpolated ones: the margins must hold the edge colours only.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(picture, 0, 0, 1, h, x, 0, inset, h);
  ctx.drawImage(picture, w - 1, 0, 1, h, x + inset + w, 0, pitch - inset - w, h);
  ctx.imageSmoothingEnabled = true;
}

/**
 * Small JPEG of the first slides (primary family, base language) for the
 * project's library card. It holds the slides alone, side by side, each
 * centred in its own cell with its outer columns repeated into the cell's
 * margins: the card cuts them apart (thumbnailLayout) and lays them out on
 * its own themed background. As many slides as fill the card best; a slide
 * that fails to draw is left out. Rejects when none could be drawn.
 */
export async function renderThumbnail(project: Project): Promise<Uint8Array> {
  const family = thumbnailFamily(project.families);
  const cell = thumbnailCell(family);
  const count = thumbnailSlideCount(cell, project.slides.length);
  const lang = project.languages[0] ?? 'en-US';

  const layouts: (SlideLayout | null)[] = [];
  const needed = new Set<string>();
  for (let i = 0; i < count; i++) {
    const slide = project.slides[i];
    try {
      const layout = resolveLayout(project, slide, family);
      layouts.push(layout);
      for (const id of slideAssetIds(project, slide, layout, family, lang, lang)) needed.add(id);
    } catch {
      layouts.push(null);
    }
  }
  await Promise.all([
    fontsReady(project),
    Promise.resolve()
      .then(() => waitForPreviews(project.id, [...needed], THUMB_WAIT_MS))
      .catch(noop),
  ]);

  const getImage = previewGetter(getImageCache(), project.id);
  const pictures: Surface[] = [];
  let out: Surface | null = null;
  try {
    layouts.forEach((layout, i) => {
      if (!layout) return;
      const picture = createSurface(cell.slideWidth, cell.slideHeight);
      pictures.push(picture);
      try {
        renderSlide(
          picture.ctx,
          renderInput({ project, slide: project.slides[i], layout, slideIndex: i, family, lang, width: cell.slideWidth, height: cell.slideHeight, placeholder: 'mock', getImage }),
        );
      } catch (err) {
        pictures.pop();
        releaseCanvas(picture.canvas);
        console.warn(`[thumbnail] slide ${i + 1} could not be drawn: ${errorMessage(err)}`);
      }
    });
    if (!pictures.length) throw new Error('No slide could be drawn for the thumbnail');
    out = createSurface(pictures.length * cell.pitch, cell.slideHeight);
    // JPEG has no alpha: see-through slide pixels come out over white, as in an export.
    out.ctx.fillStyle = '#ffffff';
    out.ctx.fillRect(0, 0, pictures.length * cell.pitch, cell.slideHeight);
    for (const [k, picture] of pictures.entries()) drawIntoCell(out.ctx, picture.canvas, k * cell.pitch, cell);
    return await canvasToBytes(out.canvas, 'image/jpeg', THUMB_QUALITY);
  } finally {
    for (const picture of pictures) releaseCanvas(picture.canvas);
    if (out) releaseCanvas(out.canvas);
  }
}

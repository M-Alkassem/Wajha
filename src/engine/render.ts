/**
 * Slide composition: background, pattern, then every element in painter's
 * order. Each element is drawn translated to its anchor, rotated about its
 * centre and faded by its opacity, and renderSlide reports where every
 * visible element ended up so the editor can hit-test and draw handles.
 *
 * Bad data never throws out of here: sizes, positions and colours are
 * sanitised, and an element that still fails to draw is skipped so the rest
 * of the slide renders.
 */
import type { DeviceElement, ImageElement, ShapeElement, TextElement } from '../model/types';
import { FAMILIES } from '../model/catalog';
import { resolveShot, resolveText } from '../model/resolve';
import type { Ctx2D, DeviceGeometry, ElementBox, ImageLike, RenderInput, RenderResult, RenderSlideFn } from './types';
import { drawDevice } from './devices';
import { paintBackground } from './background';
import { drawShape, shapeSize } from './shapes';
import { drawImageElement, resolveImage, type ImageSources } from './images';
import { drawTextBlock, layoutTextBlock } from './text';
import { clamp, DEG, num, roundedRect, transformScale } from './geometry';
import type { PaintContext } from './paint';

/** Used when neither the screenshot nor the family knows the screen shape (iPhone 6.9″). */
const DEFAULT_SCREEN_ASPECT = 2868 / 1320;

interface Scene {
  input: RenderInput;
  width: number;
  height: number;
  u: number;
  pxScale: number;
  pc: PaintContext;
  sources: ImageSources;
  result: RenderResult;
}

function resetState(ctx: Ctx2D): void {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'ltr';
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  if ('filter' in ctx) ctx.filter = 'none';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

const elementId = (el: { id: unknown }): string => (typeof el.id === 'string' ? el.id : String(el.id ?? ''));

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Translates to the element centre, rotates, applies opacity, draws; the caller saves/restores. */
function place(ctx: Ctx2D, cx: number, cy: number, rotation: number, opacity: number, draw: () => void): void {
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation * DEG);
  ctx.globalAlpha *= opacity;
  draw();
}

function textElement(ctx: Ctx2D, el: TextElement, scene: Scene, cx: number, ay: number, rotation: number, opacity: number): ElementBox {
  const { input, u } = scene;
  const raw = attempt(() => resolveText(input.slide, el.key, input.lang, input.baseLang), '');
  const layout = layoutTextBlock(ctx, {
    text: typeof raw === 'string' ? raw : '',
    style: el.style,
    boxWidth: Math.max(0, num(el.width, 0) * u),
    unit: u,
    rtl: input.rtl === true,
    lang: input.lang,
  });
  const h = layout.height;
  // y is the top edge, centre or bottom edge of the block; boxes are always centred.
  const cy = el.valign === 'top' ? ay + h / 2 : el.valign === 'bottom' ? ay - h / 2 : ay;
  if (layout.overflow) scene.result.overflowingText.push(elementId(el));
  attempt(() => place(ctx, cx, cy, rotation, opacity, () => drawTextBlock(ctx, layout, { unit: u, pxScale: scene.pxScale })), undefined);
  return { id: elementId(el), cx, cy, w: layout.boxWidth, h, rotation };
}

function sanitizeGeometry(g: unknown, fallbackW: number, fallbackH: number): { w: number; h: number } {
  if (g && typeof g === 'object') {
    const o = g as Partial<DeviceGeometry>;
    const w = num(o.width, -1);
    const h = num(o.height, -1);
    if (w >= 0 && h >= 0) return { w, h };
  }
  return { w: fallbackW, h: fallbackH };
}

/** Plain stand-in used only if the device painter fails, so the layout stays legible. */
function drawFallbackDevice(ctx: Ctx2D, w: number, h: number, screen: ImageLike | null): void {
  ctx.fillStyle = '#1d1d22';
  ctx.beginPath();
  roundedRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
  ctx.fill();
  const inset = w * 0.035;
  ctx.save();
  try {
    ctx.beginPath();
    roundedRect(ctx, -w / 2 + inset, -h / 2 + inset, w - 2 * inset, h - 2 * inset, w * 0.09);
    ctx.clip();
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (screen) {
      const sw = w - 2 * inset;
      const sh = h - 2 * inset;
      const k = Math.max(sw / screen.width, sh / screen.height);
      ctx.drawImage(screen, -(screen.width * k) / 2, -(screen.height * k) / 2, screen.width * k, screen.height * k);
    }
  } finally {
    ctx.restore();
  }
}

function deviceElement(ctx: Ctx2D, el: DeviceElement, index: number, scene: Scene, cx: number, cy: number, rotation: number, opacity: number): ElementBox {
  const { input, u, sources, result } = scene;
  const widthPx = Math.max(0, num(el.width, 0) * u);
  const shot = attempt(() => resolveShot(input.slide, input.family, el.slot, input.lang, input.baseLang), null);
  const assetId = typeof shot === 'string' && shot ? shot : null;
  const familyAspect = num(FAMILIES[input.family]?.screenAspect, 0);
  const known = assetId ? sources.getAssetAspect(assetId) : null;
  const screenAspect = clamp(known ?? (familyAspect > 0 ? familyAspect : DEFAULT_SCREEN_ASPECT), 0.05, 20);
  const image = assetId ? sources.getImage(assetId) : null;
  let placeholder: 'mock' | 'empty' = input.placeholder === 'empty' ? 'empty' : 'mock';
  if (!assetId) result.missingShots.push(elementId(el));
  else if (!image) {
    // Resolved but still decoding: a calm empty screen instead of a mock that flashes away.
    result.pendingImages.push(elementId(el));
    placeholder = 'empty';
  }
  const fallback = { w: widthPx, h: widthPx * screenAspect };
  if (widthPx < 1) return { id: elementId(el), cx, cy, w: fallback.w, h: fallback.h, rotation };

  const theme = input.theme;
  const palette = Array.isArray(theme?.palette) ? theme.palette.filter((c): c is string => typeof c === 'string') : [];
  const slideIndex = Math.floor(num(input.slideIndex, 0));
  let size = fallback;
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation * DEG);
  ctx.globalAlpha *= opacity;
  try {
    const geometry = drawDevice(ctx, {
      el,
      widthPx,
      unit: u,
      screenAspect,
      screen: image,
      placeholder,
      mock: { seed: mockSeed(slideIndex, index), palette, dark: theme?.mockDark === true },
      env: input.env,
    });
    size = sanitizeGeometry(geometry, fallback.w, fallback.h);
  } catch {
    attempt(() => drawFallbackDevice(ctx, fallback.w, fallback.h, image), undefined);
  }
  return { id: elementId(el), cx, cy, w: size.w, h: size.h, rotation };
}

function shapeElement(ctx: Ctx2D, el: ShapeElement, scene: Scene, cx: number, cy: number, rotation: number, opacity: number): ElementBox {
  const { w, h } = shapeSize(el, scene.u);
  attempt(() => place(ctx, cx, cy, rotation, opacity, () => drawShape(ctx, el, scene.u, scene.pc)), undefined);
  return { id: elementId(el), cx, cy, w, h, rotation };
}

function imageElement(ctx: Ctx2D, el: ImageElement, scene: Scene, cx: number, cy: number, rotation: number, opacity: number): ElementBox {
  const { aspect } = resolveImage(el, scene.sources);
  const w = Math.max(0, num(el.width, 0) * scene.u);
  const h = w * aspect;
  attempt(() => place(ctx, cx, cy, rotation, opacity, () => drawImageElement(ctx, el, scene.u, scene.pxScale, scene.sources)), undefined);
  return { id: elementId(el), cx, cy, w, h, rotation };
}

/** Seed of the generated mock screen shown by the device at `elementIndex` of slide `slideIndex`. */
export function mockSeed(slideIndex: number, elementIndex: number): number {
  return slideIndex * 31 + elementIndex * 7 + 3;
}

/** Renders one slide into `ctx` at (0, 0, width, height). See RenderSlideFn. */
export const renderSlide: RenderSlideFn = (ctx, input) => {
  const result: RenderResult = { boxes: [], missingShots: [], overflowingText: [], pendingImages: [] };
  const width = num(input?.width, 0);
  const height = num(input?.height, 0);
  if (!(width >= 1) || !(height >= 1)) return result;
  const u = Math.min(width, height);

  const getImage = (id: string): ImageLike | null =>
    attempt(() => {
      const img = input.getImage(id);
      return img && img.width > 0 && img.height > 0 ? img : null;
    }, null);
  const getAssetAspect = (id: string): number | null =>
    attempt(() => {
      const a = input.getAssetAspect(id);
      return typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : null;
    }, null);
  const pxScale = transformScale(ctx);
  const scene: Scene = {
    input,
    width,
    height,
    u,
    pxScale,
    pc: { env: input.env, u, getImage, pxScale },
    sources: { getImage, getAssetAspect },
    result,
  };

  ctx.save();
  try {
    resetState(ctx);
    // Elements may hang off the slide; when several slides share one canvas (thumbnails),
    // they must not bleed into the neighbours.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    const theme = input.theme;
    attempt(
      () =>
        paintBackground(
          ctx,
          {
            width,
            height,
            own: input.layout?.background ?? null,
            theme: theme?.background ?? null,
            panorama: theme?.panorama === true,
            slideIndex: input.slideIndex,
            slideCount: input.slideCount,
          },
          scene.pc,
        ),
      undefined,
    );

    const elements: unknown[] = Array.isArray(input.layout?.elements) ? input.layout.elements : [];
    elements.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const el = item as DeviceElement | TextElement | ShapeElement | ImageElement;
      if (el.hidden === true) return;
      const opacity = clamp(num(el.opacity, 1), 0, 1);
      if (opacity <= 0) return;
      const cx = num(el.x, 0.5) * width;
      const cy = num(el.y, 0.5) * height;
      const rotation = num(el.rotation, 0);
      ctx.save();
      try {
        let box: ElementBox | null = null;
        switch (el.kind) {
          case 'device':
            box = deviceElement(ctx, el, index, scene, cx, cy, rotation, opacity);
            break;
          case 'text':
            box = textElement(ctx, el, scene, cx, cy, rotation, opacity);
            break;
          case 'shape':
            box = shapeElement(ctx, el, scene, cx, cy, rotation, opacity);
            break;
          case 'image':
            box = imageElement(ctx, el, scene, cx, cy, rotation, opacity);
            break;
          default:
            box = null;
        }
        if (box) result.boxes.push(box);
      } catch {
        // Skip the element; the rest of the slide still renders.
      } finally {
        ctx.restore();
      }
    });
  } finally {
    ctx.restore();
  }
  return result;
};

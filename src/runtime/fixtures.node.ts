/**
 * Node-only fixtures for runtime tests: hand-built projects (the model
 * factories are implemented elsewhere and must not be relied on here) and
 * canvas stand-ins. Never import this from app code.
 */
import { createCanvas } from '@napi-rs/canvas';
import type {
  AssetInfo,
  DeviceElement,
  Fill,
  ImageElement,
  Project,
  ShapeElement,
  Slide,
  SlideLayout,
  TextElement,
  Theme,
} from '../model/types';
import type { ImageLike } from '../engine/types';

export const ASSET_A = `${'a'.repeat(64)}.png`;
export const ASSET_B = `${'b'.repeat(64)}.jpg`;
export const ASSET_C = `${'c'.repeat(64)}.webp`;
export const ASSET_D = `${'d'.repeat(64)}.png`;

export function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    background: { fill: { type: 'solid', color: '#101018' }, pattern: null },
    panorama: false,
    fonts: { heading: 'Inter Variable', body: 'Inter Variable' },
    palette: ['#7c6cff', '#ff8a5c'],
    mockDark: true,
    ...overrides,
  };
}

export function device(id: string, overrides: Partial<DeviceElement> = {}): DeviceElement {
  return {
    id,
    kind: 'device',
    x: 0.5,
    y: 0.6,
    rotation: 0,
    opacity: 1,
    frame: 'iphone',
    style: { color: '#1c1c1e', finish: 'metal', bezel: 'black' },
    width: 0.78,
    slot: 'main',
    cornerRadius: 0.1,
    shadow: null,
    ...overrides,
  };
}

export function text(id: string, key: string, overrides: Partial<TextElement['style']> = {}, el: Partial<TextElement> = {}): TextElement {
  return {
    id,
    kind: 'text',
    x: 0.5,
    y: 0.1,
    rotation: 0,
    opacity: 1,
    key,
    width: 0.86,
    valign: 'top',
    style: {
      font: 'Inter Variable',
      weight: 700,
      size: 0.072,
      lineHeight: 1.1,
      letterSpacing: -0.02,
      color: '#ffffff',
      highlight: '#ff8a5c',
      highlightMode: 'color',
      align: 'center',
      transform: 'none',
      maxLines: 3,
      shadow: null,
      ...overrides,
    },
    ...el,
  };
}

export function image(id: string, assetId: string, overrides: Partial<ImageElement> = {}): ImageElement {
  return { id, kind: 'image', x: 0.5, y: 0.5, rotation: 0, opacity: 1, assetId, width: 0.4, cornerRadius: 0.1, shadow: null, ...overrides };
}

export function shape(id: string, fill: Fill, overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id,
    kind: 'shape',
    x: 0.3,
    y: 0.3,
    rotation: 0,
    opacity: 1,
    shape: 'circle',
    width: 0.3,
    height: 0.3,
    fill,
    radius: 0,
    stroke: 0,
    blur: 0,
    seed: 1,
    ...overrides,
  };
}

export const imageFill = (assetId: string): Fill => ({ type: 'image', assetId, fit: 'cover', opacity: 1, blur: 0, tint: null });

export function layout(elements: SlideLayout['elements'], background: SlideLayout['background'] = null): SlideLayout {
  return { background, elements };
}

export function slide(id: string, overrides: Partial<Slide> = {}): Slide {
  return {
    id,
    texts: {
      'en-US': { headline: 'Plan your *week*', subtitle: 'Stay on top of things' },
      'ar-SA': { headline: 'خطط *أسبوعك*', subtitle: 'ابق على اطلاع' },
    },
    shots: { iphone: { main: { 'en-US': ASSET_A } } },
    layouts: { iphone: layout([device('dev1'), text('t1', 'headline')]) },
    ...overrides,
  };
}

export function assetInfo(id: string, width: number, height: number): AssetInfo {
  return { id, name: `${id.slice(0, 6)}.png`, width, height, bytes: 1000, addedAt: 1 };
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    format: 'wajha.project',
    version: 1,
    id: 'proj1',
    name: 'Demo',
    createdAt: 1,
    updatedAt: 2,
    templateId: null,
    theme: theme(),
    families: ['iphone'],
    languages: ['en-US', 'ar-SA'],
    slides: [slide('s1'), slide('s2'), slide('s3'), slide('s4')],
    assets: { [ASSET_A]: assetInfo(ASSET_A, 1000, 2000) },
    export: { sizes: [], languages: [], format: 'png', jpegQuality: 0.9, structure: 'stores' },
    ...overrides,
  };
}

/** A stand-in ImageBitmap that records close(). */
export interface FakeBitmap {
  width: number;
  height: number;
  closed: boolean;
  close(): void;
  label?: string;
}

export function fakeBitmap(width: number, height: number, label?: string): FakeBitmap & ImageLike {
  const bmp: FakeBitmap = {
    width,
    height,
    closed: false,
    label,
    close() {
      bmp.closed = true;
    },
  };
  return bmp as FakeBitmap & ImageLike;
}

/**
 * An OffscreenCanvas stand-in backed by @napi-rs/canvas (which already offers
 * getContext('2d'), convertToBlob and toBlob), for vi.stubGlobal.
 */
export class NodeOffscreenCanvas {
  constructor(width: number, height: number) {
    return createCanvas(width, height) as unknown as NodeOffscreenCanvas;
  }
}

/** Real PNG/JPEG/WebP bytes of a solid image, encoded by @napi-rs/canvas. */
export function encodedImage(width: number, height: number, mime: 'image/png' | 'image/jpeg' | 'image/webp', color = '#3366ff'): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  const buf = mime === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(mime, 90);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Lets pending promise callbacks run (several hops). */
export async function flushPromises(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

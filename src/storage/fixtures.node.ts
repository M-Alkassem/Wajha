/** Test fixtures for the storage tests: hand-built projects and templates, image bytes, zip surgery. */
import { createHash } from 'node:crypto';
import type { ImageExt } from '../platform/types';
import type { Fill, Project, Slide, Template, Theme } from '../model/types';

export interface Dimensions {
  width: number;
  height: number;
}

const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u24le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];

/** Signature plus the header that declares the pixel size: PNG IHDR, JPEG SOF0, WebP VP8X. */
function header(ext: ImageExt, { width, height }: Dimensions): number[] {
  if (ext === 'png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, 0, 0, 0, 0];
  if (ext === 'jpg') return [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)];
}

/**
 * Bytes with a real image signature and size header (4 x 4 px unless given),
 * but no decodable pixels; distinct seeds give distinct content (and hashes).
 */
export function imageBytes(ext: ImageExt, seed: number, size = 64, dimensions: Dimensions = { width: 4, height: 4 }): Uint8Array {
  const head = header(ext, dimensions);
  const bytes = new Uint8Array(Math.max(size, head.length + 4));
  bytes.set(head);
  new DataView(bytes.buffer).setUint32(head.length, seed >>> 0);
  for (let i = head.length + 4; i < bytes.length; i++) bytes[i] = (i * 7 + seed) & 0xff;
  return bytes;
}

export const png = (seed: number, size?: number, dimensions?: Dimensions) => imageBytes('png', seed, size, dimensions);
export const jpeg = (seed: number, size?: number, dimensions?: Dimensions) => imageBytes('jpg', seed, size, dimensions);
export const webp = (seed: number, size?: number, dimensions?: Dimensions) => imageBytes('webp', seed, size, dimensions);

export function sha256Node(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assetIdOf(bytes: Uint8Array, ext: ImageExt): string {
  return `${sha256Node(bytes)}.${ext}`;
}

export function makeTheme(over: Partial<Theme> = {}): Theme {
  return {
    background: { fill: { type: 'solid', color: '#101018' }, pattern: null },
    panorama: false,
    fonts: { heading: 'Inter Variable', body: 'Inter Variable' },
    palette: ['#ffffff', '#7c5cff'],
    mockDark: true,
    ...over,
  };
}

export function makeSlide(id: string, over: Partial<Slide> = {}): Slide {
  return { id, texts: { 'en-US': { headline: `Slide ${id}` } }, shots: {}, layouts: {}, ...over };
}

export function makeProject(over: Partial<Project> = {}): Project {
  return {
    format: 'wajha.project',
    version: 1,
    id: 'proj1',
    name: 'Habit tracker',
    createdAt: 1_000,
    updatedAt: 2_000,
    templateId: null,
    theme: makeTheme(),
    families: ['iphone'],
    languages: ['en-US', 'ar-SA'],
    slides: [makeSlide('s1'), makeSlide('s2')],
    assets: {},
    export: { sizes: [], languages: [], format: 'png', jpegQuality: 0.9, structure: 'stores' },
    ...over,
  };
}

export function makeTemplate(over: Partial<Template> = {}): Template {
  return {
    format: 'wajha.template',
    version: 1,
    id: 'sunset-glow',
    name: 'Sunset glow',
    author: 'Wajha',
    description: 'Warm gradient with a floating device.',
    category: 'gradient',
    tags: ['warm', 'gradient'],
    theme: makeTheme(),
    slides: [{ texts: { 'en-US': { headline: 'Track *every* habit' } }, layouts: { tall: { background: null, elements: [] } } }],
    assets: {},
    ...over,
  };
}

export const imageFill = (assetId: string): Fill => ({ type: 'image', assetId, fit: 'cover', opacity: 1, blur: 0, tint: null });

/**
 * Overwrites the uncompressed-size field of `name` in a zip's central
 * directory (what importers must check before inflating). Returns a copy.
 */
export function patchCentralSize(zip: Uint8Array, name: string, originalSize: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  const target = new TextEncoder().encode(name);
  for (let i = 0; i + 46 <= out.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(i + 28, true);
    const candidate = out.subarray(i + 46, i + 46 + nameLength);
    if (candidate.length === target.length && candidate.every((b, k) => b === target[k])) {
      view.setUint32(i + 24, originalSize >>> 0, true);
      return out;
    }
  }
  throw new Error(`entry ${name} not found in the central directory`);
}

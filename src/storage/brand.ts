/**
 * The brand kit: colours, fonts and a logo kept once for the whole library
 * and applied to any project. brand/kit.json lists them; font and logo files
 * live in brand/files/, content-addressed like project files.
 */
import type { ProjectFont } from '../model/types';
import { isFontFile, normalizeColor } from '../model/rules';
import { IMAGE_LIMITS, getPlatform, imageWithinLimits, readImageSize, sha256Hex, sniffImageExt } from '../platform';
import { fontFileFor, projectFontFile } from './fonts';
import { StorageError, assertProjectId, fromUtf8, isFiniteNumber, isRecord, utf8 } from './shared';

export interface BrandLogo {
  /** "<sha-256 hex>.<png|jpg|webp>" in brand/files/. */
  file: string;
  name: string;
  width: number;
  height: number;
}

export interface BrandKit {
  colors: string[];
  fonts: ProjectFont[];
  logo: BrandLogo | null;
}

const KIT_FILE = 'brand/kit.json';
const brandFile = (file: string) => `brand/files/${file}`;
const LOGO_FILE = /^[0-9a-f]{64}\.(png|jpg|webp)$/;

export const MAX_BRAND_COLORS = 12;
export const MAX_BRAND_FONTS = 12;

export const emptyBrandKit = (): BrandKit => ({ colors: [], fonts: [], logo: null });

/** The kit as stored, repaired: bad colours, files and duplicates are dropped. */
export function cleanBrandKit(raw: unknown): BrandKit {
  if (!isRecord(raw)) return emptyBrandKit();
  const colors: string[] = [];
  for (const c of Array.isArray(raw.colors) ? raw.colors : []) {
    const color = normalizeColor(c);
    if (color && !colors.includes(color) && colors.length < MAX_BRAND_COLORS) colors.push(color);
  }
  const fonts: ProjectFont[] = [];
  for (const f of Array.isArray(raw.fonts) ? raw.fonts : []) {
    if (!isRecord(f) || !isFontFile(f.file) || typeof f.family !== 'string' || !f.family.trim()) continue;
    if (fonts.length >= MAX_BRAND_FONTS || fonts.some((x) => x.file === f.file || x.family === f.family)) continue;
    fonts.push({ family: f.family.trim().slice(0, 100), file: f.file, name: typeof f.name === 'string' ? f.name.slice(0, 200) : f.file });
  }
  const l = raw.logo;
  const logo =
    isRecord(l) && typeof l.file === 'string' && LOGO_FILE.test(l.file) && isFiniteNumber(l.width) && isFiniteNumber(l.height) && l.width > 0 && l.height > 0
      ? { file: l.file, name: typeof l.name === 'string' ? l.name.slice(0, 200) : l.file, width: l.width, height: l.height }
      : null;
  return { colors, fonts, logo };
}

export async function readBrandKit(): Promise<BrandKit> {
  const bytes = await getPlatform().read(KIT_FILE);
  if (!bytes) return emptyBrandKit();
  try {
    return cleanBrandKit(JSON.parse(fromUtf8(bytes)));
  } catch {
    return emptyBrandKit();
  }
}

/** Saves the kit and deletes brand files it no longer lists. */
export async function writeBrandKit(kit: BrandKit): Promise<BrandKit> {
  const clean = cleanBrandKit(kit);
  const p = getPlatform();
  await p.write(KIT_FILE, utf8(JSON.stringify(clean)));
  const keep = new Set([...clean.fonts.map((f) => f.file), ...(clean.logo ? [clean.logo.file] : [])]);
  for (const entry of await p.list('brand/files')) {
    if (!entry.isDir && !keep.has(entry.name)) await p.remove(brandFile(entry.name)).catch(() => undefined);
  }
  return clean;
}

/** Stores a font file in the kit's files (the caller adds the entry to the kit). */
export async function putBrandFont(bytes: Uint8Array, name: string): Promise<ProjectFont> {
  const { file, family } = await fontFileFor(bytes, name);
  const p = getPlatform();
  if (!(await p.read(brandFile(file)))) await p.write(brandFile(file), bytes);
  return { family, file, name: name.slice(0, 200) || file };
}

/** Stores a logo image in the kit's files; refuses anything that is not a safe PNG, JPEG or WebP. */
export async function putBrandLogo(bytes: Uint8Array, name: string): Promise<BrandLogo> {
  const ext = sniffImageExt(bytes);
  const size = ext ? readImageSize(bytes, ext) : null;
  if (!ext || !size || !imageWithinLimits(bytes, IMAGE_LIMITS)) throw new StorageError('invalid_file', `${name} is not an image Wajha can use. Choose a PNG, JPEG or WebP file.`);
  const file = `${await sha256Hex(bytes)}.${ext}`;
  const p = getPlatform();
  if (!(await p.read(brandFile(file)))) await p.write(brandFile(file), bytes);
  return { file, name: name.slice(0, 200) || file, width: size.width, height: size.height };
}

/** The bytes of a brand kit file, or null. */
export async function readBrandFile(file: string): Promise<Uint8Array | null> {
  if (!isFontFile(file) && !LOGO_FILE.test(file)) return null;
  return getPlatform().read(brandFile(file));
}

/** Copies a kit font into a project's fonts folder; the caller adds `font` to project.fonts. */
export async function copyBrandFontToProject(projectId: string, font: ProjectFont): Promise<void> {
  assertProjectId(projectId);
  const bytes = await readBrandFile(font.file);
  if (!bytes) throw new StorageError('not_found', `The font file of ${font.family} is missing from the brand kit.`);
  const p = getPlatform();
  if (!(await p.read(projectFontFile(projectId, font.file)))) await p.write(projectFontFile(projectId, font.file), bytes);
}

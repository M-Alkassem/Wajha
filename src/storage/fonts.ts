/**
 * Font files people bring: stored with a project (projects/<id>/fonts/) so
 * the project and its .wajha file keep rendering with them, and in the
 * brand kit (brand/files/). Like images they are content-addressed:
 * "<sha-256 hex>.<ttf|otf|woff|woff2>".
 */
import type { ProjectFont } from '../model/types';
import { isFontFile } from '../model/rules';
import { getPlatform, MAX_FONT_BYTES, megabytes, sha256Hex } from '../platform';
import { PROJECTS_DIR, StorageError, assertProjectId, fromUtf8 } from './shared';

export type FontExt = 'ttf' | 'otf' | 'woff' | 'woff2';

export const projectFontsDir = (projectId: string) => `${PROJECTS_DIR}/${projectId}/fonts`;
export const projectFontFile = (projectId: string, file: string) => `${PROJECTS_DIR}/${projectId}/fonts/${file}`;

/** The font format from the file's signature, or null for anything else (font collections included). */
export function sniffFontExt(bytes: Uint8Array): FontExt | null {
  if (bytes.length < 12) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return 'ttf';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  return null;
}

/**
 * The family name inside a TrueType or OpenType file (its "name" table:
 * the typographic family, else the family), or null when the file does not
 * say or is compressed (WOFF).
 */
export function fontFamilyName(bytes: Uint8Array): string | null {
  const ext = sniffFontExt(bytes);
  if (ext !== 'ttf' && ext !== 'otf') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => (at + 2 <= bytes.length ? view.getUint16(at) : -1);
  const u32 = (at: number) => (at + 4 <= bytes.length ? view.getUint32(at) : -1);
  const tables = u16(4);
  let name = -1;
  for (let i = 0; i < tables && i < 64; i++) {
    const rec = 12 + i * 16;
    if (String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]) === 'name') name = u32(rec + 8);
  }
  if (name < 0) return null;
  const count = u16(name + 2);
  const strings = name + u16(name + 4);
  let best: { score: number; text: string } | null = null;
  for (let i = 0; i < count && i < 512; i++) {
    const rec = name + 6 + i * 12;
    const [platform, , language, id, length, offset] = [u16(rec), u16(rec + 2), u16(rec + 4), u16(rec + 6), u16(rec + 8), u16(rec + 10)];
    if ((id !== 16 && id !== 1) || length <= 0 || strings + offset + length > bytes.length) continue;
    const raw = bytes.subarray(strings + offset, strings + offset + length);
    let text: string;
    if (platform === 3 || platform === 0) {
      // UTF-16 big-endian.
      text = '';
      for (let k = 0; k + 1 < raw.length; k += 2) text += String.fromCharCode((raw[k] << 8) | raw[k + 1]);
    } else if (platform === 1) {
      text = fromUtf8(raw);
    } else continue;
    text = text.replace(/\p{Cc}/gu, '').trim();
    if (!text) continue;
    // Typographic family over family; Windows US English over the rest.
    const score = (id === 16 ? 4 : 0) + (platform === 3 ? 2 : 0) + (language === 0x409 || language === 0 ? 1 : 0);
    if (!best || score > best.score) best = { score, text };
  }
  return best ? best.text.slice(0, 100) : null;
}

/** "Gilroy-Bold.woff2" -> "Gilroy Bold". */
export function familyFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (stem || 'Custom font').slice(0, 100);
}

/** Checks `bytes` are a usable font and names the stored file; throws a message people can read. */
export async function fontFileFor(bytes: Uint8Array, name: string): Promise<{ file: string; family: string }> {
  if (bytes.byteLength > MAX_FONT_BYTES) throw new StorageError('too_large', `${name} is larger than ${megabytes(MAX_FONT_BYTES)}`);
  const ext = sniffFontExt(bytes);
  if (!ext) throw new StorageError('invalid_file', `${name} is not a font Wajha can use. Choose a .ttf, .otf, .woff or .woff2 file.`);
  const file = `${await sha256Hex(bytes)}.${ext}`;
  return { file, family: fontFamilyName(bytes) ?? familyFromFileName(name) };
}

/** Stores a font file with a project; the caller adds the returned entry to project.fonts. */
export async function putProjectFont(projectId: string, bytes: Uint8Array, name: string): Promise<ProjectFont> {
  assertProjectId(projectId);
  const { file, family } = await fontFileFor(bytes, name);
  const p = getPlatform();
  if (!(await p.read(projectFontFile(projectId, file)))) await p.write(projectFontFile(projectId, file), bytes);
  return { family, file, name: name.slice(0, 200) || file };
}

/** The bytes of a project's font file, or null when it is missing or not a font file name. */
export async function readProjectFont(projectId: string, file: string): Promise<Uint8Array | null> {
  assertProjectId(projectId);
  if (!isFontFile(file)) return null;
  return getPlatform().read(projectFontFile(projectId, file));
}

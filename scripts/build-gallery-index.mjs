#!/usr/bin/env node
/**
 * Builds gallery/index.json (the GalleryIndex the app downloads, see
 * src/model/types.ts) from the community templates in
 * gallery/templates/<id>/: template.json, preview.jpg and, when a template
 * uses images, assets/<sha256>.<ext>.
 *
 * Each entry's `version` is bumped when its template.json changes: the
 * SHA-256 of every template file is kept in gallery/.hashes.json, and an
 * unchanged file keeps its version. `updatedAt` only moves when an entry
 * changes, so rebuilding an unchanged gallery leaves both files untouched.
 *
 * Previews and images are held to the app's own limits with the app's own
 * header reader (src/platform/limits.ts), so a file the app would refuse,
 * a preview it would not show or an image it would not install, fails
 * review here with its name instead.
 *
 * Plain Node ESM (no build step, no dependencies): `npm run gallery:index`,
 * or `node scripts/build-gallery-index.mjs --check` to fail when index.json
 * is out of date. limits.ts has no runtime imports, so Node 22.18+ loads it
 * with its type stripping. Full validation of each template
 * (validateTemplate) happens in scripts/gallery.test.ts.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_LIMITS, THUMBNAIL_LIMITS, imageWithinLimits, megabytes, readImageSize, sniffImageExt } from '../src/platform/limits.ts';

export const INDEX_FILE = 'index.json';
export const HASHES_FILE = '.hashes.json';
export const PREVIEW_FILE = 'preview.jpg';

const CATEGORIES = ['minimal', 'bold', 'gradient', 'dark', 'playful', 'panorama', 'elegant'];
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Mirrors isWindowsDeviceName in src/model/rules.ts: the app refuses these template ids, they cannot name a folder on Windows. */
const WINDOWS_DEVICE_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const ASSET_RE = /^[0-9a-f]{64}\.(png|jpg|webp)$/;
const LIMITS = { id: 64, name: 200, description: 2000, tag: 40, tags: 20 };

/** @typedef {{ id: string, name: string, author: string, description: string, category: string, tags: string[], version: number, template: string, preview: string, assets: string[], bytes: number }} GalleryEntry */
/** @typedef {{ format: 'wajha.gallery', version: 1, updatedAt: string, templates: GalleryEntry[] }} GalleryIndex */
/** @typedef {Record<string, { sha256: string, version: number }>} GalleryHashes */
/** @typedef {import('../src/platform/limits.ts').ImageLimits} ImageLimits */

const sha256 = (/** @type {Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex');
const isDir = (/** @type {string} */ p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (/** @type {string} */ p) => existsSync(p) && statSync(p).isFile();
const oneLine = (/** @type {unknown} */ v, /** @type {number} */ max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const TYPE_NAMES = { png: 'PNG', jpg: 'JPEG', webp: 'WebP' };

/** "is larger than 4 MB (the limit for template previews)" */
const tooLarge = (/** @type {ImageLimits} */ limits, /** @type {string} */ what) => `is larger than ${megabytes(limits.maxBytes)} (the limit for ${what})`;

/** "2048 x 2048" for a square pixel budget. */
function area(/** @type {number} */ pixels) {
  const side = Math.sqrt(pixels);
  return Number.isInteger(side) ? `${side} x ${side}` : String(pixels);
}

/**
 * Why the app would refuse `bytes` under `limits`, or null when it takes
 * them. imageWithinLimits, the app's own check, decides; the rest only words
 * its answer.
 *
 * @param {Uint8Array} bytes
 * @param {ImageLimits} limits
 * @param {string} what  "template previews", "images"
 */
function imageProblem(bytes, limits, what) {
  if (imageWithinLimits(bytes, limits)) return null;
  if (bytes.byteLength > limits.maxBytes) return tooLarge(limits, what);
  const type = sniffImageExt(bytes);
  if (!type) return 'is not a PNG, JPEG or WebP image';
  const size = readImageSize(bytes, type);
  if (!size) return `is a ${TYPE_NAMES[type]} image whose header does not state its size`;
  return `is ${size.width} x ${size.height} px, more than ${what} may have (${limits.maxSide} px per side, ${area(limits.maxPixels)} px in all)`;
}

/** Parsed JSON file, or `fallback` when it is missing or unreadable. */
export function readJsonOr(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Computes the index and the hash file for a gallery folder without writing
 * anything. `problems` lists templates that cannot be published as they are.
 *
 * @param {string} galleryDir
 * @param {{ now?: Date, previous?: GalleryIndex | null, previousHashes?: GalleryHashes }} [options]
 * @returns {{ index: GalleryIndex, hashes: GalleryHashes, problems: string[] }}
 */
export function buildGalleryIndex(galleryDir, options = {}) {
  const previous = options.previous !== undefined ? options.previous : readJsonOr(join(galleryDir, INDEX_FILE), null);
  const previousHashes = options.previousHashes ?? readJsonOr(join(galleryDir, HASHES_FILE), {});
  const templatesDir = join(galleryDir, 'templates');
  const folders = isDir(templatesDir) ? readdirSync(templatesDir).filter((d) => !d.startsWith('.') && isDir(join(templatesDir, d))).sort() : [];
  /** @type {string[]} */
  const problems = [];
  /** @type {GalleryEntry[]} */
  const templates = [];
  /** @type {GalleryHashes} */
  const hashes = {};

  for (const folder of folders) {
    const dir = join(templatesDir, folder);
    const file = join(dir, 'template.json');
    if (!isFile(file)) {
      problems.push(`${folder}: template.json is missing`);
      continue;
    }
    const bytes = readFileSync(file);
    let t;
    try {
      t = JSON.parse(bytes.toString('utf8'));
    } catch (e) {
      problems.push(`${folder}: template.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      problems.push(`${folder}: template.json must hold an object`);
      continue;
    }
    if (t.format !== 'wajha.template') problems.push(`${folder}: "format" must be "wajha.template"`);
    if (t.version !== 1) problems.push(`${folder}: "version" must be 1`);
    if (typeof t.id !== 'string' || !ID_RE.test(t.id) || t.id.length > LIMITS.id) problems.push(`${folder}: "id" must be kebab-case, at most ${LIMITS.id} characters`);
    else if (WINDOWS_DEVICE_RE.test(t.id)) problems.push(`${folder}: "id" must not be a name Windows reserves (con, prn, aux, nul, com1-9, lpt1-9)`);
    else if (t.id !== folder) problems.push(`${folder}: the folder must be named after the template id "${t.id}"`);
    if (!oneLine(t.name, LIMITS.name)) problems.push(`${folder}: "name" is required`);
    if (!Array.isArray(t.slides) || t.slides.length === 0) problems.push(`${folder}: "slides" must list at least one slide`);
    if (t.category !== undefined && !CATEGORIES.includes(t.category)) problems.push(`${folder}: "category" must be one of ${CATEGORIES.join(', ')}`);

    const preview = join(dir, PREVIEW_FILE);
    const previewBytes = isFile(preview) ? statSync(preview).size : null;
    if (previewBytes === null) problems.push(`${folder}: ${PREVIEW_FILE} is missing (render it with scripts/gallery-previews.test.ts)`);
    else {
      // Past its byte limit a file is not even read, as the app stops downloading there.
      const what = 'template previews';
      const problem = previewBytes > THUMBNAIL_LIMITS.maxBytes ? tooLarge(THUMBNAIL_LIMITS, what) : imageProblem(readFileSync(preview), THUMBNAIL_LIMITS, what);
      if (problem) problems.push(`${folder}: ${PREVIEW_FILE} ${problem}, so the app would not show it`);
    }

    const assets = [];
    let size = bytes.byteLength + (previewBytes ?? 0);
    const assetMap = t.assets && typeof t.assets === 'object' && !Array.isArray(t.assets) ? t.assets : {};
    for (const assetId of Object.keys(assetMap).sort()) {
      if (!ASSET_RE.test(assetId)) {
        problems.push(`${folder}: asset id "${assetId}" must look like <sha256>.png|jpg|webp`);
        continue;
      }
      const path = join(dir, 'assets', assetId);
      if (!isFile(path)) {
        problems.push(`${folder}: assets/${assetId} is missing`);
        continue;
      }
      const assetSize = statSync(path).size;
      if (assetSize > IMAGE_LIMITS.maxBytes) {
        problems.push(`${folder}: assets/${assetId} ${tooLarge(IMAGE_LIMITS, 'images')}, so the app would not install the template`);
        continue;
      }
      const assetBytes = readFileSync(path);
      if (sha256(assetBytes) !== assetId.slice(0, 64)) problems.push(`${folder}: assets/${assetId} does not match its name (SHA-256)`);
      // The app installs an image only when it is the type its name says, within the image limits.
      const ext = assetId.slice(65);
      const type = sniffImageExt(assetBytes);
      const problem = type && type !== ext ? `holds ${TYPE_NAMES[type]} data, not ${TYPE_NAMES[ext]}` : imageProblem(assetBytes, IMAGE_LIMITS, 'images');
      if (problem) problems.push(`${folder}: assets/${assetId} ${problem}, so the app would not install the template`);
      assets.push(`templates/${folder}/assets/${assetId}`);
      size += assetBytes.byteLength;
    }

    const hash = sha256(bytes);
    const known = previousHashes[folder];
    const listed = previous && Array.isArray(previous.templates) ? previous.templates.find((e) => e && e.id === folder) : undefined;
    // Same file: same version. Changed file: one more. No record yet: keep what the index says (or start at 1).
    const version = known ? (known.sha256 === hash ? known.version : known.version + 1) : Number.isInteger(listed?.version) && listed.version > 0 ? listed.version : 1;
    hashes[folder] = { sha256: hash, version };

    const tags = [];
    for (const tag of Array.isArray(t.tags) ? t.tags : []) {
      const clean = oneLine(tag, LIMITS.tag);
      if (clean && !tags.includes(clean) && tags.length < LIMITS.tags) tags.push(clean);
    }
    templates.push({
      id: folder,
      name: oneLine(t.name, LIMITS.name) || folder,
      author: oneLine(t.author, LIMITS.name),
      description: typeof t.description === 'string' ? t.description.trim().slice(0, LIMITS.description) : '',
      category: CATEGORIES.includes(t.category) ? t.category : 'minimal',
      tags,
      version,
      template: `templates/${folder}/template.json`,
      preview: `templates/${folder}/${PREVIEW_FILE}`,
      assets,
      bytes: size,
    });
  }

  const unchanged = previous && typeof previous.updatedAt === 'string' && JSON.stringify(previous.templates) === JSON.stringify(templates);
  const updatedAt = unchanged ? previous.updatedAt : (options.now ?? new Date()).toISOString();
  return { index: { format: 'wajha.gallery', version: 1, updatedAt, templates }, hashes, problems };
}

/** Pretty JSON with a trailing newline, the way the gallery files are committed. */
export const formatJson = (/** @type {unknown} */ value) => `${JSON.stringify(value, null, 2)}\n`;

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const at = args.indexOf('--gallery');
  const galleryDir = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : resolve(fileURLToPath(new URL('../gallery', import.meta.url)));
  const { index, hashes, problems } = buildGalleryIndex(galleryDir);
  if (problems.length) {
    console.error(`gallery: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const indexPath = join(galleryDir, INDEX_FILE);
  const hashesPath = join(galleryDir, HASHES_FILE);
  if (check) {
    const stale = (path, value) => !existsSync(path) || readFileSync(path, 'utf8') !== formatJson(value);
    if (stale(indexPath, index) || stale(hashesPath, hashes)) {
      console.error('gallery: index.json is out of date; run `npm run gallery:index` and commit the result.');
      process.exit(1);
    }
    console.log(`gallery: index.json is up to date (${index.templates.length} templates).`);
    return;
  }
  writeFileSync(indexPath, formatJson(index));
  writeFileSync(hashesPath, formatJson(hashes));
  console.log(`gallery: wrote index.json with ${index.templates.length} templates (${index.templates.map((e) => `${e.id} v${e.version}`).join(', ')}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

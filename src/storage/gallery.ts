/**
 * Community gallery: a static folder of the GitHub repository served through
 * jsDelivr (index.json plus templates/<id>/...). This is the app's only
 * network access, and it degrades to the last cached index when offline.
 */
import { GALLERY_BASE_URL } from '../config';
import type { GalleryEntry, GalleryIndex, Template } from '../model/types';
import { validateGalleryIndex, validateTemplate } from '../model/validate';
import { getPlatform } from '../platform';
import { MAX_IMAGE_BYTES, MAX_MANIFEST_BYTES, TEMPLATE_ARCHIVE_MAX_BYTES, THUMBNAIL_LIMITS, imageWithinLimits } from '../platform/limits';
import { isAssetId, pathProblem } from '../platform/paths';
import { keepAssets, usedAssetIds, withPresentAssets } from './refs';
import { GALLERY_CACHE_FILE, StorageError, assertTemplateId, fromUtf8, isFiniteNumber, isRecord, mapLimit, reason, serial } from './shared';
import { assetProblem, writeTemplateFiles } from './templates';

export interface GalleryResult {
  index: GalleryIndex;
  /** true when the network failed and the cached copy was used */
  offline: boolean;
  fetchedAt: number;
}

export const GALLERY_TIMEOUT_MS = 6000;
export const GALLERY_INSTALL_TIMEOUT_MS = 60_000;
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_TEMPLATE_ASSETS = 500;
/** Downloads in flight while installing; each holds one image in memory. */
const INSTALL_CONCURRENCY = 4;

/** `relPath` under GALLERY_BASE_URL, joined with exactly one slash. */
export function galleryUrl(relPath: string): string {
  return `${GALLERY_BASE_URL.replace(/\/+$/, '')}/${String(relPath).replace(/^\/+/, '')}`;
}

/* Network helpers --------------------------------------------------- */

/** Bytes still allowed for one download, and for the set of parallel downloads (`parent`) it is part of. */
class ByteBudget {
  private remaining: number;
  private readonly parent: ByteBudget | null;
  constructor(limit: number, parent: ByteBudget | null = null) {
    this.remaining = limit;
    this.parent = parent;
  }
  available(): number {
    return Math.min(this.remaining, this.parent ? this.parent.available() : Infinity);
  }
  take(n: number): void {
    this.remaining -= n;
    this.parent?.take(n);
    if (this.remaining < 0) throw new StorageError('too_large', 'The gallery download is larger than expected.');
  }
}

/**
 * Runs `run` with an abort signal that fires after `ms`. The race also
 * settles when a fetch implementation ignores the signal; whatever is still
 * downloading is aborted once the result is known.
 */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new StorageError('network', `The gallery did not answer within ${Math.round(ms / 1000)} s.`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function readBody(res: Response, budget: ByteBudget): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > budget.available()) budget.take(declared);
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    budget.take(bytes.byteLength);
    return bytes;
  }
  // Streamed so an oversized answer is cut off instead of buffered whole.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      budget.take(value.byteLength);
      chunks.push(value);
      length += value.byteLength;
    }
  } catch (e) {
    reader.cancel().catch(() => undefined);
    throw e;
  }
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function fetchFile(url: string, signal: AbortSignal, budget: ByteBudget, cache: RequestCache): Promise<Uint8Array> {
  let res: Response;
  try {
    // No cookies: the CDN has no business knowing who browses the gallery.
    res = await fetch(url, { signal, cache, credentials: 'omit' });
  } catch (e) {
    throw new StorageError('network', `Could not reach the gallery (${reason(e)}).`, { cause: e });
  }
  if (!res.ok) {
    res.body?.cancel().catch(() => undefined);
    throw new StorageError('network', `The gallery answered ${res.status} for ${url}.`);
  }
  return readBody(res, budget);
}

function parseJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(fromUtf8(bytes));
  } catch (e) {
    throw new StorageError('invalid_file', `${what} is not valid JSON.`, { cause: e });
  }
}

/* Index --------------------------------------------------------------- */

async function readGalleryCache(): Promise<{ index: GalleryIndex; fetchedAt: number } | null> {
  try {
    const text = await getPlatform().readText(GALLERY_CACHE_FILE);
    if (text === null) return null;
    const json: unknown = JSON.parse(text);
    if (!isRecord(json) || !isFiniteNumber(json.fetchedAt)) return null;
    return { index: validateGalleryIndex(json.index), fetchedAt: json.fetchedAt };
  } catch {
    return null;
  }
}

async function writeGalleryCache(index: GalleryIndex, fetchedAt: number): Promise<void> {
  try {
    await serial('gallery-cache', () => getPlatform().write(GALLERY_CACHE_FILE, JSON.stringify({ fetchedAt, index })));
  } catch {
    // The gallery still works now; it just will not be available offline.
  }
}

/** Fetches the index (falls back to the cached copy when offline). null when neither is available. */
export async function fetchGallery(): Promise<GalleryResult | null> {
  let index: GalleryIndex;
  try {
    const json = await withTimeout(GALLERY_TIMEOUT_MS, async (signal) =>
      parseJson(await fetchFile(galleryUrl('index.json'), signal, new ByteBudget(MAX_INDEX_BYTES), 'no-cache'), 'The gallery index'),
    );
    index = validateGalleryIndex(json);
  } catch {
    const cached = await readGalleryCache();
    return cached ? { index: cached.index, offline: true, fetchedAt: cached.fetchedAt } : null;
  }
  const fetchedAt = Date.now();
  await writeGalleryCache(index, fetchedAt);
  return { index, offline: false, fetchedAt };
}

/**
 * A gallery entry's preview image, downloaded within the thumbnail limits and
 * checked like any thumbnail; null when it is missing, too large or not an
 * image. Show previews from these bytes rather than from the CDN URL, so the
 * webview never decodes an image nobody has checked.
 */
export async function fetchGalleryPreview(entry: GalleryEntry): Promise<Uint8Array | null> {
  if (typeof entry.preview !== 'string' || entry.preview === '') return null;
  try {
    const url = galleryUrl(galleryPath(entry.preview));
    const bytes = await withTimeout(GALLERY_TIMEOUT_MS, (signal) => fetchFile(url, signal, new ByteBudget(THUMBNAIL_LIMITS.maxBytes), 'default'));
    return imageWithinLimits(bytes, THUMBNAIL_LIMITS) ? bytes : null;
  } catch {
    return null;
  }
}

/* Install --------------------------------------------------------------- */

/** URL parsing treats "%2e%2e" like "..", so percent-encoded segments are checked once decoded. */
function unsafeWhenDecoded(segment: string): boolean {
  if (!segment.includes('%')) return false;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded === '.' || decoded === '..' || /[\\/?#]/.test(decoded);
  } catch {
    return true;
  }
}

/**
 * A gallery-relative path that stays inside the gallery folder once resolved
 * as a URL (no "..", schemes, queries or fragments), without leading slashes.
 */
export function galleryPath(rel: unknown): string {
  const path = typeof rel === 'string' ? rel.replace(/^\/+/, '') : '';
  if (pathProblem(path) !== null || /[?#]/.test(path) || path.split('/').some(unsafeWhenDecoded)) {
    throw new StorageError('invalid_file', `The gallery lists an unsafe path ${JSON.stringify(String(rel).slice(0, 120))}.`);
  }
  return path;
}

/** Downloads, validates and stores a gallery template under templates/<id>. */
export async function installGalleryTemplate(entry: GalleryEntry): Promise<Template> {
  const id = assertTemplateId(entry.id);
  const templatePath = galleryPath(entry.template);
  const previewPath = typeof entry.preview === 'string' && entry.preview !== '' ? galleryPath(entry.preview) : null;
  const listed = Array.isArray(entry.assets) ? entry.assets : [];
  if (listed.length > MAX_TEMPLATE_ASSETS) throw new StorageError('too_large', 'The gallery template lists too many images.');
  // Asset files are named by their content hash; one download per distinct name.
  const assetPaths = new Map<string, string>();
  for (const rel of listed) {
    const path = galleryPath(rel);
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!isAssetId(name)) throw new StorageError('invalid_file', `The gallery lists an image with an invalid name: ${name}.`);
    if (!assetPaths.has(name)) assetPaths.set(name, path);
  }

  // A template is never larger than a .wajha-template file may be; each file has its own limit within that.
  const total = new ByteBudget(TEMPLATE_ARCHIVE_MAX_BYTES);
  const downloaded = await withTimeout(GALLERY_INSTALL_TIMEOUT_MS, async (signal) => {
    const get = (path: string, limit: number, cache: RequestCache) => fetchFile(galleryUrl(path), signal, new ByteBudget(limit, total), cache);
    const [templateBytes, preview, assets] = await Promise.all([
      get(templatePath, MAX_MANIFEST_BYTES, 'no-cache'),
      // The preview is cosmetic: a missing one does not fail the install.
      previewPath ? get(previewPath, THUMBNAIL_LIMITS.maxBytes, 'default').catch(() => null) : null,
      mapLimit([...assetPaths], INSTALL_CONCURRENCY, async ([name, path]) => [name, await get(path, MAX_IMAGE_BYTES, 'default')] as const),
    ]);
    return { json: parseJson(templateBytes, 'The gallery template'), preview, assets };
  });

  let template: Template;
  try {
    // Against the images the entry lists: a reference to any other one is dropped.
    template = validateTemplate(withPresentAssets(downloaded.json, assetPaths));
  } catch (e) {
    throw new StorageError('invalid_file', `The gallery template "${id}" is invalid: ${reason(e)}`, { cause: e });
  }
  if (template.id !== id) {
    throw new StorageError('invalid_file', `The gallery template "${template.id}" was listed as "${id}".`);
  }
  const used = usedAssetIds(template);
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of downloaded.assets) {
    const problem = await assetProblem(name, bytes);
    if (problem) throw new StorageError('invalid_file', `The gallery image ${name} cannot be used: ${problem}.`);
    if (used.has(name)) files.set(name, bytes);
  }
  const preview = downloaded.preview && imageWithinLimits(downloaded.preview, THUMBNAIL_LIMITS) ? downloaded.preview : null;
  const installed = keepAssets(template, used);
  await writeTemplateFiles(installed, preview, files);
  return installed;
}

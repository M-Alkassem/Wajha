/**
 * Pieces shared by the storage modules: the on-disk layout, id checks, the
 * error type the UI can branch on, JSON helpers and a per-key task queue.
 */
import { isId, isTemplateId } from '../model/rules';
import { PlatformError } from '../platform/types';

/* Errors ------------------------------------------------------------ */

export type StorageErrorCode =
  /** The project or template does not exist. */
  | 'not_found'
  /** A stored file is damaged (invalid JSON or failed validation). */
  | 'corrupt'
  /** An imported or downloaded file is not what it claims to be. */
  | 'invalid_file'
  /** An archive or download exceeds the safety limits. */
  | 'too_large'
  /** The gallery could not be reached or answered with an error. */
  | 'network';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
    this.code = code;
  }
}

/** Short, human-readable reason from anything thrown. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* Layout ------------------------------------------------------------ */

export const PROJECTS_DIR = 'projects';
export const TEMPLATES_DIR = 'templates';
export const SETTINGS_FILE = 'settings.json';
export const GALLERY_CACHE_FILE = 'cache/gallery-index.json';

export const projectDir = (id: string) => `${PROJECTS_DIR}/${id}`;
export const projectFile = (id: string) => `${PROJECTS_DIR}/${id}/project.json`;
export const metaFile = (id: string) => `${PROJECTS_DIR}/${id}/meta.json`;
export const thumbFile = (id: string) => `${PROJECTS_DIR}/${id}/thumb.jpg`;
export const projectAssetsDir = (id: string) => `${PROJECTS_DIR}/${id}/assets`;
export const projectAssetFile = (id: string, assetId: string) => `${PROJECTS_DIR}/${id}/assets/${assetId}`;

export const templateDir = (id: string) => `${TEMPLATES_DIR}/${id}`;
export const templateFile = (id: string) => `${TEMPLATES_DIR}/${id}/template.json`;
export const previewFile = (id: string) => `${TEMPLATES_DIR}/${id}/preview.jpg`;
export const templateAssetsDir = (id: string) => `${TEMPLATES_DIR}/${id}/assets`;
export const templateAssetFile = (id: string, assetId: string) => `${TEMPLATES_DIR}/${id}/assets/${assetId}`;

/**
 * Ids name folders, so they are checked here rather than left to the platform
 * ("a/b" is a valid path, just not the project's). The rules are the model's:
 * an id the validator would reject on the next load must never be written.
 */
function checkedId(id: string, what: string, valid: (v: unknown) => boolean): string {
  if (!valid(id)) {
    const shown = typeof id === 'string' ? JSON.stringify(id.length > 80 ? `${id.slice(0, 80)}…` : id) : String(id);
    throw new PlatformError('invalid_path', `Invalid ${what} ${shown}`);
  }
  return id;
}

export const assertProjectId = (id: string) => checkedId(id, 'project id', isId);
export const assertTemplateId = (id: string) => checkedId(id, 'template id', isTemplateId);
export { isId as isProjectId, isTemplateId };

/** Longest id the model accepts. */
export const MAX_ID_CHARS = 64;

/* JSON and text ----------------------------------------------------- */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s: string): Uint8Array => encoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => decoder.decode(b);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Names are limited to 200 characters by the validators; cut by code points so emoji stay whole. */
export const MAX_NAME_CHARS = 200;

/** `name` with `suffix`, shortened so the result still fits MAX_NAME_CHARS. */
export function withSuffix(name: string, suffix: string): string {
  const room = Math.max(0, MAX_NAME_CHARS - Array.from(suffix).length);
  return Array.from(name).slice(0, room).join('') + suffix;
}

export const IMPORTED_SUFFIX = ' (imported)';

/* Concurrency ------------------------------------------------------- */

const chains = new Map<string, Promise<void>>();
const settle = () => undefined;

/**
 * Runs tasks that share a key one after another. Platform writes are atomic
 * per file but may complete out of order (Tauri runs commands on a thread
 * pool), so without this an older autosave could land after a newer one.
 */
export function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const result = previous.then(task);
  const tail = result.then(settle, settle);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return result;
}

/** Like Promise.all over `items`, with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

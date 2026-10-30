/**
 * Input checks shared by the platform implementations. The library path rules
 * mirror the Rust side (src-tauri) exactly, so code that passes the unit tests
 * on the memory platform and works in the browser build also works on the
 * desktop. Lengths are UTF-8 bytes, like Rust's `str::len`.
 */
import { megabytes, sniffImageExt } from './limits';
import { PlatformError, type ImageExt } from './types';

export const MAX_PATH_BYTES = 512;
export const MAX_SEGMENT_BYTES = 255;

const ASSET_ID = /^[0-9a-f]{64}\.(png|jpg|webp)$/;

/** Bytes needed to encode `s` as UTF-8 (unpaired surrogates count as U+FFFD). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && isLowSurrogate(s.charCodeAt(i + 1))) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Why `name` is not a valid single path segment, or null when it is. */
export function segmentProblem(name: string): string | null {
  if (name === '') return 'empty path segment';
  if (name === '.' || name === '..') return `"${name}" segments are not allowed`;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    // C0, DEL and C1: the same set as Rust's char::is_control.
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return 'control characters are not allowed';
    if (c === 0x2f) return 'slashes are not allowed in a name';
    if (c === 0x5c) return 'backslashes are not allowed';
    if (c === 0x3a) return 'colons are not allowed';
    if (c >= 0xd800 && c <= 0xdbff) {
      if (!isLowSurrogate(name.charCodeAt(i + 1))) return 'unpaired surrogate';
      i++;
    } else if (isLowSurrogate(c)) return 'unpaired surrogate';
  }
  if (utf8Length(name) > MAX_SEGMENT_BYTES) return `path segment is longer than ${MAX_SEGMENT_BYTES} bytes`;
  return null;
}

/** Why `path` is not a valid relative library path, or null when it is. */
export function pathProblem(path: unknown): string | null {
  if (typeof path !== 'string') return 'path is not a string';
  if (path === '') return 'path is empty';
  // UTF-16 length never exceeds the UTF-8 length, so this cheaply rejects huge inputs.
  if (path.length > MAX_PATH_BYTES) return `path is longer than ${MAX_PATH_BYTES} bytes`;
  if (path.charCodeAt(0) === 0x2f) return 'path must be relative';
  const segments = path.split('/');
  let bytes = segments.length - 1;
  for (const segment of segments) {
    const problem = segmentProblem(segment);
    if (problem) return problem;
    bytes += utf8Length(segment);
  }
  if (bytes > MAX_PATH_BYTES) return `path is longer than ${MAX_PATH_BYTES} bytes`;
  return null;
}

/** Keeps error messages readable when the offending input is huge. */
function quote(value: unknown): string {
  const s = typeof value === 'string' ? value : String(value);
  return JSON.stringify(s.length > 120 ? `${s.slice(0, 120)}…` : s);
}

/** Returns `path` or throws PlatformError("invalid_path"). */
export function validateLibraryPath(path: string): string {
  const problem = pathProblem(path);
  if (problem) throw new PlatformError('invalid_path', `Invalid path ${quote(path)}: ${problem}`);
  return path;
}

export function isValidPathSegment(name: unknown): name is string {
  return typeof name === 'string' && segmentProblem(name) === null;
}

/** Returns `name` when it is safe as one path segment (a project or template id), else throws "invalid_path". */
export function validatePathSegment(name: string, what = 'name'): string {
  const problem = typeof name === 'string' ? segmentProblem(name) : 'not a string';
  if (problem) throw new PlatformError('invalid_path', `Invalid ${what} ${quote(name)}: ${problem}`);
  return name;
}

/**
 * Names of the direct children of `dir` among `keys` (full file paths), for
 * stores that keep files flat and only imply directories.
 */
export function directChildren(dir: string, keys: Iterable<string>): { files: string[]; dirs: string[] } {
  const prefix = `${dir}/`;
  const files: string[] = [];
  const dirs = new Set<string>();
  for (const key of keys) {
    if (!key.startsWith(prefix) || key.length === prefix.length) continue;
    const slash = key.indexOf('/', prefix.length);
    if (slash === -1) files.push(key.slice(prefix.length));
    else dirs.add(key.slice(prefix.length, slash));
  }
  return { files, dirs: [...dirs] };
}

/* Assets ---------------------------------------------------------- */

export function isImageExt(value: unknown): value is ImageExt {
  return value === 'png' || value === 'jpg' || value === 'webp';
}

/** "<64 hex>.<png|jpg|webp>", the only file names allowed in assets folders. */
export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && ASSET_ID.test(value);
}

// Lives with the image header reader in limits.ts; re-exported for the code that imports it from here.
export { sniffImageExt };

/**
 * Checks putAsset's inputs the way the Rust command does: a safe project id,
 * a known extension, and bytes whose signature matches that extension.
 */
export function checkAssetInput(projectId: string, data: Uint8Array, ext: ImageExt): void {
  validatePathSegment(projectId, 'project id');
  if (!isImageExt(ext)) throw new PlatformError('invalid_data', `Unsupported image type ${quote(ext)}`);
  if (!(data instanceof Uint8Array)) throw new PlatformError('invalid_data', 'Image data must be bytes');
  const actual = sniffImageExt(data);
  if (actual === null) throw new PlatformError('invalid_data', 'Not a PNG, JPEG or WebP image');
  if (actual !== ext) throw new PlatformError('invalid_data', `The data is ${actual.toUpperCase()}, not ${ext.toUpperCase()}`);
}

/** Library path of a stored asset. */
export const assetPath = (projectId: string, assetId: string) => `projects/${projectId}/assets/${assetId}`;

/* Misc ------------------------------------------------------------ */

/** The error for a file over its limit, worded like the Rust shell's: "shot.png is larger than 100 MB". */
export function tooLargeError(name: string, limit: number): PlatformError {
  return new PlatformError('invalid_data', `${name || 'The file'} is larger than ${megabytes(limit)}`);
}

/** True for absolute https:// URLs, the only kind openUrl accepts. */
export function isHttpsUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 8192) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * The same bytes as an exact, ArrayBuffer-backed view. Structured clone and
 * raw IPC bodies would otherwise carry a subarray's whole underlying buffer.
 */
export function exactBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  if (data.buffer instanceof ArrayBuffer && data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data as Uint8Array<ArrayBuffer>;
  }
  return data.slice() as Uint8Array<ArrayBuffer>;
}

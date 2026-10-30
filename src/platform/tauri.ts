/**
 * Desktop Platform: every method maps to one of the Rust commands listed in
 * docs/ARCHITECTURE.md 6.3. Binary payloads travel as raw IPC bodies with
 * their metadata in URI-encoded headers (header values must be ASCII), and
 * binary responses arrive as ArrayBuffers. Rust errors are "code: message"
 * strings, mapped to PlatformError here.
 */
import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { wellFormed } from '../model/rules';
import type {
  AppInfo,
  DirEntry,
  ExportTarget,
  ImageExt,
  OpenedFile,
  OsKind,
  PickedImage,
  Platform,
  PlatformErrorCode,
} from './types';
import { PlatformError } from './types';
import { OPEN_FILE_MAX_BYTES } from './limits';
import { checkAssetInput, exactBytes, isAssetId, isHttpsUrl, tooLargeError, validateLibraryPath, validatePathSegment } from './paths';

const ERROR_CODES: ReadonlySet<string> = new Set<PlatformErrorCode>([
  'not_found',
  'invalid_path',
  'invalid_data',
  'permission',
  'cancelled',
  'io',
]);

/** Maps a rejected invoke to a PlatformError: "not_found: x" -> code not_found, message "x"; unknown codes -> io. */
export function toPlatformError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  // A structured { code, message } error, should the shell ever send one.
  if (typeof error === 'object' && error !== null) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && ERROR_CODES.has(code)) {
      return new PlatformError(code as PlatformErrorCode, typeof message === 'string' && message ? message : code);
    }
  }
  let text: string;
  if (typeof error === 'string') text = error;
  else if (error instanceof Error) text = error.message;
  else if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    text = (error as { message: string }).message;
  } else {
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      text = String(error);
    }
  }
  const match = /^([a-z_]+):\s*([\s\S]*)$/.exec(text);
  if (match && ERROR_CODES.has(match[1])) {
    return new PlatformError(match[1] as PlatformErrorCode, match[2] || match[1]);
  }
  return new PlatformError('io', text || 'Unknown desktop error');
}

/** Raw IPC responses are ArrayBuffers; older IPC paths serialise Vec<u8> as number arrays. */
export function toBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return Uint8Array.from(items, (n) => (typeof n === 'number' ? n : 0));
  }
  throw new PlatformError('io', 'Unexpected binary response from the desktop shell');
}

/**
 * Header-safe encoding of a path or name; the Rust side percent-decodes it.
 * Unpaired surrogates, which encodeURIComponent throws on, become U+FFFD.
 */
export const headerValue = (s: string) => encodeURIComponent(wellFormed(s));

/** Folder name shown for an export destination: the last segment of a POSIX or Windows path. */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function normalizeOs(os: unknown): OsKind {
  if (os === 'macos' || os === 'windows' || os === 'linux') return os;
  if (os === 'darwin') return 'macos';
  // The other desktop targets Tauri supports (BSDs) behave like Linux for us.
  return 'linux';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function call<T>(cmd: string, args?: InvokeArgs, headers?: Record<string, string>): Promise<T> {
  try {
    return await invoke<T>(cmd, args, headers ? { headers } : undefined);
  } catch (e) {
    throw toPlatformError(e);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createTauriPlatform(): Platform {
  let infoPromise: Promise<AppInfo> | null = null;
  let fontsPromise: Promise<string[]> | null = null;

  const platform: Platform = {
    kind: 'desktop',

    info() {
      if (!infoPromise) {
        const pending = call<unknown>('app_info').then((raw): AppInfo => {
          const r = isRecord(raw) ? raw : {};
          return {
            kind: 'desktop',
            os: normalizeOs(r.os),
            version: typeof r.version === 'string' ? r.version : '0.0.0',
            dataDir: typeof r.dataDir === 'string' ? r.dataDir : '',
          };
        });
        infoPromise = pending;
        // A failure is not cached, so the next call asks again.
        pending.catch(() => {
          if (infoPromise === pending) infoPromise = null;
        });
      }
      return infoPromise;
    },

    async read(path) {
      validateLibraryPath(path);
      try {
        return toBytes(await call<unknown>('store_read', { path }));
      } catch (e) {
        if (e instanceof PlatformError && e.code === 'not_found') return null;
        throw e;
      }
    },

    async readText(path) {
      const bytes = await platform.read(path);
      return bytes === null ? null : decoder.decode(bytes);
    },

    async write(path, data) {
      validateLibraryPath(path);
      const bytes = typeof data === 'string' ? encoder.encode(data) : exactBytes(data);
      await call<void>('store_write', bytes, { 'x-path': headerValue(path) });
    },

    async list(dir) {
      validateLibraryPath(dir);
      const raw = await call<unknown>('store_list', { dir });
      if (!Array.isArray(raw)) return [];
      const items: unknown[] = raw;
      const entries: DirEntry[] = [];
      for (const item of items) {
        if (!isRecord(item) || typeof item.name !== 'string') continue;
        entries.push({ name: item.name, isDir: item.isDir === true, size: finite(item.size), modifiedMs: finite(item.modifiedMs) });
      }
      return entries;
    },

    async remove(path) {
      validateLibraryPath(path);
      await call<void>('store_remove', { path });
    },

    async putAsset(projectId: string, data: Uint8Array, ext: ImageExt) {
      checkAssetInput(projectId, data, ext);
      const id = await call<unknown>('asset_put', exactBytes(data), { 'x-project': headerValue(projectId), 'x-ext': ext });
      if (!isAssetId(id)) throw new PlatformError('io', 'The desktop shell returned an invalid asset id');
      return id;
    },

    async pickImages(projectId) {
      validatePathSegment(projectId, 'project id');
      const raw = await call<unknown>('pick_images', { projectId });
      if (!Array.isArray(raw)) return [];
      const items: unknown[] = raw;
      const out: PickedImage[] = [];
      for (const item of items) {
        if (!isRecord(item) || !isAssetId(item.assetId)) continue;
        out.push({ assetId: item.assetId, name: typeof item.name === 'string' ? item.name : item.assetId, bytes: finite(item.bytes) });
      }
      return out;
    },

    async pickExportTarget(suggestedName) {
      // serde refuses unpaired surrogates in a String argument.
      const path = await call<unknown>('pick_export_dir', { suggestedName: wellFormed(suggestedName) });
      if (typeof path !== 'string' || path === '') return null;
      return { id: path, label: lastSegment(path), path };
    },

    async exportWrite(target: ExportTarget, relPath, data) {
      if (!target.path) throw new PlatformError('invalid_path', 'The export target has no folder');
      validateLibraryPath(relPath);
      await call<void>('export_write', exactBytes(data), {
        'x-root': headerValue(target.path),
        'x-path': headerValue(relPath),
      });
    },

    async exportFinish() {
      // Files are already on disk.
    },

    async revealTarget(target) {
      if (target.path) await call<void>('reveal_path', { path: target.path });
    },

    async openFile(kind): Promise<OpenedFile | null> {
      if (kind !== 'project' && kind !== 'template' && kind !== 'csv') throw new PlatformError('invalid_data', 'Unknown file kind');
      const picked = await call<unknown>('open_file_pick', { kind });
      if (!isRecord(picked) || typeof picked.token !== 'string') return null;
      const name = typeof picked.name === 'string' ? picked.name : '';
      const data = toBytes(await call<unknown>('open_file_read', { token: picked.token }));
      // The shell refuses larger files before reading them; this keeps the contract with an older shell.
      if (data.byteLength > OPEN_FILE_MAX_BYTES[kind]) throw tooLargeError(name, OPEN_FILE_MAX_BYTES[kind]);
      return { name, data };
    },

    async saveFile(suggestedName, data) {
      const saved = await call<unknown>('save_file', exactBytes(data), { 'x-name': headerValue(suggestedName) });
      return typeof saved === 'string' && saved !== '' ? saved : null;
    },

    systemFonts() {
      if (!fontsPromise) {
        const pending = call<unknown>('system_fonts').then((raw) => {
          if (!Array.isArray(raw)) return [];
          const items: unknown[] = raw;
          return items.filter((f): f is string => typeof f === 'string');
        });
        fontsPromise = pending;
        pending.catch(() => {
          if (fontsPromise === pending) fontsPromise = null;
        });
      }
      // Fonts are optional; a failure only means no system fonts in the picker.
      return fontsPromise.then((fonts) => [...fonts], () => []);
    },

    async openUrl(url) {
      if (!isHttpsUrl(url)) throw new PlatformError('invalid_data', 'Only https:// links can be opened');
      await call<void>('open_url', { url });
    },
  };
  return platform;
}

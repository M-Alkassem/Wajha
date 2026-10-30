/**
 * Browser build of the Platform (demo site and end-to-end tests): library
 * files live in IndexedDB, pickers are hidden <input type=file> elements, and
 * exports and saves become downloads.
 *
 * Storage layout: database "wajha", object store "files", key = library path,
 * value = { data: Uint8Array, modifiedMs }. Directories are implicit in the
 * keys, like object storage. IndexedDB cannot read a value's size without
 * loading it, so list() reports sizes and dates as 0 (nothing needs them).
 */
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { AppInfo, DirEntry, ExportTarget, ImageExt, OpenedFile, PickedImage, Platform } from './types';
import { PlatformError } from './types';
import { MAX_IMAGE_BYTES, OPEN_FILE_MAX_BYTES } from './limits';
import {
  assetPath,
  checkAssetInput,
  directChildren,
  exactBytes,
  isHttpsUrl,
  sniffImageExt,
  tooLargeError,
  validateLibraryPath,
  validatePathSegment,
} from './paths';
import { sha256Hex } from './sha256';

/* ------------------------------------------------------------------ */
/* Pure helpers (unit tested)                                          */
/* ------------------------------------------------------------------ */

/**
 * Key bounds selecting everything strictly inside `dir`: [dir + "/", dir + "0").
 * "0" is the code unit right after "/", so the half-open range is exact.
 */
export function childKeyBounds(dir: string): { lower: string; upper: string } {
  return { lower: `${dir}/`, upper: `${dir}0` };
}

/** PNG, JPEG and WebP are already compressed; deflating them again only costs time. */
export function isStoredUncompressed(name: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(name);
}

/** Largest zip fflate writes without zip64; the browser would struggle long before. */
export const MAX_ZIP_BYTES = 0xffffffff - 64 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 0xffff;

/**
 * Streams entries into a zip Blob. Each entry is turned into a Blob as soon as
 * it is written, so at most one file's bytes are on the JavaScript heap at a
 * time; large exports stay in the browser's blob storage instead.
 */
export async function buildZip(entries: Iterable<readonly [string, Blob | Uint8Array]>): Promise<Blob> {
  const parts: Blob[] = [];
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure ??= err;
    else chunks.push(exactBytes(chunk));
  });
  const flush = () => {
    if (failure) throw failure;
    if (chunks.length) parts.push(new Blob(chunks));
    chunks = [];
  };
  for (const [name, content] of entries) {
    const data = content instanceof Uint8Array ? content : new Uint8Array(await content.arrayBuffer());
    const file = isStoredUncompressed(name) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    zip.add(file);
    file.push(data, true);
    flush();
  }
  zip.end();
  flush();
  return new Blob(parts, { type: 'application/zip' });
}

/** File name safe on every OS for downloads: no separators, reserved or control characters. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = String(name)
    // Control characters are exactly what this must remove.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\-\s]+|[.\s]+$/g, '');
  const chars = Array.from(cleaned);
  return chars.length ? chars.slice(0, 120).join('').trim() : fallback;
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

const DB_NAME = 'wajha';
const STORE = 'files';

interface FileRecord {
  data: Uint8Array;
  modifiedMs: number;
}

function asRecord(value: unknown): FileRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const { data, modifiedMs } = value as { data?: unknown; modifiedMs?: unknown };
  const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (!bytes) return null;
  return { data: bytes, modifiedMs: typeof modifiedMs === 'number' && Number.isFinite(modifiedMs) ? modifiedMs : 0 };
}

function storageError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') return new PlatformError('io', 'Browser storage is full');
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  return new PlatformError('io', `Browser storage failed: ${message}`);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new PlatformError('io', 'Browser storage (IndexedDB) is not available'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      // Some private modes throw synchronously instead of failing the request.
      reject(storageError(e));
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading, or the user clearing site data: reopen on next use.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(storageError(req.error));
  });
  dbPromise = opening;
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/**
 * Runs `body` in one transaction. The promise settles only after the
 * transaction commits, so writes are durable when it resolves; `body` returns
 * a getter for the result because requests finish asynchronously.
 */
async function transact<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => () => T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
    } catch (e) {
      reject(storageError(e));
      return;
    }
    let result: () => T = () => {
      throw new PlatformError('io', 'Browser storage transaction ended early');
    };
    tx.oncomplete = () => {
      try {
        resolve(result());
      } catch (e) {
        reject(e);
      }
    };
    // Unhandled request errors abort the transaction, so this catches them too.
    tx.onabort = () => reject(storageError(tx.error));
    try {
      result = body(tx.objectStore(STORE));
    } catch (e) {
      reject(storageError(e));
      try {
        tx.abort();
      } catch {
        // already finished
      }
    }
  });
}

const childRange = (dir: string) => {
  const { lower, upper } = childKeyBounds(dir);
  return IDBKeyRange.bound(lower, upper, false, true);
};

function idbWrite(path: string, data: Uint8Array): Promise<void> {
  const record: FileRecord = { data: exactBytes(data), modifiedMs: Date.now() };
  return transact('readwrite', (store) => {
    // Same rules as a file system: no file under a file, no file over a directory.
    const ancestors: string[] = [];
    for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) ancestors.push(path.slice(0, i));
    let conflict: string | null = null;
    let pending = ancestors.length + 1;
    const settle = () => {
      if (--pending === 0 && conflict === null) store.put(record, path);
    };
    for (const parent of ancestors) {
      const req = store.count(parent);
      req.onsuccess = () => {
        if (req.result > 0) conflict ??= `${parent} is a file`;
        settle();
      };
    }
    const inside = store.count(childRange(path));
    inside.onsuccess = () => {
      if (inside.result > 0) conflict ??= 'it is a directory';
      settle();
    };
    return () => {
      if (conflict) throw new PlatformError('io', `Cannot write ${path}: ${conflict}`);
    };
  });
}

/* ------------------------------------------------------------------ */
/* Pickers and downloads                                               */
/* ------------------------------------------------------------------ */

/** Opens a file dialog; resolves [] when the user cancels. */
function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.opacity = '0';
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(files);
    };
    const onChange = () => finish(Array.from(input.files ?? []));
    const onCancel = () => finish([]);
    // Browsers without the "cancel" event: focus returns when the dialog closes,
    // and "change" (if any) follows shortly after it.
    const onFocus = () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => finish(Array.from(input.files ?? [])), 1000);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    // Registered after the dialog has taken focus, so the click itself cannot trigger it.
    setTimeout(() => {
      if (!settled) window.addEventListener('focus', onFocus);
    }, 0);
    document.body.appendChild(input);
    input.click();
  });
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away cancels the download in Safari and older Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

interface PendingExport {
  label: string;
  files: Map<string, Blob>;
  bytes: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createWebPlatform(): Platform {
  const exports = new Map<string, PendingExport>();
  const finished = new Set<string>();
  let exportSeq = 0;

  const openExport = (target: ExportTarget): PendingExport => {
    const exp = exports.get(target.id);
    if (!exp) throw new PlatformError('not_found', 'The export was finished or replaced by a newer one');
    return exp;
  };

  const platform: Platform = {
    kind: 'web',

    async info(): Promise<AppInfo> {
      return { kind: 'web', os: 'web', version: '0.1.0', dataDir: 'Browser storage (IndexedDB)' };
    },

    async read(path) {
      validateLibraryPath(path);
      return transact('readonly', (store) => {
        const req = store.get(path);
        return () => asRecord(req.result)?.data ?? null;
      });
    },

    async readText(path) {
      const bytes = await platform.read(path);
      return bytes === null ? null : decoder.decode(bytes);
    },

    async write(path, data) {
      validateLibraryPath(path);
      await idbWrite(path, typeof data === 'string' ? encoder.encode(data) : data);
    },

    async list(dir) {
      validateLibraryPath(dir);
      return transact('readonly', (store) => {
        // Keys only: reading values would load every file's bytes (a project's
        // screenshots) just to report sizes.
        const req = store.getAllKeys(childRange(dir));
        return () => {
          const { files, dirs } = directChildren(dir, req.result.filter((k): k is string => typeof k === 'string'));
          const entries: DirEntry[] = [
            ...dirs.map((name) => ({ name, isDir: true, size: 0, modifiedMs: 0 })),
            ...files.map((name) => ({ name, isDir: false, size: 0, modifiedMs: 0 })),
          ];
          return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        };
      });
    },

    async remove(path) {
      validateLibraryPath(path);
      await transact('readwrite', (store) => {
        store.delete(path);
        store.delete(childRange(path));
        return () => undefined;
      });
    },

    async putAsset(projectId: string, data: Uint8Array, ext: ImageExt) {
      checkAssetInput(projectId, data, ext);
      const id = `${await sha256Hex(data)}.${ext}`;
      const path = assetPath(projectId, id);
      const record: FileRecord = { data: exactBytes(data), modifiedMs: Date.now() };
      await transact('readwrite', (store) => {
        // Content-addressed: an existing file already holds these exact bytes.
        const req = store.count(path);
        req.onsuccess = () => {
          if (req.result === 0) store.put(record, path);
        };
        return () => undefined;
      });
      return id;
    },

    async pickImages(projectId) {
      validatePathSegment(projectId, 'project id');
      const files = await pickFiles('image/png,image/jpeg,image/webp', true);
      const out: PickedImage[] = [];
      // One file at a time keeps memory bounded when many large images are picked.
      for (const file of files) {
        // Like the desktop picker, oversized files are skipped without being read.
        if (file.size > MAX_IMAGE_BYTES) continue;
        const data = new Uint8Array(await file.arrayBuffer());
        const ext = sniffImageExt(data);
        if (!ext) continue;
        out.push({ assetId: await platform.putAsset(projectId, data, ext), name: file.name, bytes: data.byteLength });
      }
      return out;
    },

    async pickExportTarget(suggestedName) {
      // One export runs at a time; dropping unfinished ones stops a cancelled
      // export from holding its files until the page closes.
      exports.clear();
      const id = `web-export-${++exportSeq}`;
      const label = safeFileName(suggestedName, 'Wajha export');
      exports.set(id, { label, files: new Map(), bytes: 0 });
      return { id, label, path: null };
    },

    async exportWrite(target, relPath, data) {
      validateLibraryPath(relPath);
      if (!(data instanceof Uint8Array)) throw new PlatformError('invalid_data', 'Export data must be bytes');
      const exp = openExport(target);
      const previous = exp.files.get(relPath);
      const bytes = exp.bytes - (previous?.size ?? 0) + data.byteLength;
      if (bytes > MAX_ZIP_BYTES || (!previous && exp.files.size >= MAX_ZIP_ENTRIES)) {
        throw new PlatformError('io', 'This export is too large for a zip download; use the desktop app');
      }
      exp.files.set(relPath, new Blob([exactBytes(data)]));
      exp.bytes = bytes;
    },

    async exportFinish(target) {
      if (finished.has(target.id)) return;
      const exp = openExport(target);
      // Built before the files are dropped, so a failure can be retried.
      const zip = await buildZip(exp.files);
      if (finished.has(target.id)) return;
      exports.delete(target.id);
      finished.add(target.id);
      download(zip, `${exp.label}.zip`);
    },

    async revealTarget() {
      // Downloads go wherever the browser puts them; there is nothing to reveal.
    },

    async openFile(kind): Promise<OpenedFile | null> {
      const accept = kind === 'project' ? '.wajha' : kind === 'template' ? '.wajha-template' : kind === 'csv' ? '.csv,text/csv' : null;
      if (!accept) throw new PlatformError('invalid_data', 'Unknown file kind');
      const [file] = await pickFiles(accept, false);
      if (!file) return null;
      if (file.size > OPEN_FILE_MAX_BYTES[kind]) throw tooLargeError(file.name, OPEN_FILE_MAX_BYTES[kind]);
      return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
    },

    async saveFile(suggestedName, data) {
      const name = safeFileName(suggestedName, 'Wajha');
      download(new Blob([exactBytes(data)]), name);
      return name;
    },

    async systemFonts() {
      return [];
    },

    async openUrl(url) {
      if (!isHttpsUrl(url)) throw new PlatformError('invalid_data', 'Only https:// links can be opened');
      window.open(url, '_blank', 'noopener');
    },
  };
  return platform;
}

/**
 * In-memory Platform for unit tests (and the fallback outside browsers). It
 * keeps the same semantics as the desktop and browser builds: the same path
 * rules, magic-byte checks and content addressing, copies on every read and
 * write, and file/directory conflicts like a real file system. Dialogs are
 * injectable handlers; exports and saves are recorded for inspection.
 */
import type { AppInfo, DirEntry, ExportTarget, ImageExt, OpenedFile, PickedImage, Platform, OpenFileKind } from './types';
import { PlatformError } from './types';
import { MAX_IMAGE_BYTES, OPEN_FILE_MAX_BYTES } from './limits';
import {
  assetPath,
  checkAssetInput,
  directChildren,
  isHttpsUrl,
  sniffImageExt,
  tooLargeError,
  validateLibraryPath,
  validatePathSegment,
} from './paths';
import { sha256Hex } from './sha256';

export interface PickedFile {
  name: string;
  data: Uint8Array;
}

type MaybePromise<T> = T | Promise<T>;

/** Stand-ins for the native dialogs. */
export interface MemoryHandlers {
  /** Files "chosen" in the image picker. Default: none, like a cancelled dialog. */
  pickImages(projectId: string): MaybePromise<PickedFile[]>;
  /** File "chosen" in the open dialog. Default: null (cancelled). */
  openFile(kind: OpenFileKind): MaybePromise<OpenedFile | null>;
  /** Saved name, or null to simulate cancelling. Default: the suggested name. */
  saveFile(suggestedName: string, data: Uint8Array): MaybePromise<string | null>;
  /** Label of the chosen export destination, or null to simulate cancelling. Default: the suggested name. */
  pickExportTarget(suggestedName: string): MaybePromise<string | null>;
}

export interface MemoryPlatformOptions extends Partial<MemoryHandlers> {
  /** Clock for modifiedMs. Default: Date.now. */
  now?: () => number;
  systemFonts?: string[];
}

export interface MemoryExport {
  label: string;
  /** Relative path -> bytes, in write order. */
  files: Map<string, Uint8Array>;
  finished: boolean;
  revealed: number;
}

export interface MemoryTestHooks {
  /** Copy of every stored file, keyed by path. */
  files(): Map<string, Uint8Array>;
  /** The export written to a target; undefined for unknown ids. */
  getExport(targetId: string): MemoryExport | undefined;
  /** Every export target created so far, oldest first. */
  exports(): MemoryExport[];
  /** URLs passed to openUrl, in order. */
  readonly openedUrls: readonly string[];
  /** Files passed to a saveFile call that was not cancelled. */
  readonly savedFiles: readonly PickedFile[];
  /** Replaces some dialog handlers for the following calls. */
  setHandlers(handlers: Partial<MemoryHandlers>): void;
  /** Forgets every file, export and log entry. */
  reset(): void;
}

export interface MemoryPlatform extends Platform {
  readonly kind: 'memory';
  readonly testing: MemoryTestHooks;
}

interface StoredFile {
  data: Uint8Array;
  modifiedMs: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_HANDLERS: MemoryHandlers = {
  pickImages: () => [],
  openFile: () => null,
  saveFile: (name) => name,
  pickExportTarget: (name) => name,
};

/** A fresh, empty in-memory platform. */
export function createMemoryPlatform(options: MemoryPlatformOptions = {}): MemoryPlatform {
  const { now = Date.now, systemFonts = [], ...overrides } = options;
  let handlers: MemoryHandlers = { ...DEFAULT_HANDLERS, ...definedOnly(overrides) };
  const files = new Map<string, StoredFile>();
  const exports = new Map<string, MemoryExport>();
  const openedUrls: string[] = [];
  const savedFiles: PickedFile[] = [];
  let exportSeq = 0;

  const isDirectory = (path: string) => {
    const prefix = `${path}/`;
    for (const key of files.keys()) if (key.startsWith(prefix)) return true;
    return false;
  };

  /** A real file system cannot nest a file under a file or replace a directory with one. */
  const assertWritable = (path: string) => {
    for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
      const parent = path.slice(0, i);
      if (files.has(parent)) throw new PlatformError('io', `Cannot write ${path}: ${parent} is a file`);
    }
    if (isDirectory(path)) throw new PlatformError('io', `Cannot write ${path}: it is a directory`);
  };

  const store = (path: string, data: Uint8Array) => {
    assertWritable(path);
    files.set(path, { data: data.slice(), modifiedMs: now() });
  };

  const exportFor = (target: ExportTarget, open: boolean): MemoryExport => {
    const exp = target && typeof target.id === 'string' ? exports.get(target.id) : undefined;
    if (!exp) throw new PlatformError('not_found', 'Unknown export target');
    if (open && exp.finished) throw new PlatformError('not_found', 'The export target is already finished');
    return exp;
  };

  const platform: MemoryPlatform = {
    kind: 'memory',

    async info(): Promise<AppInfo> {
      return { kind: 'memory', os: 'web', version: '0.1.1', dataDir: 'Memory' };
    },

    async read(path) {
      validateLibraryPath(path);
      const file = files.get(path);
      return file ? file.data.slice() : null;
    },

    async readText(path) {
      const bytes = await platform.read(path);
      return bytes === null ? null : decoder.decode(bytes);
    },

    async write(path, data) {
      validateLibraryPath(path);
      store(path, typeof data === 'string' ? encoder.encode(data) : data);
    },

    async list(dir) {
      validateLibraryPath(dir);
      const { files: names, dirs } = directChildren(dir, files.keys());
      const entries: DirEntry[] = dirs.map((name) => ({ name, isDir: true, size: 0, modifiedMs: 0 }));
      for (const name of names) {
        const file = files.get(`${dir}/${name}`);
        if (file) entries.push({ name, isDir: false, size: file.data.byteLength, modifiedMs: file.modifiedMs });
      }
      return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

    async remove(path) {
      validateLibraryPath(path);
      files.delete(path);
      const prefix = `${path}/`;
      for (const key of [...files.keys()]) if (key.startsWith(prefix)) files.delete(key);
    },

    async putAsset(projectId: string, data: Uint8Array, ext: ImageExt) {
      checkAssetInput(projectId, data, ext);
      const id = `${await sha256Hex(data)}.${ext}`;
      const path = assetPath(projectId, id);
      if (!files.has(path)) store(path, data);
      return id;
    },

    async pickImages(projectId) {
      validatePathSegment(projectId, 'project id');
      const picked = await handlers.pickImages(projectId);
      const out: PickedImage[] = [];
      for (const file of picked) {
        // Like the native dialog, anything that is not a PNG, JPEG or WebP, or is too large, is skipped.
        const ext = file.data.byteLength > MAX_IMAGE_BYTES ? null : sniffImageExt(file.data);
        if (!ext) continue;
        out.push({ assetId: await platform.putAsset(projectId, file.data, ext), name: file.name, bytes: file.data.byteLength });
      }
      return out;
    },

    async pickExportTarget(suggestedName) {
      const label = await handlers.pickExportTarget(suggestedName);
      if (label === null) return null;
      const id = `memory-export-${++exportSeq}`;
      exports.set(id, { label, files: new Map(), finished: false, revealed: 0 });
      return { id, label, path: null };
    },

    async exportWrite(target, relPath, data) {
      validateLibraryPath(relPath);
      if (!(data instanceof Uint8Array)) throw new PlatformError('invalid_data', 'Export data must be bytes');
      exportFor(target, true).files.set(relPath, data.slice());
    },

    async exportFinish(target) {
      exportFor(target, false).finished = true;
    },

    async revealTarget(target) {
      exportFor(target, false).revealed++;
    },

    async openFile(kind) {
      if (kind !== 'project' && kind !== 'template' && kind !== 'csv') throw new PlatformError('invalid_data', 'Unknown file kind');
      const file = await handlers.openFile(kind);
      if (!file) return null;
      if (file.data.byteLength > OPEN_FILE_MAX_BYTES[kind]) throw tooLargeError(file.name, OPEN_FILE_MAX_BYTES[kind]);
      return { name: file.name, data: file.data.slice() };
    },

    async saveFile(suggestedName, data) {
      const saved = await handlers.saveFile(suggestedName, data);
      if (saved !== null) savedFiles.push({ name: saved, data: data.slice() });
      return saved;
    },

    async systemFonts() {
      return [...systemFonts];
    },

    async openUrl(url) {
      if (!isHttpsUrl(url)) throw new PlatformError('invalid_data', 'Only https:// links can be opened');
      openedUrls.push(url);
    },

    testing: {
      files: () => new Map([...files].map(([path, file]) => [path, file.data.slice()])),
      getExport: (id) => exports.get(id),
      exports: () => [...exports.values()],
      openedUrls,
      savedFiles,
      setHandlers(next) {
        handlers = { ...handlers, ...definedOnly(next) };
      },
      reset() {
        files.clear();
        exports.clear();
        openedUrls.length = 0;
        savedFiles.length = 0;
      },
    },
  };
  return platform;
}

/** Drops keys explicitly set to undefined, so they do not erase the defaults. */
function definedOnly<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out;
}

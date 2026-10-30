/**
 * The only boundary between the app and the operating system.
 *
 * Two implementations exist:
 *  - `tauri.ts`  the desktop app, backed by the Rust commands in src-tauri
 *  - `web.ts`    the browser build (demo + end-to-end tests), backed by
 *                IndexedDB, <input type=file> and zip downloads
 * plus `memory.ts`, an in-memory implementation used by unit tests.
 *
 * Library paths are relative POSIX paths inside the app data directory, for
 * example "projects/abc123/project.json". They never start with "/", never
 * contain "..", "\\" or empty segments. Implementations must reject anything
 * else with a PlatformError("invalid_path").
 */

export type PlatformKind = 'desktop' | 'web' | 'memory';
export type OsKind = 'macos' | 'windows' | 'linux' | 'web';
export type ImageExt = 'png' | 'jpg' | 'webp';

export interface AppInfo {
  kind: PlatformKind;
  os: OsKind;
  version: string;
  /** Absolute data directory on desktop; a descriptive label elsewhere. */
  dataDir: string;
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  /** Bytes of a file; 0 for directories, and on the web platform, which cannot read sizes without loading the files. */
  size: number;
  /** Last change of a file; 0 where `size` is 0. */
  modifiedMs: number;
}

export interface PickedImage {
  /** Asset id "<sha256>.<ext>" already stored in the project's assets. */
  assetId: string;
  /** Original file name. */
  name: string;
  bytes: number;
}

/** Where an export is written. Desktop: a folder the user picked. Web: a zip download. */
export interface ExportTarget {
  id: string;
  /** Short label for the UI, e.g. the folder name. */
  label: string;
  /** Absolute folder path on desktop, null on web. */
  path: string | null;
}

export type OpenFileKind = 'project' | 'template' | 'csv';

export interface OpenedFile {
  name: string;
  data: Uint8Array;
}

export type PlatformErrorCode =
  | 'not_found'
  | 'invalid_path'
  | 'invalid_data'
  | 'permission'
  | 'cancelled'
  | 'io';

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}

export interface Platform {
  readonly kind: PlatformKind;

  info(): Promise<AppInfo>;

  /* Library storage ------------------------------------------------- */

  /** File bytes, or null when the file does not exist. */
  read(path: string): Promise<Uint8Array | null>;
  /** UTF-8 text, or null when the file does not exist. */
  readText(path: string): Promise<string | null>;
  /** Atomic write (temp file + rename). Creates parent directories. */
  write(path: string, data: Uint8Array | string): Promise<void>;
  /** Direct children of a directory; [] when it does not exist. */
  list(dir: string): Promise<DirEntry[]>;
  /** Removes a file or a directory recursively. No-op when missing. */
  remove(path: string): Promise<void>;

  /* Assets ---------------------------------------------------------- */

  /**
   * Stores image bytes content-addressed at
   * "projects/<projectId>/assets/<sha256>.<ext>" (skips the write when the
   * file already exists) and returns the asset id "<sha256>.<ext>".
   * Rejects data whose magic bytes are not PNG, JPEG or WebP.
   */
  putAsset(projectId: string, data: Uint8Array, ext: ImageExt): Promise<string>;
  /**
   * Native picker for PNG/JPEG/WebP files; picked files are stored as assets.
   * Files larger than MAX_IMAGE_BYTES (limits.ts) are skipped unread.
   */
  pickImages(projectId: string): Promise<PickedImage[]>;

  /* Export ---------------------------------------------------------- */

  /** Lets the user choose a destination. null when cancelled. */
  pickExportTarget(suggestedName: string): Promise<ExportTarget | null>;
  /** Writes one file at a relative POSIX path inside the target. */
  exportWrite(target: ExportTarget, relPath: string, data: Uint8Array): Promise<void>;
  /** Desktop: no-op. Web: zips everything written and downloads it. */
  exportFinish(target: ExportTarget): Promise<void>;
  /** Desktop: reveal the folder in Finder / Explorer. Web: no-op. */
  revealTarget(target: ExportTarget): Promise<void>;

  /* Files ----------------------------------------------------------- */

  /**
   * Opens a ".wajha" project, a ".wajha-template" file or a ".csv" translations
   * sheet. null when cancelled. A file larger than OPEN_FILE_MAX_BYTES[kind]
   * (limits.ts) is refused with PlatformError("invalid_data") before it is read.
   */
  openFile(kind: OpenFileKind): Promise<OpenedFile | null>;
  /** Save dialog (desktop) or download (web). Returns the saved path/name, null when cancelled. */
  saveFile(suggestedName: string, data: Uint8Array): Promise<string | null>;

  /* Misc ------------------------------------------------------------ */

  /** Installed font family names (desktop); [] where unavailable. */
  systemFonts(): Promise<string[]>;
  /** Opens an https:// URL in the default browser. Other schemes are rejected. */
  openUrl(url: string): Promise<void>;
}

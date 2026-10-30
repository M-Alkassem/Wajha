/**
 * ".wajha" projects and ".wajha-template" templates are zip files:
 *
 *   project.json | template.json
 *   assets/<assetId>
 *   thumb.jpg    | preview.jpg      (optional)
 *
 * Imports treat the file as hostile: names that could escape a folder reject
 * the archive; entry count, total size and the size of each entry are capped
 * from the zip directory before anything is inflated; JSON is validated; and
 * every asset is re-hashed and its header checked against the image limits
 * (failures are dropped, together with every reference to them).
 */
import { unzipSync, zipSync, type UnzipFileInfo, type Zippable } from 'fflate';
import { newId } from '../model/ids';
import type { Project, ProjectMeta, Template } from '../model/types';
import { validateProject, validateTemplate } from '../model/validate';
import { getPlatform } from '../platform';
import {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_ENTRIES,
  MAX_IMAGE_BYTES,
  MAX_MANIFEST_BYTES,
  TEMPLATE_ARCHIVE_MAX_BYTES,
  THUMBNAIL_LIMITS,
  imageWithinLimits,
  megabytes,
} from '../platform/limits';
import { isAssetId } from '../platform/paths';
import { listProjects, loadProject, metaOf, readThumbnail, saveProject } from './library';
import { keepAssets, usedAssetIds, withPresentAssets } from './refs';
import {
  IMPORTED_SUFFIX,
  StorageError,
  TEMPLATES_DIR,
  MAX_ID_CHARS,
  assertTemplateId,
  fromUtf8,
  isRecord,
  isTemplateId,
  projectAssetFile,
  projectAssetsDir,
  projectDir,
  reason,
  serial,
  templateAssetFile,
  templateAssetsDir,
  thumbFile,
  utf8,
  withSuffix,
} from './shared';
import { assetMatches, listUserTemplates, readTemplateFile, readTemplatePreview, templateKey, writeTemplateFiles } from './templates';

export { ARCHIVE_MAX_BYTES, ARCHIVE_MAX_ENTRIES, TEMPLATE_ARCHIVE_MAX_BYTES } from '../platform/limits';

const ASSET_PREFIX = 'assets/';

interface ArchiveKind {
  manifest: 'project.json' | 'template.json';
  image: 'thumb.jpg' | 'preview.jpg';
  ext: '.wajha' | '.wajha-template';
  what: 'project' | 'template';
  /** Largest file, and the most its entries may hold once inflated. */
  maxBytes: number;
}

const PROJECT_ARCHIVE: ArchiveKind = {
  manifest: 'project.json',
  image: 'thumb.jpg',
  ext: '.wajha',
  what: 'project',
  maxBytes: ARCHIVE_MAX_BYTES,
};
const TEMPLATE_ARCHIVE: ArchiveKind = {
  manifest: 'template.json',
  image: 'preview.jpg',
  ext: '.wajha-template',
  what: 'template',
  maxBytes: TEMPLATE_ARCHIVE_MAX_BYTES,
};

/* Reading ----------------------------------------------------------- */

interface ArchiveContents {
  manifest: unknown;
  /** The thumbnail or preview, when it is a small image. */
  image: Uint8Array | null;
  /** assetId -> bytes, only entries that pass assetMatches. */
  assets: Map<string, Uint8Array>;
}

/** Names that would land outside the destination when extracted ("zip slip"). */
export function isUnsafeEntryName(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return true;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return name.split(/[\\/]/).includes('..');
}

const isAssetEntry = (name: string) => name.startsWith(ASSET_PREFIX) && isAssetId(name.slice(ASSET_PREFIX.length));

function invalid(kind: ArchiveKind, detail: string, cause?: unknown): StorageError {
  return new StorageError('invalid_file', `This is not a valid ${kind.ext} file: ${detail}.`, cause === undefined ? undefined : { cause });
}

function tooLarge(kind: ArchiveKind, detail: string): StorageError {
  return new StorageError('too_large', `This ${kind.ext} file is too large to import: ${detail}.`);
}

/** unzipSync with fflate's errors turned into a clear message; our own errors pass through. */
function unzip(data: Uint8Array, kind: ArchiveKind, filter: (info: UnzipFileInfo) => boolean) {
  try {
    return unzipSync(data, { filter });
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw invalid(kind, 'the zip data is damaged', e);
  }
}

/** Safety checks, extraction of the known entries, JSON parsing and asset verification. */
async function openArchive(data: Uint8Array, kind: ArchiveKind): Promise<ArchiveContents> {
  if (!(data instanceof Uint8Array) || data.length < 22) throw invalid(kind, 'the file is empty or truncated');
  // Exports stay within this (see ArchiveBudget); it bounds the work before parsing.
  if (data.length > kind.maxBytes) throw tooLarge(kind, `more than ${megabytes(kind.maxBytes)}`);

  // Pass 1 reads only the central directory: the filter rejects every entry,
  // so nothing is inflated until the limits below have been checked.
  const known = new Set<string>();
  const wanted = new Set<string>();
  let entries = 0;
  let total = 0;
  unzip(data, kind, (info) => {
    if (++entries > ARCHIVE_MAX_ENTRIES) throw tooLarge(kind, `more than ${ARCHIVE_MAX_ENTRIES} files`);
    if (isUnsafeEntryName(info.name)) throw invalid(kind, `unsafe file name ${JSON.stringify(info.name.slice(0, 80))}`);
    const size = Math.max(info.size, info.originalSize);
    if (!Number.isFinite(size) || size < 0) throw invalid(kind, 'the zip directory is damaged');
    total += size;
    if (total > kind.maxBytes) throw tooLarge(kind, `more than ${megabytes(kind.maxBytes)} uncompressed`);
    const isManifest = info.name === kind.manifest;
    const isImage = info.name === kind.image;
    if (!isManifest && !isImage && !isAssetEntry(info.name)) return false;
    // Names stay unique even for entries that are skipped, so pass 2 inflates exactly what was checked.
    if (known.has(info.name)) throw invalid(kind, `${info.name} appears twice`);
    known.add(info.name);
    // A huge manifest blocks the app while it parses: refuse it. An oversized image is dropped like a damaged one.
    if (isManifest && size > MAX_MANIFEST_BYTES) throw tooLarge(kind, `${kind.manifest} is larger than ${megabytes(MAX_MANIFEST_BYTES)}`);
    if (isManifest || size <= (isImage ? THUMBNAIL_LIMITS.maxBytes : MAX_IMAGE_BYTES)) wanted.add(info.name);
    return false;
  });
  if (!wanted.has(kind.manifest)) throw invalid(kind, `${kind.manifest} is missing`);

  // Pass 2 inflates only the entries we use. fflate sizes each output buffer
  // from the directory, so a lying entry cannot grow past the checked size.
  const files = unzip(data, kind, (info) => wanted.has(info.name));
  const manifestBytes = files[kind.manifest];
  if (!manifestBytes) throw invalid(kind, `${kind.manifest} could not be read`);
  let manifest: unknown;
  try {
    manifest = JSON.parse(fromUtf8(manifestBytes));
  } catch (e) {
    throw invalid(kind, `${kind.manifest} is not valid JSON`, e);
  }

  const assets = new Map<string, Uint8Array>();
  for (const name of wanted) {
    const bytes = files[name];
    if (!bytes || !isAssetEntry(name)) continue;
    const assetId = name.slice(ASSET_PREFIX.length);
    if (await assetMatches(assetId, bytes)) assets.set(assetId, bytes);
  }
  const image = files[kind.image];
  return { manifest, image: image && imageWithinLimits(image, THUMBNAIL_LIMITS) ? image : null, assets };
}

function formatOf(json: unknown): unknown {
  return isRecord(json) ? json.format : undefined;
}

/* Writing ----------------------------------------------------------- */

/** Upper bound of the zip structure around one entry: local header, central directory record and the name twice. */
const ENTRY_OVERHEAD = 256;

/** Running totals that keep an exported archive (file and contents) within what the importer accepts. */
class ArchiveBudget {
  private bytes: number;
  private entries: number;
  private readonly kind: ArchiveKind;
  constructor(kind: ArchiveKind) {
    this.bytes = 0;
    this.entries = 0;
    this.kind = kind;
  }
  add(bytes: number): void {
    this.bytes += bytes + ENTRY_OVERHEAD;
    this.entries += 1;
    if (this.bytes > this.kind.maxBytes || this.entries > ARCHIVE_MAX_ENTRIES) {
      // An archive the importer would refuse is worse than a clear error now.
      throw new StorageError(
        'too_large',
        `This ${this.kind.what} is too large to save as one file (over ${megabytes(this.kind.maxBytes)} or ${ARCHIVE_MAX_ENTRIES} files).`,
      );
    }
  }
}

/**
 * The zip entries of a manifest, an optional image and the files of an
 * assets folder the document uses, read one at a time. Registry entries kept
 * for undo (a replaced screenshot) are left out, with their files.
 */
async function archiveFiles(
  kind: ArchiveKind,
  document: Project | Template,
  image: Uint8Array | null,
  assetsDir: string,
  assetFile: (assetId: string) => string,
): Promise<Zippable> {
  const p = getPlatform();
  const budget = new ArchiveBudget(kind);
  const used = usedAssetIds(document);
  const manifest = utf8(JSON.stringify(keepAssets(document, used)));
  if (manifest.byteLength > MAX_MANIFEST_BYTES) {
    throw new StorageError('too_large', `This ${kind.what} is too large to save as one file (its ${kind.manifest} is over ${megabytes(MAX_MANIFEST_BYTES)}).`);
  }
  budget.add(manifest.byteLength);
  const files: Zippable = { [kind.manifest]: [manifest, { level: 6 }] };
  if (image) {
    budget.add(image.byteLength);
    files[kind.image] = [image, { level: 0 }];
  }
  for (const entry of await p.list(assetsDir)) {
    if (entry.isDir || !used.has(entry.name)) continue;
    const bytes = await p.read(assetFile(entry.name));
    if (!bytes) continue;
    budget.add(bytes.byteLength);
    // PNG, JPEG and WebP are compressed already; deflating them again only costs time.
    files[`${ASSET_PREFIX}${entry.name}`] = [bytes, { level: 0 }];
  }
  return files;
}

/* Projects ---------------------------------------------------------- */

/** The project as a .wajha file: validated project.json, the assets it uses, thumbnail. */
export async function exportProjectArchive(id: string): Promise<Uint8Array> {
  const project = await loadProject(id);
  const thumb = await readThumbnail(id);
  const files = await archiveFiles(PROJECT_ARCHIVE, project, thumb, projectAssetsDir(id), (a) => projectAssetFile(id, a));
  return zipSync(files);
}

/** Imports under a fresh id so it never overwrites an existing project. */
export async function importProjectArchive(data: Uint8Array): Promise<ProjectMeta> {
  const kind = PROJECT_ARCHIVE;
  const archive = await openArchive(data, kind);
  if (formatOf(archive.manifest) === 'wajha.template') {
    throw new StorageError('invalid_file', 'This is a template (.wajha-template), not a project. Import it from the templates.');
  }
  let project: Project;
  try {
    // Against the files that arrived: references to a dropped image are dropped too.
    project = validateProject(withPresentAssets(archive.manifest, archive.assets));
  } catch (e) {
    throw invalid(kind, `the project is invalid (${reason(e)})`, e);
  }
  const p = getPlatform();
  const names = new Set((await listProjects()).map((m) => m.name));
  const now = Date.now();
  const used = usedAssetIds(project);
  const imported: Project = {
    ...keepAssets(project, used),
    id: newId(),
    name: names.has(project.name) ? withSuffix(project.name, IMPORTED_SUFFIX) : project.name,
    createdAt: Number.isFinite(project.createdAt) ? Math.min(project.createdAt, now) : now,
    // Most recently touched, so it appears first on the home screen.
    updatedAt: now,
  };
  try {
    for (const [assetId, bytes] of archive.assets) if (used.has(assetId)) await p.write(projectAssetFile(imported.id, assetId), bytes);
    if (archive.image) await p.write(thumbFile(imported.id), archive.image);
    // Written last: until project.json exists the import is not listed.
    await saveProject(imported);
  } catch (e) {
    await p.remove(projectDir(imported.id)).catch(() => undefined);
    throw e;
  }
  return metaOf(imported);
}

/* Templates --------------------------------------------------------- */

export async function exportTemplateArchive(templateId: string): Promise<Uint8Array> {
  assertTemplateId(templateId);
  const p = getPlatform();
  const template = await serial(templateKey(templateId), () => readTemplateFile(p, templateId));
  const preview = await readTemplatePreview(templateId);
  const files = await archiveFiles(TEMPLATE_ARCHIVE, template, preview, templateAssetsDir(templateId), (a) =>
    templateAssetFile(templateId, a),
  );
  return zipSync(files);
}

/** First of id, id-2, id-3, ... that no folder uses yet, kept within the model's id rules. */
function freeTemplateId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  // Pigeonhole: one of these taken.size + 1 candidates is free.
  for (let n = 2; n <= taken.size + 2; n++) {
    const suffix = `-${n}`;
    const stem = base.slice(0, MAX_ID_CHARS - suffix.length).replace(/-+$/, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate) && isTemplateId(candidate)) return candidate;
  }
  return newId('t');
}

/**
 * Imports a .wajha-template. A template whose id is taken gets the next free
 * "<id>-N", and " (imported)" is appended when the name is taken, so nothing
 * is ever overwritten.
 */
export async function importTemplateArchive(data: Uint8Array): Promise<Template> {
  const kind = TEMPLATE_ARCHIVE;
  const archive = await openArchive(data, kind);
  if (formatOf(archive.manifest) === 'wajha.project') {
    throw new StorageError('invalid_file', 'This is a project (.wajha), not a template. Import it from the home screen.');
  }
  let template: Template;
  try {
    template = validateTemplate(withPresentAssets(archive.manifest, archive.assets));
  } catch (e) {
    throw invalid(kind, `the template is invalid (${reason(e)})`, e);
  }
  if (!isTemplateId(template.id)) throw invalid(kind, 'the template id is not usable');
  const p = getPlatform();
  const taken = new Set((await p.list(TEMPLATES_DIR)).map((e) => e.name));
  const names = new Set((await listUserTemplates()).map((t) => t.name));
  const used = usedAssetIds(template);
  const imported: Template = {
    ...keepAssets(template, used),
    id: freeTemplateId(template.id, taken),
    name: names.has(template.name) ? withSuffix(template.name, IMPORTED_SUFFIX) : template.name,
  };
  const files = new Map([...archive.assets].filter(([assetId]) => used.has(assetId)));
  await writeTemplateFiles(imported, archive.image, files);
  return imported;
}

/**
 * Projects on disk: the home screen listing, load / save / duplicate /
 * delete, thumbnails (with the project version each one shows), asset reads
 * and writes, and pruning.
 */
import { FAMILY_ORDER } from '../model/catalog';
import { newId } from '../model/ids';
import type { FamilyId, Project, ProjectMeta } from '../model/types';
import { validateProject } from '../model/validate';
import { getPlatform, type ImageExt, type Platform } from '../platform';
import { THUMBNAIL_LIMITS, imageWithinLimits } from '../platform/limits';
import { isAssetId } from '../platform/paths';
import { keepAssets, usedAssetIds } from './refs';
import {
  MAX_NAME_CHARS,
  PROJECTS_DIR,
  StorageError,
  assertProjectId,
  fromUtf8,
  isFiniteNumber,
  isProjectId,
  isRecord,
  mapLimit,
  metaFile,
  projectAssetFile,
  projectAssetsDir,
  projectDir,
  projectFile,
  reason,
  serial,
  thumbFile,
  utf8,
} from './shared';
import { projectFontFile } from './fonts';

const projectKey = (id: string) => `project:${id}`;

/**
 * Ids deleted in this session, per platform. A save or thumbnail write that
 * arrives after the delete (a late autosave flush) must not bring the project
 * back as a half-written folder.
 */
const deletedByPlatform = new WeakMap<Platform, Set<string>>();
function deletedIds(p: Platform): Set<string> {
  let ids = deletedByPlatform.get(p);
  if (!ids) deletedByPlatform.set(p, (ids = new Set()));
  return ids;
}

const FAMILY_IDS: ReadonlySet<string> = new Set<string>(FAMILY_ORDER);

/** The meta.json summary of a project. */
export function metaOf(project: Project): ProjectMeta {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    slideCount: project.slides.length,
    families: [...project.families],
    languages: [...project.languages],
    templateId: project.templateId,
  };
}

/** Parsed meta.json, or null when it is unusable (the listing then rebuilds it). */
function parseMeta(text: string, id: string): ProjectMeta | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(json) || json.id !== id) return null;
  const { name, updatedAt, createdAt, slideCount, families, languages, templateId } = json;
  if (typeof name !== 'string' || !isFiniteNumber(updatedAt) || !isFiniteNumber(createdAt)) return null;
  if (typeof slideCount !== 'number' || !Number.isInteger(slideCount) || slideCount < 0) return null;
  if (!Array.isArray(families) || !Array.isArray(languages)) return null;
  if (templateId !== null && typeof templateId !== 'string') return null;
  const familyList: unknown[] = families;
  const languageList: unknown[] = languages;
  return {
    id,
    name,
    updatedAt,
    createdAt,
    slideCount,
    families: familyList.filter((f): f is FamilyId => typeof f === 'string' && FAMILY_IDS.has(f)),
    languages: languageList.filter((l): l is string => typeof l === 'string'),
    templateId,
  };
}

/** Reads and validates project.json without queueing (callers hold the queue or do not need it). */
export async function readProjectFile(p: Platform, id: string): Promise<Project> {
  const text = await p.readText(projectFile(id));
  if (text === null) throw new StorageError('not_found', `Project "${id}" was not found.`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new StorageError('corrupt', `Project "${id}" is damaged: project.json is not valid JSON.`, { cause: e });
  }
  let project: Project;
  try {
    project = validateProject(json);
  } catch (e) {
    throw new StorageError('corrupt', `Project "${id}" is damaged: ${reason(e)}`, { cause: e });
  }
  // The folder name is authoritative: saving under another id would fork the project.
  return project.id === id ? project : { ...project, id };
}

function byMostRecent(a: ProjectMeta, b: ProjectMeta): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function readMeta(p: Platform, id: string): Promise<ProjectMeta | null> {
  try {
    const text = await p.readText(metaFile(id));
    const meta = text === null ? null : parseMeta(text, id);
    if (meta) return meta;
    const rebuilt = metaOf(await readProjectFile(p, id));
    await repairMeta(p, id, rebuilt);
    return rebuilt;
  } catch {
    // One broken project must not hide the others from the home screen.
    return null;
  }
}

/** Best effort; skipped when a save has written a fresh meta.json in the meantime. */
async function repairMeta(p: Platform, id: string, meta: ProjectMeta): Promise<void> {
  try {
    await serial(projectKey(id), async () => {
      if (deletedIds(p).has(id)) return;
      const current = await p.readText(metaFile(id));
      if (current !== null && parseMeta(current, id)) return;
      await p.write(metaFile(id), JSON.stringify(meta));
    });
  } catch {
    // A read-only or full disk still gets a correct listing, just slower next time.
  }
}

/** Every readable project, most recently edited first. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const p = getPlatform();
  const ids = (await p.list(PROJECTS_DIR)).filter((e) => e.isDir && isProjectId(e.name)).map((e) => e.name);
  const metas = await mapLimit(ids, 8, (id) => readMeta(p, id));
  return metas.filter((m): m is ProjectMeta => m !== null).sort(byMostRecent);
}

export interface LoadOptions {
  /**
   * Prune first (see pruneAssets): for opening the project in the editor,
   * which holds no undo step yet that could bring a reference back. This
   * also cleans up after a session that ended without closing the project
   * (the app quit).
   */
  pruneAssets?: boolean;
}

/** The validated project; throws StorageError "not_found" or "corrupt". */
export async function loadProject(id: string, options: LoadOptions = {}): Promise<Project> {
  assertProjectId(id);
  const p = getPlatform();
  // Queued behind pending saves, so a load always sees the latest write.
  return serial(projectKey(id), async () => {
    const project = await readProjectFile(p, id);
    if (!options.pruneAssets) return project;
    try {
      return (await pruneSaved(p, project, () => true)).project;
    } catch (err) {
      // Pruning only saves space: a project that cannot be cleaned up still opens.
      console.warn('[storage] could not prune unused images', err);
      return project;
    }
  });
}

/** Writes project.json and meta.json. Bumps nothing: callers set updatedAt. */
export async function saveProject(project: Project): Promise<void> {
  const id = assertProjectId(project.id);
  const p = getPlatform();
  await serial(projectKey(id), async () => {
    if (deletedIds(p).has(id)) return;
    await p.write(projectFile(id), JSON.stringify(project));
    await p.write(metaFile(id), JSON.stringify(metaOf(project)));
  });
}

export async function deleteProject(id: string): Promise<void> {
  assertProjectId(id);
  const p = getPlatform();
  const deleted = deletedIds(p);
  const wasDeleted = deleted.has(id);
  deleted.add(id);
  try {
    await serial(projectKey(id), () => p.remove(projectDir(id)));
  } catch (e) {
    // Still on disk, so it can be opened and edited again: saves must work.
    if (!wasDeleted) deleted.delete(id);
    throw e;
  }
}

function copyName(name: string, fallback: string): string {
  const trimmed = name.trim() || `${fallback} copy`;
  return Array.from(trimmed).slice(0, MAX_NAME_CHARS).join('');
}

/** Copies the project (with the assets it uses) under a new id and name. */
export async function duplicateProject(id: string, name: string): Promise<ProjectMeta> {
  const source = await loadProject(id);
  const p = getPlatform();
  const now = Date.now();
  // A fresh project has no undo history, so images it does not use are left behind.
  const used = usedAssetIds(source);
  const copy: Project = { ...keepAssets(source, used), id: newId(), name: copyName(name, source.name), createdAt: now, updatedAt: now };
  try {
    // One file at a time: projects can hold hundreds of megabytes of screenshots.
    for (const entry of await p.list(projectAssetsDir(id))) {
      if (entry.isDir || !used.has(entry.name)) continue;
      const bytes = await p.read(projectAssetFile(id, entry.name));
      if (bytes) await p.write(projectAssetFile(copy.id, entry.name), bytes);
    }
    for (const font of source.fonts ?? []) {
      const bytes = await p.read(projectFontFile(id, font.file));
      if (bytes) await p.write(projectFontFile(copy.id, font.file), bytes);
    }
    const thumb = await p.read(thumbFile(id));
    // The source's picture shows the copy too; one that had fallen behind the source stays behind.
    if (thumb) await p.write(thumbFile(copy.id), thumbnailVersion(thumb) === source.updatedAt ? stampThumbnail(thumb, now) : thumb);
    // Written last: until project.json exists the copy is not listed.
    await saveProject(copy);
  } catch (e) {
    await p.remove(projectDir(copy.id)).catch(() => undefined);
    throw e;
  }
  return metaOf(copy);
}

/* Thumbnails --------------------------------------------------------- */

/*
 * thumb.jpg says which version of its project it shows: the project's
 * updatedAt when it was drawn, in a JPEG comment segment after the APPn
 * headers. The home screen reads the picture anyway, so spotting one that
 * fell behind its project (it was still due when the page unloaded or the
 * app was killed) costs no extra read, picture and version can never
 * disagree, and copies and .wajha files carry the version along.
 */
const VERSION_TAG = 'wajha-version:';
const COM = 0xfe;

interface JpegSegment {
  marker: number;
  /** Offset of the segment's 0xFF byte. */
  start: number;
  /** Offset just past the segment. */
  end: number;
}

/** The marker segments between SOI and the image data, or null when `bytes` are not a JPEG with readable headers. */
function jpegHeaders(bytes: Uint8Array): JpegSegment[] | null {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const segments: JpegSegment[] = [];
  let at = 2;
  // Up to the start of scan (or end of image): FF, the marker, then a length that counts itself.
  while (at + 4 <= bytes.length && bytes[at] === 0xff && bytes[at + 1] !== 0xda && bytes[at + 1] !== 0xd9) {
    if (bytes[at + 1] === 0xff) {
      at++; // fill byte
      continue;
    }
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end < at + 4 || end > bytes.length) return null;
    segments.push({ marker: bytes[at + 1], start: at, end });
    at = end;
  }
  return segments;
}

function isVersionStamp(bytes: Uint8Array, s: JpegSegment): boolean {
  if (s.marker !== COM || s.end - s.start < 4 + VERSION_TAG.length) return false;
  for (let i = 0; i < VERSION_TAG.length; i++) if (bytes[s.start + 4 + i] !== VERSION_TAG.charCodeAt(i)) return false;
  return true;
}

/**
 * The project version (its updatedAt) that thumbnail bytes show, or null
 * when they do not say: drawn by a build that did not record it, or not a
 * JPEG. Pure.
 */
export function thumbnailVersion(jpeg: Uint8Array): number | null {
  for (const s of jpegHeaders(jpeg) ?? []) {
    if (!isVersionStamp(jpeg, s)) continue;
    const text = fromUtf8(jpeg.subarray(s.start + 4 + VERSION_TAG.length, s.end));
    // Exactly what String(number) writes, nothing looser.
    return /^-?\d+(\.\d+)?(e[+-]\d+)?$/.test(text) ? Number(text) : null;
  }
  return null;
}

/**
 * The JPEG with `updatedAt` recorded as the version it shows, replacing any
 * earlier one; anything that is not a JPEG comes back unchanged. Pure.
 */
export function stampThumbnail(jpeg: Uint8Array, updatedAt: number): Uint8Array {
  const headers = jpegHeaders(jpeg);
  if (!headers) return jpeg;
  const tag = utf8(`${VERSION_TAG}${updatedAt}`);
  const stamp = new Uint8Array(4 + tag.length);
  stamp.set([0xff, COM, (tag.length + 2) >> 8, (tag.length + 2) & 0xff]);
  stamp.set(tag, 4);
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let placed = false;
  for (const s of headers) {
    // After the APPn segments (JFIF, Exif), which readers expect first.
    if (!placed && !(s.marker >= 0xe0 && s.marker <= 0xef)) {
      parts.push(stamp);
      placed = true;
    }
    if (!isVersionStamp(jpeg, s)) parts.push(jpeg.subarray(s.start, s.end));
  }
  if (!placed) parts.push(stamp);
  parts.push(jpeg.subarray(headers.length ? headers[headers.length - 1].end : 2));
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * thumb.jpg, or null when there is none or it is not a small image (the
 * home screen then draws a new one). thumbnailVersion tells which version of
 * the project it shows.
 */
export async function readThumbnail(id: string): Promise<Uint8Array | null> {
  assertProjectId(id);
  const bytes = await getPlatform().read(thumbFile(id));
  return bytes && imageWithinLimits(bytes, THUMBNAIL_LIMITS) ? bytes : null;
}

const thumbnailListeners = new Set<(projectId: string) => void>();

/** Calls `listener` with the project id after each thumbnail write. Returns unsubscribe. */
export function onThumbnailWritten(listener: (projectId: string) => void): () => void {
  thumbnailListeners.add(listener);
  return () => {
    thumbnailListeners.delete(listener);
  };
}

/** Writes thumb.jpg, drawn from the project as saved at `updatedAt` (see thumbnailVersion). */
export async function writeThumbnail(id: string, jpeg: Uint8Array, updatedAt: number): Promise<void> {
  assertProjectId(id);
  const p = getPlatform();
  const stamped = stampThumbnail(jpeg, updatedAt);
  let wrote = false;
  await serial(projectKey(id), async () => {
    if (deletedIds(p).has(id)) return;
    await p.write(thumbFile(id), stamped);
    wrote = true;
  });
  if (!wrote) return;
  for (const listener of [...thumbnailListeners]) {
    try {
      listener(id);
    } catch (err) {
      console.error('[storage] thumbnail listener failed', err);
    }
  }
}

export async function readAsset(projectId: string, assetId: string): Promise<Uint8Array | null> {
  assertProjectId(projectId);
  // Also stops ids like "../project.json" from reading outside the assets folder.
  if (!isAssetId(assetId)) return null;
  return getPlatform().read(projectAssetFile(projectId, assetId));
}

/**
 * Stores image bytes as a project asset (Platform.putAsset), queued with the
 * project's saves and prunes: putAsset skips files that already exist, so
 * an import running alongside a prune could otherwise reuse a file that the
 * prune deletes a moment later.
 */
export async function putProjectAsset(projectId: string, data: Uint8Array, ext: ImageExt): Promise<string> {
  const id = assertProjectId(projectId);
  const p = getPlatform();
  return serial(projectKey(id), () => {
    // Writing into a deleted project would leave a folder that nothing lists.
    if (deletedIds(p).has(id)) throw new StorageError('not_found', `Project "${id}" was deleted.`);
    return p.putAsset(id, data, ext);
  });
}

/**
 * Deletes the asset files `saved` (the project as read from disk, inside its
 * queue) does not use, and drops them from its registry on disk.
 * `stillClosed` is asked before each change: once an editor holds the
 * project, its files must stay.
 */
async function pruneSaved(p: Platform, saved: Project, stillClosed: () => boolean): Promise<{ project: Project; removed: number }> {
  const id = saved.id;
  const used = usedAssetIds(saved);
  const project = keepAssets(saved, used);
  if (project !== saved) {
    if (!stillClosed()) return { project: saved, removed: 0 };
    // First, so the registry never lists a file that is gone.
    await p.write(projectFile(id), JSON.stringify(project));
  }
  let removed = 0;
  for (const entry of await p.list(projectAssetsDir(id))) {
    // Only content-addressed files are ours to delete (not temp files of an in-flight write).
    if (entry.isDir || !isAssetId(entry.name) || used.has(entry.name)) continue;
    if (!stillClosed()) break;
    await p.remove(projectAssetFile(id, entry.name));
    removed++;
  }
  return { project, removed };
}

export interface PruneOptions {
  /** True while an editor holds the project again (it was reopened); nothing is deleted then. */
  isOpen?: () => boolean;
}

/**
 * Removes the asset files the project no longer uses and their entries in
 * its `assets` registry (kept until now so undo could bring them back).
 * Returns how many files were removed. Call it with the project as last
 * saved, when no undo step can bring a reference back (it is closing): it
 * works on project.json inside the project's queue, and does nothing when
 * that file has changed since (the project was reopened and edited) or the
 * project is open again.
 */
export async function pruneAssets(project: Project, options: PruneOptions = {}): Promise<number> {
  const id = assertProjectId(project.id);
  const p = getPlatform();
  const stillClosed = () => !options.isOpen?.();
  return serial(projectKey(id), async () => {
    if (deletedIds(p).has(id)) return 0;
    let saved: Project;
    try {
      saved = await readProjectFile(p, id);
    } catch {
      // Missing or damaged: never delete files on the strength of an unreadable project.
      return 0;
    }
    // Checked after the read: a reopen that finished just before this task has reached the editor by now.
    if (saved.updatedAt !== project.updatedAt || !stillClosed()) return 0;
    return (await pruneSaved(p, saved, stillClosed)).removed;
  });
}

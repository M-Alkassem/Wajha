/**
 * Templates saved by the user or installed from the gallery, stored under
 * templates/<id>/ (template.json, preview.jpg, assets/).
 */
import type { Template } from '../model/types';
import { validateTemplate } from '../model/validate';
import { getPlatform, type Platform } from '../platform';
import { THUMBNAIL_LIMITS, imageWithinLimits } from '../platform/limits';
import { isAssetId, sniffImageExt } from '../platform/paths';
import { sha256Hex } from '../platform/sha256';
import {
  StorageError,
  TEMPLATES_DIR,
  assertProjectId,
  assertTemplateId,
  isTemplateId,
  mapLimit,
  previewFile,
  projectAssetFile,
  projectAssetsDir,
  reason,
  serial,
  templateAssetFile,
  templateAssetsDir,
  templateDir,
  templateFile,
} from './shared';

export const templateKey = (id: string) => `template:${id}`;

/**
 * Why `bytes` cannot be stored as the asset `assetId`, or null when they can:
 * the bytes must be the image the id names (signature and SHA-256), and an
 * image the app may decode (its header states a size within the limits).
 */
export async function assetProblem(assetId: string, bytes: Uint8Array): Promise<string | null> {
  if (!isAssetId(assetId)) return 'its name is not an image id';
  if (sniffImageExt(bytes) !== assetId.slice(65)) return 'its content does not match its name';
  // Before hashing: the header check is cheap.
  if (!imageWithinLimits(bytes)) return 'it is larger than supported or damaged';
  return (await sha256Hex(bytes)) === assetId.slice(0, 64) ? null : 'its content does not match its name';
}

/** True when `bytes` may be stored as `assetId` (see assetProblem). */
export async function assetMatches(assetId: string, bytes: Uint8Array): Promise<boolean> {
  return (await assetProblem(assetId, bytes)) === null;
}

/** Reads and validates template.json; throws StorageError "not_found" or "corrupt". */
export async function readTemplateFile(p: Platform, id: string): Promise<Template> {
  const text = await p.readText(templateFile(id));
  if (text === null) throw new StorageError('not_found', `Template "${id}" was not found.`);
  let template: Template;
  try {
    template = validateTemplate(JSON.parse(text));
  } catch (e) {
    throw new StorageError('corrupt', `Template "${id}" is damaged: ${reason(e)}`, { cause: e });
  }
  return template.id === id ? template : { ...template, id };
}

/**
 * Writes a template folder: new assets first, then template.json (the switch
 * to the new version), then the preview, then removal of assets only the old
 * version used. A failed first save leaves nothing behind; a failed update
 * leaves the previous version complete.
 */
export async function writeTemplateFiles(
  template: Template,
  preview: Uint8Array | null,
  assets: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const id = assertTemplateId(template.id);
  const p = getPlatform();
  await serial(templateKey(id), async () => {
    const replacing = (await p.list(templateDir(id))).some((e) => e.name === 'template.json');
    try {
      for (const [assetId, bytes] of assets) await p.write(templateAssetFile(id, assetId), bytes);
      await p.write(templateFile(id), JSON.stringify(template));
      if (preview) await p.write(previewFile(id), preview);
      else await p.remove(previewFile(id));
    } catch (e) {
      if (!replacing) await p.remove(templateDir(id)).catch(() => undefined);
      throw e;
    }
    for (const entry of await p.list(templateAssetsDir(id))) {
      if (!assets.has(entry.name)) await p.remove(templateAssetFile(id, entry.name));
    }
  });
}

/** Every readable user template, sorted by name. Broken folders are skipped. */
export async function listUserTemplates(): Promise<Template[]> {
  const p = getPlatform();
  const ids = (await p.list(TEMPLATES_DIR)).filter((e) => e.isDir && isTemplateId(e.name)).map((e) => e.name);
  const templates = await mapLimit(ids, 8, (id) => readTemplateFile(p, id).catch(() => null));
  return templates
    .filter((t): t is Template => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Saves (or replaces) a user template. Every asset must pass assetProblem:
 * templates are shared, and importers drop failing files, so a bad one
 * would silently break the template for others.
 */
export async function saveUserTemplate(t: Template, preview: Uint8Array | null, assets: Record<string, Uint8Array>): Promise<void> {
  assertTemplateId(t.id);
  const files = new Map<string, Uint8Array>();
  for (const [assetId, bytes] of Object.entries(assets)) {
    const problem = bytes instanceof Uint8Array ? await assetProblem(assetId, bytes) : 'it is not image data';
    if (problem) throw new StorageError('invalid_file', `Template asset "${assetId}" cannot be saved: ${problem}.`);
    files.set(assetId, bytes);
  }
  await writeTemplateFiles(t, preview, files);
}

export async function deleteUserTemplate(id: string): Promise<void> {
  assertTemplateId(id);
  const p = getPlatform();
  await serial(templateKey(id), () => p.remove(templateDir(id)));
}

/** preview.jpg, or null when there is none or it is not a small image. */
export async function readTemplatePreview(id: string): Promise<Uint8Array | null> {
  assertTemplateId(id);
  const bytes = await getPlatform().read(previewFile(id));
  return bytes && imageWithinLimits(bytes, THUMBNAIL_LIMITS) ? bytes : null;
}

export async function readTemplateAsset(templateId: string, assetId: string): Promise<Uint8Array | null> {
  assertTemplateId(templateId);
  if (!isAssetId(assetId)) return null;
  return getPlatform().read(templateAssetFile(templateId, assetId));
}

/**
 * Copies a template's image assets into a project's assets folder and
 * returns the ids the project now has. Missing or damaged template files are
 * skipped, which beats failing the whole project creation: the caller drops
 * the project's references to them (see withPresentAssets), so a device
 * shows its mock screen instead of a blank one and the export plan warns.
 */
export async function copyTemplateAssets(templateId: string, projectId: string, assetIds: string[]): Promise<string[]> {
  assertTemplateId(templateId);
  assertProjectId(projectId);
  const wanted = [...new Set(assetIds)].filter(isAssetId);
  if (wanted.length === 0) return [];
  const p = getPlatform();
  const existing = new Set((await p.list(projectAssetsDir(projectId))).map((e) => e.name));
  const copied: string[] = [];
  for (const assetId of wanted) {
    if (!existing.has(assetId)) {
      const bytes = await p.read(templateAssetFile(templateId, assetId));
      if (!bytes || !(await assetMatches(assetId, bytes))) continue;
      await p.write(projectAssetFile(projectId, assetId), bytes);
    }
    copied.push(assetId);
  }
  return copied;
}

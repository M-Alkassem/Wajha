/**
 * Which assets a project or template still uses. Deleting a referenced file
 * loses user data, so this errs towards keeping: every string anywhere in the
 * document (values and keys) that has the shape of an asset id counts. That
 * covers slide screenshots, image fills (theme, slide backgrounds, shapes),
 * image elements, and any field added later.
 *
 * The `assets` registry is the exception: it describes files, it does not use
 * them. An entry stays behind when a screenshot is replaced (so undo can
 * bring it back), and counting it would keep every replaced image forever.
 */
import type { AssetInfo, Project, Template } from '../model/types';
import { isAssetId } from '../platform/paths';
import { isRecord } from './shared';

export function collectAssetRefs(root: unknown): Set<string> {
  const refs = new Set<string>();
  const seen = new Set<object>();
  // An explicit stack: documents can be deep, recursion could overflow.
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === 'string') {
      if (isAssetId(value)) refs.add(value);
      continue;
    }
    if (typeof value !== 'object' || value === null || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      const items: unknown[] = value;
      for (const item of items) stack.push(item);
      continue;
    }
    for (const [key, item] of Object.entries(value)) {
      if (isAssetId(key)) refs.add(key);
      stack.push(item);
    }
  }
  return refs;
}

/** The asset ids a project or template uses: every reference outside its `assets` registry. */
export function usedAssetIds(doc: Project | Template): Set<string> {
  return collectAssetRefs({ ...doc, assets: {} });
}

/** `doc` with registry entries outside `keep` dropped; the same object when there are none. */
export function keepAssets<T extends Project | Template>(doc: T, keep: ReadonlySet<string>): T {
  const ids = Object.keys(doc.assets);
  if (ids.every((assetId) => keep.has(assetId))) return doc;
  const assets: Record<string, AssetInfo> = {};
  for (const assetId of ids) if (keep.has(assetId)) assets[assetId] = doc.assets[assetId];
  return { ...doc, assets };
}

/**
 * A parsed project or template whose registry lists only ids that are
 * `present` (files that exist and passed their checks). Validating it then
 * drops every reference to the others: devices show their mock screen, image
 * fills fall back and the export plan warns, instead of pointing at nothing.
 */
export function withPresentAssets(json: unknown, present: { has(assetId: string): boolean }): unknown {
  if (!isRecord(json) || !isRecord(json.assets)) return json;
  const assets: Record<string, unknown> = {};
  for (const [assetId, info] of Object.entries(json.assets)) if (present.has(assetId)) assets[assetId] = info;
  return { ...json, assets };
}

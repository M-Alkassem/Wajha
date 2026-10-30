/**
 * Asset helpers for the inspector: a re-render signal when previews finish
 * loading, small preview URLs for the kit FillEditor, and picking an image
 * from disk into the project. Previews come from the runtime's image cache
 * (already decoded for the stage, at most 1400 px), so they cost no extra
 * decode.
 */
import { useCallback, useEffect, useState } from 'react';
import { getImageCache, pickAndImportImagesWithReport, type ImportReport } from '../../../runtime';
import { toast, useEditor } from '../../../store';

/** A counter that changes whenever a preview image finishes loading. */
export function usePreviewTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => getImageCache().subscribe(() => setTick((t) => t + 1)), []);
  return tick;
}

const urlCache = new Map<string, string>();
const URL_CACHE_MAX = 12;
const URL_MAX_SIDE = 400;

/** A small PNG data URL of an asset's cached preview, or null while the preview loads. */
function previewUrl(projectId: string, assetId: string): string | null {
  const key = `${projectId}\u0000${assetId}`;
  const hit = urlCache.get(key);
  if (hit) {
    // Refresh its place in the LRU order.
    urlCache.delete(key);
    urlCache.set(key, hit);
    return hit;
  }
  const img = getImageCache().getPreview(projectId, assetId);
  if (!img || !(img.width > 0 && img.height > 0) || typeof document === 'undefined') return null;
  const scale = Math.min(1, URL_MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    urlCache.set(key, url);
    while (urlCache.size > URL_CACHE_MAX) {
      const oldest = urlCache.keys().next().value;
      if (oldest === undefined) break;
      urlCache.delete(oldest);
    }
    return url;
  } catch {
    return null;
  } finally {
    // Frees the backing store right away instead of waiting for garbage collection.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * `getImageUrl` for the kit FillEditor: a small data URL made from the
 * cached preview, null while the preview loads (the hook re-renders then).
 */
export function useImageUrlGetter(projectId: string | null): (assetId: string) => string | null {
  // Each preview arrival re-renders the caller, and with it the editor that asks for the URL.
  usePreviewTick();
  return useCallback((assetId: string) => (projectId ? previewUrl(projectId, assetId) : null), [projectId]);
}

function reportSkipped(report: ImportReport): void {
  if (!report.skipped.length) return;
  const first = report.skipped[0];
  const more = report.skipped.length > 1 ? ` (+${report.skipped.length - 1} more)` : '';
  toast.warning(report.skipped.length === 1 ? `Skipped ${first.name}` : `Skipped ${report.skipped.length} files`, `${first.message}${more}`);
}

/**
 * Opens the system picker, stores the picked image in the project and
 * returns its asset id, or null when cancelled or nothing usable was picked.
 */
export async function pickImageAsset(): Promise<string | null> {
  const project = useEditor.getState().project;
  if (!project) return null;
  let report: ImportReport;
  try {
    report = await pickAndImportImagesWithReport(project.id);
  } catch (err) {
    toast.error('Could not import the image', err instanceof Error ? err.message : String(err));
    return null;
  }
  reportSkipped(report);
  const first = report.assets[0];
  if (!first) return null;
  const store = useEditor.getState();
  // The project may have been closed while the picker was open.
  if (store.project?.id !== project.id) return null;
  // Only the image in use joins the project; other picked files go with the next prune.
  store.addAssets([first]);
  return useEditor.getState().project?.assets[first.id] ? first.id : null;
}

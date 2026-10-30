/**
 * Community gallery previews in the template picker. A card downloads its
 * preview once it comes into view, through fetchGalleryPreview (a byte
 * budget, then the header checked against the thumbnail limits), so the
 * webview only ever decodes checked bytes, and shows them through an object
 * URL that lives exactly as long as the card shows that preview. Nothing is
 * kept once the cards are gone: a preview shown again is downloaded again,
 * usually from the HTTP cache.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import type { GalleryEntry } from '../../model/types';
import { sniffImageExt } from '../../platform';
import { fetchGalleryPreview } from '../../storage';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

/** Downloads in flight by preview path: cards asking at once (StrictMode runs effects twice) share one. */
const downloads = new Map<string, Promise<Uint8Array | null>>();

function download(entry: GalleryEntry): Promise<Uint8Array | null> {
  const key = entry.preview;
  let pending = downloads.get(key);
  if (!pending) {
    pending = fetchGalleryPreview(entry)
      .catch(() => null)
      .finally(() => downloads.delete(key));
    downloads.set(key, pending);
  }
  return pending;
}

/**
 * Downloads `entry`'s preview and calls `show` with an object URL of the
 * checked bytes, or with null when there is no usable preview. The returned
 * function lets go: it revokes the URL, and a download still running then
 * creates none.
 */
export function showGalleryPreview(entry: GalleryEntry, show: (url: string | null) => void): () => void {
  let alive = true;
  let url: string | null = null;
  void download(entry).then((bytes) => {
    if (!alive) return;
    const ext = bytes && sniffImageExt(bytes);
    url = bytes && ext ? URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[ext] })) : null;
    show(url);
  });
  return () => {
    alive = false;
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
}

export type GalleryPreviewState = 'loading' | 'ready' | 'missing';

export interface GalleryPreview {
  url: string | null;
  state: GalleryPreviewState;
}

/**
 * The entry's preview as an object URL, downloaded once `visible` (see
 * useInView) and kept while the card shows the same preview: re-renders and
 * a refreshed gallery index download nothing again.
 */
export function useGalleryPreview(entry: GalleryEntry, visible: boolean): GalleryPreview {
  const path = entry.preview;
  const [shown, setShown] = useState<{ path: string; url: string | null } | null>(null);
  const start = useEffectEvent((show: (url: string | null) => void) => showGalleryPreview(entry, show));

  useEffect(() => {
    if (!visible || !path) return;
    return start((url) => setShown({ path, url }));
  }, [path, visible]);

  if (!path) return { url: null, state: 'missing' };
  // A result for another preview shows as loading, never another template's picture.
  if (shown?.path !== path) return { url: null, state: 'loading' };
  return { url: shown.url, state: shown.url ? 'ready' : 'missing' };
}

/**
 * Small thumbnails of project images, drawn from the runtime's preview
 * cache onto a canvas, with a shimmer while the preview loads.
 */
import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { getImageCache } from '../../../runtime';
import { Skeleton, cx } from '../../kit';
import { usePreviewTick } from './assetData';

export interface AssetThumbProps {
  projectId: string;
  assetId: string;
  /** CSS size of the thumbnail. */
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  className?: string;
  style?: CSSProperties;
}

export const AssetThumb = memo(function AssetThumb({ projectId, assetId, width, height, fit = 'cover', className, style }: AssetThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = usePreviewTick();

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const img = getImageCache().getPreview(projectId, assetId);
    // Readiness lives on the element (CSS shows the canvas or the shimmer), not in React state.
    delete canvas.dataset.ready;
    if (!img || !(img.width > 0 && img.height > 0)) return;
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const scale = fit === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    try {
      // A cover crop keeps the top of tall screenshots (status bar and header), which is what identifies them.
      ctx.drawImage(img, (w - dw) / 2, fit === 'cover' ? 0 : (h - dh) / 2, dw, dh);
      canvas.dataset.ready = '';
    } catch {
      // A preview evicted mid-draw shows the shimmer until the next tick repaints it.
    }
  }, [projectId, assetId, width, height, fit, tick]);

  return (
    <span className={cx('relative block shrink-0 overflow-hidden', className)} style={{ width, height, ...style }}>
      <canvas ref={ref} aria-hidden className="peer block size-full opacity-0 transition-opacity duration-(--dur) data-[ready]:opacity-100" />
      <Skeleton className="absolute inset-0 peer-data-[ready]:hidden" radius="xs" width="100%" height="100%" />
    </span>
  );
});

/** Placeholder tile for a missing image. */
export function MissingThumb({ width, height, className }: { width: number; height: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('flex shrink-0 items-center justify-center border border-dashed border-line-strong bg-field text-text-3 [&_svg]:size-4', className)}
      style={{ width, height }}
    >
      <ImageOff />
    </span>
  );
}

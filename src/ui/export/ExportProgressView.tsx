/**
 * The export dialog while files render: the last finished image on a small
 * stage, a progress bar, what is being rendered and the time left.
 */
import { useEffect, useRef, useState } from 'react';
import type { ExportJob, ExportProgress } from '../../export/types';
import { sizeById } from '../../model/catalog';
import { ProgressBar, Skeleton } from '../kit';
import { jobLabel, remainingLabel, remainingMs } from './exportModel';

import { t } from '../../i18n';
export interface ExportPreviewImage {
  bytes: Uint8Array;
  job: ExportJob;
}

export interface ExportProgressViewProps {
  progress: ExportProgress;
  /** performance.now() when rendering started. */
  startedAt: number;
  preview: ExportPreviewImage | null;
  format: 'png' | 'jpeg';
  stopping: boolean;
  /** Where files go ("Sunny App screenshots"). */
  targetLabel: string;
}

const STAGE_DOTS = { backgroundImage: 'radial-gradient(var(--stage-dot) 1px, transparent 1px)', backgroundSize: '16px 16px' };

export function ExportProgressView({ progress, startedAt, preview, format, stopping, targetLabel }: ExportProgressViewProps) {
  const { done, total, current } = progress;
  const fraction = total > 0 ? done / total : 0;
  const now = useNow(1000);
  const left = remainingLabel(remainingMs(done, total, now - startedAt));
  const shown = Math.min(total, done + 1);
  const firstJob = current ?? preview?.job ?? null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-10 py-8">
      <div
        className="relative flex h-[330px] w-full max-w-[640px] items-center justify-center overflow-hidden rounded-xl border border-line bg-stage"
        style={STAGE_DOTS}
      >
        {preview ? <PreviewImage image={preview} format={format} /> : firstJob ? <PreviewSkeleton job={firstJob} /> : null}
      </div>

      <div className="flex w-full max-w-[460px] flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-ui font-medium text-text">
            {stopping ? t('Stopping after this file…') : done >= total ? t('Finishing…') : t('Rendering {shown} of {total}', { shown, total })}
          </span>
          <span className="text-xs text-text-3 tabular-nums">{Math.round(fraction * 100)}%</span>
        </div>
        <ProgressBar value={fraction} tone="brand" label={t('Export progress')} />
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="min-w-0 truncate text-text-2">{current ? jobLabel(current) : t('Writing to {targetLabel}', { targetLabel })}</span>
          {left && <span className="shrink-0 text-text-3">{left}</span>}
        </div>
      </div>
    </div>
  );
}

/** Re-renders every `ms` so the time left counts down between files. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const PREVIEW_MAX_H = 290;
const PREVIEW_MAX_W = 560;

function previewBox(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(PREVIEW_MAX_H / height, PREVIEW_MAX_W / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function PreviewImage({ image, format }: { image: ExportPreviewImage; format: 'png' | 'jpeg' }) {
  const imgRef = useRef<HTMLImageElement>(null);
  // The object URL lives exactly as long as the image shows these bytes.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const url = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: format === 'png' ? 'image/png' : 'image/jpeg' }));
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image, format]);
  const box = previewBox(image.job.width, image.job.height);
  const size = sizeById(image.job.sizeId);
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="overflow-hidden rounded-[10px] bg-surface-2 shadow-slide" style={box}>
        <img ref={imgRef} alt="" decoding="async" draggable={false} className="block size-full" />
      </div>
      <figcaption className="text-2xs text-text-3">
        {t('Last finished ·')} {size?.label ?? image.job.sizeId} · {image.job.width} × {image.job.height}
      </figcaption>
    </figure>
  );
}

function PreviewSkeleton({ job }: { job: ExportJob }) {
  const box = previewBox(job.width, job.height);
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton width={box.width} height={box.height} radius="lg" />
      <span className="text-2xs text-text-3">{t('Preparing the first file…')}</span>
    </div>
  );
}

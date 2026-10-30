/**
 * runExport: renders, encodes and writes the jobs of a plan one at a time.
 *
 * Strictly sequential on purpose: a full-size render plus its PNG bytes is
 * tens of megabytes, so only one job is ever in flight and its buffers are
 * dropped before the next one starts.
 */
import type { ExportJob, ExportReport, RunExportOptions } from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** A readable message for anything a renderer or platform may throw (Tauri rejects with plain strings). */
function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') return err.message;
  return err === undefined || err === null ? '' : String(err);
}

/** JPEG quality as ExportSettings documents it (0.5..1); garbage becomes the 0.92 browsers default to. */
function clampQuality(q: number): number {
  return Number.isFinite(q) ? Math.min(1, Math.max(0.5, q)) : 0.92;
}

/**
 * Runs every job of `plan` in order. Checks `signal` before each job (and
 * before writing a job that finished rendering after the abort), reports
 * progress at the start and after every job, and records a failed render or
 * write in `failed` instead of stopping.
 */
export async function runExport(opts: RunExportOptions): Promise<ExportReport> {
  const started = now();
  const jobs = opts.plan.jobs;
  const total = jobs.length;
  const failed: ExportReport['failed'] = [];
  const quality = clampQuality(opts.jpegQuality);
  const aborted = () => opts.signal?.aborted === true;
  let written = 0;
  let done = 0;
  let cancelled = false;
  let lastCurrent: ExportJob | null = null;

  const progress = (current: ExportJob | null) => {
    lastCurrent = current;
    try {
      opts.onProgress?.({ done, total, current });
    } catch {
      // A broken progress callback (UI code) must not abort an export that is writing files.
    }
  };

  progress(aborted() ? null : (jobs[0] ?? null));
  for (const job of jobs) {
    if (aborted()) {
      cancelled = true;
      break;
    }
    try {
      const data = await opts.renderJob(job, opts.format, quality);
      if (aborted()) {
        cancelled = true;
        break;
      }
      if (!(data instanceof Uint8Array) || data.length === 0) throw new Error('The renderer returned no image data');
      await opts.write(opts.target, job.path, data);
      written++;
    } catch (err) {
      failed.push({ job, error: errorMessage(err) || 'Unknown error' });
    }
    done++;
    progress(aborted() ? null : (jobs[done] ?? null));
  }
  // Clear the "current" label when the abort landed mid-job.
  if (cancelled && lastCurrent !== null) progress(null);

  return { written, failed, cancelled, target: opts.target, ms: Math.max(0, Math.round(now() - started)) };
}

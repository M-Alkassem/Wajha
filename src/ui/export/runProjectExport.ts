/**
 * The export run behind the dialog: ask for a destination, save pending
 * edits, render and write every job, finish the target (the web build zips
 * and downloads here). Dependencies come in as arguments, so tests drive it
 * with the memory platform and a fake renderer.
 */
import type { Project, ExportSettings } from '../../model/types';
import type { ExportJob, ExportPlan, ExportProgress, ExportReport } from '../../export/types';
import { runExport } from '../../export/runner';
import type { ExportTarget, Platform } from '../../platform/types';
import type { RenderedJob } from '../../runtime/renderer';
import { createOverflowCollector, exportTargetName, pathPrefix, prefixPlan, type OverflowEntry } from './exportModel';

export interface ExportRunDeps {
  platform: Platform;
  render(project: Project, job: ExportJob, format: 'png' | 'jpeg', quality: number): Promise<RenderedJob>;
  /** Writes pending project edits (failures are logged, not fatal: rendering uses the open project). */
  flush(): Promise<void>;
}

export interface ExportRunOptions {
  project: Project;
  settings: Pick<ExportSettings, 'format' | 'jpegQuality' | 'structure'>;
  /** Planned with the settings above; job paths relative to the destination's project folder. */
  plan: ExportPlan;
  signal: AbortSignal;
  /** The destination was chosen and rendering starts. */
  onStart?(target: ExportTarget): void;
  onProgress?(progress: ExportProgress): void;
  /** Every finished file, for a live preview. */
  onFile?(bytes: Uint8Array, job: ExportJob): void;
}

export interface ExportOutcome {
  report: ExportReport;
  target: ExportTarget;
  /** Bytes written. */
  bytes: number;
  /** Texts that still overflow at their minimum size. */
  overflow: OverflowEntry[];
  /** The jobs as written (with the project folder prefix). */
  jobs: ExportJob[];
}

/** Runs the export; resolves null when the destination picker is cancelled. Rejects when the destination cannot be used. */
export async function runProjectExport(opts: ExportRunOptions, deps: ExportRunDeps): Promise<ExportOutcome | null> {
  const { project, settings, signal } = opts;
  const { platform } = deps;
  const target = await platform.pickExportTarget(exportTargetName(project.name));
  if (!target) return null;
  if (signal.aborted) {
    return { report: { written: 0, failed: [], cancelled: true, target, ms: 0 }, target, bytes: 0, overflow: [], jobs: [] };
  }
  opts.onStart?.(target);

  const plan = prefixPlan(opts.plan, pathPrefix(settings.structure, project.name));
  try {
    await deps.flush();
  } catch (err) {
    console.warn('[export] pending edits could not be saved before exporting', err);
  }

  const overflow = createOverflowCollector(project);
  let bytes = 0;
  const report = await runExport({
    plan,
    target,
    format: settings.format,
    jpegQuality: settings.jpegQuality,
    signal,
    renderJob: async (job, format, quality) => {
      const rendered = await deps.render(project, job, format, quality);
      overflow.add(job, rendered.result.overflowingText);
      try {
        opts.onFile?.(rendered.bytes, job);
      } catch {
        // A preview problem must not fail the file.
      }
      return rendered.bytes;
    },
    write: async (t, path, data) => {
      await platform.exportWrite(t, path, data);
      bytes += data.byteLength;
    },
    onProgress: opts.onProgress,
  });

  // A cancelled web export downloads nothing; an export that wrote nothing has nothing to deliver.
  if (!report.cancelled && report.written > 0) await platform.exportFinish(target);
  return { report, target, bytes, overflow: overflow.list(), jobs: plan.jobs };
}

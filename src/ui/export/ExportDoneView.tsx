/**
 * The export dialog after a run: success (or a stopped / partly failed run),
 * where the files went, failed files with their errors and texts that did
 * not fit (each one jumps to its slide). Also the error state.
 */
import type { ReactNode } from 'react';
import { Check, ChevronRight, CircleSlash, Download, Folder, TriangleAlert, Type, X } from 'lucide-react';
import { FAMILIES } from '../../model/catalog';
import { cx } from '../kit';
import type { JumpTarget } from '../editor/dialogs/dialogState';
import { languageName, listJoin, plural } from '../editor/dialogs/labels';
import { FamilyIcon, StatusMark } from '../editor/dialogs/parts';
import { formatBytes, formatDuration, type OverflowEntry } from './exportModel';
import type { ExportOutcome } from './runProjectExport';

export interface ExportDoneViewProps {
  outcome: ExportOutcome;
  /** Files the run was going to write. */
  total: number;
  /** Web build: the files were downloaded as a zip. */
  downloaded: boolean;
  onJump(target: JumpTarget): void;
}

export function ExportDoneView({ outcome, total, downloaded, onJump }: ExportDoneViewProps) {
  const { report, target, bytes, overflow } = outcome;
  const failed = report.failed.length;
  const written = report.written;

  let tone: 'success' | 'warning' | 'danger' | 'neutral';
  let title: string;
  let icon = <Check strokeWidth={2.5} />;
  if (report.cancelled) {
    tone = 'neutral';
    icon = <CircleSlash />;
    title = 'Export stopped';
  } else if (written === 0) {
    tone = 'danger';
    icon = <X strokeWidth={2.5} />;
    title = 'No files were exported';
  } else if (failed > 0) {
    tone = 'warning';
    icon = <TriangleAlert />;
    title = `${written.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} files exported`;
  } else {
    tone = 'success';
    title = `${plural(written, 'file')} exported`;
  }

  const stats = written > 0 && !report.cancelled ? `in ${formatDuration(report.ms)} · ${formatBytes(bytes)}` : null;
  const destination = report.cancelled
    ? downloaded
      ? 'Nothing was downloaded.'
      : written > 0
        ? `${plural(written, 'file')} ${written === 1 ? 'was' : 'were'} written to ${target.label} before you stopped.`
        : 'No files were written.'
    : null;

  const lists = failed > 0 || overflow.length > 0;
  const failedPaths = new Set(report.failed.map((f) => f.job.path));
  const perFamily = report.cancelled
    ? []
    : [...new Set(outcome.jobs.map((j) => j.family))]
        .map((family) => ({ family, files: outcome.jobs.filter((j) => j.family === family && !failedPaths.has(j.path)).length }))
        .filter((f) => f.files > 0);

  return (
    <div className={cx('flex h-full flex-col items-center overflow-y-auto px-10', lists ? 'pt-12 pb-8' : 'justify-center pb-16')}>
      <div className="flex flex-col items-center gap-4 text-center">
        <StatusMark tone={tone}>{icon}</StatusMark>
        <div role="status" className="flex flex-col items-center gap-1">
          <h3 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text">{title}</h3>
          {stats && <p className="text-ui text-text-2 tabular-nums">{stats}</p>}
          {destination && <p className="max-w-[420px] text-ui text-text-2">{destination}</p>}
        </div>
        {!report.cancelled && written > 0 && (
          <div className="flex max-w-[480px] items-center gap-2 rounded-full border border-line bg-field py-1 pr-3.5 pl-2.5 text-xs text-text-2 light:bg-surface">
            {downloaded ? <Download aria-hidden className="size-3.5 shrink-0 text-text-3" /> : <Folder aria-hidden className="size-3.5 shrink-0 text-accent-fg" />}
            <span className="truncate" title={target.path ?? undefined}>
              {downloaded ? `Downloaded ${target.label}.zip` : `Saved to ${target.label}`}
            </span>
          </div>
        )}
        {perFamily.length > 1 && (
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-3" aria-label="Files per device">
            {perFamily.map(({ family, files }) => (
              <li key={family} className="flex items-center gap-1.5">
                <FamilyIcon family={family} className="size-3.5" />
                {FAMILIES[family].label}
                <span className="text-text-2 tabular-nums">{files}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lists && (
        <div className="mt-8 flex w-full max-w-[560px] flex-col gap-3">
          {failed > 0 && <Failures failures={report.failed} />}
          {overflow.length > 0 && <Overflow entries={overflow} onJump={onJump} />}
        </div>
      )}
    </div>
  );
}

function ResultCard({ tone, icon, title, description, children }: { tone: 'danger' | 'warning'; icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-field light:bg-raised">
      <header className="flex flex-col gap-0.5 border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className={cx('flex [&_svg]:size-3.5', tone === 'danger' ? 'text-danger' : 'text-warning')}>{icon}</span>
          <h4 className="text-xs font-medium text-text">{title}</h4>
        </span>
        {description && <p className="pl-[22px] text-xs leading-4 text-text-2">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Failures({ failures }: { failures: ExportOutcome['report']['failed'] }) {
  return (
    <ResultCard tone="danger" icon={<TriangleAlert />} title={`${plural(failures.length, 'file')} failed`}>
      <ul className="max-h-[156px] divide-y divide-line overflow-y-auto">
        {failures.map(({ job, error }) => (
          <li key={job.path} className="flex flex-col gap-0.5 px-3 py-2">
            <span className="truncate font-mono text-2xs text-text" title={job.path}>
              {job.path}
            </span>
            <span className="text-xs leading-4 text-danger">{error}</span>
          </li>
        ))}
      </ul>
    </ResultCard>
  );
}

function Overflow({ entries, onJump }: { entries: OverflowEntry[]; onJump(t: JumpTarget): void }) {
  const slides = new Set(entries.map((e) => e.slideIndex)).size;
  return (
    <ResultCard
      tone="warning"
      icon={<Type />}
      title={`Text doesn't fit on ${plural(slides, 'slide')}`}
      description="Even at its smallest size it needs more lines than allowed. Shorten it, or allow more lines."
    >
      <ul className="max-h-[188px] divide-y divide-line overflow-y-auto">
        {entries.map((e) => (
          <li key={`${e.slideIndex}:${e.elementId}`}>
            <button
              type="button"
              onClick={() => onJump({ family: e.family, lang: e.lang, slideIndex: e.slideIndex, elementId: e.elementId })}
              className="group/jump flex w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors duration-(--dur-fast) hover:bg-field-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs font-medium text-text">
                  Slide {e.slideIndex + 1} · {e.label}
                </span>
                <span className="truncate text-2xs text-text-3">
                  {listJoin(e.langs.map(languageName))} · {e.sizes.join(', ')}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-3 group-hover/jump:text-text-2" />
            </button>
          </li>
        ))}
      </ul>
    </ResultCard>
  );
}

/** The dialog body when an export could not start or finish. */
export function ExportErrorView({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-10 pb-10 text-center">
      <StatusMark tone="danger">
        <TriangleAlert />
      </StatusMark>
      <div role="alert" className="flex max-w-[440px] flex-col items-center gap-1">
        <h3 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text">The export didn't finish</h3>
        <p className="text-ui text-text-2">{message}</p>
      </div>
    </div>
  );
}

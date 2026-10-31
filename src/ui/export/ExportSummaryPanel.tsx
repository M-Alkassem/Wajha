/**
 * Right column of the export dialog: how many files, how big, per device,
 * and the checks to look at first (each one jumps to the slide in question).
 */
import { memo, useMemo, type ReactNode } from 'react';
import { ChevronRight, CircleCheck, ImageOff, Info, Layers, MonitorSmartphone, Type } from 'lucide-react';
import { FAMILIES } from '../../model/catalog';
import type { ExportStructure, FamilyId, LangCode, Project } from '../../model/types';
import type { ExportPlan, ExportWarning } from '../../export/types';
import { Spinner, cx } from '../kit';
import type { JumpTarget } from '../editor/dialogs/dialogState';
import { languageName, listJoin, plural, storeName } from '../editor/dialogs/labels';
import { FamilyIcon, SectionHeading } from '../editor/dialogs/parts';
import { estimateBytes, familySummaries, firstSkippedSlide, formatBytes, groupWarnings, missingShotRows, type FamilySummary, type MissingShotRow } from './exportModel';
import type { TextOverflowRow, TextOverflowState } from './textOverflow';

import { t, tn } from '../../i18n';
import { familyLabel } from '../shared/names';
export interface ExportSummaryPanelProps {
  project: Project;
  plan: ExportPlan;
  sizes: readonly string[];
  format: 'png' | 'jpeg';
  quality: number;
  structure: ExportStructure;
  /** Texts that will not fit their line limit (checked while the dialog is open). */
  overflow: TextOverflowState;
  onJump(target: JumpTarget): void;
}

const STRUCTURE_LABEL: Record<ExportStructure, string> = { stores: t('Stores'), fastlane: 'fastlane', flat: t('Flat') };

export const ExportSummaryPanel = memo(function ExportSummaryPanel({ project, plan, sizes, format, quality, structure, overflow, onJump }: ExportSummaryPanelProps) {
  const files = plan.jobs.length;
  const estimate = useMemo(() => estimateBytes(plan.jobs, format, quality), [plan.jobs, format, quality]);
  const families = useMemo(() => familySummaries(plan.jobs, project.families), [plan.jobs, project.families]);
  const groups = useMemo(() => groupWarnings(plan.warnings), [plan.warnings]);
  const missing = useMemo(() => missingShotRows(groups.missing, plan.jobs), [groups.missing, plan.jobs]);
  const checks = missing.length + overflow.rows.length + groups.slides.length + groups.locales.length;

  return (
    <div className="flex flex-col gap-6 px-5 pt-4 pb-6">
      <section className="flex flex-col gap-3" aria-label={t('Summary')}>
        <SectionHeading>{t('Summary')}</SectionHeading>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[34px] leading-10 font-semibold tracking-[-0.02em] text-text tabular-nums">{files.toLocaleString('en-US')}</span>
            <span className="text-ui text-text-2">{tn(files, 'file', 'files')}</span>
          </div>
          <p className="text-xs text-text-3">
            {files > 0 ? t('About {formatBytes}', { formatBytes: formatBytes(estimate) }) : t('Nothing selected')} · {format === 'png' ? t('PNG') : t('JPEG {v}%', { v: Math.round(quality * 100) })} · {STRUCTURE_LABEL[structure]}
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {families.map((f) => (
            <FamilyLine key={f.family} summary={f} hasSizes={FAMILIES[f.family].sizes.some((s) => sizes.includes(s.id))} />
          ))}
        </ul>
      </section>

      {files > 0 && (
        <section className="flex flex-col gap-3" aria-label={t('Checks')}>
          <SectionHeading>{t('Before you export')}</SectionHeading>
          {checks === 0 && !overflow.pending ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-success-soft bg-success-soft px-3 py-2.5">
              <CircleCheck aria-hidden className="mt-px size-4 shrink-0 text-success" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text">{t('Ready to export')}</span>
                <span className="text-xs leading-4 text-text-2">{t('Every device has a screenshot, every text fits and every language has a store locale.')}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {missing.length > 0 && <MissingShots rows={missing} project={project} onJump={onJump} />}
              {overflow.rows.length > 0 && <TextOverflow rows={overflow.rows} onJump={onJump} />}
              {groups.slides.length > 0 && <SlideLimits warnings={groups.slides} project={project} onJump={onJump} />}
              {groups.locales.length > 0 && (
                <CheckCard icon={<Info />} tone="info" title={t('Store languages')}>
                  <ul className="flex flex-col gap-1.5">
                    {groups.locales.map((w, i) => (
                      <li key={i} className="text-xs leading-4 text-text-2">
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </CheckCard>
              )}
              {overflow.pending && (
                // Only a big project takes long enough for this to fade in.
                <p className="flex animate-[kit-fade-in_var(--dur-slow)_var(--ease-out)_400ms_both] items-center gap-2 px-0.5 text-xs text-text-3">
                  <Spinner size={12} label={null} />
                  {t('Checking that every text fits…')}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
});

function FamilyLine({ summary, hasSizes }: { summary: FamilySummary; hasSizes: boolean }) {
  const info = FAMILIES[summary.family];
  const detail =
    summary.files > 0
      ? `${plural(summary.sizes, 'size')} · ${plural(summary.languages, 'language')} · ${plural(summary.slides, 'slide')}`
      : hasSizes
        ? `No selected language has a ${storeName(info.stores[0])} locale`
        : 'Not exported: no size selected';
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-2 light:bg-surface-3">
        <FamilyIcon family={summary.family} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-text">{info.label}</span>
        <span className={cx('truncate text-2xs', summary.files > 0 ? 'text-text-3' : 'text-warning')}>{detail}</span>
      </span>
      <span className={cx('pt-px text-xs tabular-nums', summary.files > 0 ? 'text-text' : 'text-text-3')}>{summary.files}</span>
    </li>
  );
}

function CheckCard({ icon, tone, title, description, children }: { icon: ReactNode; tone: 'warning' | 'info'; title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-popover px-3 pt-2.5 pb-3 shadow-[var(--highlight)] light:bg-raised">
      <div className="flex items-start gap-2">
        <span className={cx('mt-px flex shrink-0 [&_svg]:size-3.5', tone === 'warning' ? 'text-warning' : 'text-text-3')}>{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-text">{title}</span>
          {description && <span className="text-xs leading-4 text-text-2">{description}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function MissingShots({ rows, project, onJump }: { rows: MissingShotRow[]; project: Project; onJump(t: JumpTarget): void }) {
  const total = rows.reduce((n, r) => n + r.slides.length, 0);
  const base = project.languages[0];
  return (
    <CheckCard icon={<ImageOff />} tone="warning" title={t('Missing screenshots')} description={t('{plural} will show a placeholder screen. Click a number to go there.', { plural: plural(total, 'slide') })}>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <SlideChips
            key={`${row.family}:${row.lang ?? '*'}`}
            families={[row.family]}
            lang={row.lang}
            chips={row.slides.map((i) => ({ slideIndex: i, target: { family: row.family, lang: row.lang ?? base, slideIndex: i } }))}
            onJump={onJump}
          />
        ))}
      </ul>
    </CheckCard>
  );
}

function TextOverflow({ rows, onJump }: { rows: readonly TextOverflowRow[]; onJump(t: JumpTarget): void }) {
  const slides = new Set(rows.flatMap((r) => r.slides.map((s) => s.slideIndex))).size;
  return (
    <CheckCard
      icon={<Type />}
      tone="warning"
      title={t("Text doesn't fit")}
      description={t('Text on {plural} needs more lines than allowed, even at its smallest size. Click a number to go there.', { plural: plural(slides, 'slide') })}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <SlideChips
            key={`${row.families.join(',')}:${row.lang ?? '*'}`}
            families={row.families}
            lang={row.lang}
            what="the text"
            // Each chip selects the text on the first of these devices, so the inspector shows its size and line limit.
            chips={row.slides.map((s) => ({ slideIndex: s.slideIndex, target: { family: row.families[0], lang: s.lang, slideIndex: s.slideIndex, elementId: s.elementId } }))}
            onJump={onJump}
          />
        ))}
      </ul>
    </CheckCard>
  );
}

interface SlideChip {
  slideIndex: number;
  target: JumpTarget;
}

/** Devices and a language over numbered chips that jump to their slides; `what` names the target for assistive tech. */
function SlideChips({
  families,
  lang,
  chips,
  what,
  onJump,
}: {
  families: readonly FamilyId[];
  lang: LangCode | null;
  chips: readonly SlideChip[];
  what?: string;
  onJump(t: JumpTarget): void;
}) {
  const langLabel = lang === null ? t('All languages') : languageName(lang);
  const iconClass = 'mt-0.5 size-3 shrink-0 text-text-3';
  return (
    <li className="flex flex-col gap-1.5">
      <span className="flex items-start gap-1.5 text-2xs leading-4 text-text-2">
        {families.length === 1 ? <FamilyIcon family={families[0]} className={iconClass} /> : <MonitorSmartphone aria-hidden className={iconClass} />}
        <span className="min-w-0">
          {listJoin(families.map((f) => familyLabel(f)))} · {langLabel}
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        {chips.map(({ slideIndex, target }) => (
          <button
            key={slideIndex}
            type="button"
            onClick={() => onJump(target)}
            aria-label={
              what
                ? t('Go to {what} on slide {slide}, {label}, {langLabel}', { what, slide: slideIndex + 1, label: t(FAMILIES[target.family ?? families[0]].label), langLabel })
                : t('Go to slide {slide}, {label}, {langLabel}', { slide: slideIndex + 1, label: t(FAMILIES[target.family ?? families[0]].label), langLabel })
            }
            className={cx(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-line bg-surface-2 px-1.5 text-2xs font-medium text-text-2 tabular-nums outline-none',
              'transition-colors duration-(--dur-fast) hover:border-accent-line hover:bg-accent-soft hover:text-accent-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus light:bg-surface',
            )}
          >
            {slideIndex + 1}
          </button>
        ))}
      </span>
    </li>
  );
}

function SlideLimits({ warnings, project, onJump }: { warnings: ExportWarning[]; project: Project; onJump(t: JumpTarget): void }) {
  return (
    <CheckCard icon={<Layers />} tone="warning" title={t('Not everything is exported')}>
      <ul className="flex flex-col gap-1">
        {warnings.map((w, i) => {
          const family: FamilyId | undefined = w.family;
          const slideIndex = family ? firstSkippedSlide(project, family) : null;
          if (!family || slideIndex === null) {
            return (
              <li key={i} className="text-xs leading-4 text-text-2">
                {w.message}
              </li>
            );
          }
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump({ family, slideIndex })}
                className="group/jump -mx-1.5 flex w-[calc(100%+12px)] items-start gap-1 rounded-md px-1.5 py-1 text-start text-xs leading-4 text-text-2 outline-none transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="min-w-0 flex-1">{w.message}</span>
                <ChevronRight aria-hidden className="mt-px size-3.5 shrink-0 text-text-3 group-hover/jump:text-text-2 rtl:-scale-x-100" />
              </button>
            </li>
          );
        })}
      </ul>
    </CheckCard>
  );
}

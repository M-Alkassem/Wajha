/**
 * The translations table: a row per slide and text, a column per language
 * (base first). Header row and the slide and text columns stay in place
 * while the table scrolls. Every cell is a textarea that grows with its
 * text and writes through setText (the store coalesces typing bursts).
 */
import { memo, useCallback, type KeyboardEvent } from 'react';
import { FAMILIES, isRtl } from '../../../model/catalog';
import type { FamilyId, LangCode, Project } from '../../../model/types';
import { useEditor } from '../../../store';
import { Badge, cx } from '../../kit';
import { SlidePreview } from '../../shared/SlidePreview';
import { languageName, nativeName } from './labels';
import { cellText, type TranslationRow, type TranslationStats } from './translationsModel';

const SLIDE_COL = 84;
const TEXT_COL = 136;
const LANG_COL_MIN = 260;
const HEADER_H = 60;
const ROW_MIN_H = 44;

export interface TranslationsGridProps {
  /** Live project: cell values. */
  project: Project;
  /** Settled copy for the slide thumbnails, so typing does not repaint them. */
  previewProject: Project;
  rows: readonly TranslationRow[];
  stats: TranslationStats;
}

export function TranslationsGrid({ project, previewProject, rows, stats }: TranslationsGridProps) {
  const langs = project.languages;
  const base = langs[0];
  const family = project.families[0];

  // Enter moves to the same language in the next row, like a spreadsheet; Shift+Enter keeps a new line.
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement) || e.key !== 'Enter' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const row = Number(target.dataset.row);
    const col = target.dataset.col;
    const next = e.currentTarget.querySelector<HTMLTextAreaElement>(`textarea[data-row="${row + 1}"][data-col="${col}"]`);
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  }, []);

  return (
    <div
      role="table"
      aria-label="Translations"
      aria-rowcount={rows.length + 1}
      onKeyDown={onKeyDown}
      className="grid"
      style={{
        gridTemplateColumns: `${SLIDE_COL}px ${TEXT_COL}px repeat(${langs.length}, minmax(${LANG_COL_MIN}px, 1fr))`,
        minWidth: SLIDE_COL + TEXT_COL + langs.length * LANG_COL_MIN,
      }}
    >
      <div role="row" className="contents">
        <div
          role="columnheader"
          className="sticky top-0 left-0 z-30 flex items-end border-r border-b border-line bg-popover px-3 pb-2.5 text-2xs font-medium text-text-3"
          style={{ height: HEADER_H }}
        >
          Slide
        </div>
        <div
          role="columnheader"
          className="sticky top-0 z-30 flex items-end border-r border-b border-line bg-popover px-3 pb-2.5 text-2xs font-medium text-text-3"
          style={{ height: HEADER_H, left: SLIDE_COL }}
        >
          Text
        </div>
        {langs.map((lang, i) => (
          <LanguageHeader key={lang} lang={lang} base={i === 0} filled={stats.filledByLang[lang] ?? 0} total={stats.rows} last={i === langs.length - 1} />
        ))}
      </div>

      {rows.map((row, r) => {
        const last = r === rows.length - 1 || rows[r + 1].slideId !== row.slideId;
        const baseText = cellText(project, row, base);
        return (
          <div role="row" key={row.id} className="contents">
            {row.first && <SlideCell project={previewProject} slideIndex={row.slideIndex} span={row.span} family={family} lang={base} />}
            <div
              role="rowheader"
              className={cx('sticky z-10 border-r border-line bg-popover px-3 py-3 text-xs leading-5 text-text-2', last ? 'border-b border-b-line-strong' : 'border-b')}
              style={{ left: SLIDE_COL }}
            >
              <span className="line-clamp-2 break-words">{row.label}</span>
            </div>
            {langs.map((lang, c) => (
              <Cell
                key={lang}
                slideId={row.slideId}
                textKey={row.key}
                lang={lang}
                value={cellText(project, row, lang)}
                placeholder={c === 0 ? 'Type the text' : baseText || 'Type the translation'}
                row={r}
                col={c}
                label={`Slide ${row.slideIndex + 1}, ${row.label}, ${languageName(lang)}`}
                lastInGroup={last}
                lastCol={c === langs.length - 1}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

const LanguageHeader = memo(function LanguageHeader({ lang, base, filled, total, last }: { lang: LangCode; base: boolean; filled: number; total: number; last: boolean }) {
  const native = nativeName(lang);
  const pct = total > 0 ? filled / total : 0;
  const complete = total > 0 && filled === total;
  return (
    <div
      role="columnheader"
      className={cx('sticky top-0 z-20 flex min-w-0 flex-col justify-end gap-2 border-b border-line bg-popover px-3 pb-2.5', !last && 'border-r')}
      style={{ height: HEADER_H }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs font-semibold text-text">{languageName(lang)}</span>
        {native && (
          <span dir="auto" lang={lang} className="truncate text-xs text-text-3">
            {native}
          </span>
        )}
        {base && (
          <Badge size="sm" variant="accent">
            Base
          </Badge>
        )}
        {isRtl(lang) && (
          <Badge size="sm" variant="neutral">
            RTL
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2" title={`${filled} of ${total} ${base ? 'texts written' : 'translated'}`}>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cx('h-full rounded-full transition-[width] duration-(--dur-slow) ease-out', complete ? 'bg-success' : 'bg-accent')}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
        <span className="text-2xs text-text-3 tabular-nums">
          {filled}/{total}
        </span>
      </div>
    </div>
  );
});

const SlideCell = memo(function SlideCell({ project, slideIndex, span, family, lang }: { project: Project; slideIndex: number; span: number; family: FamilyId; lang: LangCode }) {
  const design = FAMILIES[family].design;
  // As large as fits in the rows it spans, never taller (it would stretch them).
  const fitHeight = span * ROW_MIN_H - 20;
  const width = Math.round(Math.max(12, Math.min(36, (fitHeight * design.width) / design.height)));
  return (
    <div
      role="cell"
      className="sticky left-0 z-10 border-r border-b border-b-line-strong border-r-line bg-popover"
      style={{ gridRow: `span ${span}` }}
    >
      <div className="sticky flex items-start gap-2 px-3 py-2.5" style={{ top: HEADER_H }}>
        <span className="w-4 pt-0.5 text-right text-xs font-medium text-text-2 tabular-nums">{slideIndex + 1}</span>
        <span className="overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--line-strong)]">
          <SlidePreview project={project} slideIndex={slideIndex} family={family} lang={lang} width={width} />
        </span>
      </div>
    </div>
  );
});

interface CellProps {
  slideId: string;
  textKey: string;
  lang: LangCode;
  value: string;
  placeholder: string;
  row: number;
  col: number;
  label: string;
  lastInGroup: boolean;
  lastCol: boolean;
}

/** One translation: a textarea sized by an invisible copy of its text (no measuring on every keystroke). */
const Cell = memo(function Cell({ slideId, textKey, lang, value, placeholder, row, col, label, lastInGroup, lastCol }: CellProps) {
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  const shared = 'col-start-1 row-start-1 px-3 py-3 text-ui leading-5 whitespace-pre-wrap break-words';
  return (
    <div role="cell" className={cx('grid min-w-0', lastInGroup ? 'border-b border-b-line-strong' : 'border-b border-line', !lastCol && 'border-r border-r-line')}>
      <textarea
        value={value}
        placeholder={placeholder}
        dir={dir}
        lang={lang}
        rows={1}
        maxLength={2000}
        spellCheck
        aria-label={label}
        data-row={row}
        data-col={col}
        onChange={(e) => useEditor.getState().setText(slideId, textKey, lang, e.target.value)}
        className={cx(
          shared,
          'block size-full resize-none overflow-hidden bg-transparent text-text outline-none placeholder:text-text-3',
          'transition-[background-color,box-shadow] duration-(--dur-fast) hover:bg-field focus:bg-field focus:shadow-[inset_0_0_0_1.5px_var(--focus)]',
        )}
      />
      <div aria-hidden dir={dir} lang={lang} className={cx(shared, 'invisible min-h-11')}>
        {`${value || placeholder} `}
      </div>
    </div>
  );
});

/**
 * Pure helpers behind the translations table: which rows exist (slide x
 * text key), what counts as translated, filtering, the CSV legacy encoding
 * and what a CSV import changes.
 */
import { resolveLayout } from '../../../model/resolve';
import type { LangCode, Project, Slide } from '../../../model/types';
import type { CsvImportResult } from '../../../export/types';
import { languageName, listJoin, plural, textKeyLabel } from './labels';

import { t } from '../../../i18n';
export interface TranslationRow {
  /** Unique per slide and key. */
  id: string;
  slideId: string;
  slideIndex: number;
  key: string;
  /** "Headline", or the text element's own name. */
  label: string;
  /** First visible row of its slide (it draws the slide cell). */
  first: boolean;
  /** Visible rows of its slide. */
  span: number;
}

export const rowId = (slideId: string, key: string) => `${slideId}\u0000${key}`;

const keyRank = (key: string) => (key === 'headline' ? 0 : key === 'subtitle' ? 1 : 2);

/**
 * Text keys a slide shows in any enabled family (stored or derived
 * layouts), headline and subtitle first, then alphabetical, like the CSV.
 * Texts no element shows any more are left out.
 */
export function slideTextKeys(project: Project, slide: Slide): { key: string; name: string | null }[] {
  const names = new Map<string, string | null>();
  for (const family of project.families) {
    for (const el of resolveLayout(project, slide, family).elements) {
      if (el.kind !== 'text') continue;
      const name = el.name?.trim() || null;
      if (!names.has(el.key) || (names.get(el.key) === null && name)) names.set(el.key, name);
    }
  }
  return [...names.entries()]
    .sort(([a], [b]) => keyRank(a) - keyRank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, name]) => ({ key, name }));
}

/** Every row of the table, slide by slide. */
export function translationRows(project: Project): TranslationRow[] {
  const rows: TranslationRow[] = [];
  project.slides.forEach((slide, slideIndex) => {
    const keys = slideTextKeys(project, slide);
    keys.forEach(({ key, name }, i) => {
      rows.push({ id: rowId(slide.id, key), slideId: slide.id, slideIndex, key, label: name ?? textKeyLabel(key), first: i === 0, span: keys.length });
    });
  });
  return rows;
}

/** Recomputes `first` and `span` after filtering, so each slide cell spans its visible rows. */
export function regroup(rows: readonly TranslationRow[]): TranslationRow[] {
  const out: TranslationRow[] = [];
  for (let i = 0; i < rows.length; ) {
    let end = i + 1;
    while (end < rows.length && rows[end].slideId === rows[i].slideId) end++;
    for (let k = i; k < end; k++) out.push({ ...rows[k], first: k === i, span: end - i });
    i = end;
  }
  return out;
}

/** The stored text of a cell ("" when there is none). */
export function cellText(project: Project, row: Pick<TranslationRow, 'slideIndex' | 'key'>, lang: LangCode): string {
  return project.slides[row.slideIndex]?.texts[lang]?.[row.key] ?? '';
}

const filled = (text: string) => text.trim() !== '';

/**
 * A row needs work when a translation is empty (it falls back to the base
 * text). With only the base language, when the base text itself is empty.
 */
export function rowIsMissing(project: Project, row: TranslationRow): boolean {
  const [base, ...targets] = project.languages;
  if (targets.length === 0) return base !== undefined && !filled(cellText(project, row, base));
  return targets.some((lang) => !filled(cellText(project, row, lang)));
}

export interface TranslationStats {
  /** Cells to translate: rows x languages other than the base. */
  total: number;
  translated: number;
  /** Filled cells per language (the base included). */
  filledByLang: Record<LangCode, number>;
  rows: number;
}

export function translationStats(project: Project, rows: readonly TranslationRow[]): TranslationStats {
  const filledByLang: Record<LangCode, number> = {};
  for (const lang of project.languages) filledByLang[lang] = rows.filter((r) => filled(cellText(project, r, lang))).length;
  const targets = project.languages.slice(1);
  return {
    total: rows.length * targets.length,
    translated: targets.reduce((n, lang) => n + filledByLang[lang], 0),
    filledByLang,
    rows: rows.length,
  };
}

/** Rows whose label, slide number or any text contains `query` (case- and accent-insensitive). */
export function matchesQuery(project: Project, row: TranslationRow, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  if (fold(row.label).includes(q) || fold(`slide ${row.slideIndex + 1}`) === q || String(row.slideIndex + 1) === q) return true;
  return project.languages.some((lang) => fold(cellText(project, row, lang)).includes(q));
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

/**
 * Code page for CSV files that are not UTF-8 (Excel's old "CSV (Comma
 * delimited)"): Arabic script for Arabic, Persian and Urdu projects, Hebrew
 * for Hebrew ones, else the decoder's Western default.
 */
export function legacyCsvEncoding(languages: readonly LangCode[]): 'windows-1256' | 'windows-1255' | undefined {
  const primary = new Set(languages.map((l) => l.split('-')[0].toLowerCase()));
  if (primary.has('ar') || primary.has('fa') || primary.has('ur')) return 'windows-1256';
  if (primary.has('he') || primary.has('iw')) return 'windows-1255';
  return undefined;
}

/**
 * The replaceTexts payload for a CSV import: the texts of every slide the
 * import changed, plus an (empty) entry for each language the file adds so
 * it is added even when its column is empty.
 */
export function importPayload(before: Project, result: CsvImportResult): Record<string, Record<LangCode, Record<string, string>>> {
  const out: Record<string, Record<LangCode, Record<string, string>>> = {};
  result.project.slides.forEach((slide, i) => {
    const prev = before.slides[i];
    if (prev && prev.id === slide.id && slide.texts !== prev.texts) out[slide.id] = slide.texts;
  });
  const first = result.project.slides[0];
  if (first) {
    for (const lang of result.addedLanguages) {
      if (Object.values(out).some((texts) => texts[lang] !== undefined)) continue;
      const texts = out[first.id] ?? first.texts;
      out[first.id] = { ...texts, [lang]: texts[lang] ?? {} };
    }
  }
  return out;
}

/** Toast copy for a finished CSV import. */
export function importSummary(r: Pick<CsvImportResult, 'updatedCells' | 'addedLanguages' | 'skippedRows'>): {
  kind: 'success' | 'info';
  title: string;
  description?: string;
} {
  const notes: string[] = [];
  if (r.addedLanguages.length) notes.push(`Added ${listJoin(r.addedLanguages.map(languageName))}.`);
  // One count for both causes: a slide number the project lacks, and a key that is empty or one the model refuses.
  if (r.skippedRows) notes.push(`Skipped ${plural(r.skippedRows, 'row')} with no matching slide or no valid key.`);
  const description = notes.join(' ') || undefined;
  if (r.updatedCells > 0) return { kind: 'success', title: t('Updated {plural}', { plural: plural(r.updatedCells, 'text') }), description };
  if (r.addedLanguages.length) return { kind: 'success', title: t('Translations imported'), description };
  // Skipped rows were never compared, so only a file without any can be said to match.
  return { kind: 'info', title: t('Nothing to update'), description: description ?? t('Every text in the file matches the project.') };
}

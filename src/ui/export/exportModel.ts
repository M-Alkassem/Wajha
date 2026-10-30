/**
 * Pure helpers behind the export dialog: the size and language selection
 * and how it is saved, plan summaries, warning groups, the folder tree
 * preview, size and time estimates, labels. No React, no DOM.
 */
import { FAMILIES, sizeById } from '../../model/catalog';
import { resolveLayout } from '../../model/resolve';
import type { ExportSettings, ExportStructure, FamilyId, LangCode, Project } from '../../model/types';
import type { ExportJob, ExportPlan, ExportWarning } from '../../export/types';
import { sanitizeSegment } from '../../export/paths';
import { languageName, textKeyLabel } from '../editor/dialogs/labels';

/* Selection ------------------------------------------------------------- */

const sameMembers = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** `ids` in display order: project family order, then catalog order within a family. Unknown or disabled sizes are dropped. */
export function orderSizes(ids: Iterable<string>, families: readonly FamilyId[]): string[] {
  const wanted = new Set(ids);
  return families.flatMap((f) => (FAMILIES[f]?.sizes ?? []).filter((s) => wanted.has(s.id)).map((s) => s.id));
}

/** Every enabled family's default sizes. */
export function defaultSizeIds(families: readonly FamilyId[]): string[] {
  return families.flatMap((f) => (FAMILIES[f]?.sizes ?? []).filter((s) => s.default).map((s) => s.id));
}

/** Sizes the dialog starts with: the saved ones of enabled families, else every enabled family's defaults. */
export function initialSizes(project: Project): string[] {
  const saved = orderSizes(project.export.sizes, project.families);
  return saved.length > 0 ? saved : defaultSizeIds(project.families);
}

/**
 * What to save for a size selection: [] when it is exactly the defaults
 * (so a family enabled later gets its own defaults), else the ids.
 */
export function sizesSetting(selected: readonly string[], families: readonly FamilyId[]): string[] {
  const ordered = orderSizes(selected, families);
  return sameMembers(ordered, defaultSizeIds(families)) ? [] : ordered;
}

/** Languages the dialog starts with: the saved ones the project still has, else all of them. */
export function initialLanguages(project: Project): LangCode[] {
  const saved = project.languages.filter((l) => project.export.languages.includes(l));
  return saved.length > 0 ? saved : [...project.languages];
}

/** What to save for a language selection: [] when every language is selected (so languages added later are exported too). */
export function languagesSetting(selected: readonly LangCode[], projectLanguages: readonly LangCode[]): LangCode[] {
  const ordered = projectLanguages.filter((l) => selected.includes(l));
  return ordered.length === projectLanguages.length ? [] : ordered;
}

/** Toggles `id` in `list`, keeping the rest in place. */
export function toggled<T>(list: readonly T[], id: T, on: boolean): T[] {
  const has = list.includes(id);
  if (on === has) return [...list];
  return on ? [...list, id] : list.filter((x) => x !== id);
}

/** Why nothing can be exported, or null when the selection is fine. */
export function selectionProblem(sizes: readonly string[], languages: readonly LangCode[], files: number): string | null {
  if (sizes.length === 0) return 'Select at least one size to export.';
  if (languages.length === 0) return 'Select at least one language to export.';
  if (files === 0) return 'Nothing to export with this selection.';
  return null;
}

/** Settings for planExport from the dialog state (explicit lists, never "defaults"). */
export function planSettings(
  sizes: readonly string[],
  languages: readonly LangCode[],
  format: ExportSettings['format'],
  jpegQuality: number,
  structure: ExportStructure,
): ExportSettings {
  return { sizes: [...sizes], languages: [...languages], format, jpegQuality, structure };
}

export const EMPTY_PLAN: ExportPlan = Object.freeze({ jobs: [], warnings: [] }) as unknown as ExportPlan;

/* Paths --------------------------------------------------------------- */

/**
 * Folder every file goes into inside the chosen destination: the project
 * name for "stores" and "flat", so the folder the user picks is not
 * littered; nothing for fastlane, whose files belong at the repository root.
 */
export function pathPrefix(structure: ExportStructure, projectName: string): string {
  return structure === 'fastlane' ? '' : `${sanitizeSegment(projectName)}/`;
}

/** The plan with every job path inside `prefix`. */
export function prefixPlan(plan: ExportPlan, prefix: string): ExportPlan {
  if (!prefix) return plan;
  return { jobs: plan.jobs.map((j) => ({ ...j, path: prefix + j.path })), warnings: plan.warnings };
}

/** Name the destination picker suggests (and the web zip is called). */
export function exportTargetName(projectName: string): string {
  return sanitizeSegment(`${projectName} screenshots`);
}

/* Folder tree preview ------------------------------------------------- */

export interface TreeLine {
  depth: number;
  kind: 'folder' | 'file' | 'more-folders' | 'more-files';
  /** Folder or file name; empty for "more" lines. */
  name: string;
  /** Collapsed folder: files inside. more-folders: hidden folders. more-files: hidden files. */
  count?: number;
  /** more-folders: files inside the hidden folders. */
  files?: number;
  /** A folder whose content is listed below it. */
  open?: boolean;
}

interface TreeNode {
  folders: Map<string, TreeNode>;
  files: string[];
  total: number;
}

const node = (): TreeNode => ({ folders: new Map(), files: [], total: 0 });

function buildTree(paths: readonly string[]): TreeNode {
  const root = node();
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let at = root;
    at.total++;
    for (const part of parts.slice(0, -1)) {
      let next = at.folders.get(part);
      if (!next) {
        next = node();
        at.folders.set(part, next);
      }
      next.total++;
      at = next;
    }
    at.files.push(parts[parts.length - 1]);
  }
  return root;
}

export interface TreePreviewOptions {
  /** Hard cap on lines (default 12). */
  maxLines?: number;
  /** Files listed before "N more files" (default 2). */
  fileLimit?: number;
  /** Collapsed sibling folders listed before "N more folders" (default 1). */
  siblingLimit?: number;
}

/**
 * A compact picture of where files go: the first folder at each level is
 * opened, its first files listed, one more sibling shown collapsed with its
 * file count and the rest summarised. Deterministic; follows `paths` order.
 */
export function folderTreePreview(paths: readonly string[], options: TreePreviewOptions = {}): TreeLine[] {
  const maxLines = options.maxLines ?? 12;
  const fileLimit = options.fileLimit ?? 2;
  const siblingLimit = options.siblingLimit ?? 1;
  const lines: TreeLine[] = [];

  const walk = (n: TreeNode, depth: number) => {
    const folders = [...n.folders.entries()];
    folders.forEach(([name, child], i) => {
      if (i === 0) {
        lines.push({ depth, kind: 'folder', name, open: true });
        walk(child, depth + 1);
      } else if (i <= siblingLimit) {
        lines.push({ depth, kind: 'folder', name, count: child.total });
      } else if (i === siblingLimit + 1) {
        const rest = folders.slice(i);
        lines.push({ depth, kind: 'more-folders', name: '', count: rest.length, files: rest.reduce((sum, [, c]) => sum + c.total, 0) });
      }
    });
    n.files.slice(0, fileLimit).forEach((name) => lines.push({ depth, kind: 'file', name }));
    if (n.files.length > fileLimit) lines.push({ depth, kind: 'more-files', name: '', count: n.files.length - fileLimit });
  };
  walk(buildTree(paths), 0);
  return lines.length > maxLines ? lines.slice(0, maxLines) : lines;
}

/* Summaries ----------------------------------------------------------- */

export interface FamilySummary {
  family: FamilyId;
  files: number;
  sizes: number;
  languages: number;
  slides: number;
}

/** Files per enabled family (families without files included, with zeros). */
export function familySummaries(jobs: readonly ExportJob[], families: readonly FamilyId[]): FamilySummary[] {
  return families.map((family) => {
    const own = jobs.filter((j) => j.family === family);
    return {
      family,
      files: own.length,
      sizes: new Set(own.map((j) => j.sizeId)).size,
      languages: new Set(own.map((j) => j.lang)).size,
      slides: new Set(own.map((j) => j.slideIndex)).size,
    };
  });
}

export interface MissingShotGroup {
  family: FamilyId;
  lang: LangCode;
  /** 0-based slide indexes, ascending. */
  slides: number[];
}

export interface WarningGroups {
  missing: MissingShotGroup[];
  /** Slides over a store limit, sizes skipped because their files would clash. */
  slides: ExportWarning[];
  /** Languages a store has no locale for (or shares with another language). */
  locales: ExportWarning[];
  /** Every pre-export warning. */
  count: number;
}

/** Plan warnings grouped for the summary: missing screenshots per family and language, the rest by kind. */
export function groupWarnings(warnings: readonly ExportWarning[]): WarningGroups {
  const missing: MissingShotGroup[] = [];
  const slides: ExportWarning[] = [];
  const locales: ExportWarning[] = [];
  for (const w of warnings) {
    if (w.kind === 'missing-screenshot' && w.family && w.lang !== undefined && w.slideIndex !== undefined) {
      let group = missing.find((g) => g.family === w.family && g.lang === w.lang);
      if (!group) {
        group = { family: w.family, lang: w.lang, slides: [] };
        missing.push(group);
      }
      if (!group.slides.includes(w.slideIndex)) group.slides.push(w.slideIndex);
    } else if (w.kind === 'too-many-slides') {
      slides.push(w);
    } else if (w.kind === 'no-locale-code') {
      locales.push(w);
    }
  }
  for (const g of missing) g.slides.sort((a, b) => a - b);
  return { missing, slides, locales, count: warnings.filter((w) => w.kind !== 'text-overflow').length };
}

export interface MissingShotRow {
  family: FamilyId;
  /** null: every language the family exports misses these slides. */
  lang: LangCode | null;
  slides: number[];
}

/**
 * Missing screenshots as summary rows: one row per family when every
 * language it exports misses the same slides (the usual case: nothing
 * imported yet), else one row per language.
 */
export function missingShotRows(groups: readonly MissingShotGroup[], jobs: readonly ExportJob[]): MissingShotRow[] {
  const rows: MissingShotRow[] = [];
  for (const family of [...new Set(groups.map((g) => g.family))]) {
    const own = groups.filter((g) => g.family === family);
    const langs = new Set(jobs.filter((j) => j.family === family).map((j) => j.lang));
    const key = own[0].slides.join(',');
    const same = langs.size > 1 && own.length === langs.size && own.every((g) => g.slides.join(',') === key);
    if (same) rows.push({ family, lang: null, slides: [...own[0].slides] });
    else for (const g of own) rows.push({ family, lang: g.lang, slides: [...g.slides] });
  }
  return rows;
}

/** First slide a family does not export because of its store limit, or null. */
export function firstSkippedSlide(project: Project, family: FamilyId): number | null {
  const max = FAMILIES[family]?.maxSlides ?? Infinity;
  return project.slides.length > max ? max : null;
}

/* Estimates and labels ------------------------------------------------ */

/**
 * Average encoded bytes per pixel. PNG is calibrated on our renders (about
 * 0.35 for gradients with mock screens, more with real screenshots); JPEG
 * grows with the square of the quality above 50 %.
 */
export function bytesPerPixel(format: ExportSettings['format'], quality: number): number {
  if (format === 'png') return 0.45;
  const q = Number.isFinite(quality) ? Math.min(1, Math.max(0.5, quality)) : 0.92;
  const t = (q - 0.5) / 0.5;
  return 0.04 + 0.16 * t * t;
}

/** Rough total size of the files a plan writes. */
export function estimateBytes(jobs: readonly ExportJob[], format: ExportSettings['format'], quality: number): number {
  const bpp = bytesPerPixel(format, quality);
  let total = 0;
  for (const j of jobs) total += j.width * j.height * bpp;
  return Math.round(total);
}

/** "820 KB", "3.4 MB", "92 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  if (value < 1 && unit === 0) return '1 KB';
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** "0.4 s", "8.2 s", "42 s", "1 min 5 s". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000;
  if (s < 10) return `${(Math.round(s * 10) / 10).toFixed(1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const total = Math.round(s);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

/** Time left from the average so far; null until a few files give a stable average. */
export function remainingMs(done: number, total: number, elapsedMs: number): number | null {
  if (done < 2 || done >= total || elapsedMs <= 0) return null;
  return (elapsedMs / done) * (total - done);
}

/** "About 20 s left", "Less than 5 s left". */
export function remainingLabel(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  if (ms < 5000) return 'Almost done';
  if (ms < 60_000) return `About ${Math.max(5, Math.round(ms / 5000) * 5)} s left`;
  const min = Math.round(ms / 60_000);
  return `About ${min} min left`;
}

/** "iPhone 6.9″ · Arabic · slide 3". */
export function jobLabel(job: Pick<ExportJob, 'sizeId' | 'lang' | 'slideIndex'>): string {
  const size = sizeById(job.sizeId);
  return `${size?.label ?? job.sizeId} · ${languageName(job.lang)} · slide ${job.slideIndex + 1}`;
}

/* Text overflow ------------------------------------------------------- */

export interface OverflowEntry {
  slideIndex: number;
  elementId: string;
  /** "Headline", or the element's own name. */
  label: string;
  /** Where to jump to see it. */
  family: FamilyId;
  lang: LangCode;
  langs: LangCode[];
  /** Size labels it overflows in. */
  sizes: string[];
}

export interface OverflowCollector {
  add(job: ExportJob, elementIds: readonly string[]): void;
  list(): OverflowEntry[];
}

/** Gathers the renderer's text-overflow reports per slide and text element, across sizes and languages. */
export function createOverflowCollector(project: Project): OverflowCollector {
  const entries = new Map<string, OverflowEntry>();
  return {
    add(job, elementIds) {
      if (elementIds.length === 0) return;
      const slide = project.slides[job.slideIndex];
      const layout = slide ? resolveLayout(project, slide, job.family) : null;
      const sizeLabel = sizeById(job.sizeId)?.label ?? job.sizeId;
      for (const id of elementIds) {
        const key = `${job.slideIndex}\u0000${id}`;
        let entry = entries.get(key);
        if (!entry) {
          const el = layout?.elements.find((e) => e.id === id);
          const label = el?.name?.trim() || (el?.kind === 'text' ? textKeyLabel(el.key) : 'Text');
          entry = { slideIndex: job.slideIndex, elementId: id, label, family: job.family, lang: job.lang, langs: [], sizes: [] };
          entries.set(key, entry);
        }
        if (!entry.langs.includes(job.lang)) entry.langs.push(job.lang);
        if (!entry.sizes.includes(sizeLabel)) entry.sizes.push(sizeLabel);
      }
    },
    list() {
      return [...entries.values()].sort((a, b) => a.slideIndex - b.slideIndex || a.label.localeCompare(b.label));
    },
  };
}

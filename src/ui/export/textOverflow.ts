/**
 * Texts that will not fit, found before exporting: every text of every slide
 * a plan exports is laid out by the engine at the export canvas size, the
 * way the renderer lays it out, and the ones that still need more lines than
 * allowed at their smallest size are grouped for the export summary.
 * Pure: the caller provides the 2D context used for measuring.
 */
import { layoutText, type Ctx2D } from '../../engine';
import type { ExportJob } from '../../export/types';
import { isRtl } from '../../model/catalog';
import { resolveLayout, resolveText } from '../../model/resolve';
import { languageTypography, styleForLanguage } from '../../model/typography';
import type { FamilyId, LangCode, Project } from '../../model/types';

/** One slide of a family in a language at one canvas size: what the check lays out. */
export interface OverflowCheck {
  family: FamilyId;
  lang: LangCode;
  slideIndex: number;
  /** Shorter side of the canvas in px; text sizes and widths are fractions of it. */
  unit: number;
}

/** Results of finished checks: text element ids that overflow, by checkKey. */
export type OverflowHits = ReadonlyMap<string, readonly string[]>;

export const checkKey = (c: OverflowCheck): string => `${c.family}|${c.lang}|${c.slideIndex}|${c.unit}`;

/** The distinct checks the plan's jobs need, in plan order (sizes with the same shorter side share one). */
export function overflowChecks(jobs: readonly ExportJob[]): OverflowCheck[] {
  const seen = new Set<string>();
  const checks: OverflowCheck[] = [];
  for (const job of jobs) {
    const check: OverflowCheck = { family: job.family, lang: job.lang, slideIndex: job.slideIndex, unit: Math.min(job.width, job.height) };
    const key = checkKey(check);
    if (seen.has(key)) continue;
    seen.add(key);
    checks.push(check);
  }
  return checks;
}

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Ids of the text elements on the check's slide that still need more lines
 * than allowed at their smallest size: what the export render reports in
 * RenderResult.overflowingText. Hidden and fully transparent texts are not
 * drawn, so they never count; texts without a line limit cannot overflow.
 */
export function overflowingTexts(ctx: Ctx2D, project: Project, check: OverflowCheck): string[] {
  const slide = project.slides[check.slideIndex];
  if (!slide) return [];
  const baseLang = project.languages[0] ?? check.lang;
  const rtl = isRtl(check.lang);
  const type = languageTypography(project, check.lang);
  const ids: string[] = [];
  for (const el of resolveLayout(project, slide, check.family).elements) {
    if (el.kind !== 'text' || el.hidden === true || finite(el.opacity, 1) <= 0) continue;
    if (!(Math.floor(finite(el.style.maxLines, 0)) >= 1)) continue;
    const text = resolveText(slide, el.key, check.lang, baseLang);
    if (!text) continue;
    const layout = layoutText(ctx, {
      text,
      style: styleForLanguage(el.style, type),
      boxWidth: Math.max(0, finite(el.width, 0) * check.unit),
      unit: check.unit,
      rtl,
      lang: check.lang,
    });
    if (layout.overflow) ids.push(el.id);
  }
  return ids;
}

/** A slide with text that does not fit, and where its chip jumps to. */
export interface OverflowSlide {
  slideIndex: number;
  /** A language the text overflows in, and the first such text, to select it. */
  lang: LangCode;
  elementId: string;
}

export interface TextOverflowRow {
  /** Devices with exactly these slides, in project order; the chips jump to the first. */
  families: FamilyId[];
  /** null: the same slides in every language each of these devices exports. */
  lang: LangCode | null;
  slides: OverflowSlide[];
}

/** What the export summary shows of the check. */
export interface TextOverflowState {
  rows: readonly TextOverflowRow[];
  /** Texts are still being checked; the rows grow as they finish. */
  pending: boolean;
}

/**
 * Finished checks as summary rows, like the missing screenshots: per family,
 * one row when every language it exports overflows on the same slides, else
 * one row per language. Texts are shared by every device, so families with
 * the same slides in the same language share a row. A slide counts when it
 * overflows at any exported size; checks without a result yet are left out.
 */
export function textOverflowRows(project: Project, checks: readonly OverflowCheck[], hits: OverflowHits): TextOverflowRow[] {
  // family -> language -> slide index -> first overflowing text
  const found = new Map<FamilyId, Map<LangCode, Map<number, string>>>();
  const exported = new Map<FamilyId, Set<LangCode>>();
  for (const check of checks) {
    let langs = exported.get(check.family);
    if (!langs) exported.set(check.family, (langs = new Set()));
    langs.add(check.lang);
    const ids = hits.get(checkKey(check));
    if (!ids || ids.length === 0) continue;
    let byLang = found.get(check.family);
    if (!byLang) found.set(check.family, (byLang = new Map()));
    let bySlide = byLang.get(check.lang);
    if (!bySlide) byLang.set(check.lang, (bySlide = new Map()));
    if (!bySlide.has(check.slideIndex)) bySlide.set(check.slideIndex, ids[0]);
  }

  const rows: TextOverflowRow[] = [];
  const rowByKey = new Map<string, TextOverflowRow>();
  const add = (family: FamilyId, lang: LangCode | null, slides: OverflowSlide[]) => {
    const key = `${lang ?? '*'}|${slides.map((s) => s.slideIndex).join(',')}`;
    const same = rowByKey.get(key);
    if (same) same.families.push(family);
    else {
      const row = { families: [family], lang, slides };
      rowByKey.set(key, row);
      rows.push(row);
    }
  };
  for (const family of project.families) {
    const byLang = found.get(family);
    if (!byLang) continue;
    // Project order, so the base language comes first when it is exported.
    const langs = project.languages.filter((l) => exported.get(family)?.has(l));
    const slidesIn = (lang: LangCode): OverflowSlide[] =>
      [...(byLang.get(lang) ?? [])].sort((a, b) => a[0] - b[0]).map(([slideIndex, elementId]) => ({ slideIndex, lang, elementId }));
    const key = (lang: LangCode) => slidesIn(lang).map((s) => s.slideIndex).join(',');
    const [head] = langs;
    if (head !== undefined && langs.length > 1 && langs.every((l) => key(l) === key(head))) {
      add(family, null, slidesIn(head));
      continue;
    }
    for (const lang of langs) {
      const slides = slidesIn(lang);
      if (slides.length > 0) add(family, lang, slides);
    }
  }
  return rows;
}

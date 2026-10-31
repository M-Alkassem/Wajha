/**
 * Template helpers for the new-project flow: category labels, search and
 * counts, and memoised in-memory projects used only to paint previews
 * (template strips, the large setup preview, the hero illustration).
 */
import { blankProject } from '../../model/defaults';
import { projectFromTemplate, TEMPLATE_CATEGORIES } from '../../model/instantiate';
import { isTemplateId } from '../../model/rules';
import type { FamilyId, GalleryEntry, LangCode, Project, Template, TemplateCategory } from '../../model/types';
import { ensureFonts, setAssetReader } from '../../runtime';
import { readTemplateAsset } from '../../storage';
import { matchesSearch } from './format';

import { t, uiLanguage } from '../../i18n';
export const CATEGORY_ORDER: readonly TemplateCategory[] = TEMPLATE_CATEGORIES;

export const CATEGORY_LABEL: Readonly<Record<TemplateCategory, string>> = {
  minimal: t('Minimal'),
  bold: t('Bold'),
  gradient: t('Gradient'),
  dark: t('Dark'),
  playful: t('Playful'),
  panorama: t('Panorama'),
  elegant: t('Elegant'),
};

export function categoryLabel(c: string): string {
  return (CATEGORY_LABEL as Record<string, string>)[c] ?? c;
}

/** Search over a template's name, author, description, tags and category. */
export function templateMatches(t: Pick<Template, 'name' | 'author' | 'description' | 'tags' | 'category'>, query: string): boolean {
  return matchesSearch(query, t.name, t.author, t.description, (t.tags ?? []).join(' '), categoryLabel(t.category));
}

export function galleryEntryMatches(e: GalleryEntry, query: string): boolean {
  return templateMatches(e, query);
}

/** Templates per category (categories without templates are 0). */
export function countByCategory(templates: readonly Pick<Template, 'category'>[]): Record<TemplateCategory, number> {
  const out = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<TemplateCategory, number>;
  for (const t of templates) if (t.category in out) out[t.category]++;
  return out;
}

/* Preview projects ---------------------------------------------------------- */

const templateProjects = new WeakMap<Template, Map<string, Project>>();
const blankProjects = new Map<string, Project>();
const fontsRequested = new WeakSet<Project>();

/** Starts loading the fonts a preview draws with; previews repaint when they arrive. */
export function requestPreviewFonts(project: Project): void {
  if (fontsRequested.has(project)) return;
  fontsRequested.add(project);
  void Promise.resolve()
    .then(() => ensureFonts(project))
    .catch(() => undefined);
}

/**
 * A throwaway project made from `template` for painting previews in one
 * family and language. Memoised per template object, so every strip and
 * the large preview share one instance (and SlidePreview never repaints
 * because of a new project reference).
 */
export function templatePreviewProject(template: Template, family: FamilyId, lang: LangCode): Project {
  let byKey = templateProjects.get(template);
  if (!byKey) templateProjects.set(template, (byKey = new Map()));
  const key = `${family}\u0000${lang}`;
  let project = byKey.get(key);
  if (!project) {
    project = projectFromTemplate(template, { name: template.name, families: [family], languages: [lang] });
    byKey.set(key, project);
    // The preview project has no files of its own: its images are the template's.
    if (isTemplateId(template.id) && Object.keys(template.assets ?? {}).length) {
      const templateId = template.id;
      setAssetReader(project.id, (assetId) => readTemplateAsset(templateId, assetId));
    }
  }
  return project;
}

/** What a blank project looks like in one family and language. */
export function blankPreviewProject(family: FamilyId, lang: LangCode): Project {
  const key = `${family}\u0000${lang}`;
  let project = blankProjects.get(key);
  if (!project) {
    project = blankProject('Untitled', [family], [lang]);
    blankProjects.set(key, project);
  }
  return project;
}

const HERO_COPY: ReadonlyArray<{ headline: string; subtitle: string }> = [
  { headline: 'Plan your day *beautifully*', subtitle: 'Tasks, calendar and notes in one calm place.' },
  { headline: 'Focus on what *matters*', subtitle: 'Smart lists bring today’s priorities to the top.' },
  { headline: 'See how far you’ve *come*', subtitle: 'Weekly insights that keep you going.' },
];

let heroSample: Project | null = null;

/**
 * Three iPhone slides for the empty-state illustration: the first built-in
 * template when there is one, otherwise a blank project with sample copy.
 */
export function heroPreviewProject(builtins: readonly Template[]): Project {
  const first = builtins[0];
  // An Arabic interface shows the template in Arabic, right to left.
  if (first) return templatePreviewProject(first, 'iphone', uiLanguage() === 'ar' ? 'ar-SA' : 'en-US');
  if (!heroSample) {
    const project = blankProject('Sample', ['iphone'], ['en-US']);
    project.slides.forEach((slide, i) => {
      const copy = HERO_COPY[i % HERO_COPY.length];
      slide.texts['en-US'] = { ...slide.texts['en-US'], headline: copy.headline, subtitle: copy.subtitle };
    });
    heroSample = project;
  }
  return heroSample;
}

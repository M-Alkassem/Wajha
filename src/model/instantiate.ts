/**
 * Template <-> project conversion. Owned by the model/store work package.
 *
 * Templates carry one layout per aspect class, each authored on a reference
 * canvas: tall = the iPhone design canvas, tablet = iPad, wide = Mac. A new
 * project stores only what the editor cannot derive (ARCHITECTURE 6.1): the
 * primary family's layout, plus the template's own layout for any other
 * aspect class it designs. Every other family follows the primary family
 * through resolveLayout until the user edits it.
 */
import { adaptLayout } from './adapt';
import { FAMILIES } from './catalog';
import { deepClone } from './clone';
import { DEFAULT_FAMILY, DEFAULT_LANGUAGE, DEFAULT_PROJECT_NAME, defaultExportSettings, newSlide } from './defaults';
import { newId } from './ids';
import { resolveLayout } from './resolve';
import { LIMITS, cleanName, cleanText, isTemplateId, uniqueFamilies, uniqueLanguages } from './rules';
import type {
  AspectClass,
  AssetInfo,
  Background,
  Fill,
  FamilyId,
  LangCode,
  Project,
  Slide,
  SlideLayout,
  Template,
  TemplateCategory,
  TemplateSlide,
  Theme,
} from './types';

export interface NewProjectOptions {
  name: string;
  families: FamilyId[];
  languages: LangCode[];
}

/** The family whose design canvas a template's class layout is authored on. */
export const REFERENCE_FAMILY: Readonly<Record<AspectClass, FamilyId>> = { tall: 'iphone', tablet: 'ipad', wide: 'mac' };

const ASPECT_CLASSES: readonly AspectClass[] = ['tall', 'tablet', 'wide'];

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ['minimal', 'bold', 'gradient', 'dark', 'playful', 'panorama', 'elegant'];

/** Copy of `layout` with element ids mapped through `ids` (one fresh id per old id, unique within the layout). */
function remapIds(layout: SlideLayout, ids: Map<string, string>): SlideLayout {
  const used = new Set<string>();
  const elements = (Array.isArray(layout.elements) ? layout.elements : []).map((el) => {
    const copy = deepClone(el);
    let id = ids.get(el.id);
    if (!id || used.has(id)) {
      id = newId('e');
      if (!ids.has(el.id)) ids.set(el.id, id);
    }
    used.add(id);
    copy.id = id;
    return copy;
  });
  return { background: layout.background ? deepClone(layout.background) : null, elements };
}

/** The script subtag of a language code ("hans" in "zh-Hans"), lower case, or undefined. */
const scriptOf = (code: LangCode) => code.split('-').find((part, i) => i > 0 && /^[A-Za-z]{4}$/.test(part))?.toLowerCase();

/**
 * The template's own copy for `lang`: the same language, else a regional
 * variant of it ("ar-SA" <- "ar" or "ar-EG"), but never one in another
 * script ("zh-Hant" does not take "zh-Hans"). Undefined when it has none.
 */
export function sameLanguageTexts(texts: Record<LangCode, Record<string, string>>, lang: LangCode): Record<string, string> | undefined {
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(texts, k) ? texts[k] : undefined);
  const exact = own(lang);
  if (exact) return exact;
  const primary = lang.split('-')[0];
  const bare = own(primary);
  if (bare) return bare;
  const script = scriptOf(lang);
  const variant = Object.keys(texts).find((k) => {
    if (k.split('-')[0] !== primary) return false;
    const other = scriptOf(k);
    return !script || !other || script === other;
  });
  return variant ? texts[variant] : undefined;
}

/**
 * Sample copy for `lang`: the template's own copy for it (see
 * sameLanguageTexts), else "en-US", else any English, else anything.
 */
export function pickTexts(texts: Record<LangCode, Record<string, string>>, lang: LangCode): Record<string, string> {
  const same = sameLanguageTexts(texts, lang);
  if (same) return same;
  const keys = Object.keys(texts);
  const en = (Object.prototype.hasOwnProperty.call(texts, DEFAULT_LANGUAGE) ? texts[DEFAULT_LANGUAGE] : undefined) ?? keys.filter((k) => k.split('-')[0] === 'en').map((k) => texts[k])[0];
  if (en) return en;
  return keys.length ? texts[keys[0]] : {};
}

/** Layout for `family` from a template slide whose class layouts already carry the project's element ids. */
function layoutForFamily(classLayouts: Partial<Record<AspectClass, SlideLayout>>, family: FamilyId): SlideLayout {
  const info = FAMILIES[family];
  const ref = REFERENCE_FAMILY[info.aspectClass];
  const own = classLayouts[info.aspectClass];
  if (own) return family === ref ? deepClone(own) : adaptLayout(own, FAMILIES[ref].design, info.design, family);
  const tall = classLayouts.tall;
  if (!tall) return { background: null, elements: [] };
  return adaptLayout(tall, FAMILIES.iphone.design, info.design, family);
}

function slideFromTemplate(ts: TemplateSlide, families: FamilyId[], languages: LangCode[]): Slide {
  // One id map per slide: the same template element gets the same new id in every class layout.
  const ids = new Map<string, string>();
  const classLayouts: Partial<Record<AspectClass, SlideLayout>> = {};
  for (const cls of ASPECT_CLASSES) {
    const l = ts.layouts?.[cls];
    if (l) classLayouts[cls] = remapIds(l, ids);
  }
  if (!classLayouts.tall) {
    // Validated templates always have one; derive it rather than fail on hand-made data.
    const cls = ASPECT_CLASSES.find((k) => classLayouts[k]);
    if (cls) classLayouts.tall = adaptLayout(classLayouts[cls] as SlideLayout, FAMILIES[REFERENCE_FAMILY[cls]].design, FAMILIES.iphone.design, 'iphone');
  }
  // Only what cannot be derived: other families follow the primary one until edited.
  const primary = families[0];
  const primaryClass = FAMILIES[primary].aspectClass;
  const layouts: Slide['layouts'] = {};
  for (const f of families) {
    const cls = FAMILIES[f].aspectClass;
    if (f === primary || (cls !== primaryClass && ts.layouts?.[cls])) layouts[f] = layoutForFamily(classLayouts, f);
  }
  // The base language always shows sample copy. Other languages get the
  // template's translation, or nothing: they fall back to the base text and
  // count as untranslated instead of shipping another language's samples.
  const texts: Slide['texts'] = {};
  const source = ts.texts ?? {};
  languages.forEach((lang, i) => {
    const copy = i === 0 ? pickTexts(source, lang) : sameLanguageTexts(source, lang);
    if (copy) texts[lang] = deepClone(copy);
  });
  return { id: newId('s'), texts, shots: {}, layouts };
}

/** New project from a template: copies theme, slides, sample texts and assets. */
export function projectFromTemplate(template: Template, opts: NewProjectOptions): Project {
  const families = uniqueFamilies(opts?.families);
  if (!families.length) families.push(DEFAULT_FAMILY);
  const languages = uniqueLanguages(opts?.languages);
  if (!languages.length) languages.push(DEFAULT_LANGUAGE);
  const theme = deepClone(template.theme);
  const slides = (Array.isArray(template.slides) ? template.slides : [])
    .slice(0, LIMITS.templateSlides)
    .map((ts) => slideFromTemplate(ts, families, languages));
  if (!slides.length) slides.push(newSlide(families, theme, languages));
  const name = (typeof opts?.name === 'string' ? cleanName(opts.name) : '') || cleanName(template.name ?? '') || DEFAULT_PROJECT_NAME;
  const now = Date.now();
  return {
    format: 'wajha.project',
    version: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    templateId: isTemplateId(template.id) ? template.id : null,
    theme,
    families,
    languages,
    slides,
    assets: deepClone(template.assets ?? {}),
    export: defaultExportSettings(),
  };
}

export interface TemplateMeta {
  id: string;
  name: string;
  author: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
}

/** kebab-case id from `id`, else from `name`, else a fresh "t..." id. */
export function templateIdFrom(id: string, name: string): string {
  if (isTemplateId(id)) return id;
  for (const raw of [id, name]) {
    if (typeof raw !== 'string') continue;
    const slug = raw
      .normalize('NFKD')
      // Accents become separate combining marks under NFKD; drop them so "é" slugs to "e".
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, LIMITS.id)
      .replace(/-+$/g, '');
    if (isTemplateId(slug)) return slug;
  }
  return newId('t');
}

function fillAssets(fill: Fill | null | undefined, into: Set<string>): void {
  if (fill && fill.type === 'image') into.add(fill.assetId);
}

function backgroundAssets(bg: Background | null | undefined, into: Set<string>): void {
  if (bg) fillAssets(bg.fill, into);
}

/** Asset ids a design (theme + layouts) references; screenshots are not design. */
export function designAssets(theme: Theme, layouts: Iterable<SlideLayout>): Set<string> {
  const ids = new Set<string>();
  backgroundAssets(theme.background, ids);
  for (const l of layouts) {
    backgroundAssets(l.background, ids);
    for (const el of l.elements) {
      if (el.kind === 'image') ids.add(el.assetId);
      else if (el.kind === 'shape') fillAssets(el.fill, ids);
    }
  }
  return ids;
}

function templateSlide(project: Project, slide: Slide): TemplateSlide {
  const base = project.languages[0] ?? DEFAULT_LANGUAGE;
  const sample = deepClone(slide.texts[base] ?? {});
  const texts: TemplateSlide['texts'] = { [DEFAULT_LANGUAGE]: sample };
  if (base !== DEFAULT_LANGUAGE) texts[base] = deepClone(sample);

  const byClass: Partial<Record<AspectClass, SlideLayout>> = {};
  for (const f of project.families) {
    const info = FAMILIES[f];
    if (!info || byClass[info.aspectClass]) continue;
    const ref = REFERENCE_FAMILY[info.aspectClass];
    const layout = resolveLayout(project, slide, f);
    // Store it as authored on the reference canvas so instantiation reads it the same way.
    byClass[info.aspectClass] = f === ref ? deepClone(layout) : adaptLayout(layout, info.design, FAMILIES[ref].design, ref);
  }
  if (!byClass.tall) {
    const cls = ASPECT_CLASSES.find((k) => byClass[k]);
    const from = cls ? (byClass[cls] as SlideLayout) : resolveLayout(project, slide, DEFAULT_FAMILY);
    byClass.tall = cls ? adaptLayout(from, FAMILIES[REFERENCE_FAMILY[cls]].design, FAMILIES.iphone.design, 'iphone') : deepClone(from);
  }
  const layouts: TemplateSlide['layouts'] = { tall: byClass.tall };
  if (byClass.tablet) layouts.tablet = byClass.tablet;
  if (byClass.wide) layouts.wide = byClass.wide;
  return { texts, layouts };
}

/** "Save as template": keeps design, drops screenshots, keeps base-language texts as samples. */
export function templateFromProject(project: Project, meta: TemplateMeta): Template {
  const slides = project.slides.slice(0, LIMITS.templateSlides).map((s) => templateSlide(project, s));
  const theme = deepClone(project.theme);
  const used = designAssets(theme, slides.flatMap((s) => [s.layouts.tall, s.layouts.tablet, s.layouts.wide].filter((l): l is SlideLayout => !!l)));
  const assets: Record<string, AssetInfo> = {};
  for (const id of used) {
    const info = project.assets[id];
    if (info) assets[id] = deepClone(info);
  }
  const tags: string[] = [];
  for (const t of Array.isArray(meta?.tags) ? meta.tags : []) {
    const tag = typeof t === 'string' ? cleanName(t, LIMITS.tag).toLowerCase() : '';
    if (tag && !tags.includes(tag) && tags.length < LIMITS.tags) tags.push(tag);
  }
  const name = (typeof meta?.name === 'string' ? cleanName(meta.name) : '') || project.name || DEFAULT_PROJECT_NAME;
  return {
    format: 'wajha.template',
    version: 1,
    id: templateIdFrom(meta?.id, name),
    name,
    author: typeof meta?.author === 'string' ? cleanName(meta.author) : '',
    description: typeof meta?.description === 'string' ? cleanText(meta.description) : '',
    category: TEMPLATE_CATEGORIES.includes(meta?.category) ? meta.category : 'minimal',
    tags,
    theme,
    slides,
    assets,
  };
}

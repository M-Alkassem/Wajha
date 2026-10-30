/**
 * Read-side helpers that apply fallbacks. `resolveLayout` is owned by the
 * model/store work package; the text and screenshot fallbacks are final.
 */
import { adaptLayout } from './adapt';
import { FAMILIES, FAMILY_ORDER } from './catalog';
import { defaultLayout } from './defaults';
import type { FamilyId, LangCode, Project, Slide, SlideLayout, Theme } from './types';

interface CachedLayout {
  layout: SlideLayout;
  /** project.families when computed: the primary family picks the source. */
  families: string;
  /** Theme the default layout was built with; null when the layout does not depend on it. */
  theme: Theme | null;
}

/**
 * Derived layouts per slide object. immer gives an edited slide a new
 * identity and keeps unchanged ones, so entries go stale exactly when they
 * should and are collected with the slides they belong to.
 */
const cache = new WeakMap<Slide, Map<FamilyId, CachedLayout>>();

const EMPTY_LAYOUT: SlideLayout = Object.freeze({ background: null, elements: Object.freeze([]) as unknown as SlideLayout['elements'] });

/** The family whose stored layout `family` derives from: the primary family, else any family with one. */
export function layoutSource(project: Project, slide: Slide, family: FamilyId): FamilyId | null {
  const layouts = slide.layouts ?? {};
  if (layouts[family]) return family;
  const primary = project.families[0];
  if (primary && layouts[primary]) return primary;
  for (const f of project.families) if (layouts[f]) return f;
  for (const f of FAMILY_ORDER) if (layouts[f]) return f;
  return null;
}

/**
 * The layout for `family`: stored layout, else adapted from the primary
 * family's layout, else a default layout. The result is shared and cached:
 * treat it as read-only and copy it before editing. The cache assumes slides
 * are immutable (an edit makes a new slide object, as immer does).
 */
export function resolveLayout(project: Project, slide: Slide, family: FamilyId): SlideLayout {
  const stored = slide.layouts?.[family];
  if (stored) return stored;
  if (!FAMILIES[family]) return EMPTY_LAYOUT;

  const families = project.families.join(',');
  let byFamily = cache.get(slide);
  const hit = byFamily?.get(family);
  if (hit && hit.families === families && (hit.theme === null || hit.theme === project.theme)) return hit.layout;

  const source = layoutSource(project, slide, family);
  let entry: CachedLayout;
  if (source && source !== family) {
    const from = slide.layouts[source] as SlideLayout;
    entry = { layout: adaptLayout(from, FAMILIES[source].design, FAMILIES[family].design, family), families, theme: null };
  } else {
    entry = { layout: defaultLayout(family, project.theme), families, theme: project.theme };
  }
  if (!byFamily) {
    byFamily = new Map();
    cache.set(slide, byFamily);
  }
  byFamily.set(family, entry);
  return entry.layout;
}

/** `record[key]` when it is the record's own entry: keys come from data, and a plain object inherits "toString" and friends. */
function ownEntry<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** Text for key in `lang`, falling back to the base language, then "". */
export function resolveText(slide: Slide, key: string, lang: LangCode, baseLang: LangCode): string {
  const own = ownEntry(ownEntry(slide.texts, lang), key);
  if (own !== undefined && own !== '') return own;
  return ownEntry(ownEntry(slide.texts, baseLang), key) ?? '';
}

/** Asset id for family/slot in `lang`, falling back to the base language, then null. */
export function resolveShot(slide: Slide, family: FamilyId, slot: string, lang: LangCode, baseLang: LangCode): string | null {
  const bySlot = ownEntry(ownEntry(slide.shots, family), slot);
  if (!bySlot) return null;
  return ownEntry(bySlot, lang) ?? ownEntry(bySlot, baseLang) ?? null;
}

/**
 * Pure helpers behind "Save as template": template ids from names, tags
 * from comma-separated input, categories.
 */
import { LIMITS, cleanName, isTemplateId } from '../../../model/rules';
import type { TemplateCategory } from '../../../model/types';

export const CATEGORY_OPTIONS: readonly { value: TemplateCategory; label: string; description: string }[] = [
  { value: 'minimal', label: 'Minimal', description: 'Calm layouts with room to breathe' },
  { value: 'bold', label: 'Bold', description: 'Big type and strong colour' },
  { value: 'gradient', label: 'Gradient', description: 'Colour washes and soft glows' },
  { value: 'dark', label: 'Dark', description: 'Dark backgrounds, bright accents' },
  { value: 'playful', label: 'Playful', description: 'Shapes, tilts and fun' },
  { value: 'panorama', label: 'Panorama', description: 'One scene across every slide' },
  { value: 'elegant', label: 'Elegant', description: 'Refined type and quiet colour' },
];

export const isCategory = (v: unknown): v is TemplateCategory => CATEGORY_OPTIONS.some((c) => c.value === v);

/** kebab-case id from a name ("Sunset Glow!" -> "sunset-glow"); "" when the name has nothing usable (e.g. only Arabic letters). */
export function slugify(name: string): string {
  const slug = String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.id)
    .replace(/-+$/g, '');
  return isTemplateId(slug) ? slug : '';
}

/** `base`, else `base-2`, `base-3`, ... not in `taken` (within the id length limit). */
export function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= taken.size + 2; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, LIMITS.id - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!taken.has(candidate) && isTemplateId(candidate)) return candidate;
  }
  return '';
}

/**
 * The id to save a template under. A name that matches one of the user's
 * templates replaces it (after asking); built-in ids are never reused. ""
 * lets the store pick a fresh id.
 */
export function resolveTemplateId(name: string, builtinIds: ReadonlySet<string>, userIds: ReadonlySet<string>): { id: string; replaces: boolean } {
  const slug = slugify(name);
  if (!slug) return { id: '', replaces: false };
  if (builtinIds.has(slug)) return { id: freeSlug(slug, new Set([...builtinIds, ...userIds])), replaces: false };
  return { id: slug, replaces: userIds.has(slug) };
}

/** One tag as stored: single line, lower case, length-limited. */
export function cleanTag(raw: string): string {
  return cleanName(raw, LIMITS.tag).toLowerCase();
}

/** Adds every comma-, semicolon- or newline-separated tag in `input` to `tags` (no duplicates, at most the template limit). */
export function addTags(tags: readonly string[], input: string): string[] {
  const out = [...tags];
  for (const part of input.split(/[,;\n،]/)) {
    const tag = cleanTag(part);
    if (tag && !out.includes(tag) && out.length < LIMITS.tags) out.push(tag);
  }
  return out;
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}

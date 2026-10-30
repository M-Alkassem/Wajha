/**
 * The device families and languages last used for a new project, kept in
 * localStorage under "wajha.newProject" (AppSettings is a fixed shape).
 * Storage can be missing, full or blocked: every access is guarded, and
 * anything unreadable falls back to the defaults.
 */
import { FAMILY_ORDER, LANGUAGES } from '../../model/catalog';
import type { FamilyId, LangCode } from '../../model/types';

export const NEW_PROJECT_PREFS_KEY = 'wajha.newProject';

export interface NewProjectPrefs {
  /** In FAMILY_ORDER; never empty. */
  families: FamilyId[];
  /** First = base language; never empty. */
  languages: LangCode[];
}

export const DEFAULT_NEW_PROJECT_PREFS: Readonly<NewProjectPrefs> = Object.freeze({
  families: ['iphone', 'android-phone'] as FamilyId[],
  languages: ['en-US'] as LangCode[],
});

const LANGUAGE_CODES: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.code));

/** Catalog families from `list`, deduplicated, in FAMILY_ORDER. */
export function cleanFamilies(list: unknown): FamilyId[] {
  if (!Array.isArray(list)) return [];
  const wanted = new Set(list.filter((f): f is string => typeof f === 'string'));
  return FAMILY_ORDER.filter((f) => wanted.has(f));
}

/** Catalog languages from `list`, deduplicated, in the given order (the first is the base). */
export function cleanLanguages(list: unknown): LangCode[] {
  if (!Array.isArray(list)) return [];
  const out: LangCode[] = [];
  for (const l of list) if (typeof l === 'string' && LANGUAGE_CODES.has(l) && !out.includes(l)) out.push(l);
  return out.slice(0, 100);
}

/** Parses the stored JSON; each part falls back to the default on its own. */
export function parseNewProjectPrefs(raw: string | null | undefined): NewProjectPrefs {
  let json: unknown = null;
  if (typeof raw === 'string' && raw.length < 20_000) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const families = cleanFamilies(o.families);
  const languages = cleanLanguages(o.languages);
  return {
    families: families.length ? families : [...DEFAULT_NEW_PROJECT_PREFS.families],
    languages: languages.length ? languages : [...DEFAULT_NEW_PROJECT_PREFS.languages],
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage itself throws when site data is blocked.
    return null;
  }
}

export function loadNewProjectPrefs(store: StorageLike | null = storage()): NewProjectPrefs {
  let raw: string | null = null;
  try {
    raw = store?.getItem(NEW_PROJECT_PREFS_KEY) ?? null;
  } catch {
    raw = null;
  }
  return parseNewProjectPrefs(raw);
}

export function saveNewProjectPrefs(prefs: NewProjectPrefs, store: StorageLike | null = storage()): void {
  const families = cleanFamilies(prefs.families);
  const languages = cleanLanguages(prefs.languages);
  if (!families.length || !languages.length) return;
  try {
    store?.setItem(NEW_PROJECT_PREFS_KEY, JSON.stringify({ families, languages }));
  } catch {
    // Full or blocked storage: the next dialog just starts from the defaults.
  }
}

/**
 * Display labels and small lookups shared by the editor dialogs. Pure.
 */
import { FAMILIES, isRtl, languageInfo } from '../../../model/catalog';
import type { FamilyId, LangCode, StoreId } from '../../../model/types';

import { t, tn, uiLanguage } from '../../../i18n';
const KNOWN_KEYS: Record<string, string> = {
  headline: 'Headline',
  subtitle: t('Subtitle'),
  caption: t('Caption'),
  title: t('Title'),
  body: 'Body',
  badge: 'Badge',
  cta: t('Call to action'),
};

/**
 * Readable name of a text key: "headline" -> "Headline", "caption2" ->
 * "Caption 2", "price_tag" -> "Price tag", "featureList" -> "Feature list".
 */
export function textKeyLabel(key: string): string {
  const m = /^(.{3,}?)(\d+)$/.exec(key);
  const stem = m ? m[1] : key;
  const num = m ? m[2] : '';
  const known = KNOWN_KEYS[stem.toLowerCase()];
  const words = (known ?? stem.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.\s-]+/g, ' ').trim().toLowerCase()) || key;
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return num ? `${label} ${num}` : label;
}

/** "App Store" / "Google Play". */
export function storeName(store: StoreId): string {
  return store === 'app-store' ? 'App Store' : 'Google Play';
}

/** English name of a language ("Arabic"). */
export function languageName(code: LangCode): string {
  return t(languageInfo(code).name);
}

/** Native name when it adds something ("العربية" for Arabic), else null ("English (US)"). */
export function nativeName(code: LangCode): string | null {
  const info = languageInfo(code);
  return info.native && info.native !== info.name ? info.native : null;
}

/** Text direction for inputs holding text in `code`. */
export function textDir(code: LangCode): 'rtl' | 'ltr' {
  return isRtl(code) ? 'rtl' : 'ltr';
}

/** Stores reached by the given families, in a stable order (App Store first). */
export function storesOf(families: readonly FamilyId[]): StoreId[] {
  const set = new Set<StoreId>();
  for (const f of families) for (const s of FAMILIES[f]?.stores ?? []) set.add(s);
  return (['app-store', 'google-play'] as const).filter((s) => set.has(s));
}

/** The store's locale code for a language, or null when the store has none. */
export function localeFor(code: LangCode, store: StoreId): string | null {
  const info = languageInfo(code);
  return store === 'app-store' ? info.appStore : info.play;
}

/** "1 file" / "40 files", in the interface language (see tn). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return tn(n, `{count} ${one}`, `{count} ${many}`, { count: n.toLocaleString('en-US') });
}

/** "English, Arabic and German". */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  // Arabic joins with its own "و"; English keeps "a, b and c".
  if (uiLanguage() === 'ar') return new Intl.ListFormat('ar', { type: 'conjunction' }).format(items);
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Ranges of sorted 0-based indexes as 1-based labels: [0,1,2,4] -> "1–3, 5". */
export function slideRanges(indexes: readonly number[]): string {
  const sorted = [...new Set(indexes)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    parts.push(end > start + 1 ? `${start + 1}–${end + 1}` : end === start + 1 ? `${start + 1}, ${end + 1}` : `${start + 1}`);
  }
  return parts.join(', ');
}

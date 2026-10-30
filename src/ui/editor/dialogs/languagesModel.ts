/**
 * Pure helpers behind the languages dialog: search over the catalog.
 */
import { LANGUAGES, type LanguageInfo } from '../../../model/catalog';

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();

/**
 * Languages matching `query` by English name, native name or code
 * (case- and accent-insensitive): exact codes first, then names that start
 * with it, then anything containing it. Empty query: every language.
 */
export function searchLanguages(query: string, languages: readonly LanguageInfo[] = LANGUAGES): LanguageInfo[] {
  const q = fold(query.trim());
  if (!q) return [...languages];
  const scored: { info: LanguageInfo; score: number; index: number }[] = [];
  languages.forEach((info, index) => {
    const code = fold(info.code);
    const name = fold(info.name);
    const native = fold(info.native);
    const codes = [code, info.appStore ? fold(info.appStore) : '', info.play ? fold(info.play) : ''];
    let score = -1;
    if (codes.includes(q)) score = 0;
    else if (name.startsWith(q) || native.startsWith(q)) score = 1;
    else if (name.split(/[\s()]+/).some((w) => w.startsWith(q))) score = 2;
    else if (codes.some((c) => c.startsWith(q))) score = 3;
    else if (name.includes(q) || native.includes(q)) score = 4;
    if (score >= 0) scored.push({ info, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.info);
}

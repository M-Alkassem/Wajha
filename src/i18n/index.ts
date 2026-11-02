/**
 * The interface language: English or Arabic. English text is the message
 * key: `t('Export')` returns the Arabic for "Export" when the interface is
 * in Arabic, else the text itself. `{name}` placeholders are filled from
 * `vars`. A catalog entry may give Arabic plural forms (zero, one, two, few,
 * many, other); they are chosen by the `count` variable, or the first
 * number among the variables.
 *
 * The language is read once, before any interface module runs (some build
 * labels at import time), from this device's saved choice or else the
 * system language. Changing it saves the choice and reloads the window.
 * The document gets lang and dir, so the whole interface mirrors in Arabic;
 * slide designs are drawn on canvases and do not follow it (they mirror
 * by slide language, see model/mirror.ts).
 */
import { AR } from './ar';

export type UiLanguage = 'en' | 'ar';

/** Arabic plural forms, as Intl.PluralRules names them. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type Message = string | PluralForms;

const STORAGE_KEY = 'wajha.uiLanguage';

function systemLanguage(): UiLanguage {
  const langs = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  return langs.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('ar')) ? 'ar' : 'en';
}

/** The saved choice, or null to follow the system. */
export function savedUiLanguage(): UiLanguage | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === 'en' || v === 'ar' ? v : null;
  } catch {
    return null;
  }
}

let current: UiLanguage = savedUiLanguage() ?? systemLanguage();

/** The interface language in use. */
export function uiLanguage(): UiLanguage {
  return current;
}

/**
 * The locale for dates and relative times. Arabic keeps the digits 0-9 the
 * rest of the interface (sizes, percentages, slide numbers) uses.
 */
export function uiLocale(): string {
  return current === 'ar' ? 'ar-u-nu-latn' : 'en';
}

/** True when the interface reads right to left. */
export const isRtlUi = () => current === 'ar';

function applyToDocument(lang: UiLanguage): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
applyToDocument(current);

/**
 * Saves the choice (null = follow the system) and reloads, so every label,
 * including those built at import time, comes up in the new language.
 */
export function setUiLanguage(lang: UiLanguage | null): void {
  try {
    if (lang) globalThis.localStorage?.setItem(STORAGE_KEY, lang);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the choice lasts until the window closes.
  }
  const next = lang ?? systemLanguage();
  if (next === current) return;
  if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
}

/** For tests: switch the language without saving or reloading. */
export function setUiLanguageForTests(lang: UiLanguage): void {
  current = lang;
  applyToDocument(lang);
}

const pluralRules = new Map<string, Intl.PluralRules>();

function pickForm(forms: PluralForms, vars: Record<string, unknown> | undefined, lang: UiLanguage): string {
  const count = typeof vars?.count === 'number' ? vars.count : Object.values(vars ?? {}).find((v): v is number => typeof v === 'number');
  if (count === undefined) return forms.other;
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  return forms[rules.select(count)] ?? forms.other;
}

function fill(text: string, vars: Record<string, unknown> | undefined): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** The message in the interface language, placeholders filled. */
export function t(text: string, vars?: Record<string, unknown>): string {
  if (current === 'ar') {
    const entry = AR[text];
    if (entry !== undefined) return fill(typeof entry === 'string' ? entry : pickForm(entry, vars, 'ar'), vars);
  }
  return fill(text, vars);
}

/**
 * A count with its noun, e.g. tn(3, '{count} screenshot', '{count} screenshots').
 * English picks one of the two; Arabic finds both under the plural text in
 * the catalog and picks its own form. `vars.count` may give the number as
 * shown ("1,200"); the form is still chosen by `count`.
 */
export function tn(count: number, one: string, other: string, vars?: Record<string, unknown>): string {
  const all = { count, ...vars };
  if (current === 'ar') {
    const entry = AR[other];
    if (entry !== undefined) return fill(typeof entry === 'string' ? entry : pickForm(entry, { count }, 'ar'), all);
  }
  return fill(count === 1 ? one : other, all);
}

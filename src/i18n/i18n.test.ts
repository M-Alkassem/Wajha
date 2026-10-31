import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'rolldown/experimental';
import { LANGUAGES, FAMILIES } from '../model/catalog';
import { AR } from './ar';
import { setUiLanguageForTests, t, tn } from './index';

const SRC = new URL('..', import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.|\.node\.ts$/.test(name) ? [path] : [];
  });
}

/** Every message the interface asks for: t('…'), tx('…'), tn(n, '…', '…') and plural(n, 'noun'[, 'nouns']). */
async function messages(): Promise<Map<string, boolean>> {
  const found = new Map<string, boolean>();
  const str = (n: { type?: string; value?: unknown } | undefined) => (n?.type === 'Literal' && typeof n.value === 'string' ? n.value : null);
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!/\b(t|tx|tn|plural)\(/.test(src)) continue;
    const { program } = await parse(file, src, { lang: file.endsWith('x') ? 'tsx' : 'ts' });
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      const node = n as { type?: string; callee?: { type?: string; name?: string }; arguments?: Array<{ type?: string; value?: unknown }> };
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const a = node.arguments ?? [];
        const name = node.callee.name;
        if ((name === 't' || name === 'tx') && str(a[0]) !== null) found.set(str(a[0])!, found.get(str(a[0])!) ?? false);
        if (name === 'tn' && str(a[2]) !== null) {
          found.set(str(a[2])!, true);
          if (str(a[1]) !== null) found.set(str(a[1])!, found.get(str(a[1])!) ?? false);
        }
        if (name === 'plural' && str(a[1]) !== null) found.set(`{count} ${str(a[2]) ?? `${str(a[1])}s`}`, true);
      }
      for (const v of Object.values(n)) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(program);
  }
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setUiLanguageForTests('en'));

describe('Arabic catalog', () => {
  it('translates every message of the interface, and the names it shows', async () => {
    const used = await messages();
    const names = [...LANGUAGES.map((l) => l.name), ...Object.values(FAMILIES).flatMap((f) => [f.label, f.shortLabel])];
    const missing = [...used.keys(), ...names].filter((k) => AR[k] === undefined);
    expect(missing).toEqual([]);
  });

  it('keeps every placeholder of the English, and invents none', () => {
    for (const [key, entry] of Object.entries(AR)) {
      const want = placeholders(key);
      if (typeof entry === 'string') {
        expect(placeholders(entry), `${key} -> ${entry}`).toEqual(want);
        continue;
      }
      // Plural forms may spell a small count out ("ملفان"); the general form shows everything.
      for (const form of Object.values(entry)) expect(placeholders(form).every((p) => want.includes(p)), `${key} -> ${form}`).toBe(true);
      expect(placeholders(entry.other), `${key} -> ${entry.other}`).toEqual(want);
    }
  });
});

describe('t and tn', () => {
  it('return the English text in an English interface, placeholders filled', () => {
    expect(t('Export')).toBe('Export');
    expect(t('Open {name}', { name: 'Sleepwell' })).toBe('Open Sleepwell');
    expect(tn(1, '{count} file', '{count} files')).toBe('1 file');
    expect(tn(3, '{count} file', '{count} files')).toBe('3 files');
  });

  it('pick the Arabic plural form by count', () => {
    setUiLanguageForTests('ar');
    expect(t('Export')).toBe('تصدير');
    expect(tn(1, '{count} file', '{count} files')).toBe('ملف واحد');
    expect(tn(2, '{count} file', '{count} files')).toBe('ملفان');
    expect(tn(5, '{count} file', '{count} files')).toBe('5 ملفات');
    expect(tn(11, '{count} file', '{count} files')).toBe('11 ملفًا');
    expect(t('Open {name}', { name: 'Sleepwell' })).toBe('فتح Sleepwell');
    // Text with no entry stays as it is.
    expect(t('Sleepwell')).toBe('Sleepwell');
  });

  it('marks the document right to left in Arabic', () => {
    const root = { lang: '', dir: '' };
    (globalThis as { document?: unknown }).document = { documentElement: root };
    setUiLanguageForTests('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    setUiLanguageForTests('en');
    expect(document.documentElement.dir).toBe('ltr');
    delete (globalThis as { document?: unknown }).document;
  });
});

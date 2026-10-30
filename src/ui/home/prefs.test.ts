import { describe, expect, it } from 'vitest';
import {
  cleanFamilies,
  cleanLanguages,
  DEFAULT_NEW_PROJECT_PREFS,
  loadNewProjectPrefs,
  NEW_PROJECT_PREFS_KEY,
  parseNewProjectPrefs,
  saveNewProjectPrefs,
} from './prefs';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

describe('new project prefs', () => {
  it('defaults to iPhone + Android phone in English', () => {
    expect(parseNewProjectPrefs(null)).toEqual({ families: ['iphone', 'android-phone'], languages: ['en-US'] });
    expect(parseNewProjectPrefs('not json')).toEqual(DEFAULT_NEW_PROJECT_PREFS);
    expect(parseNewProjectPrefs('[]')).toEqual(DEFAULT_NEW_PROJECT_PREFS);
  });

  it('keeps catalog values only, families in catalog order, languages in the saved order', () => {
    const raw = JSON.stringify({ families: ['mac', 'nope', 'iphone', 'mac', 3], languages: ['ar-SA', 'xx-XX', 'en-US', 'ar-SA'] });
    expect(parseNewProjectPrefs(raw)).toEqual({ families: ['iphone', 'mac'], languages: ['ar-SA', 'en-US'] });
  });

  it('falls back per part', () => {
    expect(parseNewProjectPrefs(JSON.stringify({ families: [], languages: ['de-DE'] }))).toEqual({ families: ['iphone', 'android-phone'], languages: ['de-DE'] });
    expect(parseNewProjectPrefs(JSON.stringify({ families: ['ipad'], languages: 'en-US' }))).toEqual({ families: ['ipad'], languages: ['en-US'] });
  });

  it('round-trips through storage', () => {
    const store = memoryStorage();
    saveNewProjectPrefs({ families: ['ipad', 'iphone'], languages: ['fr-FR', 'en-US'] }, store);
    expect(JSON.parse(store.map.get(NEW_PROJECT_PREFS_KEY) as string)).toEqual({ families: ['iphone', 'ipad'], languages: ['fr-FR', 'en-US'] });
    expect(loadNewProjectPrefs(store)).toEqual({ families: ['iphone', 'ipad'], languages: ['fr-FR', 'en-US'] });
  });

  it('never saves an empty choice and survives blocked storage', () => {
    const store = memoryStorage();
    saveNewProjectPrefs({ families: [], languages: ['en-US'] }, store);
    expect(store.map.size).toBe(0);
    expect(() => saveNewProjectPrefs({ families: ['iphone'], languages: ['en-US'] }, throwing)).not.toThrow();
    expect(loadNewProjectPrefs(throwing)).toEqual(DEFAULT_NEW_PROJECT_PREFS);
    expect(loadNewProjectPrefs(null)).toEqual(DEFAULT_NEW_PROJECT_PREFS);
  });

  it('cleans lists defensively', () => {
    expect(cleanFamilies('iphone')).toEqual([]);
    expect(cleanLanguages({})).toEqual([]);
    expect(cleanLanguages(['en-US', 'en-US'])).toEqual(['en-US']);
  });
});

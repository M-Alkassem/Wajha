/** Installed font families, listed lazily the first time a font picker opens. */
import { getPlatform } from '../../../platform';

let systemFontsPromise: Promise<string[]> | null = null;

/** Installed font families, asked for once per session ([] on the web build). */
export function loadSystemFonts(): Promise<string[]> {
  systemFontsPromise ??= getPlatform()
    .systemFonts()
    .then((list) => (Array.isArray(list) ? list.filter((f) => typeof f === 'string' && f.trim() !== '') : []))
    .catch(() => {
      // A failure is not cached: the next open asks again.
      systemFontsPromise = null;
      return [];
    });
  return systemFontsPromise;
}

/** App settings in settings.json. Reading never fails: the app must always start. */
import type { AppSettings } from '../model/types';
import { getPlatform } from '../platform';
import { SETTINGS_FILE, isRecord, serial } from './shared';

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({ theme: 'system', hints: true });

/** Defaults overlaid with every valid known value of `json`; unknown keys are dropped. */
export function normalizeSettings(json: unknown): AppSettings {
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  if (!isRecord(json)) return out;
  if (json.theme === 'system' || json.theme === 'dark' || json.theme === 'light') out.theme = json.theme;
  if (typeof json.hints === 'boolean') out.hints = json.hints;
  return out;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const text = await getPlatform().readText(SETTINGS_FILE);
    return normalizeSettings(text === null ? null : JSON.parse(text));
  } catch {
    // Damaged file or unreadable storage: start with defaults rather than not at all.
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  const p = getPlatform();
  // Queued, so quick toggles land on disk in the order they were made.
  await serial('settings', () => p.write(SETTINGS_FILE, JSON.stringify(normalizeSettings(s))));
}

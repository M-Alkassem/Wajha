import { beforeEach, describe, expect, it } from 'vitest';
import type { AppSettings } from '../model/types';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../platform';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './index';
import { normalizeSettings } from './settings';

let mem: MemoryPlatform;
beforeEach(() => {
  mem = createMemoryPlatform();
  setPlatform(mem);
});

describe('settings', () => {
  it('defaults to the system theme with hints on', async () => {
    expect(await loadSettings()).toEqual({ theme: 'system', hints: true });
    expect(DEFAULT_SETTINGS).toEqual({ theme: 'system', hints: true });
  });

  it('round-trips saved settings', async () => {
    await saveSettings({ theme: 'dark', hints: false });
    expect(await loadSettings()).toEqual({ theme: 'dark', hints: false });
    expect(JSON.parse((await mem.readText('settings.json'))!)).toEqual({ theme: 'dark', hints: false });
  });

  it('merges valid stored values over the defaults and drops the rest', async () => {
    await mem.write('settings.json', JSON.stringify({ theme: 'light', hints: 'yes', extra: 1 }));
    expect(await loadSettings()).toEqual({ theme: 'light', hints: true });
    await mem.write('settings.json', JSON.stringify({ theme: 'neon', hints: false }));
    expect(await loadSettings()).toEqual({ theme: 'system', hints: false });
  });

  it('falls back to defaults for damaged files', async () => {
    for (const text of ['{nope', '[]', 'null', '"dark"', '']) {
      await mem.write('settings.json', text);
      expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('falls back to defaults when storage cannot be read', async () => {
    setPlatform({
      ...mem,
      readText: async () => {
        throw new Error('locked');
      },
    });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('never returns the shared defaults object', async () => {
    const a = await loadSettings();
    a.hints = false;
    expect((await loadSettings()).hints).toBe(true);
  });

  it('normalizes what it saves', async () => {
    await saveSettings({ theme: 'sepia', hints: true, junk: 1 } as unknown as AppSettings);
    expect(JSON.parse((await mem.readText('settings.json'))!)).toEqual({ theme: 'system', hints: true });
  });

  it('applies quick consecutive saves in order', async () => {
    await Promise.all([
      saveSettings({ theme: 'dark', hints: true }),
      saveSettings({ theme: 'light', hints: true }),
      saveSettings({ theme: 'dark', hints: false }),
    ]);
    expect(await loadSettings()).toEqual({ theme: 'dark', hints: false });
  });

  it('normalizeSettings handles non-objects', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1])).toEqual(DEFAULT_SETTINGS);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../model/types';

const storage = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<AppSettings>>(),
  saveSettings: vi.fn<(s: AppSettings) => Promise<void>>(),
}));
vi.mock('../storage', () => storage);

import { MAX_TOASTS, createAppStore, type AppStore } from './app';

let app: AppStore;
const s = () => app.getState();

/** A fake prefers-color-scheme query whose answer the test can flip. */
function fakeMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal('window', { matchMedia: () => mq });
  vi.stubGlobal('document', { documentElement: root });
  return {
    root,
    listeners,
    flip(next: boolean) {
      mq.matches = next;
      for (const l of [...listeners]) l();
    },
  };
}

beforeEach(() => {
  storage.loadSettings.mockReset().mockResolvedValue({ theme: 'system', hints: true });
  storage.saveSettings.mockReset().mockResolvedValue(undefined);
  app = createAppStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('routing', () => {
  it('starts at home and navigates to the editor', () => {
    expect(s().route).toEqual({ name: 'home' });
    s().navigate({ name: 'editor', projectId: 'p1' });
    expect(s().route).toEqual({ name: 'editor', projectId: 'p1' });
    s().navigate({ name: 'editor', projectId: '' });
    expect(s().route).toEqual({ name: 'editor', projectId: 'p1' });
    s().navigate({ name: 'home' });
    expect(s().route).toEqual({ name: 'home' });
  });
});

describe('settings and theme', () => {
  it('runs without a DOM (Node)', async () => {
    const settings = await s().loadSettings();
    expect(settings).toEqual({ theme: 'system', hints: true });
    expect(s().settingsLoaded).toBe(true);
    expect(s().resolvedTheme).toBe('dark');
  });

  it('applies an explicit theme to <html data-theme>', async () => {
    const env = fakeMedia(true);
    storage.loadSettings.mockResolvedValue({ theme: 'light', hints: false });
    await s().loadSettings();
    expect(env.root.dataset.theme).toBe('light');
    expect(s().resolvedTheme).toBe('light');
    expect(s().settings).toEqual({ theme: 'light', hints: false });
    // An explicit theme ignores the system preference.
    env.flip(false);
    expect(env.root.dataset.theme).toBe('light');
  });

  it('follows the system theme live while set to system, and stops after', async () => {
    const env = fakeMedia(true);
    await s().loadSettings();
    expect(env.root.dataset.theme).toBe('dark');
    env.flip(false);
    expect(env.root.dataset.theme).toBe('light');
    expect(s().resolvedTheme).toBe('light');
    await s().updateSettings({ theme: 'dark' });
    expect(env.listeners.size).toBe(0);
    expect(env.root.dataset.theme).toBe('dark');
    expect(storage.saveSettings).toHaveBeenCalledWith({ theme: 'dark', hints: true });
  });

  it('falls back to defaults when settings cannot be read, and sanitizes junk', async () => {
    storage.loadSettings.mockRejectedValue(new Error('disk on fire'));
    expect(await s().loadSettings()).toEqual({ theme: 'system', hints: true });
    expect(s().settingsLoaded).toBe(true);
    storage.loadSettings.mockResolvedValue({ theme: 'neon', hints: 'yes' } as never);
    expect(await createAppStore().getState().loadSettings()).toEqual({ theme: 'system', hints: true });
  });

  it('saves changes, skips no-ops and reports failed saves', async () => {
    await s().updateSettings({ hints: true });
    expect(storage.saveSettings).not.toHaveBeenCalled();
    storage.saveSettings.mockRejectedValue(new Error('read-only'));
    await s().updateSettings({ hints: false });
    expect(s().settings.hints).toBe(false);
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]).toMatchObject({ kind: 'error', description: 'read-only' });
  });
});

describe('toasts', () => {
  it('pushes toasts and leaves their timers to the Toaster, which pauses them on hover', () => {
    vi.useFakeTimers();
    const info = s().pushToast({ kind: 'success', title: 'Saved' });
    const err = s().pushToast({ kind: 'error', title: 'Failed', description: 'Disk full' });
    expect(s().toasts.map((t) => t.id)).toEqual([info, err]);
    // A store timer would dismiss a toast the pointer rests on.
    vi.advanceTimersByTime(60_000);
    expect(s().toasts.map((t) => t.id)).toEqual([info, err]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes durations through (0 and Infinity keep a toast) and dismisses by id', () => {
    const sticky = s().pushToast({ kind: 'info', title: 'Exporting', duration: 0 });
    const quick = s().pushToast({ kind: 'info', title: 'Quick', duration: 100 });
    const forever = s().pushToast({ kind: 'info', title: 'Forever', duration: Infinity });
    const plain = s().pushToast({ kind: 'warning', title: 'Skipped notes.txt' });
    const byId = new Map(s().toasts.map((t) => [t.id, t]));
    expect(byId.get(sticky)?.duration).toBe(0);
    expect(byId.get(quick)?.duration).toBe(100);
    expect(byId.get(forever)?.duration).toBe(Infinity);
    // No duration: the Toaster's per-kind default applies.
    expect(byId.get(plain)).not.toHaveProperty('duration');
    s().dismissToast(quick);
    expect(s().toasts.map((t) => t.id)).toEqual([sticky, forever, plain]);
    s().dismissToast('unknown');
    expect(s().toasts).toHaveLength(3);
  });

  it('runs actions and dismisses', () => {
    const run = vi.fn();
    const id = s().pushToast({ kind: 'info', title: 'Slide deleted', action: { label: 'Undo', run } });
    expect(s().toasts[0].action?.label).toBe('Undo');
    s().runToastAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(s().toasts).toHaveLength(0);
    s().runToastAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    s().pushToast({ kind: 'info', title: 'x', action: { label: '   ', run } });
    expect(s().toasts[0].action).toBeUndefined();
  });

  it('keeps at most five toasts, dropping the oldest', () => {
    const ids = Array.from({ length: 8 }, (_, i) => s().pushToast({ kind: 'info', title: `T${i}` }));
    expect(s().toasts.map((t) => t.id)).toEqual(ids.slice(-MAX_TOASTS));
    s().clearToasts();
    expect(s().toasts).toHaveLength(0);
  });

  it('cleans untrusted text and unknown kinds', () => {
    s().pushToast({ kind: 'nope' as never, title: 'A\nB'.repeat(200) });
    expect(s().toasts[0].kind).toBe('info');
    expect(s().toasts[0].title.length).toBeLessThanOrEqual(200);
    expect(s().toasts[0].title).not.toContain('\n');
  });
});

describe('confirm dialog', () => {
  it('resolves with the answer and queues further requests', async () => {
    const first = s().confirm({ title: 'Delete slide?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    const second = s().confirm({ title: 'Remove Arabic?', message: 'Texts will be removed.' });
    expect(s().confirmRequest).toMatchObject({ title: 'Delete slide?', confirmLabel: 'Delete', danger: true });
    s().resolveConfirm(true);
    expect(await first).toBe(true);
    expect(s().confirmRequest).toMatchObject({ title: 'Remove Arabic?' });
    expect(s().confirmRequest?.danger).toBeUndefined();
    s().resolveConfirm(false);
    expect(await second).toBe(false);
    expect(s().confirmRequest).toBeNull();
    // Answering with nothing pending is harmless.
    s().resolveConfirm(true);
  });

  it('treats anything but true as cancel', async () => {
    const p = s().confirm({ title: 'Sure?', message: '' });
    s().resolveConfirm('yes' as never);
    expect(await p).toBe(false);
  });
});

describe('settings races', () => {
  it('keeps a change made while settings were still loading', async () => {
    let finish: (s: AppSettings) => void = () => undefined;
    storage.loadSettings.mockImplementationOnce(() => new Promise<AppSettings>((r) => (finish = r)));
    const loading = s().loadSettings();
    await s().updateSettings({ theme: 'light' });
    finish({ theme: 'dark', hints: false });
    expect(await loading).toEqual({ theme: 'light', hints: true });
    expect(s().settings.theme).toBe('light');
    expect(s().settingsLoaded).toBe(true);
  });
});

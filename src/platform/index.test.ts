import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('getPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the memory platform outside browsers and keeps one instance', async () => {
    const { getPlatform } = await import('./index');
    const p = getPlatform();
    expect(p.kind).toBe('memory');
    expect(getPlatform()).toBe(p);
  });

  it('uses Tauri inside the desktop shell', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const { getPlatform } = await import('./index');
    expect(getPlatform().kind).toBe('desktop');
  });

  it('uses the web platform in a plain browser', async () => {
    vi.stubGlobal('window', {});
    const { getPlatform } = await import('./index');
    expect(getPlatform().kind).toBe('web');
  });

  it('uses the web platform in a Web Worker (IndexedDB without window)', async () => {
    vi.stubGlobal('indexedDB', {});
    const { getPlatform } = await import('./index');
    expect(getPlatform().kind).toBe('web');
  });

  it('setPlatform installs a specific implementation', async () => {
    const { getPlatform, setPlatform, createMemoryPlatform } = await import('./index');
    const mine = createMemoryPlatform();
    setPlatform(mine);
    expect(getPlatform()).toBe(mine);
    const other = createMemoryPlatform();
    setPlatform(other);
    expect(getPlatform()).toBe(other);
  });

  it('re-exports the contract and helpers', async () => {
    const mod = await import('./index');
    expect(typeof mod.PlatformError).toBe('function');
    expect(mod.sniffImageExt(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('jpg');
    expect(mod.isAssetId(`${'0'.repeat(64)}.png`)).toBe(true);
    expect(await mod.sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

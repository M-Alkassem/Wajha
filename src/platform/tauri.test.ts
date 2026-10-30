import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { createTauriPlatform, headerValue, lastSegment, toBytes, toPlatformError } from './tauri';
import { PlatformError, type Platform, type PlatformErrorCode } from './types';

type Handler = (cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>;
const invokeMock = invoke as unknown as Mock<Handler>;

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5]);
const HEX = 'b'.repeat(64);

const buffer = (bytes: number[]) => Uint8Array.from(bytes).buffer;

/** Routes invoke calls by command name. */
function respond(table: Record<string, (args?: InvokeArgs, options?: InvokeOptions) => unknown>) {
  invokeMock.mockImplementation(async (cmd, args, options) => {
    const handler = table[cmd];
    if (!handler) throw `io: unexpected command ${cmd}`;
    return handler(args, options);
  });
}

function headersOf(call: unknown[]): Record<string, string> {
  const options = call[2] as InvokeOptions | undefined;
  return (options?.headers ?? {}) as Record<string, string>;
}

async function codeOf(p: Promise<unknown>): Promise<PlatformErrorCode | string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof PlatformError ? e.code : `other: ${String(e)}`;
  }
}

describe('toPlatformError', () => {
  it('maps "code: message" strings from Rust', () => {
    const e = toPlatformError('not_found: projects/x/project.json');
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.code).toBe('not_found');
    expect(e.message).toBe('projects/x/project.json');
    for (const code of ['invalid_path', 'invalid_data', 'permission', 'cancelled', 'io'] as const) {
      expect(toPlatformError(`${code}: details`).code).toBe(code);
    }
    expect(toPlatformError('permission:no space').message).toBe('no space');
    expect(toPlatformError('cancelled:').message).toBe('cancelled');
    expect(toPlatformError('io: line one\nline two').message).toBe('line one\nline two');
  });

  it('turns unknown codes and odd values into io', () => {
    expect(toPlatformError('weird: thing')).toMatchObject({ code: 'io', message: 'weird: thing' });
    expect(toPlatformError('no code at all')).toMatchObject({ code: 'io', message: 'no code at all' });
    expect(toPlatformError(new Error('invalid_data: bad'))).toMatchObject({ code: 'invalid_data', message: 'bad' });
    expect(toPlatformError({ message: 'permission: nope' })).toMatchObject({ code: 'permission' });
    expect(toPlatformError({ error: 1 }).code).toBe('io');
    expect(toPlatformError(undefined).code).toBe('io');
    expect(toPlatformError(42).message).toBe('42');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(toPlatformError(circular).code).toBe('io');
  });

  it('accepts structured { code, message } errors', () => {
    expect(toPlatformError({ code: 'permission', message: 'Access denied' })).toMatchObject({ code: 'permission', message: 'Access denied' });
    expect(toPlatformError({ code: 'not_found' })).toMatchObject({ code: 'not_found', message: 'not_found' });
    expect(toPlatformError({ code: 'bogus', message: 'x' }).code).toBe('io');
  });

  it('keeps PlatformErrors as they are', () => {
    const original = new PlatformError('cancelled', 'x');
    expect(toPlatformError(original)).toBe(original);
  });
});

describe('helpers', () => {
  it('toBytes accepts ArrayBuffers, views and number arrays', () => {
    expect([...toBytes(buffer([1, 2, 3]))]).toEqual([1, 2, 3]);
    const view = Uint8Array.from([9, 8, 7, 6]).subarray(1, 3);
    expect([...toBytes(view)]).toEqual([8, 7]);
    expect([...toBytes([4, 5, 300])]).toEqual([4, 5, 44]);
    expect(() => toBytes('nope')).toThrow(PlatformError);
    expect(() => toBytes(null)).toThrow(PlatformError);
  });

  it('headerValue encodes unpaired surrogates as U+FFFD instead of throwing', () => {
    const replacement = encodeURIComponent('\ufffd');
    expect(headerValue('a\ud800b')).toBe(`a${replacement}b`);
    expect(headerValue('a\udc00')).toBe(`a${replacement}`);
    expect(headerValue('\udc00\ud800')).toBe(replacement.repeat(2));
    expect(decodeURIComponent(headerValue('ok 😀 واجهة'))).toBe('ok 😀 واجهة');
  });

  it('headerValue is ASCII and decodes back', () => {
    const path = 'App Store/ar-SA/صور العرض/01 #1%.png';
    const encoded = headerValue(path);
    expect(/^[\x21-\x7e]*$/.test(encoded)).toBe(true);
    expect(decodeURIComponent(encoded)).toBe(path);
  });

  it('lastSegment names a folder on every OS', () => {
    expect(lastSegment('/Users/me/Desktop/Exports')).toBe('Exports');
    expect(lastSegment('/Users/me/Exports/')).toBe('Exports');
    expect(lastSegment('C:\\Users\\me\\Store shots')).toBe('Store shots');
    expect(lastSegment('/')).toBe('/');
  });
});

describe('tauri platform', () => {
  let platform: Platform;
  beforeEach(() => {
    invokeMock.mockReset();
    platform = createTauriPlatform();
  });

  it('reports kind desktop', () => {
    expect(platform.kind).toBe('desktop');
  });

  describe('library storage', () => {
    it('reads raw bytes and text', async () => {
      respond({ store_read: () => buffer([0x68, 0x69]) });
      expect([...((await platform.read('settings.json')) ?? [])]).toEqual([0x68, 0x69]);
      expect(await platform.readText('settings.json')).toBe('hi');
      expect(invokeMock).toHaveBeenCalledWith('store_read', { path: 'settings.json' }, undefined);
    });

    it('maps not_found to null and other errors to PlatformError', async () => {
      respond({
        store_read: (args) => {
          throw (args as { path: string }).path === 'missing.json' ? 'not_found: missing.json' : 'permission: denied';
        },
      });
      expect(await platform.read('missing.json')).toBeNull();
      expect(await platform.readText('missing.json')).toBeNull();
      expect(await codeOf(platform.read('locked.json'))).toBe('permission');
    });

    it('writes strings as UTF-8 raw bodies with a URI-encoded x-path header', async () => {
      respond({ store_write: () => null });
      await platform.write('projects/p1/project.json', '{"name":"واجهة"}');
      const call = invokeMock.mock.calls[0];
      expect(call[0]).toBe('store_write');
      expect(call[1]).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(call[1] as Uint8Array)).toBe('{"name":"واجهة"}');
      expect(headersOf(call)).toEqual({ 'x-path': 'projects%2Fp1%2Fproject.json' });
    });

    it('sends exactly the bytes of a subarray', async () => {
      respond({ store_write: () => null });
      const backing = Uint8Array.from([0, 1, 2, 3, 4, 5]);
      await platform.write('cache/x.bin', backing.subarray(2, 4));
      const body = invokeMock.mock.calls[0][1] as Uint8Array;
      expect([...body]).toEqual([2, 3]);
      expect(body.buffer.byteLength).toBe(2);
    });

    it('encodes non-ASCII paths so the header stays valid', async () => {
      respond({ store_write: () => null });
      await platform.write('cache/صورة 1.json', 'x');
      const header = headersOf(invokeMock.mock.calls[0])['x-path'];
      expect(/^[\x21-\x7e]+$/.test(header)).toBe(true);
      expect(decodeURIComponent(header)).toBe('cache/صورة 1.json');
    });

    it('validates paths before calling Rust', async () => {
      respond({});
      for (const bad of ['../x', '/abs', 'a\\b', 'a//b', '', 'x\ud800']) {
        expect(await codeOf(platform.read(bad))).toBe('invalid_path');
        expect(await codeOf(platform.write(bad, 'x'))).toBe('invalid_path');
        expect(await codeOf(platform.list(bad))).toBe('invalid_path');
        expect(await codeOf(platform.remove(bad))).toBe('invalid_path');
      }
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('lists entries and drops malformed ones', async () => {
      respond({
        store_list: () => [
          { name: 'a', isDir: true, size: 96, modifiedMs: 5 },
          { name: 'b.json', isDir: false, size: 10, modifiedMs: 7 },
          { name: 3 },
          null,
          { name: 'c', isDir: 'yes', size: 'big' },
        ],
      });
      expect(await platform.list('projects')).toEqual([
        { name: 'a', isDir: true, size: 96, modifiedMs: 5 },
        { name: 'b.json', isDir: false, size: 10, modifiedMs: 7 },
        { name: 'c', isDir: false, size: 0, modifiedMs: 0 },
      ]);
      expect(invokeMock).toHaveBeenCalledWith('store_list', { dir: 'projects' }, undefined);
    });

    it('treats a non-array listing as empty', async () => {
      respond({ store_list: () => null });
      expect(await platform.list('projects')).toEqual([]);
    });

    it('removes through store_remove', async () => {
      respond({ store_remove: () => null });
      await platform.remove('projects/p1');
      expect(invokeMock).toHaveBeenCalledWith('store_remove', { path: 'projects/p1' }, undefined);
    });
  });

  describe('assets', () => {
    it('putAsset sends raw bytes with x-project and x-ext', async () => {
      respond({ asset_put: () => `${HEX}.png` });
      expect(await platform.putAsset('p1', PNG, 'png')).toBe(`${HEX}.png`);
      const call = invokeMock.mock.calls[0];
      expect(call[0]).toBe('asset_put');
      expect([...(call[1] as Uint8Array)]).toEqual([...PNG]);
      expect(headersOf(call)).toEqual({ 'x-project': 'p1', 'x-ext': 'png' });
    });

    it('putAsset checks inputs locally and the returned id', async () => {
      respond({ asset_put: () => 'not-an-id' });
      expect(await codeOf(platform.putAsset('p1', Uint8Array.from([1, 2, 3]), 'png'))).toBe('invalid_data');
      expect(await codeOf(platform.putAsset('../p', PNG, 'png'))).toBe('invalid_path');
      expect(invokeMock).not.toHaveBeenCalled();
      expect(await codeOf(platform.putAsset('p1', PNG, 'png'))).toBe('io');
    });

    it('putAsset maps Rust errors', async () => {
      respond({
        asset_put: () => {
          throw 'invalid_data: not an image';
        },
      });
      expect(await codeOf(platform.putAsset('p1', PNG, 'png'))).toBe('invalid_data');
    });

    it('pickImages passes projectId and normalises the result', async () => {
      respond({
        pick_images: () => [
          { assetId: `${HEX}.png`, name: 'home.png', bytes: 1234 },
          { assetId: 'evil/../x', name: 'bad' },
          { assetId: `${HEX}.jpg` },
        ],
      });
      expect(await platform.pickImages('p1')).toEqual([
        { assetId: `${HEX}.png`, name: 'home.png', bytes: 1234 },
        { assetId: `${HEX}.jpg`, name: `${HEX}.jpg`, bytes: 0 },
      ]);
      expect(invokeMock).toHaveBeenCalledWith('pick_images', { projectId: 'p1' }, undefined);
    });
  });

  describe('export', () => {
    it('picks a folder and builds the target from its path', async () => {
      respond({ pick_export_dir: () => '/Users/me/Desktop/Store shots' });
      expect(await platform.pickExportTarget('My app')).toEqual({
        id: '/Users/me/Desktop/Store shots',
        label: 'Store shots',
        path: '/Users/me/Desktop/Store shots',
      });
      expect(invokeMock).toHaveBeenCalledWith('pick_export_dir', { suggestedName: 'My app' }, undefined);
    });

    it('returns null when the dialog is cancelled', async () => {
      respond({ pick_export_dir: () => null });
      expect(await platform.pickExportTarget('x')).toBeNull();
    });

    it('sends a suggested name serde can read', async () => {
      respond({ pick_export_dir: () => null });
      await platform.pickExportTarget('My\ud800app 😀');
      expect(invokeMock).toHaveBeenCalledWith('pick_export_dir', { suggestedName: 'My\ufffdapp 😀' }, undefined);
    });

    it('writes with URI-encoded x-root and x-path headers', async () => {
      respond({ export_write: () => null });
      const target = { id: '/Users/مها/Exports', label: 'Exports', path: '/Users/مها/Exports' };
      await platform.exportWrite(target, 'App Store/ar-SA/iPhone 6.9/01.png', PNG);
      const call = invokeMock.mock.calls[0];
      expect(call[0]).toBe('export_write');
      const headers = headersOf(call);
      expect(decodeURIComponent(headers['x-root'])).toBe('/Users/مها/Exports');
      expect(decodeURIComponent(headers['x-path'])).toBe('App Store/ar-SA/iPhone 6.9/01.png');
      expect(Object.values(headers).every((v) => /^[\x21-\x7e]+$/.test(v))).toBe(true);
    });

    it('rejects targets without a folder and unsafe relative paths', async () => {
      respond({});
      expect(await codeOf(platform.exportWrite({ id: 'x', label: 'x', path: null }, '01.png', PNG))).toBe('invalid_path');
      const target = { id: '/out', label: 'out', path: '/out' };
      expect(await codeOf(platform.exportWrite(target, '../01.png', PNG))).toBe('invalid_path');
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('finish is a no-op and reveal opens the folder', async () => {
      respond({ reveal_path: () => null });
      const target = { id: '/out', label: 'out', path: '/out' };
      await platform.exportFinish(target);
      expect(invokeMock).not.toHaveBeenCalled();
      await platform.revealTarget(target);
      expect(invokeMock).toHaveBeenCalledWith('reveal_path', { path: '/out' }, undefined);
    });
  });

  describe('files', () => {
    it('openFile picks, then reads the token', async () => {
      respond({
        open_file_pick: () => ({ token: 't-1', name: 'Habit.wajha' }),
        open_file_read: () => buffer([0x50, 0x4b]),
      });
      const opened = await platform.openFile('project');
      expect(opened?.name).toBe('Habit.wajha');
      expect([...(opened?.data ?? [])]).toEqual([0x50, 0x4b]);
      expect(invokeMock.mock.calls.map((c) => [c[0], c[1]])).toEqual([
        ['open_file_pick', { kind: 'project' }],
        ['open_file_read', { token: 't-1' }],
      ]);
    });

    it('openFile keeps to the size limit of its kind even when the shell returns more', async () => {
      respond({
        open_file_pick: () => ({ token: 't-2', name: 'texts.csv' }),
        open_file_read: () => new ArrayBuffer(10 * 1024 * 1024 + 1),
      });
      await expect(platform.openFile('csv')).rejects.toMatchObject({ code: 'invalid_data', message: 'texts.csv is larger than 10 MB' });
    });

    it('openFile returns null when cancelled, without a read', async () => {
      respond({ open_file_pick: () => null });
      expect(await platform.openFile('template')).toBeNull();
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('saveFile sends the bytes with an encoded x-name', async () => {
      respond({ save_file: () => '/Users/me/Habit (نسخة).wajha' });
      expect(await platform.saveFile('Habit (نسخة).wajha', PNG)).toBe('/Users/me/Habit (نسخة).wajha');
      const call = invokeMock.mock.calls[0];
      expect(call[0]).toBe('save_file');
      expect(decodeURIComponent(headersOf(call)['x-name'])).toBe('Habit (نسخة).wajha');
    });

    it('saveFile returns null when cancelled', async () => {
      respond({ save_file: () => null });
      expect(await platform.saveFile('x.wajha', PNG)).toBeNull();
    });
  });

  describe('misc', () => {
    it('info calls app_info once and caches it', async () => {
      respond({ app_info: () => ({ version: '0.1.0', os: 'macos', dataDir: '/Users/me/Library/Application Support/studio.wajha.app' }) });
      const first = await platform.info();
      const second = await platform.info();
      expect(first).toEqual({ kind: 'desktop', os: 'macos', version: '0.1.0', dataDir: '/Users/me/Library/Application Support/studio.wajha.app' });
      expect(second).toEqual(first);
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('info normalises the OS and does not cache failures', async () => {
      let calls = 0;
      respond({
        app_info: () => {
          if (++calls === 1) throw 'io: not ready';
          return { version: 1, os: 'freebsd' };
        },
      });
      expect(await codeOf(platform.info())).toBe('io');
      expect(await platform.info()).toEqual({ kind: 'desktop', os: 'linux', version: '0.0.0', dataDir: '' });
    });

    it('systemFonts caches results and turns failures into []', async () => {
      let calls = 0;
      respond({
        system_fonts: () => {
          if (++calls === 1) throw 'io: fontdb failed';
          return ['Helvetica', 7, 'Inter'];
        },
      });
      expect(await platform.systemFonts()).toEqual([]);
      expect(await platform.systemFonts()).toEqual(['Helvetica', 'Inter']);
      const again = await platform.systemFonts();
      again.push('mutated');
      expect(await platform.systemFonts()).toEqual(['Helvetica', 'Inter']);
      expect(calls).toBe(2);
    });

    it('openUrl only forwards https links', async () => {
      respond({ open_url: () => null });
      await platform.openUrl('https://github.com/wajha');
      expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'https://github.com/wajha' }, undefined);
      expect(await codeOf(platform.openUrl('file:///etc/passwd'))).toBe('invalid_data');
      expect(await codeOf(platform.openUrl('http://example.com'))).toBe('invalid_data');
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
  });
});

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_CSV_BYTES, MAX_IMAGE_BYTES, OPEN_FILE_MAX_BYTES } from './limits';
import { createMemoryPlatform, type MemoryPlatform } from './memory';
import { PlatformError, type PlatformErrorCode } from './types';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const text = (s: string) => new TextEncoder().encode(s);

async function codeOf(p: Promise<unknown>): Promise<PlatformErrorCode | string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof PlatformError ? e.code : `other: ${String(e)}`;
  }
}

describe('memory platform', () => {
  let clock = 0;
  let mem: MemoryPlatform;
  beforeEach(() => {
    clock = 1_000;
    mem = createMemoryPlatform({ now: () => clock });
  });

  describe('files', () => {
    it('round-trips bytes and text, null when missing', async () => {
      await mem.write('a/b.bin', Uint8Array.from([1, 2, 3]));
      await mem.write('a/c.txt', 'مرحبا 👋');
      expect([...((await mem.read('a/b.bin')) ?? [])]).toEqual([1, 2, 3]);
      expect(await mem.readText('a/c.txt')).toBe('مرحبا 👋');
      expect(await mem.read('a/missing')).toBeNull();
      expect(await mem.readText('missing.txt')).toBeNull();
    });

    it('copies on write and on read', async () => {
      const data = Uint8Array.from([1, 2, 3]);
      await mem.write('x', data);
      data[0] = 99;
      const first = await mem.read('x');
      expect(first?.[0]).toBe(1);
      first![1] = 42;
      expect((await mem.read('x'))?.[1]).toBe(2);
    });

    it('stores only the bytes of a subarray', async () => {
      const backing = new Uint8Array(1024);
      await mem.write('small', backing.subarray(10, 12));
      expect((await mem.read('small'))?.byteLength).toBe(2);
      expect((await mem.read('small'))?.buffer.byteLength).toBe(2);
    });

    it('overwrites and updates modifiedMs', async () => {
      await mem.write('d/f', 'one');
      clock = 5_000;
      await mem.write('d/f', 'two!');
      expect(await mem.readText('d/f')).toBe('two!');
      expect(await mem.list('d')).toEqual([{ name: 'f', isDir: false, size: 4, modifiedMs: 5_000 }]);
    });

    it('validates every path', async () => {
      for (const bad of ['', '/abs', '../x', 'a//b', 'a\\b', 'a/./b', 'c:/x', 'nul\u0000']) {
        expect(await codeOf(mem.read(bad))).toBe('invalid_path');
        expect(await codeOf(mem.readText(bad))).toBe('invalid_path');
        expect(await codeOf(mem.write(bad, 'x'))).toBe('invalid_path');
        expect(await codeOf(mem.list(bad))).toBe('invalid_path');
        expect(await codeOf(mem.remove(bad))).toBe('invalid_path');
      }
      expect(mem.testing.files().size).toBe(0);
    });

    it('behaves like a file system for files versus directories', async () => {
      await mem.write('a/file', 'x');
      expect(await codeOf(mem.write('a/file/child', 'y'))).toBe('io');
      expect(await codeOf(mem.write('a', 'over a directory'))).toBe('io');
      expect(await mem.readText('a/file')).toBe('x');
    });
  });

  describe('list', () => {
    it('returns direct children sorted, inferring directories', async () => {
      await mem.write('projects/b/project.json', '{}');
      await mem.write('projects/b/assets/x.png', 'x');
      await mem.write('projects/a/meta.json', '{}');
      await mem.write('projects/notes.txt', 'hello');
      await mem.write('projectsX/other.json', '{}');
      expect(await mem.list('projects')).toEqual([
        { name: 'a', isDir: true, size: 0, modifiedMs: 0 },
        { name: 'b', isDir: true, size: 0, modifiedMs: 0 },
        { name: 'notes.txt', isDir: false, size: 5, modifiedMs: 1_000 },
      ]);
      expect((await mem.list('projects/b')).map((e) => e.name)).toEqual(['assets', 'project.json']);
    });

    it('is empty for missing directories and for files', async () => {
      await mem.write('f', 'x');
      expect(await mem.list('nothing/here')).toEqual([]);
      expect(await mem.list('f')).toEqual([]);
    });
  });

  describe('remove', () => {
    it('removes files and directories recursively, no-op when missing', async () => {
      await mem.write('projects/a/project.json', '{}');
      await mem.write('projects/a/assets/1.png', '1');
      await mem.write('projects/ab/keep.json', '{}');
      await mem.write('projects/a.json', 'sibling file with the same prefix');
      await mem.remove('projects/a');
      expect([...mem.testing.files().keys()].sort()).toEqual(['projects/a.json', 'projects/ab/keep.json']);
      await mem.remove('projects/a.json');
      await mem.remove('does/not/exist');
      expect([...mem.testing.files().keys()]).toEqual(['projects/ab/keep.json']);
    });
  });

  describe('putAsset', () => {
    it('stores content-addressed assets and returns their id', async () => {
      const id = await mem.putAsset('p1', PNG, 'png');
      expect(id).toBe(`${hex(PNG)}.png`);
      expect([...((await mem.read(`projects/p1/assets/${id}`)) ?? [])]).toEqual([...PNG]);
      expect(await mem.putAsset('p1', JPEG, 'jpg')).toBe(`${hex(JPEG)}.jpg`);
      expect(await mem.putAsset('p1', WEBP, 'webp')).toBe(`${hex(WEBP)}.webp`);
    });

    it('skips the write when the asset exists', async () => {
      const id = await mem.putAsset('p1', PNG, 'png');
      clock = 9_999;
      expect(await mem.putAsset('p1', PNG, 'png')).toBe(id);
      const [entry] = await mem.list('projects/p1/assets');
      expect(entry.modifiedMs).toBe(1_000);
    });

    it('rejects bad project ids, extensions and magic bytes', async () => {
      expect(await codeOf(mem.putAsset('../p', PNG, 'png'))).toBe('invalid_path');
      expect(await codeOf(mem.putAsset('a/b', PNG, 'png'))).toBe('invalid_path');
      expect(await codeOf(mem.putAsset('', PNG, 'png'))).toBe('invalid_path');
      expect(await codeOf(mem.putAsset('p1', PNG, 'gif' as 'png'))).toBe('invalid_data');
      expect(await codeOf(mem.putAsset('p1', JPEG, 'png'))).toBe('invalid_data');
      expect(await codeOf(mem.putAsset('p1', text('GIF89a.....'), 'png'))).toBe('invalid_data');
      expect(await codeOf(mem.putAsset('p1', new Uint8Array(), 'jpg'))).toBe('invalid_data');
      expect(mem.testing.files().size).toBe(0);
    });
  });

  describe('dialogs', () => {
    it('pickImages stores valid images and skips the rest', async () => {
      mem.testing.setHandlers({
        pickImages: () => [
          { name: 'home.png', data: PNG },
          { name: 'notes.txt', data: text('not an image') },
          { name: 'renamed.png', data: JPEG },
        ],
      });
      const picked = await mem.pickImages('p1');
      expect(picked).toEqual([
        { assetId: `${hex(PNG)}.png`, name: 'home.png', bytes: PNG.length },
        { assetId: `${hex(JPEG)}.jpg`, name: 'renamed.png', bytes: JPEG.length },
      ]);
      expect((await mem.list('projects/p1/assets')).length).toBe(2);
    });

    it('pickImages skips files over the image size limit, like the desktop picker', async () => {
      const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
      big.set(PNG);
      mem.testing.setHandlers({ pickImages: () => [{ name: 'huge.png', data: big }, { name: 'home.png', data: PNG }] });
      expect((await mem.pickImages('p1')).map((p) => p.name)).toEqual(['home.png']);
    });

    it('pickImages resolves [] by default (cancelled) and validates the project id', async () => {
      expect(await mem.pickImages('p1')).toEqual([]);
      expect(await codeOf(mem.pickImages('../x'))).toBe('invalid_path');
    });

    it('openFile uses the handler, null by default', async () => {
      expect(await mem.openFile('project')).toBeNull();
      const data = text('zip');
      mem.testing.setHandlers({ openFile: (kind) => ({ name: `x.${kind}`, data }) });
      const opened = await mem.openFile('template');
      expect(opened?.name).toBe('x.template');
      expect([...(opened?.data ?? [])]).toEqual([...data]);
      expect(await codeOf(mem.openFile('other' as 'project'))).toBe('invalid_data');
    });

    it('openFile opens translation sheets too', async () => {
      mem.testing.setHandlers({ openFile: (kind) => ({ name: `texts.${kind}`, data: text('slide,key,en-US') }) });
      expect((await mem.openFile('csv'))?.name).toBe('texts.csv');
    });

    it('openFile refuses a file over the limit of its kind', async () => {
      const sheet = new Uint8Array(MAX_CSV_BYTES + 1);
      mem.testing.setHandlers({ openFile: () => ({ name: 'huge.csv', data: sheet }) });
      await expect(mem.openFile('csv')).rejects.toMatchObject({ code: 'invalid_data', message: 'huge.csv is larger than 10 MB' });
      // The same bytes are a small project archive.
      expect(sheet.length).toBeLessThan(OPEN_FILE_MAX_BYTES.project);
      expect((await mem.openFile('project'))?.name).toBe('huge.csv');
    });

    it('saveFile records saved files and honours cancel', async () => {
      expect(await mem.saveFile('My app.wajha', text('a'))).toBe('My app.wajha');
      mem.testing.setHandlers({ saveFile: () => null });
      expect(await mem.saveFile('ignored.wajha', text('b'))).toBeNull();
      expect(mem.testing.savedFiles.map((f) => f.name)).toEqual(['My app.wajha']);
    });

    it('handlers set to undefined keep the defaults', async () => {
      const m = createMemoryPlatform({ openFile: undefined, systemFonts: ['Inter'] });
      expect(await m.openFile('project')).toBeNull();
      expect(await m.systemFonts()).toEqual(['Inter']);
    });
  });

  describe('export targets', () => {
    it('collects written files per target', async () => {
      const target = await mem.pickExportTarget('My app');
      expect(target).toMatchObject({ label: 'My app', path: null });
      await mem.exportWrite(target!, 'App Store/en-US/iPhone 6.9/01.png', PNG);
      await mem.exportWrite(target!, 'App Store/en-US/iPhone 6.9/01.png', JPEG);
      await mem.exportWrite(target!, 'App Store/ar-SA/iPhone 6.9/01.png', PNG);
      await mem.exportFinish(target!);
      await mem.revealTarget(target!);
      const exp = mem.testing.getExport(target!.id)!;
      expect(exp.finished).toBe(true);
      expect(exp.revealed).toBe(1);
      expect([...exp.files.keys()]).toEqual(['App Store/en-US/iPhone 6.9/01.png', 'App Store/ar-SA/iPhone 6.9/01.png']);
      expect([...exp.files.get('App Store/en-US/iPhone 6.9/01.png')!]).toEqual([...JPEG]);
      expect(mem.testing.exports()).toHaveLength(1);
    });

    it('rejects unsafe paths, unknown targets and writes after finish', async () => {
      const target = (await mem.pickExportTarget('x'))!;
      expect(await codeOf(mem.exportWrite(target, '../escape.png', PNG))).toBe('invalid_path');
      expect(await codeOf(mem.exportWrite(target, '/abs.png', PNG))).toBe('invalid_path');
      expect(await codeOf(mem.exportWrite({ id: 'nope', label: 'x', path: null }, 'a.png', PNG))).toBe('not_found');
      await mem.exportFinish(target);
      await mem.exportFinish(target);
      expect(await codeOf(mem.exportWrite(target, 'late.png', PNG))).toBe('not_found');
    });

    it('returns null when the destination dialog is cancelled', async () => {
      mem.testing.setHandlers({ pickExportTarget: () => null });
      expect(await mem.pickExportTarget('x')).toBeNull();
    });
  });

  describe('misc', () => {
    it('info describes the memory platform', async () => {
      expect(mem.kind).toBe('memory');
      expect(await mem.info()).toEqual({ kind: 'memory', os: 'web', version: '0.1.0', dataDir: 'Memory' });
    });

    it('openUrl accepts https only', async () => {
      await mem.openUrl('https://github.com');
      expect(await codeOf(mem.openUrl('http://github.com'))).toBe('invalid_data');
      expect(await codeOf(mem.openUrl('javascript:alert(1)'))).toBe('invalid_data');
      expect(mem.testing.openedUrls).toEqual(['https://github.com']);
    });

    it('reset forgets everything', async () => {
      await mem.write('a', 'x');
      await mem.openUrl('https://a.com');
      await mem.pickExportTarget('x');
      mem.testing.reset();
      expect(mem.testing.files().size).toBe(0);
      expect(mem.testing.openedUrls).toEqual([]);
      expect(mem.testing.exports()).toEqual([]);
    });

    it('instances are independent', async () => {
      const other = createMemoryPlatform();
      await mem.write('shared', 'one');
      expect(await other.read('shared')).toBeNull();
    });
  });
});

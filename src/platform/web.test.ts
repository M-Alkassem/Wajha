import { unzipSync, type UnzipFileInfo } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildZip, childKeyBounds, createWebPlatform, isStoredUncompressed, safeFileName } from './web';
import { PlatformError, type Platform, type PlatformErrorCode } from './types';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const text = (s: string) => new TextEncoder().encode(s);

async function codeOf(p: Promise<unknown>): Promise<PlatformErrorCode | string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof PlatformError ? e.code : `other: ${String(e)}`;
  }
}

async function entriesOf(blob: Blob): Promise<{ files: Record<string, Uint8Array>; infos: UnzipFileInfo[] }> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const infos: UnzipFileInfo[] = [];
  const files = unzipSync(data, {
    filter: (info) => {
      infos.push(info);
      return true;
    },
  });
  return { files, infos };
}

describe('childKeyBounds', () => {
  it('selects exactly the keys inside the directory', () => {
    const keys = [
      'projects',
      'projects/',
      'projects/a',
      'projects/a/b/c',
      'projects/￿',
      'projects/😀',
      'projects.',
      'projects-x',
      'projects0',
      'projectsa',
      'project',
      'projects0/a',
      'other/projects/a',
    ];
    const { lower, upper } = childKeyBounds('projects');
    // IndexedDB compares strings by UTF-16 code units, like JavaScript's < operator.
    const inRange = keys.filter((k) => k >= lower && k < upper);
    expect(inRange.sort()).toEqual(keys.filter((k) => k.startsWith('projects/')).sort());
    expect(lower).toBe('projects/');
    expect(upper).toBe('projects0');
  });

  it('works for nested directories', () => {
    const { lower, upper } = childKeyBounds('projects/p1/assets');
    expect('projects/p1/assets/x.png' >= lower && 'projects/p1/assets/x.png' < upper).toBe(true);
    expect('projects/p1/assets' >= lower).toBe(false);
    expect('projects/p1/assetsX' < upper).toBe(false);
  });
});

describe('buildZip', () => {
  it('round-trips files, storing images and deflating the rest', async () => {
    const csv = text('slide,key,en-US\n1,headline,"Hello"\n'.repeat(50));
    const blob = await buildZip([
      ['App Store/en-US/iPhone 6.9/01.png', PNG],
      ['App Store/en-US/iPhone 6.9/02.jpg', new Blob([JPEG])],
      ['translations.csv', csv],
      ['ملفات/صورة.webp', PNG],
    ]);
    expect(blob.type).toBe('application/zip');
    const { files, infos } = await entriesOf(blob);
    expect(Object.keys(files)).toEqual(['App Store/en-US/iPhone 6.9/01.png', 'App Store/en-US/iPhone 6.9/02.jpg', 'translations.csv', 'ملفات/صورة.webp']);
    expect([...files['App Store/en-US/iPhone 6.9/01.png']]).toEqual([...PNG]);
    expect([...files['App Store/en-US/iPhone 6.9/02.jpg']]).toEqual([...JPEG]);
    expect(new TextDecoder().decode(files['translations.csv'])).toBe(new TextDecoder().decode(csv));
    const compression = Object.fromEntries(infos.map((i) => [i.name, i.compression]));
    expect(compression['App Store/en-US/iPhone 6.9/01.png']).toBe(0);
    expect(compression['App Store/en-US/iPhone 6.9/02.jpg']).toBe(0);
    expect(compression['ملفات/صورة.webp']).toBe(0);
    expect(compression['translations.csv']).toBe(8);
    expect(infos.find((i) => i.name === 'translations.csv')!.size).toBeLessThan(csv.length);
  });

  it('produces a valid empty zip', async () => {
    const { files } = await entriesOf(await buildZip([]));
    expect(files).toEqual({});
  });

  it('handles empty files and many entries', async () => {
    const entries: [string, Uint8Array][] = [['empty.txt', new Uint8Array()]];
    for (let i = 0; i < 300; i++) entries.push([`f/${i}.png`, Uint8Array.from([i & 0xff])]);
    const { files } = await entriesOf(await buildZip(entries));
    expect(Object.keys(files)).toHaveLength(301);
    expect(files['empty.txt'].length).toBe(0);
    expect([...files['f/299.png']]).toEqual([299 & 0xff]);
  });

  it('knows which files are already compressed', () => {
    expect(isStoredUncompressed('a/01.png')).toBe(true);
    expect(isStoredUncompressed('a/01.JPG')).toBe(true);
    expect(isStoredUncompressed('a/01.jpeg')).toBe(true);
    expect(isStoredUncompressed('a/01.webp')).toBe(true);
    expect(isStoredUncompressed('a/notes.csv')).toBe(false);
    expect(isStoredUncompressed('png')).toBe(false);
  });
});

describe('safeFileName', () => {
  it('removes separators, reserved and control characters', () => {
    expect(safeFileName('My app: v2/final?', 'x')).toBe('My app- v2-final-');
    expect(safeFileName('a\\b|c*d<e>f"g', 'x')).toBe('a-b-c-d-e-f-g');
    expect(safeFileName('tab\tand\nnewline', 'x')).toBe('tab-and-newline');
    expect(safeFileName('  spaced   out  ', 'x')).toBe('spaced out');
  });

  it('keeps Arabic and emoji, drops leading dots and trailing dots', () => {
    expect(safeFileName('واجهة 😀', 'x')).toBe('واجهة 😀');
    expect(safeFileName('..hidden', 'x')).toBe('hidden');
    expect(safeFileName('name...', 'x')).toBe('name');
  });

  it('falls back when nothing is left and limits the length by code points', () => {
    expect(safeFileName('', 'Wajha export')).toBe('Wajha export');
    expect(safeFileName('///', 'Wajha export')).toBe('Wajha export');
    expect(safeFileName('...', 'fallback')).toBe('fallback');
    const long = safeFileName('😀'.repeat(500), 'x');
    expect(Array.from(long)).toHaveLength(120);
    expect(long.includes('�')).toBe(false);
  });
});

describe('web platform (without IndexedDB)', () => {
  let platform: Platform;
  beforeEach(() => {
    platform = createWebPlatform();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('describes itself', async () => {
    expect(platform.kind).toBe('web');
    expect(await platform.info()).toEqual({ kind: 'web', os: 'web', version: '0.1.1', dataDir: 'Browser storage (IndexedDB)' });
    expect(await platform.systemFonts()).toEqual([]);
  });

  it('validates paths before touching storage', async () => {
    for (const bad of ['../x', '/abs', 'a\\b', '']) {
      expect(await codeOf(platform.read(bad))).toBe('invalid_path');
      expect(await codeOf(platform.write(bad, 'x'))).toBe('invalid_path');
      expect(await codeOf(platform.list(bad))).toBe('invalid_path');
      expect(await codeOf(platform.remove(bad))).toBe('invalid_path');
    }
  });

  it('reports missing IndexedDB as an io error, and can retry', async () => {
    expect(await codeOf(platform.read('settings.json'))).toBe('io');
    expect(await codeOf(platform.read('settings.json'))).toBe('io');
  });

  it('checks asset input before hashing or storing', async () => {
    expect(await codeOf(platform.putAsset('p1', text('nope'), 'png'))).toBe('invalid_data');
    expect(await codeOf(platform.putAsset('../p1', PNG, 'png'))).toBe('invalid_path');
    expect(await codeOf(platform.putAsset('p1', JPEG, 'png'))).toBe('invalid_data');
  });

  it('openUrl rejects non-https links and opens https ones without an opener', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    expect(await codeOf(platform.openUrl('http://example.com'))).toBe('invalid_data');
    expect(await codeOf(platform.openUrl('javascript:alert(1)'))).toBe('invalid_data');
    expect(open).not.toHaveBeenCalled();
    await platform.openUrl('https://github.com/wajha');
    expect(open).toHaveBeenCalledWith('https://github.com/wajha', '_blank', 'noopener');
  });

  describe('export to a zip download', () => {
    function stubDownloads() {
      const anchors: { href: string; download: string; clicked: number }[] = [];
      const created: Blob[] = [];
      const revoked: string[] = [];
      vi.stubGlobal('document', {
        createElement: () => {
          const a = { href: '', download: '', rel: '', style: {} as Record<string, string>, clicked: 0, click() { a.clicked++; }, remove() {} };
          anchors.push(a);
          return a;
        },
        body: { appendChild: () => undefined },
      });
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        created.push(blob as Blob);
        return `blob:wajha/${created.length}`;
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
        revoked.push(url);
      });
      return { anchors, created, revoked };
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('collects files and downloads "<label>.zip" on finish, revoking the URL later', async () => {
      vi.useFakeTimers();
      const { anchors, created, revoked } = stubDownloads();
      const target = (await platform.pickExportTarget('Habit: tracker/v2'))!;
      expect(target).toMatchObject({ label: 'Habit- tracker-v2', path: null });
      await platform.exportWrite(target, 'App Store/en-US/iPhone 6.9/01.png', PNG);
      await platform.exportWrite(target, 'App Store/en-US/iPhone 6.9/01.png', JPEG);
      await platform.exportWrite(target, 'Google Play/ar/Phone/01.png', PNG);
      await platform.exportFinish(target);
      expect(anchors).toHaveLength(1);
      expect(anchors[0]).toMatchObject({ download: 'Habit- tracker-v2.zip', href: 'blob:wajha/1', clicked: 1 });
      const { files } = await entriesOf(created[0]);
      expect(Object.keys(files)).toEqual(['App Store/en-US/iPhone 6.9/01.png', 'Google Play/ar/Phone/01.png']);
      expect([...files['App Store/en-US/iPhone 6.9/01.png']]).toEqual([...JPEG]);
      expect(revoked).toEqual([]);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(revoked).toEqual(['blob:wajha/1']);
      // A second finish is a no-op; writing afterwards is an error.
      await platform.exportFinish(target);
      expect(anchors).toHaveLength(1);
      expect(await codeOf(platform.exportWrite(target, 'late.png', PNG))).toBe('not_found');
    });

    it('rejects unsafe paths and unknown targets', async () => {
      const target = (await platform.pickExportTarget('x'))!;
      expect(await codeOf(platform.exportWrite(target, '../escape.png', PNG))).toBe('invalid_path');
      expect(await codeOf(platform.exportWrite({ id: 'nope', label: 'x', path: null }, 'a.png', PNG))).toBe('not_found');
      expect(await codeOf(platform.exportFinish({ id: 'nope', label: 'x', path: null }))).toBe('not_found');
    });

    it('a new export drops an unfinished one', async () => {
      const first = (await platform.pickExportTarget('first'))!;
      await platform.exportWrite(first, '01.png', PNG);
      const second = (await platform.pickExportTarget('second'))!;
      expect(second.id).not.toBe(first.id);
      expect(await codeOf(platform.exportWrite(first, '02.png', PNG))).toBe('not_found');
      await platform.exportWrite(second, '01.png', PNG);
    });

    it('saveFile downloads under a safe name', async () => {
      vi.useFakeTimers();
      const { anchors, created } = stubDownloads();
      expect(await platform.saveFile('Habit/tracker.wajha', PNG)).toBe('Habit-tracker.wajha');
      expect(anchors[0].download).toBe('Habit-tracker.wajha');
      expect([...new Uint8Array(await created[0].arrayBuffer())]).toEqual([...PNG]);
    });
  });
});

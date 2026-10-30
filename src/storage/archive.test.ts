import { unzipSync, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../model/validate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../model/validate')>();
  return {
    ...actual,
    validateProject: vi.fn((json: unknown) => json),
    validateTemplate: vi.fn((json: unknown) => json),
    validateGalleryIndex: vi.fn((json: unknown) => json),
  };
});

import type { Project, Template } from '../model/types';
import { ValidationError, validateProject, validateTemplate } from '../model/validate';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../platform';
import {
  ARCHIVE_MAX_ENTRIES,
  StorageError,
  exportProjectArchive,
  exportTemplateArchive,
  importProjectArchive,
  importTemplateArchive,
  listProjects,
  listUserTemplates,
  loadProject,
  readAsset,
  readTemplateAsset,
  readTemplatePreview,
  readThumbnail,
  saveProject,
  saveUserTemplate,
} from './index';
import { isUnsafeEntryName } from './archive';
import { assetIdOf, imageFill, jpeg, makeProject, makeSlide, makeTemplate, patchCentralSize, png, webp } from './fixtures.node';

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const MB = 1024 * 1024;
const info = (id: string) => ({ id, name: 'shot.png', width: 4, height: 4, bytes: 64, addedAt: 1 });
const usingShot = (id: string) => makeProject({ slides: [makeSlide('s1', { shots: { iphone: { main: { 'en-US': id } } } })], assets: { [id]: info(id) } });

/** The real validators, for tests about what validation does with the files that arrived. */
async function validateForReal() {
  const actual = await vi.importActual<typeof import('../model/validate')>('../model/validate');
  vi.mocked(validateProject).mockImplementation(actual.validateProject);
  vi.mocked(validateTemplate).mockImplementation(actual.validateTemplate);
}

let mem: MemoryPlatform;
beforeEach(() => {
  mem = createMemoryPlatform();
  setPlatform(mem);
  vi.mocked(validateProject).mockImplementation((v) => v as Project);
  vi.mocked(validateTemplate).mockImplementation((v) => v as Template);
});

async function errorOf(p: Promise<unknown>): Promise<StorageError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StorageError) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

/** A project referencing two stored assets, with one unreferenced asset and a thumbnail. */
async function seedProject() {
  const shot = png(1);
  const bg = webp(2);
  const shotId = await mem.putAsset('proj1', shot, 'png');
  const bgId = await mem.putAsset('proj1', bg, 'webp');
  const unusedId = await mem.putAsset('proj1', png(3), 'png');
  const project = makeProject({
    theme: { ...makeProject().theme, background: { fill: { type: 'image', assetId: bgId, fit: 'cover', opacity: 1, blur: 0, tint: null }, pattern: null } },
    slides: [makeSlide('s1', { shots: { iphone: { main: { 'en-US': shotId } } } })],
  });
  await saveProject(project);
  await mem.write('projects/proj1/thumb.jpg', jpeg(9));
  return { project, shot, bg, shotId, bgId, unusedId };
}

describe('project archives', () => {
  it('exports project.json, referenced assets and the thumbnail', async () => {
    const { project, shotId, bgId, unusedId } = await seedProject();
    const zip = await exportProjectArchive('proj1');
    const infos: Record<string, number> = {};
    const files = unzipSync(zip, {
      filter: (info) => {
        infos[info.name] = info.compression;
        return true;
      },
    });
    expect(Object.keys(files).sort()).toEqual(['assets/' + bgId, 'assets/' + shotId, 'project.json', 'thumb.jpg'].sort());
    expect(Object.keys(files)).not.toContain(`assets/${unusedId}`);
    expect(JSON.parse(new TextDecoder().decode(files['project.json']))).toEqual(project);
    expect(infos[`assets/${shotId}`]).toBe(0);
    expect(infos['thumb.jpg']).toBe(0);
  });

  it('round-trips under a fresh id, with assets and thumbnail', async () => {
    const { project, shot, bg, shotId, bgId } = await seedProject();
    const zip = await exportProjectArchive('proj1');
    mem.testing.reset();
    const before = Date.now();
    const meta = await importProjectArchive(zip);
    expect(meta.id).not.toBe('proj1');
    expect(meta.name).toBe(project.name);
    expect(meta.updatedAt).toBeGreaterThanOrEqual(before);
    expect(meta.createdAt).toBe(project.createdAt);
    const imported = await loadProject(meta.id);
    expect(imported).toEqual({ ...project, id: meta.id, updatedAt: meta.updatedAt });
    expect(await readAsset(meta.id, shotId)).toEqual(shot);
    expect(await readAsset(meta.id, bgId)).toEqual(bg);
    expect(await readThumbnail(meta.id)).toEqual(jpeg(9));
    expect((await listProjects()).map((m) => m.id)).toEqual([meta.id]);
  });

  it('never overwrites: a second import is a separate project marked "(imported)"', async () => {
    await seedProject();
    const zip = await exportProjectArchive('proj1');
    const first = await importProjectArchive(zip);
    const second = await importProjectArchive(zip);
    expect(new Set(['proj1', first.id, second.id]).size).toBe(3);
    expect(first.name).toBe('Habit tracker (imported)');
    expect(second.name).toBe('Habit tracker (imported)');
    expect((await loadProject('proj1')).name).toBe('Habit tracker');
  });

  it('keeps long names within 200 characters when adding the suffix', async () => {
    const name = 'ع'.repeat(200);
    await saveProject(makeProject({ name }));
    const meta = await importProjectArchive(await exportProjectArchive('proj1'));
    expect(meta.name.endsWith(' (imported)')).toBe(true);
    expect(Array.from(meta.name)).toHaveLength(200);
  });

  it('drops assets whose bytes do not match their name', async () => {
    const good = png(1);
    const goodId = assetIdOf(good, 'png');
    const tamperedId = assetIdOf(png(2), 'png');
    const wrongTypeId = `${assetIdOf(png(3), 'png').slice(0, 64)}.jpg`;
    const shots = { iphone: { main: { 'en-US': goodId, 'ar-SA': tamperedId }, alt: { 'en-US': wrongTypeId } } };
    const zip = zipSync({
      'project.json': json(makeProject({ slides: [makeSlide('s1', { shots })], assets: { [goodId]: info(goodId), [tamperedId]: info(tamperedId), [wrongTypeId]: info(wrongTypeId) } })),
      [`assets/${goodId}`]: good,
      [`assets/${tamperedId}`]: png(99),
      [`assets/${wrongTypeId}`]: png(3),
      'assets/readme.txt': json('ignored'),
    });
    const meta = await importProjectArchive(zip);
    expect((await mem.list(`projects/${meta.id}/assets`)).map((e) => e.name)).toEqual([goodId]);
  });

  it('ignores a thumbnail that is not an image and unknown entries', async () => {
    const zip = zipSync({
      'project.json': json(makeProject()),
      'thumb.jpg': json('not an image'),
      '__MACOSX/._project.json': new Uint8Array([0, 1]),
      'notes/readme.md': json('hello'),
    });
    const meta = await importProjectArchive(zip);
    expect(await readThumbnail(meta.id)).toBeNull();
    expect([...mem.testing.files().keys()].sort()).toEqual([`projects/${meta.id}/meta.json`, `projects/${meta.id}/project.json`]);
  });

  it('drops an image whose header declares a huge canvas, and every reference to it', async () => {
    await validateForReal();
    // About 5 KB of PNG can declare 30000 x 30000 pixels: 3.6 GB once WebKit decodes it, on every open.
    const bomb = png(1, 64, { width: 30000, height: 30000 });
    const bombId = assetIdOf(bomb, 'png');
    const meta = await importProjectArchive(zipSync({ 'project.json': json(usingShot(bombId)), [`assets/${bombId}`]: bomb }));
    expect(await mem.list(`projects/${meta.id}/assets`)).toEqual([]);
    const imported = await loadProject(meta.id);
    expect(imported.assets).toEqual({});
    expect(imported.slides[0].shots).toEqual({});
  });

  it('keeps the thumbnail only when it is a small image', async () => {
    const bomb = await importProjectArchive(zipSync({ 'project.json': json(makeProject()), 'thumb.jpg': png(2, 64, { width: 30000, height: 30000 }) }));
    expect(await mem.read(`projects/${bomb.id}/thumb.jpg`)).toBeNull();
    const ok = await importProjectArchive(zipSync({ 'project.json': json(makeProject()), 'thumb.jpg': jpeg(2, 64, { width: 1401, height: 244 }) }));
    expect(await readThumbnail(ok.id)).toEqual(jpeg(2, 64, { width: 1401, height: 244 }));
  });

  it('drops a missing or damaged image together with every reference to it', async () => {
    await validateForReal();
    const good = png(1);
    const goodId = assetIdOf(good, 'png');
    const missingId = assetIdOf(png(2), 'png');
    const damagedId = assetIdOf(png(3), 'png');
    const image = { id: 'im', kind: 'image' as const, assetId: damagedId, x: 0.5, y: 0.5, rotation: 0, opacity: 1, width: 0.3, cornerRadius: 0, shadow: null };
    const project = makeProject({
      theme: { ...makeProject().theme, background: { fill: imageFill(missingId), pattern: null } },
      slides: [makeSlide('s1', { shots: { iphone: { main: { 'en-US': goodId, 'ar-SA': damagedId } } }, layouts: { iphone: { background: null, elements: [image] } } })],
      assets: { [goodId]: info(goodId), [missingId]: info(missingId), [damagedId]: info(damagedId) },
    });
    const meta = await importProjectArchive(zipSync({ 'project.json': json(project), [`assets/${goodId}`]: good, [`assets/${damagedId}`]: png(99) }));
    const imported = await loadProject(meta.id);
    expect(Object.keys(imported.assets)).toEqual([goodId]);
    expect(imported.slides[0].shots).toEqual({ iphone: { main: { 'en-US': goodId } } });
    expect(imported.slides[0].layouts.iphone?.elements).toEqual([]);
    expect(imported.theme.background.fill.type).not.toBe('image');
    expect((await mem.list(`projects/${meta.id}/assets`)).map((e) => e.name)).toEqual([goodId]);
  });

  it('writes only the images the project uses', async () => {
    const used = png(1);
    const usedId = assetIdOf(used, 'png');
    const stray = png(2);
    const strayId = assetIdOf(stray, 'png');
    const project = { ...usingShot(usedId), assets: { [usedId]: info(usedId), [strayId]: info(strayId) } };
    const meta = await importProjectArchive(zipSync({ 'project.json': json(project), [`assets/${usedId}`]: used, [`assets/${strayId}`]: stray }));
    expect((await mem.list(`projects/${meta.id}/assets`)).map((e) => e.name)).toEqual([usedId]);
    expect(Object.keys((await loadProject(meta.id)).assets)).toEqual([usedId]);
  });

  describe('hostile or broken files', () => {
    it.each([
      ['../evil.txt'],
      ['/etc/passwd'],
      ['assets/../../escape.png'],
      ['C:\\Windows\\win.ini'],
      ['c:evil'],
      ['\\\\server\\share'],
      ['assets\\..\\..\\x'],
      ['bad\u0000name'],
    ])('rejects the zip-slip name %j', async (name) => {
      const zip = zipSync({ 'project.json': json(makeProject()), [name]: new Uint8Array([1]) });
      const e = await errorOf(importProjectArchive(zip));
      expect(e.code).toBe('invalid_file');
      expect(e.message).toMatch(/unsafe file name/);
      expect(mem.testing.files().size).toBe(0);
    });

    it('accepts ordinary nested names', () => {
      expect(isUnsafeEntryName('assets/')).toBe(false);
      expect(isUnsafeEntryName('a/b/c.png')).toBe(false);
      expect(isUnsafeEntryName('..hidden')).toBe(false);
      expect(isUnsafeEntryName('')).toBe(true);
    });

    it('rejects more than 2000 entries before inflating anything', async () => {
      const files: Zippable = { 'project.json': json(makeProject()) };
      for (let i = 0; i < ARCHIVE_MAX_ENTRIES; i++) files[`junk/${i}.txt`] = new Uint8Array([i & 0xff]);
      const e = await errorOf(importProjectArchive(zipSync(files, { level: 0 })));
      expect(e.code).toBe('too_large');
      expect(e.message).toMatch(/2000 files/);
    });

    it('accepts exactly 2000 entries', async () => {
      const files: Zippable = { 'project.json': json(makeProject()) };
      for (let i = 1; i < ARCHIVE_MAX_ENTRIES; i++) files[`junk/${i}.txt`] = new Uint8Array([1]);
      const meta = await importProjectArchive(zipSync(files, { level: 0 }));
      expect(meta.name).toBe('Habit tracker');
    });

    it('rejects a declared uncompressed total over 500 MB from the directory alone', async () => {
      const zip = zipSync({ 'project.json': json(makeProject()), 'a.bin': new Uint8Array(10), 'b.bin': new Uint8Array(10) });
      const patched = patchCentralSize(patchCentralSize(zip, 'a.bin', 300 * 1024 * 1024), 'b.bin', 300 * 1024 * 1024);
      const e = await errorOf(importProjectArchive(patched));
      expect(e.code).toBe('too_large');
      expect(e.message).toMatch(/500 MB/);
    });

    it('refuses a project.json over 16 MB from the zip directory, before inflating it', async () => {
      // A 100 KB archive can hold a 100 MB project.json: 7.5 s of frozen UI and 2 GB to parse it.
      const zip = zipSync({ 'project.json': json(makeProject()) });
      const e = await errorOf(importProjectArchive(patchCentralSize(zip, 'project.json', 16 * MB + 1)));
      expect(e.code).toBe('too_large');
      expect(e.message).toMatch(/project\.json is larger than 16 MB/);
    });

    it('leaves out an image over 100 MB or a thumbnail over 4 MB without inflating them', async () => {
      const shot = png(1);
      const shotId = assetIdOf(shot, 'png');
      const zip = zipSync({ 'project.json': json(usingShot(shotId)), [`assets/${shotId}`]: shot, 'thumb.jpg': jpeg(1) }, { level: 0 });
      // Inflating would allocate what the directory declares; these are never inflated.
      const patched = patchCentralSize(patchCentralSize(zip, `assets/${shotId}`, 100 * MB + 1), 'thumb.jpg', 4 * MB + 1);
      const meta = await importProjectArchive(patched);
      expect(await mem.list(`projects/${meta.id}/assets`)).toEqual([]);
      expect(await readThumbnail(meta.id)).toBeNull();
    });

    it('keeps names unique even for entries it leaves out', async () => {
      const shot = png(1);
      const shotId = assetIdOf(shot, 'png');
      const a = zipSync({ 'project.json': json(makeProject()), [`assets/${shotId}`]: shot, [`assets/${shotId.toUpperCase()}`]: shot }, { level: 0 });
      // Rename the second entry so both carry the same name, then make it oversized.
      const bytes = a.slice();
      const needle = new TextEncoder().encode(`assets/${shotId.toUpperCase()}`);
      const replacement = new TextEncoder().encode(`assets/${shotId}`);
      for (let i = 0; i + needle.length <= bytes.length; i++) {
        if (needle.every((b, k) => bytes[i + k] === b)) bytes.set(replacement, i);
      }
      const e = await errorOf(importProjectArchive(patchCentralSize(bytes, `assets/${shotId}`, 200 * MB)));
      expect(e.message).toMatch(/appears twice/);
    });

    it('limits a .wajha-template to 100 MB', async () => {
      const zip = zipSync({ 'template.json': json(makeTemplate()), 'a.bin': new Uint8Array(10) });
      const e = await errorOf(importTemplateArchive(patchCentralSize(zip, 'a.bin', 100 * MB)));
      expect(e.code).toBe('too_large');
      expect(e.message).toMatch(/\.wajha-template file is too large to import: more than 100 MB uncompressed/);
    });

    it('cannot be made to inflate more than the directory declares', async () => {
      // 4 MB of zeros that claims to be 16 bytes once inflated.
      const big = new Uint8Array(4 * 1024 * 1024);
      big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const id = assetIdOf(big, 'png');
      const zip = zipSync({ 'project.json': json(makeProject()), [`assets/${id}`]: [big, { level: 9 }] });
      const patched = patchCentralSize(zip, `assets/${id}`, 16);
      // fflate inflates into a buffer of the declared size, so the bytes come
      // out truncated, the hash no longer matches, and the asset is dropped.
      const meta = await importProjectArchive(patched);
      expect(await mem.list(`projects/${meta.id}/assets`)).toEqual([]);
    });

    it('rejects invalid JSON in project.json', async () => {
      const zip = zipSync({ 'project.json': new TextEncoder().encode('{"format": "wajha.project", ') });
      const e = await errorOf(importProjectArchive(zip));
      expect(e.code).toBe('invalid_file');
      expect(e.message).toMatch(/project\.json is not valid JSON/);
    });

    it('rejects a project that fails validation', async () => {
      vi.mocked(validateProject).mockImplementationOnce(() => {
        throw new ValidationError('families', 'must not be empty');
      });
      const e = await errorOf(importProjectArchive(zipSync({ 'project.json': json(makeProject()) })));
      expect(e.code).toBe('invalid_file');
      expect(e.message).toMatch(/families: must not be empty/);
      expect(mem.testing.files().size).toBe(0);
    });

    it('explains when a template file is imported as a project', async () => {
      const zip = zipSync({ 'project.json': json(makeTemplate()) });
      const e = await errorOf(importProjectArchive(zip));
      expect(e.message).toMatch(/template/);
    });

    it('rejects archives without project.json', async () => {
      const e = await errorOf(importProjectArchive(zipSync({ 'template.json': json(makeTemplate()) })));
      expect(e.code).toBe('invalid_file');
      expect(e.message).toMatch(/project\.json is missing/);
    });

    it('rejects data that is not a zip', async () => {
      for (const data of [new Uint8Array(), new Uint8Array(10), new TextEncoder().encode('x'.repeat(5000)), png(1, 2000)]) {
        const e = await errorOf(importProjectArchive(data));
        expect(e.code).toBe('invalid_file');
      }
    });

    it('rejects a truncated zip', async () => {
      const zip = zipSync({ 'project.json': json(makeProject()) });
      expect((await errorOf(importProjectArchive(zip.subarray(0, zip.length - 30)))).code).toBe('invalid_file');
    });

    it('rejects duplicate entries for the same file', async () => {
      const a = zipSync({ 'project.json': json(makeProject({ name: 'one' })), 'project.jsoN': json(makeProject({ name: 'two' })) });
      // Rename the second entry in both headers so both are called project.json.
      const bytes = a.slice();
      const needle = new TextEncoder().encode('project.jsoN');
      for (let i = 0; i + needle.length <= bytes.length; i++) {
        if (needle.every((b, k) => bytes[i + k] === b)) bytes[i + needle.length - 1] = 0x6e;
      }
      const e = await errorOf(importProjectArchive(bytes));
      expect(e.message).toMatch(/appears twice/);
    });

    it('cleans up when writing the import fails', async () => {
      const zip = zipSync({ 'project.json': json(makeProject()), [`assets/${assetIdOf(png(1), 'png')}`]: png(1) });
      setPlatform({
        ...mem,
        write: async (path, data) => {
          if (path.endsWith('project.json')) throw new Error('disk full');
          await mem.write(path, data);
        },
      });
      await expect(importProjectArchive(zip)).rejects.toThrow('disk full');
      expect(mem.testing.files().size).toBe(0);
    });
  });

  it('exports only the images the project uses, without registry entries kept for undo', async () => {
    const current = await mem.putAsset('proj1', png(1), 'png');
    const replaced = await mem.putAsset('proj1', png(2), 'png');
    await saveProject({ ...usingShot(current), assets: { [current]: info(current), [replaced]: info(replaced) } });
    const files = unzipSync(await exportProjectArchive('proj1'));
    expect(Object.keys(files).filter((name) => name.startsWith('assets/'))).toEqual([`assets/${current}`]);
    expect(Object.keys(JSON.parse(new TextDecoder().decode(files['project.json'])).assets)).toEqual([current]);
  });

  it('leaves out a thumbnail that is not a small image', async () => {
    await saveProject(makeProject());
    await mem.write('projects/proj1/thumb.jpg', png(1, 64, { width: 30000, height: 30000 }));
    expect(Object.keys(unzipSync(await exportProjectArchive('proj1')))).toEqual(['project.json']);
  });

  it('refuses to export a project the importer would reject', async () => {
    const assets: Record<string, string> = {};
    const project = makeProject();
    // 2000 referenced assets plus project.json exceed the entry limit.
    for (let i = 0; i < ARCHIVE_MAX_ENTRIES; i++) {
      const bytes = png(i, 16);
      const id = assetIdOf(bytes, 'png');
      await mem.write(`projects/proj1/assets/${id}`, bytes);
      assets[id] = id;
    }
    await saveProject({ ...project, slides: [makeSlide('s1', { texts: { 'en-US': assets } })] });
    const e = await errorOf(exportProjectArchive('proj1'));
    expect(e.code).toBe('too_large');
  });

  it('fails clearly when exporting a missing project', async () => {
    expect((await errorOf(exportProjectArchive('ghost'))).code).toBe('not_found');
  });
});

describe('template archives', () => {
  async function seedTemplate() {
    const bg = png(5);
    const bgId = assetIdOf(bg, 'png');
    const template = makeTemplate({
      theme: { ...makeTemplate().theme, background: { fill: { type: 'image', assetId: bgId, fit: 'cover', opacity: 1, blur: 0, tint: null }, pattern: null } },
      assets: { [bgId]: { id: bgId, name: 'bg.png', width: 10, height: 10, bytes: bg.length, addedAt: 1 } },
    });
    await saveUserTemplate(template, jpeg(5), { [bgId]: bg });
    return { template, bg, bgId };
  }

  it('round-trips template.json, preview and assets', async () => {
    const { template, bg, bgId } = await seedTemplate();
    const zip = await exportTemplateArchive('sunset-glow');
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['assets/' + bgId, 'preview.jpg', 'template.json'].sort());
    mem.testing.reset();
    const imported = await importTemplateArchive(zip);
    expect(imported).toEqual(template);
    expect(await readTemplatePreview('sunset-glow')).toEqual(jpeg(5));
    expect(await readTemplateAsset('sunset-glow', bgId)).toEqual(bg);
  });

  it('gives a taken id the next free suffix and marks a taken name', async () => {
    await seedTemplate();
    const zip = await exportTemplateArchive('sunset-glow');
    const second = await importTemplateArchive(zip);
    const third = await importTemplateArchive(zip);
    expect(second.id).toBe('sunset-glow-2');
    expect(third.id).toBe('sunset-glow-3');
    expect(second.name).toBe('Sunset glow (imported)');
    expect((await listUserTemplates()).map((t) => t.id).sort()).toEqual(['sunset-glow', 'sunset-glow-2', 'sunset-glow-3']);
  });

  it('keeps suffixed ids within the 64-character limit', async () => {
    const longId = `${'a'.repeat(30)}-${'b'.repeat(33)}`;
    expect(longId).toHaveLength(64);
    await saveUserTemplate(makeTemplate({ id: longId }), null, {});
    const zip = await exportTemplateArchive(longId);
    const imported = await importTemplateArchive(zip);
    expect(imported.id).toHaveLength(64);
    expect(imported.id.endsWith('-2')).toBe(true);
    expect(imported.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const again = await importTemplateArchive(zip);
    expect(again.id.endsWith('-3')).toBe(true);
  });

  it('applies the same safety checks', async () => {
    const slip = zipSync({ 'template.json': json(makeTemplate()), '../../x': new Uint8Array([1]) });
    expect((await errorOf(importTemplateArchive(slip))).code).toBe('invalid_file');
    const badJson = zipSync({ 'template.json': new TextEncoder().encode('[') });
    expect((await errorOf(importTemplateArchive(badJson))).message).toMatch(/template\.json is not valid JSON/);
    const project = zipSync({ 'template.json': json(makeProject()) });
    expect((await errorOf(importTemplateArchive(project))).message).toMatch(/project/);
    const badId = zipSync({ 'template.json': json(makeTemplate({ id: '../x' })) });
    expect((await errorOf(importTemplateArchive(badId))).code).toBe('invalid_file');
    vi.mocked(validateTemplate).mockImplementationOnce(() => {
      throw new ValidationError('slides', 'needs 3 to 10 slides');
    });
    const invalid = zipSync({ 'template.json': json(makeTemplate()) });
    expect((await errorOf(importTemplateArchive(invalid))).message).toMatch(/needs 3 to 10 slides/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('drops tampered template assets', async () => {
    const id = assetIdOf(png(1), 'png');
    const zip = zipSync({ 'template.json': json(makeTemplate()), [`assets/${id}`]: png(2), 'preview.jpg': jpeg(1) });
    const imported = await importTemplateArchive(zip);
    expect(await readTemplateAsset(imported.id, id)).toBeNull();
    expect(await readTemplatePreview(imported.id)).toEqual(jpeg(1));
  });

  it('drops an image that is damaged or too large together with the design that uses it', async () => {
    await validateForReal();
    const bomb = png(1, 64, { width: 50000, height: 50000 });
    const bombId = assetIdOf(bomb, 'png');
    const tamperedId = assetIdOf(png(2), 'png');
    const template = makeTemplate({
      theme: { ...makeTemplate().theme, background: { fill: imageFill(tamperedId), pattern: null } },
      slides: [{ texts: { 'en-US': { headline: 'Hi' } }, layouts: { tall: { background: { fill: imageFill(bombId), pattern: null }, elements: [] } } }],
      assets: { [bombId]: info(bombId), [tamperedId]: info(tamperedId) },
    });
    const imported = await importTemplateArchive(
      zipSync({ 'template.json': json(template), [`assets/${bombId}`]: bomb, [`assets/${tamperedId}`]: png(3), 'preview.jpg': png(4, 64, { width: 30000, height: 30000 }) }),
    );
    expect(imported.assets).toEqual({});
    expect(imported.theme.background.fill.type).not.toBe('image');
    expect(imported.slides[0].layouts.tall.background).toBeNull();
    expect(await mem.list(`templates/${imported.id}/assets`)).toEqual([]);
    expect(await readTemplatePreview(imported.id)).toBeNull();
  });
});

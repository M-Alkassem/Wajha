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

import type { Template } from '../model/types';
import { ValidationError, validateTemplate } from '../model/validate';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../platform';
import {
  StorageError,
  copyTemplateAssets,
  deleteUserTemplate,
  listUserTemplates,
  readAsset,
  readTemplateAsset,
  readTemplatePreview,
  saveUserTemplate,
} from './index';
import { assetIdOf, jpeg, makeTemplate, png, webp } from './fixtures.node';

let mem: MemoryPlatform;
beforeEach(() => {
  mem = createMemoryPlatform();
  setPlatform(mem);
  vi.mocked(validateTemplate).mockImplementation((json) => json as Template);
});

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('user templates', () => {
  it('saves and lists templates sorted by name, with preview and assets', async () => {
    const bg = png(1);
    const bgId = assetIdOf(bg, 'png');
    await saveUserTemplate(makeTemplate({ id: 'zeta', name: 'Zeta' }), null, {});
    await saveUserTemplate(makeTemplate({ id: 'alpha', name: 'alpha' }), jpeg(1), { [bgId]: bg });
    await saveUserTemplate(makeTemplate({ id: 'mid', name: 'Middle' }), null, {});
    const listed = await listUserTemplates();
    expect(listed.map((t) => t.id)).toEqual(['alpha', 'mid', 'zeta']);
    expect(await readTemplatePreview('alpha')).toEqual(jpeg(1));
    expect(await readTemplatePreview('zeta')).toBeNull();
    expect(await readTemplateAsset('alpha', bgId)).toEqual(bg);
    expect(await readTemplateAsset('alpha', '../template.json')).toBeNull();
  });

  it('is empty without templates', async () => {
    expect(await listUserTemplates()).toEqual([]);
  });

  it('replacing a template removes stale assets and the old preview', async () => {
    const a = png(1);
    const b = png(2);
    const idA = assetIdOf(a, 'png');
    const idB = assetIdOf(b, 'png');
    await saveUserTemplate(makeTemplate(), jpeg(1), { [idA]: a, [idB]: b });
    await saveUserTemplate(makeTemplate({ name: 'Sunset glow v2' }), null, { [idB]: b });
    expect(await readTemplateAsset('sunset-glow', idA)).toBeNull();
    expect(await readTemplateAsset('sunset-glow', idB)).toEqual(b);
    expect(await readTemplatePreview('sunset-glow')).toBeNull();
    expect((await listUserTemplates())[0].name).toBe('Sunset glow v2');
  });

  it('refuses assets whose bytes do not match their id', async () => {
    const a = png(1);
    const wrongHash = assetIdOf(png(2), 'png');
    const wrongExt = `${assetIdOf(a, 'png').slice(0, 64)}.jpg`;
    for (const assets of [{ [wrongHash]: a }, { [wrongExt]: a }, { 'not-an-id.png': a }]) {
      const e = await errorOf(saveUserTemplate(makeTemplate(), null, assets));
      expect(e).toBeInstanceOf(StorageError);
      expect((e as StorageError).code).toBe('invalid_file');
    }
    expect(mem.testing.files().size).toBe(0);
  });

  it('refuses images whose header declares more pixels than the app decodes', async () => {
    const bomb = png(1, 64, { width: 20000, height: 20000 });
    const e = await errorOf(saveUserTemplate(makeTemplate(), null, { [assetIdOf(bomb, 'png')]: bomb }));
    expect((e as StorageError).message).toMatch(/larger than supported/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('reads a preview only when it is a small image', async () => {
    await saveUserTemplate(makeTemplate(), png(1, 64, { width: 30000, height: 30000 }), {});
    expect(await readTemplatePreview('sunset-glow')).toBeNull();
    await saveUserTemplate(makeTemplate(), jpeg(1, 64, { width: 1200, height: 860 }), {});
    expect(await readTemplatePreview('sunset-glow')).toEqual(jpeg(1, 64, { width: 1200, height: 860 }));
  });

  it('rejects unsafe template ids', async () => {
    for (const id of ['../x', 'a/b', '', 'Upper-Case', 'snake_case']) {
      expect(await errorOf(saveUserTemplate(makeTemplate({ id }), null, {}))).toMatchObject({ code: 'invalid_path' });
      expect(await errorOf(deleteUserTemplate(id))).toMatchObject({ code: 'invalid_path' });
    }
  });

  it('skips broken template folders', async () => {
    await saveUserTemplate(makeTemplate({ id: 'good', name: 'Good' }), null, {});
    await mem.write('templates/badjson/template.json', '{nope');
    await mem.write('templates/invalid/template.json', JSON.stringify({ format: 'wajha.template', id: 'invalid' }));
    await mem.write('templates/empty/preview.jpg', jpeg(1));
    vi.mocked(validateTemplate).mockImplementation((json) => {
      if ((json as { id?: string }).id === 'invalid') throw new ValidationError('slides', 'needs at least 3 slides');
      return json as Template;
    });
    expect((await listUserTemplates()).map((t) => t.id)).toEqual(['good']);
  });

  it('skips folders whose names are not template ids', async () => {
    await mem.write('templates/Not Kebab/template.json', JSON.stringify(makeTemplate({ id: 'Not Kebab' })));
    await saveUserTemplate(makeTemplate(), null, {});
    expect((await listUserTemplates()).map((t) => t.id)).toEqual(['sunset-glow']);
  });

  it('uses the folder name as the id', async () => {
    await mem.write('templates/folder-id/template.json', JSON.stringify(makeTemplate({ id: 'other-id' })));
    expect((await listUserTemplates())[0].id).toBe('folder-id');
  });

  it('a failed first save leaves nothing; a failed update keeps the old version', async () => {
    const failingTemplateJson = () =>
      setPlatform({
        ...mem,
        write: async (path, data) => {
          if (path.endsWith('template.json')) throw new Error('disk full');
          await mem.write(path, data);
        },
      });
    const a = png(1);
    const idA = assetIdOf(a, 'png');
    failingTemplateJson();
    await expect(saveUserTemplate(makeTemplate(), jpeg(1), { [idA]: a })).rejects.toThrow('disk full');
    expect(mem.testing.files().size).toBe(0);

    setPlatform(mem);
    await saveUserTemplate(makeTemplate(), jpeg(1), { [idA]: a });
    const b = png(2);
    failingTemplateJson();
    await expect(saveUserTemplate(makeTemplate({ name: 'v2' }), null, { [assetIdOf(b, 'png')]: b })).rejects.toThrow('disk full');
    setPlatform(mem);
    expect((await listUserTemplates())[0].name).toBe('Sunset glow');
    expect(await readTemplateAsset('sunset-glow', idA)).toEqual(a);
    expect(await readTemplatePreview('sunset-glow')).toEqual(jpeg(1));
  });

  it('deletes a template folder', async () => {
    await saveUserTemplate(makeTemplate(), jpeg(1), {});
    await deleteUserTemplate('sunset-glow');
    await deleteUserTemplate('sunset-glow');
    expect(await listUserTemplates()).toEqual([]);
    expect(mem.testing.files().size).toBe(0);
  });
});

describe('copyTemplateAssets', () => {
  it('copies the requested assets into the project', async () => {
    const a = png(1);
    const b = webp(2);
    const idA = assetIdOf(a, 'png');
    const idB = assetIdOf(b, 'webp');
    await saveUserTemplate(makeTemplate(), null, { [idA]: a, [idB]: b });
    expect(await copyTemplateAssets('sunset-glow', 'proj1', [idA, idB, idA])).toEqual([idA, idB]);
    expect(await readAsset('proj1', idA)).toEqual(a);
    expect(await readAsset('proj1', idB)).toEqual(b);
  });

  it('skips missing, damaged, oversized and invalid assets without failing, and says what it copied', async () => {
    const a = png(1);
    const idA = assetIdOf(a, 'png');
    const damagedId = assetIdOf(png(3), 'png');
    const bomb = png(5, 64, { width: 40000, height: 40000 });
    const bombId = assetIdOf(bomb, 'png');
    await saveUserTemplate(makeTemplate(), null, { [idA]: a });
    await mem.write(`templates/sunset-glow/assets/${damagedId}`, png(4));
    await mem.write(`templates/sunset-glow/assets/${bombId}`, bomb);
    const copied = await copyTemplateAssets('sunset-glow', 'proj1', [assetIdOf(png(2), 'png'), damagedId, bombId, 'bogus', idA]);
    expect(copied).toEqual([idA]);
    expect((await mem.list('projects/proj1/assets')).map((e) => e.name)).toEqual([idA]);
  });

  it('does not rewrite assets the project already has', async () => {
    const a = png(1);
    const idA = assetIdOf(a, 'png');
    await saveUserTemplate(makeTemplate(), null, { [idA]: a });
    await mem.putAsset('proj1', a, 'png');
    const writes: string[] = [];
    setPlatform({
      ...mem,
      write: async (path, data) => {
        writes.push(path);
        await mem.write(path, data);
      },
    });
    expect(await copyTemplateAssets('sunset-glow', 'proj1', [idA])).toEqual([idA]);
    expect(writes).toEqual([]);
  });

  it('does nothing for an empty list and validates ids', async () => {
    expect(await copyTemplateAssets('sunset-glow', 'proj1', [])).toEqual([]);
    expect(mem.testing.files().size).toBe(0);
    expect(await errorOf(copyTemplateAssets('../t', 'proj1', []))).toMatchObject({ code: 'invalid_path' });
    expect(await errorOf(copyTemplateAssets('t', 'a/b', []))).toMatchObject({ code: 'invalid_path' });
  });
});

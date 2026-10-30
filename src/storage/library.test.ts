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

import type { ImageElement, Project, ShapeElement } from '../model/types';
import { ValidationError, validateProject } from '../model/validate';
import { PlatformError, THUMBNAIL_LIMITS, createMemoryPlatform, imageWithinLimits, readImageSize, setPlatform, type MemoryPlatform, type Platform } from '../platform';
import {
  StorageError,
  deleteProject,
  duplicateProject,
  exportProjectArchive,
  listProjects,
  loadProject,
  metaOf,
  pruneAssets,
  putProjectAsset,
  readAsset,
  readThumbnail,
  saveProject,
  thumbnailVersion,
  writeThumbnail,
} from './index';
import { stampThumbnail } from './library';
import { unzipSync } from 'fflate';
import { assetIdOf, imageFill, jpeg, makeProject, makeSlide, png, webp } from './fixtures.node';

const info = (id: string, name = 'shot.png') => ({ id, name, width: 4, height: 4, bytes: 64, addedAt: 1 });
const shot = (id: string) => ({ iphone: { main: { 'en-US': id } } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

let mem: MemoryPlatform;
beforeEach(() => {
  mem = createMemoryPlatform();
  setPlatform(mem);
  vi.mocked(validateProject).mockClear();
});

/** A platform that behaves like `mem` except for the overridden methods. */
function wrap(overrides: Partial<Platform>): Platform {
  const p: Platform = { ...mem, ...overrides };
  setPlatform(p);
  return p;
}

describe('saveProject and loadProject', () => {
  it('round-trips a project through project.json and writes meta.json', async () => {
    const project = makeProject({ name: 'متتبع العادات 😀' });
    await saveProject(project);
    expect(await loadProject('proj1')).toEqual(project);
    expect(validateProject).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await mem.readText('projects/proj1/meta.json'))!)).toEqual(metaOf(project));
    expect(metaOf(project)).toEqual({
      id: 'proj1',
      name: 'متتبع العادات 😀',
      updatedAt: 2_000,
      createdAt: 1_000,
      slideCount: 2,
      families: ['iphone'],
      languages: ['en-US', 'ar-SA'],
      templateId: null,
    });
  });

  it('writes project.json first, then meta.json', async () => {
    const written: string[] = [];
    wrap({
      write: async (path, data) => {
        written.push(path);
        await mem.write(path, data);
      },
    });
    await saveProject(makeProject());
    expect(written).toEqual(['projects/proj1/project.json', 'projects/proj1/meta.json']);
  });

  it('does not change updatedAt', async () => {
    await saveProject(makeProject({ updatedAt: 1234 }));
    expect((await loadProject('proj1')).updatedAt).toBe(1234);
  });

  it('throws not_found for a missing project', async () => {
    const e = await errorOf(loadProject('nope'));
    expect(e).toBeInstanceOf(StorageError);
    expect((e as StorageError).code).toBe('not_found');
    expect((e as Error).message).toMatch(/nope/);
  });

  it('throws corrupt for invalid JSON', async () => {
    await mem.write('projects/bad/project.json', '{"format": "wajha.project",');
    const e = await errorOf(loadProject('bad'));
    expect((e as StorageError).code).toBe('corrupt');
    expect((e as Error).message).toMatch(/not valid JSON/);
  });

  it('throws corrupt with the validator message when validation fails', async () => {
    await saveProject(makeProject());
    vi.mocked(validateProject).mockImplementationOnce(() => {
      throw new ValidationError('slides[0].id', 'must be a string');
    });
    const e = await errorOf(loadProject('proj1'));
    expect((e as StorageError).code).toBe('corrupt');
    expect((e as Error).message).toMatch(/slides\[0\]\.id: must be a string/);
    expect((e as Error).cause).toBeInstanceOf(ValidationError);
  });

  it('rejects ids that are not a single path segment', async () => {
    for (const id of ['../x', 'a/b', '', '..', 'a\\b']) {
      expect(await errorOf(loadProject(id))).toMatchObject({ code: 'invalid_path' });
      expect(await errorOf(saveProject(makeProject({ id })))).toBeInstanceOf(PlatformError);
    }
    expect(mem.testing.files().size).toBe(0);
  });

  it('trusts the folder name over the id inside project.json', async () => {
    await mem.write('projects/real/project.json', JSON.stringify(makeProject({ id: 'other' })));
    expect((await loadProject('real')).id).toBe('real');
  });

  it('keeps saves in call order when writes complete out of order', async () => {
    let first = true;
    wrap({
      write: async (path, data) => {
        if (first && path.endsWith('project.json')) {
          first = false;
          await sleep(30);
        }
        await mem.write(path, data);
      },
    });
    const older = saveProject(makeProject({ name: 'older', updatedAt: 1 }));
    const newer = saveProject(makeProject({ name: 'newer', updatedAt: 2 }));
    await Promise.all([older, newer]);
    expect((await loadProject('proj1')).name).toBe('newer');
    expect((await listProjects())[0].name).toBe('newer');
  });

  it('a failed save does not block the next one', async () => {
    let fail = true;
    wrap({
      write: async (path, data) => {
        if (fail) {
          fail = false;
          throw new PlatformError('io', 'disk full');
        }
        await mem.write(path, data);
      },
    });
    expect(await errorOf(saveProject(makeProject({ name: 'a' })))).toMatchObject({ code: 'io' });
    await saveProject(makeProject({ name: 'b' }));
    expect((await loadProject('proj1')).name).toBe('b');
  });

  it('a load waits for a pending save', async () => {
    await saveProject(makeProject({ name: 'v1' }));
    wrap({
      write: async (path, data) => {
        await sleep(10);
        await mem.write(path, data);
      },
    });
    const saving = saveProject(makeProject({ name: 'v2' }));
    expect((await loadProject('proj1')).name).toBe('v2');
    await saving;
  });
});

describe('listProjects', () => {
  it('is empty for a new library', async () => {
    expect(await listProjects()).toEqual([]);
  });

  it('sorts by updatedAt, newest first', async () => {
    await saveProject(makeProject({ id: 'a', name: 'A', updatedAt: 10 }));
    await saveProject(makeProject({ id: 'b', name: 'B', updatedAt: 30 }));
    await saveProject(makeProject({ id: 'c', name: 'C', updatedAt: 20 }));
    await saveProject(makeProject({ id: 'd', name: 'D', updatedAt: 20, createdAt: 5_000 }));
    expect((await listProjects()).map((m) => m.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('reads meta.json only, without validating project.json', async () => {
    await saveProject(makeProject());
    vi.mocked(validateProject).mockClear();
    expect(await listProjects()).toHaveLength(1);
    expect(validateProject).not.toHaveBeenCalled();
  });

  it('rebuilds a missing meta.json from project.json and stores it', async () => {
    const project = makeProject({ id: 'nometa' });
    await mem.write('projects/nometa/project.json', JSON.stringify(project));
    expect(await listProjects()).toEqual([metaOf(project)]);
    expect(JSON.parse((await mem.readText('projects/nometa/meta.json'))!)).toEqual(metaOf(project));
  });

  it('rebuilds damaged or inconsistent meta.json files', async () => {
    const cases: Record<string, string> = {
      broken: '{"id": ',
      wrongid: JSON.stringify({ ...metaOf(makeProject()), id: 'someone-else' }),
      wrongtypes: JSON.stringify({ ...metaOf(makeProject({ id: 'wrongtypes' })), slideCount: -1 }),
      notobject: '[1,2,3]',
    };
    for (const [id, meta] of Object.entries(cases)) {
      await mem.write(`projects/${id}/project.json`, JSON.stringify(makeProject({ id, name: id })));
      await mem.write(`projects/${id}/meta.json`, meta);
    }
    const listed = await listProjects();
    expect(listed.map((m) => m.id).sort()).toEqual(['broken', 'notobject', 'wrongid', 'wrongtypes']);
    for (const m of listed) expect(m.name).toBe(m.id);
  });

  it('skips broken projects but lists the rest', async () => {
    await saveProject(makeProject({ id: 'good' }));
    await mem.write('projects/onlyassets/assets/x.png', png(1));
    await mem.write('projects/badjson/project.json', 'not json');
    await mem.write('projects/invalid/project.json', JSON.stringify({ format: 'wajha.project' }));
    await mem.write('projects/stray.txt', 'a file, not a project');
    vi.mocked(validateProject).mockImplementation((json) => {
      if ((json as { id?: string }).id === undefined) throw new ValidationError('id', 'missing');
      return json as Project;
    });
    try {
      expect((await listProjects()).map((m) => m.id)).toEqual(['good']);
    } finally {
      vi.mocked(validateProject).mockImplementation((json) => json as Project);
    }
  });

  it('skips folders whose names are not project ids', async () => {
    await saveProject(makeProject({ id: 'good' }));
    await mem.write('projects/My Folder/project.json', JSON.stringify(makeProject({ id: 'My Folder' })));
    await mem.write('projects/My Folder/meta.json', JSON.stringify(metaOf(makeProject({ id: 'My Folder' }))));
    expect((await listProjects()).map((m) => m.id)).toEqual(['good']);
  });

  it('drops unknown families from meta.json', async () => {
    await saveProject(makeProject());
    const meta = JSON.parse((await mem.readText('projects/proj1/meta.json'))!);
    await mem.write('projects/proj1/meta.json', JSON.stringify({ ...meta, families: ['iphone', 'toaster', 3] }));
    expect((await listProjects())[0].families).toEqual(['iphone']);
  });

  it('still lists when repairing meta.json fails', async () => {
    const project = makeProject({ id: 'ro' });
    await mem.write('projects/ro/project.json', JSON.stringify(project));
    wrap({
      write: async () => {
        throw new PlatformError('permission', 'read-only');
      },
    });
    expect(await listProjects()).toEqual([metaOf(project)]);
  });

  it('handles many projects', async () => {
    for (let i = 0; i < 60; i++) await saveProject(makeProject({ id: `p${i}`, updatedAt: i }));
    const listed = await listProjects();
    expect(listed).toHaveLength(60);
    expect(listed[0].id).toBe('p59');
    expect(listed[59].id).toBe('p0');
  });
});

describe('deleteProject', () => {
  it('removes the whole folder and nothing else', async () => {
    await saveProject(makeProject({ id: 'a' }));
    await saveProject(makeProject({ id: 'ab' }));
    await mem.write('projects/a/assets/x.png', png(1));
    await writeThumbnail('a', jpeg(1), 2_000);
    await deleteProject('a');
    expect((await listProjects()).map((m) => m.id)).toEqual(['ab']);
    expect([...mem.testing.files().keys()].some((k) => k.startsWith('projects/a/'))).toBe(false);
  });

  it('is a no-op for a missing project', async () => {
    await deleteProject('ghost');
  });

  it('ignores saves and thumbnails that arrive after the delete', async () => {
    await saveProject(makeProject());
    await deleteProject('proj1');
    await saveProject(makeProject({ name: 'late autosave' }));
    await writeThumbnail('proj1', jpeg(2), 2_000);
    expect(mem.testing.files().size).toBe(0);
    expect(await listProjects()).toEqual([]);
  });

  it('keeps the project savable when the delete fails', async () => {
    await saveProject(makeProject());
    wrap({
      remove: async () => {
        throw new PlatformError('permission', 'locked');
      },
    });
    expect(await errorOf(deleteProject('proj1'))).toMatchObject({ code: 'permission' });
    setPlatform(mem);
    await saveProject(makeProject({ name: 'still here' }));
    expect((await loadProject('proj1')).name).toBe('still here');
  });

  it('remembers deletes per platform', async () => {
    await deleteProject('proj1');
    const fresh = createMemoryPlatform();
    setPlatform(fresh);
    await saveProject(makeProject());
    expect((await loadProject('proj1')).id).toBe('proj1');
  });
});

describe('duplicateProject', () => {
  it('copies project.json, the assets it uses and the thumbnail under a new id', async () => {
    const a = png(1);
    const b = webp(2);
    const idA = await mem.putAsset('proj1', a, 'png');
    const idB = await mem.putAsset('proj1', b, 'webp');
    // Replaced earlier: still in the registry (for undo), used by nothing.
    const replaced = await mem.putAsset('proj1', png(3), 'png');
    const project = makeProject({
      theme: { ...makeProject().theme, background: { fill: imageFill(idB), pattern: null } },
      slides: [makeSlide('s1', { shots: shot(idA) })],
      assets: { [idA]: info(idA), [idB]: info(idB), [replaced]: info(replaced) },
    });
    await saveProject(project);
    await mem.write('projects/proj1/assets/notes.txt', 'not an asset');
    await writeThumbnail('proj1', jpeg(3), project.updatedAt);

    const before = Date.now();
    const meta = await duplicateProject('proj1', 'Habit tracker (copy)');
    expect(meta.id).not.toBe('proj1');
    expect(meta.name).toBe('Habit tracker (copy)');
    expect(meta.createdAt).toBeGreaterThanOrEqual(before);
    expect(meta.updatedAt).toBe(meta.createdAt);

    const copy = await loadProject(meta.id);
    const { [replaced]: _dropped, ...kept } = project.assets;
    expect(copy).toEqual({ ...project, assets: kept, id: meta.id, name: 'Habit tracker (copy)', createdAt: meta.createdAt, updatedAt: meta.updatedAt });
    expect(await readAsset(meta.id, idA)).toEqual(a);
    expect(await readAsset(meta.id, idB)).toEqual(b);
    expect(await readAsset(meta.id, replaced)).toBeNull();
    expect(await mem.read(`projects/${meta.id}/assets/notes.txt`)).toBeNull();
    // The same picture, now saying it shows the copy's version.
    expect(await readThumbnail(meta.id)).toEqual(stampThumbnail(jpeg(3), meta.updatedAt));
    expect((await listProjects()).map((m) => m.id).sort()).toEqual([meta.id, 'proj1'].sort());
  });

  it('is a deep copy: editing the duplicate leaves the original alone', async () => {
    await saveProject(makeProject());
    const meta = await duplicateProject('proj1', 'Copy');
    const copy = await loadProject(meta.id);
    copy.slides[0].texts['en-US'].headline = 'Changed';
    copy.theme.palette.push('#000000');
    await saveProject(copy);
    const original = await loadProject('proj1');
    expect(original.slides[0].texts['en-US'].headline).toBe('Slide s1');
    expect(original.theme.palette).toEqual(['#ffffff', '#7c5cff']);
  });

  it('names a blank copy after the source and limits long names', async () => {
    await saveProject(makeProject());
    expect((await duplicateProject('proj1', '   ')).name).toBe('Habit tracker copy');
    const long = await duplicateProject('proj1', '😀'.repeat(300));
    expect(Array.from(long.name)).toHaveLength(200);
  });

  it('removes the partial copy when something fails', async () => {
    await saveProject(makeProject());
    await mem.putAsset('proj1', png(1), 'png');
    await writeThumbnail('proj1', jpeg(1), 2_000);
    wrap({
      write: async (path, data) => {
        if (path.endsWith('thumb.jpg')) throw new PlatformError('io', 'disk full');
        await mem.write(path, data);
      },
    });
    expect(await errorOf(duplicateProject('proj1', 'Copy'))).toMatchObject({ code: 'io' });
    expect([...mem.testing.files().keys()].every((k) => k.startsWith('projects/proj1/'))).toBe(true);
  });

  it('fails clearly for a missing project', async () => {
    expect(await errorOf(duplicateProject('ghost', 'Copy'))).toMatchObject({ code: 'not_found' });
  });

  it('copies a thumbnail that had fallen behind the source as it is, so the home screen draws the copy again', async () => {
    await saveProject(makeProject({ updatedAt: 2_000 }));
    await writeThumbnail('proj1', jpeg(3), 1_500);
    const meta = await duplicateProject('proj1', 'Copy');
    expect(await readThumbnail(meta.id)).toEqual(stampThumbnail(jpeg(3), 1_500));
    expect(thumbnailVersion((await readThumbnail(meta.id))!)).not.toBe(meta.updatedAt);
  });
});

describe('thumbnails and assets', () => {
  it('writes and reads thumbnails, null when missing', async () => {
    expect(await readThumbnail('proj1')).toBeNull();
    await writeThumbnail('proj1', jpeg(5), 2_000);
    expect(await readThumbnail('proj1')).toEqual(stampThumbnail(jpeg(5), 2_000));
    expect(thumbnailVersion((await readThumbnail('proj1'))!)).toBe(2_000);
  });

  it('treats a thumbnail that is not a small image as missing, so the home screen draws a new one', async () => {
    // About 5 KB of PNG declaring 30000 x 30000 pixels: an <img> of it costs gigabytes.
    await mem.write('projects/proj1/thumb.jpg', png(1, 64, { width: 30000, height: 30000 }));
    expect(await readThumbnail('proj1')).toBeNull();
    await mem.write('projects/proj1/thumb.jpg', new TextEncoder().encode('not an image'));
    expect(await readThumbnail('proj1')).toBeNull();
    await mem.write('projects/proj1/thumb.jpg', jpeg(1, 64, { width: 1401, height: 244 }));
    expect(await readThumbnail('proj1')).toEqual(jpeg(1, 64, { width: 1401, height: 244 }));
  });

  it('stores assets through the project queue, and never into a deleted project', async () => {
    const id = await putProjectAsset('proj1', png(4), 'png');
    expect(id).toBe(assetIdOf(png(4), 'png'));
    expect(await readAsset('proj1', id)).toEqual(png(4));
    await deleteProject('proj1');
    expect(await errorOf(putProjectAsset('proj1', png(5), 'png'))).toMatchObject({ code: 'not_found' });
    expect(mem.testing.files().size).toBe(0);
    expect(await errorOf(putProjectAsset('../x', png(5), 'png'))).toMatchObject({ code: 'invalid_path' });
  });

  it('reads assets by id and refuses anything else', async () => {
    const id = await mem.putAsset('proj1', png(9), 'png');
    expect(await readAsset('proj1', id)).toEqual(png(9));
    expect(await readAsset('proj1', `${'0'.repeat(64)}.png`)).toBeNull();
    await saveProject(makeProject());
    expect(await readAsset('proj1', '../project.json')).toBeNull();
    expect(await readAsset('proj1', 'project.json')).toBeNull();
    expect(await errorOf(readAsset('../proj1', id))).toMatchObject({ code: 'invalid_path' });
  });
});

describe('thumbnail versions', () => {
  /** A JPEG as browsers encode one: SOI, the given header segments, SOS, scan data, EOI. */
  function encoded(segments: [marker: number, payload: number[]][]): Uint8Array {
    const bytes = [0xff, 0xd8];
    for (const [marker, payload] of segments) bytes.push(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload);
    bytes.push(0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0xd9);
    return Uint8Array.from(bytes);
  }
  const text = (s: string) => Array.from(new TextEncoder().encode(s));
  const sof = [8, 0x01, 0x08, 0x01, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]; // 384 x 264
  /** The header segments, in file order. */
  function headers(bytes: Uint8Array): { marker: number; start: number; end: number }[] {
    const out: { marker: number; start: number; end: number }[] = [];
    for (let at = 2; bytes[at] === 0xff && bytes[at + 1] !== 0xda; at = out[out.length - 1].end) {
      out.push({ marker: bytes[at + 1], start: at, end: at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]) });
    }
    return out;
  }
  const markers = (bytes: Uint8Array) => headers(bytes).map((s) => s.marker);

  it('records the version after the APPn headers and leaves the picture intact', () => {
    // WebKit's encoder: JFIF, Exif and Photoshop headers, then the frame.
    const original = encoded([
      [0xe0, text('JFIF\0')],
      [0xe1, text('Exif\0\0')],
      [0xed, text('Photoshop 3.0\0')],
      [0xc0, sof],
      [0xdb, [0, ...Array<number>(64).fill(1)]],
    ]);
    const stamped = stampThumbnail(original, 1_793_415_548_176);
    expect(markers(stamped)).toEqual([0xe0, 0xe1, 0xed, 0xfe, 0xc0, 0xdb]);
    expect(thumbnailVersion(stamped)).toBe(1_793_415_548_176);
    expect(thumbnailVersion(original)).toBeNull();
    // The comment is all that was added.
    const comment = headers(stamped).find((h) => h.marker === 0xfe)!;
    expect(Uint8Array.from([...stamped.subarray(0, comment.start), ...stamped.subarray(comment.end)])).toEqual(original);
    expect(readImageSize(stamped, 'jpg')).toEqual({ width: 384, height: 264 });
    expect(imageWithinLimits(stamped, THUMBNAIL_LIMITS)).toBe(true);
  });

  it('replaces an earlier version instead of adding a second one', () => {
    const once = stampThumbnail(jpeg(1, 64, { width: 384, height: 264 }), 1_000);
    const twice = stampThumbnail(once, 2_000);
    expect(thumbnailVersion(twice)).toBe(2_000);
    expect(markers(twice).filter((m) => m === 0xfe)).toHaveLength(1);
    expect(twice.length).toBe(once.length);
    expect(stampThumbnail(twice, 1_000)).toEqual(once);
  });

  it('round-trips every timestamp the model allows', () => {
    for (const v of [0, 1, 2_000, Date.now(), 8.64e15]) expect(thumbnailVersion(stampThumbnail(jpeg(2), v))).toBe(v);
  });

  it('says nothing for other comments, malformed versions, damaged headers or other formats', () => {
    expect(thumbnailVersion(encoded([[0xfe, text('Created with GIMP')], [0xc0, sof]]))).toBeNull();
    expect(thumbnailVersion(encoded([[0xfe, text('wajha-version:')], [0xc0, sof]]))).toBeNull();
    expect(thumbnailVersion(encoded([[0xfe, text('wajha-version: 12')], [0xc0, sof]]))).toBeNull();
    expect(thumbnailVersion(encoded([[0xfe, text('wajha-version:0x1f')], [0xc0, sof]]))).toBeNull();
    // A comment after the image data is not a header.
    expect(thumbnailVersion(Uint8Array.from([...encoded([[0xc0, sof]]), 0xff, 0xfe, 0, 18, ...text('wajha-version:12')]))).toBeNull();
    // A segment longer than the file: nothing is read past it, and nothing is stamped.
    const damaged = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x40, 0x00, 1, 2, 3]);
    expect(thumbnailVersion(damaged)).toBeNull();
    expect(stampThumbnail(damaged, 5)).toBe(damaged);
    expect(stampThumbnail(png(1), 5)).toEqual(png(1));
    expect(thumbnailVersion(png(1))).toBeNull();
    expect(thumbnailVersion(new Uint8Array(0))).toBeNull();
  });

  it('skips fill bytes before a marker', () => {
    const filled = Uint8Array.from([0xff, 0xd8, 0xff, ...stampThumbnail(jpeg(3), 7).subarray(2)]);
    expect(thumbnailVersion(filled)).toBe(7);
  });

  it('writeThumbnail stamps the bytes it writes; a thumbnail without a version still reads as an image', async () => {
    await writeThumbnail('proj1', jpeg(4, 64, { width: 384, height: 264 }), 3_000);
    expect(thumbnailVersion((await readThumbnail('proj1'))!)).toBe(3_000);
    await mem.write('projects/proj1/thumb.jpg', jpeg(4, 64, { width: 384, height: 264 }));
    const unversioned = await readThumbnail('proj1');
    expect(unversioned).not.toBeNull();
    expect(thumbnailVersion(unversioned!)).toBeNull();
  });
});

describe('pruneAssets', () => {
  async function store(n: number) {
    const bytes = png(n);
    return mem.putAsset('proj1', bytes, 'png');
  }

  it('removes the files the saved project does not use and keeps every kind of reference', async () => {
    const [shotEn, shotAr, themeBg, slideBg, shapeFill, imageEl, registered, unusedA, unusedB] = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(store),
    );
    const shape: ShapeElement = {
      id: 'sh',
      kind: 'shape',
      shape: 'blob',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      opacity: 1,
      width: 0.4,
      height: 0.4,
      fill: imageFill(shapeFill),
      radius: 0,
      stroke: 0,
      blur: 0,
      seed: 1,
    };
    const image: ImageElement = { id: 'im', kind: 'image', assetId: imageEl, x: 0.5, y: 0.2, rotation: 0, opacity: 1, width: 0.3, cornerRadius: 0.1, shadow: null };
    const project = makeProject({
      theme: { ...makeProject().theme, background: { fill: imageFill(themeBg), pattern: null } },
      slides: [
        makeSlide('s1', {
          shots: { iphone: { main: { 'en-US': shotEn, 'ar-SA': shotAr } } },
          layouts: { iphone: { background: { fill: imageFill(slideBg), pattern: null }, elements: [shape, image] } },
        }),
      ],
      assets: { [shotEn]: info(shotEn), [registered]: info(registered, 'logo.png') },
    });
    await saveProject(project);
    await mem.write('projects/proj1/assets/notes.txt', 'keep me');
    await mem.write('projects/proj1/assets/sub/inner.png', 'keep me too');

    // The registry describes files; an entry nothing uses is a replaced image, removed with its file.
    expect(await pruneAssets(project)).toBe(3);
    const left = (await mem.list('projects/proj1/assets')).map((e) => e.name).sort();
    expect(left).toEqual([shotEn, shotAr, themeBg, slideBg, shapeFill, imageEl, 'notes.txt', 'sub'].sort());
    expect(left).not.toContain(unusedA);
    expect(left).not.toContain(unusedB);
    expect(left).not.toContain(registered);
    const saved = await loadProject('proj1');
    expect(Object.keys(saved.assets)).toEqual([shotEn]);
    expect(saved).toEqual({ ...project, assets: { [shotEn]: info(shotEn) } });
    expect(await pruneAssets(saved)).toBe(0);
  });

  it('returns 0 for a project without an assets folder', async () => {
    await saveProject(makeProject());
    expect(await pruneAssets(makeProject())).toBe(0);
  });

  it('deletes screenshots replaced during a session, so they stay out of storage and .wajha files', async () => {
    // Five rounds of "drop a newer screenshot on the same device".
    let project = makeProject();
    for (let i = 0; i < 5; i++) {
      const id = await putProjectAsset('proj1', png(10 + i), 'png');
      project = { ...project, updatedAt: project.updatedAt + 1, assets: { ...project.assets, [id]: info(id) }, slides: [makeSlide('s1', { shots: shot(id) })] };
      await saveProject(project);
    }
    const current = assetIdOf(png(14), 'png');
    expect(Object.keys(project.assets)).toHaveLength(5);
    expect(await pruneAssets(project)).toBe(4);
    expect((await mem.list('projects/proj1/assets')).map((e) => e.name)).toEqual([current]);
    expect(Object.keys((await loadProject('proj1')).assets)).toEqual([current]);
    const archive = unzipSync(await exportProjectArchive('proj1'));
    expect(Object.keys(archive).filter((name) => name.startsWith('assets/'))).toEqual([`assets/${current}`]);
  });

  it('does nothing when project.json changed since (the project was reopened and edited)', async () => {
    const old = await store(1);
    const current = await store(2);
    const closing = makeProject({ slides: [makeSlide('s1', { shots: shot(old) })], assets: { [old]: info(old) } });
    await saveProject({ ...closing, updatedAt: closing.updatedAt + 10, slides: [makeSlide('s1', { shots: shot(current) })], assets: { [old]: info(old), [current]: info(current) } });
    expect(await pruneAssets(closing)).toBe(0);
    expect(await readAsset('proj1', old)).not.toBeNull();
    expect(await readAsset('proj1', current)).not.toBeNull();
  });

  it('does nothing while the project is open again, and never on a missing or damaged project.json', async () => {
    const used = await store(1);
    const replaced = await store(2);
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(used) })], assets: { [used]: info(used), [replaced]: info(replaced) } });
    expect(await pruneAssets(project)).toBe(0);
    await saveProject(project);
    expect(await pruneAssets(project, { isOpen: () => true })).toBe(0);
    expect(Object.keys((await loadProject('proj1')).assets)).toHaveLength(2);
    await mem.write('projects/proj1/project.json', '{broken');
    expect(await pruneAssets(project)).toBe(0);
    expect(await readAsset('proj1', replaced)).not.toBeNull();
  });

  it('asks whether the project is open again only once project.json has been read', async () => {
    const used = await store(1);
    await store(2);
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(used) })] });
    await saveProject(project);
    let open = false;
    const pending = pruneAssets(project, { isOpen: () => open });
    // A reopen that lands while the prune waits for its turn wins.
    open = true;
    expect(await pending).toBe(0);
    open = false;
    expect(await pruneAssets(project, { isOpen: () => open })).toBe(1);
  });

  it('an import racing with a prune keeps its file, even when it reuses one the prune deletes', async () => {
    const replaced = png(2);
    const replacedId = await mem.putAsset('proj1', replaced, 'png');
    const used = await store(1);
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(used) })], assets: { [used]: info(used), [replacedId]: info(replacedId) } });
    await saveProject(project);
    // The user drops the old screenshot again right after reopening.
    const [removed, id] = await Promise.all([pruneAssets(project), putProjectAsset('proj1', replaced, 'png')]);
    expect(removed).toBe(1);
    expect(id).toBe(replacedId);
    expect(await readAsset('proj1', replacedId)).toEqual(replaced);
  });

  it('keeps ids that appear anywhere, including other families and languages', async () => {
    const kept = await store(20);
    const dropped = await store(21);
    const project = makeProject({
      families: ['iphone', 'android-phone'],
      slides: [makeSlide('s1', { shots: { 'android-phone': { main: { 'ar-SA': kept } } } })],
    });
    await saveProject(project);
    expect(await pruneAssets(project)).toBe(1);
    expect(await readAsset('proj1', kept)).not.toBeNull();
    expect(await readAsset('proj1', dropped)).toBeNull();
  });

  it('treats JPEG and WebP the same way', async () => {
    const j = await mem.putAsset('proj1', jpeg(1), 'jpg');
    const w = await mem.putAsset('proj1', webp(1), 'webp');
    expect(j).toBe(assetIdOf(jpeg(1), 'jpg'));
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(w) })], assets: { [j]: info(j), [w]: info(w) } });
    await saveProject(project);
    expect(await pruneAssets(project)).toBe(1);
    expect(await readAsset('proj1', w)).not.toBeNull();
    expect(await readAsset('proj1', j)).toBeNull();
  });
});

describe('loadProject with pruneAssets', () => {
  it('prunes the saved project before returning it (opening it in the editor)', async () => {
    const used = await mem.putAsset('proj1', png(1), 'png');
    const replaced = await mem.putAsset('proj1', png(2), 'png');
    // Left by a session that ended without closing the project (the app quit).
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(used) })], assets: { [used]: info(used), [replaced]: info(replaced) } });
    await saveProject(project);
    expect(Object.keys((await loadProject('proj1')).assets)).toHaveLength(2);
    expect(await readAsset('proj1', replaced)).not.toBeNull();

    const opened = await loadProject('proj1', { pruneAssets: true });
    expect(Object.keys(opened.assets)).toEqual([used]);
    expect(await readAsset('proj1', replaced)).toBeNull();
    expect(await loadProject('proj1')).toEqual(opened);
    expect(opened.updatedAt).toBe(project.updatedAt);
  });

  it('still opens the project when pruning fails', async () => {
    const used = await mem.putAsset('proj1', png(1), 'png');
    const replaced = await mem.putAsset('proj1', png(2), 'png');
    const project = makeProject({ slides: [makeSlide('s1', { shots: shot(used) })], assets: { [used]: info(used), [replaced]: info(replaced) } });
    await saveProject(project);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    wrap({
      write: async () => {
        throw new PlatformError('io', 'disk full');
      },
    });
    expect(await loadProject('proj1', { pruneAssets: true })).toEqual(project);
    expect(warn).toHaveBeenCalledWith('[storage] could not prune unused images', expect.any(PlatformError));
    warn.mockRestore();
  });
});

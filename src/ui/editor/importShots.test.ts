/**
 * Where imported screenshots land, what is kept, and what the user is told,
 * against the real editor store (the importer itself is faked).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetInfo, Project } from '../../model/types';
import type { ImportFile, ImportReport } from '../../runtime';

const fake = vi.hoisted(() => ({
  importImagesWithReport: vi.fn<(projectId: string, files: readonly ImportFile[]) => Promise<ImportReport>>(),
  pickAndImportImagesWithReport: vi.fn<(projectId: string) => Promise<ImportReport>>(),
}));
vi.mock('../../runtime', () => fake);

import { FAMILIES } from '../../model/catalog';
import { blankProject } from '../../model/defaults';
import { assetInfo } from '../../model/fixtures.node';
import { resolveLayout } from '../../model/resolve';
import { MAX_SLIDES, useApp, useEditor } from '../../store';
import { collectDrop, importScreenshots, pickScreenshotsForSlot, shotRoom } from './importShots';

const ed = () => useEditor.getState();
const toasts = () => useApp.getState().toasts.map((t) => ({ kind: t.kind, title: t.title, description: t.description }));

/** A file whose name says what the fake importer does with it: "bad" files are skipped, the rest become asset n. */
const file = (n: number, bad = false): ImportFile => ({ name: bad ? `bad-${n}.txt` : `shot-${n}.png`, data: new Uint8Array([n]) });
const files = (count: number, from = 1) => Array.from({ length: count }, (_, i) => file(from + i));

function importerFake(): void {
  fake.importImagesWithReport.mockImplementation(async (_id, list) => {
    const report: ImportReport = { assets: [], skipped: [] };
    for (const f of list) {
      if (f.name.startsWith('bad')) report.skipped.push({ name: f.name, reason: 'unsupported', message: 'Only PNG, JPEG and WebP images can be imported' });
      else report.assets.push(assetInfo(Number(/\d+/.exec(f.name)?.[0] ?? 0)));
    }
    return report;
  });
}

/** An iPhone + Android project with `count` slides, each with a device. */
function project(count: number): Project {
  const p = blankProject('Import test', ['iphone', 'android-phone'], ['en-US', 'ar-SA']);
  const model = p.slides[0];
  p.slides = Array.from({ length: count }, (_, i) => ({ ...structuredClone(model), id: `s${i + 1}` }));
  return p;
}

const shotsOf = (family = 'iphone') =>
  ed().project!.slides.map((s) => {
    const device = resolveLayout(ed().project!, s, family as 'iphone').elements.find((e) => e.kind === 'device');
    return device && device.kind === 'device' ? (s.shots[family as 'iphone']?.[device.slot]?.['en-US'] ?? null) : null;
  });
const assetCount = () => Object.keys(ed().project!.assets).length;
const slotOf = (i: number) => {
  const device = resolveLayout(ed().project!, ed().project!.slides[i], 'iphone').elements.find((e) => e.kind === 'device');
  return device && device.kind === 'device' ? device.slot : 'main';
};

beforeEach(() => {
  importerFake();
  useApp.getState().clearToasts();
  ed().openProject(project(5));
});

afterEach(() => {
  vi.clearAllMocks();
  ed().closeProject();
  useApp.getState().clearToasts();
});

describe('shotRoom', () => {
  it('agrees with what the store places, new slides and slides without a device included', () => {
    const p = project(12);
    // Slide 3 shows no device.
    const third = p.slides[2];
    for (const f of p.families) third.layouts[f] = { ...third.layouts[f]!, elements: third.layouts[f]!.elements.filter((e) => e.kind !== 'device') };
    for (const count of [3, 9, 12]) {
      for (const start of [0, 2, 5, 9, 10, 11, 12]) {
        const q = structuredClone({ ...p, slides: p.slides.slice(0, count) });
        const many = Array.from({ length: 40 }, (_, i) => assetInfo(i + 1));
        q.assets = Object.fromEntries(many.map((a) => [a.id, a]));
        ed().openProject(q);
        const room = shotRoom(ed().project!, 'iphone', start);
        expect(ed().assignShotsInOrder('iphone', 'en-US', many.map((a) => a.id), start)).toBe(room);
      }
    }
  });

  it('is zero past the store limit', () => {
    ed().openProject(project(12));
    expect(shotRoom(ed().project!, 'iphone', FAMILIES.iphone.maxSlides)).toBe(0);
    expect(shotRoom(ed().project!, 'android-phone', 8)).toBe(0);
    expect(shotRoom(ed().project!, 'iphone', 0)).toBe(10);
    expect(Math.min(FAMILIES.iphone.maxSlides, MAX_SLIDES)).toBe(10);
  });
});

describe('importScreenshots', () => {
  it('fills the slides from the target slot and says how many', async () => {
    const placed = await importScreenshots(files(3), { slideId: 's2', slot: slotOf(1) });
    expect(placed).toBe(3);
    expect(shotsOf().map((id) => (id ? Number.parseInt(id, 16) : null))).toEqual([null, 1, 2, 3, null]);
    expect(toasts()).toEqual([{ kind: 'success', title: '3 screenshots added', description: undefined }]);
  });

  it('puts a screenshot dropped on a slide past the store limit where the highlight shows', async () => {
    ed().openProject(project(12));
    expect(await importScreenshots(files(1), { slideId: 's12', slot: slotOf(11) })).toBe(1);
    expect(shotsOf()[11]).toBe(assetInfo(1).id);
    expect(toasts()).toEqual([{ kind: 'success', title: 'Screenshot added', description: undefined }]);
  });

  it('reads, stores and keeps only as many files as fit, and says why the rest were left out', async () => {
    const placed = await importScreenshots(files(40), { slideId: 's1', slot: slotOf(0) });
    expect(placed).toBe(10);
    // One file at a time, and nothing after the tenth image.
    expect(fake.importImagesWithReport).toHaveBeenCalledTimes(10);
    expect(fake.importImagesWithReport.mock.calls.every(([, list]) => list.length === 1)).toBe(true);
    expect(ed().project!.slides).toHaveLength(10);
    expect(assetCount()).toBe(10);
    expect(toasts()).toEqual([
      { kind: 'warning', title: 'Added 10 of 40 screenshots', description: 'The App Store allows 10 screenshots, so 30 were left out.' },
    ]);
  });

  it('skips unusable files without using up the room, and reports them', async () => {
    const mixed = [file(1), file(2, true), file(3), file(4, true), file(5)];
    expect(await importScreenshots(mixed, { startSlideIndex: 3 })).toBe(5 - 2);
    expect(assetCount()).toBe(3);
    expect(toasts()).toContainEqual({ kind: 'warning', title: 'Skipped 2 files', description: 'Only PNG, JPEG and WebP images can be imported (+1 more)' });
    expect(toasts()).toContainEqual({ kind: 'success', title: '3 screenshots added', description: undefined });
  });

  it('says why when nothing could be placed, without reading any file', async () => {
    ed().openProject(project(12));
    expect(await importScreenshots(files(2), { startSlideIndex: 11 })).toBe(0);
    expect(fake.importImagesWithReport).not.toHaveBeenCalled();
    expect(assetCount()).toBe(0);
    expect(toasts()).toEqual([
      { kind: 'warning', title: 'No screenshots added', description: 'The App Store allows 10 screenshots; slides after 10 are not exported.' },
    ]);
  });

  it('reports a drop with nothing readable (a folder)', async () => {
    fake.importImagesWithReport.mockResolvedValue({ assets: [], skipped: [{ name: 'My Screenshots', reason: 'unreadable', message: 'The file could not be read' }] });
    expect(await importScreenshots([{ name: 'My Screenshots', data: new Uint8Array() }])).toBe(0);
    expect(toasts()).toEqual([{ kind: 'warning', title: 'Skipped My Screenshots', description: 'The file could not be read' }]);
  });

  it('counts a slot that already shows the image as placed', async () => {
    await importScreenshots(files(1), { slideId: 's1', slot: slotOf(0) });
    useApp.getState().clearToasts();
    expect(await importScreenshots(files(1), { slideId: 's1', slot: slotOf(0) })).toBe(1);
    expect(toasts()).toEqual([{ kind: 'success', title: 'Screenshot added', description: undefined }]);
  });

  it('keeps nothing when the project closed during the import', async () => {
    fake.importImagesWithReport.mockImplementation(async () => {
      ed().closeProject();
      return { assets: [assetInfo(1)], skipped: [] };
    });
    expect(await importScreenshots(files(1), { slideId: 's1', slot: 'main' })).toBe(0);
    expect(toasts()).toEqual([]);
  });

  it('reads no more files than fit', async () => {
    ed().openProject(project(9));
    // Slide 9, then a new slide 10; the third file is never read.
    expect(await importScreenshots(files(3), { slideId: 's9', slot: slotOf(8) })).toBe(2);
    expect(fake.importImagesWithReport).toHaveBeenCalledTimes(2);
    expect(assetCount()).toBe(2);
  });

  it('registers only what still fits after the slides changed during the import', async () => {
    ed().openProject(project(12));
    let first = true;
    fake.importImagesWithReport.mockImplementation(async (_id, list) => {
      // While the files are read, the target slide is dragged past the store limit.
      if (first) ed().moveSlide(2, 11);
      first = false;
      return { assets: [assetInfo(Number(/\d+/.exec(list[0].name)?.[0] ?? 0))], skipped: [] };
    });
    expect(await importScreenshots(files(3), { slideId: 's3', slot: slotOf(2) })).toBe(1);
    expect(fake.importImagesWithReport).toHaveBeenCalledTimes(3);
    expect(assetCount()).toBe(1);
    expect(toasts()).toEqual([
      { kind: 'warning', title: 'Added 1 of 3 screenshots', description: 'The App Store allows 10 screenshots, so 2 were left out.' },
    ]);
  });
});

describe('pickScreenshotsForSlot', () => {
  const picked = (count: number): ImportReport => ({ assets: Array.from({ length: count }, (_, i): AssetInfo => assetInfo(i + 1)), skipped: [] });

  it('registers only the picked images that get a place', async () => {
    ed().openProject(project(10));
    fake.pickAndImportImagesWithReport.mockResolvedValue(picked(3));
    expect(await pickScreenshotsForSlot('s10', slotOf(9))).toBe(1);
    expect(assetCount()).toBe(1);
    expect(toasts()).toEqual([
      { kind: 'warning', title: 'Added 1 of 3 screenshots', description: 'The App Store allows 10 screenshots, so 2 were left out.' },
    ]);
  });

  it('places every picked image when there is room', async () => {
    fake.pickAndImportImagesWithReport.mockResolvedValue(picked(2));
    expect(await pickScreenshotsForSlot('s1', slotOf(0))).toBe(2);
    expect(assetCount()).toBe(2);
    expect(toasts()).toEqual([{ kind: 'success', title: '2 screenshots added', description: undefined }]);
  });
});

describe('collectDrop', () => {
  // Just enough of the File and Directory Entries API to describe a dropped tree.
  const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (f: File) => void) => ok(new File(['x'], name)) });
  const dirEntry = (name: string, children: unknown[]) => ({
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let done = false;
      // Browsers hand out a directory in batches and end with an empty one.
      return { readEntries: (ok: (e: unknown[]) => void) => ok(done ? [] : ((done = true), children)) };
    },
  });
  const transfer = (entries: unknown[], files: File[] = []) =>
    ({ files, items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })) }) as unknown as DataTransfer;

  it('reads dropped folders recursively, images only, with the folders each file sat in', async () => {
    const dt = transfer([
      dirEntry('screenshots', [dirEntry('ar-SA', [fileEntry('1.png'), fileEntry('.DS_Store'), fileEntry('notes.txt')]), dirEntry('en-US', [fileEntry('1.jpg')])]),
    ]);
    const out = await collectDrop(dt);
    expect(out.map((d) => [d.folders.join('/'), d.file.name])).toEqual([
      ['screenshots/ar-SA', '1.png'],
      ['screenshots/en-US', '1.jpg'],
    ]);
  });

  it('passes plain files through without reading anything', async () => {
    const a = new File(['x'], 'a.png');
    const out = await collectDrop(transfer([fileEntry('a.png')], [a]));
    expect(out).toEqual([{ file: a, folders: [] }]);
  });
});

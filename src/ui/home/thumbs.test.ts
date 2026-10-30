import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyId, Project } from '../../model/types';

const h = vi.hoisted(() => ({
  loadProject: vi.fn<(id: string) => Promise<Project>>(),
  readThumbnail: vi.fn<(id: string) => Promise<Uint8Array | null>>(),
  writeThumbnail: vi.fn<(id: string, jpeg: Uint8Array, updatedAt: number) => Promise<void>>(),
  renderThumbnail: vi.fn<(project: Project) => Promise<Uint8Array>>(),
  evictProject: vi.fn<(id: string) => void>(),
  projectReleased: vi.fn<(id: string) => Promise<void>>(),
  /** The project open in the editor. */
  open: { project: null as { id: string } | null },
}));
vi.mock('../../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage')>()),
  loadProject: h.loadProject,
  readThumbnail: h.readThumbnail,
  writeThumbnail: h.writeThumbnail,
}));
vi.mock('../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime')>()),
  renderThumbnail: h.renderThumbnail,
  getImageCache: () => ({ evictProject: h.evictProject }),
}));
vi.mock('../../store', () => ({ useEditor: { getState: () => h.open } }));
vi.mock('../shell/session', () => ({ projectReleased: h.projectReleased }));

import { jpeg } from '../../storage/fixtures.node';
import { stampThumbnail } from '../../storage/library';
import { cancelThumbnailRequests, isCurrentThumbnail, requestThumbnail, slideBackgrounds } from './thumbs';

/** A thumbnail as renderThumbnail draws one for three iPhone slides (3 cells of 128 x 264 px), saying it shows `version`. */
const thumb = (version: number | null, size = { width: 384, height: 264 }) => {
  const bytes = jpeg(1, 64, size);
  return version === null ? bytes : stampThumbnail(bytes, version);
};

const project = (id: string, updatedAt: number, families: FamilyId[] = ['iphone']) => ({ id, updatedAt, families }) as Project;

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets the queue run to its end (renders, writes and the pauses between them). */
const drain = () => vi.advanceTimersByTimeAsync(500);

describe('isCurrentThumbnail', () => {
  it('is true only for a picture of this version, in the layout of the first family', () => {
    const p = project('p', 2_000);
    expect(isCurrentThumbnail(thumb(2_000), p)).toBe(true);
    // None, or not saying which version (an older build), or another version (due when the page unloaded).
    expect(isCurrentThumbnail(null, p)).toBe(false);
    expect(isCurrentThumbnail(thumb(null), p)).toBe(false);
    expect(isCurrentThumbnail(thumb(1_999), p)).toBe(false);
    expect(isCurrentThumbnail(thumb(2_001), p)).toBe(false);
  });

  it('is false for a picture the card cannot cut into slides', () => {
    // Drawn for another first family, or in another layout.
    expect(isCurrentThumbnail(thumb(2_000), project('p', 2_000, ['ipad', 'iphone']))).toBe(false);
    expect(isCurrentThumbnail(thumb(2_000, { width: 400, height: 264 }), project('p', 2_000))).toBe(false);
    expect(isCurrentThumbnail(thumb(2_000, { width: 128, height: 264 }), project('p', 2_000))).toBe(true);
  });
});

describe('the thumbnail queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of [h.loadProject, h.readThumbnail, h.writeThumbnail, h.renderThumbnail, h.evictProject, h.projectReleased]) fn.mockReset();
    h.writeThumbnail.mockResolvedValue(undefined);
    h.renderThumbnail.mockResolvedValue(new Uint8Array([0xff, 0xd8]));
    h.projectReleased.mockResolvedValue(undefined);
    h.open.project = null;
  });

  afterEach(() => {
    cancelThumbnailRequests();
    vi.useRealTimers();
  });

  it('draws a thumbnail that shows an older version, recording the version it drew', async () => {
    h.loadProject.mockResolvedValue(project('q1', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    requestThumbnail('q1', 2_000);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.writeThumbnail).toHaveBeenCalledWith('q1', new Uint8Array([0xff, 0xd8]), 2_000);
    expect(h.evictProject).toHaveBeenCalledWith('q1');
  });

  it('draws what is on disk now: the version of project.json, even when the card listed another', async () => {
    h.loadProject.mockResolvedValue(project('q2', 3_000));
    h.readThumbnail.mockResolvedValue(thumb(2_000));
    requestThumbnail('q2', 2_000);
    await drain();
    expect(h.writeThumbnail.mock.calls[0][2]).toBe(3_000);
  });

  it('draws nothing when the thumbnail became current meanwhile (the closing editor drew it)', async () => {
    h.loadProject.mockResolvedValue(project('q3', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(2_000));
    requestThumbnail('q3', 2_000);
    await drain();
    expect(h.renderThumbnail).not.toHaveBeenCalled();
    expect(h.writeThumbnail).not.toHaveBeenCalled();
  });

  it('draws again a thumbnail the card could not show, even one that says it is current', async () => {
    h.loadProject.mockResolvedValue(project('q10', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(2_000));
    requestThumbnail('q10', 2_000, true);
    await drain();
    expect(h.writeThumbnail).toHaveBeenCalledWith('q10', new Uint8Array([0xff, 0xd8]), 2_000);
    // Once per version and session.
    requestThumbnail('q10', 2_000, true);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('draws an outdated picture in another layout once, though both the version and the layout ask for it', async () => {
    h.loadProject.mockResolvedValue(project('q11', 2_000, ['ipad']));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    // The card's hook (another version) and its picture (an iPhone layout on an iPad project) ask together.
    requestThumbnail('q11', 2_000);
    requestThumbnail('q11', 2_000, true);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('waits until a project that just closed is released before it even loads it', async () => {
    const release = deferred();
    h.projectReleased.mockReturnValue(release.promise);
    h.loadProject.mockResolvedValue(project('q4', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    requestThumbnail('q4', 2_000);
    await drain();
    expect(h.projectReleased).toHaveBeenCalledWith('q4');
    expect(h.loadProject).not.toHaveBeenCalled();
    release.resolve();
    await drain();
    expect(h.writeThumbnail).toHaveBeenCalledTimes(1);
  });

  it('gives way to an open editor and draws when asked again', async () => {
    h.loadProject.mockResolvedValue(project('q5', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    h.open.project = { id: 'other' };
    requestThumbnail('q5', 2_000);
    await drain();
    expect(h.loadProject).not.toHaveBeenCalled();
    h.open.project = null;
    requestThumbnail('q5', 2_000);
    await drain();
    expect(h.writeThumbnail).toHaveBeenCalledTimes(1);
  });

  it('never writes the thumbnail of a project that opened in the editor while it was drawn', async () => {
    h.loadProject.mockResolvedValue(project('q6', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    h.renderThumbnail.mockImplementationOnce(async () => {
      h.open.project = { id: 'q6' };
      return new Uint8Array([1]);
    });
    requestThumbnail('q6', 2_000);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    expect(h.writeThumbnail).not.toHaveBeenCalled();
    // Its images belong to the editor now.
    expect(h.evictProject).not.toHaveBeenCalled();
  });

  it('tries each version once per session, so a thumbnail that cannot be drawn is not tried in a loop', async () => {
    h.loadProject.mockResolvedValue(project('q7', 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    h.renderThumbnail.mockRejectedValue(new Error('no slide could be drawn'));
    requestThumbnail('q7', 2_000);
    await drain();
    requestThumbnail('q7', 2_000);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(1);
    // A newer version is worth a new try.
    h.loadProject.mockResolvedValue(project('q7', 3_000));
    requestThumbnail('q7', 3_000);
    await drain();
    expect(h.renderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('works through requests one at a time, and drops the queued ones when the home screen closes', async () => {
    const release = deferred();
    h.projectReleased.mockImplementation((id) => (id === 'q8' ? release.promise : Promise.resolve()));
    h.loadProject.mockImplementation(async (id) => project(id, 2_000));
    h.readThumbnail.mockResolvedValue(thumb(1_000));
    requestThumbnail('q8', 2_000);
    requestThumbnail('q9', 2_000);
    await drain();
    expect(h.loadProject).not.toHaveBeenCalled();
    cancelThumbnailRequests();
    release.resolve();
    await drain();
    expect(h.writeThumbnail.mock.calls.map((c) => c[0])).toEqual(['q8']);
    // The dropped request can be made again.
    requestThumbnail('q9', 2_000);
    await drain();
    expect(h.writeThumbnail.mock.calls.map((c) => c[0])).toEqual(['q8', 'q9']);
  });
});

/** Where the left edge of a slide lands, in source pixels, for a CSS background-position percentage. */
function shownLeft(width: number, slideWidth: number, position: string): number {
  const p = parseFloat(position) / 100;
  // On an element one slide wide, scaled so the element spans slideWidth source px:
  // offset = p * (element - image) = -p * (width - slideWidth) source px.
  return p * (width - slideWidth);
}

describe('slideBackgrounds', () => {
  it('cuts each slide out of a three-slide thumbnail', () => {
    const layout = { slideWidth: 122, slideHeight: 264, lefts: [3, 131, 259] };
    const out = slideBackgrounds(384, layout);
    expect(out).toHaveLength(3);
    // The image is scaled so one slide (122 of 384 px) spans the element, at full height.
    for (const bg of out) expect(bg.backgroundSize).toBe('314.754% 100%');
    for (const [i, bg] of out.entries()) {
      const [x, y] = bg.backgroundPosition.split(' ');
      expect(y).toBe('0%');
      expect(shownLeft(384, 122, x)).toBeCloseTo(layout.lefts[i], 1);
    }
  });

  it('handles a single slide with margins around it', () => {
    const [bg] = slideBackgrounds(432, { slideWidth: 422, slideHeight: 264, lefts: [5] });
    expect(bg.backgroundSize).toBe('102.37% 100%');
    expect(shownLeft(432, 422, bg.backgroundPosition)).toBeCloseTo(5, 1);
  });

  it('never divides by zero', () => {
    expect(slideBackgrounds(100, { slideWidth: 100, slideHeight: 200, lefts: [0] })).toEqual([{ backgroundSize: '100% 100%', backgroundPosition: '0% 0%' }]);
  });
});

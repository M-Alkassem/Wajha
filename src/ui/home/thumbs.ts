/**
 * Project thumbnails for the home screen: thumb.jpg as an object URL (one
 * per card, revoked when it changes or the card unmounts), a small
 * background queue that draws the thumbnail of projects that have none yet
 * (a new project that was never edited), an unusable one, or one that shows
 * an older version of the project, one at a time, and the CSS that cuts a
 * thumbnail into its slides.
 *
 * The editor draws a project's thumbnail a few seconds after each save and
 * when the project closes, but never while the page unloads, and not at all
 * when the app is killed (Dock Quit, logout). thumb.jpg records the version
 * it shows (thumbnailVersion), so a card that lists a newer version keeps
 * the old picture up and asks the queue for a new one.
 */
import { useEffect, useState } from 'react';
import type { Project } from '../../model/types';
import { readImageSize, sniffImageExt } from '../../platform';
import { getImageCache, renderThumbnail, thumbnailLayout, type ThumbnailLayout } from '../../runtime';
import { loadProject, onThumbnailWritten, readThumbnail, thumbnailVersion, writeThumbnail } from '../../storage';
import { useEditor } from '../../store';
import { projectReleased } from '../shell/session';

/* Repair queue ------------------------------------------------------------- */

/**
 * True when thumbnail bytes (from readThumbnail) are what the queue would
 * draw now: they show this version of the project, in the layout of its
 * first family. Pure.
 */
export function isCurrentThumbnail(bytes: Uint8Array | null, project: Pick<Project, 'updatedAt' | 'families'>): boolean {
  if (!bytes || thumbnailVersion(bytes) !== project.updatedAt) return false;
  const ext = sniffImageExt(bytes);
  const size = ext ? readImageSize(bytes, ext) : null;
  return size !== null && thumbnailLayout(size.width, size.height, project.families) !== null;
}

interface Request {
  id: string;
  /** The version the card lists: one request per version. */
  updatedAt: number;
  /** The card could not show the thumbnail on disk at all: draw it again even when it says it is current. */
  unreadable: boolean;
}

const queue: Request[] = [];
/**
 * Versions asked for in this session (drawn, found current, or failed): never
 * twice, so never in a loop. One request per version also covers an
 * `unreadable` one: the first either draws or finds a picture the editor has
 * just drawn.
 */
const attempted = new Set<string>();
let running = false;

const keyOf = ({ id, updatedAt }: Request) => `${id}\u0000${updatedAt}`;

/**
 * Draws and writes the project's thumbnail unless the one on disk is
 * current; the write tells every card (onThumbnailWritten). False when it
 * gave way to the editor (the request may be made again).
 */
async function generate({ id, unreadable }: Request): Promise<boolean> {
  // A project that just closed may still be drawing its last thumbnail and freeing its images.
  await projectReleased(id);
  // Never compete with an open editor (memory, fonts, the image cache).
  if (useEditor.getState().project) return false;
  const project = await loadProject(id);
  // Unless the card could not show it, a request is a hint: draw only what the disk still lacks
  // (the closing editor may have drawn it meanwhile).
  if (!unreadable && isCurrentThumbnail(await readThumbnail(id), project)) return true;
  const jpeg = await renderThumbnail(project);
  if (useEditor.getState().project?.id === id) return false;
  await writeThumbnail(id, jpeg, project.updatedAt);
  // The decoded screenshots were only needed for this one picture.
  getImageCache().evictProject(id);
  return true;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 60));

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const request = queue.shift() as Request;
      const done = await generate(request).catch(() => true);
      // Skipped for the editor: the home screen asks again when it shows the card next time.
      if (!done) attempted.delete(keyOf(request));
      // Leave frames to the UI between renders.
      await pause();
    }
  } finally {
    running = false;
  }
}

/**
 * Asks the queue to look at a project whose card has no usable thumbnail
 * for the version it lists (`updatedAt`), once per version and session.
 * `unreadable`: the card cannot show the thumbnail on disk (another layout,
 * or it does not decode), so it is drawn again whatever it says.
 */
export function requestThumbnail(id: string, updatedAt: number, unreadable = false): void {
  const request = { id, updatedAt, unreadable };
  if (attempted.has(keyOf(request))) return;
  attempted.add(keyOf(request));
  queue.push(request);
  void pump();
}

/** Drops queued renders (the home screen closed); they may be requested again later. */
export function cancelThumbnailRequests(): void {
  for (const request of queue.splice(0)) attempted.delete(keyOf(request));
}

/* Hook ---------------------------------------------------------------------- */

export type ThumbState = 'loading' | 'ready' | 'missing';

export interface ThumbResult {
  url: string | null;
  state: ThumbState;
}

/**
 * The project's thumbnail as an object URL. Reloads when `updatedAt`
 * changes or a new thumbnail is written; when there is none, or it shows
 * another version than `updatedAt`, and the card is `visible`, asks the
 * queue to draw one (an outdated picture stays up meanwhile).
 */
export function useProjectThumbnail(id: string, updatedAt: number, visible: boolean): ThumbResult {
  const [result, setResult] = useState<ThumbResult & { key: string; outdated: boolean }>({ url: null, state: 'loading', key: '', outdated: false });
  const [version, setVersion] = useState(0);
  const key = `${id}\u0000${updatedAt}\u0000${version}`;

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    readThumbnail(id)
      .then((bytes) => {
        if (!alive) return;
        if (!bytes || bytes.byteLength === 0) {
          setResult({ url: null, state: 'missing', key, outdated: false });
          return;
        }
        url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
        setResult({ url, state: 'ready', key, outdated: thumbnailVersion(bytes) !== updatedAt });
      })
      .catch(() => {
        if (alive) setResult({ url: null, state: 'missing', key, outdated: false });
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, updatedAt, key]);

  const needed = result.key === key && (result.state === 'missing' || result.outdated);

  // Pick up every new thumbnail: the editor writes one as a project closes, the queue the others.
  useEffect(
    () =>
      onThumbnailWritten((done) => {
        if (done === id) setVersion((v) => v + 1);
      }),
    [id],
  );

  useEffect(() => {
    if (needed && visible) requestThumbnail(id, updatedAt);
  }, [id, updatedAt, needed, visible]);

  // A stale result (the key changed) shows as loading, never another project's picture.
  if (result.key !== key) return { url: result.state === 'ready' ? result.url : null, state: result.state === 'ready' ? 'ready' : 'loading' };
  return { url: result.url, state: result.state };
}

/* Slides ---------------------------------------------------------------------- */

/** CSS that shows one slide of a thumbnail on an element of that slide's aspect ratio. */
export interface SlideBackground {
  backgroundSize: string;
  backgroundPosition: string;
}

const percent = (fraction: number) => `${Math.round(fraction * 1e5) / 1e3}%`;

/**
 * One background per slide of a decoded thumbnail `width` px wide whose
 * slides sit as in `layout` (see thumbnailLayout): the image scaled so one
 * slide spans the element, shifted to that slide.
 */
export function slideBackgrounds(width: number, layout: ThumbnailLayout): SlideBackground[] {
  const backgroundSize = `${percent(width / layout.slideWidth)} 100%`;
  // A percentage moves the image by that share of (element - image), here the image width beyond one slide.
  const travel = width - layout.slideWidth;
  return layout.lefts.map((left) => ({ backgroundSize, backgroundPosition: `${travel > 0 ? percent(left / travel) : '0%'} 0%` }));
}

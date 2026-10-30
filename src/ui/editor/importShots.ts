/**
 * Screenshot import flows shared by the stage (drag and drop) and the
 * inspector (Replace / Add buttons): store the files as project assets,
 * register them in the project and put them into device slots, then tell the
 * user what happened.
 *
 * Only images that get a place are kept: a drop reads and stores no more
 * files than there are slots for (the target slot, then device slides up to
 * the store limit), and images that still find no place are never
 * registered, so the next prune deletes their files.
 *
 * Language rule: a slot without a base-language screenshot gets the image in
 * the base language (so every language falls back to it). Once the base
 * language has one, images added while another language is active become
 * that language's localized screenshot.
 */
import type { AssetInfo, DeviceElement, FamilyId, LangCode, Project } from '../../model/types';
import { FAMILIES } from '../../model/catalog';
import { resolveLayout, resolveShot } from '../../model/resolve';
import { importImagesWithReport, pickAndImportImagesWithReport, type ImportFile, type ImportReport } from '../../runtime';
import { MAX_SLIDES, selectActiveSlideIndex, toast, useEditor } from '../../store';
import { storeAllowance } from './stage/frame';

/**
 * Browser File objects as ImportFile records. Nothing is read here: the
 * importer reads each file when its turn comes and only when it is within
 * the size limit, so a large drop never sits in memory at once, and
 * unreadable entries (folders, revoked files) show up in its report.
 */
export function readFiles(files: readonly File[]): ImportFile[] {
  return files.map((f) => ({ name: f.name || 'image', data: f }));
}

/** True when the transfer carries files (as opposed to text or an element drag). */
export function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files');
}

function targetLang(project: Project, slideId: string, slot: string): LangCode {
  const { activeLang, activeFamily } = useEditor.getState();
  const base = project.languages[0];
  if (activeLang === base) return base;
  const slide = project.slides.find((s) => s.id === slideId);
  const hasBase = !!slide && resolveShot(slide, activeFamily, slot, base, base) !== null;
  return hasBase ? activeLang : base;
}

function reportSkipped(report: ImportReport): void {
  if (!report.skipped.length) return;
  const first = report.skipped[0];
  const more = report.skipped.length > 1 ? ` (+${report.skipped.length - 1} more)` : '';
  toast.warning(
    report.skipped.length === 1 ? `Skipped ${first.name}` : `Skipped ${report.skipped.length} files`,
    `${first.message}${more}`,
  );
}

function firstDevice(project: Project, slideIndex: number, family: FamilyId): DeviceElement | null {
  const slide = project.slides[slideIndex];
  if (!slide) return null;
  return resolveLayout(project, slide, family).elements.find((e): e is DeviceElement => e.kind === 'device') ?? null;
}

/** Where dropped or picked screenshots go: one device slot first, or consecutive slides from a start index. */
export type ScreenshotTarget = { slideId: string; slot: string } | { startSlideIndex: number };

/**
 * How many images assignShotsInOrder can place from slide `start` on: the
 * slides with a device up to the family's store limit, plus the slides it
 * adds at the end (they copy a device slide's design, so each shows one).
 */
export function shotRoom(project: Project, family: FamilyId, start: number): number {
  const limit = Math.min(FAMILIES[family]?.maxSlides ?? 0, MAX_SLIDES);
  const count = project.slides.length;
  const from = Math.max(0, Math.min(Number.isFinite(start) ? Math.floor(start) : 0, count));
  let room = Math.max(0, limit - Math.max(from, count));
  for (let i = from; i < Math.min(limit, count); i++) if (firstDevice(project, i, family)) room++;
  return room;
}

interface Placement {
  /** The slot that takes the first image, when the target names one that still exists. */
  slot: { slideId: string; slot: string } | null;
  /** The first slide the other images fill. */
  start: number;
  /** How many images fit in all. */
  room: number;
}

/** Where the images for `target` go in `project` (no target: the active slide on), and how many fit. */
function placement(project: Project, family: FamilyId, target: ScreenshotTarget | undefined, activeIndex: number): Placement {
  if (target && 'slideId' in target) {
    const index = project.slides.findIndex((s) => s.id === target.slideId);
    if (index >= 0) return { slot: target, start: index + 1, room: 1 + shotRoom(project, family, index + 1) };
  }
  const start = Math.max(0, target && 'startSlideIndex' in target ? target.startSlideIndex : activeIndex);
  return { slot: null, start, room: shotRoom(project, family, start) };
}

/**
 * Registers as many of `assets` as there is room for and puts them in place.
 * Assets without a place stay out of the project, so their files go with
 * the next prune. Returns how many were placed and how many could have been.
 */
function place(assets: readonly AssetInfo[], target: ScreenshotTarget | undefined): { placed: number; room: number } {
  const store = useEditor.getState();
  const project = store.project;
  if (!project || !assets.length) return { placed: 0, room: 0 };
  const family = store.activeFamily;
  const where = placement(project, family, target, selectActiveSlideIndex(store));
  const ids = assets.slice(0, where.room).map((a) => a.id);
  if (!ids.length) return { placed: 0, room: where.room };
  store.addAssets(assets.slice(0, ids.length));
  let placed = 0;
  let rest = ids;
  if (where.slot) {
    const { slideId, slot } = where.slot;
    const lang = targetLang(useEditor.getState().project!, slideId, slot);
    useEditor.getState().setShot(slideId, family, slot, lang, ids[0]);
    // A slot that already shows this very image counts as placed.
    const now = useEditor.getState().project?.slides.find((s) => s.id === slideId);
    if (now?.shots[family]?.[slot]?.[lang] === ids[0]) placed = 1;
    rest = ids.slice(1);
  }
  if (rest.length) {
    const p = useEditor.getState().project!;
    const anchorIndex = Math.max(0, Math.min(where.start, p.slides.length - 1));
    const anchor = p.slides[anchorIndex];
    const device = firstDevice(p, anchorIndex, family);
    const lang = anchor && device ? targetLang(p, anchor.id, device.slot) : p.languages[0];
    placed += useEditor.getState().assignShotsInOrder(family, lang, rest, where.start);
  }
  return { placed, room: where.room };
}

/** "The App Store allows 10 screenshots". */
function limitSentence(family: FamilyId): string {
  const text = `${storeAllowance(family)} ${FAMILIES[family]?.maxSlides === 1 ? 'screenshot' : 'screenshots'}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Says how it went: `placed` of `offered` images got a place in the slides. */
function reportPlaced(placed: number, offered: number, room: number, family: FamilyId): void {
  const left = offered - placed;
  if (left <= 0) {
    if (placed > 0) toast.success(placed === 1 ? 'Screenshot added' : `${placed} screenshots added`);
    return;
  }
  if (placed > 0) {
    toast.warning(`Added ${placed} of ${offered} screenshots`, `${limitSentence(family)}, so ${left} ${left === 1 ? 'was' : 'were'} left out.`);
  } else if (room === 0) {
    toast.warning('No screenshots added', `${limitSentence(family)}; slides after ${FAMILIES[family]?.maxSlides} are not exported.`);
  } else {
    toast.warning('No screenshots added', 'They could not be placed on the slides.');
  }
}

const isFileList = (files: readonly File[] | readonly ImportFile[]): files is readonly File[] =>
  files.length > 0 && typeof (files[0] as File).arrayBuffer === 'function';

/**
 * Imports screenshots. With a target slot, the first image goes into that
 * slot and any others fill the following slides; without one, images fill
 * consecutive slides starting at `startSlideIndex` (default: active slide).
 * Files beyond the room the store limit leaves are not read at all.
 * Returns how many images were placed.
 */
export async function importScreenshots(files: readonly File[] | readonly ImportFile[], target?: ScreenshotTarget): Promise<number> {
  const editor = useEditor.getState();
  const project = editor.project;
  if (!project || !files.length) return 0;
  const family = editor.activeFamily;
  const importFiles: readonly ImportFile[] = isFileList(files) ? readFiles(files) : files;
  const { room } = placement(project, family, target, selectActiveSlideIndex(editor));

  // One file at a time, and only until every slot is taken.
  const report: ImportReport = { assets: [], skipped: [] };
  let next = 0;
  try {
    for (; next < importFiles.length && report.assets.length < room; next++) {
      const one = await importImagesWithReport(project.id, [importFiles[next]]);
      report.assets.push(...one.assets);
      report.skipped.push(...one.skipped);
    }
  } catch (err) {
    toast.error('Could not import images', err instanceof Error ? err.message : String(err));
    return 0;
  }
  reportSkipped(report);
  if (useEditor.getState().project?.id !== project.id) return 0; // the project was closed meanwhile

  const offered = report.assets.length + (importFiles.length - next);
  const result = place(report.assets, target);
  reportPlaced(result.placed, offered, result.room, family);
  return result.placed;
}

/** Opens the system picker and puts the first picked image into the slot (others fill the next slides). */
export async function pickScreenshotsForSlot(slideId: string, slot: string): Promise<number> {
  const project = useEditor.getState().project;
  if (!project) return 0;
  let report: ImportReport;
  try {
    report = await pickAndImportImagesWithReport(project.id);
  } catch (err) {
    toast.error('Could not import images', err instanceof Error ? err.message : String(err));
    return 0;
  }
  reportSkipped(report);
  const store = useEditor.getState();
  if (!report.assets.length || store.project?.id !== project.id) return 0;
  // The picker has stored every file already; the ones without a place are left for the next prune.
  const result = place(report.assets, { slideId, slot });
  reportPlaced(result.placed, report.assets.length, result.room, store.activeFamily);
  return result.placed;
}

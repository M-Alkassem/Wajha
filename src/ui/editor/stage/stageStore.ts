/**
 * Stage-local state that is not part of the project or the editor store:
 *
 *  - render snapshots: what each slide canvas last drew (element boxes,
 *    missing screenshots, empty and overflowing texts) in its own little
 *    observable per slide, so a repaint re-renders only that slide's overlay;
 *  - the paint registry: lets a drag repaint its slide synchronously in the
 *    same frame as the store update;
 *  - transient UI (pointer hover on inactive slides, the file-drop target,
 *    the running gesture's guides and readout, space-to-pan).
 */
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { ElementBox, RenderResult } from '../../../engine/types';
import type { FamilyId, SlideElement, SlideLayout } from '../../../model/types';
import { scaleBox } from './geometry';
import type { Guide } from './snapping';

/* Render snapshots ------------------------------------------------------- */

export interface RenderSnapshot {
  result: RenderResult;
  /** Bitmap size the result's boxes are measured in. */
  bitmapW: number;
  bitmapH: number;
  /** The layout the picture was drawn from (element kinds and flags for hit-testing). */
  layout: SlideLayout;
  family: FamilyId;
  /** Text layers with no words in the painted language: the overlay shows editor-only placeholders. */
  emptyText: readonly string[];
  /** The painted language is right-to-left (start/end alignment flips). */
  rtl: boolean;
}

/** A box in slide CSS px with the element it belongs to. */
export interface StageBox extends ElementBox {
  element: SlideElement;
}

const snapshots = new Map<string, RenderSnapshot>();
const snapshotListeners = new Map<string, Set<() => void>>();

export function getSnapshot(slideId: string): RenderSnapshot | null {
  return snapshots.get(slideId) ?? null;
}

export function setSnapshot(slideId: string, snapshot: RenderSnapshot | null): void {
  if (snapshot) snapshots.set(slideId, snapshot);
  else if (!snapshots.delete(slideId)) return;
  const set = snapshotListeners.get(slideId);
  if (set) for (const fn of [...set]) fn();
}

export function subscribeSnapshot(slideId: string, listener: () => void): () => void {
  let set = snapshotListeners.get(slideId);
  if (!set) {
    set = new Set();
    snapshotListeners.set(slideId, set);
  }
  set.add(listener);
  return () => {
    const s = snapshotListeners.get(slideId);
    if (!s) return;
    s.delete(listener);
    if (!s.size) snapshotListeners.delete(slideId);
  };
}

/** The slide's latest render snapshot (re-renders when it repaints). */
export function useRenderSnapshot(slideId: string): RenderSnapshot | null {
  return useSyncExternalStore(
    (cb) => subscribeSnapshot(slideId, cb),
    () => getSnapshot(slideId),
    () => null,
  );
}

const boxCache = new WeakMap<RenderSnapshot, { width: number; boxes: StageBox[] }>();

/**
 * The snapshot's boxes in CSS px of a slide displayed `width` wide, paired
 * with their elements, in painter's order. Boxes of elements that left the
 * layout are dropped. Cached per snapshot and width.
 */
export function stageBoxes(snapshot: RenderSnapshot, width: number): StageBox[] {
  const hit = boxCache.get(snapshot);
  if (hit && hit.width === width) return hit.boxes;
  const k = width / Math.max(1, snapshot.bitmapW);
  const byId = new Map(snapshot.layout.elements.map((e) => [e.id, e]));
  const boxes: StageBox[] = [];
  for (const b of snapshot.result.boxes) {
    const element = byId.get(b.id);
    if (element) boxes.push({ ...scaleBox(b, k), element });
  }
  boxCache.set(snapshot, { width, boxes });
  return boxes;
}

/* Paint registry ------------------------------------------------------------ */

const painters = new Map<string, () => void>();

/** Registers the function that repaints a slide now (if anything changed). */
export function registerPainter(slideId: string, paint: () => void): () => void {
  painters.set(slideId, paint);
  return () => {
    if (painters.get(slideId) === paint) painters.delete(slideId);
  };
}

/** Repaints a slide synchronously when its inputs changed (no-op for unknown or offscreen slides). */
export function paintNow(slideId: string): void {
  painters.get(slideId)?.();
}

/* Transient UI ---------------------------------------------------------------- */

export interface StageHover {
  slideId: string;
  elementId: string;
}

export interface DropTarget {
  /** The slide that receives the first screenshot (highlighted), if any. */
  slideId: string | null;
  /** The device the first screenshot would land in, if any. */
  deviceId: string | null;
  /** What dropping does, e.g. "Drop to set screenshot". */
  label: string;
  /** The pointer is over the empty stage (the label shows at the bottom of the stage, not on the slide). */
  stage: boolean;
}

export type GestureKind = 'move' | 'resize' | 'rotate' | 'pan';

export interface GestureVisual {
  kind: GestureKind;
  slideId: string | null;
  elementId: string | null;
  guides: Guide[];
  /** Size or angle readout, shown next to the element. */
  label: string | null;
  /** Cursor for the whole window while the gesture runs. */
  cursor: string;
}

export interface StageUiState {
  /** Pointer hover on a slide that is not the active one (the store's hoverId covers the active slide). */
  hover: StageHover | null;
  /** A file drag is over the stage (and where its first screenshot would land). */
  drop: DropTarget | null;
  gesture: GestureVisual | null;
  /** Space is held over the stage: the next drag pans. */
  panReady: boolean;
}

export const useStageUi = create<StageUiState>()(() => ({
  hover: null,
  drop: null,
  gesture: null,
  panReady: false,
}));

const sameHover = (a: StageHover | null, b: StageHover | null) => a === b || (!!a && !!b && a.slideId === b.slideId && a.elementId === b.elementId);
const sameDrop = (a: DropTarget | null, b: DropTarget | null) =>
  a === b || (!!a && !!b && a.slideId === b.slideId && a.deviceId === b.deviceId && a.label === b.label && a.stage === b.stage);

export function setLocalHover(hover: StageHover | null): void {
  if (!sameHover(useStageUi.getState().hover, hover)) useStageUi.setState({ hover });
}

export function setDropTarget(drop: DropTarget | null): void {
  if (!sameDrop(useStageUi.getState().drop, drop)) useStageUi.setState({ drop });
}

export function setGestureVisual(gesture: GestureVisual | null): void {
  useStageUi.setState({ gesture });
}

/**
 * The slide the stage itself last activated with the pointer. The stage
 * scrolls the active slide into view when it changes elsewhere (slides
 * list, new slides), but not when the user just clicked it.
 */
let pointerActivated: string | null = null;

export function notePointerActivation(slideId: string): void {
  pointerActivated = slideId;
}

/** True (once) when `slideId` became active through a click on the stage. */
export function takePointerActivation(slideId: string): boolean {
  const hit = pointerActivated === slideId;
  pointerActivated = null;
  return hit;
}

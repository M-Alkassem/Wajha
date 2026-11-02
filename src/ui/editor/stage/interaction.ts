/**
 * Direct manipulation on the stage: selecting, moving, resizing and
 * rotating elements with the pointer.
 *
 * One gesture runs at a time. A press arms it; once the pointer travels
 * DRAG_THRESHOLD px the gesture opens a history step (beginGesture), every
 * frame applies the latest pointer position through updateElement and
 * repaints the slide synchronously, and the release closes the step
 * (endGesture), so a whole drag is one undo. Escape (or a cancelled
 * pointer) reverts it with cancelGesture. Pointer moves only record the
 * position; the work happens once per frame and is O(elements).
 */
import type { DeviceElement, FamilyId, SlideElement } from '../../../model/types';
import { FAMILIES } from '../../../model/catalog';
import { mirrorElement, mirrorPatch, mirrorsLayout } from '../../../model/mirror';
import { resolveLayout } from '../../../model/resolve';
import { useEditor } from '../../../store';
import { platformIsMac } from '../../kit';
import { useEditorUi } from '../editorUi';
import { pickScreenshotsForSlot } from '../importShots';
import { frames } from './frameScheduler';
import { boxBounds, handlePoint, hitTest, pointInBox, resizeCursor, type HandleId, type Point, type Rect } from './geometry';
import {
  DRAG_THRESHOLD,
  ROTATION_MAGNET,
  ROTATION_STEP,
  angleLabel,
  constrainDelta,
  movedPosition,
  resizeBehaviour,
  resizeBox,
  resizePatch,
  rotationFor,
  sizeLabel,
  type SlideSize,
} from './gestures';
import { SNAP_PX, combineTargets, elementTargets, slideTargets, snapRect, type Guide, type SnapTargets } from './snapping';
import {
  getSnapshot,
  notePointerActivation,
  paintNow,
  setGestureVisual,
  setLocalHover,
  stageBoxes,
  useStageUi,
  type StageBox,
} from './stageStore';

/** What the stage knows about the slide under an event. */
export interface SlideTarget {
  slideId: string;
  /** The slide box element (pointer capture target, coordinate origin). */
  el: HTMLElement;
  /** Displayed slide size in CSS px. */
  width: number;
  height: number;
  family: FamilyId;
}

interface Modifiers {
  shift: boolean;
  alt: boolean;
  /** Cmd on macOS, Ctrl elsewhere: disables snapping. */
  mod: boolean;
}

type Mode = { kind: 'move'; bounds: Rect; targets: SnapTargets } | { kind: 'resize'; handle: HandleId; grab: Point } | { kind: 'rotate' };

interface Gesture {
  mode: Mode;
  pointerId: number;
  target: SlideTarget;
  size: SlideSize;
  /** Slide box position (client px) and stage scroll when the press started. */
  origin: Point;
  scroll0: Point;
  start: Point;
  pointer: Point;
  mods: Modifiers;
  elementId: string;
  /** The element as drawn and its box when the press started; every frame recomputes from these. */
  el0: SlideElement;
  box0: StageBox;
  /** The slide is drawn mirrored: el0 is mirrored, and each patch is mirrored back before it is stored. */
  mirrored: boolean;
  started: boolean;
  /** Plain click inside the selection on another element: select that one on release. */
  clickSelect: string | null;
  done: boolean;
  cleanup: () => void;
}

let gesture: Gesture | null = null;
const scroll: Point = { x: 0, y: 0 };

/** The stage reports its scroll position, so drags survive scrolling mid-gesture. */
export function noteScroll(x: number, y: number): void {
  scroll.x = x;
  scroll.y = y;
}

/** True while a press or drag is in progress (the stage blocks zoom and drop hover meanwhile). */
export function gestureInProgress(): boolean {
  return gesture !== null;
}

const modsOf = (e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): Modifiers => ({
  shift: e.shiftKey,
  alt: e.altKey,
  mod: platformIsMac() ? e.metaKey : e.ctrlKey,
});

/** Pointer position in slide CSS px. */
function localPoint(target: SlideTarget, clientX: number, clientY: number): Point {
  const r = target.el.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

/** Boxes of the slide's last paint (CSS px), or [] before the first paint. */
export function boxesOf(target: SlideTarget): StageBox[] {
  const snap = getSnapshot(target.slideId);
  return snap ? stageBoxes(snap, target.width) : [];
}

/** The element under `p`: the topmost visible one. */
export function elementAt(target: SlideTarget, p: Point, accept?: (b: StageBox) => boolean): StageBox | null {
  return hitTest(boxesOf(target), p, accept);
}

function currentElement(target: SlideTarget, id: string): SlideElement | null {
  const s = useEditor.getState();
  const slide = s.project?.slides.find((x) => x.id === target.slideId);
  if (!s.project || !slide) return null;
  return resolveLayout(s.project, slide, target.family).elements.find((e) => e.id === id) ?? null;
}

function selectOnSlide(target: SlideTarget, elementId: string | null): void {
  const s = useEditor.getState();
  if (s.activeSlideId !== target.slideId) notePointerActivation(target.slideId);
  if (elementId === s.selection && s.activeSlideId === target.slideId) return;
  s.select(elementId, target.slideId);
}

/* Press ---------------------------------------------------------------------- */

/**
 * pointerdown on a slide. Selects what is under the pointer (keeping the
 * current selection when the press is inside it, so a selected element
 * under another one can still be dragged) and arms a move, resize or
 * rotate gesture.
 */
export function pressSlide(e: PointerEvent, target: SlideTarget): void {
  if (e.button !== 0 || (platformIsMac() && e.ctrlKey)) return;
  if (gesture || useStageUi.getState().panReady) return;
  const p = localPoint(target, e.clientX, e.clientY);
  const state = useEditor.getState();
  const boxes = boxesOf(target);
  const selectedHere = state.activeSlideId === target.slideId ? state.selection : null;
  const selectedBox = selectedHere ? (boxes.find((b) => b.id === selectedHere) ?? null) : null;

  const handleEl = (e.target as Element | null)?.closest?.('[data-handle]') as HTMLElement | null;
  const handle = (handleEl?.dataset.handle ?? null) as HandleId | 'rotate' | null;
  if (handle && selectedBox && !selectedBox.element.locked) {
    const mode: Mode =
      handle === 'rotate'
        ? { kind: 'rotate' }
        : (() => {
            const hp = handlePoint(selectedBox, handle);
            return { kind: 'resize', handle, grab: { x: p.x - hp.x, y: p.y - hp.y } };
          })();
    arm(e, target, p, selectedBox, mode, null);
    return;
  }

  const hit = hitTest(boxes, p);
  // A press inside the (movable) selection drags it even when another element is on top.
  const keep = selectedBox && !selectedBox.element.locked && pointInBox(selectedBox, p, 2, 6) ? selectedBox : null;
  const pick = keep ?? hit;
  if (!pick) {
    selectOnSlide(target, null);
    return;
  }
  selectOnSlide(target, pick.id);
  if (pick.element.locked) return;
  const others = boxes.filter((b) => b.id !== pick.id).map(boxBounds);
  const mode: Mode = {
    kind: 'move',
    bounds: boxBounds(pick),
    targets: combineTargets(slideTargets(target.width, target.height), elementTargets(others)),
  };
  arm(e, target, p, pick, mode, hit && keep && hit.id !== keep.id ? hit.id : null);
}

function arm(e: PointerEvent, target: SlideTarget, p: Point, box: StageBox, mode: Mode, clickSelect: string | null): void {
  const r = target.el.getBoundingClientRect();
  const { project, activeLang } = useEditor.getState();
  const mirrored = mirrorsLayout(project, activeLang);
  const current = currentElement(target, box.id);
  const g: Gesture = {
    mode,
    pointerId: e.pointerId,
    target,
    size: { width: target.width, height: target.height },
    origin: { x: r.left, y: r.top },
    scroll0: { x: scroll.x, y: scroll.y },
    start: p,
    pointer: p,
    mods: modsOf(e),
    elementId: box.id,
    // The store's element (an inspector edit may not be painted yet), else the painted one.
    el0: current ? (mirrored ? mirrorElement(current) : current) : box.element,
    box0: box,
    mirrored,
    started: false,
    clickSelect,
    done: false,
    cleanup: () => undefined,
  };
  gesture = g;
  try {
    target.el.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; window listeners still work.
  }

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== g.pointerId) return;
    g.pointer = pointerOf(g, ev.clientX, ev.clientY);
    g.mods = modsOf(ev);
    if (!g.started) {
      if (Math.hypot(g.pointer.x - g.start.x, g.pointer.y - g.start.y) < DRAG_THRESHOLD) return;
      begin(g);
    }
    frames.schedule('gesture', () => step(g), true);
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== g.pointerId) return;
    g.pointer = pointerOf(g, ev.clientX, ev.clientY);
    finish(g, 'commit');
  };
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === g.pointerId) finish(g, 'cancel');
  };
  const onLost = (ev: PointerEvent) => {
    if (ev.pointerId === g.pointerId) finish(g, 'commit');
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      finish(g, 'cancel');
      return;
    }
    // Modifier changes apply at once, without waiting for the pointer to move.
    if (ev.key === 'Shift' || ev.key === 'Alt' || ev.key === 'Meta' || ev.key === 'Control') {
      g.mods = modsOf(ev);
      if (g.started) frames.schedule('gesture', () => step(g), true);
    }
  };
  const onBlur = () => finish(g, 'commit');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  target.el.addEventListener('lostpointercapture', onLost);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', onBlur);
  g.cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    target.el.removeEventListener('lostpointercapture', onLost);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', onBlur);
    try {
      if (target.el.hasPointerCapture(g.pointerId)) target.el.releasePointerCapture(g.pointerId);
    } catch {
      // Already released.
    }
  };
}

/** Pointer in slide CSS px, following the stage if it scrolled since the press. */
function pointerOf(g: Gesture, clientX: number, clientY: number): Point {
  return { x: clientX - g.origin.x + (scroll.x - g.scroll0.x), y: clientY - g.origin.y + (scroll.y - g.scroll0.y) };
}

function cursorOf(g: Gesture): string {
  if (g.mode.kind === 'resize') return resizeCursor(g.mode.handle, g.box0.rotation);
  return g.mode.kind === 'rotate' ? 'grabbing' : 'default';
}

function begin(g: Gesture): void {
  g.started = true;
  g.clickSelect = null;
  useEditor.getState().beginGesture();
  useEditor.getState().hover(null);
  setLocalHover(null);
  setGestureVisual({ kind: g.mode.kind, slideId: g.target.slideId, elementId: g.elementId, guides: [], label: null, cursor: cursorOf(g) });
}

/** One frame of the gesture. */
function step(g: Gesture): void {
  if (g.done || !g.started) return;
  if (!useEditor.getState().inGesture) {
    // Someone else closed the history step (undo mid-drag): stop without touching the project.
    finish(g, 'abandon');
    return;
  }
  apply(g);
}

/** A patch computed on the slide as drawn, as the store keeps it. */
function stored<P extends { x?: number; rotation?: number }>(g: Gesture, patch: P): P {
  return g.mirrored ? mirrorPatch(patch) : patch;
}

/** Applies the latest pointer position: one store update and one synchronous repaint of the slide. */
function apply(g: Gesture): void {
  const store = useEditor.getState();
  const { target, size, mods } = g;
  let guides: Guide[] = [];
  let label: string | null = null;
  const design = FAMILIES[target.family].design;

  if (g.mode.kind === 'move') {
    const raw = constrainDelta(g.pointer.x - g.start.x, g.pointer.y - g.start.y, mods.shift);
    let { dx, dy } = raw;
    if (!mods.mod) {
      const b = g.mode.bounds;
      const moved = { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy };
      const axes = mods.shift ? { x: raw.dx !== 0, y: raw.dy !== 0 } : { x: true, y: true };
      const snap = snapRect(moved, g.mode.targets, SNAP_PX, axes);
      dx += snap.dx;
      dy += snap.dy;
      guides = snap.guides;
    }
    store.updateElement(target.slideId, target.family, g.elementId, stored(g, movedPosition(g.el0, dx, dy, size)));
  } else if (g.mode.kind === 'resize') {
    const behaviour = resizeBehaviour(g.el0.kind, g.mode.handle, mods.shift);
    const out = resizeBox({ box: g.box0, handle: g.mode.handle, pointer: g.pointer, grab: g.mode.grab, behaviour, fromCenter: mods.alt });
    store.updateElement(target.slideId, target.family, g.elementId, stored(g, resizePatch(g.el0, g.box0, out, size)));
    label = sizeLabel(out.box, size, design);
  } else {
    const center = { x: g.box0.cx, y: g.box0.cy };
    const rotation = rotationFor(center, g.start, g.pointer, g.el0.rotation, mods.shift ? { step: ROTATION_STEP } : mods.mod ? {} : { magnet: ROTATION_MAGNET });
    store.updateElement(target.slideId, target.family, g.elementId, stored(g, { rotation }));
    label = angleLabel(rotation);
  }
  paintNow(target.slideId);
  setGestureVisual({ kind: g.mode.kind, slideId: target.slideId, elementId: g.elementId, guides, label, cursor: cursorOf(g) });
}

function finish(g: Gesture, how: 'commit' | 'cancel' | 'abandon'): void {
  if (g.done) return;
  g.done = true;
  frames.cancel('gesture');
  g.cleanup();
  if (gesture === g) gesture = null;
  const store = useEditor.getState();
  if (g.started) {
    if (how === 'commit' && store.inGesture) {
      // The release position may not have had its frame yet.
      apply(g);
      useEditor.getState().endGesture();
    } else if (how === 'cancel') {
      store.cancelGesture();
    }
    setGestureVisual(null);
    paintNow(g.target.slideId);
  } else if (how === 'commit' && g.clickSelect) {
    selectOnSlide(g.target, g.clickSelect);
  }
}

/** Ends any running gesture (the stage unmounting, the project closing). */
export function cancelActiveGesture(): void {
  if (gesture) finish(gesture, 'cancel');
}

/* Hover, double-click, context menu --------------------------------------- */

/** pointermove over a slide without a gesture: hover outline for the element under the pointer. */
export function hoverSlide(e: PointerEvent, target: SlideTarget): void {
  if (gesture || e.buttons !== 0) return;
  const p = localPoint(target, e.clientX, e.clientY);
  const id = elementAt(target, p)?.id ?? null;
  const store = useEditor.getState();
  if (store.activeSlideId === target.slideId) {
    if (store.hoverId !== id) store.hover(id);
    setLocalHover(null);
  } else {
    if (store.hoverId !== null) store.hover(null);
    setLocalHover(id ? { slideId: target.slideId, elementId: id } : null);
  }
}

export function leaveSlide(target: SlideTarget): void {
  const store = useEditor.getState();
  if (store.activeSlideId === target.slideId && store.hoverId !== null && !gesture) store.hover(null);
  if (useStageUi.getState().hover?.slideId === target.slideId) setLocalHover(null);
}

/** Double-click: edit a text in the inspector, pick a screenshot for a device. */
export function doubleClickSlide(e: MouseEvent, target: SlideTarget): void {
  const hit = elementAt(target, localPoint(target, e.clientX, e.clientY));
  if (!hit) return;
  selectOnSlide(target, hit.id);
  if (hit.element.kind === 'text') {
    useEditorUi.getState().requestTextFocus(hit.id);
  } else if (hit.element.kind === 'device' && !hit.element.locked) {
    void pickScreenshotsForSlot(target.slideId, hit.element.slot);
  }
}

export type MenuTarget = { kind: 'element'; elementId: string } | { kind: 'slide' };

/** Right-click: selects what is under the pointer (or the slide) and says which menu to show. */
export function contextTarget(e: MouseEvent, target: SlideTarget): MenuTarget {
  const p = localPoint(target, e.clientX, e.clientY);
  const state = useEditor.getState();
  const boxes = boxesOf(target);
  const selected = state.activeSlideId === target.slideId && state.selection ? boxes.find((b) => b.id === state.selection) : undefined;
  const hit = selected && pointInBox(selected, p, 2, 6) ? selected : hitTest(boxes, p);
  if (hit) {
    selectOnSlide(target, hit.id);
    return { kind: 'element', elementId: hit.id };
  }
  selectOnSlide(target, null);
  return { kind: 'slide' };
}

/** The device under `p` on a slide, for screenshot drops. */
export function deviceAt(target: SlideTarget, p: Point): (StageBox & { element: DeviceElement }) | null {
  return elementAt(target, p, (b) => b.element.kind === 'device') as (StageBox & { element: DeviceElement }) | null;
}

/** First device of a slide's layout (where dropped screenshots land). */
export function firstDeviceOf(slideId: string, family: FamilyId): DeviceElement | null {
  const s = useEditor.getState();
  const slide = s.project?.slides.find((x) => x.id === slideId);
  if (!s.project || !slide) return null;
  return resolveLayout(s.project, slide, family).elements.find((e): e is DeviceElement => e.kind === 'device') ?? null;
}

export { localPoint };

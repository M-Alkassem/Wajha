/**
 * The canvas stage: every slide of the active family side by side for the
 * active language, like a store listing, with direct manipulation.
 *
 * Layout and zoom are pure (stageLayout.ts): zoom 1 is "fit" and the store's
 * zoom multiplies it. Ctrl/Cmd + wheel and trackpad pinch zoom around the
 * cursor, plain wheel scrolls (a vertical wheel scrolls the strip sideways
 * when nothing overflows vertically), Space + drag or the middle button pan.
 * Screenshot files dropped on a device, a slide or the empty stage are
 * imported through importDrop (sorted into devices and languages when they
 * come as folders or mixed sets). Global keyboard shortcuts belong to
 * the editor; the stage only handles Escape during a drag and Space to pan.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ImageUp, LayoutPanelTop, Plus } from 'lucide-react';
import { FAMILIES } from '../../../model/catalog';
import { MAX_SLIDES, selectActiveSlideIndex, useEditor } from '../../../store';
import { Button, ContextMenu, ContextMenuContent, ContextMenuTrigger, EmptyState, cx, markNotNavigation } from '../../kit';
import { collectDrop, hasFiles, importDrop, type ScreenshotTarget } from '../importShots';
import { addSlideAfter } from '../sidebar/slideActions';
import { modalLayerOpen } from '../useEditorShortcuts';
import { fieldToCommit, inputModality, isTextEntry, movesFocus, spaceCanPan } from './focus';
import { windowDpr } from './geometry';
import { cancelActiveGesture, deviceAt, firstDeviceOf, gestureInProgress, noteScroll, type SlideTarget } from './interaction';
import { AddSlideTile, SlideFrame } from './SlideFrame';
import { slideRadius } from './frame';
import { renderContextEntries, stageEntries } from './SlideMenus';
import {
  clampZoom,
  computeStageLayout,
  scrollForAnchor,
  scrollToReveal,
  slideLeft,
  wheelPixels,
  wheelZoomFactor,
  type StageLayout,
} from './stageLayout';
import { setDropTarget, setGestureVisual, takePointerActivation, useStageUi, type DropTarget } from './stageStore';

/** Safari's pinch events (not in the DOM typings). */
interface GestureEventLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

type ImportTarget = ScreenshotTarget | undefined;

/** A file drag that stops sending dragover (left the window, cancelled) clears its highlight after this long. */
const DROP_IDLE_MS = 350;

/** Re-renders when the window moves to a screen with another pixel ratio. */
function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(windowDpr);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mq: MediaQueryList | null = null;
    const listen = () => {
      mq = window.matchMedia(`(resolution: ${windowDpr()}dppx)`);
      mq.addEventListener('change', onChange);
    };
    const onChange = () => {
      mq?.removeEventListener('change', onChange);
      setDpr(windowDpr());
      listen();
    };
    listen();
    return () => mq?.removeEventListener('change', onChange);
  }, []);
  return dpr;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function StageMenuItems() {
  return <>{renderContextEntries(stageEntries())}</>;
}

/** The canvas stage: every slide of the active family side by side. */
export function Stage() {
  const hasProject = useEditor((s) => s.project !== null);
  const slideKey = useEditor((s) => (s.project ? s.project.slides.map((x) => x.id).join('|') : ''));
  const family = useEditor((s) => s.activeFamily);
  const panorama = useEditor((s) => s.project?.theme.panorama === true);
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const gestureCursor = useStageUi((s) => s.gesture?.cursor ?? null);
  const panReady = useStageUi((s) => s.panReady);
  const stageDrop = useStageUi((s) => (s.drop?.stage ? s.drop : null));
  const dpr = useDevicePixelRatio();

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const scrollPos = useRef({ left: 0, top: 0 });
  const layoutRef = useRef<StageLayout | null>(null);
  const familyRef = useRef(family);
  const zoomAnchor = useRef<{ vx: number; vy: number } | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ends a running pan (window listeners, pointer capture). */
  const endPan = useRef<(() => void) | null>(null);
  /**
   * The viewport shows its focus ring only when focus came from the
   * keyboard. The last input decides (see inputModality): after a click,
   * a menu or dialog handing focus back, or later key presses, the whole
   * stage must not get framed.
   */
  const keyboardInput = useRef(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const slideIds = useMemo(() => (slideKey ? slideKey.split('|') : []), [slideKey]);
  const design = (FAMILIES[family] ?? FAMILIES.iphone).design;
  const effectiveZoom = fit ? 1 : zoom;
  const layout = useMemo(
    () =>
      size
        ? computeStageLayout({ viewportW: size.w, viewportH: size.h, design, zoom: effectiveZoom, slideCount: slideIds.length, panorama, addTile: true })
        : null,
    [size, design, effectiveZoom, slideIds.length, panorama],
  );

  const setViewportRef = useCallback((el: HTMLDivElement | null) => {
    viewportRef.current = el;
    setViewport(el);
  }, []);

  /* Measuring ------------------------------------------------------------ */

  useLayoutEffect(() => {
    const el = viewport;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewport]);

  const applyScroll = useCallback((left: number, top: number) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = left;
    el.scrollTop = top;
    scrollPos.current = { left: el.scrollLeft, top: el.scrollTop };
    noteScroll(scrollPos.current.left, scrollPos.current.top);
  }, []);

  const onScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    scrollPos.current = { left: el.scrollLeft, top: el.scrollTop };
    noteScroll(el.scrollLeft, el.scrollTop);
  }, []);

  /* Zoom anchoring: keep the content under the cursor (wheel) or the viewport centre in place. */
  useLayoutEffect(() => {
    const el = viewportRef.current;
    const prev = layoutRef.current;
    const familyChanged = familyRef.current !== family;
    layoutRef.current = layout;
    familyRef.current = family;
    if (!el || !layout) return;
    if (!prev || familyChanged) {
      zoomAnchor.current = null;
      const index = slideIds.indexOf(useEditor.getState().activeSlideId ?? '');
      const left = index >= 0 ? scrollToReveal(layout, index, 0, el.clientWidth) : null;
      applyScroll(left ?? 0, Math.max(0, (layout.contentH - el.clientHeight) / 2));
      return;
    }
    if (prev.slideW === layout.slideW && prev.slideH === layout.slideH && prev.gap === layout.gap) {
      zoomAnchor.current = null;
      return;
    }
    const at = zoomAnchor.current ?? { vx: el.clientWidth / 2, vy: el.clientHeight / 2 };
    zoomAnchor.current = null;
    const next = scrollForAnchor(
      prev,
      layout,
      { scrollLeft: scrollPos.current.left, scrollTop: scrollPos.current.top, viewportW: el.clientWidth, viewportH: el.clientHeight },
      at.vx,
      at.vy,
    );
    applyScroll(next.scrollLeft, next.scrollTop);
  }, [layout, family, applyScroll, slideIds]);

  /* Fit keeps zoom at 1 (zoom is relative to fit). */
  useEffect(() => {
    if (fit && zoom !== 1) useEditor.getState().setZoom(1, true);
  }, [fit, zoom]);

  /* The active slide scrolls into view when it changes from outside the stage (slides list, new slides). */
  useEffect(() => {
    if (!activeSlideId) return;
    if (takePointerActivation(activeSlideId)) return;
    const el = viewportRef.current;
    const l = layoutRef.current;
    if (!el || !l) return;
    const index = slideIds.indexOf(activeSlideId);
    // The last slide comes into view with the "Add slide" tile next to it.
    const through = index === l.count - 1 ? l.addLeft + l.addW : undefined;
    const left = scrollToReveal(l, index, el.scrollLeft, el.clientWidth, 24, through);
    if (left !== null) el.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    // Only a change of the active slide or of the slide list scrolls; zooming must not (the layout is read from a ref).
  }, [activeSlideId, slideIds]);

  /* Wheel zoom, sideways wheel scrolling, Safari pinch ----------------------- */

  useEffect(() => {
    const el = viewport;
    if (!el) return;
    let pinchBase: number | null = null;
    const zoomTo = (next: number, clientX: number, clientY: number) => {
      const s = useEditor.getState();
      const current = s.fit ? 1 : s.zoom;
      const z = clampZoom(next);
      if (Math.abs(z - current) < 1e-4) return;
      const r = el.getBoundingClientRect();
      zoomAnchor.current = { vx: clientX - r.left, vy: clientY - r.top };
      s.setZoom(z);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Pinch on Chromium/WebView2 arrives as ctrl + wheel; never let the page zoom.
        e.preventDefault();
        if (gestureInProgress() || pinchBase !== null) return;
        const s = useEditor.getState();
        zoomTo((s.fit ? 1 : s.zoom) * wheelZoomFactor(e.deltaY, e.deltaMode), e.clientX, e.clientY);
        return;
      }
      if (e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) * 0.5) return;
      if (el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth <= 1) return;
      e.preventDefault();
      el.scrollLeft += wheelPixels(e.deltaY, e.deltaMode);
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      const s = useEditor.getState();
      pinchBase = s.fit ? 1 : s.zoom;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEventLike;
      if (pinchBase === null || gestureInProgress() || !Number.isFinite(g.scale)) return;
      zoomTo(pinchBase * g.scale, g.clientX, g.clientY);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinchBase = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }, [viewport]);

  /* Keyboard or pointer: where the next focus comes from ---------------------------- */

  useEffect(() => {
    const note = (e: PointerEvent | KeyboardEvent) => {
      const keyboard = inputModality(e);
      if (keyboard !== null) keyboardInput.current = keyboard;
    };
    window.addEventListener('pointerdown', note, true);
    window.addEventListener('keydown', note, true);
    return () => {
      window.removeEventListener('pointerdown', note, true);
      window.removeEventListener('keydown', note, true);
    };
  }, []);

  /* Space to pan ----------------------------------------------------------------- */

  useEffect(() => {
    /** Where the pointer last was (client px); null once it left the window. */
    let pointer: { x: number; y: number } | null = null;
    /** The last key pressed was one that moves focus (Tab, an arrow). */
    let focusKey = false;
    /** Focus came by such a key and the pointer has not moved since (see spaceCanPan). */
    let keyboardFocus = false;
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ';
    // Hit-tested rather than followed with enter and leave events: a menu or dialog that
    // opens or closes under a resting pointer leaves those out of date.
    const overStage = () => {
      const el = viewportRef.current;
      if (!el || !pointer) return false;
      // A running drag or pan covers the window with its cursor layer.
      if (useStageUi.getState().gesture) return true;
      const hit = document.elementFromPoint(pointer.x, pointer.y);
      return hit !== null && el.contains(hit);
    };
    const onPointer = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      focusKey = false;
      keyboardFocus = false;
    };
    // Also sent when what is under a resting pointer changes (the stage mounting, a menu
    // closing): that tells where the pointer is, not that the user turned to it.
    const onPointerOver = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    const onFocusIn = () => {
      keyboardFocus = focusKey;
    };
    const onDown = (e: KeyboardEvent) => {
      if (!isSpace(e)) {
        focusKey = movesFocus(e);
        return;
      }
      if (useStageUi.getState().panReady) {
        if (isTextEntry(document.activeElement) || modalLayerOpen()) {
          // A field, dialog or menu took focus while Space was held: the key is theirs now.
          useStageUi.setState({ panReady: false });
          return;
        }
        // Held down: the repeats must not scroll anything or press the focused control.
        e.preventDefault();
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!spaceCanPan({ focus: document.activeElement, overStage: overStage(), layerOpen: modalLayerOpen(), keyboardFocus })) return;
      // Claimed before the focused row or button sees it (this listener captures): they skip a prevented key.
      e.preventDefault();
      markNotNavigation();
      useStageUi.setState({ panReady: true });
    };
    const onUp = (e: KeyboardEvent) => {
      if (!isSpace(e) || !useStageUi.getState().panReady) return;
      // A focused button would take the release as a click.
      e.preventDefault();
      useStageUi.setState({ panReady: false });
    };
    const onBlur = () => {
      if (useStageUi.getState().panReady) useStageUi.setState({ panReady: false });
    };
    // Leaving the document element means leaving the window.
    const html = document.documentElement;
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('pointerover', onPointerOver, { capture: true, passive: true });
    html.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onPointer, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('pointerover', onPointerOver, true);
      html.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const startPan = useCallback((e: PointerEvent) => {
    const el = viewportRef.current;
    if (!el) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const left0 = el.scrollLeft;
    const top0 = el.scrollTop;
    const id = e.pointerId;
    try {
      el.setPointerCapture(id);
    } catch {
      // Window listeners below still follow the pointer.
    }
    setGestureVisual({ kind: 'pan', slideId: null, elementId: null, guides: [], label: null, cursor: 'grabbing' });
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      el.scrollLeft = left0 - (ev.clientX - x0);
      el.scrollTop = top0 - (ev.clientY - y0);
    };
    const stop = () => {
      endPan.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      try {
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      } catch {
        // Already released.
      }
      setGestureVisual(null);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId === id) stop();
    };
    endPan.current?.();
    endPan.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent) => {
      setKeyboardFocus(false);
      const pan = e.button === 1 || (e.button === 0 && useStageUi.getState().panReady);
      if (pan) {
        if (gestureInProgress()) return;
        e.preventDefault();
        e.stopPropagation();
        startPan(e.nativeEvent);
        return;
      }
      // Inspector fields commit typed values on blur: let that happen before this press changes the selection under them.
      const field = fieldToCommit(document.activeElement, viewportRef.current);
      if (field instanceof HTMLElement) field.blur();
    },
    [startPan],
  );

  /** A press on the empty stage clears the selection. */
  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element | null;
    if (t?.closest?.('[data-slide-box], button, a, [role="menuitem"], [tabindex]:not([data-stage-viewport])')) return;
    const s = useEditor.getState();
    if (s.selection !== null) s.select(null);
  }, []);

  /* Screenshot drops ---------------------------------------------------------------- */

  const clearDropSoon = useCallback(() => {
    if (dropTimer.current !== null) clearTimeout(dropTimer.current);
    dropTimer.current = setTimeout(() => {
      dropTimer.current = null;
      setDropTarget(null);
    }, DROP_IDLE_MS);
  }, []);

  const resolveDrop = useCallback(
    (e: DragEvent): { target: ImportTarget; drop: DropTarget } => {
      const items = e.dataTransfer?.items;
      let count = 0;
      if (items) for (let i = 0; i < items.length; i++) if (items[i].kind === 'file') count++;
      const many = count > 1;
      const box = (e.target as Element | null)?.closest?.('[data-slide-box]') as HTMLElement | null;
      const slideId = box?.dataset.slideId;
      if (box && slideId) {
        const index = Number(box.dataset.slideIndex);
        const r = box.getBoundingClientRect();
        const t: SlideTarget = { slideId, el: box, width: r.width, height: r.height, family };
        const device = deviceAt(t, { x: e.clientX - r.left, y: e.clientY - r.top });
        if (device) {
          return {
            target: { slideId, slot: device.element.slot },
            drop: { slideId, deviceId: device.id, label: many ? `Drop ${count} screenshots from here` : 'Drop to set screenshot', stage: false },
          };
        }
        const first = firstDeviceOf(slideId, family);
        return {
          // The first screenshot goes where the highlight shows, as if dropped on that device (past the store limit too).
          target: first ? { slideId, slot: first.slot } : { startSlideIndex: Number.isFinite(index) ? index : 0 },
          drop: {
            slideId,
            deviceId: first?.id ?? null,
            label: many ? `Drop ${count} screenshots from here` : first ? 'Drop to set screenshot' : 'Drop to add screenshots',
            stage: false,
          },
        };
      }
      const s = useEditor.getState();
      const active = Math.max(0, selectActiveSlideIndex(s));
      const first = s.activeSlideId ? firstDeviceOf(s.activeSlideId, family) : null;
      return {
        target: first && s.activeSlideId ? { slideId: s.activeSlideId, slot: first.slot } : undefined,
        drop: {
          slideId: s.activeSlideId,
          deviceId: first?.id ?? null,
          label: many ? `Drop ${count} screenshots from slide ${active + 1}` : `Drop to add a screenshot to slide ${active + 1}`,
          stage: true,
        },
      };
    },
    [family],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer) || gestureInProgress()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropTarget(resolveDrop(e).drop);
      clearDropSoon();
    },
    [resolveDrop, clearDropSoon],
  );

  const onDragLeave = useCallback((e: DragEvent) => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const outside = e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom;
    if (outside) setDropTarget(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      const { target } = resolveDrop(e);
      // Read now: the browser forgets dropped folders once this handler returns.
      const dropped = collectDrop(e.dataTransfer);
      if (dropTimer.current !== null) clearTimeout(dropTimer.current);
      dropTimer.current = null;
      setDropTarget(null);
      void dropped.then((files) => (files.length ? importDrop(files, target) : 0));
    },
    [resolveDrop],
  );

  /* Files dropped anywhere else in the window must not navigate the webview to them. */
  useEffect(() => {
    const over = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const drop = (e: globalThis.DragEvent) => {
      if (!e.defaultPrevented && hasFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  /* Unmount: no gesture or highlight may outlive the stage. */
  useEffect(
    () => () => {
      cancelActiveGesture();
      endPan.current?.();
      if (dropTimer.current !== null) clearTimeout(dropTimer.current);
      useStageUi.setState({ hover: null, drop: null, gesture: null, panReady: false });
    },
    [],
  );

  const addAtEnd = useCallback(() => {
    const p = useEditor.getState().project;
    const last = p?.slides[p.slides.length - 1];
    if (last) addSlideAfter(last.id);
  }, []);

  if (!hasProject) return <div className="h-full w-full bg-stage" />;

  const count = slideIds.length;
  const radius = layout ? slideRadius(layout.slideW, layout.slideH) : 0;
  const dots = { backgroundImage: 'radial-gradient(circle, var(--stage-dot) 1px, transparent 1.6px)', backgroundSize: '20px 20px', backgroundPosition: '10px 10px' };

  return (
    <div ref={rootRef} className="relative h-full w-full min-w-0 overflow-hidden bg-stage">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setViewportRef}
            role="region"
            aria-label="Slides"
            tabIndex={0}
            data-stage-viewport=""
            className={cx(
              'absolute inset-0 overflow-auto overscroll-none',
              keyboardFocus ? 'outline-solid outline-2 -outline-offset-2 outline-focus' : 'outline-none',
              panReady && 'cursor-grab [&_*]:cursor-grab!',
            )}
            onScroll={onScroll}
            onPointerDownCapture={onPointerDownCapture}
            onFocus={(e) => {
              if (e.target === e.currentTarget) setKeyboardFocus(keyboardInput.current);
            }}
            onBlur={(e) => {
              if (e.target === e.currentTarget) setKeyboardFocus(false);
            }}
            onPointerDown={onPointerDown}
            onDragEnter={onDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {layout && (
              <div className="relative" style={{ width: layout.contentW, height: layout.contentH, ...dots }}>
                {count === 0 ? (
                  <div className="sticky left-0 flex h-full items-center justify-center" style={{ width: size?.w }}>
                    <EmptyState
                      icon={<LayoutPanelTop />}
                      title="No slides yet"
                      description="Add a slide to start designing your store listing."
                      actions={
                        <Button variant="primary" leadingIcon={<Plus />} onClick={() => useEditor.getState().addSlide()}>
                          Add slide
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <>
                    {panorama && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute"
                        style={{
                          left: layout.stripLeft,
                          top: layout.slideTop,
                          width: layout.stripW,
                          height: layout.slideH,
                          borderRadius: radius,
                          boxShadow: 'var(--shadow-slide), 0 0 0 1px var(--line)',
                        }}
                      />
                    )}
                    {slideIds.map((id, i) => (
                      <SlideFrame
                        key={id}
                        slideId={id}
                        index={i}
                        count={count}
                        left={slideLeft(layout, i)}
                        top={layout.slideTop}
                        width={layout.slideW}
                        height={layout.slideH}
                        family={family}
                        panorama={panorama}
                        dpr={dpr}
                        root={viewport}
                      />
                    ))}
                    <AddSlideTile
                      left={layout.addLeft}
                      top={layout.slideTop}
                      width={layout.addW}
                      height={layout.slideH}
                      radius={radius}
                      disabled={count >= MAX_SLIDES}
                      onAdd={addAtEnd}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[200px]">
          <StageMenuItems />
        </ContextMenuContent>
      </ContextMenu>

      {stageDrop && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-3.5 text-ui font-medium whitespace-nowrap text-accent-text shadow-lg">
          <ImageUp aria-hidden className="size-4" />
          {stageDrop.label}
        </div>
      )}
      {gestureCursor !== null && typeof document !== 'undefined' && createPortal(<div className="fixed inset-0 z-[45]" style={{ cursor: gestureCursor }} />, document.body)}
    </div>
  );
}

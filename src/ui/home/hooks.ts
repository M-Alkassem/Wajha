/**
 * Small React hooks used across the home screen.
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/** True once the element has come within `margin` of the viewport (stays true). */
export function useInView(ref: RefObject<Element | null>, margin = '160px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, seen]);
  return seen;
}

export interface ElementSize {
  width: number;
  height: number;
}

const ZERO: ElementSize = { width: 0, height: 0 };

/** The element's content-box size in CSS pixels (0 until measured), kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<Element | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(ZERO);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (width: number, height: number) => {
      const next = { width: Math.floor(width), height: Math.floor(height) };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    // Layout size (not the transformed one), so a dialog's entrance scale never re-renders previews.
    const html = el as HTMLElement;
    update(html.clientWidth ?? 0, html.clientHeight ?? 0);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The element's content-box width (see useElementSize). */
export function useElementWidth(ref: RefObject<Element | null>): number {
  return useElementSize(ref).width;
}

/* A shared once-a-minute clock for relative times ----------------------------- */

const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let minuteNow = Date.now();

function subscribeMinute(listener: () => void): () => void {
  minuteListeners.add(listener);
  if (!minuteTimer) {
    minuteNow = Date.now();
    minuteTimer = setInterval(() => {
      minuteNow = Date.now();
      for (const l of [...minuteListeners]) l();
    }, 30_000);
  }
  return () => {
    minuteListeners.delete(listener);
    if (!minuteListeners.size && minuteTimer) {
      clearInterval(minuteTimer);
      minuteTimer = null;
    }
  };
}

/** Date.now(), refreshed every 30 s by one timer shared by every subscriber. */
export function useNow(): number {
  return useSyncExternalStore(subscribeMinute, () => minuteNow, () => minuteNow);
}

/** `flag`, but only after it has stayed true for `delayMs` (avoids flashing skeletons on fast loads). */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  // Each time the flag turns on, the wait starts over (reset while rendering, not in an effect).
  const [was, setWas] = useState(flag);
  if (was !== flag) {
    setWas(flag);
    if (!flag) setShown(false);
  }
  useEffect(() => {
    if (!flag) return;
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [flag, delayMs]);
  return flag && shown;
}

/** True when the element's text is cut off (an ellipsis is showing). */
export function isTruncated(el: Element | null): boolean {
  return !!el && el.scrollWidth > el.clientWidth;
}

/**
 * Open state for a Tooltip that repeats text in full only when some of
 * `refs` is truncated, checked each time the tooltip is about to open.
 */
export function useTruncationTooltip(refs: ReadonlyArray<RefObject<Element | null>>): { open: boolean; onOpenChange(open: boolean): void } {
  const [open, setOpen] = useState(false);
  return { open, onOpenChange: (next) => setOpen(next && refs.some((ref) => isTruncated(ref.current))) };
}

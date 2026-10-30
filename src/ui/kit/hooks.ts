import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Ref that always holds the latest value, for event handlers and cleanups
 * that must not re-subscribe on every render.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * While `active` (text is being typed into `input`), Escape there is claimed
 * before a dialog or popover around the field sees it: those close on Escape,
 * which would unmount the field and keep what was typed. The field's own key
 * handler then reverts the text, and the next Escape reaches the layer.
 */
export function useEscapeClaim(active: boolean, input: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && e.target === input.current) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, input]);
}

export interface IndicatorRect {
  left: number;
  width: number;
}

/**
 * Measures the active item inside a container (offsetLeft/offsetWidth) and
 * keeps it measured through resizes and attribute changes, for sliding
 * thumbs and tab underlines. `selector` picks the active item; a change of
 * `remeasureKey` (the active value, the item list...) measures again.
 */
export function useActiveIndicator(container: RefObject<HTMLElement | null>, selector: string, remeasureKey: string): IndicatorRect | null {
  const [rect, setRect] = useState<IndicatorRect | null>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      setRect((prev) => {
        if (!el) return prev === null ? prev : null;
        const next = { left: el.offsetLeft, width: el.offsetWidth };
        return prev && prev.left === next.left && prev.width === next.width ? prev : next;
      });
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(root);
    for (const child of Array.from(root.children)) ro?.observe(child);
    // Radix flips data-state on the triggers without re-rendering us when uncontrolled.
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    mo?.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-state', 'aria-selected', 'aria-checked'] });
    return () => {
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [container, selector, remeasureKey]);
  return rect;
}

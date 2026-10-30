/**
 * Where focus goes when a dialog closes. Radix returns it only to a
 * DialogTrigger, and the app opens its dialogs from state, so without this
 * focus would fall to the page and the next Tab would start from the top.
 */
import { isToastTarget } from './layers';
import { pressedControl } from './modality';

/**
 * Where focus comes from as a dialog opens: the focused element, or, with
 * focus on the page itself, the control the pointer pressed last (WebKit
 * focuses no button it clicks). Null when there is neither.
 */
export function focusOrigin(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement && el !== document.body) return el;
  return pressedControl();
}

export interface FocusReturn {
  /**
   * Reports a focus move seen while the dialog is open: a focusin target or
   * a focusout relatedTarget. While the opener is gone (a menu item, removed
   * with its menu) the first element outside any dialog to be handed focus
   * takes its place: the menu's trigger, which the menu refocuses as it
   * closes.
   */
  observe(el: EventTarget | null): void;
  /** Focuses the opener if it is still on the page; true when it did. */
  restore(): boolean;
}

/** Tracks the control a dialog returns focus to, starting from what had focus when it opened. */
export function createFocusReturn(opener: HTMLElement | null): FocusReturn {
  let target = opener;
  return {
    observe(el) {
      if (target?.isConnected || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return;
      if (el.closest('[role="dialog"], [role="alertdialog"]') || isToastTarget(el)) return;
      target = el;
    },
    restore() {
      if (!target?.isConnected) return false;
      target.focus({ preventScroll: true });
      return true;
    },
  };
}

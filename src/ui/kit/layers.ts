/**
 * How the kit's overlays keep out of each other's way: the Toaster moves
 * clear of an open modal Dialog, and dialogs and popovers do not take a
 * click on a toast for a click outside them.
 */
import { useSyncExternalStore } from 'react';

/** Marks the toast region (Toaster); see isToastTarget. */
export const TOAST_REGION_ATTR = 'data-kit-toasts';

/** True when the event target is inside a toast, which dismisses no dialog, popover or menu. */
export function isToastTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && target.closest(`[${TOAST_REGION_ATTR}]`) !== null;
}

let openModals = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Counts a modal dialog as open until the returned function is called. */
export function registerModal(): () => void {
  openModals++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    openModals--;
    emit();
  };
}

/** True while any modal Dialog is open. */
export function modalOpen(): boolean {
  return openModals > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when the first modal Dialog opens or the last one closes. */
export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, modalOpen, () => false);
}

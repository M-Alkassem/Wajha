/**
 * Toast data and the presence bookkeeping behind Toaster. The app store owns
 * the list of toasts; the Toaster only renders it, keeps removed toasts on
 * screen for their exit animation and runs auto-dismiss timers.
 */

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms; 0 keeps the toast until dismissed. Defaults per kind. */
  duration?: number;
}

/** Errors linger: people need time to read what went wrong. */
export const DEFAULT_TOAST_DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

/** Toasts with an action stay at least this long so the button can be reached. */
export const MIN_ACTION_DURATION = 6000;

/** Exit animation length; matches --dur in kit.css. */
export const TOAST_EXIT_MS = 180;

/** Most toasts shown at once; older ones collapse out of view first. */
export const MAX_VISIBLE_TOASTS = 4;

export function toastDuration(toast: ToastData, fallback?: number): number {
  const base = toast.duration ?? fallback ?? DEFAULT_TOAST_DURATION[toast.kind];
  if (!Number.isFinite(base) || base <= 0) return 0;
  return toast.action ? Math.max(base, MIN_ACTION_DURATION) : base;
}

export interface PresentToast {
  toast: ToastData;
  /** Removed by the app; still on screen while its exit animation plays. */
  leaving: boolean;
}

/**
 * Merges the app's current toasts into what is on screen: kept toasts get
 * fresh data, removed ones are marked leaving in place, new ones are
 * appended. A toast that comes back while leaving is revived.
 */
export function reconcileToasts(present: readonly PresentToast[], next: readonly ToastData[]): PresentToast[] {
  const byId = new Map(next.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: PresentToast[] = [];
  for (const p of present) {
    const fresh = byId.get(p.toast.id);
    if (seen.has(p.toast.id)) continue;
    seen.add(p.toast.id);
    if (fresh) out.push(p.leaving || p.toast !== fresh ? { toast: fresh, leaving: false } : p);
    else out.push(p.leaving ? p : { toast: p.toast, leaving: true });
  }
  for (const t of next) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ toast: t, leaving: false });
  }
  return out;
}

/** Drops toasts whose exit animation finished. */
export function removeToasts(present: readonly PresentToast[], ids: ReadonlySet<string>): PresentToast[] {
  return present.filter((p) => !(p.leaving && ids.has(p.toast.id)));
}

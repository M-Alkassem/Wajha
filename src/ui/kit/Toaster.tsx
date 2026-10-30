import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { Button } from './Button';
import { cx } from './cx';
import { useLatest } from './hooks';
import { TOAST_REGION_ATTR, useModalOpen } from './layers';
import {
  MAX_VISIBLE_TOASTS,
  TOAST_EXIT_MS,
  reconcileToasts,
  removeToasts,
  toastDuration,
  type PresentToast,
  type ToastData,
  type ToastKind,
} from './toast';

export type ToasterPosition = 'bottom-right' | 'bottom-center' | 'top-right' | 'top-center';

export interface ToasterProps {
  /** The app's current toasts (oldest first). */
  toasts: readonly ToastData[];
  /** Called on close, on the action, when a toast times out, or when too many pile up. */
  onDismiss: (id: string) => void;
  position?: ToasterPosition;
  /**
   * Where toasts go while a modal Dialog is open: top-center by default, over
   * the dialog's title row instead of its footer buttons. null keeps `position`.
   */
  dialogPosition?: ToasterPosition | null;
  /** Gap in px between the window's bottom edge and bottom-positioned toasts (room for a status bar). */
  bottomOffset?: number;
  /** Auto-dismiss delay for toasts without their own `duration`; 0 disables. Defaults per kind. */
  duration?: number;
  /** Render in the document flow instead of fixed to a corner (docs, previews). */
  inline?: boolean;
  className?: string;
}

const KIND: Record<ToastKind, { icon: ReactNode; tint: string; label: string }> = {
  info: { icon: <Info />, tint: 'text-accent-fg', label: 'Info' },
  success: { icon: <CircleCheck />, tint: 'text-success', label: 'Success' },
  warning: { icon: <TriangleAlert />, tint: 'text-warning', label: 'Warning' },
  error: { icon: <CircleAlert />, tint: 'text-danger', label: 'Error' },
};

const POSITION: Record<ToasterPosition, string> = {
  'bottom-right': 'right-4 bottom-4 items-end',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-4 right-4 items-end',
  'top-center': 'top-3 left-1/2 -translate-x-1/2 items-center',
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Renders the toasts the app passes in: slide-in, an icon per kind, an
 * optional action and a close button. Auto-dismiss pauses while hovered or
 * focused. Removed toasts animate out before they leave the DOM. While a
 * modal Dialog is open the stack moves clear of its footer, stays in the
 * accessibility tree, and clicking a toast leaves the dialog open.
 */
export function Toaster({
  toasts,
  onDismiss,
  position = 'bottom-right',
  dialogPosition = 'top-center',
  bottomOffset,
  duration,
  inline = false,
  className,
}: ToasterProps) {
  const [present, setPresent] = useState<PresentToast[]>(() => reconcileToasts([], toasts));
  const [seen, setSeen] = useState(toasts);
  if (seen !== toasts) {
    // Adjust state while rendering (React's pattern for props-derived state): no stale frame.
    setSeen(toasts);
    setPresent((prev) => reconcileToasts(prev, toasts));
  }

  const dismissRef = useLatest(onDismiss);
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const overDialog = useModalOpen();
  const placement = overDialog && dialogPosition ? dialogPosition : position;
  const fromTop = placement.startsWith('top');

  // Leaving toasts drop out after their exit animation.
  useEffect(() => {
    const timers = exitTimers.current;
    const delay = prefersReducedMotion() ? 0 : TOAST_EXIT_MS;
    for (const p of present) {
      if (!p.leaving) {
        const t = timers.get(p.toast.id);
        if (t !== undefined) {
          clearTimeout(t);
          timers.delete(p.toast.id);
        }
        continue;
      }
      if (timers.has(p.toast.id)) continue;
      const id = p.toast.id;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          setPresent((prev) => removeToasts(prev, new Set([id])));
        }, delay),
      );
    }
  }, [present]);

  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Keep the stack short: the oldest toasts make room for new ones.
  useEffect(() => {
    const active = toasts.length;
    if (active <= MAX_VISIBLE_TOASTS) return;
    for (const t of toasts.slice(0, active - MAX_VISIBLE_TOASTS)) dismissRef.current(t.id);
  }, [toasts, dismissRef]);

  // The newest toast sits nearest the edge it comes in from.
  const ordered = fromTop ? [...present].reverse() : present;

  return (
    <section
      aria-label="Notifications"
      {...{ [TOAST_REGION_ATTR]: '' }}
      data-position={inline ? undefined : placement}
      style={!inline && !fromTop && bottomOffset !== undefined ? { bottom: bottomOffset } : undefined}
      className={cx('pointer-events-none flex flex-col', inline ? 'relative' : cx('fixed z-[60]', POSITION[placement]), className)}
    >
      {/* aria-live, even "off", keeps the list out of the aria-hidden that a modal
          dialog puts on the rest of the page (radix's hideOthers spares live
          regions), so toasts raised over a dialog are still announced. Each
          toast is its own live region. */}
      <ol
        aria-live="off"
        className={cx('flex flex-col gap-2', inline ? 'items-start' : placement.endsWith('center') ? 'items-center' : 'items-end')}
      >
        {ordered.map((p) => (
          <ToastItem key={p.toast.id} toast={p.toast} leaving={p.leaving} duration={duration} onDismiss={(id) => dismissRef.current(id)} />
        ))}
      </ol>
    </section>
  );
}

interface ToastItemProps {
  toast: ToastData;
  leaving: boolean;
  duration?: number;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, leaving, duration, onDismiss }: ToastItemProps) {
  const kind = KIND[toast.kind] ?? KIND.info;
  const total = toastDuration(toast, duration);
  // Hover and keyboard focus pause the clock independently: leaving with the
  // pointer must not resume a toast whose action button still has focus.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(total);
  const dismissRef = useLatest(onDismiss);

  // Restart the clock when the toast is updated with a new duration.
  useEffect(() => {
    remaining.current = total;
  }, [total, toast]);

  useEffect(() => {
    if (leaving || paused || total <= 0) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissRef.current(toast.id), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [leaving, paused, total, toast, dismissRef]);

  return (
    <li
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic
      data-kind={toast.kind}
      data-leaving={leaving ? '' : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={cx(
        'kit-toast pointer-events-auto relative flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-[10px] border border-line',
        'bg-popover py-3 pr-10 pl-3 text-text shadow-lg',
      )}
    >
      <span aria-hidden className={cx('mt-px flex size-[18px] shrink-0 items-center justify-center [&_svg]:size-[18px]', kind.tint)}>
        {kind.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">{kind.label}: </span>
        <p className="text-ui leading-5 font-medium">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs leading-[17px] text-text-2">{toast.description}</p>}
        {toast.action && (
          <div className="mt-2.5 flex">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                toast.action?.onClick();
                dismissRef.current(toast.id);
              }}
            >
              {toast.action.label}
            </Button>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismissRef.current(toast.id)}
        className={cx(
          'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-sm text-text-3 outline-none',
          'transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus',
        )}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

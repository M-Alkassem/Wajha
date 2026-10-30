import { Children, forwardRef, useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cx } from './cx';
import { createFocusReturn, focusOrigin, type FocusReturn } from './focusReturn';
import { IconButton } from './IconButton';
import { isToastTarget, registerModal } from './layers';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<DialogSize, string> = {
  sm: 'w-[400px]',
  md: 'w-[520px]',
  lg: 'w-[720px]',
  xl: 'w-[960px]',
  full: 'h-[calc(100vh-48px)] w-[calc(100vw-48px)]',
};

export interface DialogContentProps extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  /** Icon tile left of the title. */
  icon?: ReactNode;
  /** Extra control in the header, left of the close button. */
  headerAction?: ReactNode;
  /** Footer row (buttons). Use DialogFooter for a custom one inside children instead. */
  footer?: ReactNode;
  /** Content on the left side of the footer (a checkbox, a hint). */
  footerStart?: ReactNode;
  hideClose?: boolean;
  /** Visually hide the title (still read by screen readers). */
  hideTitle?: boolean;
  /** Drop the body padding for edge-to-edge content (tables, galleries). */
  flush?: boolean;
  bodyClassName?: string;
}

/**
 * Modal dialog: blurred overlay, scale-and-fade entrance, a header with
 * title, description and close button, a scrolling body and a footer.
 * Closing it puts focus back on the control that opened it, and a click on
 * a toast raised over it does not close it.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  {
    title,
    description,
    size = 'md',
    icon,
    headerAction,
    footer,
    footerStart,
    hideClose = false,
    hideTitle = false,
    flush = false,
    bodyClassName,
    className,
    children,
    onCloseAutoFocus,
    onInteractOutside,
    ...rest
  },
  ref,
) {
  const focusReturn = useRef<FocusReturn | null>(null);
  const startSession = useCallback((tracker: FocusReturn) => {
    focusReturn.current = tracker;
  }, []);
  // Confirms are a title and a message: no empty body padding under them.
  const hasBody = Children.toArray(children).length > 0;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="kit-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[6px]" />
      <DialogPrimitive.Content
        ref={ref}
        // Without a description, an explicit undefined tells radix there is intentionally none.
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cx(
          'kit-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col',
          'overflow-hidden rounded-xl border border-line bg-popover text-text shadow-xl outline-none',
          SIZES[size],
          className,
        )}
        {...rest}
        onInteractOutside={(e) => {
          if (isToastTarget(e.target)) e.preventDefault();
          onInteractOutside?.(e);
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e);
          if (!e.defaultPrevented && focusReturn.current?.restore()) e.preventDefault();
          // A closed dialog keeps no hold on the opener (which may since have left the page).
          focusReturn.current = null;
        }}
      >
        <DialogSession onStart={startSession} />
        <div className={cx('flex shrink-0 items-start gap-3 px-5 pt-[18px]', hideTitle && !description ? 'pb-0' : hasBody ? 'pb-3' : 'pb-5')}>
          {icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-text-2 [&_svg]:size-[18px]">
              {icon}
            </div>
          )}
          <div className={cx('flex min-w-0 flex-1 flex-col gap-1', icon && 'pt-0.5', hideTitle && 'sr-only')}>
            <DialogPrimitive.Title className="text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="text-xs leading-[18px] text-text-2">{description}</DialogPrimitive.Description>}
          </div>
          {headerAction && <div className={cx('-mt-1 ml-auto flex shrink-0 items-center gap-1', hideClose ? '-mr-2' : 'mr-6')}>{headerAction}</div>}
          {!hideClose && <span aria-hidden className="w-5 shrink-0" />}
        </div>
        {hasBody && <div className={cx('min-h-0 flex-1 overflow-y-auto', !flush && 'px-5 pt-1 pb-5', bodyClassName)}>{children}</div>}
        {(footer || footerStart) && <DialogFooter start={footerStart}>{footer}</DialogFooter>}
        {/* Last in DOM order so opening focuses the first field or button, not "Close" (and its tooltip). */}
        {!hideClose && (
          <DialogPrimitive.Close asChild>
            <IconButton label="Close" shortcut="escape" size="md" icon={<X />} className="absolute top-3.5 right-3" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/**
 * Lives exactly as long as the open dialog. Remembers the control that had
 * focus when it opened (or was just clicked: see focusOrigin), read while
 * rendering because an autoFocus child takes focus during the commit, before
 * any effect could look. Follows the handoff when that control was a menu
 * item (see createFocusReturn): the dialog's focus trap pulls focus straight
 * back from inside the focusout, so the handoff only shows as that event's
 * relatedTarget. Also counts the dialog as open, so toasts move clear of it.
 */
function DialogSession({ onStart }: { onStart: (focusReturn: FocusReturn) => void }) {
  const [opener] = useState(focusOrigin);
  useEffect(() => {
    const tracker = createFocusReturn(opener);
    onStart(tracker);
    const onFocusIn = (e: FocusEvent) => tracker.observe(e.target);
    const onFocusOut = (e: FocusEvent) => tracker.observe(e.relatedTarget);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    const unregister = registerModal();
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      unregister();
    };
  }, [opener, onStart]);
  return null;
}

export interface DialogFooterProps {
  children?: ReactNode;
  /** Left-aligned content. */
  start?: ReactNode;
  className?: string;
}

/** Footer bar with right-aligned actions; renders inside DialogContent's `footer` or on its own. */
export function DialogFooter({ children, start, className }: DialogFooterProps) {
  return (
    <div className={cx('flex shrink-0 items-center gap-2 border-t border-line bg-panel px-5 py-3 light:bg-surface', className)}>
      {start && <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-text-2">{start}</div>}
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

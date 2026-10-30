import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cx } from './cx';
import { useLatest } from './hooks';
import { Kbd } from './Kbd';
import type { ShortcutInput } from './keys';
import { pointerModality } from './modality';

/** Hover delay before a tooltip opens; moving between triggers then skips it. */
export const TOOLTIP_DELAY = 400;

const ProviderContext = createContext(false);

export interface TooltipProviderProps {
  children: ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}

/** Mount once near the app root so tooltips share one delay (moving between icons feels instant). */
export function TooltipProvider({ children, delayDuration = TOOLTIP_DELAY, skipDelayDuration = 300 }: TooltipProviderProps) {
  return (
    <ProviderContext.Provider value>
      <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
        {children}
      </TooltipPrimitive.Provider>
    </ProviderContext.Provider>
  );
}

export interface TooltipProps {
  /** Tooltip text. Nothing renders when both content and shortcut are empty. */
  content: ReactNode;
  /** Optional shortcut shown as keycaps after the text. */
  shortcut?: ShortcutInput;
  /** The trigger; must accept a ref and DOM event props (buttons, links, kit controls). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  className?: string;
}

/** Small dark label for icon buttons and truncated text. */
export function Tooltip(props: TooltipProps) {
  const hasProvider = useContext(ProviderContext);
  const { content, shortcut, children, disabled } = props;
  const empty = (content === null || content === undefined || content === '' || content === false) && !shortcut;
  if (disabled || empty) return children;
  const tooltip = <TooltipRoot {...props} />;
  // Radix requires a provider; fall back to a local one so a lone kit control still works.
  return hasProvider ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider delayDuration={TOOLTIP_DELAY} skipDelayDuration={300}>
      {tooltip}
    </TooltipPrimitive.Provider>
  );
}

/** True when the element has focus that came from the keyboard (or focus-visible is unsupported). */
function keyboardFocused(el: Element | null): boolean {
  if (!el || typeof document === 'undefined' || document.activeElement !== el) return false;
  // WebKit reports focus moved by script after a click as :focus-visible too.
  if (pointerModality()) return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function TooltipRoot({
  content,
  shortcut,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
  className,
}: TooltipProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen ?? false);
  // Typed as a button by radix; with asChild it is whatever element the trigger child renders.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);

  // Radix opens on any focus, including focus returned by a closing menu or
  // dialog. Only hover and keyboard focus should show the label.
  const handleOpenChange = (next: boolean) => {
    if (next && !hovering.current && !keyboardFocused(triggerRef.current)) return;
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  // An open tooltip is radix's topmost dismissable layer, and only the topmost
  // layer hears Escape: the dialog or menu under it would stay open. Closing
  // the tooltip first, from a window capture listener (ahead of radix's on the
  // document) and synchronously, hands the same key press to the layer below.
  // That only works because the content unmounts at once (no exit animation).
  const isOpen = open ?? innerOpen;
  const close = useLatest(() => handleOpenChange(false));
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') flushSync(() => close.current());
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, close]);

  return (
    <TooltipPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger
        asChild
        ref={triggerRef}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cx(
            'kit-pop z-[70] flex max-w-[280px] origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-sm',
            'border border-tooltip-line bg-tooltip px-2 py-[5px] text-xs leading-4 font-medium text-tooltip-text shadow-md select-none',
            // Leaves at once, like a native tooltip: a closing animation would keep it the topmost layer (see above).
            'data-[state=closed]:animate-none',
            className,
          )}
        >
          {content !== null && content !== undefined && content !== false && content !== '' && <span>{content}</span>}
          {shortcut && <Kbd keys={shortcut} tone="inverse" />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

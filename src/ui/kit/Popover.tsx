import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cx } from './cx';
import { isToastTarget } from './layers';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps extends Omit<ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, 'title'> {
  /** Inner padding: none for custom layouts, sm 8 px, md 12 px (default). */
  padding?: 'none' | 'sm' | 'md';
  /** Fixed width in px (or any CSS length). */
  width?: number | string;
  /** Optional heading row. */
  title?: ReactNode;
  /** Keep the popover inside this container (dialogs pass their own node). */
  container?: HTMLElement | null;
}

/**
 * Floating panel anchored to its trigger: same surface, border and motion as
 * the menus. Dismissing a toast does not close it.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { padding = 'md', width, title, container, className, style, children, sideOffset = 6, collisionPadding = 8, align = 'center', onInteractOutside, ...rest },
  ref,
) {
  const sized: CSSProperties | undefined = width === undefined ? style : { width, ...style };
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        style={sized}
        className={cx(
          'kit-pop z-50 max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-16px)] overflow-y-auto',
          'origin-(--radix-popover-content-transform-origin) rounded-lg border border-line bg-popover text-text shadow-lg outline-none',
          padding === 'md' ? 'p-3' : padding === 'sm' ? 'p-2' : 'p-0',
          className,
        )}
        {...rest}
        onInteractOutside={(e) => {
          if (isToastTarget(e.target)) e.preventDefault();
          onInteractOutside?.(e);
        }}
      >
        {title && <div className="mb-2.5 text-xs font-semibold text-text">{title}</div>}
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});

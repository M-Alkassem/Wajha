import { forwardRef, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { ScrollArea as ScrollPrimitive } from 'radix-ui';
import { cx } from './cx';

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'dir'> {
  dir?: 'ltr' | 'rtl';
  orientation?: 'vertical' | 'horizontal' | 'both';
  /** hover (default): scrollbars appear while hovering; always; scroll: while scrolling; auto: when overflowing. */
  type?: 'auto' | 'always' | 'scroll' | 'hover';
  viewportRef?: Ref<HTMLDivElement>;
  viewportClassName?: string;
  /** Inline style for the content wrapper (e.g. padding that should scroll with the content). */
  contentStyle?: CSSProperties;
}

/**
 * A 10 px track whose thumb is as wide as the track, so the whole width
 * grabs it, while the visible pill is the thumb's middle 6 px. Nothing
 * reaches past the track: a wider hit area would lie over the controls next
 * to it (a switch or a dial at the panel edge) and take their clicks. The
 * track pads only along its axis, which is where radix reads the padding.
 */
function Scrollbar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const vertical = orientation === 'vertical';
  return (
    <ScrollPrimitive.Scrollbar
      orientation={orientation}
      className={cx(
        'z-10 flex touch-none select-none transition-opacity duration-(--dur) ease-out',
        'data-[state=hidden]:opacity-0 data-[state=visible]:opacity-100',
        vertical ? 'h-full w-2.5 py-0.5' : 'h-2.5 w-full flex-col px-0.5',
      )}
    >
      <ScrollPrimitive.Thumb
        className={cx(
          'relative flex-1',
          'before:absolute before:rounded-full before:bg-[var(--scrollbar)] before:transition-colors before:duration-(--dur-fast) hover:before:bg-[var(--scrollbar-hover)]',
          vertical ? 'before:inset-x-0.5 before:inset-y-0' : 'before:inset-x-0 before:inset-y-0.5',
        )}
      />
    </ScrollPrimitive.Scrollbar>
  );
}

/**
 * Scroll container with thin overlay scrollbars that match the theme on
 * every platform. The scrollbars lie over the content's edge on a 10 px
 * track that takes clicks while shown: keep controls at least 10 px from it.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { orientation = 'vertical', type = 'hover', viewportRef, viewportClassName, contentStyle, className, children, ...rest },
  ref,
) {
  const vertical = orientation !== 'horizontal';
  const horizontal = orientation !== 'vertical';
  return (
    <ScrollPrimitive.Root ref={ref} type={type} scrollHideDelay={500} className={cx('relative overflow-hidden', className)} {...rest}>
      <ScrollPrimitive.Viewport
        ref={viewportRef}
        disableImplicitContentElement
        className={cx('size-full rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus', viewportClassName)}
      >
        {/* Vertical-only areas use a block wrapper so children can truncate; radix defaults to display: table. */}
        <ScrollPrimitive.Content style={{ minWidth: '100%', display: horizontal ? 'table' : 'block', ...contentStyle }}>{children}</ScrollPrimitive.Content>
      </ScrollPrimitive.Viewport>
      {vertical && <Scrollbar orientation="vertical" />}
      {horizontal && <Scrollbar orientation="horizontal" />}
      {vertical && horizontal && <ScrollPrimitive.Corner />}
    </ScrollPrimitive.Root>
  );
});

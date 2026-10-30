import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cx } from './cx';
import { useActiveIndicator } from './hooks';

export type TabsVariant = 'underline' | 'pill';

const VariantContext = createContext<{ variant: TabsVariant; measured: boolean }>({ variant: 'underline', measured: false });

export const Tabs = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof TabsPrimitive.Root>>(function Tabs({ className, ...rest }, ref) {
  return <TabsPrimitive.Root ref={ref} className={cx('flex min-h-0 flex-col', className)} {...rest} />;
});

export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** underline: section tabs with a sliding bar; pill: compact filters with a sliding pill. */
  variant?: TabsVariant;
  /** Stretch triggers to equal widths. */
  fullWidth?: boolean;
}

/** Tab row with an indicator that glides to the active tab. */
export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { variant = 'underline', fullWidth = false, className, children, ...rest },
  ref,
) {
  const listRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => listRef.current as HTMLDivElement, []);
  const rect = useActiveIndicator(listRef, '[role="tab"][data-state="active"]', `${variant}:${fullWidth}`);
  const [animate, setAnimate] = useState(false);
  useLayoutEffect(() => {
    if (!rect || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [rect, animate]);

  return (
    <VariantContext.Provider value={{ variant, measured: rect !== null }}>
      <TabsPrimitive.List
        ref={listRef}
        data-variant={variant}
        className={cx(
          'relative isolate flex shrink-0 items-center',
          variant === 'underline' ? 'h-9 gap-4 border-b border-line' : 'h-7 gap-0.5 rounded-sm bg-field p-0.5 light:bg-field-hover',
          fullWidth && 'w-full [&>[role=tab]]:flex-1',
          className,
        )}
        {...rest}
      >
        {rect && (
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute left-0',
              variant === 'underline'
                ? '-bottom-px h-0.5 rounded-full bg-text'
                : '-z-10 top-0.5 bottom-0.5 rounded-[5px] bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.25),var(--highlight)] light:shadow-[0_1px_2px_rgba(16,16,40,0.12),0_0_0_0.5px_rgba(16,16,40,0.08)]',
              animate && 'transition-[transform,width] duration-(--dur) ease-out',
            )}
            style={{ transform: `translateX(${rect.left}px)`, width: rect.width }}
          />
        )}
        {children}
      </TabsPrimitive.List>
    </VariantContext.Provider>
  );
});

export const TabsTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(function TabsTrigger(
  { className, ...rest },
  ref,
) {
  const { variant, measured } = useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cx(
        'relative inline-flex min-w-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap text-text-2 outline-none select-none',
        'transition-colors duration-(--dur-fast) hover:text-text data-[state=active]:text-text disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5',
        variant === 'underline'
          ? 'h-full text-ui focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-0 focus-visible:outline-focus'
          : 'h-full rounded-[5px] px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-focus',
        // Until the indicator is measured (no layout yet) the active tab marks itself.
        !measured && (variant === 'underline' ? 'data-[state=active]:shadow-[inset_0_-2px_0_var(--text)]' : 'data-[state=active]:bg-raised'),
        className,
      )}
      {...rest}
    />
  );
});

export const TabsContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(function TabsContent(
  { className, ...rest },
  ref,
) {
  return <TabsPrimitive.Content ref={ref} className={cx('min-h-0 flex-1 outline-none', className)} {...rest} />;
});

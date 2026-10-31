import { useState, type ReactNode } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronRight } from 'lucide-react';
import { cx } from './cx';

export interface SectionProps {
  title: ReactNode;
  /** Header control on the right (an IconButton "Add", a Switch...). Not part of the toggle. */
  action?: ReactNode;
  children?: ReactNode;
  /** Small icon before the title. */
  icon?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** false renders a static header without a chevron. */
  collapsible?: boolean;
  /** Skip the hairline under the section (last section of a panel). */
  borderless?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Inspector section: a 36 px header that collapses its content with an
 * animated chevron. Header actions end 12 px in, flush with the body's
 * controls and clear of a ScrollArea's 10 px scrollbar track.
 */
export function Section({
  title,
  action,
  children,
  icon,
  defaultOpen = true,
  open,
  onOpenChange,
  collapsible = true,
  borderless = false,
  className,
  contentClassName,
}: SectionProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  const heading = (
    <span className="flex min-w-0 items-center gap-1.5">
      {icon && <span className="flex shrink-0 text-text-3 [&_svg]:size-3.5">{icon}</span>}
      <span className="truncate text-xs font-semibold text-text">{title}</span>
    </span>
  );

  const body = <div className={cx('flex flex-col gap-2 px-3 pt-0.5 pb-3.5', contentClassName)}>{children}</div>;

  if (!collapsible) {
    return (
      <section className={cx(!borderless && 'border-b border-line', className)}>
        <header className="flex h-9 items-center gap-2 px-3">
          <div className="min-w-0 flex-1">{heading}</div>
          {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
        </header>
        {children !== undefined && children !== null && body}
      </section>
    );
  }

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setOpen} asChild>
      <section className={cx(!borderless && 'border-b border-line', className)}>
        <header className="group/section flex h-9 items-center gap-1 pe-3 ps-1.5">
          <Collapsible.Trigger
            className={cx(
              'flex h-7 min-w-0 flex-1 items-center gap-1 rounded-sm pe-1.5 ps-1 text-start outline-none',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <ChevronRight
              aria-hidden
              className={cx(
                'size-3.5 shrink-0 text-text-3 transition-transform duration-(--dur) ease-out group-hover/section:text-text-2',
                isOpen && 'rotate-90',
              )}
            />
            {heading}
          </Collapsible.Trigger>
          {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
        </header>
        <Collapsible.Content className="kit-collapse">{body}</Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}

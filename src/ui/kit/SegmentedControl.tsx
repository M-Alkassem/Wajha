import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ToggleGroup } from 'radix-ui';
import { cx, type ControlSize } from './cx';
import { useFieldControl } from './fieldContext';
import { useActiveIndicator } from './hooks';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label?: ReactNode;
  icon?: ReactNode;
  /** Tooltip; icon-only options also use it as their accessible name. */
  tooltip?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  size?: ControlSize;
  /** Stretch to the container with equal-width segments. */
  fullWidth?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

const ROOT_SIZES: Record<ControlSize, string> = {
  sm: 'h-6 rounded-sm text-xs',
  md: 'h-7 rounded-sm text-xs',
  lg: 'h-9 rounded-md text-ui',
};

const ITEM_SIZES: Record<ControlSize, string> = {
  sm: 'rounded-[4px] px-2 [&_svg]:size-3.5',
  md: 'rounded-[5px] px-2.5 [&_svg]:size-3.5',
  lg: 'rounded-[7px] px-3.5 [&_svg]:size-4',
};

/* Icon-only segments are square: the control height minus its 2 px padding. */
const ICON_ONLY: Record<ControlSize, string> = {
  sm: 'w-5 px-0',
  md: 'w-6 px-0',
  lg: 'w-8 px-0',
};

/** Single-choice toggle row (radix ToggleGroup) with a thumb that glides to the chosen segment. */
export function SegmentedControl<T extends string = string>({
  value,
  onValueChange,
  options,
  size = 'md',
  fullWidth = false,
  disabled = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const field = useFieldControl();
  const optionKey = options.map((o) => o.value).join('\u0000');
  // aria-checked, not data-state: a Tooltip around an item overwrites data-state with its own.
  const rect = useActiveIndicator(rootRef, '[role="radio"][aria-checked="true"]', `${value}\u0001${optionKey}\u0001${size}\u0001${fullWidth}`);

  // The thumb appears in place first, then animates on later changes.
  const [animate, setAnimate] = useState(false);
  useLayoutEffect(() => {
    if (!rect || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [rect, animate]);

  // Measured from the left edge in either direction, so the thumb is anchored there (left-0), not at the start.
  const thumbStyle: CSSProperties | undefined = rect
    ? { transform: `translateX(${rect.left}px)`, width: rect.width }
    : undefined;

  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      value={value}
      // Radix allows deselecting the active item; a segmented control always has one.
      onValueChange={(v: string) => {
        if (v) onValueChange(v as T);
      }}
      disabled={disabled}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-label'] ? undefined : field.labelId}
      className={cx(
        'relative isolate inline-flex shrink-0 items-stretch bg-field p-0.5 select-none light:bg-field-hover',
        ROOT_SIZES[size],
        fullWidth && 'flex w-full',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {rect && (
        <span
          aria-hidden
          className={cx(
            'pointer-events-none absolute top-0.5 bottom-0.5 left-0 -z-10 bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.25),var(--highlight)] light:shadow-[0_1px_2px_rgba(16,16,40,0.12),0_0_0_0.5px_rgba(16,16,40,0.08)]',
            size === 'lg' ? 'rounded-[7px]' : size === 'md' ? 'rounded-[5px]' : 'rounded-[4px]',
            animate && 'transition-[transform,width] duration-(--dur) ease-out',
          )}
          style={thumbStyle}
        />
      )}
      {options.map((o) => {
        const iconOnly = !o.label && !!o.icon;
        const item = (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            aria-label={o['aria-label'] ?? (iconOnly ? o.tooltip : undefined)}
            className={cx(
              'relative inline-flex min-w-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap text-text-2 outline-none',
              'transition-colors duration-(--dur-fast) hover:text-text aria-checked:text-text',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:opacity-40',
              // Before the thumb is measured (first paint, no layout in tests) the item paints its own background.
              !rect && 'aria-checked:bg-raised aria-checked:shadow-sm',
              ITEM_SIZES[size],
              fullWidth && 'flex-1',
              iconOnly && ICON_ONLY[size],
              '[&_svg]:shrink-0',
            )}
          >
            {o.icon}
            {o.label && <span className="truncate">{o.label}</span>}
          </ToggleGroup.Item>
        );
        return o.tooltip ? (
          <Tooltip key={o.value} content={o.tooltip}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}

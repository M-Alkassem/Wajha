import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx, type ControlSize } from './cx';
import type { ShortcutInput } from './keys';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: becomes the accessible name and the tooltip text. */
  label: string;
  /** The icon (a lucide icon element). Children work too. */
  icon?: ReactNode;
  variant?: 'ghost' | 'solid';
  size?: ControlSize;
  /** Pressed/toggled state; also sets aria-pressed when defined. */
  active?: boolean;
  /** Shortcut shown in the tooltip. */
  shortcut?: ShortcutInput;
  /** Tooltip override; false hides the tooltip (the label still names the button). */
  tooltip?: ReactNode | false;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  loading?: boolean;
}

const SIZES: Record<ControlSize, string> = {
  sm: 'size-6 rounded-sm [&_svg]:size-3.5',
  md: 'size-7 rounded-sm [&_svg]:size-4',
  lg: 'size-9 rounded-md [&_svg]:size-[18px]',
};

/*
 * Colours of each variant, off and toggled on. A toggle that is on gets its
 * own set instead of overrides added after the off one: the stylesheet
 * orders utilities by name, not by class order, so bg-surface would beat
 * bg-accent-soft and hover:text-text would beat hover:text-accent-fg. On
 * stays tinted while hovered.
 */
const COLORS: Record<'ghost' | 'solid', { off: string; on: string }> = {
  ghost: {
    off: 'text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3',
    on: 'bg-accent-soft text-accent-fg active:bg-surface-3',
  },
  solid: {
    off: 'border border-line bg-surface text-text-2 shadow-[var(--highlight)] hover:bg-surface-2 hover:text-text active:bg-surface-3 light:bg-raised light:shadow-sm',
    on: 'border border-line bg-accent-soft text-accent-fg shadow-[var(--highlight)] active:bg-surface-3 light:shadow-sm',
  },
};

/** Square icon-only button with a mandatory label and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    children,
    variant = 'ghost',
    size = 'md',
    active,
    shortcut,
    tooltip,
    tooltipSide = 'top',
    loading = false,
    disabled,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      data-active={active ? '' : undefined}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center outline-none',
        'transition-[background-color,color,box-shadow] duration-(--dur-fast) ease-out',
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-40',
        SIZES[size],
        COLORS[variant][active ? 'on' : 'off'],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 16 : 14} label={null} /> : (icon ?? children)}
    </button>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});

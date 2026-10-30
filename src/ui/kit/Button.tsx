import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx, type ControlSize } from './cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** secondary (default) for most actions, primary for the main one, brand only for Export. */
  variant?: ButtonVariant;
  size?: ControlSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  fullWidth?: boolean;
}

const BASE =
  'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium outline-none ' +
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-(--dur-fast) ease-out ' +
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-busy:opacity-100';

const SIZES: Record<ControlSize, string> = {
  sm: 'h-6 gap-1 rounded-sm px-2 text-xs [&_svg]:size-3.5',
  md: 'h-7 gap-1.5 rounded-sm px-2.5 text-ui [&_svg]:size-3.5',
  lg: 'h-9 gap-2 rounded-md px-4 text-ui [&_svg]:size-4',
};

/* Hover and pressed states are fills of their own (never a filter, which
   would dim the label too); tokens.css keeps their white text at 4.5:1. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-text shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.25)] hover:bg-accent-2 active:bg-accent-3',
  secondary:
    'border border-line-strong bg-surface text-text shadow-[var(--highlight),var(--shadow-sm)] hover:bg-surface-2 active:bg-surface-3 ' +
    'light:bg-raised light:hover:bg-surface light:active:bg-surface-2',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3',
  danger:
    'bg-danger-solid text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(0,0,0,0.25)] hover:bg-danger-solid-2 active:bg-(--danger-solid-3)',
  brand: 'kit-brand font-semibold text-white',
};

/* A disabled gradient at low opacity reads as dirty, so a disabled brand
   button goes neutral. A loading one is busy, not unavailable: it keeps the
   gradient, which is why this is applied only when not loading. */
const BRAND_DISABLED =
  'disabled:bg-none disabled:bg-surface-2 disabled:text-text-3 disabled:opacity-70 disabled:shadow-none disabled:[text-shadow:none]';

/** The kit's button. Defaults to type="button" so it never submits a form by accident. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const spinnerSize = size === 'lg' ? 16 : 14;
  // Without a leading icon the spinner overlays the label so the width never jumps.
  const overlaySpinner = loading && !leadingIcon;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={cx(BASE, SIZES[size], VARIANTS[variant], variant === 'brand' && !loading && BRAND_DISABLED, fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && leadingIcon ? <Spinner size={spinnerSize} label={null} /> : leadingIcon}
      {overlaySpinner ? (
        <>
          <span className="invisible inline-flex items-center gap-[inherit]">
            {children}
            {trailingIcon}
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={spinnerSize} label={null} />
          </span>
        </>
      ) : (
        <>
          {children !== undefined && children !== null && children !== false && <span className="truncate">{children}</span>}
          {trailingIcon}
        </>
      )}
    </button>
  );
});

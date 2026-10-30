/**
 * Small presentational pieces: Divider, Card, Skeleton, Badge, ProgressBar.
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

/* Divider ------------------------------------------------------------------ */

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Centered text such as "or". */
  label?: ReactNode;
  /** Purely visual (role="none"); default true. */
  decorative?: boolean;
  className?: string;
}

/** Hairline separator, optionally with a centered label. */
export function Divider({ orientation = 'horizontal', label, decorative = true, className }: DividerProps) {
  const a11y = decorative ? { role: 'none' } : { role: 'separator', 'aria-orientation': orientation };
  if (orientation === 'vertical') {
    return <div {...a11y} className={cx('w-px shrink-0 self-stretch bg-line', className)} />;
  }
  if (label) {
    return (
      <div {...a11y} className={cx('flex items-center gap-3 text-2xs font-medium text-text-3', className)}>
        <span className="h-px flex-1 bg-line" />
        <span>{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <div {...a11y} className={cx('h-px w-full shrink-0 bg-line', className)} />;
}

/* Card ----------------------------------------------------------------------- */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover lift and pointer affordance for clickable cards. Add tabIndex/role/onClick yourself. */
  interactive?: boolean;
  selected?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const CARD_PADDING = { none: '', sm: 'p-2', md: 'p-3', lg: 'p-5' } as const;

/** Raised container for grouped content: project thumbnails, template tiles, settings groups. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, selected = false, padding = 'md', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-selected={selected ? '' : undefined}
      className={cx(
        'relative rounded-lg border border-line bg-surface shadow-[var(--highlight)] light:bg-raised light:shadow-sm',
        CARD_PADDING[padding],
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-(--dur) ease-out outline-none hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus',
        // A ring composes with the card's own shadows instead of replacing them.
        selected && 'border-transparent ring-2 ring-accent hover:border-transparent',
        className,
      )}
      {...rest}
    />
  );
});

/* Skeleton --------------------------------------------------------------------- */

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: 'xs' | 'sm' | 'md' | 'lg' | 'full';
  /** Render this many text-line placeholders instead of one block (the last one shorter). */
  lines?: number;
  className?: string;
}

const RADIUS = { xs: 'rounded-xs', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' } as const;

/** Shimmering placeholder while content loads. Hidden from assistive tech. */
export function Skeleton({ width, height = 12, radius = 'sm', lines, className }: SkeletonProps) {
  if (lines && lines > 0) {
    const count = Math.min(50, Math.floor(lines));
    return (
      <div aria-hidden className={cx('flex flex-col gap-2', className)} style={{ width }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={cx('kit-shimmer bg-surface-2', RADIUS[radius])} style={{ height, width: i === count - 1 && count > 1 ? '62%' : '100%' }} />
        ))}
      </div>
    );
  }
  return <div aria-hidden className={cx('kit-shimmer bg-surface-2', RADIUS[radius], className)} style={{ width, height }} />;
}

/* Badge ------------------------------------------------------------------------- */

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  /** Status dot before the text. */
  dot?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  title?: string;
}

const BADGE_VARIANTS: Record<BadgeVariant, { box: string; dot: string }> = {
  neutral: { box: 'border-line bg-surface-2 text-text-2', dot: 'bg-text-3' },
  accent: { box: 'border-accent-soft bg-accent-soft text-accent-fg', dot: 'bg-accent-fg' },
  success: { box: 'border-success-soft bg-success-soft text-success', dot: 'bg-success' },
  warning: { box: 'border-warning-soft bg-warning-soft text-warning', dot: 'bg-warning' },
  danger: { box: 'border-danger-soft bg-danger-soft text-danger', dot: 'bg-danger' },
};

/** Compact status label: counts, "New", "Required", warnings. */
export function Badge({ variant = 'neutral', size = 'md', dot = false, icon, children, className, title }: BadgeProps) {
  const v = BADGE_VARIANTS[variant];
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 border font-medium whitespace-nowrap tabular-nums [&_svg]:size-3',
        size === 'sm' ? 'h-4 rounded-[4px] px-1 text-[10px] leading-none' : 'h-5 rounded-[5px] px-1.5 text-2xs',
        v.box,
        className,
      )}
    >
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full', v.dot)} />}
      {icon}
      {children}
    </span>
  );
}

/* ProgressBar --------------------------------------------------------------------- */

export interface ProgressBarProps {
  /** 0..1, or null/undefined for an indeterminate bar. */
  value?: number | null;
  size?: 'sm' | 'md';
  tone?: 'accent' | 'brand' | 'success' | 'danger';
  /** Accessible name, e.g. "Exporting screenshots". */
  label?: string;
  /** Show the percentage to the right. */
  showValue?: boolean;
  className?: string;
}

const TONE: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  accent: 'bg-accent',
  brand: 'bg-[image:var(--brand-gradient)]',
  success: 'bg-success',
  danger: 'bg-danger',
};

/** Determinate progress (0..1) or an indeterminate shimmer when `value` is null. */
export function ProgressBar({ value, size = 'md', tone = 'accent', label, showValue = false, className }: ProgressBarProps) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const pct = determinate ? Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10 : 0;
  const fill: CSSProperties = { width: `${pct}%` };
  return (
    <div className={cx('flex w-full min-w-0 items-center gap-2.5', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(pct) : undefined}
        className={cx('relative w-full overflow-hidden rounded-full bg-surface-3', size === 'sm' ? 'h-1' : 'h-1.5')}
      >
        {determinate ? (
          <div className={cx('h-full rounded-full transition-[width] duration-(--dur-slow) ease-out', TONE[tone])} style={fill} />
        ) : (
          <div className={cx('kit-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full', TONE[tone])} />
        )}
      </div>
      {showValue && determinate && <span className="w-9 shrink-0 text-right text-xs text-text-2 tabular-nums">{Math.round(pct)}%</span>}
    </div>
  );
}

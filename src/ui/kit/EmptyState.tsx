import type { ReactNode } from 'react';
import { cx } from './cx';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icon shown in the default brand tile (ignored when `illustration` is set). */
  icon?: ReactNode;
  /** Custom artwork replacing the icon tile. */
  illustration?: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Centered placeholder for empty lists and first runs. One of the few places
 * the sunset brand gradient appears: a soft glow behind the icon tile.
 */
export function EmptyState({ title, description, icon, illustration, actions, size = 'md', className }: EmptyStateProps) {
  const sm = size === 'sm';
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', sm ? 'gap-3 p-4' : 'gap-4 p-8', className)}>
      {illustration ?? (
        <div className={cx('relative flex items-center justify-center', sm ? 'size-12' : 'size-16')}>
          <div aria-hidden className="kit-glow pointer-events-none absolute -inset-15 opacity-25" />
          <div
            className={cx(
              'relative flex size-full items-center justify-center border border-line-strong bg-popover text-text-2 shadow-md',
              'bg-[image:var(--brand-gradient-soft)]',
              sm ? 'rounded-[14px] [&_svg]:size-5' : 'rounded-[18px] [&_svg]:size-6',
            )}
          >
            {icon}
          </div>
        </div>
      )}
      <div className={cx('flex max-w-[360px] flex-col', sm ? 'gap-1' : 'gap-1.5')}>
        <h3 className={cx('font-semibold tracking-[-0.01em] text-text', sm ? 'text-ui' : 'text-[15px] leading-5')}>{title}</h3>
        {description && <p className={cx('text-text-2', sm ? 'text-xs leading-4' : 'text-ui leading-[19px]')}>{description}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

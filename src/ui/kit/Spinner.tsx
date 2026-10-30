import { cx } from './cx';

export interface SpinnerProps {
  /** Pixel size (default 16). */
  size?: number;
  /** Accessible label; pass null when the spinner sits inside something already marked busy. */
  label?: string | null;
  className?: string;
}

/** Indeterminate activity indicator that inherits the text colour. */
export function Spinner({ size = 16, label = 'Loading', className }: SpinnerProps) {
  const a11y = label === null ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label };
  return (
    <svg
      {...a11y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('kit-spin shrink-0', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

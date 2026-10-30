import { useId } from 'react';
import { ARCH, ARCH_PATH, ISLAND_PATH, MARK_VIEWBOX, NIGHT, PHONE_PATH, SUNSET_STOPS } from './mark';

export interface LogoProps {
  /** Pixel size of the square mark (default 24). */
  size?: number;
  /** color: sunset arch with a night phone; mono: one colour (currentColor) with the phone cut out. */
  variant?: 'color' | 'mono';
  /** Accessible name; null makes the mark decorative (e.g. next to the wordmark text). */
  title?: string | null;
  className?: string;
}

/** The Wajha mark: a sunset-lit arched shop window with a phone standing in it. */
export function Logo({ size = 24, variant = 'color', title = 'Wajha', className }: LogoProps) {
  // useId output contains characters that are awkward inside url(#...); keep it alphanumeric.
  const gid = `wajha-sunset-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      {...a11y}
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {variant === 'mono' ? (
        <path d={`${ARCH_PATH}${PHONE_PATH}`} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1={ARCH.top} x2="0" y2={ARCH.bottom} gradientUnits="userSpaceOnUse">
              {SUNSET_STOPS.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
          </defs>
          <path d={ARCH_PATH} fill={`url(#${gid})`} />
          <path d={PHONE_PATH} fill={NIGHT} />
          {/* The island is sub-pixel below ~40 px; it only adds noise there. */}
          {size >= 40 && <path d={ISLAND_PATH} fill={`url(#${gid})`} opacity={0.55} />}
        </>
      )}
    </svg>
  );
}

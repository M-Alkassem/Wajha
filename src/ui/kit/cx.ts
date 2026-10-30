/**
 * Class name joiner. Only non-empty strings count, so `node && 'class'`
 * works with any ReactNode-ish condition (0, 0n, true and null are skipped).
 */
export type ClassValue = string | number | bigint | boolean | null | undefined;

export function cx(...parts: ClassValue[]): string {
  let out = '';
  for (const part of parts) {
    if (typeof part !== 'string' || part === '') continue;
    out = out ? `${out} ${part}` : part;
  }
  return out;
}

/** Shared control sizes: sm 24 px, md 28 px, lg 36 px tall. */
export type ControlSize = 'sm' | 'md' | 'lg';

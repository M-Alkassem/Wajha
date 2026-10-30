import { cx } from './cx';
import { formatShortcut, platformIsMac, shortcutLabel, shortcutText, type ShortcutInput } from './keys';

export interface KbdProps {
  /** Platform-neutral shortcut, e.g. "mod+shift+z" ("mod" is ⌘ on macOS, Ctrl elsewhere). */
  keys: ShortcutInput;
  /**
   * default: keycaps for panels and menus; inverse: keycaps on dark tooltips;
   * plain: one run of text, the macOS menu style ("⌘⇧Z").
   */
  tone?: 'default' | 'inverse' | 'plain';
  /** Overrides platform detection (tests, docs). */
  mac?: boolean;
  className?: string;
}

/** Renders a keyboard shortcut with the right symbols for the platform. */
export function Kbd({ keys, tone = 'default', mac, className }: KbdProps) {
  const isMac = mac ?? platformIsMac();
  const label = shortcutLabel(keys, isMac);
  if (tone === 'plain') {
    return (
      <kbd
        aria-label={label}
        className={cx('font-sans text-xs tracking-[0.06em] text-text-3 tabular-nums', className)}
      >
        {shortcutText(keys, isMac)}
      </kbd>
    );
  }
  const parts = formatShortcut(keys, isMac);
  return (
    <kbd aria-label={label} className={cx('inline-flex items-center gap-[3px] font-sans', className)}>
      {parts.map((part, i) => (
        <kbd
          key={`${part}-${i}`}
          aria-hidden
          className={cx(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-1 text-2xs leading-none font-medium tabular-nums',
            tone === 'inverse'
              ? 'bg-[rgba(255,255,255,0.13)] text-[rgba(255,255,255,0.82)]'
              : 'border border-line bg-surface-2 text-text-2 shadow-[inset_0_-1px_0_var(--line)]',
          )}
        >
          {part}
        </kbd>
      ))}
    </kbd>
  );
}

/**
 * Small presentational pieces shared by the editor dialogs.
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Smartphone } from 'lucide-react';
import type { FamilyId } from '../../../model/types';
import { cx } from '../../kit';
import { FAMILY_ICONS } from '../familyMeta';
import { prefersReducedMotion } from './dialogState';

/** The device icon of a family. */
export function FamilyIcon({ family, className }: { family: FamilyId; className?: string }) {
  const Icon = FAMILY_ICONS[family] ?? Smartphone;
  return <Icon aria-hidden className={className} />;
}

/** Quiet uppercase heading for a group of controls (the kit's panel title style). */
export function SectionHeading({ children, trailing, id, className }: { children: ReactNode; trailing?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx('flex min-h-5 items-center justify-between gap-3', className)}>
      <h3 id={id} className="text-2xs font-semibold tracking-[0.06em] text-text-3 uppercase">
        {children}
      </h3>
      {trailing}
    </div>
  );
}

export interface RadioCardOption<T extends string> {
  value: T;
  title: string;
  description: string;
  icon: ReactNode;
}

export interface RadioCardsProps<T extends string> {
  value: T;
  onValueChange(value: T): void;
  options: readonly RadioCardOption<T>[];
  'aria-labelledby'?: string;
  'aria-label'?: string;
  className?: string;
}

/** A radio group drawn as cards: one tab stop, arrow keys move the choice (WAI-ARIA radio group). */
export function RadioCards<T extends string>({ value, onValueChange, options, className, ...aria }: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" {...aria} className={cx('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === active ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              'group/radio relative flex min-w-0 flex-col items-start gap-1 rounded-lg border px-3 pt-2.5 pb-3 text-left outline-none',
              'transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-out',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              checked
                ? 'border-accent-line bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent-line)]'
                : 'border-line bg-surface shadow-[var(--highlight)] hover:border-line-strong hover:bg-surface-2 light:bg-raised light:hover:bg-surface',
            )}
          >
            <span className="mb-1 flex w-full items-center justify-between">
              <span className={cx('flex size-7 items-center justify-center rounded-md [&_svg]:size-4', checked ? 'bg-accent text-accent-text' : 'bg-surface-2 text-text-2 light:bg-surface')}>
                {o.icon}
              </span>
              <span
                aria-hidden
                className={cx(
                  'flex size-3.5 items-center justify-center rounded-full border transition-colors duration-(--dur-fast)',
                  checked ? 'border-accent bg-accent' : 'border-line-strong bg-field',
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-accent-text" />}
              </span>
            </span>
            <span className="text-ui font-medium text-text">{o.title}</span>
            <span className="text-xs leading-4 text-text-2">{o.description}</span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_TONES = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-text-2',
} as const;

/** A large round status icon that pops in once (done, stopped, failed states). */
export function StatusMark({ tone, children }: { tone: keyof typeof STATUS_TONES; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    const anim = el.animate(
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
    return () => anim.cancel();
  }, []);
  return (
    <div ref={ref} className="relative flex size-14 items-center justify-center">
      {tone === 'success' && (
        <div aria-hidden className="pointer-events-none absolute -inset-15 opacity-15 [background:radial-gradient(closest-side,var(--success),transparent)]" />
      )}
      <div className={cx('relative flex size-14 items-center justify-center rounded-full [&_svg]:size-7', STATUS_TONES[tone])}>{children}</div>
    </div>
  );
}

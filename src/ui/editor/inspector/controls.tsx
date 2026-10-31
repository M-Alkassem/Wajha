/**
 * Small building blocks shared by the inspector panels: sections that
 * remember whether they are open, slider + number rows, the rotation dial,
 * hint lines and status dots.
 */
import { memo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Field, NumberField, Section, Slider, cx, type FieldProps } from '../../kit';
import { dialTurnStarted, normalizeRotation, rotationFromPointer } from './format';
import { useLive } from './live';

import { t } from '../../../i18n';
/* Sections ---------------------------------------------------------------- */

/** Open/closed state per section id, for the session (not persisted). */
const openSections = new Map<string, boolean>();

function useSectionOpen(id: string, defaultOpen = true): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => openSections.get(id) ?? defaultOpen);
  const set = useCallback(
    (next: boolean) => {
      openSections.set(id, next);
      setOpen(next);
    },
    [id],
  );
  return [open, set];
}

export interface InspectorSectionProps {
  /** Stable id: the open state is remembered per id while the app runs. */
  id: string;
  title: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  /** Each new non-null value opens the section (e.g. when its field is asked to take focus). */
  openSignal?: number | null;
  borderless?: boolean;
  children?: ReactNode;
  contentClassName?: string;
}

/** Kit Section that remembers whether the user collapsed it. */
export function InspectorSection({ id, title, action, defaultOpen = true, openSignal = null, borderless, children, contentClassName }: InspectorSectionProps) {
  const [open, setOpen] = useSectionOpen(id, defaultOpen);
  useEffect(() => {
    if (openSignal !== null) setOpen(true);
  }, [openSignal, setOpen]);
  return (
    <Section title={title} action={action} open={open} onOpenChange={setOpen} borderless={borderless} contentClassName={contentClassName}>
      {children}
    </Section>
  );
}

/* Rows -------------------------------------------------------------------- */

/**
 * Label column width of inspector rows. With the Field's 8 px gap, controls
 * start 62 px in, exactly where the kit FillEditor's own rows put theirs.
 */
export const LABEL_WIDTH = 54;

/** Kit Field (label + control) with the inspector's label column. */
export function Row(props: FieldProps) {
  return <Field labelWidth={LABEL_WIDTH} {...props} />;
}

/** Two equal columns of compact controls (X / Y, W / H...). */
export function Pair({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-2 gap-2', className)}>{children}</div>;
}

/** Quiet explanatory line under a control. */
export function Hint({ icon, children, tone = 'muted', className }: { icon?: ReactNode; children: ReactNode; tone?: 'muted' | 'warning'; className?: string }) {
  return (
    <p
      className={cx(
        'flex items-start gap-1.5 text-xs leading-4 [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0',
        tone === 'warning' ? 'text-warning' : 'text-text-3',
        className,
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export type DotTone = 'success' | 'warning' | 'danger' | 'muted';

const DOT: Record<DotTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-text-3',
};

export function StatusDot({ tone, className }: { tone: DotTone; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-1.5 shrink-0 rounded-full', DOT[tone], className)} />;
}

export interface SliderRowProps {
  label: string;
  /** Value in display units (percent, degrees...). */
  value: number;
  /** Receives display units; called at most once per frame while dragging. */
  apply: (value: number) => void;
  /** Range of the slider. */
  min: number;
  max: number;
  /** Range accepted when typing (defaults to the slider's). */
  inputMin?: number;
  inputMax?: number;
  step?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  hint?: ReactNode;
}

/** Field row with a slider and a number field bound to the same value, one undo step per interaction. */
export const SliderRow = memo(function SliderRow({
  label,
  value,
  apply,
  min,
  max,
  inputMin,
  inputMax,
  step = 1,
  precision,
  unit,
  disabled,
  hint,
}: SliderRowProps) {
  const live = useLive<number>(apply);
  const sliderId = useId();
  return (
    <Row label={label} hint={hint}>
      <div className="flex min-w-0 items-center gap-2">
        <Slider
          id={sliderId}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={live.onChange}
          onCommit={live.onCommit}
          onScrubEnd={live.onScrubEnd}
          className="min-w-0 flex-1"
        />
        <NumberField
          value={value}
          min={inputMin ?? min}
          max={inputMax ?? max}
          step={step}
          precision={precision}
          unit={unit}
          disabled={disabled}
          onChange={live.onChange}
          onCommit={live.onCommit}
          onScrubEnd={live.onScrubEnd}
          className="w-[64px] shrink-0"
          inputClassName="text-end"
        />
      </div>
    </Row>
  );
});

/* Rotation dial ----------------------------------------------------------- */

export interface RotationDialProps {
  /** Degrees clockwise. */
  value: number;
  onChange: (deg: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}

interface DialPress {
  pointerId: number;
  x: number;
  y: number;
  /** Past the threshold: the dial follows the pointer. */
  turning: boolean;
}

/**
 * Round knob for element rotation: drag around it (Shift snaps to 15°),
 * use the arrow keys (Shift = 15°), double-click to reset to 0°.
 */
export const RotationDial = memo(function RotationDial({ value, onChange, onCommit, disabled }: RotationDialProps) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<DialPress | null>(null);
  const deg = normalizeRotation(value);

  useEffect(
    () => () => {
      if (press.current?.turning) document.documentElement.classList.remove('kit-dragging');
    },
    [],
  );

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return rotationFromPointer(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), e.shiftKey);
  };

  const finish = () => {
    const p = press.current;
    press.current = null;
    if (!p?.turning) return;
    document.documentElement.classList.remove('kit-dragging');
    onCommit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 15 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = deg + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = deg - step;
    else if (e.key === 'Home' || e.key === '0') next = 0;
    if (next === null) return;
    e.preventDefault();
    onChange(normalizeRotation(next));
    onCommit();
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t('Rotation dial')}
      aria-valuemin={-180}
      aria-valuemax={180}
      aria-valuenow={Math.round(deg)}
      aria-valuetext={`${Math.round(deg)}°`}
      aria-disabled={disabled || undefined}
      title={t('Drag to rotate · Shift snaps to 15° · double-click resets')}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointers cannot be captured; moves still arrive while over the dial.
        }
        press.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, turning: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        if (!p.turning) {
          if (!dialTurnStarted(e.clientX - p.x, e.clientY - p.y)) return;
          p.turning = true;
          document.documentElement.classList.add('kit-dragging');
        }
        const next = at(e);
        if (next !== null) onChange(next);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={() => {
        if (disabled || deg === 0) return;
        onChange(0);
        onCommit();
      }}
      onKeyDown={onKeyDown}
      className={cx(
        'relative size-7 shrink-0 cursor-grab rounded-full border border-line bg-field outline-none active:cursor-grabbing light:bg-raised',
        'shadow-[var(--highlight)] transition-colors duration-(--dur-fast) hover:border-line-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span aria-hidden className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
        <span className="absolute top-[3px] left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-accent-fg" />
      </span>
      <span aria-hidden className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-3" />
    </div>
  );
});

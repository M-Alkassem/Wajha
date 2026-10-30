import { useCallback, useEffect, useRef, useState } from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cx } from './cx';
import { useFieldControl } from './fieldContext';
import { useLatest } from './hooks';
import { formatNumber, precisionFromStep } from './number';

export interface SliderProps {
  value: number;
  /** Live updates while dragging or stepping. */
  onChange: (value: number) => void;
  /** Once when the interaction ends (pointer up, each keyboard step). */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Value bubble over the thumb: while interacting (true) or permanently ('always'). */
  bubble?: boolean | 'always';
  /** Formats the bubble and aria-valuetext, e.g. (v) => `${v}%`. */
  format?: (value: number) => string;
  /** Bracket a pointer drag so the app can coalesce it into one undo step. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  'aria-label'?: string;
  id?: string;
  className?: string;
}

/** Horizontal slider with an optional value bubble. */
export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  bubble = false,
  format,
  onScrubStart,
  onScrubEnd,
  className,
  ...aria
}: SliderProps) {
  const field = useFieldControl({ id: aria.id });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const endRef = useLatest(onScrubEnd);

  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const label = format ? format(safe) : formatNumber(safe, precisionFromStep(step));

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    endRef.current?.();
  }, [endRef]);

  // Pointer up can land anywhere (outside the window even), so listen globally while dragging.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [dragging, stopDragging]);

  useEffect(() => () => stopDragging(), [stopDragging]);

  return (
    <SliderPrimitive.Root
      value={[safe]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => {
        const next = v[0];
        if (next !== undefined && next !== value) onChange(next);
      }}
      onValueCommit={(v) => {
        const next = v[0];
        if (next !== undefined) onCommit?.(next);
      }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0 || draggingRef.current) return;
        draggingRef.current = true;
        setDragging(true);
        onScrubStart?.();
      }}
      className={cx(
        'group/slider relative flex h-5 w-full min-w-0 touch-none items-center select-none',
        disabled && 'pointer-events-none opacity-45',
        className,
      )}
    >
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        id={field.id}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-label'] ? undefined : field.labelId}
        aria-describedby={field['aria-describedby']}
        aria-valuetext={label}
        data-dragging={dragging ? '' : undefined}
        className={cx(
          'group/thumb relative block size-3.5 rounded-full bg-knob outline-none',
          'shadow-[0_0_0_1px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.35)] transition-[transform,box-shadow] duration-(--dur-fast) ease-out',
          'hover:scale-110 focus-visible:shadow-[0_0_0_1px_rgba(0,0,0,0.14),0_0_0_4px_var(--focus-soft),0_1px_3px_rgba(0,0,0,0.35)]',
          dragging && 'scale-110',
        )}
      >
        {bubble && (
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xs bg-tooltip px-1.5 py-0.5',
              'text-2xs font-medium whitespace-nowrap text-tooltip-text tabular-nums shadow-md transition-[opacity,transform] duration-(--dur-fast) ease-out',
              bubble === 'always' || dragging
                ? 'opacity-100'
                : 'translate-y-0.5 opacity-0 group-hover/thumb:translate-y-0 group-hover/thumb:opacity-100 group-focus-visible/thumb:translate-y-0 group-focus-visible/thumb:opacity-100',
            )}
          >
            {label}
          </span>
        )}
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
}

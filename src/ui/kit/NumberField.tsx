import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cx, type ControlSize } from './cx';
import { useFieldControl } from './fieldContext';
import { useEscapeClaim, useLatest } from './hooks';
import { FIELD_SHELL } from './Input';
import { formatNumber, modifierMultiplier, precisionFromStep, sameAtPrecision, scrubAccumulate, scrubValue, stepValue, valueFromFieldText } from './number';

export interface NumberFieldProps {
  /** Current value. NaN shows the placeholder (e.g. "Mixed" for a multi-selection). */
  value: number;
  /** Every change: typed commits, arrow steps and each scrub move. */
  onChange: (value: number) => void;
  /** Once per finished interaction (Enter, blur, an arrow step, the end of a scrub that sent changes). */
  onCommit?: (value: number) => void;
  /** Scrub handle: drag it horizontally to change the value. Text ("X", "W") or an icon. */
  label?: ReactNode;
  /** Accessible name when there is no Field around and the label is not plain text. */
  'aria-label'?: string;
  /** Tooltip on the scrub handle. */
  labelTitle?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Decimals kept and shown; defaults to the step's decimals. */
  precision?: number;
  /** Suffix such as "%", "°" or "px"; it may also be typed. */
  unit?: string;
  /** Wrap around min/max instead of clamping (angles). */
  wrap?: boolean;
  /** Steps per pixel while scrubbing (default 1). Shift = x10, Alt = x0.1. */
  speed?: number;
  size?: ControlSize;
  /** bare drops the field chrome for embedding in another control. */
  variant?: 'default' | 'bare';
  disabled?: boolean;
  placeholder?: string;
  /** Committed when the text is cleared, e.g. 0 for "no limit". Without it, clearing keeps the current value. */
  emptyValue?: number;
  /** Bracket a scrub so the app can coalesce it into one undo step. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /**
   * Escape during a scrub, instead of onScrubEnd: the app puts back the value
   * from before the scrub (without an undo step). Without it, the field puts
   * the start value back through onChange.
   */
  onScrubCancel?: () => void;
  id?: string;
  name?: string;
  className?: string;
  inputClassName?: string;
}

const SIZES: Record<ControlSize, string> = {
  sm: 'h-6 gap-1 rounded-sm px-1.5 text-xs',
  md: 'h-7 gap-1.5 rounded-sm px-2 text-xs',
  lg: 'h-9 gap-2 rounded-md px-3 text-ui',
};

/** Pointer travel before a press on the label counts as a scrub rather than a click. */
const SCRUB_THRESHOLD = 3;

interface ScrubState {
  pointerId: number;
  target: Element;
  startX: number;
  lastX: number;
  raw: number;
  start: number;
  last: number;
  active: boolean;
  /** onChange was called: the scrub must end with a commit even if it came back to `start`. */
  changed: boolean;
}

/**
 * Numeric input for inspectors: type (with units and arithmetic), step with
 * the arrow keys, or scrub by dragging the label like in Figma.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(props, ref) {
  const {
    value,
    onChange,
    onCommit,
    label,
    labelTitle,
    min = -Infinity,
    max = Infinity,
    step: stepProp = 1,
    precision: precisionProp,
    unit,
    wrap = false,
    speed = 1,
    size = 'md',
    variant = 'default',
    disabled = false,
    placeholder,
    emptyValue,
    onScrubStart,
    onScrubEnd,
    onScrubCancel,
    name,
    className,
    inputClassName,
  } = props;

  // A zero, negative or NaN step would freeze arrows and scrubbing; fall back to 1.
  const step = Number.isFinite(stepProp) && stepProp > 0 ? stepProp : 1;
  const precision = precisionProp ?? precisionFromStep(step);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  const ownLabelId = useId();
  const field = useFieldControl({ id: props.id });
  const hasLabelText = typeof label === 'string' || typeof label === 'number';
  // With its own short label ("X"), the field is named "<Field label> X" and
  // leaves the Field's id to a sibling; alone in a Field it takes the id.
  const hasLabel = label !== undefined && label !== null && label !== false;
  const inputId = hasLabel && props.id === undefined ? undefined : field.id;
  // An icon label carries no text, so the name comes from the Field (or aria-label) alone.
  const labelledBy = props['aria-label']
    ? undefined
    : [hasLabel ? field.labelId : undefined, hasLabelText ? ownLabelId : undefined].filter(Boolean).join(' ') || undefined;

  const [editing, setEditingState] = useState<string | null>(null);
  // The typed text, readable from the unmount cleanup below (which only sees the first render's state).
  const draft = useRef<string | null>(null);
  const setEditing = useCallback((text: string | null) => {
    draft.current = text;
    setEditingState(text);
  }, []);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubRef = useRef<ScrubState | null>(null);
  const selectAfterRender = useRef(false);
  const pointerFocus = useRef(false);

  const latest = useRef({ value, onChange, onCommit, onScrubStart, onScrubEnd, onScrubCancel });
  useLayoutEffect(() => {
    latest.current = { value, onChange, onCommit, onScrubStart, onScrubEnd, onScrubCancel };
  });

  const display = formatNumber(value, precision);

  const emit = useCallback(
    (next: number) => {
      const { value: current, onChange: change, onCommit: commit } = latest.current;
      // Nothing the field shows would change (an arrow step against a limit): keep the value and its hidden decimals.
      if (sameAtPrecision(next, current, precision)) return;
      change(next);
      commit?.(next);
    },
    [precision],
  );

  /** The value typed text stands for, or null to keep the current one. */
  const typedValue = useCallback(
    (text: string): number | null => valueFromFieldText(text, { unit, current: latest.current.value, emptyValue, min, max, precision, wrap }),
    [emptyValue, max, min, precision, unit, wrap],
  );

  /** Parses typed text and commits it; returns the resulting value. */
  const commitText = useCallback(
    (text: string): number => {
      const next = typedValue(text);
      if (next === null) return latest.current.value;
      emit(next);
      return next;
    },
    [emit, typedValue],
  );
  const commitTextRef = useLatest(commitText);
  useEscapeClaim(editing !== null, inputRef);

  useLayoutEffect(() => {
    if (selectAfterRender.current && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.select();
    }
    selectAfterRender.current = false;
  });

  /* Typing ------------------------------------------------------------- */

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editing !== null) commitText(editing);
      setEditing(null);
      selectAfterRender.current = true;
      return;
    }
    if (e.key === 'Escape') {
      if (editing !== null) {
        e.preventDefault();
        e.stopPropagation();
        setEditing(null);
        selectAfterRender.current = true;
      } else {
        e.currentTarget.blur();
      }
      return;
    }
    const dir = e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : e.key === 'ArrowDown' || e.key === 'PageDown' ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    const current = latest.current.value;
    const base = editing !== null ? (typedValue(editing) ?? current) : current;
    const page = e.key === 'PageUp' || e.key === 'PageDown' ? 10 : 1;
    const next = stepValue(base, dir, { step, multiplier: modifierMultiplier(e) * page, min, max, precision, wrap });
    emit(next);
    setEditing(null);
    selectAfterRender.current = true;
  };

  /* Scrubbing ---------------------------------------------------------- */

  const finishScrub = useCallback((revert: boolean) => {
    const s = scrubRef.current;
    if (!s) return;
    scrubRef.current = null;
    try {
      if (s.target.hasPointerCapture(s.pointerId)) s.target.releasePointerCapture(s.pointerId);
    } catch {
      // The element may already be detached; capture is gone either way.
    }
    if (!s.active) return;
    document.documentElement.classList.remove('kit-scrubbing');
    setScrubbing(false);
    const { onChange: change, onCommit: commit, onScrubEnd: end, onScrubCancel: cancel } = latest.current;
    if (revert && cancel) {
      cancel();
      return;
    }
    if (revert && s.last !== s.start) {
      change(s.start);
      s.last = s.start;
    }
    end?.();
    // Apps open their history gesture on the first change and close it on the commit.
    if (s.changed) commit?.(s.last);
  }, []);

  // Unmounting (the selection changed, a panel or popover closed) finishes what was going on:
  // a scrub closes its gesture, and typed text is kept, as leaving the field would.
  useEffect(
    () => () => {
      finishScrub(false);
      const text = draft.current;
      draft.current = null;
      if (text !== null) commitTextRef.current(text);
    },
    [finishScrub, commitTextRef],
  );

  useEffect(() => {
    if (!scrubbing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finishScrub(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [scrubbing, finishScrub]);

  const onLabelPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0 || scrubRef.current) return;
    e.preventDefault();
    const current = latest.current.value;
    const start = Number.isFinite(current) ? current : Number.isFinite(min) ? min : 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; moves still arrive while over the label.
    }
    scrubRef.current = {
      pointerId: e.pointerId,
      target: e.currentTarget,
      startX: e.clientX,
      lastX: e.clientX,
      raw: start,
      start,
      last: start,
      active: false,
      changed: false,
    };
  };

  const onLabelPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    if (!s.active) {
      if (Math.abs(e.clientX - s.startX) < SCRUB_THRESHOLD) return;
      s.active = true;
      // Typed but uncommitted text becomes the starting point of the scrub.
      // Blurring commits it (once, through onBlur); here we only compute it.
      const input = inputRef.current;
      if (editing !== null) s.start = s.last = s.raw = typedValue(editing) ?? latest.current.value;
      if (input && document.activeElement === input) input.blur();
      else if (editing !== null) {
        commitText(editing);
        setEditing(null);
      }
      document.documentElement.classList.add('kit-scrubbing');
      setScrubbing(true);
      latest.current.onScrubStart?.();
    }
    s.raw = scrubAccumulate(s.raw, e.clientX - s.lastX, { step, speed, multiplier: modifierMultiplier(e), min, max, wrap });
    s.lastX = e.clientX;
    const next = scrubValue(s.raw, s.start, { min, max, precision, wrap });
    if (next !== s.last) {
      s.last = next;
      s.changed = true;
      latest.current.onChange(next);
    }
  };

  const onLabelPointerUp = (e: PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const wasClick = !s.active;
    finishScrub(false);
    if (wasClick && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };

  /* Focus helpers ------------------------------------------------------ */

  const onShellMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const input = inputRef.current;
    if (!input || disabled || e.target === input || (e.target as HTMLElement).closest('[data-scrub-handle]')) return;
    e.preventDefault();
    input.focus();
    input.select();
  };

  const ariaLabel = props['aria-label'];

  return (
    <div
      onMouseDown={onShellMouseDown}
      data-scrubbing={scrubbing ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cx(
        'group/number flex min-w-0 items-center',
        variant === 'default' && FIELD_SHELL,
        variant === 'default' ? SIZES[size] : 'h-full gap-0.5 text-xs',
        scrubbing && variant === 'default' && 'border-accent-line bg-surface-2',
        field.invalid && variant === 'default' && 'border-danger! ring-3 ring-danger-soft',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {hasLabel && (
        <span
          id={ownLabelId}
          data-scrub-handle=""
          title={labelTitle}
          onPointerDown={onLabelPointerDown}
          onPointerMove={onLabelPointerMove}
          onPointerUp={onLabelPointerUp}
          onPointerCancel={() => finishScrub(false)}
          onLostPointerCapture={() => finishScrub(false)}
          className={cx(
            'flex h-full min-w-3.5 shrink-0 cursor-ew-resize touch-none items-center justify-center select-none',
            'text-2xs font-medium text-text-3 transition-colors duration-(--dur-fast) hover:text-text [&_svg]:size-3.5',
            scrubbing && 'text-accent-fg hover:text-accent-fg',
          )}
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field.invalid || undefined}
        aria-valuenow={Number.isFinite(value) ? value : undefined}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={display ? `${display}${unit ?? ''}` : placeholder}
        placeholder={placeholder}
        value={editing ?? display}
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          pointerFocus.current = document.activeElement !== e.currentTarget;
        }}
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => {
          // Safari moves the caret on mouseup and undoes the select-all from focus.
          if (pointerFocus.current) e.preventDefault();
          pointerFocus.current = false;
        }}
        onBlur={() => {
          if (editing !== null) commitText(editing);
          setEditing(null);
        }}
        className={cx(
          'h-full w-full min-w-0 bg-transparent tabular-nums outline-none placeholder:text-text-3 disabled:cursor-not-allowed',
          inputClassName,
        )}
      />
      {unit && <span className="pointer-events-none shrink-0 text-text-3 select-none">{unit}</span>}
    </div>
  );
});

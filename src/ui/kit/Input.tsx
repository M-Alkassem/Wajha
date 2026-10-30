import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cx, type ControlSize } from './cx';
import { useFieldControl } from './fieldContext';

/** Shared look of every text-like control: filled surface, accent border and halo on focus. */
export const FIELD_SHELL =
  'border border-transparent bg-field text-text transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-out ' +
  'hover:bg-field-hover focus-within:border-accent-line focus-within:bg-field focus-within:ring-3 focus-within:ring-focus-soft ' +
  'light:border-line light:focus-within:bg-raised';

export const FIELD_INVALID = 'border-danger! ring-3 ring-danger-soft';

const SHELL_SIZES: Record<ControlSize, string> = {
  sm: 'h-6 gap-1 rounded-sm px-1.5 text-xs [&_svg]:size-3.5',
  md: 'h-7 gap-1.5 rounded-sm px-2 text-xs [&_svg]:size-3.5',
  lg: 'h-9 gap-2 rounded-md px-3 text-ui [&_svg]:size-4',
};

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: ControlSize;
  /** Icon before the text (search glass, link...). */
  leadingIcon?: ReactNode;
  /** Content after the text: a unit, a clear button, a hint. */
  suffix?: ReactNode;
  invalid?: boolean;
  /** Class for the outer shell (width, margins); `className` goes to the <input>. */
  containerClassName?: string;
}

/** Single-line text input. dir defaults to "auto" so Arabic and Hebrew type right-to-left. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', leadingIcon, suffix, invalid, containerClassName, className, disabled, dir = 'auto', type = 'text', ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);
  const field = useFieldControl(rest);
  const isInvalid = invalid ?? field.invalid;

  // Clicks on the icon or suffix padding focus the input instead of doing nothing.
  const focusInput = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const input = inner.current;
    if (!input || e.target === input || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    input.focus();
  }, []);

  return (
    <div
      onMouseDown={focusInput}
      data-disabled={disabled ? '' : undefined}
      className={cx(
        'flex min-w-0 items-center',
        FIELD_SHELL,
        SHELL_SIZES[size],
        isInvalid && FIELD_INVALID,
        disabled && 'pointer-events-none opacity-50',
        containerClassName,
      )}
    >
      {leadingIcon && <span className="flex shrink-0 text-text-3">{leadingIcon}</span>}
      <input
        ref={inner}
        type={type}
        dir={dir}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        {...rest}
        id={field.id}
        aria-describedby={field['aria-describedby']}
        className={cx(
          'h-full w-full min-w-0 bg-transparent outline-none placeholder:text-text-3 disabled:cursor-not-allowed',
          '[&::-webkit-search-cancel-button]:appearance-none',
          className,
        )}
      />
      {suffix && <span className="flex shrink-0 items-center text-text-3">{suffix}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the content between minRows and maxRows instead of scrolling. */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  invalid?: boolean;
}

/** Multi-line text. dir="auto" by default; autoGrow sizes it to its content. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { autoGrow = false, minRows = 3, maxRows = 12, invalid, className, dir = 'auto', rows, onInput, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);
  const field = useFieldControl(rest);
  const isInvalid = invalid ?? field.invalid;

  const resize = useCallback(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 18;
    const chrome =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const min = Math.max(1, minRows) * line + chrome;
    const max = Math.max(minRows, maxRows) * line + chrome;
    el.style.height = 'auto';
    const wanted = el.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const next = Math.min(max, Math.max(min, wanted));
    el.style.height = `${next}px`;
    el.style.overflowY = wanted > max ? 'auto' : 'hidden';
  }, [autoGrow, minRows, maxRows]);

  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  return (
    <textarea
      ref={inner}
      dir={dir}
      rows={autoGrow ? minRows : rows ?? minRows}
      value={value}
      aria-invalid={isInvalid || undefined}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      {...rest}
      id={field.id}
      aria-describedby={field['aria-describedby']}
      className={cx(
        'block w-full min-w-0 rounded-sm px-2 py-[5px] text-xs leading-[18px] outline-none placeholder:text-text-3',
        FIELD_SHELL,
        autoGrow ? 'resize-none' : 'resize-y',
        isInvalid && FIELD_INVALID,
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    />
  );
});

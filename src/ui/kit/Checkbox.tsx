import { forwardRef, useId, type ReactNode } from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cx } from './cx';
import { useFieldControl } from './fieldContext';

export interface CheckboxProps {
  /** true, false or 'indeterminate' (some of a group selected). */
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  label?: ReactNode;
  /** Secondary text under the label. */
  description?: ReactNode;
  'aria-label'?: string;
  id?: string;
  name?: string;
  className?: string;
}

/** Checkbox with an optional label and description; supports the indeterminate state. */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, defaultChecked, onCheckedChange, disabled, label, description, name, className, ...aria },
  ref,
) {
  const autoId = useId();
  const field = useFieldControl({ id: aria.id });
  const id = field.id ?? (label ? autoId : undefined);
  const descriptionId = description ? `${autoId}-desc` : undefined;
  const control = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={id}
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={aria['aria-label']}
      aria-describedby={[field['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined}
      className={cx(
        'group/checkbox peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] outline-none',
        'border border-line-strong bg-field shadow-[var(--highlight)] transition-[background-color,border-color] duration-(--dur-fast) ease-out',
        'hover:border-text-3 light:bg-raised',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-text',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-text',
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-45',
        !label && className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {/* Both glyphs render; the state attribute picks one, so uncontrolled use works too. */}
        <Check className="size-3 group-data-[state=indeterminate]/checkbox:hidden" strokeWidth={3} />
        <Minus className="hidden size-3 group-data-[state=indeterminate]/checkbox:block" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return control;
  return (
    <span className={cx('inline-flex items-start gap-2', disabled && 'opacity-60', className)}>
      <span className="flex h-[18px] items-center">{control}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-xs leading-[18px] text-text select-none">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="text-xs leading-4 text-text-3">
            {description}
          </span>
        )}
      </span>
    </span>
  );
});

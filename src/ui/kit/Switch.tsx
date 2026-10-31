import { forwardRef, useId, type ReactNode } from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cx } from './cx';
import { useFieldControl } from './fieldContext';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Text label rendered after the switch (clickable). */
  label?: ReactNode;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  id?: string;
  name?: string;
  className?: string;
}

/** On/off toggle for settings that apply immediately. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onCheckedChange, disabled, label, size = 'md', name, className, ...aria },
  ref,
) {
  const autoId = useId();
  const field = useFieldControl({ id: aria.id });
  const id = field.id ?? (label ? autoId : undefined);
  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      id={id}
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={aria['aria-label']}
      aria-describedby={field['aria-describedby']}
      className={cx(
        'group/switch relative inline-flex shrink-0 items-center rounded-full p-0.5 outline-none',
        'bg-surface-3 shadow-[inset_0_0_0_1px_var(--line)] transition-[background-color,box-shadow] duration-(--dur) ease-out',
        'hover:bg-line-strong data-[state=checked]:bg-accent data-[state=checked]:shadow-none data-[state=checked]:hover:bg-accent-2',
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' ? 'h-3.5 w-6' : 'h-4 w-7',
        !label && className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cx(
          'block rounded-full bg-knob shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-(--dur) ease-out',
          // Right to left, "on" slides the knob the other way, as macOS does.
          size === 'sm' ? 'size-2.5 data-[state=checked]:translate-x-2.5 rtl:data-[state=checked]:-translate-x-2.5' : 'size-3 data-[state=checked]:translate-x-3 rtl:data-[state=checked]:-translate-x-3',
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <span className={cx('inline-flex items-center gap-2', disabled && 'opacity-60', className)}>
      {control}
      <label htmlFor={id} className="text-xs text-text select-none">
        {label}
      </label>
    </span>
  );
});

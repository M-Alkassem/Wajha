import { forwardRef, type ForwardedRef, type ReactNode } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cx, type ControlSize } from './cx';
import { useFieldControl } from './fieldContext';
import { FIELD_SHELL } from './Input';

export interface SelectOption {
  /** Must be non-empty (radix reserves "" for "no value"). */
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Secondary line shown in the list only. */
  description?: ReactNode;
  disabled?: boolean;
  /** Typeahead text when `label` is not a string. */
  textValue?: string;
}

export interface SelectGroup {
  label?: ReactNode;
  options: SelectOption[];
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Flat list of options... */
  options?: SelectOption[];
  /** ...or labelled groups (rendered after `options`). */
  groups?: SelectGroup[];
  placeholder?: string;
  size?: ControlSize;
  /** ghost: no fill until hovered, for toolbars. */
  variant?: 'default' | 'ghost';
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  'aria-label'?: string;
  id?: string;
  name?: string;
  className?: string;
  contentClassName?: string;
  align?: 'start' | 'center' | 'end';
}

const TRIGGER_SIZES: Record<ControlSize, string> = {
  sm: 'h-6 gap-1 rounded-sm pl-1.5 pr-1 text-xs',
  md: 'h-7 gap-1.5 rounded-sm pl-2 pr-1.5 text-xs',
  lg: 'h-9 gap-2 rounded-md pl-3 pr-2 text-ui',
};

/** Styled radix Select: a field-like trigger and a menu-like list with a check on the chosen item. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(props, ref) {
  // Passing `value` at all (even undefined) means controlled; "" is radix's "nothing selected, show the placeholder".
  const controlled = Object.prototype.hasOwnProperty.call(props, 'value');
  return <SelectImpl {...props} controlled={controlled} forwardedRef={ref} />;
});

function SelectImpl({
  value,
  defaultValue,
  onValueChange,
  options = [],
  groups = [],
  placeholder = 'Select…',
  size = 'md',
  variant = 'default',
  disabled,
  open,
  onOpenChange,
  name,
  className,
  contentClassName,
  align = 'start',
  controlled,
  forwardedRef: ref,
  ...aria
}: SelectProps & { controlled: boolean; forwardedRef: ForwardedRef<HTMLButtonElement> }) {
  const field = useFieldControl({ id: aria.id });
  return (
    <SelectPrimitive.Root
      {...(controlled ? { value: value ?? '' } : { defaultValue })}
      onValueChange={onValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      name={name}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={field.id}
        aria-label={aria['aria-label']}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field.invalid || undefined}
        className={cx(
          'group/select inline-flex w-full min-w-0 items-center justify-between outline-none select-none',
          'data-[placeholder]:text-text-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5',
          variant === 'default'
            ? cx(FIELD_SHELL, 'focus-visible:border-accent-line focus-visible:ring-3 focus-visible:ring-focus-soft data-[state=open]:border-accent-line data-[state=open]:bg-surface-2')
            : 'text-text-2 transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2 data-[state=open]:bg-surface-2 data-[state=open]:text-text',
          field.invalid && 'border-danger! ring-3 ring-danger-soft',
          TRIGGER_SIZES[size],
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate [&_svg]:shrink-0 [&_svg]:text-text-2">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden
            className="shrink-0 text-text-3 transition-transform duration-(--dur) ease-out group-data-[state=open]/select:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          align={align}
          collisionPadding={8}
          className={cx(
            'kit-pop z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)',
            'origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border border-line bg-popover text-text shadow-lg',
            contentClassName,
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-text-3">
            <ChevronUp className="size-3.5" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectItem key={o.value} option={o} />
            ))}
            {groups.map((g, gi) => (
              <SelectPrimitive.Group key={gi}>
                {(gi > 0 || options.length > 0) && <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-line" />}
                {g.label && <SelectPrimitive.Label className="px-2 pt-1.5 pb-1 text-2xs font-medium text-text-3">{g.label}</SelectPrimitive.Label>}
                {g.options.map((o) => (
                  <SelectItem key={o.value} option={o} />
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-text-3">
            <ChevronDown className="size-3.5" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }) {
  return (
    <SelectPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      textValue={option.textValue ?? (typeof option.label === 'string' ? option.label : undefined)}
      className={cx(
        'group/option relative flex min-h-7 cursor-default items-center gap-2 rounded-[5px] py-1 pr-7 pl-2 text-ui outline-none select-none',
        // Same highlight as the menus (surface-2 nearly vanishes on a dark popover).
        'data-[highlighted]:bg-surface-3 light:data-[highlighted]:bg-surface-2',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[state=checked]:font-medium',
      )}
    >
      <span className="flex min-w-0 flex-col">
        {/* ItemText is also what the trigger shows, so the icon lives inside it. */}
        <SelectPrimitive.ItemText>
          <span className="inline-flex min-w-0 items-center gap-2 truncate [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-text-2">
            {option.icon}
            {option.label}
          </span>
        </SelectPrimitive.ItemText>
        {option.description && (
          <span className={cx('truncate text-xs font-normal text-text-3 group-data-[highlighted]/option:text-text-2', option.icon ? 'pl-[22px]' : undefined)}>
            {option.description}
          </span>
        )}
      </span>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-accent-fg">
        <Check className="size-3.5" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

import { useId, type CSSProperties, type ReactNode } from 'react';
import { cx } from './cx';
import { FieldContext, type FieldContextValue } from './fieldContext';

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** inline: label column + control (inspector rows); stacked: label above (dialogs, forms). */
  layout?: 'inline' | 'stacked';
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error text; also marks the control invalid. */
  error?: ReactNode;
  /** Id of the control, when it is not a kit control that reads the Field context. */
  htmlFor?: string;
  /** Width of the label column in inline layout (default 72 px). */
  labelWidth?: number;
  /** Extra content next to the label (stacked) or after the control (inline), e.g. a reset button. */
  trailing?: ReactNode;
  className?: string;
}

/** Label + control. Kit controls inside pick up the label, hint and error automatically. */
export function Field({ label, children, layout = 'inline', hint, error, htmlFor, labelWidth = 72, trailing, className }: FieldProps) {
  const baseId = useId();
  const controlId = htmlFor ?? `${baseId}-control`;
  const labelId = `${baseId}-label`;
  const message = error ?? hint;
  const descriptionId = message ? `${baseId}-description` : undefined;
  const ctx: FieldContextValue = { controlId, labelId, descriptionId, invalid: !!error };

  const description = message ? (
    <p id={descriptionId} className={cx('text-xs leading-4', error ? 'text-danger' : 'text-text-3')}>
      {message}
    </p>
  ) : null;

  if (layout === 'stacked') {
    return (
      <FieldContext.Provider value={ctx}>
        <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
          <div className="flex min-h-4 items-center justify-between gap-2">
            <label id={labelId} htmlFor={controlId} className="truncate text-xs font-medium text-text-2">
              {label}
            </label>
            {trailing}
          </div>
          {children}
          {description}
        </div>
      </FieldContext.Provider>
    );
  }

  return (
    <FieldContext.Provider value={ctx}>
      <div
        className={cx('grid min-w-0 grid-cols-[var(--field-label-w)_minmax(0,1fr)] items-center gap-x-2 gap-y-1', className)}
        style={{ '--field-label-w': `${labelWidth}px` } as CSSProperties}
      >
        <label id={labelId} htmlFor={controlId} className="truncate text-xs text-text-2" title={typeof label === 'string' ? label : undefined}>
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1">{children}</div>
          {trailing}
        </div>
        {description && <div className="col-start-2">{description}</div>}
      </div>
    </FieldContext.Provider>
  );
}

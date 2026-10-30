/**
 * The context a <Field> provides to the kit control inside it, kept apart
 * from Field.tsx so that file exports components only (fast refresh).
 */
import { createContext, useContext, type AriaAttributes } from 'react';

export interface FieldContextValue {
  controlId: string;
  labelId: string;
  descriptionId?: string;
  invalid: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

/**
 * Lets kit controls join the Field around them: they take its id (so the
 * label's htmlFor works), its description and its invalid state, unless
 * the caller passed their own.
 */
export function useFieldControl(props: FieldControlProps = {}): {
  id: string | undefined;
  labelId: string | undefined;
  'aria-describedby': string | undefined;
  invalid: boolean;
} {
  const field = useContext(FieldContext);
  const describedBy = [props['aria-describedby'], field?.descriptionId].filter(Boolean).join(' ') || undefined;
  const invalidProp = props['aria-invalid'];
  return {
    id: props.id ?? field?.controlId,
    labelId: props['aria-labelledby'] ?? field?.labelId,
    'aria-describedby': describedBy,
    invalid: invalidProp === undefined ? !!field?.invalid : invalidProp !== false && invalidProp !== 'false',
  };
}

import { useMemo, useState } from 'react';
import { Toaster } from '../kit';
import { useApp } from '../../store';
import { createToastMapper } from './toastData';

/** Room for the editor's 24 px status bar plus a 12 px gap. */
const EDITOR_BOTTOM_OFFSET = 36;

/**
 * Renders the app store's toasts; the kit Toaster runs their timers, which
 * pause while a toast is hovered or focused. In the editor they sit at the
 * bottom center, over the canvas and clear of the inspector, above the status
 * bar; on the home screen at the bottom right. While a dialog is open the
 * Toaster moves them clear of its footer.
 */
export function ToastHost() {
  const inEditor = useApp((s) => s.route.name === 'editor');
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const [toKit] = useState(() => createToastMapper((id) => useApp.getState().runToastAction(id)));
  const data = useMemo(() => toKit(toasts), [toKit, toasts]);
  return (
    <Toaster
      toasts={data}
      onDismiss={dismiss}
      position={inEditor ? 'bottom-center' : 'bottom-right'}
      bottomOffset={inEditor ? EDITOR_BOTTOM_OFFSET : undefined}
    />
  );
}

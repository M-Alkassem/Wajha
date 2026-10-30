import type { ToastData } from '../kit';
import type { Toast } from '../../store';

/**
 * Maps the store's toasts to the kit Toaster's, reusing the object made for
 * a store toast as long as that toast is unchanged (the store is immutable):
 * a new object restarts the toast's timer, which would happen to every toast
 * on screen whenever another one came or went.
 */
export function createToastMapper(runAction: (id: string) => void): (toasts: readonly Toast[]) => ToastData[] {
  const made = new WeakMap<Toast, ToastData>();
  return (toasts) =>
    toasts.map((t) => {
      let data = made.get(t);
      if (!data) {
        data = {
          id: t.id,
          kind: t.kind,
          title: t.title,
          description: t.description,
          duration: t.duration,
          action: t.action ? { label: t.action.label, onClick: () => runAction(t.id) } : undefined,
        };
        made.set(t, data);
      }
      return data;
    });
}

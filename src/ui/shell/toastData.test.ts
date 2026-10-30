import { describe, expect, it, vi } from 'vitest';
import type { Toast } from '../../store';
import { createToastMapper } from './toastData';

const toast = (id: string, extra: Partial<Toast> = {}): Toast => ({ id, createdAt: 1, kind: 'info', title: id, ...extra });

describe('createToastMapper', () => {
  it('keeps one object per unchanged store toast, so other toasts coming and going restart no timer', () => {
    const map = createToastMapper(() => undefined);
    const a = toast('a');
    const first = map([a]);
    const second = map([a, toast('b')]);
    expect(second[0]).toBe(first[0]);
    expect(map([a])[0]).toBe(first[0]);
    // An updated toast is a new store object, and gets a new one (its clock restarts).
    const updated = map([{ ...a, title: 'Updated' }]);
    expect(updated[0]).not.toBe(first[0]);
    expect(updated[0].title).toBe('Updated');
  });

  it('carries kind, text and duration, and runs actions through the store', () => {
    const runAction = vi.fn();
    const map = createToastMapper(runAction);
    const [data] = map([toast('t1', { kind: 'warning', description: 'Only PNG, JPEG and WebP.', duration: 0, action: { label: 'Undo', run: () => undefined } })]);
    expect(data).toMatchObject({ id: 't1', kind: 'warning', description: 'Only PNG, JPEG and WebP.', duration: 0, action: { label: 'Undo' } });
    data.action?.onClick();
    expect(runAction).toHaveBeenCalledWith('t1');
    // No duration: the Toaster picks its per-kind default.
    expect(map([toast('t2')])[0].duration).toBeUndefined();
  });
});

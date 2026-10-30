import { describe, expect, it } from 'vitest';
import { DEFAULT_TOAST_DURATION, MIN_ACTION_DURATION, reconcileToasts, removeToasts, toastDuration, type PresentToast, type ToastData } from './toast';

const t = (id: string, extra: Partial<ToastData> = {}): ToastData => ({ id, kind: 'info', title: id, ...extra });

describe('toastDuration', () => {
  it('defaults per kind, errors lingering longest', () => {
    expect(toastDuration(t('a'))).toBe(DEFAULT_TOAST_DURATION.info);
    expect(toastDuration(t('a', { kind: 'error' }))).toBe(DEFAULT_TOAST_DURATION.error);
    expect(DEFAULT_TOAST_DURATION.error).toBeGreaterThan(DEFAULT_TOAST_DURATION.success);
  });
  it('prefers the toast, then the fallback', () => {
    expect(toastDuration(t('a', { duration: 1234 }), 9999)).toBe(1234);
    expect(toastDuration(t('a'), 2500)).toBe(2500);
  });
  it('treats 0, negatives and NaN as sticky', () => {
    expect(toastDuration(t('a', { duration: 0 }))).toBe(0);
    expect(toastDuration(t('a', { duration: -5 }))).toBe(0);
    expect(toastDuration(t('a', { duration: Number.NaN }))).toBe(0);
    expect(toastDuration(t('a'), 0)).toBe(0);
  });
  it('gives actions time to be reached', () => {
    const action = { label: 'Undo', onClick: () => undefined };
    expect(toastDuration(t('a', { duration: 1000, action }))).toBe(MIN_ACTION_DURATION);
    expect(toastDuration(t('a', { duration: 0, action }))).toBe(0);
  });
});

describe('reconcileToasts', () => {
  it('appends new toasts in order', () => {
    const out = reconcileToasts([], [t('a'), t('b')]);
    expect(out.map((p) => [p.toast.id, p.leaving])).toEqual([
      ['a', false],
      ['b', false],
    ]);
  });

  it('marks removed toasts as leaving in place', () => {
    const present = reconcileToasts([], [t('a'), t('b'), t('c')]);
    const out = reconcileToasts(present, [t('a'), t('c')]);
    expect(out.map((p) => [p.toast.id, p.leaving])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });

  it('keeps identity for unchanged toasts and refreshes updated ones', () => {
    const a = t('a');
    const present = reconcileToasts([], [a]);
    expect(reconcileToasts(present, [a])[0]).toBe(present[0]);
    const updated = { ...a, title: 'Updated' };
    expect(reconcileToasts(present, [updated])[0].toast.title).toBe('Updated');
  });

  it('revives a toast that comes back while leaving', () => {
    const leaving: PresentToast[] = [{ toast: t('a'), leaving: true }];
    expect(reconcileToasts(leaving, [t('a')])[0].leaving).toBe(false);
  });

  it('keeps a leaving toast leaving and ignores duplicate ids', () => {
    const leaving: PresentToast = { toast: t('a'), leaving: true };
    expect(reconcileToasts([leaving], [])[0]).toBe(leaving);
    const out = reconcileToasts([], [t('x'), t('x', { title: 'dup' })]);
    expect(out).toHaveLength(1);
  });
});

describe('removeToasts', () => {
  it('drops only finished leaving toasts', () => {
    const present: PresentToast[] = [
      { toast: t('a'), leaving: true },
      { toast: t('b'), leaving: false },
    ];
    expect(removeToasts(present, new Set(['a', 'b'])).map((p) => p.toast.id)).toEqual(['b']);
    expect(removeToasts(present, new Set())).toEqual(present);
  });
});

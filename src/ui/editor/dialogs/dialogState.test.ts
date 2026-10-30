/**
 * Dialogs opened from another dialog (Translations > Manage languages) come
 * back to it when they close, and never leave a stale way back behind.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorUi, type EditorDialog } from '../editorUi';
import { closeOrReturn, openDialogFrom } from './dialogState';

const ui = () => useEditorUi.getState();

afterEach(() => ui().closeDialog());

describe('openDialogFrom and closeOrReturn', () => {
  it('bring the opening dialog back when the other one closes', () => {
    ui().openDialog('translations');
    openDialogFrom('translations', 'languages');
    expect(ui()).toMatchObject({ dialog: 'languages', returnTo: 'translations' });

    const seen: (EditorDialog | null)[] = [];
    const unsubscribe = useEditorUi.subscribe((s) => seen.push(s.dialog));
    const close = vi.fn();
    closeOrReturn('languages', close);
    unsubscribe();

    expect(close).not.toHaveBeenCalled();
    // Straight back, never "no dialog" in between: the editor keeps the control that opened Translations for focus.
    expect(seen).toEqual(['translations']);
    expect(ui()).toMatchObject({ dialog: 'translations', returnTo: null });

    // Translations itself closes to the editor.
    closeOrReturn('translations', close);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('close normally when the dialog was opened on its own', () => {
    ui().openDialog('languages');
    const close = vi.fn(() => ui().closeDialog());
    closeOrReturn('languages', close);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ui().dialog).toBeNull();
  });

  it('forget the way back once every dialog is closed or another one opens', () => {
    ui().openDialog('translations');
    openDialogFrom('translations', 'languages');
    ui().closeDialog();
    expect(ui().returnTo).toBeNull();
    ui().openDialog('languages');
    const close = vi.fn();
    closeOrReturn('languages', close);
    expect(close).toHaveBeenCalledTimes(1);

    openDialogFrom('translations', 'languages');
    ui().openDialog('export');
    expect(ui().returnTo).toBeNull();
  });

  it('do not reopen anything for a dialog that is no longer the open one', () => {
    ui().openDialog('translations');
    openDialogFrom('translations', 'languages');
    const close = vi.fn();
    closeOrReturn('export', close);
    expect(close).toHaveBeenCalledTimes(1);
    expect(ui().dialog).toBe('languages');
  });
});

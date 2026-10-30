import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAMILIES } from '../../model/catalog';
import { blankProject } from '../../model/defaults';
import { resolveLayout } from '../../model/resolve';
import { selectActiveLayout, selectActiveSlideIndex, useApp, useEditor } from '../../store';
import { setListDragging, useEditorChrome } from './chrome';
import { useEditorUi } from './editorUi';
import { leaveFieldOnEscape, modalLayerOpen, overlayOpen, runEditorShortcut, shortcutForEvent } from './useEditorShortcuts';

function open(): void {
  useEditor.getState().openProject(blankProject('Shortcuts', ['iphone', 'android-phone'], ['en-US', 'ar-SA']));
}

function selectFirst(kind: 'device' | 'text'): string {
  const s = useEditor.getState();
  const el = selectActiveLayout(s)!.elements.find((e) => e.kind === kind)!;
  s.select(el.id);
  return el.id;
}

const key = (k: string, init: Omit<Partial<KeyboardEvent>, 'target'> & { target?: unknown } = {}) =>
  ({ key: k, code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, isComposing: false, keyCode: 0, repeat: false, target: null, ...init }) as unknown as KeyboardEvent;

beforeEach(() => {
  open();
  useEditorUi.getState().closeDialog();
  setListDragging(false);
});

afterEach(() => {
  useEditor.getState().closeProject();
  useEditorUi.getState().closeDialog();
});

describe('runEditorShortcut', () => {
  it('nudges the selection by 1 or 10 design pixels', () => {
    const id = selectFirst('device');
    const before = selectActiveLayout(useEditor.getState())!.elements.find((e) => e.id === id)!;
    expect(runEditorShortcut({ id: 'nudge', index: 3 })).toBe(true);
    expect(runEditorShortcut({ id: 'nudgeFar', index: 1 })).toBe(true);
    const after = selectActiveLayout(useEditor.getState())!.elements.find((e) => e.id === id)!;
    const { width, height } = FAMILIES.iphone.design;
    expect(after.x - before.x).toBeCloseTo(1 / width, 9);
    expect(after.y - before.y).toBeCloseTo(10 / height, 9);
  });

  it('does nothing (and lets the page scroll) without a selection', () => {
    expect(runEditorShortcut({ id: 'nudge', index: 0 })).toBe(false);
    expect(runEditorShortcut({ id: 'delete', index: 0 })).toBe(false);
    expect(runEditorShortcut({ id: 'copy', index: 0 })).toBe(false);
    expect(runEditorShortcut({ id: 'deselect', index: 0 })).toBe(false);
  });

  it('deletes, then undoes and redoes', () => {
    const id = selectFirst('text');
    const count = selectActiveLayout(useEditor.getState())!.elements.length;
    expect(runEditorShortcut({ id: 'delete', index: 0 })).toBe(true);
    expect(selectActiveLayout(useEditor.getState())!.elements).toHaveLength(count - 1);
    expect(runEditorShortcut({ id: 'undo', index: 0 })).toBe(true);
    expect(selectActiveLayout(useEditor.getState())!.elements.some((e) => e.id === id)).toBe(true);
    expect(runEditorShortcut({ id: 'redo', index: 0 })).toBe(true);
    expect(selectActiveLayout(useEditor.getState())!.elements).toHaveLength(count - 1);
  });

  it('duplicates the selected layer, or the slide when nothing is selected', () => {
    const slides = useEditor.getState().project!.slides.length;
    expect(runEditorShortcut({ id: 'duplicate', index: 0 })).toBe(true);
    expect(useEditor.getState().project!.slides).toHaveLength(slides + 1);
    expect(selectActiveSlideIndex(useEditor.getState())).toBe(1);

    const id = selectFirst('device');
    const count = selectActiveLayout(useEditor.getState())!.elements.length;
    runEditorShortcut({ id: 'duplicate', index: 0 });
    const s = useEditor.getState();
    expect(selectActiveLayout(s)!.elements).toHaveLength(count + 1);
    expect(s.selection).not.toBe(id);
    expect(s.project!.slides).toHaveLength(slides + 1);
  });

  it('copies and pastes a layer, and cuts it', () => {
    selectFirst('text');
    const count = selectActiveLayout(useEditor.getState())!.elements.length;
    expect(runEditorShortcut({ id: 'copy', index: 0 })).toBe(true);
    expect(runEditorShortcut({ id: 'paste', index: 0 })).toBe(true);
    expect(selectActiveLayout(useEditor.getState())!.elements).toHaveLength(count + 1);
    expect(runEditorShortcut({ id: 'cut', index: 0 })).toBe(true);
    expect(selectActiveLayout(useEditor.getState())!.elements).toHaveLength(count);
  });

  it('clears the selection with Escape', () => {
    selectFirst('device');
    expect(runEditorShortcut({ id: 'deselect', index: 0 })).toBe(true);
    expect(useEditor.getState().selection).toBeNull();
  });

  it('steps through slides and families', () => {
    expect(runEditorShortcut({ id: 'nextSlide', index: 0 })).toBe(true);
    expect(selectActiveSlideIndex(useEditor.getState())).toBe(1);
    runEditorShortcut({ id: 'prevSlide', index: 0 });
    runEditorShortcut({ id: 'prevSlide', index: 0 });
    expect(selectActiveSlideIndex(useEditor.getState())).toBe(0);

    expect(runEditorShortcut({ id: 'family', index: 1 })).toBe(true);
    expect(useEditor.getState().activeFamily).toBe('android-phone');
    expect(runEditorShortcut({ id: 'family', index: 4 })).toBe(false);
    expect(useEditor.getState().activeFamily).toBe('android-phone');
  });

  it('opens dialogs, zooms and toggles panels', () => {
    runEditorShortcut({ id: 'export', index: 0 });
    expect(useEditorUi.getState().dialog).toBe('export');
    runEditorShortcut({ id: 'shortcuts', index: 0 });
    expect(useEditorUi.getState().dialog).toBe('shortcuts');

    useEditor.getState().setZoom(0.5);
    runEditorShortcut({ id: 'zoomIn', index: 0 });
    expect(useEditor.getState().zoom).toBeGreaterThan(0.5);
    runEditorShortcut({ id: 'zoomFit', index: 0 });
    expect(useEditor.getState().fit).toBe(true);

    const left = useEditorChrome.getState().leftOpen;
    runEditorShortcut({ id: 'toggleSidebar', index: 0 });
    expect(useEditorChrome.getState().leftOpen).toBe(!left);
    runEditorShortcut({ id: 'toggleSidebar', index: 0 });
    expect(useEditorChrome.getState().leftOpen).toBe(left);
  });

  it('keeps locked layers in place but still owns the arrow key', () => {
    const id = selectFirst('device');
    const s = useEditor.getState();
    s.toggleLocked(s.activeSlideId!, s.activeFamily, id);
    const before = resolveLayout(s.project!, s.project!.slides[0], 'iphone').elements.find((e) => e.id === id)!.x;
    expect(runEditorShortcut({ id: 'nudge', index: 3 })).toBe(true);
    const p = useEditor.getState().project!;
    expect(resolveLayout(p, p.slides[0], 'iphone').elements.find((e) => e.id === id)!.x).toBe(before);
  });
});

describe('shortcutForEvent', () => {
  it('finds shortcuts in a plain context', () => {
    expect(shortcutForEvent(key('z', { metaKey: true }), true)?.id).toBe('undo');
    expect(shortcutForEvent(key('ArrowLeft'), true)?.id).toBe('nudge');
  });

  it('stands aside when a control already handled the key, during IME composition and while dragging', () => {
    expect(shortcutForEvent(key('z', { metaKey: true, defaultPrevented: true }), true)).toBeNull();
    expect(shortcutForEvent(key('z', { metaKey: true, isComposing: true }), true)).toBeNull();
    setListDragging(true);
    expect(shortcutForEvent(key('ArrowUp'), true)).toBeNull();
    setListDragging(false);
  });

  it('does nothing while an editor dialog or a confirm question is open', () => {
    useEditorUi.getState().openDialog('languages');
    expect(shortcutForEvent(key('Escape'), true)).toBeNull();
    useEditorUi.getState().closeDialog();
    void useApp.getState().confirm({ title: 'Sure?', message: 'Really' });
    expect(shortcutForEvent(key('z', { metaKey: true }), true)).toBeNull();
    useApp.getState().resolveConfirm(false);
    expect(shortcutForEvent(key('z', { metaKey: true }), true)?.id).toBe('undo');
  });

  it('leaves text fields their own keys except a few global ones', () => {
    const input = { tagName: 'INPUT', type: 'text', getAttribute: () => null };
    expect(shortcutForEvent(key('z', { metaKey: true, target: input }), true)).toBeNull();
    expect(shortcutForEvent(key('v', { metaKey: true, target: input }), true)).toBeNull();
    expect(shortcutForEvent(key('Backspace', { target: input }), true)).toBeNull();
    expect(shortcutForEvent(key('e', { metaKey: true, target: input }), true)?.id).toBe('export');
    expect(shortcutForEvent(key('0', { metaKey: true, target: input }), true)?.id).toBe('zoomFit');
  });

  it('leaves arrows to sliders and radio groups but not to buttons', () => {
    const slider = { tagName: 'SPAN', getAttribute: (n: string) => (n === 'role' ? 'slider' : null) };
    const button = { tagName: 'BUTTON', getAttribute: () => null };
    expect(shortcutForEvent(key('ArrowRight', { target: slider }), true)).toBeNull();
    expect(shortcutForEvent(key('ArrowRight', { target: button }), true)?.id).toBe('nudge');
    expect(shortcutForEvent(key('Backspace', { target: slider }), true)?.id).toBe('delete');
  });
});

describe('leaveFieldOnEscape', () => {
  /** A focusable element that records being blurred. */
  const field = (tagName: string, attrs: Record<string, string> = {}, type?: string) => {
    const f = { tagName, type, blurred: 0, getAttribute: (n: string) => attrs[n] ?? null, blur: () => void f.blurred++ };
    return f;
  };

  it('leaves the text field and keeps the selection, so the next Escape deselects', () => {
    const id = selectFirst('text');
    const textarea = field('TEXTAREA');
    expect(leaveFieldOnEscape(key('Escape', { target: textarea }))).toBe(true);
    expect(textarea.blurred).toBe(1);
    expect(useEditor.getState().selection).toBe(id);
    // Focus is on the page now: Escape is the deselect shortcut again.
    expect(shortcutForEvent(key('Escape'), true)?.id).toBe('deselect');
    const hex = field('INPUT', {}, 'text');
    expect(leaveFieldOnEscape(key('Escape', { target: hex }))).toBe(true);
    expect(hex.blurred).toBe(1);
  });

  it('leaves other keys, other controls and handled keys alone', () => {
    const textarea = field('TEXTAREA');
    expect(leaveFieldOnEscape(key('Enter', { target: textarea }))).toBe(false);
    expect(leaveFieldOnEscape(key('Escape', { target: textarea, shiftKey: true }))).toBe(false);
    expect(leaveFieldOnEscape(key('Escape', { target: textarea, isComposing: true }))).toBe(false);
    // A rename that reverts on Escape has already handled it.
    expect(leaveFieldOnEscape(key('Escape', { target: textarea, defaultPrevented: true }))).toBe(false);
    expect(leaveFieldOnEscape(key('Escape', { target: field('BUTTON', { role: 'combobox' }) }))).toBe(false);
    expect(leaveFieldOnEscape(key('Escape'))).toBe(false);
    expect(textarea.blurred).toBe(0);
  });

  it('lets an open dialog or popover have Escape', () => {
    const textarea = field('TEXTAREA');
    useEditorUi.getState().openDialog('translations');
    expect(leaveFieldOnEscape(key('Escape', { target: textarea }))).toBe(false);
    useEditorUi.getState().closeDialog();
    expect(textarea.blurred).toBe(0);
  });
});

describe('modalLayerOpen', () => {
  /** A document whose querySelector knows `[role="…"][data-state="…"]` lists, over a few rendered layers. */
  const documentWith = (...layers: { role: string; state?: string }[]) => ({
    querySelector: (selectors: string) =>
      selectors.split(',').some((s) => layers.some((l) => s.trim() === `[role="${l.role}"][data-state="${l.state}"]`)) ? {} : null,
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true while an editor dialog or a confirm question is open', () => {
    expect(modalLayerOpen()).toBe(false);
    useEditorUi.getState().openDialog('shortcuts');
    expect(modalLayerOpen()).toBe(true);
    useEditorUi.getState().closeDialog();
    void useApp.getState().confirm({ title: 'Sure?', message: 'Really' });
    expect(modalLayerOpen()).toBe(true);
    useApp.getState().resolveConfirm(false);
    expect(modalLayerOpen()).toBe(false);
  });

  it('counts open menus and select lists, but not popovers or the sidebar lists', () => {
    vi.stubGlobal('document', documentWith({ role: 'menu', state: 'open' }));
    expect(modalLayerOpen()).toBe(true);
    vi.stubGlobal('document', documentWith({ role: 'listbox', state: 'open' }));
    expect(modalLayerOpen()).toBe(true);
    vi.stubGlobal('document', documentWith({ role: 'dialog', state: 'open' }, { role: 'listbox' }, { role: 'menu', state: 'closed' }));
    expect(modalLayerOpen()).toBe(false);
    expect(overlayOpen()).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { parseShortcut } from '../kit';
import {
  EDITOR_SHORTCUTS,
  EDITOR_SHORTCUT_GROUPS,
  FAMILY_SHORTCUT_COUNT,
  editorShortcut,
  isEditableTarget,
  isTextEntryTarget,
  matchEditorShortcut,
  matchKeys,
  ownsArrowKeys,
  shortcutKeys,
  type TargetLike,
} from './shortcuts';

type Mods = Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>;
const ev = (key: string, mods: Mods = {}, code?: string) => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
const cmd = { metaKey: true };
const ctrl = { ctrlKey: true };

describe('EDITOR_SHORTCUTS', () => {
  it('has unique ids, known groups and parseable keys', () => {
    const ids = EDITOR_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of EDITOR_SHORTCUTS) {
      expect(EDITOR_SHORTCUT_GROUPS).toContain(s.group);
      expect(s.label.trim()).not.toBe('');
      expect(s.keys.length).toBeGreaterThan(0);
      for (const k of s.keys) expect(parseShortcut(k).keys).toHaveLength(1);
    }
  });
  it('never binds one key combination to two actions', () => {
    const seen = new Map<string, string>();
    for (const s of EDITOR_SHORTCUTS) {
      for (const k of s.keys) {
        const norm = k.toLowerCase();
        expect(seen.get(norm), `${k} is bound twice`).toBeUndefined();
        seen.set(norm, s.id);
      }
    }
  });
  it('offers one family key per family slot and looks entries up by id', () => {
    expect(editorShortcut('family').keys).toHaveLength(FAMILY_SHORTCUT_COUNT);
    expect(shortcutKeys('undo')).toBe('mod+z');
    expect(() => editorShortcut('nope' as never)).toThrow();
  });
});

describe('matchEditorShortcut', () => {
  it('maps Command on macOS and Control elsewhere', () => {
    expect(matchEditorShortcut(ev('z', cmd), true)).toEqual({ id: 'undo', index: 0 });
    expect(matchEditorShortcut(ev('z', ctrl), false)).toEqual({ id: 'undo', index: 0 });
    expect(matchEditorShortcut(ev('z', ctrl), true)).toBeNull();
    expect(matchEditorShortcut(ev('z', { ...cmd, shiftKey: true }), true)?.id).toBe('redo');
    expect(matchEditorShortcut(ev('Z', { ...ctrl, shiftKey: true }), false)?.id).toBe('redo');
  });
  it('matches letters by physical key on other layouts', () => {
    expect(matchEditorShortcut(ev('я', cmd, 'KeyZ'), true)?.id).toBe('undo');
    expect(matchEditorShortcut(ev('&', cmd, 'Digit1'), true)).toEqual({ id: 'family', index: 0 });
  });
  it('tells the arrows apart for nudging and slide stepping', () => {
    expect(matchEditorShortcut(ev('ArrowUp'), true)).toEqual({ id: 'nudge', index: 0 });
    expect(matchEditorShortcut(ev('ArrowRight'), true)).toEqual({ id: 'nudge', index: 3 });
    expect(matchEditorShortcut(ev('ArrowLeft', { shiftKey: true }), true)).toEqual({ id: 'nudgeFar', index: 2 });
    expect(matchEditorShortcut(ev('ArrowDown', { altKey: true }), true)?.id).toBe('nextSlide');
    expect(matchEditorShortcut(ev('ArrowUp', { altKey: true }), false)?.id).toBe('prevSlide');
    expect(matchEditorShortcut(ev('ArrowUp', cmd), true)).toBeNull();
  });
  it('zooms with = and + (shifted or numpad) and fits with 0', () => {
    expect(matchEditorShortcut(ev('=', cmd), true)?.id).toBe('zoomIn');
    expect(matchEditorShortcut(ev('+', { ...cmd, shiftKey: true }), true)?.id).toBe('zoomIn');
    expect(matchEditorShortcut(ev('-', ctrl), false)?.id).toBe('zoomOut');
    expect(matchEditorShortcut(ev('0', cmd), true)?.id).toBe('zoomFit');
  });
  it('switches families with mod+1..6 only', () => {
    expect(matchEditorShortcut(ev('3', ctrl), false)).toEqual({ id: 'family', index: 2 });
    expect(matchEditorShortcut(ev('7', ctrl), false)).toBeNull();
  });
  it('knows deleting, escaping, the help sheet and Windows redo', () => {
    expect(matchEditorShortcut(ev('Backspace'), true)?.id).toBe('delete');
    expect(matchEditorShortcut(ev('Delete'), false)?.id).toBe('delete');
    expect(matchEditorShortcut(ev('Escape'), true)?.id).toBe('deselect');
    expect(matchEditorShortcut(ev('?', { shiftKey: true }), true)?.id).toBe('shortcuts');
    expect(matchEditorShortcut(ev('d', cmd), true)?.id).toBe('duplicate');
    expect(matchEditorShortcut(ev('e', ctrl), false)?.id).toBe('export');
  });
  it('toggles the panels, using the physical key when Option changes the character', () => {
    expect(matchEditorShortcut(ev('\\', cmd), true)?.id).toBe('toggleSidebar');
    expect(matchEditorShortcut(ev('«', { ...cmd, altKey: true }, 'Backslash'), true)?.id).toBe('toggleInspector');
    expect(matchEditorShortcut(ev('\\', { ...ctrl, altKey: true }, 'Backslash'), false)?.id).toBe('toggleInspector');
  });
  it('ignores plain typing', () => {
    expect(matchEditorShortcut(ev('a'), true)).toBeNull();
    expect(matchEditorShortcut(ev('z'), true)).toBeNull();
    expect(matchEditorShortcut(ev('Enter'), true)).toBeNull();
  });
});

describe('non-Latin keyboard layouts', () => {
  it('opens the shortcuts sheet with Shift+/ where it types an Arabic question mark', () => {
    expect(matchEditorShortcut(ev('؟', { shiftKey: true }, 'Slash'), true)?.id).toBe('shortcuts');
    expect(matchEditorShortcut(ev('؟', { shiftKey: true }, 'Slash'), false)?.id).toBe('shortcuts');
    // The same key without Shift types a letter, and extra modifiers mean something else.
    expect(matchEditorShortcut(ev('ظ', {}, 'Slash'), true)).toBeNull();
    expect(matchEditorShortcut(ev('؟', { shiftKey: true, ...cmd }, 'Slash'), true)).toBeNull();
  });
  it('finds the other punctuation shortcuts by their physical keys', () => {
    expect(matchEditorShortcut(ev('ذ', cmd, 'Backslash'), true)?.id).toBe('toggleSidebar');
    expect(matchEditorShortcut(ev('ذ', ctrl, 'Backslash'), false)?.id).toBe('toggleSidebar');
    expect(matchEditorShortcut(ev('ـ', ctrl, 'Minus'), false)?.id).toBe('zoomOut');
    expect(matchEditorShortcut(ev('ص', cmd, 'Equal'), true)?.id).toBe('zoomIn');
    expect(matchEditorShortcut(ev('ص', { ...cmd, shiftKey: true }, 'Equal'), true)?.id).toBe('zoomIn');
  });
  it('leaves the keys of Latin layouts alone', () => {
    // German: the physical Slash key types "-" and "_"; French: Shift on the "!" key types "§".
    expect(matchEditorShortcut(ev('_', { shiftKey: true }, 'Slash'), true)).toBeNull();
    expect(matchEditorShortcut(ev('§', { shiftKey: true }, 'Slash'), true)).toBeNull();
    // Typed characters still win: "?" is Shift+ß on a German keyboard.
    expect(matchEditorShortcut(ev('?', { shiftKey: true }, 'Minus'), true)?.id).toBe('shortcuts');
  });
});

describe('matchKeys', () => {
  it('requires the exact modifiers in the physical fallback', () => {
    expect(matchKeys(ev('«', { metaKey: true, altKey: true }, 'Backslash'), 'mod+alt+\\', true)).toBe(true);
    expect(matchKeys(ev('«', { metaKey: true, altKey: true, shiftKey: true }, 'Backslash'), 'mod+alt+\\', true)).toBe(false);
    expect(matchKeys(ev('«', { altKey: true }, 'Backslash'), 'mod+alt+\\', true)).toBe(false);
    // Without Option the character is reliable, so no fallback.
    expect(matchKeys(ev('ü', cmd, 'Backslash'), 'mod+\\', true)).toBe(false);
  });
});

describe('context checks', () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, extra: Partial<TargetLike> = {}): TargetLike => ({
    tagName,
    getAttribute: (n: string) => attrs[n] ?? null,
    ...extra,
  });

  it('treats text fields, text areas, selects and editable content as typing targets', () => {
    expect(isEditableTarget(el('INPUT', {}, { type: 'text' }))).toBe(true);
    expect(isEditableTarget(el('input', { type: 'number' }))).toBe(true);
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('SELECT'))).toBe(true);
    expect(isEditableTarget(el('DIV', {}, { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el('DIV', { role: 'textbox' }))).toBe(true);
  });
  it('tells text entry (which Escape leaves) from other editable controls', () => {
    expect(isTextEntryTarget(el('TEXTAREA'))).toBe(true);
    expect(isTextEntryTarget(el('INPUT', {}, { type: 'text' }))).toBe(true);
    expect(isTextEntryTarget(el('INPUT', { role: 'spinbutton', type: 'text' }))).toBe(true);
    expect(isTextEntryTarget(el('DIV', {}, { isContentEditable: true }))).toBe(true);
    expect(isTextEntryTarget(el('SELECT'))).toBe(false);
    expect(isTextEntryTarget(el('BUTTON', { role: 'combobox' }))).toBe(false);
    expect(isTextEntryTarget(el('INPUT', {}, { type: 'checkbox' }))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
  it('lets buttons, checkboxes and plain elements through', () => {
    expect(isEditableTarget(el('BUTTON'))).toBe(false);
    expect(isEditableTarget(el('INPUT', {}, { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(el('DIV', { role: 'option' }))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
  it('leaves the arrows to sliders, number fields, radios and tabs, not to list rows', () => {
    expect(ownsArrowKeys(el('SPAN', { role: 'slider' }))).toBe(true);
    expect(ownsArrowKeys(el('INPUT', {}, { type: 'range' }))).toBe(true);
    expect(ownsArrowKeys(el('BUTTON', { role: 'radio' }))).toBe(true);
    expect(ownsArrowKeys(el('BUTTON', { role: 'tab' }))).toBe(true);
    expect(ownsArrowKeys(el('DIV', { role: 'option' }))).toBe(false);
    expect(ownsArrowKeys(el('BUTTON'))).toBe(false);
    expect(ownsArrowKeys(el('BODY'))).toBe(false);
  });
});

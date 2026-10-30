import { describe, expect, it } from 'vitest';
import { fieldToCommit, inputModality, isPressable, isTextEntry, movesFocus, spaceCanPan } from './focus';

/** Minimal stand-ins for DOM nodes (the rules only read these fields). */
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element;
const withRole = (tagName: string, role: string) => el(tagName, { getAttribute: (name: string) => (name === 'role' ? role : null) });
const stageWith = (...inside: Element[]) => ({ contains: (n: Element) => inside.includes(n) }) as unknown as Node;

describe('inputModality', () => {
  it('counts plain key presses as keyboard and pointer presses as pointer', () => {
    expect(inputModality({ type: 'keydown' })).toBe(true);
    expect(inputModality({ type: 'keydown', metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(inputModality({ type: 'pointerdown' })).toBe(false);
    expect(inputModality({ type: 'mousedown' })).toBe(false);
  });

  it('lets shortcuts and other events keep the last answer', () => {
    expect(inputModality({ type: 'keydown', metaKey: true })).toBeNull();
    expect(inputModality({ type: 'keydown', ctrlKey: true })).toBeNull();
    expect(inputModality({ type: 'keydown', altKey: true })).toBeNull();
    expect(inputModality({ type: 'focus' })).toBeNull();
  });
});

describe('isTextEntry', () => {
  it('knows fields that take typed text', () => {
    expect(isTextEntry(el('INPUT'))).toBe(true);
    expect(isTextEntry(el('TEXTAREA'))).toBe(true);
    expect(isTextEntry(el('SELECT'))).toBe(true);
    expect(isTextEntry(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTextEntry(el('BUTTON'))).toBe(false);
    expect(isTextEntry(el('DIV'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('movesFocus', () => {
  it('knows the keys that take focus to another control', () => {
    for (const key of ['Tab', 'ArrowDown', 'ArrowLeft', 'Home', 'End']) expect(movesFocus({ key })).toBe(true);
    expect(movesFocus({ key: 'Tab', metaKey: false, ctrlKey: false })).toBe(true);
  });

  it('leaves out shortcuts and keys after which focus only comes back', () => {
    for (const key of ['Escape', 'Enter', ' ', 'a', 'Shift', 'Delete']) expect(movesFocus({ key })).toBe(false);
    expect(movesFocus({ key: 'ArrowDown', metaKey: true })).toBe(false);
    expect(movesFocus({ key: 'ArrowUp', ctrlKey: true })).toBe(false);
  });
});

describe('isPressable', () => {
  it('knows the controls Space presses', () => {
    expect(isPressable(el('BUTTON'))).toBe(true);
    for (const role of ['button', 'switch', 'checkbox', 'radio', 'tab', 'combobox', 'menuitem']) expect(isPressable(withRole('SPAN', role))).toBe(true);
  });

  it('leaves out rows, sliders, regions, fields and the page', () => {
    for (const focus of [withRole('DIV', 'option'), withRole('SPAN', 'slider'), withRole('DIV', 'region'), el('INPUT'), el('BODY'), null]) {
      expect(isPressable(focus)).toBe(false);
    }
  });
});

describe('spaceCanPan', () => {
  const body = el('BODY');
  const viewport = withRole('DIV', 'region');
  /** A slide or layer row. */
  const row = withRole('DIV', 'option');
  const button = el('BUTTON');
  const over = { overStage: true, layerOpen: false, keyboardFocus: false };

  it('pans over the stage wherever focus rests: the page, the stage, a slide or layer row, a clicked button', () => {
    for (const focus of [null, body, viewport, row, button, withRole('BUTTON', 'switch'), withRole('SPAN', 'slider')]) {
      expect(spaceCanPan({ ...over, focus })).toBe(true);
    }
  });

  it('pans from a list row the keyboard reached too: Space only re-selects it', () => {
    expect(spaceCanPan({ ...over, focus: row, keyboardFocus: true })).toBe(true);
    expect(spaceCanPan({ ...over, focus: viewport, keyboardFocus: true })).toBe(true);
  });

  it('never pans with the pointer off the stage', () => {
    for (const focus of [body, viewport, row, button]) expect(spaceCanPan({ ...over, overStage: false, focus })).toBe(false);
  });

  it('lets text fields type the space, even with the pointer over the stage', () => {
    for (const focus of [el('INPUT'), el('TEXTAREA'), el('SELECT'), el('DIV', { isContentEditable: true })]) {
      expect(spaceCanPan({ ...over, focus })).toBe(false);
    }
  });

  it('leaves Space to an open dialog or menu', () => {
    for (const focus of [body, button, withRole('DIV', 'menuitem')]) expect(spaceCanPan({ ...over, layerOpen: true, focus })).toBe(false);
  });

  it('lets a control the keyboard moved to keep its Space until the pointer moves', () => {
    for (const focus of [button, withRole('BUTTON', 'checkbox'), withRole('BUTTON', 'tab'), withRole('BUTTON', 'combobox')]) {
      expect(spaceCanPan({ ...over, focus, keyboardFocus: true })).toBe(false);
      expect(spaceCanPan({ ...over, focus, keyboardFocus: false })).toBe(true);
    }
  });
});

describe('fieldToCommit', () => {
  it('blurs a focused field outside the stage', () => {
    const input = el('INPUT');
    expect(fieldToCommit(input, stageWith())).toBe(input);
    expect(fieldToCommit(el('TEXTAREA'), null)).not.toBeNull();
  });

  it('leaves buttons, the stage itself and nothing alone', () => {
    const inside = el('INPUT');
    expect(fieldToCommit(inside, stageWith(inside))).toBeNull();
    expect(fieldToCommit(el('BUTTON'), stageWith())).toBeNull();
    expect(fieldToCommit(null, stageWith())).toBeNull();
  });
});

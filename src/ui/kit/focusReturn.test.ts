import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusReturn, focusOrigin } from './focusReturn';

/** What modality's pressedControl() reports: the control the pointer pressed last. */
const pointer = vi.hoisted(() => ({ pressed: null as unknown }));
vi.mock('./modality', () => ({ pressedControl: () => pointer.pressed }));

/** An element on the page, inside a dialog, or inside the toast region. */
class FakeElement {
  isConnected = true;
  focusCalls = 0;
  readonly where: 'page' | 'dialog' | 'toasts';
  constructor(where: 'page' | 'dialog' | 'toasts' = 'page') {
    this.where = where;
  }
  closest(selector: string) {
    if (this.where === 'dialog' && selector.includes('[role="dialog"]')) return this;
    if (this.where === 'toasts' && selector.includes('data-kit-toasts')) return this;
    return null;
  }
  focus() {
    this.focusCalls++;
  }
}

const el = (where?: FakeElement['where']) => new FakeElement(where) as FakeElement & HTMLElement;

beforeEach(() => {
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('Element', FakeElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
  pointer.pressed = null;
});

describe('createFocusReturn', () => {
  it('returns focus to the control that opened the dialog', () => {
    const opener = el();
    const elsewhere = el();
    const focus = createFocusReturn(opener);
    // While the opener is on the page, other focus moves change nothing.
    focus.observe(elsewhere);
    expect(focus.restore()).toBe(true);
    expect(opener.focusCalls).toBe(1);
    expect(elsewhere.focusCalls).toBe(0);
  });

  it('has nowhere to go when nothing had focus, or the opener left the page', () => {
    expect(createFocusReturn(null).restore()).toBe(false);
    const opener = el();
    const focus = createFocusReturn(opener);
    opener.isConnected = false;
    expect(focus.restore()).toBe(false);
    expect(opener.focusCalls).toBe(0);
  });

  it("follows a menu item's handoff to the menu trigger", () => {
    const item = el();
    const focus = createFocusReturn(item);
    item.isConnected = false; // the menu closed
    // Focus inside a dialog (this one, or a confirm over it) and on toasts is never the way back.
    focus.observe(el('dialog'));
    focus.observe(el('toasts'));
    focus.observe(null);
    focus.observe({} as EventTarget);
    const trigger = el();
    focus.observe(trigger);
    // Once the trigger holds the place, later moves outside do not take it.
    focus.observe(el());
    expect(focus.restore()).toBe(true);
    expect(trigger.focusCalls).toBe(1);
  });
});

describe('focusOrigin', () => {
  it('is the focused element, or null when focus is on the page itself', () => {
    const body = el();
    const button = el();
    vi.stubGlobal('document', { activeElement: button, body });
    expect(focusOrigin()).toBe(button);
    vi.stubGlobal('document', { activeElement: body, body });
    expect(focusOrigin()).toBeNull();
    vi.stubGlobal('document', { activeElement: null, body });
    expect(focusOrigin()).toBeNull();
  });

  it('falls back to the control the pointer pressed: WebKit leaves a clicked button unfocused', () => {
    const body = el();
    const clicked = el();
    pointer.pressed = clicked;
    vi.stubGlobal('document', { activeElement: body, body });
    expect(focusOrigin()).toBe(clicked);
    // Focus that is somewhere wins over the last press.
    const focused = el();
    vi.stubGlobal('document', { activeElement: focused, body });
    expect(focusOrigin()).toBe(focused);
  });
});

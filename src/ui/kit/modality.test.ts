import { afterEach, describe, expect, it, vi } from 'vitest';
import { isKeyboardNavigation, markNotNavigation, pointerModality, pressedControl, trackInputModality, type ModalityKeyEvent } from './modality';

const key = (k: string, mods: Partial<ModalityKeyEvent> = {}): ModalityKeyEvent => ({ key: k, metaKey: false, ctrlKey: false, ...mods });

/** A window that records its capture listeners, and an <html> with a dataset. */
function fakeDom() {
  const listeners = new Map<string, (e: unknown) => void>();
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: (e: unknown) => void, capture?: boolean) => {
      // Capture on window: ahead of every handler that moves focus.
      expect(capture).toBe(true);
      listeners.set(type, fn);
    },
    removeEventListener: (type: string) => listeners.delete(type),
  });
  const root = { dataset: {} as Record<string, string | undefined> };
  vi.stubGlobal('document', { documentElement: root });
  return { listeners, root, fire: (type: string, e: unknown = {}) => listeners.get(type)?.(e) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isKeyboardNavigation', () => {
  it('counts the keys that move or use focus', () => {
    for (const k of ['Tab', 'ArrowDown', 'Enter', ' ', 'Escape', 'a', 'F2']) expect(isKeyboardNavigation(key(k)), k).toBe(true);
  });

  it('ignores shortcuts and lone modifiers: the hand may still be on the mouse', () => {
    expect(isKeyboardNavigation(key('z', { metaKey: true }))).toBe(false);
    expect(isKeyboardNavigation(key('c', { ctrlKey: true }))).toBe(false);
    for (const k of ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock']) expect(isKeyboardNavigation(key(k)), k).toBe(false);
  });
});

describe('trackInputModality', () => {
  it('keeps the last input on <html data-modality>', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    expect(pointerModality()).toBe(false);
    dom.fire('pointerdown');
    expect(dom.root.dataset.modality).toBe('pointer');
    expect(pointerModality()).toBe(true);
    dom.fire('keydown', key('z', { metaKey: true }));
    expect(dom.root.dataset.modality).toBe('pointer');
    dom.fire('keydown', key('Tab'));
    expect(dom.root.dataset.modality).toBe('keyboard');
    expect(pointerModality()).toBe(false);
    stop();
  });

  it('installs once and stops cleanly', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    expect(trackInputModality()).toBe(stop);
    expect([...dom.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    stop();
    expect(dom.listeners.size).toBe(0);
    const again = trackInputModality();
    expect(again).not.toBe(stop);
    again();
  });

  it('does nothing without a DOM', () => {
    expect(() => trackInputModality()()).not.toThrow();
    expect(() => markNotNavigation()).not.toThrow();
    expect(pointerModality()).toBe(false);
    expect(pressedControl()).toBeNull();
  });

  it('counts Space that presses the focused button as keyboard use', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('pointerdown');
    dom.fire('keydown', key(' '));
    expect(dom.root.dataset.modality).toBe('keyboard');
    stop();
  });

  it('learns nothing new from the repeats of a held key', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('keydown', key('ArrowDown'));
    // A click while the arrow is still held: its repeats do not take the pointer modality away.
    dom.fire('pointerdown');
    dom.fire('keydown', { ...key('ArrowDown'), repeat: true });
    expect(dom.root.dataset.modality).toBe('pointer');
    stop();
  });
});

describe('markNotNavigation', () => {
  it('takes back the Space press that arms a pan, so a row the mouse focused shows no ring', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('pointerdown');
    // The tracker counts the press first (it captures on window from startup); the stage takes it back.
    dom.fire('keydown', key(' '));
    markNotNavigation();
    expect(dom.root.dataset.modality).toBe('pointer');
    // Held down, Space repeats until the pan's pointerdown: no ring meanwhile either.
    dom.fire('keydown', { ...key(' '), repeat: true });
    expect(dom.root.dataset.modality).toBe('pointer');
    // The next real key press counts again.
    dom.fire('keydown', key('Tab'));
    expect(dom.root.dataset.modality).toBe('keyboard');
    stop();
  });

  it('leaves a keyboard user in keyboard modality', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('keydown', key('Tab'));
    dom.fire('keydown', key(' '));
    markNotNavigation();
    expect(dom.root.dataset.modality).toBe('keyboard');
    stop();
  });

  it('puts back no modality when the first input of all is taken back', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('keydown', key(' '));
    markNotNavigation();
    expect(dom.root.dataset.modality).toBeUndefined();
    stop();
  });

  it('only takes back the key press being handled', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('pointerdown');
    dom.fire('keydown', key('Tab'));
    // A shortcut the tracker does not count, then a call: the Tab before it stays counted.
    dom.fire('keydown', key('z', { metaKey: true }));
    markNotNavigation();
    expect(dom.root.dataset.modality).toBe('keyboard');
    // Nor does a call after a pointer press reach back to the key press before it.
    dom.fire('keydown', key('Tab'));
    dom.fire('pointerdown');
    markNotNavigation();
    expect(dom.root.dataset.modality).toBe('pointer');
    stop();
  });

  it('does nothing while the tracker is stopped', () => {
    const dom = fakeDom();
    const stop = trackInputModality();
    dom.fire('pointerdown');
    dom.fire('keydown', key(' '));
    stop();
    markNotNavigation();
    expect(dom.root.dataset.modality).toBe('keyboard');
  });
});

/** An element whose closest() finds `control` (the focusable control around it), or nothing. */
class FakeElement {
  isConnected = true;
  selector = '';
  control: FakeElement | null;
  constructor(control?: FakeElement) {
    this.control = control ?? null;
  }
  closest(selector: string) {
    this.selector = selector;
    return this.control;
  }
}

describe('pressedControl', () => {
  it('remembers the focusable control a press landed in, while it is on the page', () => {
    const dom = fakeDom();
    vi.stubGlobal('Element', FakeElement);
    const stop = trackInputModality();
    const button = new FakeElement();
    const icon = new FakeElement(button);
    dom.fire('pointerdown', { target: icon });
    expect(icon.selector).toContain('button');
    expect(icon.selector).toContain('[tabindex]');
    expect(pressedControl()).toBe(button);
    button.isConnected = false;
    expect(pressedControl()).toBeNull();
    button.isConnected = true;
    // A press on something nothing can focus (the canvas) forgets the last control.
    dom.fire('pointerdown', { target: new FakeElement() });
    expect(pressedControl()).toBeNull();
    dom.fire('pointerdown', { target: icon });
    stop();
    expect(pressedControl()).toBeNull();
  });
});

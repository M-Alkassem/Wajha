import { describe, expect, it } from 'vitest';
import { ariaKeyShortcuts, formatShortcut, isMacPlatform, matchShortcut, parseShortcut, shortcutLabel, shortcutText } from './keys';

const ev = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, code?: string) => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('parseShortcut', () => {
  it('splits modifiers and keys, case-insensitively, with aliases', () => {
    const p = parseShortcut('Mod+Shift+Z');
    expect([...p.modifiers]).toEqual(['mod', 'shift']);
    expect(p.keys).toEqual(['Z']);
    expect([...parseShortcut('cmd+option+ctrl+k').modifiers].sort()).toEqual(['alt', 'ctrl', 'meta']);
  });
  it('understands the plus key and arrays', () => {
    expect(parseShortcut('mod++').keys).toEqual(['+']);
    expect(parseShortcut('+').keys).toEqual(['+']);
    expect(parseShortcut(['mod', 'k']).keys).toEqual(['k']);
    expect(parseShortcut(' mod + d ').keys).toEqual(['d']);
  });
});

describe('formatShortcut', () => {
  it('uses macOS symbols in Apple order (⌃ ⌥ ⇧ ⌘)', () => {
    expect(formatShortcut('mod+shift+z', true)).toEqual(['⇧', '⌘', 'Z']);
    expect(formatShortcut('shift+alt+ctrl+mod+p', true)).toEqual(['⌃', '⌥', '⇧', '⌘', 'P']);
    expect(formatShortcut('alt+arrowup', true)).toEqual(['⌥', '↑']);
    expect(formatShortcut('enter', true)).toEqual(['↩']);
    expect(formatShortcut('backspace', true)).toEqual(['⌫']);
    expect(formatShortcut('delete', true)).toEqual(['⌦']);
  });
  it('uses words elsewhere, with mod as Ctrl', () => {
    expect(formatShortcut('mod+shift+z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(formatShortcut('shift+alt+mod+p', false)).toEqual(['Ctrl', 'Alt', 'Shift', 'P']);
    expect(formatShortcut('meta+e', false)).toEqual(['Win', 'E']);
    expect(formatShortcut('escape', false)).toEqual(['Esc']);
    expect(formatShortcut('delete', false)).toEqual(['Del']);
  });
  it('keeps F-keys and capitalizes other words', () => {
    expect(formatShortcut('F2', true)).toEqual(['F2']);
    expect(formatShortcut('mod+,', true)).toEqual(['⌘', ',']);
    expect(formatShortcut('home', false)).toEqual(['Home']);
    expect(formatShortcut('insert', false)).toEqual(['Insert']);
  });
});

describe('text and spoken forms', () => {
  it('joins for menus', () => {
    expect(shortcutText('mod+shift+e', true)).toBe('⇧⌘E');
    expect(shortcutText('mod+shift+e', false)).toBe('Ctrl+Shift+E');
  });
  it('spells out keys for screen readers', () => {
    expect(shortcutLabel('mod+shift+z', true)).toBe('Shift Command Z');
    expect(shortcutLabel('mod+alt+arrowleft', false)).toBe('Control Alt Left arrow');
    expect(shortcutLabel('alt+k', true)).toBe('Option K');
  });
  it('produces aria-keyshortcuts values (modifiers first, in one canonical order)', () => {
    expect(ariaKeyShortcuts('mod+shift+z', true)).toBe('Shift+Meta+Z');
    expect(ariaKeyShortcuts('shift+mod+z', true)).toBe('Shift+Meta+Z');
    expect(ariaKeyShortcuts('mod+shift+z', false)).toBe('Control+Shift+Z');
    expect(ariaKeyShortcuts('delete', false)).toBe('Delete');
  });
});

describe('matchShortcut', () => {
  it('matches mod per platform and requires exact modifiers', () => {
    expect(matchShortcut(ev('z', { metaKey: true }), 'mod+z', true)).toBe(true);
    expect(matchShortcut(ev('z', { ctrlKey: true }), 'mod+z', true)).toBe(false);
    expect(matchShortcut(ev('z', { ctrlKey: true }), 'mod+z', false)).toBe(true);
    expect(matchShortcut(ev('Z', { metaKey: true, shiftKey: true }), 'mod+z', true)).toBe(false);
    expect(matchShortcut(ev('Z', { metaKey: true, shiftKey: true }), 'mod+shift+z', true)).toBe(true);
    expect(matchShortcut(ev('z', { metaKey: true, altKey: true }), 'mod+z', true)).toBe(false);
  });
  it('falls back to the physical key for letters and digits', () => {
    // Option changes the character on macOS; a Cyrillic layout types "я".
    expect(matchShortcut(ev('Ω', { altKey: true }, 'KeyZ'), 'alt+z', true)).toBe(true);
    expect(matchShortcut(ev('я', { ctrlKey: true }, 'KeyZ'), 'mod+z', false)).toBe(true);
    expect(matchShortcut(ev('١', { metaKey: true }, 'Digit1'), 'mod+1', true)).toBe(true);
  });
  it('matches named keys and shifted symbols', () => {
    expect(matchShortcut(ev('Escape'), 'escape', true)).toBe(true);
    expect(matchShortcut(ev('Backspace'), 'backspace', false)).toBe(true);
    expect(matchShortcut(ev('ArrowUp', { altKey: true }), 'alt+up', true)).toBe(true);
    expect(matchShortcut(ev('?', { shiftKey: true }), '?', true)).toBe(true);
    expect(matchShortcut(ev('+', { metaKey: true, shiftKey: true }), 'mod++', true)).toBe(true);
  });
  it('rejects multi-key and empty shortcuts', () => {
    expect(matchShortcut(ev('a'), 'a+b', true)).toBe(false);
    expect(matchShortcut(ev('a'), 'mod', true)).toBe(false);
  });
});

describe('isMacPlatform', () => {
  it('reads userAgentData, platform or userAgent', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' } })).toBe(true);
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'iPad' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false);
    expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15' })).toBe(true);
    expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(false);
  });
  it('is false without a navigator', () => {
    expect(isMacPlatform(null)).toBe(false);
    expect(isMacPlatform({})).toBe(false);
  });
});

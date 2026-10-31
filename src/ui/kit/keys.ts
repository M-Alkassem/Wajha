
import { t } from '../../i18n';/**
 * Keyboard shortcut helpers shared by Kbd, Tooltip, the menus and the app's
 * own key handling. Shortcuts are written once, platform-neutral, as
 * "mod+shift+z": `mod` is Command on macOS and Control elsewhere.
 */

export type ShortcutInput = string | readonly string[];

type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

const MODIFIER_ALIASES: Record<string, Modifier | 'mod'> = {
  mod: 'mod',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
};

/* macOS lists modifiers as Control, Option, Shift, Command; Windows and
   Linux as Ctrl, Alt, Shift, Win. */
const MAC_ORDER: Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];
const PC_ORDER: Modifier[] = ['ctrl', 'alt', 'shift', 'meta'];

const MAC_MODIFIER_LABEL: Record<Modifier, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const PC_MODIFIER_LABEL: Record<Modifier, string> = { ctrl: t('Ctrl'), alt: t('Alt'), shift: t('Shift'), meta: t('Win') };
const MODIFIER_WORD: Record<Modifier, { mac: string; pc: string }> = {
  ctrl: { mac: 'Control', pc: 'Control' },
  alt: { mac: 'Option', pc: 'Alt' },
  shift: { mac: 'Shift', pc: 'Shift' },
  meta: { mac: 'Command', pc: 'Windows' },
};
const ARIA_MODIFIER: Record<Modifier, string> = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' };

interface KeyName {
  /** Canonical name, compared against KeyboardEvent.key (lower-cased). */
  key: string;
  mac: string;
  pc: string;
  word: string;
  aria: string;
}

const NAMED_KEYS: Record<string, KeyName> = {};
function named(aliases: string[], key: string, mac: string, pc: string, word: string, aria: string) {
  for (const a of aliases) NAMED_KEYS[a] = { key, mac, pc, word, aria };
}
named(['enter', 'return'], 'enter', '↩', 'Enter', 'Enter', 'Enter');
named(['escape', 'esc'], 'escape', 'Esc', 'Esc', 'Escape', 'Escape');
named(['backspace'], 'backspace', '⌫', 'Backspace', 'Backspace', 'Backspace');
named(['delete', 'del'], 'delete', '⌦', 'Del', 'Delete', 'Delete');
named(['tab'], 'tab', '⇥', 'Tab', 'Tab', 'Tab');
named(['space', 'spacebar'], ' ', 'Space', 'Space', 'Space', 'Space');
named(['up', 'arrowup'], 'arrowup', '↑', '↑', 'Up arrow', 'ArrowUp');
named(['down', 'arrowdown'], 'arrowdown', '↓', '↓', 'Down arrow', 'ArrowDown');
named(['left', 'arrowleft'], 'arrowleft', '←', '←', 'Left arrow', 'ArrowLeft');
named(['right', 'arrowright'], 'arrowright', '→', '→', 'Right arrow', 'ArrowRight');
named(['pageup'], 'pageup', 'PgUp', 'PgUp', 'Page up', 'PageUp');
named(['pagedown'], 'pagedown', 'PgDn', 'PgDn', 'Page down', 'PageDown');
named(['home'], 'home', 'Home', 'Home', 'Home', 'Home');
named(['end'], 'end', 'End', 'End', 'End', 'End');
named(['plus'], '+', '+', '+', 'Plus', '+');
named(['minus'], '-', '−', '−', 'Minus', '-');

export interface ParsedShortcut {
  modifiers: Set<Modifier | 'mod'>;
  /** Non-modifier keys in the order written. */
  keys: string[];
}

/** Splits "mod+shift+z" (or ["mod", "shift", "z"]) into modifiers and keys. "mod++" means mod and the plus key. */
export function parseShortcut(input: ShortcutInput): ParsedShortcut {
  let parts: string[];
  if (typeof input === 'string') {
    const s = input.trim();
    if (s === '+') parts = ['+'];
    else if (s.endsWith('++')) parts = [...s.slice(0, -2).split('+'), '+'];
    else parts = s.split('+');
  } else {
    parts = [...input];
  }
  const modifiers = new Set<Modifier | 'mod'>();
  const keys: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (mod) modifiers.add(mod);
    else keys.push(part);
  }
  return { modifiers, keys };
}

function resolveModifiers(parsed: ParsedShortcut, mac: boolean): Set<Modifier> {
  const out = new Set<Modifier>();
  for (const m of parsed.modifiers) out.add(m === 'mod' ? (mac ? 'meta' : 'ctrl') : m);
  return out;
}

function keyLabel(key: string, mac: boolean): string {
  const n = NAMED_KEYS[key.toLowerCase()];
  if (n) return mac ? n.mac : n.pc;
  // Single characters read best upper-cased (Z, not z); F-keys and words stay as written.
  return key.length === 1 ? key.toLocaleUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

/** Display labels for each key of a shortcut: ["⌘", "⇧", "Z"] on macOS, ["Ctrl", "Shift", "Z"] elsewhere. */
export function formatShortcut(input: ShortcutInput, mac: boolean): string[] {
  const parsed = parseShortcut(input);
  const mods = resolveModifiers(parsed, mac);
  const order = mac ? MAC_ORDER : PC_ORDER;
  const labels = mac ? MAC_MODIFIER_LABEL : PC_MODIFIER_LABEL;
  return [...order.filter((m) => mods.has(m)).map((m) => labels[m]), ...parsed.keys.map((k) => keyLabel(k, mac))];
}

/** One-string form for menus: "⌘⇧Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function shortcutText(input: ShortcutInput, mac: boolean): string {
  const labels = formatShortcut(input, mac);
  return mac ? labels.join('') : labels.join('+');
}

/** Spoken form for screen readers: "Command Shift Z". */
export function shortcutLabel(input: ShortcutInput, mac: boolean): string {
  const parsed = parseShortcut(input);
  const mods = resolveModifiers(parsed, mac);
  const order = mac ? MAC_ORDER : PC_ORDER;
  const words = order.filter((m) => mods.has(m)).map((m) => (mac ? MODIFIER_WORD[m].mac : MODIFIER_WORD[m].pc));
  for (const k of parsed.keys) {
    const n = NAMED_KEYS[k.toLowerCase()];
    words.push(n ? n.word : k.length === 1 ? k.toLocaleUpperCase() : k);
  }
  return words.join(' ');
}

/** Value for the aria-keyshortcuts attribute, e.g. "Meta+Shift+Z". */
export function ariaKeyShortcuts(input: ShortcutInput, mac: boolean): string {
  const parsed = parseShortcut(input);
  const mods = resolveModifiers(parsed, mac);
  const parts = PC_ORDER.filter((m) => mods.has(m)).map((m) => ARIA_MODIFIER[m]);
  for (const k of parsed.keys) {
    const n = NAMED_KEYS[k.toLowerCase()];
    parts.push(n ? n.aria : k.length === 1 ? k.toLocaleUpperCase() : k);
  }
  return parts.join('+');
}

export interface ShortcutEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * True when a keyboard event matches a single-key shortcut exactly (no extra
 * modifiers). Letters also match by physical key code, so Option+letter on
 * macOS and non-Latin keyboard layouts still trigger "mod+z".
 */
export function matchShortcut(event: ShortcutEventLike, input: ShortcutInput, mac: boolean): boolean {
  const parsed = parseShortcut(input);
  if (parsed.keys.length !== 1) return false;
  const mods = resolveModifiers(parsed, mac);
  if (event.metaKey !== mods.has('meta')) return false;
  if (event.ctrlKey !== mods.has('ctrl')) return false;
  if (event.altKey !== mods.has('alt')) return false;
  const want = parsed.keys[0];
  const wantLower = want.toLowerCase();
  const n = NAMED_KEYS[wantLower];
  const target = n ? n.key : wantLower;
  const key = event.key.toLowerCase();
  // Shifted symbols ("?" is shift+/) carry the shift in the character itself.
  const symbol = target.length === 1 && !/[a-z0-9]/.test(target);
  if (!symbol && event.shiftKey !== mods.has('shift')) return false;
  if (key === target) return true;
  if (/^[a-z]$/.test(target) && event.code === `Key${target.toUpperCase()}`) return true;
  if (/^[0-9]$/.test(target) && event.code === `Digit${target}`) return true;
  return false;
}

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/** Detects Apple platforms from a navigator-like object (defaults to the global one). */
export function isMacPlatform(nav?: NavigatorLike | null): boolean {
  const n: NavigatorLike | undefined | null = nav === undefined ? (typeof navigator === 'undefined' ? undefined : (navigator as NavigatorLike)) : nav;
  if (!n) return false;
  const hint = n.userAgentData?.platform ?? n.platform ?? '';
  if (/mac|iphone|ipad|ipod|darwin/i.test(hint)) return true;
  return /Macintosh|Mac OS X|iPhone|iPad/i.test(n.userAgent ?? '');
}

let cachedMac: boolean | null = null;

/** Cached platform check for render code; the platform never changes at runtime. */
export function platformIsMac(): boolean {
  if (cachedMac === null) cachedMac = isMacPlatform();
  return cachedMac;
}

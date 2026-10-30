/**
 * Pure helpers behind the shortcuts dialog: groups in order, search, and a
 * compact display for shortcuts with many alternatives (arrow keys, mod+1-6).
 */
import { formatShortcut, parseShortcut, platformIsMac, shortcutLabel } from '../../kit';

export interface ShortcutLike {
  id: string;
  label: string;
  keys: readonly string[];
  group: string;
}

/** Groups in order of first appearance, items in list order. */
export function groupShortcuts<T extends ShortcutLike>(list: readonly T[]): { group: string; items: T[] }[] {
  const groups: { group: string; items: T[] }[] = [];
  for (const item of list) {
    let g = groups.find((x) => x.group === item.group);
    if (!g) {
      g = { group: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();

/**
 * Names people type for a key that its label in the dialog and its spoken
 * name do not give (see keyNames), by modifier or by key as the shortcut
 * table writes it. The modifier symbols mean the same key everywhere.
 */
const TYPED_NAMES: Record<string, readonly string[]> = {
  meta: ['⌘'],
  ctrl: ['⌃'],
  alt: ['⌥'],
  shift: ['⇧'],
  enter: ['return'],
  delete: ['del'],
  space: ['spacebar'],
  arrowup: ['arrows'],
  arrowdown: ['arrows'],
  arrowleft: ['arrows'],
  arrowright: ['arrows'],
  minus: ['-'],
  '\\': ['backslash'],
};

/** Mac names: ⌘ is "cmd", ⌃ "ctrl", ⌥ also reads "alt" or "opt", and the key that erases backwards reads "delete". */
const MAC_TYPED_NAMES: Record<string, readonly string[]> = {
  meta: ['cmd'],
  ctrl: ['ctrl'],
  alt: ['alt', 'opt'],
  backspace: ['delete'],
};

/**
 * Every name of one key of a shortcut on this platform, folded: its label
 * in the dialog (⌘, Ctrl, ↑), the words of its spoken name (Command, Up
 * arrow), the name the table writes (arrowup) and the typed ones above.
 */
function keyNames(key: string, mac: boolean): string[] {
  const id = key.toLowerCase();
  const names = [id, ...formatShortcut([key], mac), ...shortcutLabel([key], mac).split(' '), ...(TYPED_NAMES[id] ?? []), ...((mac && MAC_TYPED_NAMES[id]) || [])];
  return names.map(fold);
}

/**
 * The keys a query may name together in one shortcut, in table syntax:
 * each alternative ("mod", "shift", "z"), and each group the dialog draws
 * ("shift", "arrowup", "arrowdown", ... for "⇧ ↑ ↓ ← →").
 */
function keyGroups(keys: readonly string[]): string[][] {
  const alternatives = keys.map((k) => {
    const p = parseShortcut(k);
    return [...p.modifiers, ...p.keys];
  });
  return [...alternatives, ...displayShortcuts(keys)];
}

/**
 * The keys a query names: words ("cmd", "z", "esc") and single symbols
 * ("⌘", "⇧", "?", "+"), so "⌘⇧Z" reads as three keys. A "+" or "-" after
 * a key and before another only joins them ("ctrl+z", "ctrl-z"); anywhere
 * else it is the plus or minus key ("cmd +", "ctrl+-").
 */
function queryKeys(q: string): string[] {
  const parts = q.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  const keys: string[] = [];
  let afterKey = false;
  parts.forEach((part, i) => {
    if ((part === '+' || part === '-') && afterKey && i < parts.length - 1) {
      afterKey = false;
      return;
    }
    keys.push(part);
    afterKey = true;
  });
  return keys;
}

/** True when `name` is `typed`, or begins with it once three characters are typed ("comm", "backsp"). */
const nameMatches = (name: string, typed: string) => name === typed || (typed.length >= 3 && name.startsWith(typed));

/**
 * Shortcuts whose label or group contains `query`, or that press every key
 * it names, by the key's label in the dialog or a typed name on this
 * platform: "esc", "cmd z", "⌘⇧Z", "ctrl+shift+z", "option", "delete", "up".
 */
export function filterShortcuts<T extends ShortcutLike>(list: readonly T[], query: string, mac: boolean = platformIsMac()): T[] {
  const q = fold(query.trim());
  if (!q) return [...list];
  const typed = queryKeys(q);
  const pressesAll = (group: string[]) => {
    const named = group.map((k) => keyNames(k === 'mod' ? (mac ? 'meta' : 'ctrl') : k, mac));
    return typed.every((t) => named.some((names) => names.some((n) => nameMatches(n, t))));
  };
  return list.filter((s) => fold(s.label).includes(q) || fold(s.group).includes(q) || (typed.length > 0 && keyGroups(s.keys).some(pressesAll)));
}

/**
 * How to show a shortcut's alternatives, each as Kbd parts. Three or more
 * alternatives with the same modifiers collapse into one: consecutive
 * digits become a range ("mod", "1–6"), other keys are listed after the
 * modifiers ("shift", "arrowup", "arrowdown", ...).
 */
export function displayShortcuts(keys: readonly string[]): string[][] {
  const parsed = keys.map((k) => {
    const p = parseShortcut(k);
    return { mods: [...p.modifiers].sort(), keys: p.keys };
  });
  const sameMods = parsed.length >= 3 && parsed.every((p) => p.keys.length === 1 && p.mods.join('+') === parsed[0].mods.join('+'));
  if (sameMods) {
    const ks = parsed.map((p) => p.keys[0]);
    const digits = ks.every((k) => /^\d$/.test(k)) && ks.every((k, i) => i === 0 || Number(k) === Number(ks[i - 1]) + 1);
    return [[...parsed[0].mods, ...(digits ? [`${ks[0]}–${ks[ks.length - 1]}`] : ks)]];
  }
  return parsed.map((p) => [...p.mods, ...p.keys]);
}

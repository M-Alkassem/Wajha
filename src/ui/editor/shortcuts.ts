/**
 * The editor's keyboard shortcuts in one table: useEditorShortcuts handles
 * them, the shortcuts dialog lists them and tooltips show them. Keys use the
 * kit's platform-neutral syntax ("mod+shift+z": mod is Command on macOS and
 * Control elsewhere); alternatives are separate entries of `keys`.
 */
import { matchShortcut, parseShortcut, platformIsMac, type ShortcutEventLike } from '../kit';

export type EditorShortcutId =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'nudge'
  | 'nudgeFar'
  | 'deselect'
  | 'prevSlide'
  | 'nextSlide'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'family'
  | 'toggleSidebar'
  | 'toggleInspector'
  | 'export'
  | 'shortcuts';

export type EditorShortcutGroup = 'General' | 'Edit' | 'Arrange' | 'Slides' | 'View';

export interface EditorShortcut {
  id: EditorShortcutId;
  label: string;
  /** Alternatives, kit shortcut syntax. The first is the one menus and tooltips show. */
  keys: string[];
  group: EditorShortcutGroup;
}

/** Group order for listings. */
export const EDITOR_SHORTCUT_GROUPS: readonly EditorShortcutGroup[] = ['General', 'Edit', 'Arrange', 'Slides', 'View'];

/** Number of device families reachable with mod+1 ... mod+6. */
export const FAMILY_SHORTCUT_COUNT = 6;

const mac = platformIsMac();

export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = [
  { id: 'export', label: 'Export screenshots', keys: ['mod+e'], group: 'General' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', keys: ['?'], group: 'General' },
  { id: 'toggleSidebar', label: 'Show or hide the sidebar', keys: ['mod+\\'], group: 'General' },
  { id: 'toggleInspector', label: 'Show or hide the inspector', keys: ['mod+alt+\\'], group: 'General' },

  { id: 'undo', label: 'Undo', keys: ['mod+z'], group: 'Edit' },
  // Ctrl+Y is the Windows and Linux habit; macOS keeps to Shift+Command+Z.
  { id: 'redo', label: 'Redo', keys: mac ? ['mod+shift+z'] : ['mod+shift+z', 'mod+y'], group: 'Edit' },
  { id: 'copy', label: 'Copy', keys: ['mod+c'], group: 'Edit' },
  { id: 'cut', label: 'Cut', keys: ['mod+x'], group: 'Edit' },
  { id: 'paste', label: 'Paste', keys: ['mod+v'], group: 'Edit' },
  { id: 'duplicate', label: 'Duplicate layer (or slide)', keys: ['mod+d'], group: 'Edit' },
  { id: 'delete', label: 'Delete layer', keys: ['backspace', 'delete'], group: 'Edit' },

  { id: 'nudge', label: 'Nudge 1 px', keys: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'], group: 'Arrange' },
  { id: 'nudgeFar', label: 'Nudge 10 px', keys: ['shift+arrowup', 'shift+arrowdown', 'shift+arrowleft', 'shift+arrowright'], group: 'Arrange' },
  { id: 'deselect', label: 'Leave the text field, or deselect', keys: ['escape'], group: 'Arrange' },

  { id: 'prevSlide', label: 'Previous slide', keys: ['alt+arrowup'], group: 'Slides' },
  { id: 'nextSlide', label: 'Next slide', keys: ['alt+arrowdown'], group: 'Slides' },

  { id: 'zoomIn', label: 'Zoom in', keys: ['mod+plus', 'mod+='], group: 'View' },
  { id: 'zoomOut', label: 'Zoom out', keys: ['mod+minus'], group: 'View' },
  { id: 'zoomFit', label: 'Zoom to fit', keys: ['mod+0'], group: 'View' },
  {
    id: 'family',
    label: 'Switch device family',
    keys: Array.from({ length: FAMILY_SHORTCUT_COUNT }, (_, i) => `mod+${i + 1}`),
    group: 'View',
  },
];

const BY_ID = new Map(EDITOR_SHORTCUTS.map((s) => [s.id, s]));

/** The table entry for `id`. */
export function editorShortcut(id: EditorShortcutId): EditorShortcut {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown editor shortcut: ${id}`);
  return s;
}

/** The keys menus and tooltips show for `id` (its first alternative). */
export function shortcutKeys(id: EditorShortcutId): string {
  return editorShortcut(id).keys[0];
}

/* Matching ------------------------------------------------------------ */

/**
 * Physical keys of punctuation on a US layout; shifted symbols carry their
 * Shift ("?" is Shift+/). For when the typed character is not the one a
 * shortcut names: with Option/Alt (Option+\ types « on macOS) and on
 * non-Latin layouts (Shift+/ types ؟ on Arabic ones).
 */
const SYMBOL_KEYS: Record<string, { code: string; shift: boolean }> = {
  '\\': { code: 'Backslash', shift: false },
  '=': { code: 'Equal', shift: false },
  plus: { code: 'Equal', shift: true },
  '-': { code: 'Minus', shift: false },
  minus: { code: 'Minus', shift: false },
  '/': { code: 'Slash', shift: false },
  '?': { code: 'Slash', shift: true },
  ',': { code: 'Comma', shift: false },
  '.': { code: 'Period', shift: false },
  '[': { code: 'BracketLeft', shift: false },
  ']': { code: 'BracketRight', shift: false },
  ';': { code: 'Semicolon', shift: false },
  "'": { code: 'Quote', shift: false },
  '`': { code: 'Backquote', shift: false },
};

/**
 * A character from a non-Latin layout (Arabic, Hebrew, Persian, Cyrillic...).
 * Latin-1 is left out, so the accented keys of European layouts (§, ß, é)
 * keep their own meaning.
 */
function nonLatinCharacter(key: string): boolean {
  const cp = key.codePointAt(0) ?? 0;
  return cp > 0xff && key.length === (cp > 0xffff ? 2 : 1);
}

/** matchShortcut, plus a physical-key fallback for punctuation under Option/Alt or typed on a non-Latin layout. */
export function matchKeys(event: ShortcutEventLike, keys: string, isMac: boolean): boolean {
  if (matchShortcut(event, keys, isMac)) return true;
  const { modifiers, keys: named } = parseShortcut(keys);
  const symbol = named.length === 1 ? SYMBOL_KEYS[named[0].toLowerCase()] : undefined;
  if (!symbol || event.code !== symbol.code) return false;
  const alt = modifiers.has('alt');
  // Without Option/Alt, another Latin character on that key means another key was meant
  // (the physical Slash key types "-" on a German keyboard).
  if (!alt && !nonLatinCharacter(event.key)) return false;
  const wantMeta = modifiers.has('meta') || (modifiers.has('mod') && isMac);
  const wantCtrl = modifiers.has('ctrl') || (modifiers.has('mod') && !isMac);
  const wantShift = modifiers.has('shift') || symbol.shift;
  return event.altKey === alt && event.metaKey === wantMeta && event.ctrlKey === wantCtrl && event.shiftKey === wantShift;
}

export interface ShortcutHit {
  id: EditorShortcutId;
  /** Index of the matching alternative in `keys` (which arrow, which family number). */
  index: number;
}

/** The editor shortcut a keyboard event triggers, or null. */
export function matchEditorShortcut(event: ShortcutEventLike, isMac: boolean = mac): ShortcutHit | null {
  for (const s of EDITOR_SHORTCUTS) {
    for (let i = 0; i < s.keys.length; i++) {
      if (matchKeys(event, s.keys[i], isMac)) return { id: s.id, index: i };
    }
  }
  return null;
}

/* Context rules ------------------------------------------------------- */

/** Shortcuts that still work while a text field has focus (they mean nothing to the field). */
export const WORKS_WHILE_TYPING: ReadonlySet<EditorShortcutId> = new Set(['export', 'zoomIn', 'zoomOut', 'zoomFit', 'toggleSidebar', 'toggleInspector']);

/** Shortcuts that act again while the key is held down. */
export const REPEATABLE: ReadonlySet<EditorShortcutId> = new Set(['undo', 'redo', 'nudge', 'nudgeFar', 'prevSlide', 'nextSlide', 'zoomIn', 'zoomOut']);

/** Arrow-key shortcuts: controls that use arrows themselves keep them. */
export const ARROW_SHORTCUTS: ReadonlySet<EditorShortcutId> = new Set(['nudge', 'nudgeFar', 'prevSlide', 'nextSlide']);

/** Minimal element shape the context checks need (DOM elements satisfy it). */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
  closest?(selector: string): unknown;
  type?: string;
}

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);

/** True for fields people type text into: text inputs, text areas and editable content (Escape leaves them). */
export function isTextEntryTarget(target: TargetLike | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((target.type ?? target.getAttribute?.('type') ?? '').toLowerCase());
  if (target.isContentEditable) return true;
  const role = target.getAttribute?.('role');
  return role === 'textbox' || role === 'searchbox';
}

/** True for text fields, text areas, selects and editable content, where keys belong to the field. */
export function isEditableTarget(target: TargetLike | null | undefined): boolean {
  if (isTextEntryTarget(target)) return true;
  if (!target || typeof target !== 'object') return false;
  return (target.tagName ?? '').toUpperCase() === 'SELECT' || target.getAttribute?.('role') === 'combobox';
}

/**
 * Roles whose widgets move or change with the arrow keys (sliders, number
 * fields, radio and tab rows, menus, grids). List options are not among
 * them: after picking a layer in the layers list, the arrows nudge it.
 */
const ARROW_ROLES = new Set(['slider', 'spinbutton', 'radio', 'tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'gridcell', 'treeitem', 'scrollbar']);

/** True when the focused control uses the arrow keys itself. */
export function ownsArrowKeys(target: TargetLike | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  if (isEditableTarget(target)) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'INPUT') return true;
  const role = target.getAttribute?.('role') ?? '';
  return ARROW_ROLES.has(role);
}

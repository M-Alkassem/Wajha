/**
 * Keyboard focus around the stage, as small pure rules: whether focus that
 * lands now came from the keyboard (the viewport's focus ring), whether
 * Space may pan, and which focused field a press on the stage must commit
 * first. Elements are duck-typed so the rules run in Node tests.
 */

interface InputLike {
  type: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * What an input event says about the next focus: true when it comes from
 * the keyboard (a plain key press), false after a pointer press, null when
 * the event says nothing (shortcuts with Cmd, Ctrl or Alt keep the last
 * answer, like :focus-visible). Browsers count focus that a closing menu
 * hands back as keyboard focus; following the last input instead keeps a
 * mouse user's stage free of a focus frame.
 */
export function inputModality(e: InputLike): boolean | null {
  if (e.type === 'pointerdown' || e.type === 'mousedown') return false;
  if (e.type === 'keydown') return e.metaKey || e.ctrlKey || e.altKey ? null : true;
  return null;
}

interface FocusLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

/** Elements that take typed text, where Space types a space and a value may wait for its blur to commit. */
export function isTextEntry(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const e = el as FocusLike;
  return e.isContentEditable === true || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT';
}

/** Roles whose widgets Space presses: buttons, switches, checkboxes, tabs, select triggers, menu items. */
const PRESS_ROLES = new Set(['button', 'checkbox', 'switch', 'radio', 'tab', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio']);

/** Controls that Space presses. List rows are not among them: Space only re-selects a row. */
export function isPressable(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const e = el as FocusLike;
  if (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY') return true;
  const role = e.getAttribute?.('role');
  return !!role && PRESS_ROLES.has(role);
}

/** Keys that move focus to another control: Tab, and the arrows, Home and End of lists and groups. */
const FOCUS_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * True for a key press that may move focus to another control. Shortcuts
 * (with Cmd or Ctrl) are not, nor are keys after which focus only comes
 * back (Escape closing a dialog).
 */
export function movesFocus(e: { key: string; metaKey?: boolean; ctrlKey?: boolean }): boolean {
  return !e.metaKey && !e.ctrlKey && FOCUS_KEYS.has(e.key);
}

export interface SpaceContext {
  /** The focused element (document.activeElement). */
  focus: unknown;
  /** The pointer is over the stage, with nothing on top of the stage there. */
  overStage: boolean;
  /** A dialog or confirmation, a menu or a select list is open. */
  layerOpen: boolean;
  /** Focus came by Tab or an arrow key (see movesFocus), and the pointer has not moved since. */
  keyboardFocus: boolean;
}

/**
 * Whether a Space press arms a pan. It does while the pointer is over the
 * stage, wherever focus is (the page, the stage, a slide or layer row, a
 * button the mouse clicked), except: a text field types the space, an open
 * dialog or menu keeps its keys, and a button, switch or tab that the
 * keyboard moved to keeps its Space until the pointer moves (a keyboard
 * user's mouse may rest on the stage).
 */
export function spaceCanPan({ focus, overStage, layerOpen, keyboardFocus }: SpaceContext): boolean {
  if (!overStage || layerOpen || isTextEntry(focus)) return false;
  return !(keyboardFocus && isPressable(focus));
}

/**
 * The focused field to blur before a press on the stage changes the
 * selection, so its blur handler commits a typed value to the element it
 * belongs to (inspector fields commit on blur): a text entry outside the
 * stage, else null.
 */
export function fieldToCommit(focus: Element | null, stage: Node | null): Element | null {
  if (!focus || !isTextEntry(focus) || stage?.contains(focus)) return null;
  return focus;
}

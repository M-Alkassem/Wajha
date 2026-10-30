/**
 * The editor's global keyboard shortcuts (see shortcuts.ts for the table).
 *
 * One keydown listener on window, in the bubbling phase, so every control
 * gets the key first: anything a control or overlay handled
 * (defaultPrevented) is left alone, text fields keep their own keys
 * (undo, copy and paste inside a field stay native) except Escape, which
 * leaves the field, and nothing fires while a dialog, menu or popover is
 * open or a list item is being dragged.
 */
import { useEffect } from 'react';
import { platformIsMac } from '../kit';
import { useApp, useEditor } from '../../store';
import { isListDragging, useEditorChrome } from './chrome';
import { useEditorUi } from './editorUi';
import {
  ARROW_SHORTCUTS,
  REPEATABLE,
  WORKS_WHILE_TYPING,
  isEditableTarget,
  isTextEntryTarget,
  matchEditorShortcut,
  ownsArrowKeys,
  type ShortcutHit,
  type TargetLike,
} from './shortcuts';

/** Radix layers that own the keyboard while open: dialogs, popovers, menus and select lists. */
const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

/** Open radix menus and select lists (their content only exists while open; the sidebar's listboxes have no state). */
const OPEN_MENU = '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

function documentHas(selector: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.querySelector(selector) !== null;
  } catch {
    return false;
  }
}

/** True while a dialog, popover, menu or select list is open anywhere in the document. */
export function overlayOpen(): boolean {
  return documentHas(OPEN_OVERLAY);
}

/** True when the user selected text on the page (native copy should win). */
function hasTextSelection(): boolean {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false;
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
}

const NUDGE: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/**
 * Performs a shortcut. Returns true when it did something, so the caller
 * prevents the browser default only then (an unused Cmd+C still copies).
 */
export function runEditorShortcut(hit: ShortcutHit): boolean {
  const ed = useEditor.getState();
  const ui = useEditorUi.getState();
  const p = ed.project;
  switch (hit.id) {
    case 'export':
      if (!p) return false;
      ui.openDialog('export');
      return true;
    case 'shortcuts':
      ui.openDialog('shortcuts');
      return true;
    case 'toggleSidebar':
      useEditorChrome.getState().toggleLeft();
      return true;
    case 'toggleInspector':
      useEditorChrome.getState().toggleRight();
      return true;
    case 'zoomIn':
      ed.zoomIn();
      return true;
    case 'zoomOut':
      ed.zoomOut();
      return true;
    case 'zoomFit':
      ed.setFit(true);
      return true;
    case 'family': {
      const id = p?.families[hit.index];
      if (!id) return false;
      ed.setActiveFamily(id);
      return true;
    }
    case 'undo':
      // Held keys and empty history still swallow the key: the browser has nothing better to do with it.
      ed.undo();
      return true;
    case 'redo':
      ed.redo();
      return true;
    case 'copy':
      if (!ed.selection || hasTextSelection()) return false;
      return ed.copySelection();
    case 'cut':
      if (!ed.selection || hasTextSelection()) return false;
      return ed.cutSelection();
    case 'paste':
      if (!ed.clipboard) return false;
      ed.paste();
      return true;
    case 'duplicate':
      if (!p || !ed.activeSlideId) return false;
      if (ed.selection) ed.duplicateElement(ed.activeSlideId, ed.activeFamily, ed.selection);
      else ed.duplicateSlide(ed.activeSlideId);
      // Cmd+D would bookmark the page in a browser.
      return true;
    case 'delete':
      if (!ed.selection || !ed.activeSlideId) return false;
      return ed.deleteElement(ed.activeSlideId, ed.activeFamily, ed.selection);
    case 'nudge':
    case 'nudgeFar': {
      if (!ed.selection) return false;
      const [dx, dy] = NUDGE[hit.index] ?? [0, 0];
      const step = hit.id === 'nudgeFar' ? 10 : 1;
      ed.nudge(dx * step, dy * step);
      // Locked layers do not move, but the page must not scroll under them either.
      return true;
    }
    case 'deselect':
      if (!ed.selection) return false;
      ed.select(null);
      return true;
    case 'prevSlide':
    case 'nextSlide': {
      if (!p) return false;
      const i = p.slides.findIndex((s) => s.id === ed.activeSlideId);
      const next = p.slides[i + (hit.id === 'nextSlide' ? 1 : -1)];
      if (next) ed.setActiveSlide(next.id);
      return true;
    }
    default:
      return false;
  }
}

/** True while a dialog, confirmation, menu or popover owns the keyboard. */
function keyboardTaken(): boolean {
  return useEditorUi.getState().dialog !== null || useApp.getState().confirmRequest !== null || overlayOpen();
}

/**
 * True while a modal layer owns the keyboard, Space included: a dialog, a
 * confirmation, a menu or a select list. Popovers are not modal; a press
 * outside one closes it.
 */
export function modalLayerOpen(): boolean {
  return useEditorUi.getState().dialog !== null || useApp.getState().confirmRequest !== null || documentHas(OPEN_MENU);
}

/**
 * Escape in one of the editor's text fields (the inspector's text, a hex
 * colour, a number) leaves it, as in design tools: what was typed stays, so
 * does the selection, and the next Escape deselects. Fields that give
 * Escape a meaning of their own (reverting a rename) handle it first.
 * Returns true when it left a field.
 */
export function leaveFieldOnEscape(e: KeyboardEvent): boolean {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const target = (e.target ?? null) as (TargetLike & { blur?: () => void }) | null;
  if (!isTextEntryTarget(target) || typeof target?.blur !== 'function' || keyboardTaken()) return false;
  target.blur();
  return true;
}

/** Decides whether a keydown is an editor shortcut in this context; returns the hit to run or null. */
export function shortcutForEvent(e: KeyboardEvent, isMac: boolean): ShortcutHit | null {
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return null;
  const hit = matchEditorShortcut(e, isMac);
  if (!hit) return null;
  if (isListDragging()) return null;
  if (keyboardTaken()) return null;
  const target = (e.target ?? null) as TargetLike | null;
  if (isEditableTarget(target) && !WORKS_WHILE_TYPING.has(hit.id)) return null;
  if (ARROW_SHORTCUTS.has(hit.id) && ownsArrowKeys(target)) return null;
  return hit;
}

/** Installs the editor's keyboard shortcuts while the calling component is mounted. */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const isMac = platformIsMac();
    const onKeyDown = (e: KeyboardEvent) => {
      if (leaveFieldOnEscape(e)) {
        e.preventDefault();
        return;
      }
      const hit = shortcutForEvent(e, isMac);
      if (!hit) return;
      if (e.repeat && !REPEATABLE.has(hit.id)) {
        // A held Cmd+E must not open the dialog again behind itself, nor reach the browser.
        e.preventDefault();
        return;
      }
      if (runEditorShortcut(hit)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

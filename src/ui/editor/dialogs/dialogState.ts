/**
 * Hooks and actions shared by the editor dialogs.
 */
import { useEffect, useRef, useState } from 'react';
import type { FamilyId, LangCode } from '../../../model/types';
import { useEditor, type EditorState } from '../../../store';
import { useEditorUi, type EditorDialog } from '../editorUi';

/**
 * A number that grows every time `open` turns true. Key the dialog content
 * with it so each opening starts from fresh state, while the content stays
 * mounted (and keeps its exit animation) when the dialog closes.
 */
export function useOpenSession(open: boolean): number {
  const [state, setState] = useState(() => ({ open, session: open ? 1 : 0 }));
  if (state.open !== open) {
    const next = { open, session: open ? state.session + 1 : state.session };
    setState(next);
    return next.session;
  }
  return state.session;
}

/**
 * Selects from the editor store while the dialog is open and holds the last
 * value once it closes: the closing animation shows unchanged content, and
 * edits behind a closed dialog never re-render it.
 */
export function useEditorWhileOpen<T>(selector: (s: EditorState) => T, open: boolean): T {
  const last = useRef<{ value: T } | null>(null);
  const value = useEditor((s) => (open || last.current === null ? selector(s) : last.current.value));
  useEffect(() => {
    // Closed from the start (mounted with the editor): hold the first value too.
    if (open || last.current === null) last.current = { value };
  });
  return value;
}

/**
 * Opens dialog `to` from dialog `from` (which closes), so that closing `to`
 * through closeOrReturn brings `from` back. Focus still ends up on whatever
 * opened `from`: each closing dialog hands focus to its opener, which the
 * dialog opening over it adopts (see the kit's createFocusReturn).
 */
export function openDialogFrom(from: EditorDialog, to: EditorDialog): void {
  useEditorUi.getState().openDialog(to, from);
}

/** Closes dialog `dialog`: back to the dialog that opened it, if any (see openDialogFrom), else `close()`. */
export function closeOrReturn(dialog: EditorDialog, close: () => void): void {
  const ui = useEditorUi.getState();
  if (ui.dialog === dialog && ui.returnTo) ui.openDialog(ui.returnTo);
  else close();
}

/** A value that follows `value` after it has stopped changing for `ms`. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, settled, ms]);
  return settled;
}

export interface JumpTarget {
  family?: FamilyId;
  lang?: LangCode;
  slideIndex?: number;
  /** Selects this element on the slide when it exists in the target family. */
  elementId?: string;
}

/** Shows a place in the editor: switches family and language, then activates the slide (and selects an element). */
export function jumpTo(target: JumpTarget): void {
  const project = useEditor.getState().project;
  if (!project) return;
  if (target.family && project.families.includes(target.family)) useEditor.getState().setActiveFamily(target.family);
  if (target.lang && project.languages.includes(target.lang)) useEditor.getState().setActiveLang(target.lang);
  const slide = target.slideIndex === undefined ? undefined : project.slides[target.slideIndex];
  if (!slide) return;
  const selected = target.elementId ? useEditor.getState().select(target.elementId, slide.id) : false;
  if (!selected) useEditor.getState().setActiveSlide(slide.id);
}

/** True while the user prefers reduced motion (read once per call; cheap). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

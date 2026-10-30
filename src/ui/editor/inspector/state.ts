/**
 * Store access for the inspector: the edited element (resolved for the
 * active family), structural-equality subscriptions so panels only render
 * when what they show changes, and writes that always start from the
 * store's current value (never from a stale render).
 */
import { useCallback, useRef } from 'react';
import { jsonEqual } from '../../../model/clone';
import { resolveLayout } from '../../../model/resolve';
import type { FamilyId, Project, Slide, SlideElement } from '../../../model/types';
import { ensureFonts } from '../../../runtime';
import { useEditor, type EditorState, type ElementPatch } from '../../../store';

/** The element an element panel edits. Captured once per panel mount. */
export interface Target {
  slideId: string;
  family: FamilyId;
  elementId: string;
}

export function slideById(project: Project | null, slideId: string): Slide | null {
  return project?.slides.find((s) => s.id === slideId) ?? null;
}

/** The element as the store has it right now, resolved for the target family. */
export function readElement(t: Target, state: EditorState = useEditor.getState()): SlideElement | null {
  const slide = slideById(state.project, t.slideId);
  if (!slide || !state.project) return null;
  return resolveLayout(state.project, slide, t.family).elements.find((e) => e.id === t.elementId) ?? null;
}

/** Applies a patch to the target element; one undo step unless a gesture is open. */
export function patchTarget(t: Target, patch: ElementPatch): boolean {
  return useEditor.getState().updateElement(t.slideId, t.family, t.elementId, patch);
}

/**
 * Applies a patch computed from the element's current value, for nested
 * values such as shadows where a stale copy would undo a concurrent change.
 */
export function patchTargetWith<E extends SlideElement>(t: Target, kind: E['kind'], make: (el: E) => ElementPatch | null): boolean {
  const el = readElement(t);
  if (!el || el.kind !== kind) return false;
  const patch = make(el as E);
  return patch ? patchTarget(t, patch) : false;
}

/**
 * Like `useEditor(selector)` but keeps the previous result while it is
 * structurally equal, so derived objects (adapted layouts are rebuilt when
 * their slide changes) do not re-render everything that reads them.
 * `selector` must be stable (module level or memoised).
 */
export function useEditorDeep<T>(selector: (s: EditorState) => T): T {
  const cache = useRef<{ value: T } | null>(null);
  const select = useCallback(
    (s: EditorState) => {
      const next = selector(s);
      const prev = cache.current;
      if (prev && (prev.value === next || jsonEqual(prev.value, next))) return prev.value;
      cache.current = { value: next };
      return next;
    },
    [selector],
  );
  return useEditor(select);
}

/** The target element, re-rendering only when it really changes. */
export function useTargetElement(t: Target): SlideElement | null {
  const { slideId, family, elementId } = t;
  const selector = useCallback((s: EditorState) => readElement({ slideId, family, elementId }, s), [slideId, family, elementId]);
  return useEditorDeep(selector);
}

/**
 * Loads the faces the project now uses (after a font or weight change), so
 * canvases repaint in the new face instead of a fallback (they listen for
 * font loads). Cheap: faces already loaded are skipped.
 */
export function refreshFonts(): void {
  const project = useEditor.getState().project;
  if (project) void ensureFonts(project);
}

/** The theme palette (stable array identity until it changes). */
export function usePalette(): readonly string[] {
  return useEditor((s) => s.project?.theme.palette ?? EMPTY);
}

const EMPTY: readonly string[] = Object.freeze([]);

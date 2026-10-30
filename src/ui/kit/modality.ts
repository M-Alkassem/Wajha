/**
 * Input modality: whether the last input came from a pointer or the
 * keyboard, kept on <html data-modality="pointer|keyboard">.
 *
 * WebKit counts focus that script moves right after a click as
 * :focus-visible: a tab radix activates on mousedown, a menu trigger
 * refocused as its menu closes, a slider thumb focused on drag. Left alone,
 * the focus ring and the trigger's tooltip stay behind after plain mouse
 * use. While the pointer was last, index.css draws no focus ring (text
 * fields excepted) and Tooltip does not open for focus; the next key press
 * brings both back.
 *
 * The tracker also remembers the control the pointer pressed last
 * (pressedControl): WebKit does not focus a clicked button, so a dialog it
 * opens would otherwise not know where to give focus back.
 *
 * A key the app turns to pointer use (Space held to pan the stage) is not
 * navigation: markNotNavigation takes that press back.
 */

export type InputModality = 'pointer' | 'keyboard';

/** Pressed alone, these never move focus. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

export interface ModalityKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** True for key presses that make focus matter: Tab, arrows, Enter, typing. Shortcuts (⌘Z) and lone modifiers are not. */
export function isKeyboardNavigation(e: ModalityKeyEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !MODIFIER_KEYS.has(e.key);
}

/** What a press can give focus back to later (see pressedControl). */
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]';

let stopTracking: (() => void) | null = null;
/** The focusable control around the last press. Weak: a control that leaves the page is not kept alive. */
let pressed: WeakRef<HTMLElement> | null = null;
/** Puts back the modality from before the key press being handled, until the next input (see markNotNavigation). */
let undoKey: (() => void) | null = null;

/**
 * Starts tracking the input modality; returns a function that stops it.
 * Call once at startup (a second call returns the running tracker).
 */
export function trackInputModality(): () => void {
  if (stopTracking) return stopTracking;
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const root = document.documentElement;
  const set = (modality: InputModality) => {
    if (root.dataset.modality !== modality) root.dataset.modality = modality;
  };
  const onPointerDown = (e: PointerEvent) => {
    undoKey = null;
    set('pointer');
    const control = typeof Element !== 'undefined' && e.target instanceof Element ? e.target.closest<HTMLElement>(FOCUSABLE) : null;
    pressed = control ? new WeakRef(control) : null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    undoKey = null;
    // A held key repeats its keydown: the first press already counted, or was taken back.
    if (e.repeat || !isKeyboardNavigation(e)) return;
    const before = root.dataset.modality;
    undoKey = () => {
      if (before === undefined) delete root.dataset.modality;
      else root.dataset.modality = before;
    };
    set('keyboard');
  };
  // Capture on window: runs before any handler that moves focus in response.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  stopTracking = () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    pressed = null;
    undoKey = null;
    stopTracking = null;
  };
  return stopTracking;
}

/**
 * Takes back the key press being handled, which the app turned to pointer
 * use (Space held to pan the stage arms a pointer gesture): the modality
 * returns to what it was before the press, so a control the mouse focused
 * shows no focus ring for it, and a keyboard user keeps theirs. Call it from
 * a keydown handler; the tracker, listening since startup, counted the
 * press first. Its repeats while held are not counted at all.
 */
export function markNotNavigation(): void {
  const undo = undoKey;
  undoKey = null;
  undo?.();
}

/** True when the last input came from a pointer (mouse, pen or touch). */
export function pointerModality(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset.modality === 'pointer';
}

/**
 * The focusable control the pointer pressed last, while it is on the page.
 * WebKit does not focus a button it clicks (it clears focus instead), so a
 * dialog opened by a click finds its opener here rather than in
 * document.activeElement.
 */
export function pressedControl(): HTMLElement | null {
  const el = pressed?.deref() ?? null;
  return el?.isConnected ? el : null;
}

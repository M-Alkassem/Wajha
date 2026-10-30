/**
 * Continuous edits (scrubbing a number, dragging a slider, picking a colour)
 * as one undo step each, with at most one store update per animation frame.
 *
 * The first change of an interaction opens a history gesture; changes are
 * coalesced and applied on the next frame; the commit applies whatever is
 * still pending and closes the gesture, and a cancel (Escape) puts back
 * what the gesture changed without leaving an undo step. Unmounting
 * mid-interaction (the selection changed) also commits, so a gesture can
 * never stay open.
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useEditor } from '../../../store';

export interface LiveDeps {
  begin(): void;
  end(): void;
  /** Ends the gesture and restores what it changed, without a history step. */
  revert(): void;
  schedule(fn: () => void): number;
  cancel(handle: number): void;
}

export interface LiveEdit<T> {
  /** A live value: opens the gesture if needed and applies on the next frame. */
  change(value: T): void;
  /** Replaces the function values are applied with (the latest render's closure). */
  setApply(apply: (value: T) => void): void;
  /** Applies a pending value now. */
  flush(): void;
  /** Applies a pending value and closes the gesture. Safe to call when nothing is open. */
  commit(): void;
  /** Drops a pending value and reverts the interaction (Escape). Safe to call when nothing is open. */
  cancel(): void;
  readonly open: boolean;
}

/** The framework-free core, so it can be tested with a fake scheduler. */
export function createLiveEdit<T>(initialApply: (value: T) => void, deps: LiveDeps): LiveEdit<T> {
  let apply = initialApply;
  let open = false;
  let frame: number | null = null;
  let pending: { value: T } | null = null;

  const unschedule = () => {
    if (frame !== null) {
      deps.cancel(frame);
      frame = null;
    }
  };

  const flush = () => {
    unschedule();
    const p = pending;
    pending = null;
    if (p) apply(p.value);
  };

  return {
    change(value) {
      if (!open) {
        open = true;
        deps.begin();
      }
      pending = { value };
      if (frame === null) {
        frame = deps.schedule(() => {
          frame = null;
          flush();
        });
      }
    },
    setApply(next) {
      apply = next;
    },
    flush,
    commit() {
      try {
        flush();
      } finally {
        if (open) {
          open = false;
          deps.end();
        }
      }
    },
    cancel() {
      unschedule();
      pending = null;
      // Only a gesture this edit opened is ours to revert.
      if (open) {
        open = false;
        deps.revert();
      }
    },
    get open() {
      return open;
    },
  };
}

const raf = (fn: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => fn()) : (setTimeout(fn, 16) as unknown as number);
const caf = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
};

/** The editor store's history gestures, applied once per animation frame (tests pass their own frames). */
export function editorLiveDeps(schedule: LiveDeps['schedule'] = raf, cancel: LiveDeps['cancel'] = caf): LiveDeps {
  return {
    begin: () => useEditor.getState().beginGesture(),
    end: () => useEditor.getState().endGesture(),
    revert: () => useEditor.getState().cancelGesture(),
    schedule,
    cancel,
  };
}

const STORE_DEPS = editorLiveDeps();

/** Handlers to spread on kit value controls (NumberField, Slider, ColorField, FillEditor...). */
export interface LiveHandlers<T> {
  onChange: (value: T) => void;
  onCommit: () => void;
  onScrubEnd: () => void;
  onScrubCancel: () => void;
}

/** One live edit per mounted control, always applying through the latest `apply`. */
function useLiveEdit<T>(apply: (value: T) => void): LiveEdit<T> {
  const [live] = useState(() => createLiveEdit<T>(apply, STORE_DEPS));
  useLayoutEffect(() => {
    live.setApply(apply);
  });
  useEffect(() => () => live.commit(), [live]);
  return live;
}

/**
 * Live editing for one control. `apply` may change between renders (it
 * usually closes over the selected element); the latest one is used.
 */
export function useLive<T>(apply: (value: T) => void): LiveHandlers<T> {
  const live = useLiveEdit(apply);
  return useMemo(
    () => ({
      onChange: (v: T) => live.change(v),
      onCommit: () => live.commit(),
      onScrubEnd: () => live.commit(),
      onScrubCancel: () => live.cancel(),
    }),
    [live],
  );
}

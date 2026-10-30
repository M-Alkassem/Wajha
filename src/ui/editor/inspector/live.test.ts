import { afterEach, describe, expect, it } from 'vitest';
import { blankProject } from '../../../model/defaults';
import type { TextElement } from '../../../model/types';
import { selectActiveLayout, useEditor } from '../../../store';
import { createLiveEdit, editorLiveDeps, type LiveDeps } from './live';
import { patchTarget, readElement, type Target } from './state';

/** A scheduler driven by hand, recording gesture calls. */
function harness() {
  const log: string[] = [];
  let next = 1;
  const frames = new Map<number, () => void>();
  const deps: LiveDeps = {
    begin: () => log.push('begin'),
    end: () => log.push('end'),
    revert: () => log.push('revert'),
    schedule: (fn) => {
      const id = next++;
      frames.set(id, fn);
      return id;
    },
    cancel: (id) => {
      frames.delete(id);
    },
  };
  const frame = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const fn of due) fn();
  };
  return { log, deps, frame, pending: () => frames.size };
}

describe('createLiveEdit', () => {
  it('opens one gesture per interaction and applies the latest value once per frame', () => {
    const h = harness();
    const applied: number[] = [];
    const live = createLiveEdit<number>((v) => applied.push(v), h.deps);
    live.change(1);
    live.change(2);
    live.change(3);
    expect(h.log).toEqual(['begin']);
    expect(applied).toEqual([]);
    expect(h.pending()).toBe(1);
    h.frame();
    expect(applied).toEqual([3]);
    live.change(4);
    h.frame();
    expect(applied).toEqual([3, 4]);
    live.commit();
    expect(h.log).toEqual(['begin', 'end']);
    expect(live.open).toBe(false);
  });

  it('applies a pending value synchronously on commit (typed values and arrow steps)', () => {
    const h = harness();
    const applied: number[] = [];
    const live = createLiveEdit<number>((v) => applied.push(v), h.deps);
    live.change(7);
    live.commit();
    expect(applied).toEqual([7]);
    expect(h.log).toEqual(['begin', 'end']);
    expect(h.pending()).toBe(0);
  });

  it('ignores commits without a change and repeated commits', () => {
    const h = harness();
    const live = createLiveEdit<number>(() => undefined, h.deps);
    live.commit();
    live.commit();
    expect(h.log).toEqual([]);
    live.change(1);
    live.commit();
    live.commit();
    expect(h.log).toEqual(['begin', 'end']);
  });

  it('uses the apply function set last', () => {
    const h = harness();
    const a: number[] = [];
    const b: number[] = [];
    const live = createLiveEdit<number>((v) => a.push(v), h.deps);
    live.change(1);
    live.setApply((v) => b.push(v));
    live.commit();
    expect(a).toEqual([]);
    expect(b).toEqual([1]);
  });

  it('still closes the gesture when applying throws', () => {
    const h = harness();
    const live = createLiveEdit<number>(() => {
      throw new Error('boom');
    }, h.deps);
    live.change(1);
    expect(() => live.commit()).toThrow('boom');
    expect(h.log).toEqual(['begin', 'end']);
    expect(live.open).toBe(false);
  });
});

describe('createLiveEdit cancel', () => {
  it('drops the pending value and reverts the gesture it opened', () => {
    const h = harness();
    const applied: number[] = [];
    const live = createLiveEdit<number>((v) => applied.push(v), h.deps);
    live.change(1);
    h.frame();
    live.change(2);
    live.cancel();
    expect(applied).toEqual([1]);
    expect(h.pending()).toBe(0);
    expect(h.log).toEqual(['begin', 'revert']);
    expect(live.open).toBe(false);
    // Nothing left to commit afterwards.
    live.commit();
    expect(h.log).toEqual(['begin', 'revert']);
  });

  it('leaves gestures it did not open alone', () => {
    const h = harness();
    const live = createLiveEdit<number>(() => undefined, h.deps);
    live.cancel();
    expect(h.log).toEqual([]);
  });
});

describe('live edits on the editor store', () => {
  afterEach(() => useEditor.getState().closeProject());

  function setup() {
    useEditor.getState().openProject(blankProject('Live', ['iphone'], ['en-US']));
    const s = useEditor.getState();
    const text = selectActiveLayout(s)!.elements.find((e): e is TextElement => e.kind === 'text')!;
    const target: Target = { slideId: s.activeSlideId!, family: s.activeFamily, elementId: text.id };
    const h = harness();
    const live = createLiveEdit<number>((size) => patchTarget(target, { style: { size } }), editorLiveDeps(h.deps.schedule, h.deps.cancel));
    const size = () => (readElement(target) as TextElement).style.size;
    return { h, live, size, start: text.style.size };
  }

  it('makes a scrub one undo step', () => {
    const { h, live, size, start } = setup();
    live.change(0.1);
    h.frame();
    live.change(0.12);
    h.frame();
    live.commit();
    expect(size()).toBe(0.12);
    expect(useEditor.getState().inGesture).toBe(false);
    expect(useEditor.getState().undo()).toBe(true);
    expect(size()).toBe(start);
    expect(useEditor.getState().canUndo).toBe(false);
  });

  it('cancels a scrub without leaving an undo step (Escape)', () => {
    const { h, live, size, start } = setup();
    expect(useEditor.getState().canUndo).toBe(false);
    live.change(0.14);
    h.frame();
    expect(size()).toBe(0.14);
    live.change(0.16);
    live.cancel();
    expect(size()).toBe(start);
    expect(h.pending()).toBe(0);
    const s = useEditor.getState();
    expect(s.inGesture).toBe(false);
    expect(s.canUndo).toBe(false);
  });
});

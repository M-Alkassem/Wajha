/**
 * FillField on the editor store: the kit FillEditor's number fields are
 * replaced by a stub that records its props, then driven the way a scrub
 * drives them, with the store's real history underneath.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankProject } from '../../../model/defaults';
import type { Fill } from '../../../model/types';
import { useEditor } from '../../../store';
import type { NumberFieldProps } from '../../kit/NumberField';
import { FillField } from './FillField';

const fields = vi.hoisted((): NumberFieldProps[] => []);
vi.mock('../../kit/NumberField', () => ({
  NumberField: (props: NumberFieldProps) => {
    fields.push(props);
    return null;
  },
}));

const RADIAL: Fill = { type: 'radial', cx: 0.5, cy: 0.4, radius: 0.7, stops: [{ offset: 0, color: '#7c6cff' }, { offset: 1, color: '#0e0b1c' }] };

const background = () => useEditor.getState().project!.theme.background;
const centreX = () => {
  const fill = background().fill;
  return fill.type === 'radial' ? fill.cx : null;
};

/** The theme background's FillField, wired as the slide inspector wires it; returns its "Centre X" field. */
function renderThemeFill(): NumberFieldProps {
  fields.length = 0;
  renderToStaticMarkup(
    h(FillField, {
      value: background().fill,
      apply: (fill: Fill) => useEditor.getState().setThemeBackground({ ...background(), fill }),
      read: () => background().fill,
      palette: [],
    }),
  );
  const x = fields.find((f) => f['aria-label'] === 'Centre X');
  if (!x) throw new Error('no Centre X field');
  return x;
}

/** One scrub of `field` through these values, frame by frame. */
function scrub(field: NumberFieldProps, values: number[]) {
  field.onScrubStart?.();
  for (const v of values) {
    field.onChange(v);
    vi.advanceTimersByTime(16);
  }
}

/** Escape mid-scrub as NumberField handles it: the app's cancel, or else the start value put back and committed. */
function pressEscape(field: NumberFieldProps, start: number) {
  if (field.onScrubCancel) {
    field.onScrubCancel();
    return;
  }
  field.onChange(start);
  field.onScrubEnd?.();
  field.onCommit?.(start);
}

beforeEach(() => {
  vi.useFakeTimers();
  const project = blankProject('Fill', ['iphone'], ['en-US']);
  project.theme.background = { fill: RADIAL, pattern: null };
  useEditor.getState().openProject(project);
});

afterEach(() => {
  useEditor.getState().closeProject();
  vi.useRealTimers();
});

describe('FillField', () => {
  it('cancels a scrub with Escape: the project is the one from before, with no undo step', () => {
    const before = useEditor.getState().project;
    const x = renderThemeFill();
    scrub(x, [55, 60, 70]);
    expect(centreX()).toBe(0.7);
    expect(useEditor.getState().inGesture).toBe(true);

    pressEscape(x, 50);
    vi.runAllTimers();
    const s = useEditor.getState();
    // Not an edit back to the old values (a new project, saved again): the gesture itself is undone.
    expect(s.project).toBe(before);
    expect(centreX()).toBe(0.5);
    expect(s.inGesture).toBe(false);
    expect(s.canUndo).toBe(false);
  });

  it('makes a finished scrub one undo step', () => {
    const x = renderThemeFill();
    scrub(x, [55, 62]);
    x.onCommit?.(62);
    expect(centreX()).toBe(0.62);
    expect(useEditor.getState().inGesture).toBe(false);
    expect(useEditor.getState().undo()).toBe(true);
    expect(centreX()).toBe(0.5);
    expect(useEditor.getState().canUndo).toBe(false);
  });
});

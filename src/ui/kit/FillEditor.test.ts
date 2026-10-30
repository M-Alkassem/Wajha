/**
 * FillEditor and its number fields: rendered on the server with NumberField
 * replaced by a stub that records its props, then driven through those
 * props the way a scrub drives them. (Render output is covered in
 * components.test.ts.)
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Fill } from '../../model/types';
import { FillEditor, type FillEditorProps } from './FillEditor';
import type { NumberFieldProps } from './NumberField';

const fields = vi.hoisted((): NumberFieldProps[] => []);
vi.mock('./NumberField', () => ({
  NumberField: (props: NumberFieldProps) => {
    fields.push(props);
    return null;
  },
}));

const RADIAL: Fill = { type: 'radial', cx: 0.5, cy: 0.4, radius: 0.7, stops: [{ offset: 0, color: '#7C6CFF' }, { offset: 1, color: '#0E0B1C' }] };
const MESH: Fill = {
  type: 'mesh',
  base: '#0E0B1C',
  points: [
    { x: 0.2, y: 0.3, color: '#7C6CFF', radius: 0.5 },
    { x: 0.8, y: 0.7, color: '#FF4D7E', radius: 0.4 },
  ],
};

/** Renders the editor; returns what it told the app and its number fields by accessible name. */
function render(value: Fill, props: Partial<FillEditorProps> = {}) {
  fields.length = 0;
  const calls = { changes: [] as Fill[], commits: [] as Fill[], cancels: 0 };
  renderToStaticMarkup(
    h(FillEditor, {
      value,
      onChange: (fill) => calls.changes.push(fill),
      onCommit: (fill) => calls.commits.push(fill),
      onScrubCancel: () => calls.cancels++,
      ...props,
    }),
  );
  const field = (name: string) => {
    const found = fields.find((f) => f['aria-label'] === name);
    if (!found) throw new Error(`no number field "${name}"`);
    return found;
  };
  return { calls, field };
}

describe('FillEditor scrubbing', () => {
  it('passes Escape on every scrubbable field to the app', () => {
    const radial = render(RADIAL);
    for (const name of ['Centre X', 'Centre Y', 'Radius']) {
      expect(radial.field(name).label, name).toBeTruthy();
      expect(radial.field(name).onScrubCancel, name).toBeTypeOf('function');
    }
    const mesh = render(MESH);
    for (const name of ['Point 1 X', 'Point 1 Y', 'Point 1 radius', 'Point 2 X', 'Point 2 Y', 'Point 2 radius']) {
      expect(mesh.field(name).onScrubCancel, name).toBeTypeOf('function');
    }
  });

  it('leaves a cancelled scrub uncommitted: the app reverts it', () => {
    const { calls, field } = render(RADIAL);
    const x = field('Centre X');
    x.onScrubStart?.();
    x.onChange(62);
    x.onChange(64);
    expect(calls.changes.map((f) => (f.type === 'radial' ? f.cx : null))).toEqual([0.62, 0.64]);
    x.onScrubCancel?.();
    expect(calls.cancels).toBe(1);
    expect(calls.commits).toEqual([]);
    // The next interaction starts from the fill before the scrub, not from the cancelled values.
    field('Centre Y').onChange(50);
    expect(calls.changes.at(-1)).toEqual({ ...RADIAL, cy: 0.5 });
  });

  it('still commits a scrub that ends normally', () => {
    const { calls, field } = render(MESH);
    const r = field('Point 2 radius');
    r.onScrubStart?.();
    r.onChange(55);
    r.onCommit?.(55);
    expect(calls.cancels).toBe(0);
    expect(calls.commits).toHaveLength(1);
    expect(calls.commits[0].type === 'mesh' && calls.commits[0].points[1].radius).toBe(0.55);
  });

  it("keeps NumberField's own revert when the app has no cancel of its own", () => {
    expect(render(RADIAL, { onScrubCancel: undefined }).field('Centre X').onScrubCancel).toBeUndefined();
    expect(render(MESH, { onScrubCancel: undefined }).field('Point 1 X').onScrubCancel).toBeUndefined();
  });
});

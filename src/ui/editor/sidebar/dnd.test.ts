/**
 * Keyboard rules of the sortable slide and layer lists: Space never picks a
 * row up (it is how the stage pans), Mod+ArrowUp / Mod+ArrowDown move the
 * focused row, and screen readers are told so.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ShortcutEventLike } from '../../kit';
import { MOVE_DOWN_KEYS, MOVE_UP_KEYS, moveDelta, sortInstructions, useListSensors } from './dnd';

type Mods = Partial<Pick<ShortcutEventLike, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>>;

const press = (key: string, mods: Mods = {}): ShortcutEventLike => ({
  key,
  code: key === ' ' ? 'Space' : key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('list sensors', () => {
  it('have no keyboard activator, so no key (Space included) starts a drag', () => {
    function Probe() {
      const events = useListSensors().flatMap((s) => s.sensor.activators.map((a) => a.eventName));
      return h('output', null, events.join(','));
    }
    expect(renderToStaticMarkup(h(Probe))).toBe('<output>onPointerDown</output>');
  });
});

describe('moveDelta', () => {
  it('moves with Command+arrows on macOS and Control+arrows elsewhere', () => {
    expect(MOVE_UP_KEYS).toBe('mod+arrowup');
    expect(MOVE_DOWN_KEYS).toBe('mod+arrowdown');
    expect(moveDelta(press('ArrowUp', { metaKey: true }), true)).toBe(-1);
    expect(moveDelta(press('ArrowDown', { metaKey: true }), true)).toBe(1);
    expect(moveDelta(press('ArrowUp', { ctrlKey: true }), false)).toBe(-1);
    expect(moveDelta(press('ArrowDown', { ctrlKey: true }), false)).toBe(1);
  });

  it('ignores Space, plain arrows and other modifier combinations', () => {
    const others = [
      press(' '),
      press(' ', { metaKey: true }),
      press(' ', { ctrlKey: true }),
      press('ArrowUp'),
      press('ArrowDown'),
      // Option+arrows go to the previous and next slide everywhere in the editor.
      press('ArrowUp', { altKey: true }),
      press('ArrowDown', { shiftKey: true, metaKey: true }),
      press('ArrowDown', { altKey: true, metaKey: true }),
      press('ArrowLeft', { metaKey: true }),
      press('Enter', { metaKey: true }),
      // Control is not the macOS modifier (Control+arrows belong to Mission Control there).
      press('ArrowUp', { ctrlKey: true }),
    ];
    for (const e of others) expect(moveDelta(e, true), JSON.stringify(e)).toBe(0);
    expect(moveDelta(press('ArrowUp', { metaKey: true }), false)).toBe(0);
  });
});

describe('sortInstructions', () => {
  it('names the move keys for the platform and no longer mentions Space', () => {
    expect(sortInstructions('slide', true)).toBe('To move this slide, press Command Up arrow or Command Down arrow.');
    expect(sortInstructions('layer', false)).toBe('To move this layer, press Control Up arrow or Control Down arrow.');
    expect(sortInstructions('slide', true)).not.toMatch(/space/i);
  });
});

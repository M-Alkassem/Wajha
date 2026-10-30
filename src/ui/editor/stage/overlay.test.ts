/**
 * Server-rendered checks of the stage overlay (no DOM): which handles,
 * hints, badges and labels appear for a given state.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultTheme, newDeviceElement, newImageElement, newShapeElement, newTextElement } from '../../../model/defaults';
import type { SlideElement } from '../../../model/types';
import { screenBox } from './hints';
import { OverlayView, type OverlayViewProps } from './SelectionOverlay';
import { tidyEntries } from './SlideMenus';
import type { GestureVisual, StageBox } from './stageStore';

const theme = defaultTheme();

function box(element: SlideElement, cx: number, cy: number, w: number, h: number, rotation = 0): StageBox {
  return { id: element.id, cx, cy, w, h, rotation, element };
}

const device = box({ ...newDeviceElement('iphone', theme), id: 'dev' }, 170, 420, 260, 540);
const text = box({ ...newTextElement('headline', 'iphone', theme), id: 'head' }, 170, 120, 280, 60);
const shape = box({ ...newShapeElement('circle', theme), id: 'blob' }, 60, 60, 20, 20);
const imageOver = (cx: number, cy: number, w: number, h: number) => box({ ...newImageElement('a'.repeat(64) + '.png', 1), id: 'img' }, cx, cy, w, h);

const base: OverlayViewProps = {
  width: 340,
  height: 740,
  dpr: 2,
  family: 'iphone',
  radius: '9px',
  active: true,
  dragging: false,
  boxes: [device, text, shape],
  missingShots: [],
  pendingImages: [],
  emptyText: [],
  overflowText: [],
  rtl: false,
  selection: null,
  hover: null,
  gesture: null,
  drop: null,
};

const render = (patch: Partial<OverlayViewProps>) => renderToStaticMarkup(h(OverlayView, { ...base, ...patch }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The label's absolute box from its inline style (left/top/width/height in CSS px). */
function labelBox(html: string): { left: number; top: number; width: number; height: number } | null {
  const m = /<div class="absolute flex items-center justify-center" style="left:([\d.-]+)px;top:([\d.-]+)px;width:([\d.]+)px;height:([\d.]+)px[^"]*" data-qa="empty-slot-label"/.exec(html);
  return m ? { left: Number(m[1]), top: Number(m[2]), width: Number(m[3]), height: Number(m[4]) } : null;
}

describe('OverlayView', () => {
  it('draws nothing interactive without a selection', () => {
    const html = render({});
    expect(html).toContain('aria-hidden="true"');
    expect(count(html, 'data-handle=')).toBe(0);
    expect(count(html, '<polygon')).toBe(0);
  });

  it('gives a device eight handles and a rotation knob', () => {
    const html = render({ selection: 'dev' });
    expect(count(html, 'data-handle="')).toBe(9);
    expect(html).toContain('data-handle="rotate"');
    expect(html).toContain('cursor:nwse-resize');
  });

  it('gives text side and corner handles only', () => {
    const html = render({ selection: 'head' });
    expect(html).not.toContain('data-handle="n"');
    expect(html).not.toContain('data-handle="s"');
    expect(html).toContain('data-handle="e"');
    expect(count(html, 'data-handle="')).toBe(7);
  });

  it('drops side handles on tiny boxes', () => {
    const html = render({ selection: 'blob' });
    expect(html).not.toContain('data-handle="n"');
    expect(html).not.toContain('data-handle="e"');
    expect(html).toContain('data-handle="se"');
  });

  it('shows a lock badge and no handles for locked elements', () => {
    const locked = box({ ...device.element, locked: true }, device.cx, device.cy, device.w, device.h);
    const html = render({ boxes: [locked], selection: 'dev' });
    expect(html).toContain('data-qa="locked-badge"');
    expect(count(html, 'data-handle=')).toBe(0);
  });

  it('hides handles while moving and shows guides and the readout', () => {
    const html = render({
      selection: 'dev',
      gesture: { kind: 'move', slideId: 's', elementId: 'dev', guides: [{ axis: 'x', pos: 170, from: 0, to: 740, kind: 'slide' }], label: null, cursor: 'default' },
    });
    expect(count(html, 'data-handle=')).toBe(0);
    expect(html).toContain('var(--brand-pink)');
    const resizing = render({ selection: 'dev', gesture: { kind: 'resize', slideId: 's', elementId: 'dev', guides: [], label: '660 × 1320', cursor: 'nwse-resize' } });
    expect(resizing).toContain('660 × 1320');
    expect(count(resizing, 'data-handle=')).toBe(9);
  });

  it('outlines the hovered element unless it is the selection', () => {
    expect(count(render({ hover: 'head' }), '<polygon')).toBe(1);
    // Selection draws a halo and a line; the hover on the same element adds nothing.
    expect(count(render({ hover: 'dev', selection: 'dev' }), '<polygon')).toBe(2);
  });

  it('keeps a slide clean at rest: empty screens hint only when hovered or selected on the active slide', () => {
    expect(render({ missingShots: ['dev'] })).not.toContain('data-qa="empty-slot');
    for (const focus of [{ hover: 'dev' }, { selection: 'dev' }]) {
      const html = render({ missingShots: ['dev'], ...focus });
      expect(html).toContain('data-qa="empty-slot"');
      expect(html).toContain('Drop a screenshot');
      // A solid label, so it reads on light mock screens too.
      expect(html).toContain('bg-tooltip ');
      expect(html).not.toMatch(/bg-tooltip\/\d/);
    }
    expect(render({ missingShots: ['dev'], hover: 'dev', active: false })).not.toContain('data-qa="empty-slot');
    expect(render({ missingShots: ['dev'], hover: 'dev', width: 100 })).not.toContain('Drop a screenshot');
    // Not while the element is being dragged.
    const moving: GestureVisual = { kind: 'move', slideId: 's', elementId: 'dev', guides: [], label: null, cursor: 'default' };
    expect(render({ missingShots: ['dev'], selection: 'dev', gesture: moving })).not.toContain('data-qa="empty-slot');
  });

  it('outlines every empty screen while files are dragged, without labels', () => {
    const html = render({ missingShots: ['dev'], dragging: true, active: false });
    expect(html).toContain('data-qa="empty-slot"');
    expect(html).not.toContain('Drop a screenshot');
  });

  it('never draws a hint over a layer above the device', () => {
    const screen = screenBox(device, 'iphone');
    // An image over the middle of the screen: the outline is masked by it and the label moves clear of it.
    const cover = imageOver(screen.cx, screen.cy, 200, 120);
    const html = render({ boxes: [device, cover], missingShots: ['dev'], hover: 'dev' });
    expect(html).toMatch(/<mask id="[^"]+"/);
    expect(html).toMatch(/<g mask="url\(#[^"]+\)" data-qa="empty-slot"/);
    const label = labelBox(html);
    expect(label).not.toBeNull();
    const coverTop = cover.cy - cover.h / 2;
    const coverBottom = cover.cy + cover.h / 2;
    expect(label!.top + label!.height <= coverTop || label!.top >= coverBottom).toBe(true);
    // A layer over the whole screen leaves no room for a label.
    const full = render({ boxes: [device, imageOver(screen.cx, screen.cy, screen.w, screen.h)], missingShots: ['dev'], hover: 'dev' });
    expect(full).not.toContain('Drop a screenshot');
    // Layers below the device do not matter.
    expect(render({ boxes: [cover, device], missingShots: ['dev'], hover: 'dev' })).not.toContain('<mask');
  });

  it('masks the back phone of a two-phone slide with the front one', () => {
    const back = box({ ...newDeviceElement('iphone', theme), id: 'back' }, 220, 420, 220, 460, 8);
    const front = box({ ...newDeviceElement('iphone', theme), id: 'front' }, 120, 440, 220, 460, -6);
    const html = render({ boxes: [back, front], missingShots: ['back', 'front'], selection: 'back', hover: 'front' });
    expect(count(html, 'data-qa="empty-slot"')).toBe(2);
    // Only the back phone is covered, so exactly one mask, cut by the front phone's outline.
    expect(count(html, '<mask ')).toBe(1);
    expect(count(html, 'fill="black"')).toBe(1);
    expect(count(html, 'data-qa="empty-slot-label"')).toBe(2);
  });

  it('shows the drop target and its label, not the hint under it', () => {
    const html = render({ missingShots: ['dev'], drop: { slideId: 's', deviceId: 'dev', label: 'Drop to set screenshot', stage: false } });
    expect(html).toContain('data-qa="drop-slide"');
    expect(html).toContain('data-qa="drop-device"');
    expect(html).toContain('Drop to set screenshot');
    expect(html).not.toContain('Drop a screenshot');
    const stage = render({ drop: { slideId: 's', deviceId: 'dev', label: 'From slide 1', stage: true } });
    expect(stage).not.toContain('From slide 1');
    // The tint stays under layers above the device.
    const covered = render({ boxes: [device, imageOver(170, 420, 120, 120)], drop: { slideId: 's', deviceId: 'dev', label: 'Drop', stage: false } });
    expect(covered).toMatch(/<g mask="url\(#[^"]+\)" data-qa="drop-device"/);
  });

  it('marks pending screenshots with a spinner', () => {
    expect(render({ pendingImages: ['dev'] })).toContain('kit-spin');
  });

  it('shows an editor-only placeholder for empty text in the layer’s own style', () => {
    const html = render({ emptyText: ['head'] });
    expect(html).toContain('data-qa="text-placeholder-outline"');
    expect(html).toContain('data-qa="text-placeholder"');
    expect(html).toContain('>Headline<');
    expect(html).toContain(`color:${text.element.kind === 'text' ? text.element.style.color : ''}`);
    // A small subtitle has room for the instruction too.
    const sub = box({ ...newTextElement('subtitle', 'iphone', theme), id: 'sub' }, 170, 200, 300, 18);
    expect(render({ boxes: [device, sub], emptyText: ['sub'] })).toContain('Subtitle · double-click to type');
    // Start alignment follows the language direction.
    const start = box({ ...newTextElement('subtitle', 'iphone', theme), id: 'sub' }, 170, 200, 300, 18);
    if (start.element.kind === 'text') start.element.style.align = 'start';
    expect(render({ boxes: [start], emptyText: ['sub'] })).toContain('justify-content:flex-start');
    expect(render({ boxes: [start], emptyText: ['sub'], rtl: true })).toContain('justify-content:flex-end');
    // Too small to write in: the outline only; zoomed far out, nothing at all.
    const small = render({ width: 130, height: 283, boxes: [sub], emptyText: ['sub'] });
    expect(small).toContain('data-qa="text-placeholder-outline"');
    expect(small).not.toContain('data-qa="text-placeholder"');
    expect(render({ width: 60, height: 130, emptyText: ['head'] })).not.toContain('text-placeholder');
  });

  it('outlines overflowing text in amber', () => {
    expect(render({})).not.toContain('data-qa="overflow"');
    const html = render({ overflowText: ['head'] });
    expect(count(html, 'data-qa="overflow"')).toBe(1);
    expect(html).toContain('stroke="#f5b544"');
    // Ids of layers that are not drawn are ignored.
    expect(render({ overflowText: ['gone'] })).not.toContain('data-qa="overflow"');
  });
});

describe('tidyEntries', () => {
  const a = { key: 'a', label: 'A', icon: null, run: () => undefined };
  const b = { key: 'b', label: 'B', icon: null, run: () => undefined };

  it('drops leading, trailing and doubled separators and falsy entries', () => {
    expect(tidyEntries(['separator', a, false, 'separator', 'separator', null, b, 'separator'])).toEqual([a, 'separator', b]);
    expect(tidyEntries(['separator', undefined])).toEqual([]);
  });
});

/**
 * Server-render tests of the inspector panels: what each control shows for
 * a given element (display units, states, accessible names). Store-backed
 * values (texts, screenshots) render from the store's initial state here;
 * interaction is covered by the WebKit QA scripts in scripts/qa/inspector.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultTheme, newDeviceElement, newImageElement, newShapeElement, newTextElement } from '../../../model/defaults';
import type { DeviceElement, TextElement } from '../../../model/types';
import { TooltipProvider } from '../../kit';
import { setSnapshot, type RenderSnapshot } from '../stage/stageStore';
import { DevicePanel } from './DevicePanel';
import { ImagePanel } from './ImagePanel';
import { Inspector } from './Inspector';
import { LayoutSection } from './LayoutSection';
import { ShapePanel } from './ShapePanel';
import type { Target } from './state';
import { TextPanel } from './TextPanel';

const html = (el: ReactElement) => renderToStaticMarkup(h(TooltipProvider, null, el));
const theme = defaultTheme();
const target: Target = { slideId: 's1', family: 'iphone', elementId: 'e1' };

/** The value attribute of the input with this accessible name. */
function inputValue(markup: string, label: string): string | undefined {
  const tag = new RegExp(`<input\\b[^>]*aria-label="${label}"[^>]*>`).exec(markup)?.[0];
  return tag ? /\svalue="([^"]*)"/.exec(tag)?.[1] : undefined;
}

describe('Inspector', () => {
  it('shows an empty state without a project', () => {
    const out = html(h(Inspector));
    expect(out).toContain('Nothing to inspect');
    expect(out).toContain('data-qa="inspector"');
  });
});

describe('TextPanel', () => {
  const text: TextElement = { ...newTextElement('headline', 'iphone', theme), id: 'e1' };
  const out = html(h(TextPanel, { el: text, target, index: 1, count: 3 }));

  it('shows typography in display units', () => {
    expect(inputValue(out, 'Font size')).toBe('7.5');
    expect(inputValue(out, 'Line height')).toBe('1.08');
    expect(inputValue(out, 'Letter spacing')).toBe('-0.02');
    expect(inputValue(out, 'Maximum lines')).toBe('3');
    expect(out).toContain('lines');
  });

  it('marks the alignment and transform states', () => {
    expect(out).toMatch(/aria-label="Align centre"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Align centre"/);
    expect(out).toMatch(/aria-label="Uppercase"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Uppercase"/);
  });

  it('offers the highlight helper and the copy field', () => {
    expect(out).toContain('Wrap words in');
    expect(out).toContain('aria-label="Highlight selected words"');
    expect(out).toContain('<textarea');
    expect(out).toContain('maxLength="2000"');
  });

  it('shows the box width and anchor in the layout section', () => {
    expect(out).toContain('Text box');
    expect(out).toMatch(/aria-label="Anchor top: the text grows downward"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Anchor top/);
  });

  it('says what an empty max-lines field means', () => {
    const unlimited = html(h(TextPanel, { el: { ...text, style: { ...text.style, maxLines: 0 } }, target, index: 0, count: 1 }));
    expect(inputValue(unlimited, 'Maximum lines')).toBe('');
    expect(unlimited).toContain('placeholder="No limit"');
  });

  it('warns while the stage draws the text overflowing its line limit, with both fixes', () => {
    const twoLines: TextElement = { ...text, style: { ...text.style, maxLines: 2 } };
    const painted = (overflowingText: string[], family: RenderSnapshot['family'] = 'iphone'): RenderSnapshot => ({
      result: { boxes: [], missingShots: [], overflowingText, pendingImages: [] },
      bitmapW: 320,
      bitmapH: 692,
      layout: { background: null, elements: [twoLines] },
      family,
      emptyText: [],
      rtl: false,
      mirrored: false,
    });
    const render = () => html(h(TextPanel, { el: twoLines, target, index: 0, count: 1 }));
    try {
      expect(render()).not.toContain('Too long');
      setSnapshot(target.slideId, painted(['e1']));
      const out = render();
      expect(out).toContain('role="status"');
      expect(out).toContain('Too long for 2 lines, even shrunk to 60%.');
      expect(out).toContain('Allow 3 lines');
      expect(out).toContain('Smaller text');
      // Another text overflowing, or a paint of another device family, is not about this one.
      setSnapshot(target.slideId, painted(['e2']));
      expect(render()).not.toContain('Too long');
      setSnapshot(target.slideId, painted(['e1'], 'ipad'));
      expect(render()).not.toContain('Too long');
    } finally {
      setSnapshot(target.slideId, null);
    }
  });
});

describe('DevicePanel', () => {
  const device: DeviceElement = { ...newDeviceElement('iphone', theme), id: 'e1' };
  const out = html(h(DevicePanel, { el: device, target, index: 0, count: 3 }));

  it('lists every frame as a radio with the current one checked', () => {
    expect((out.match(/role="radio"/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(out).toMatch(/aria-checked="true"[^>]*aria-label="iPhone"|aria-label="iPhone"[^>]*aria-checked="true"/);
    expect(out).toContain('aria-label="No frame"');
  });

  it('offers the colour presets and the body colour', () => {
    for (const name of ['Graphite', 'Silver', 'Natural titanium', 'Deep blue', 'Desert gold', 'White', 'Black']) expect(out).toContain(`aria-label="${name}"`);
    expect((out.match(/clay"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('shows the missing screenshot state and the size', () => {
    expect(out).toContain('No screenshot');
    expect(out).toContain('Choose…');
    expect(out).toContain(`value="${Math.round(device.width * 10000) / 100}"`);
  });

  it('shows corner radius only for bare screenshots', () => {
    expect(out).not.toContain('>Corners<');
    const bare = html(h(DevicePanel, { el: { ...device, frame: 'none' }, target, index: 0, count: 1 }));
    expect(bare).toContain('>Corners<');
  });
});

describe('ShapePanel', () => {
  it('shows kind, size, corners for rectangles and the fill editor', () => {
    const rect = { ...newShapeElement('rect', theme), id: 'e1' };
    const out = html(h(ShapePanel, { el: rect, target, index: 0, count: 1 }));
    expect(out).toMatch(/aria-checked="true"[^>]*aria-label="Rectangle"|aria-label="Rectangle"[^>]*aria-checked="true"/);
    expect(out).toContain('value="50"');
    expect(out).toContain('value="32"');
    expect(out).toContain('>Corners<');
    expect(out).not.toContain('>Stroke<');
    expect(out).toContain('aria-label="Fill type"');
  });

  it('shows the stroke for rings and the outline shuffle for blobs', () => {
    const ring = html(h(ShapePanel, { el: { ...newShapeElement('ring', theme), id: 'e1' }, target, index: 0, count: 1 }));
    expect(ring).toContain('>Stroke<');
    const blob = html(h(ShapePanel, { el: { ...newShapeElement('blob', theme), id: 'e1' }, target, index: 0, count: 1 }));
    expect(blob).toContain('aria-label="New random outline"');
  });
});

describe('ImagePanel', () => {
  it('renders a missing image without crashing and offers Replace', () => {
    const img = { ...newImageElement(`${'c'.repeat(64)}.png`, 0.5), id: 'e1' };
    const out = html(h(ImagePanel, { el: img, target, index: 0, count: 1 }));
    expect(out).toContain('Missing image');
    expect(out).toContain('Replace…');
  });
});

describe('LayoutSection', () => {
  it('shows position, rotation and opacity in display units', () => {
    const el = { ...newShapeElement('circle', theme), id: 'e1', x: 0.25, y: 0.6394, rotation: 370, opacity: 0.5 };
    const out = html(h(LayoutSection, { el, target, index: 0, count: 1 }));
    expect(out).toContain('value="25"');
    expect(out).toContain('value="63.94"');
    expect(out).toContain('value="10"');
    expect(out).toContain('value="50"');
  });

  it('disables arrange buttons that would do nothing', () => {
    const el = { ...newShapeElement('circle', theme), id: 'e1' };
    const out = html(h(LayoutSection, { el, target, index: 0, count: 1 }));
    expect(out).toMatch(/aria-label="Bring to front"[^>]*disabled=""/);
    expect(out).toMatch(/aria-label="Send to back"[^>]*disabled=""/);
    const middle = html(h(LayoutSection, { el, target, index: 1, count: 3 }));
    expect(middle).not.toMatch(/aria-label="Bring forward"[^>]*disabled=""/);
  });

  it('reflects lock and hide as pressed toggles', () => {
    const el = { ...newShapeElement('circle', theme), id: 'e1', locked: true, hidden: true };
    const out = html(h(LayoutSection, { el, target, index: 0, count: 1 }));
    expect(out).toMatch(/aria-label="Unlock"[^>]*aria-pressed="true"/);
    expect(out).toMatch(/aria-label="Show"[^>]*aria-pressed="true"/);
  });
});

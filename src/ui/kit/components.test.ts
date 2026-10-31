/**
 * Render tests for the kit components (server rendering, no DOM): markup,
 * accessibility attributes and state classes. Interaction is covered by the
 * WebKit QA script in scripts/qa/kit-interact.mjs.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Fill } from '../../model/types';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { ColorField } from './ColorField';
import { cx } from './cx';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from './Dialog';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { FillEditor } from './FillEditor';
import { IconButton } from './IconButton';
import { Input, Textarea } from './Input';
import { Kbd } from './Kbd';
import { ListRow } from './ListRow';
import { NumberField } from './NumberField';
import { ScrollArea } from './ScrollArea';
import { Section } from './Section';
import { SegmentedControl } from './SegmentedControl';
import { Select } from './Select';
import { Showcase } from './Showcase';
import { Slider } from './Slider';
import { Spinner } from './Spinner';
import { Badge, Card, Divider, ProgressBar, Skeleton } from './Surfaces';
import { Switch } from './Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { Toaster } from './Toaster';
import { Tooltip, TooltipProvider } from './Tooltip';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;

/** Attribute value of the first element matching `tag` with `attr`. */
function attr(markup: string, name: string, tag = '[a-z]+'): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`).exec(markup);
  return m?.[1];
}

describe('cx', () => {
  it('joins non-empty strings and skips everything else', () => {
    expect(cx('a', false, null, undefined, '', 0, 'b', true, 0n)).toBe('a b');
    expect(cx()).toBe('');
  });
});

describe('Button', () => {
  it('is a non-submitting secondary button by default', () => {
    const out = html(h(Button, null, 'Save'));
    expect(out).toContain('type="button"');
    expect(out).toContain('data-variant="secondary"');
    expect(out).toContain('>Save<');
  });
  it('shows a spinner while loading without changing its width', () => {
    const out = html(h(Button, { loading: true, variant: 'primary' }, 'Saving'));
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('disabled=""');
    expect(out).toContain('invisible');
    expect(out).toContain('kit-spin');
  });
  it('swaps the leading icon for the spinner when there is one', () => {
    const out = html(h(Button, { loading: true, leadingIcon: h('svg', { 'data-icon': 'x' }) }, 'Export'));
    expect(out).not.toContain('data-icon');
    expect(out).not.toContain('invisible');
  });
  it('keeps the brand gradient while loading but goes neutral when disabled', () => {
    expect(html(h(Button, { variant: 'brand', loading: true }, 'Export'))).not.toContain('disabled:bg-none');
    expect(html(h(Button, { variant: 'brand', disabled: true }, 'Export'))).toContain('disabled:bg-none');
  });
});

describe('IconButton', () => {
  it('names itself from the label and only reports pressed when it is a toggle', () => {
    const plain = html(h(IconButton, { label: 'Undo', icon: h('svg') }));
    expect(attr(plain, 'aria-label', 'button')).toBe('Undo');
    expect(plain).not.toContain('aria-pressed');
    const toggle = html(h(IconButton, { label: 'Grid', active: true, icon: h('svg') }));
    expect(attr(toggle, 'aria-pressed', 'button')).toBe('true');
    expect(toggle).toContain('data-active=""');
  });
  it('paints a toggle that is on with its own colours, not over the ones it has off', () => {
    // The stylesheet orders utilities by name: next to bg-surface or hover:text-text, the accent tint would lose.
    for (const variant of ['ghost', 'solid'] as const) {
      const on = (attr(html(h(IconButton, { label: 'Grid', variant, active: true, tooltip: false, icon: h('svg') })), 'class', 'button') ?? '').split(' ');
      expect(on, variant).toEqual(expect.arrayContaining(['bg-accent-soft', 'text-accent-fg']));
      expect(on.filter((c) => /^(hover:|light:)?(bg|text)-(surface|raised|text)/.test(c)), variant).toEqual([]);
      const off = (attr(html(h(IconButton, { label: 'Grid', variant, active: false, tooltip: false, icon: h('svg') })), 'class', 'button') ?? '').split(' ');
      expect(off, variant).toEqual(expect.arrayContaining(['text-text-2', 'hover:text-text']));
      expect(off, variant).not.toContain('bg-accent-soft');
    }
  });
  it('renders without a TooltipProvider and with tooltips disabled', () => {
    expect(() => html(h(IconButton, { label: 'A', icon: h('svg') }))).not.toThrow();
    expect(html(h(IconButton, { label: 'A', tooltip: false, icon: h('svg') }))).toContain('aria-label="A"');
  });
});

describe('Tooltip', () => {
  it('passes the child through when disabled or empty', () => {
    expect(html(h(Tooltip, { content: 'Hi', disabled: true, children: h('button', null, 'x') }))).toBe('<button>x</button>');
    expect(html(h(Tooltip, { content: '', children: h('button', null, 'x') }))).toBe('<button>x</button>');
  });
  it('wires the trigger inside a provider', () => {
    const out = html(h(TooltipProvider, { children: h(Tooltip, { content: 'Hi', children: h('button', null, 'x') }) }));
    expect(out).toContain('data-state="closed"');
  });
});

describe('Kbd', () => {
  it('renders platform keycaps with a spoken label', () => {
    const mac = html(h(Kbd, { keys: 'mod+shift+z', mac: true }));
    expect(mac).toContain('aria-label="Shift Command Z"');
    expect(mac).toContain('>⇧<');
    expect(mac).toContain('>⌘<');
    const pc = html(h(Kbd, { keys: 'mod+shift+z', mac: false }));
    expect(pc).toContain('>Ctrl<');
    expect(pc).toContain('aria-label="Control Shift Z"');
  });
  it('renders one run of text in the plain tone', () => {
    expect(html(h(Kbd, { keys: 'mod+d', mac: true, tone: 'plain' }))).toContain('>⌘D<');
    expect(html(h(Kbd, { keys: 'mod+d', mac: false, tone: 'plain' }))).toContain('>Ctrl+D<');
  });
});

describe('Field and text inputs', () => {
  it('connects the label, hint and control', () => {
    const out = html(h(Field, { label: 'Name', hint: 'Shown on the home screen', children: h(Input, { defaultValue: 'x' }) }));
    const id = attr(out, 'id', 'input');
    expect(id).toBeTruthy();
    expect(attr(out, 'for', 'label')).toBe(id);
    const describedBy = attr(out, 'aria-describedby', 'input');
    expect(describedBy).toBeTruthy();
    expect(out).toContain(`id="${describedBy}"`);
  });
  it('marks the control invalid when the Field has an error', () => {
    const out = html(h(Field, { label: 'Name', error: 'Required', children: h(Input) }));
    expect(attr(out, 'aria-invalid', 'input')).toBe('true');
    expect(out).toContain('text-danger');
  });
  it('lets an explicit id win over the Field id', () => {
    const out = html(h(Field, { label: 'Name', htmlFor: 'mine', children: h(Input, { id: 'mine' }) }));
    expect(attr(out, 'id', 'input')).toBe('mine');
    expect(attr(out, 'for', 'label')).toBe('mine');
  });
  it('types right-to-left text naturally', () => {
    expect(attr(html(h(Input)), 'dir', 'input')).toBe('auto');
    expect(attr(html(h(Textarea, { value: 'x', onChange: noop })), 'dir', 'textarea')).toBe('auto');
    expect(attr(html(h(Input, { dir: 'ltr' })), 'dir', 'input')).toBe('ltr');
  });
  it('renders icon, suffix and stacked layout', () => {
    const out = html(h(Field, { label: 'Search', layout: 'stacked', children: h(Input, { leadingIcon: h('svg', { 'data-i': '1' }), suffix: 'px' }) }));
    expect(out).toContain('data-i="1"');
    expect(out).toContain('>px<');
    expect(out).toContain('flex-col');
  });
});

describe('NumberField', () => {
  it('is a spinbutton with its range, value and unit', () => {
    const out = html(h(NumberField, { 'aria-label': 'Opacity', value: 42.25, min: 0, max: 100, step: 0.5, unit: '%', onChange: noop }));
    expect(attr(out, 'role', 'input')).toBe('spinbutton');
    expect(attr(out, 'aria-valuenow', 'input')).toBe('42.25');
    expect(attr(out, 'aria-valuemin', 'input')).toBe('0');
    expect(attr(out, 'aria-valuemax', 'input')).toBe('100');
    expect(attr(out, 'aria-valuetext', 'input')).toBe('42.3%');
    expect(attr(out, 'value', 'input')).toBe('42.3');
    expect(out).toContain('>%<');
  });
  it('shows the placeholder for mixed values', () => {
    const out = html(h(NumberField, { 'aria-label': 'H', value: Number.NaN, placeholder: 'Mixed', onChange: noop }));
    expect(attr(out, 'value', 'input')).toBe('');
    expect(out).not.toContain('aria-valuenow');
    expect(attr(out, 'aria-valuetext', 'input')).toBe('Mixed');
  });
  it('names itself from the Field label plus its own scrub label', () => {
    const out = html(h(Field, { label: 'Position', children: h(NumberField, { label: 'X', value: 1, onChange: noop }) }));
    const labelledBy = attr(out, 'aria-labelledby', 'input')?.split(' ') ?? [];
    expect(labelledBy).toHaveLength(2);
    for (const id of labelledBy) expect(out).toContain(`id="${id}"`);
    expect(out).toContain('data-scrub-handle');
    expect(out).toContain('cursor-ew-resize');
  });
  it('takes the Field id when it has no label of its own', () => {
    const out = html(h(Field, { label: 'Size', children: h(NumberField, { value: 1, onChange: noop }) }));
    expect(attr(out, 'for', 'label')).toBe(attr(out, 'id', 'input'));
  });
  it('drops its chrome in the bare variant', () => {
    expect(html(h(NumberField, { value: 1, variant: 'bare', onChange: noop }))).not.toContain('bg-field');
  });
});

describe('Slider', () => {
  it('renders a slider thumb with formatted value text', () => {
    const out = html(h(Slider, { 'aria-label': 'Opacity', value: 40, onChange: noop, format: (v: number) => `${v}%`, bubble: 'always' }));
    expect(out).toContain('role="slider"');
    expect(out).toContain('aria-valuetext="40%"');
    expect(out).toContain('>40%<');
  });
  it('clamps out-of-range and non-finite values', () => {
    // Radix adds aria-valuenow after mount; the value text we pass is there from the first render.
    expect(html(h(Slider, { value: 500, max: 100, onChange: noop }))).toContain('aria-valuetext="100"');
    expect(html(h(Slider, { value: Number.NaN, min: 5, onChange: noop }))).toContain('aria-valuetext="5"');
  });
});

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', disabled: true },
  ];
  it('shows the placeholder when controlled without a value', () => {
    const out = html(h(Select, { value: undefined, onValueChange: noop, options, placeholder: 'Pick one', 'aria-label': 'Letter' }));
    expect(out).toContain('Pick one');
    expect(out).toContain('data-placeholder');
    expect(out).toContain('aria-label="Letter"');
  });
  it('joins a Field', () => {
    const out = html(h(Field, { label: 'Letter', children: h(Select, { defaultValue: 'a', options }) }));
    expect(attr(out, 'for', 'label')).toBe(attr(out, 'id', 'button'));
  });
});

describe('SegmentedControl', () => {
  it('renders radios with the checked segment marking itself before measurement', () => {
    const out = html(
      h(SegmentedControl, {
        'aria-label': 'Finish',
        value: 'matte',
        onValueChange: noop,
        options: [
          { value: 'metal', label: 'Metal' },
          { value: 'matte', label: 'Matte' },
          { value: 'align', icon: h('svg'), tooltip: 'Align' },
        ],
      }),
    );
    expect(out).toContain('role="radiogroup"');
    expect(out).toMatch(/aria-checked="true"[^>]*>(?:<[^>]+>)*Matte/);
    expect(out).toContain('aria-checked:bg-raised');
    expect(out).toContain('aria-label="Align"');
    expect(out).toContain('w-6 px-0');
  });
});

describe('Switch and Checkbox', () => {
  it('label their controls', () => {
    const sw = html(h(Switch, { label: 'Panorama', defaultChecked: true }));
    expect(attr(sw, 'role', 'button')).toBe('switch');
    expect(attr(sw, 'for', 'label')).toBe(attr(sw, 'id', 'button'));
    const cb = html(h(Checkbox, { label: 'Arabic', description: 'Right-to-left', defaultChecked: 'indeterminate' }));
    expect(attr(cb, 'role', 'button')).toBe('checkbox');
    expect(attr(cb, 'aria-checked', 'button')).toBe('mixed');
    expect(attr(cb, 'for', 'label')).toBe(attr(cb, 'id', 'button'));
    expect(cb).toContain('Right-to-left');
  });
});

describe('ColorField', () => {
  it('shows hex and opacity and names the swatch', () => {
    const out = html(h(ColorField, { label: 'Glow', value: '#ff4d7e80', onChange: noop }));
    expect(out).toContain('value="FF4D7E"');
    expect(out).toContain('aria-valuenow="50"');
    expect(out).toContain('aria-label="Glow: #FF4D7E, 50% opacity"');
  });
  it('hides alpha when disabled for the field, and renders a lone swatch', () => {
    const noAlpha = html(h(ColorField, { value: '#ff4d7e80', alpha: false, onChange: noop }));
    expect(noAlpha).not.toContain('opacity');
    const swatch = html(h(ColorField, { value: '#123456', showInput: false, onChange: noop }));
    expect((swatch.match(/<button/g) ?? []).length).toBe(1);
    expect(swatch).not.toContain('<input');
  });
  it('reads invalid values as black instead of crashing', () => {
    expect(html(h(ColorField, { value: 'nope', onChange: noop }))).toContain('value="000000"');
  });
});

describe('FillEditor', () => {
  const fills: Fill[] = [
    { type: 'solid', color: '#FF8A3D' },
    { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 0.5, color: '#888888' }, { offset: 1, color: '#FFFFFF' }] },
    { type: 'radial', cx: 0.5, cy: 0.5, radius: 0.7, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#FFFFFF' }] },
    { type: 'mesh', base: '#000000', points: [{ x: 0.3, y: 0.3, color: '#FF0000', radius: 0.5 }] },
    { type: 'image', assetId: 'a.png', fit: 'contain', opacity: 0.8, blur: 0.02, tint: null },
  ];
  it.each(fills)('renders a $type fill with an accessible preview', (fill) => {
    const out = html(h(FillEditor, { value: fill, onChange: noop, onPickImage: () => null }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Fill type"');
  });
  it('offers one handle per gradient stop', () => {
    const out = html(h(FillEditor, { value: fills[1], onChange: noop }));
    expect((out.match(/aria-label="Stop \d+"/g) ?? []).length).toBe(3);
    expect(out).toContain('aria-label="Gradient angle"');
  });
  it('lists mesh points and their handles', () => {
    const out = html(h(FillEditor, { value: fills[3], onChange: noop }));
    expect((out.match(/role="listitem"/g) ?? []).length).toBe(1);
    expect(out).toContain('title="Point 1"');
  });
  it('disables the Image type without a picker and shows a placeholder without a URL', () => {
    const out = html(h(FillEditor, { value: fills[0], onChange: noop }));
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Image|<button[^>]*data-disabled=""[^>]*>(?:<[^>]+>)*Image/);
    const image = html(h(FillEditor, { value: fills[4], onChange: noop }));
    expect(image).toContain('No preview');
    const withUrl = html(h(FillEditor, { value: fills[4], onChange: noop, getImageUrl: () => 'blob:x' }));
    expect(withUrl).toContain('src="blob:x"');
  });
  it('can restrict the offered types', () => {
    const out = html(h(FillEditor, { value: fills[0], onChange: noop, types: ['solid'] }));
    expect(out).not.toContain('aria-label="Fill type"');
  });
});

describe('Tabs', () => {
  it('renders a tab list whose active tab marks itself until measured', () => {
    const out = html(
      h(Tabs, { defaultValue: 'a' }, h(TabsList, null, h(TabsTrigger, { value: 'a' }, 'A'), h(TabsTrigger, { value: 'b' }, 'B')), h(TabsContent, { value: 'a' }, 'Panel A')),
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('data-[state=active]:shadow-[inset_0_-2px_0_var(--text)]');
    expect(out).toContain('Panel A');
  });
});

describe('Dialog', () => {
  it('renders only the trigger while closed', () => {
    const out = html(h(Dialog, null, h(DialogTrigger, null, 'Open'), h(DialogContent, { title: 'Export' }, 'Body')));
    expect(out).toContain('Open');
    expect(out).not.toContain('Export');
  });
  it('lays out a footer with start content', () => {
    const out = html(h(DialogFooter, { start: 'Hint' }, h(Button, null, 'OK')));
    expect(out).toContain('Hint');
    expect(out).toContain('border-t');
  });
});

describe('Toaster', () => {
  const toasts = [
    { id: '1', kind: 'success' as const, title: 'Saved', description: 'All good', action: { label: 'Undo', onClick: noop } },
    { id: '2', kind: 'error' as const, title: 'Failed' },
  ];
  it('announces errors assertively and others politely', () => {
    const out = html(h(Toaster, { toasts, onDismiss: noop }));
    expect(out).toContain('role="status"');
    expect(out).toContain('role="alert"');
    expect(out).toContain('aria-live="assertive"');
    expect(out).toContain('>Undo<');
    expect(out).toContain('aria-label="Dismiss notification"');
    expect(out).toContain('fixed');
  });
  it('can render in the document flow', () => {
    const out = html(h(Toaster, { toasts, onDismiss: noop, inline: true }));
    expect(out).not.toContain('fixed');
    expect(out).toContain('items-start');
    expect(out).not.toContain('data-position');
  });
  it('marks its region for dialogs and keeps the list out of their aria-hidden', () => {
    const out = html(h(Toaster, { toasts, onDismiss: noop }));
    // Dialogs and popovers ignore clicks inside it; radix's hideOthers spares [aria-live].
    expect(out).toMatch(/<section[^>]*data-kit-toasts=""/);
    expect(out).toMatch(/<ol[^>]*aria-live="off"/);
  });
  it('sits where it is placed, with an offset only for bottom stacks', () => {
    const bottom = html(h(Toaster, { toasts, onDismiss: noop, position: 'bottom-center', bottomOffset: 36 }));
    expect(attr(bottom, 'data-position', 'section')).toBe('bottom-center');
    expect(attr(bottom, 'style', 'section')).toBe('bottom:36px');
    expect(bottom).toContain('left-1/2');
    const top = html(h(Toaster, { toasts, onDismiss: noop, position: 'top-center', bottomOffset: 36 }));
    expect(attr(top, 'data-position', 'section')).toBe('top-center');
    expect(top).not.toMatch(/<section[^>]*style=/);
    // The newest toast sits nearest the edge it comes in from.
    expect(top.indexOf('>Failed<')).toBeLessThan(top.indexOf('>Saved<'));
    expect(bottom.indexOf('>Saved<')).toBeLessThan(bottom.indexOf('>Failed<'));
  });
});

describe('small pieces', () => {
  it('EmptyState shows its parts', () => {
    const out = html(h(EmptyState, { title: 'No projects', description: 'Start here', actions: h(Button, null, 'New') }));
    expect(out).toContain('No projects');
    expect(out).toContain('Start here');
    expect(out).toContain('>New<');
    expect(out).toContain('brand-gradient');
  });
  it('Badge renders variants and dots', () => {
    const out = html(h(Badge, { variant: 'success', dot: true }, 'Saved'));
    expect(out).toContain('text-success');
    expect(out).toContain('rounded-full');
  });
  it('ProgressBar reports determinate progress and clamps', () => {
    const out = html(h(ProgressBar, { value: 0.426, label: 'Export', showValue: true }));
    expect(out).toContain('aria-valuenow="43"');
    expect(out).toContain('width:42.6%');
    expect(out).toContain('>43%<');
    expect(html(h(ProgressBar, { value: 7 }))).toContain('aria-valuenow="100"');
    const indeterminate = html(h(ProgressBar, { value: null }));
    expect(indeterminate).not.toContain('aria-valuenow');
    expect(indeterminate).toContain('kit-indeterminate');
  });
  it('Skeleton renders lines, capped, hidden from assistive tech', () => {
    const out = html(h(Skeleton, { lines: 3 }));
    expect((out.match(/kit-shimmer/g) ?? []).length).toBe(3);
    expect(out).toContain('aria-hidden="true"');
    expect((html(h(Skeleton, { lines: 500 })).match(/kit-shimmer/g) ?? []).length).toBe(50);
  });
  it('Divider is decorative unless told otherwise', () => {
    expect(html(h(Divider))).toContain('role="none"');
    const sep = html(h(Divider, { decorative: false, orientation: 'vertical' }));
    expect(sep).toContain('role="separator"');
    expect(sep).toContain('aria-orientation="vertical"');
    expect(html(h(Divider, { label: 'or' }))).toContain('>or<');
  });
  it('Card shows selection with a ring', () => {
    expect(html(h(Card, { selected: true }))).toContain('ring-accent');
    expect(html(h(Card, { interactive: true }))).toContain('hover:shadow-md');
  });
  it('Spinner is a status unless decorative', () => {
    expect(html(h(Spinner))).toContain('role="status"');
    expect(html(h(Spinner, { label: null }))).toContain('aria-hidden="true"');
  });
  it('ScrollArea keeps vertical content block-level so it can truncate', () => {
    const out = html(h(ScrollArea, { className: 'h-10' }, h('p', null, 'Row')));
    expect(out).toContain('display:block');
    expect(html(h(ScrollArea, { orientation: 'both' }, 'x'))).toContain('display:table');
  });
  it('ScrollArea pads its 10 px scrollbar tracks only along their axis, so the thumb is as wide as the track', () => {
    const out = html(h(ScrollArea, { orientation: 'both', type: 'always' }, 'x'));
    const classes = (orientation: string) => new RegExp(`data-orientation="${orientation}" class="([^"]*)"`).exec(out)?.[1].split(' ') ?? [];
    expect(classes('vertical')).toEqual(expect.arrayContaining(['w-2.5', 'py-0.5']));
    expect(classes('horizontal')).toEqual(expect.arrayContaining(['h-2.5', 'px-0.5']));
    // Padding across the track would make the thumb narrower than the track that takes the clicks.
    expect(classes('vertical').filter((c) => /^p[xlr]?-/.test(c))).toEqual([]);
    expect(classes('horizontal').filter((c) => /^p[ytb]?-/.test(c))).toEqual([]);
  });
});

describe('Section', () => {
  it('is an expanded disclosure by default, with its action outside the toggle', () => {
    const out = html(h(Section, { title: 'Position', action: h('button', { 'aria-label': 'Reset' }) }, 'Fields'));
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('Fields');
    expect(out).toMatch(/<\/button><div[^>]*><button aria-label="Reset"/);
  });
  it('can start collapsed or be static', () => {
    expect(html(h(Section, { title: 'Effects', defaultOpen: false }, 'Hidden'))).toContain('aria-expanded="false"');
    const fixed = html(h(Section, { title: 'Info', collapsible: false }, 'Body'));
    expect(fixed).not.toContain('aria-expanded');
    expect(fixed).toContain('Body');
  });
  it('ends header actions 12 px in, with the body, clear of a 10 px scrollbar track', () => {
    for (const collapsible of [true, false]) {
      const out = html(h(Section, { title: 'Shadow', collapsible, action: h('button', { 'aria-label': 'Shadow' }) }, 'Body'));
      const header = /<header class="([^"]*)"/.exec(out)?.[1].split(' ') ?? [];
      expect(header.filter((c) => /^p[xre]-/.test(c)), `collapsible: ${collapsible}`).toEqual([expect.stringMatching(/^p[xe]-3$/)]);
      expect(out.slice(out.indexOf('</header>'))).toMatch(/class="[^"]*\bpx-3\b/);
    }
  });
});

describe('ListRow', () => {
  it('is a selectable option with indentation and meta', () => {
    const out = html(h(ListRow, { label: 'Headline', selected: true, indent: 2, meta: '3' }));
    expect(out).toContain('role="option"');
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain('tabindex="0"');
    expect(out).toContain('padding-inline-start:30px');
    expect(out).toContain('>3<');
  });
  it('hides trailing actions until hover unless kept visible or selected', () => {
    const trailing = h('button', { 'aria-label': 'Hide' });
    expect(html(h(ListRow, { label: 'A', trailing }))).toContain('group-hover/row:opacity-100');
    expect(html(h(ListRow, { label: 'A', trailing, trailingVisible: true }))).not.toContain('group-hover/row:opacity-100');
  });
  it('renders the rename field when editing', () => {
    const out = html(h(ListRow, { label: 'Glow', onRename: noop, editing: true }));
    expect(out).toContain('aria-label="Name"');
    expect(out).toContain('value="Glow"');
  });
  it('is skipped by the keyboard when disabled', () => {
    expect(html(h(ListRow, { label: 'A', disabled: true }))).toContain('tabindex="-1"');
  });
  it('turns secondary text text-2 on the hover and selection fills, where text-3 drops under 4.5:1', () => {
    const meta = (out: string) => /<span class="([^"]*)">3<\/span>/.exec(out)?.[1] ?? '';
    expect(meta(html(h(ListRow, { label: 'A', meta: '3' })))).toContain('group-hover/row:text-text-2');
    expect(meta(html(h(ListRow, { label: 'A', meta: '3', selected: true })))).toContain('text-text-2');
    expect(meta(html(h(ListRow, { label: 'A', meta: '3', selected: true })))).not.toContain('text-text-3');
    expect(html(h(ListRow, { label: 'Hidden', muted: true }))).toContain('hover:text-text-2');
  });
});

describe('Showcase', () => {
  it('renders every section without throwing', () => {
    const out = html(h(Showcase));
    for (const id of ['brand', 'tokens', 'buttons', 'icon-buttons', 'inputs', 'numbers', 'choices', 'colour', 'fill', 'tabs', 'overlays', 'feedback', 'layout']) {
      expect(out).toContain(`data-qa-section="${id}"`);
    }
  });
});

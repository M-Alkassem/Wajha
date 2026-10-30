/**
 * Text contrast of the design tokens in src/styles/tokens.css, measured as
 * WCAG 2 defines it, with translucent tokens composited over what they sit
 * on first. Checks the promises in the header of tokens.css: every Badge
 * variant (read from its rendered classes) on every background a badge can
 * sit on, every Button variant at rest, on hover and pressed (read from its
 * rendered classes too) with each state visibly apart from the last, the
 * brand gradient under the Export label, and the chosen and highlighted
 * states of the other controls, in both themes.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, type ButtonVariant } from './Button';
import { hexToRgba, mixHex, parseCssColor, relativeLuminance, splitAlpha } from './color';
import { Badge, type BadgeVariant } from './Surfaces';

type Theme = 'dark' | 'light';

const css = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
const kitCss = readFileSync(new URL('../../styles/kit.css', import.meta.url), 'utf8');

/** Selector and declarations of every rule without nested blocks. */
const rules = (source: string) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((s) => s.trim()), body: m[2] }));

/** Custom properties of the first rule whose selector list contains `selector`. */
function rule(selector: string): Record<string, string> {
  const found = rules(css).find((r) => r.selectors.includes(selector));
  if (!found) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries([...found.body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]));
}

const dark = rule("[data-theme='dark']");
const TOKENS: Record<Theme, Record<string, string>> = { dark, light: { ...dark, ...rule("[data-theme='light']") } };

/**
 * A colour as the page paints it: a token name or a hex literal, where
 * "a/b" is a composited over b (a translucent fill on its background) and
 * the last colour of the chain is opaque.
 */
function color(theme: Theme, ref: string): string {
  const [top, ...rest] = ref.split('/');
  const value = top.startsWith('#') ? top : TOKENS[theme][top];
  const parsed = value === undefined ? null : parseCssColor(value);
  if (!parsed) throw new Error(`${top} (${theme}) is not a colour: ${value}`);
  const { rgb, alpha } = splitAlpha(parsed);
  if (alpha === 1) return rgb;
  if (!rest.length) throw new Error(`${top} (${theme}) is translucent: name what it sits on`);
  return mixHex(color(theme, rest.join('/')), rgb, alpha);
}

function ratio(theme: Theme, fg: string, bg: string): number {
  const a = relativeLuminance(color(theme, fg));
  const b = relativeLuminance(color(theme, bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every pair under 4.5:1 as "label: fg on bg: ratio", so a failure names them all. */
function failures(theme: Theme, list: [fg: string, bg: string, label?: string][]): string[] {
  const found = list
    .filter(([fg, bg]) => ratio(theme, fg, bg) < 4.5)
    .map(([fg, bg, label]) => `${label ? `${label}: ` : ''}${fg} on ${bg}: ${ratio(theme, fg, bg).toFixed(2)}`);
  return [...new Set(found)];
}

const pairs = (fgs: string[], bgs: string[]): [string, string][] => fgs.flatMap((fg) => bgs.map((bg): [string, string] => [fg, bg]));

/** OKLab coordinates of an opaque colour (Björn Ottosson's matrices): distances there follow perceived difference. */
function oklab(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgba(hex);
  const [lr, lg, lb] = [r, g, b].map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How different two painted colours look: their distance in OKLab. */
function deltaE(theme: Theme, a: string, b: string): number {
  const [x, y] = [oklab(color(theme, a)), oklab(color(theme, b))];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The just-noticeable difference in OKLab that CSS Color 4 works with. */
const JND = 0.02;

/**
 * Where badges sit: panels, popovers (menus, dialogs), cards (surface in
 * dark, raised in light), hovered rows (surface-2), highlighted rows (menus,
 * selects and pickers use surface-3 in dark, surface-2 in light), selected
 * rows (accent-soft), input wells and the stage.
 */
const BADGE_GROUNDS: Record<Theme, string[]> = {
  dark: ['panel', 'popover', 'surface', 'surface-2', 'surface-3', 'accent-soft/panel', 'accent-soft/popover', 'field/panel', 'field/popover', 'stage'],
  light: ['panel', 'popover', 'raised', 'surface', 'surface-2', 'accent-soft/panel', 'accent-soft/popover', 'field/panel', 'field/popover', 'stage'],
};

const VARIANTS: BadgeVariant[] = ['neutral', 'accent', 'success', 'warning', 'danger'];

/** The colour tokens behind a Badge variant's text and fill, from its rendered classes. */
function badgeTokens(variant: BadgeVariant): { text: string; fill: string } {
  const classes = (/class="([^"]*)"/.exec(renderToStaticMarkup(h(Badge, { variant }, 'RTL')))?.[1] ?? '').split(/\s+/);
  // text-2xs is a font size, not a colour: only names of colour tokens count.
  const token = (prefix: string) => classes.find((c) => c.startsWith(prefix) && c.slice(prefix.length) in TOKENS.dark)?.slice(prefix.length);
  const text = token('text-');
  const fill = token('bg-');
  if (!text || !fill) throw new Error(`no colour classes on the ${variant} badge: ${classes.join(' ')}`);
  return { text, fill };
}

type State = 'rest' | 'hover' | 'pressed';
const STATES: State[] = ['rest', 'hover', 'pressed'];

/** A label colour and the fill under it; without a fill the control shows what it sits on. */
interface Paint {
  text: string;
  fill?: string;
}

/** The state variants each state applies: a pressed control is hovered too. */
const STATE_VARIANTS: Record<State, string[]> = { rest: [], hover: ['hover'], pressed: ['hover', 'active'] };

/**
 * A rendered control's label and fill colours in each state, read from its
 * classes the way the cascade applies them: plain utilities at rest, hover:
 * ones over those on hover, active: ones over both when pressed, and in each
 * state the theme's light: or dark: utilities over the plain ones. Classes
 * with other variants (disabled:, focus-visible:...) do not count, nor do
 * sizes (text-ui); text-white is #FFFFFF and bg-(--name) is a token that has
 * no Tailwind name.
 */
function paints(markup: string, theme: Theme): Record<State, Paint> {
  const classes = (/class="([^"]*)"/.exec(markup)?.[1] ?? '').split(/\s+/);
  const pick = (state: State, property: 'text' | 'bg'): string | undefined => {
    let best: { score: number; value: string } | undefined;
    for (const c of classes) {
      const m = /^((?:[a-z-]+:)*)(text|bg)-(.+)$/.exec(c);
      if (!m || m[2] !== property) continue;
      const variants = m[1].split(':').filter(Boolean);
      const states = variants.filter((v) => v === 'hover' || v === 'active');
      const themes = variants.filter((v) => v === 'dark' || v === 'light');
      if (states.length + themes.length < variants.length) continue;
      if (themes.some((t) => t !== theme) || states.some((v) => !STATE_VARIANTS[state].includes(v))) continue;
      const value = m[3] === 'white' ? '#FFFFFF' : (/^\(--([\w-]+)\)$/.exec(m[3])?.[1] ?? m[3]);
      if (!value.startsWith('#') && !(value in TOKENS.dark)) continue;
      const score = 2 * Math.max(0, ...states.map((v) => STATE_VARIANTS[state].indexOf(v) + 1)) + themes.length;
      if (best?.score === score && best.value !== value) throw new Error(`two ${property} colours in ${state} (${theme}): ${best.value}, ${value}`);
      if (!best || score > best.score) best = { score, value };
    }
    return best?.value;
  };
  const paint = (state: State): Paint => {
    const text = pick(state, 'text');
    if (!text) throw new Error(`no label colour in ${state} (${theme}): ${classes.join(' ')}`);
    return { text, fill: pick(state, 'bg') };
  };
  return { rest: paint('rest'), hover: paint('hover'), pressed: paint('pressed') };
}

const button = (variant: ButtonVariant) => renderToStaticMarkup(h(Button, { variant }, 'Save'));

/** Variants with flat fills; brand paints a gradient (checked on its own). */
const FLAT_BUTTONS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

/** What a button without a fill of its own sits on: panels, popovers and dialogs, dialog footers, cards. */
const BUTTON_GROUNDS: Record<Theme, string[]> = {
  dark: ['panel', 'popover', 'surface'],
  light: ['panel', 'popover', 'surface', 'raised'],
};

/** A state's fill on a ground: an opaque fill hides the ground, a translucent one is composited over it, none shows it. */
function fillOn(theme: Theme, paint: Paint, ground: string): string {
  if (!paint.fill) return ground;
  return splitAlpha(parseCssColor(TOKENS[theme][paint.fill] ?? paint.fill) ?? '').alpha === 1 ? paint.fill : `${paint.fill}/${ground}`;
}

/**
 * Labels on the other controls that fill or highlight a state. Segmented
 * controls and pill tabs share their look: unchosen labels on the field well
 * (field-hover in light), hovered ones in text, the chosen one on the raised
 * thumb. Menus and selects highlight a row with surface-3 in dark and
 * surface-2 in light (text-3 in it turns text-2), danger items with their
 * soft tint. Selected chips and checks are filled with the accent; a pressed
 * IconButton is tinted with accent-soft.
 */
const CONTROL_STATES: Record<Theme, [fg: string, bg: string, label: string][]> = {
  dark: [
    ['text-2', 'field/panel', 'segment on a panel'],
    ['text-2', 'field/popover', 'segment in a popover'],
    ['text', 'field/popover', 'hovered segment'],
    ['text', 'raised', 'chosen segment'],
    ['text', 'surface-3', 'menu highlight'],
    ['text-2', 'surface-3', 'menu highlight, secondary text'],
    ['danger', 'danger-soft/popover', 'danger menu highlight'],
    ['accent-text', 'accent', 'selected chip'],
    ['accent-fg', 'accent-soft/panel', 'pressed icon button'],
    ['accent-fg', 'accent-soft/popover', 'pressed icon button in a popover'],
  ],
  light: [
    ['text-2', 'field-hover/panel', 'segment on a panel'],
    ['text-2', 'field-hover/popover', 'segment in a popover'],
    ['text', 'field-hover/popover', 'hovered segment'],
    ['text', 'raised', 'chosen segment'],
    ['text', 'surface-2', 'menu highlight'],
    ['text-2', 'surface-2', 'menu highlight, secondary text'],
    ['danger', 'danger-soft/popover', 'danger menu highlight'],
    ['accent-text', 'accent', 'selected chip'],
    ['accent-fg', 'accent-soft/panel', 'pressed icon button'],
    ['accent-fg', 'accent-soft/popover', 'pressed icon button in a popover'],
  ],
};

/** The colour stops of a gradient token, in order. */
function gradientStops(name: string): string[] {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1];
  if (!value) throw new Error(`no --${name} in tokens.css`);
  return value.match(/#[0-9a-f]{6}\b/gi) ?? [];
}

describe('token contrast', () => {
  it('composites translucent tokens like the page does', () => {
    // WebKit paints the light accent-soft over surface-2 (a highlighted picker row) as rgb(219, 217, 239).
    expect(color('light', 'accent-soft/surface-2')).toBe('#DBD9EF');
    expect(() => color('dark', 'accent-soft')).toThrow('translucent');
    expect(badgeTokens('accent')).toEqual({ text: 'accent-fg', fill: 'accent-soft' });
    expect(badgeTokens('neutral')).toEqual({ text: 'text-2', fill: 'surface-2' });
  });

  it('reads each Button state from its classes as the cascade applies them', () => {
    expect(paints(button('primary'), 'dark')).toEqual({
      rest: { text: 'accent-text', fill: 'accent' },
      hover: { text: 'accent-text', fill: 'accent-2' },
      pressed: { text: 'accent-text', fill: 'accent-3' },
    });
    // light:bg-raised over bg-surface, light:hover: over hover:, and so on.
    expect(paints(button('secondary'), 'light')).toEqual({
      rest: { text: 'text', fill: 'raised' },
      hover: { text: 'text', fill: 'surface' },
      pressed: { text: 'text', fill: 'surface-2' },
    });
    expect(paints(button('ghost'), 'dark')).toEqual({
      rest: { text: 'text-2', fill: undefined },
      hover: { text: 'text', fill: 'surface-2' },
      pressed: { text: 'text', fill: 'surface-3' },
    });
    // A token without a Tailwind colour name, and white text.
    expect(paints(button('danger'), 'dark').pressed).toEqual({ text: '#FFFFFF', fill: 'danger-solid-3' });
    // The disabled brand button's neutral fill does not count as a state.
    expect(paints(button('brand'), 'light').rest).toEqual({ text: '#FFFFFF', fill: undefined });
  });

  it('keeps the Export label at 4.5:1 wherever it sits on the brand gradient', () => {
    const stops = gradientStops('brand-gradient-strong');
    expect(stops.length).toBeGreaterThanOrEqual(2);
    // Mixed in sRGB, a colour between two stops is never lighter than the
    // lighter of them, so passing stops pass the whole gradient: at rest, on
    // hover (which slides it) and pressed (which shades it).
    const { text } = paints(button('brand'), 'dark').rest;
    expect(failures('dark', stops.map((stop): [string, string, string] => [text, stop, 'brand-gradient-strong']))).toEqual([]);
    // A filter (brightness for pressed, say) would dim the label with the gradient.
    const brandRules = rules(kitCss).filter((r) => r.selectors.some((s) => s.includes('.kit-brand')));
    expect(brandRules.length).toBeGreaterThan(0);
    expect(brandRules.filter((r) => /(^|[\s;])filter\s*:/.test(r.body)).map((r) => r.selectors.join(', '))).toEqual([]);
  });

  for (const theme of ['dark', 'light'] as const) {
    describe(theme, () => {
      it('keeps every Badge variant at 4.5:1 wherever badges sit', () => {
        const list = VARIANTS.flatMap((variant) => {
          const { text, fill } = badgeTokens(variant);
          return BADGE_GROUNDS[theme].map((ground): [string, string] => [text, `${fill}/${ground}`]);
        });
        expect(failures(theme, list)).toEqual([]);
      });

      it('keeps body, secondary and tertiary text at 4.5:1 on panels, popovers and surfaces', () => {
        expect(failures(theme, pairs(['text', 'text-2', 'text-3'], ['panel', 'popover', 'surface']))).toEqual([]);
      });

      it('keeps body and secondary text at 4.5:1 on highlighted and selected rows', () => {
        expect(failures(theme, pairs(['text', 'text-2'], ['surface-2', 'surface-3', 'accent-soft/panel', 'accent-soft/popover']))).toEqual([]);
      });

      it('keeps status and accent text at 4.5:1 on every surface', () => {
        const surfaces = ['panel', 'popover', 'raised', 'surface', 'surface-2', 'surface-3'];
        expect(failures(theme, pairs(['success', 'warning', 'danger', 'accent-fg'], surfaces))).toEqual([]);
      });

      it('keeps the label of every Button variant at 4.5:1 at rest, on hover and pressed', () => {
        const list = FLAT_BUTTONS.flatMap((variant) => {
          const states = paints(button(variant), theme);
          return STATES.flatMap((state) =>
            BUTTON_GROUNDS[theme].map((ground): [string, string, string] => [states[state].text, fillOn(theme, states[state], ground), `${variant} ${state}`]),
          );
        });
        expect(failures(theme, list)).toEqual([]);
      });

      it('keeps each Button state visibly apart from the one before it', () => {
        const steps = [
          ['rest', 'hover'],
          ['hover', 'pressed'],
        ] as const;
        const close = FLAT_BUTTONS.flatMap((variant) => {
          const states = paints(button(variant), theme);
          return BUTTON_GROUNDS[theme].flatMap((ground) =>
            steps
              .map(([from, to]) => ({ from, to, a: fillOn(theme, states[from], ground), b: fillOn(theme, states[to], ground) }))
              .filter(({ a, b }) => deltaE(theme, a, b) < JND)
              .map(({ from, to, a, b }) => `${variant} ${from} -> ${to}: ${a} -> ${b}: ${deltaE(theme, a, b).toFixed(3)}`),
          );
        });
        expect([...new Set(close)]).toEqual([]);
      });

      it('keeps the chosen, hovered and highlighted states of the other controls at 4.5:1', () => {
        expect(failures(theme, CONTROL_STATES[theme])).toEqual([]);
      });
    });
  }
});

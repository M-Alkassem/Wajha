/**
 * Builders for engine tests and QA scenes: complete, valid model objects
 * with overridable fields. Pure TypeScript (no Node APIs), but only tests
 * and QA renders import it.
 */
import type {
  Background,
  DeviceElement,
  Fill,
  ImageElement,
  Pattern,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  TextStyle,
  Theme,
} from '../../model/types';
import type { ImageLike, RenderEnv, RenderInput } from '../types';

let counter = 0;
const nextId = (prefix: string) => `${prefix}${++counter}`;

export function textStyle(p: Partial<TextStyle> = {}): TextStyle {
  return {
    font: 'Inter Variable',
    weight: 700,
    size: 0.08,
    lineHeight: 1.15,
    letterSpacing: 0,
    color: '#111111',
    highlight: '#7c3aed',
    highlightMode: 'color',
    align: 'center',
    transform: 'none',
    maxLines: 0,
    shadow: null,
    ...p,
  };
}

export function textEl(p: Partial<Omit<TextElement, 'style'>> & { style?: Partial<TextStyle> } = {}): TextElement {
  const { style, ...rest } = p;
  return {
    id: nextId('t'),
    kind: 'text',
    x: 0.5,
    y: 0.1,
    rotation: 0,
    opacity: 1,
    key: 'headline',
    width: 0.86,
    valign: 'top',
    ...rest,
    style: textStyle(style),
  };
}

export function shapeEl(p: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: nextId('s'),
    kind: 'shape',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    shape: 'circle',
    width: 0.4,
    height: 0.4,
    fill: { type: 'solid', color: '#ff0000' },
    radius: 0,
    stroke: 0.02,
    blur: 0,
    seed: 1,
    ...p,
  };
}

export function deviceEl(p: Partial<DeviceElement> = {}): DeviceElement {
  return {
    id: nextId('d'),
    kind: 'device',
    x: 0.5,
    y: 0.62,
    rotation: 0,
    opacity: 1,
    frame: 'iphone',
    style: { color: '#1f2937', finish: 'metal', bezel: 'black' },
    width: 0.78,
    slot: 'main',
    cornerRadius: 0.1,
    shadow: { color: '#0000004d', blur: 0.06, x: 0, y: 0.03 },
    ...p,
  };
}

export function imageEl(p: Partial<ImageElement> = {}): ImageElement {
  return {
    id: nextId('i'),
    kind: 'image',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    assetId: `${'a'.repeat(64)}.png`,
    width: 0.5,
    cornerRadius: 0,
    shadow: null,
    ...p,
  };
}

export function background(fill: Fill, pattern: Pattern | null = null): Background {
  return { fill, pattern };
}

export function theme(p: Partial<Theme> = {}): Theme {
  return {
    background: background({ type: 'solid', color: '#ffffff' }),
    panorama: false,
    fonts: { heading: 'Inter Variable', body: 'Inter Variable' },
    palette: ['#7c3aed', '#f97316', '#0ea5e9', '#22c55e'],
    mockDark: false,
    ...p,
  };
}

export function slide(p: Partial<Slide> = {}): Slide {
  return {
    id: nextId('slide'),
    texts: { 'en-US': { headline: 'Hello' } },
    shots: {},
    layouts: {},
    ...p,
  };
}

export interface InputOptions extends Partial<Omit<RenderInput, 'layout'>> {
  env: RenderEnv;
  elements?: SlideElement[];
  layoutBackground?: Background | null;
  images?: Record<string, ImageLike>;
  aspects?: Record<string, number>;
}

/** A RenderInput for a 360 x 780 iPhone-shaped slide unless overridden. */
export function renderInput(o: InputOptions): RenderInput {
  const { elements = [], layoutBackground = null, images = {}, aspects = {}, ...rest } = o;
  return {
    width: 360,
    height: 780,
    family: 'iphone',
    slide: slide(),
    theme: theme(),
    lang: 'en-US',
    baseLang: 'en-US',
    rtl: false,
    slideIndex: 0,
    slideCount: 1,
    getImage: (id) => images[id] ?? null,
    getAssetAspect: (id) => aspects[id] ?? null,
    placeholder: 'mock',
    ...rest,
    layout: { background: layoutBackground, elements },
  };
}

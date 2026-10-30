/**
 * Hand-built project fixtures for export tests. They do not use
 * model/defaults (owned and implemented elsewhere), so the export tests only
 * depend on the data model types.
 */
import type { DeviceElement, Project, Slide, SlideElement, SlideLayout, TextElement, Theme } from '../model/types';

export const theme: Theme = {
  background: { fill: { type: 'solid', color: '#101018' }, pattern: null },
  panorama: false,
  fonts: { heading: 'Inter Variable', body: 'Inter Variable' },
  palette: ['#7c5cff', '#ff7a59'],
  mockDark: true,
};

export function device(id: string, extra: Partial<DeviceElement> = {}): DeviceElement {
  return {
    id,
    kind: 'device',
    x: 0.5,
    y: 0.62,
    rotation: 0,
    opacity: 1,
    frame: 'iphone',
    style: { color: '#1c1c1e', finish: 'metal', bezel: 'black' },
    width: 0.78,
    slot: 'main',
    cornerRadius: 0.12,
    shadow: null,
    ...extra,
  };
}

export function text(id: string, key: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    id,
    kind: 'text',
    key,
    x: 0.5,
    y: 0.08,
    rotation: 0,
    opacity: 1,
    width: 0.86,
    valign: 'top',
    style: {
      font: 'Inter Variable',
      weight: 700,
      size: 0.072,
      lineHeight: 1.1,
      letterSpacing: -0.02,
      color: '#ffffff',
      highlight: '#ffcc00',
      highlightMode: 'color',
      align: 'center',
      transform: 'none',
      maxLines: 3,
      shadow: null,
    },
    ...extra,
  };
}

export const layout = (...elements: SlideElement[]): SlideLayout => ({ background: null, elements });

export function slide(partial: Partial<Slide> = {}): Slide {
  return { id: 'slide', texts: {}, shots: {}, layouts: {}, ...partial };
}

export function project(partial: Partial<Project> = {}): Project {
  return {
    format: 'wajha.project',
    version: 1,
    id: 'p1',
    name: 'Demo',
    createdAt: 1,
    updatedAt: 1,
    templateId: null,
    // A copy per project: tests deep-freeze projects and must not freeze each other's fixtures.
    theme: structuredClone(theme),
    families: ['iphone'],
    languages: ['en-US'],
    slides: [],
    assets: {},
    export: { sizes: [], languages: [], format: 'png', jpegQuality: 0.9, structure: 'stores' },
    ...partial,
  };
}

/** Recursively freezes a value, so a test fails loudly if code under test mutates it. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

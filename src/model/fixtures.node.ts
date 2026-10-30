/**
 * Test fixtures for model and store tests: valid asset ids, a template with
 * all three class layouts, and small helpers to measure layouts.
 */
import { FAMILIES } from './catalog';
import { defaultLayout, defaultTheme } from './defaults';
import { deviceHeightFactor, familyMetrics } from './geometry';
import type { AssetInfo, DeviceElement, FamilyId, SlideElement, SlideLayout, Template, TextElement } from './types';

/** A syntactically valid asset id ("<64 hex>.png"). */
export function assetId(n: number, ext: 'png' | 'jpg' | 'webp' = 'png'): string {
  return `${n.toString(16).padStart(64, '0')}.${ext}`;
}

export function assetInfo(n: number, width = 1320, height = 2868): AssetInfo {
  const id = assetId(n);
  return { id, name: `shot-${n}.png`, width, height, bytes: 1000 + n, addedAt: 1_700_000_000_000 + n };
}

/** A template whose slides carry tall, tablet and wide layouts (the last slide only tall). */
export function sampleTemplate(slideCount = 3): Template {
  const theme = defaultTheme();
  const slides = Array.from({ length: slideCount }, (_, i) => {
    const ids = { device: `dev${i}`, headline: `head${i}`, subtitle: `sub${i}` };
    const layouts: Template['slides'][number]['layouts'] = { tall: defaultLayout('iphone', theme, ids) };
    if (i < slideCount - 1) {
      layouts.tablet = defaultLayout('ipad', theme, ids);
      layouts.wide = defaultLayout('mac', theme, ids);
    }
    return {
      texts: {
        'en-US': { headline: `Headline ${i + 1}`, subtitle: `Subtitle ${i + 1}` },
        ar: { headline: `عنوان ${i + 1}`, subtitle: `وصف ${i + 1}` },
        'fr-FR': { headline: `Titre ${i + 1}`, subtitle: `Sous-titre ${i + 1}` },
      },
      layouts,
    };
  });
  return {
    format: 'wajha.template',
    version: 1,
    id: 'sample-glow',
    name: 'Sample Glow',
    author: 'Wajha',
    description: 'A test template.',
    category: 'gradient',
    tags: ['test'],
    theme,
    slides,
    assets: {},
  };
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Estimated device box as fractions of the canvas (same estimate adaptLayout uses). */
export function deviceBox(el: DeviceElement, family: FamilyId): Box {
  const m = familyMetrics(family);
  const factor = deviceHeightFactor(el.frame, FAMILIES[family].screenAspect);
  const r = (el.rotation * Math.PI) / 180;
  const w = el.width;
  const h = w * factor;
  const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
  const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
  return {
    top: el.y - bh / 2 / m.hu,
    bottom: el.y + bh / 2 / m.hu,
    left: el.x - bw / 2 / m.wu,
    right: el.x + bw / 2 / m.wu,
  };
}

export const devices = (l: SlideLayout) => l.elements.filter((e): e is DeviceElement => e.kind === 'device');
export const texts = (l: SlideLayout) => l.elements.filter((e): e is TextElement => e.kind === 'text');

/** Every number anywhere in the value, with its path. */
export function numbersIn(value: unknown, path = ''): { path: string; value: number }[] {
  if (typeof value === 'number') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => numbersIn(v, `${path}.${k}`));
  return [];
}

export const byId = (l: SlideLayout, id: string): SlideElement | undefined => l.elements.find((e) => e.id === id);

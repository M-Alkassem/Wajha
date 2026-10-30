/**
 * Web font loading before canvas drawing. The @font-face rules of the
 * bundled fonts are registered by src/fonts.ts; each declares unicode-range
 * subsets, and canvas text does not wait for a subset to download. So before
 * rendering, `ensureFonts` asks `document.fonts.load()` for every (family,
 * weight) the project draws, once per language with that language's own
 * characters as the sample, which pulls in exactly the subsets needed
 * (Arabic, Hebrew, Cyrillic, ...).
 */
import type { FamilyId, Project, Slide, SlideLayout } from '../model/types';
import { BUNDLED_FONTS, FONT_FALLBACK_STACK, languageInfo } from '../model/catalog';
import { resolveLayout } from '../model/resolve';
import { settleWithin } from './util';

/** ensureFonts gives up waiting after this long (a broken font must not block export). */
export const FONT_LOAD_TIMEOUT_MS = 4000;
/** Longest sample string passed to document.fonts.load, in characters. */
export const FONT_SAMPLE_MAX = 400;

export interface FontLoadRequest {
  /** CSS font shorthand, e.g. '700 32px "Inter Variable"'. */
  font: string;
  /** Characters whose unicode-range subsets must be loaded. */
  text: string;
}

// The bundled families of the engine's fallback stack: text in a script the
// chosen font lacks is drawn with these, so their subsets must load too.
const BUNDLED_FALLBACKS: string[] = (() => {
  const bundled = new Set(BUNDLED_FONTS.map((f) => f.family));
  return [...FONT_FALLBACK_STACK.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((family) => bundled.has(family));
})();

function cssFamily(name: string): string {
  return `"${name.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, ' ')}"`;
}

function normWeight(weight: unknown): number {
  return typeof weight === 'number' && Number.isFinite(weight) ? Math.min(1000, Math.max(1, Math.round(weight))) : 400;
}

function layoutOf(project: Project, slide: Slide, family: FamilyId): SlideLayout | null {
  let layout: SlideLayout | undefined;
  try {
    layout = resolveLayout(project, slide, family);
  } catch {
    layout = slide.layouts[family];
  }
  return layout && Array.isArray(layout.elements) ? layout : null;
}

function upper(text: string, lang: string): string {
  try {
    return text.toLocaleUpperCase(lang);
  } catch {
    return text.toUpperCase();
  }
}

/** Whitespace and controls never select a font face. */
const SKIP = /[\s\p{Cc}]/u;

/** Unique characters of everything drawn in `lang`, in first-seen order, capped at FONT_SAMPLE_MAX. */
export function languageSample(project: Project, lang: string, includeUppercase: boolean): string {
  const chars = new Set<string>();
  const add = (text: string) => {
    for (const ch of text) {
      if (chars.size >= FONT_SAMPLE_MAX) return;
      if (!SKIP.test(ch)) chars.add(ch);
    }
  };
  // The language's own name first, so its script loads even before any text is typed.
  add(languageInfo(lang).native);
  for (const slide of project.slides) {
    const texts = slide.texts[lang];
    if (!texts) continue;
    for (const text of Object.values(texts)) {
      if (typeof text !== 'string') continue;
      add(text);
      if (includeUppercase) add(upper(text, lang));
      if (chars.size >= FONT_SAMPLE_MAX) break;
    }
  }
  add('Aa1');
  return [...chars].join('');
}

/**
 * Characters outside the Latin ranges every bundled font covers. Only these
 * are asked of the fallback families, so a Latin project never downloads
 * Rubik's Latin subset just because Rubik sits in the fallback stack.
 */
function beyondLatin(sample: string): string {
  let out = '';
  for (const ch of sample) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x370) continue;
    if (cp >= 0x1d00 && cp <= 0x1eff) continue; // phonetic + Latin Extended Additional (Vietnamese)
    if (cp >= 0x2000 && cp <= 0x2bff) continue; // punctuation, currency, arrows, symbols
    if ((cp >= 0x2c60 && cp <= 0x2c7f) || (cp >= 0xa720 && cp <= 0xa7ff)) continue; // Latin Extended-C/D
    if ((cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff || cp === 0xfffd) continue;
    out += ch;
  }
  return out;
}

/**
 * Every document.fonts.load() call needed to draw `project`: each (family,
 * weight) of its text elements in every slide x family layout (plus the
 * theme fonts, so new text renders at once) for each language's sample.
 * Pure; exported for tests.
 */
export function fontLoadRequests(project: Project): FontLoadRequest[] {
  const faces = new Map<string, { family: string; weight: number }>();
  const addFace = (family: unknown, weight: unknown) => {
    if (typeof family !== 'string') return;
    const name = family.trim();
    if (!name) return;
    const w = normWeight(weight);
    faces.set(`${name}\u0000${w}`, { family: name, weight: w });
  };
  let uppercase = false;
  for (const slide of project.slides) {
    for (const family of project.families) {
      const layout = layoutOf(project, slide, family);
      if (!layout) continue;
      for (const el of layout.elements) {
        if (el.kind !== 'text' || !el.style) continue;
        addFace(el.style.font, el.style.weight);
        if (el.style.transform === 'uppercase') uppercase = true;
      }
    }
  }
  addFace(project.theme?.fonts?.heading, 400);
  addFace(project.theme?.fonts?.body, 400);
  if (faces.size === 0) return [];

  const requests: FontLoadRequest[] = [];
  const seen = new Set<string>();
  const push = (font: string, text: string) => {
    if (!text) return;
    const key = `${font}\u0000${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    requests.push({ font, text });
  };
  const fallbackList = BUNDLED_FALLBACKS.map(cssFamily).join(', ');
  const languages = project.languages.length > 0 ? [...new Set(project.languages)] : ['en-US'];
  for (const lang of languages) {
    const sample = languageSample(project, lang, uppercase);
    const extra = fallbackList ? beyondLatin(sample) : '';
    for (const face of faces.values()) {
      push(`${face.weight} 32px ${cssFamily(face.family)}`, sample);
      if (extra) push(`${face.weight} 32px ${fallbackList}`, extra);
    }
  }
  return requests;
}

function fontFaceSet(): FontFaceSet | null {
  if (typeof document === 'undefined' || document === null) return null;
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  return fonts && typeof fonts.load === 'function' ? fonts : null;
}

// Requests already satisfied in this session; loaded faces stay loaded.
const satisfied = new Set<string>();
const SATISFIED_MAX = 4096;

/** Resolves once every font used by the project (in every language) is loaded. */
export async function ensureFonts(project: Project): Promise<void> {
  const fonts = fontFaceSet();
  if (!fonts) return;
  let requests: FontLoadRequest[];
  try {
    requests = fontLoadRequests(project);
  } catch {
    return;
  }
  const loads: Promise<void>[] = [];
  for (const { font, text } of requests) {
    const key = `${font}\u0000${text}`;
    if (satisfied.has(key)) continue;
    let pending: Promise<unknown>;
    try {
      pending = fonts.load(font, text);
    } catch {
      continue; // a family name the CSS parser rejects
    }
    loads.push(
      Promise.resolve(pending).then(
        () => {
          if (satisfied.size >= SATISFIED_MAX) satisfied.clear();
          satisfied.add(key);
        },
        () => undefined,
      ),
    );
  }
  if (loads.length > 0) await settleWithin(Promise.all(loads), FONT_LOAD_TIMEOUT_MS);
}

/** Called when any web font finishes loading (to repaint canvases). */
export function onFontsChanged(listener: () => void): () => void {
  const fonts = fontFaceSet();
  if (!fonts || typeof fonts.addEventListener !== 'function') return () => {};
  const handler = () => listener();
  fonts.addEventListener('loadingdone', handler);
  return () => fonts.removeEventListener('loadingdone', handler);
}

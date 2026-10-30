/**
 * Pure helpers behind the slides and layers lists: readable names for
 * elements, slide titles, "has content" checks, thumbnail sizing and the
 * missing-screenshot count shown in the status bar.
 */
import { plainText } from '../../../engine';
import { FAMILIES } from '../../../model/catalog';
import { resolveLayout, resolveShot, resolveText } from '../../../model/resolve';
import type { AssetInfo, FamilyId, LangCode, Project, ShapeElement, Slide, SlideElement, SlideLayout } from '../../../model/types';
import { FRAME_LABELS } from '../familyMeta';

/** Markup reduced to one plain line: highlights and escapes removed, line breaks become spaces. */
export function singleLine(markup: string): string {
  if (typeof markup !== 'string' || markup === '') return '';
  return plainText(markup).replace(/\s+/g, ' ').trim();
}

const ROLE_NAMES: Record<string, string> = {
  headline: 'Headline',
  subtitle: 'Subtitle',
  caption: 'Caption',
  eyebrow: 'Eyebrow',
  title: 'Title',
  body: 'Body',
};

/** "headline" -> "Headline", "subtitle2" -> "Subtitle 2", "promo_badge" -> "Promo badge". */
export function textRoleLabel(key: string): string {
  if (typeof key !== 'string' || !key) return 'Text';
  const m = /^(.*?)(\d+)$/.exec(key);
  const stem = m ? m[1] : key;
  const suffix = m ? ` ${m[2]}` : '';
  const known = ROLE_NAMES[stem.toLowerCase()];
  if (known) return known + suffix;
  const words = stem.replace(/[_.-]+/g, ' ').trim();
  if (!words) return `Text${suffix}`;
  return words.charAt(0).toUpperCase() + words.slice(1) + suffix;
}

const SHAPE_NAMES: Record<ShapeElement['shape'], string> = {
  circle: 'Circle',
  rect: 'Rounded rect',
  blob: 'Blob',
  ring: 'Ring',
};

/** Shape name; a soft blurred circle reads as a glow (templates light their slides with them). */
export function shapeLabel(el: ShapeElement): string {
  if (el.shape === 'circle' && el.blur > 0) return 'Glow';
  if (el.shape === 'rect' && !(el.radius > 0)) return 'Rectangle';
  return SHAPE_NAMES[el.shape] ?? 'Shape';
}

export interface LabelContext {
  slide: Slide;
  lang: LangCode;
  baseLang: LangCode;
  assets: Record<string, AssetInfo>;
}

/**
 * The name a layer row shows: the user's name when set; else a text's own
 * words in the active language (falling back to the base language) or its
 * role; a device's frame (plus its slot when it is not the main one); a
 * shape's kind; an image's file name.
 */
export function elementLabel(el: SlideElement, ctx: LabelContext): string {
  const own = typeof el.name === 'string' ? el.name.trim() : '';
  if (own) return own;
  switch (el.kind) {
    case 'text': {
      const text = singleLine(resolveText(ctx.slide, el.key, ctx.lang, ctx.baseLang));
      return text || textRoleLabel(el.key);
    }
    case 'device': {
      const frame = FRAME_LABELS[el.frame] ?? 'Device';
      return el.slot && el.slot !== 'main' ? `${frame} · ${el.slot}` : frame;
    }
    case 'shape':
      return shapeLabel(el);
    case 'image': {
      const name = ctx.assets[el.assetId]?.name?.trim();
      return name || 'Image';
    }
    default:
      return 'Layer';
  }
}

/** Text keys of the layout's text elements, the likely headline first. */
function textKeys(layout: SlideLayout): string[] {
  const keys: string[] = [];
  for (const el of layout.elements) if (el.kind === 'text' && !keys.includes(el.key)) keys.push(el.key);
  return keys;
}

export interface SlideTitle {
  /** The headline in the active language (base-language fallback), plain; "" when there is none. */
  title: string;
  /** The subtitle (or the next text), plain; "" when there is none. */
  subtitle: string;
}

/**
 * Headline and subtitle of a slide as the slides list shows them: the
 * "headline" text (else the first text element) and the "subtitle" text
 * (else the first other text that has words).
 */
export function slideTitle(slide: Slide, layout: SlideLayout, lang: LangCode, baseLang: LangCode): SlideTitle {
  const keys = textKeys(layout);
  const text = (key: string) => singleLine(resolveText(slide, key, lang, baseLang));
  const titleKey = keys.includes('headline') ? 'headline' : (keys[0] ?? '');
  const title = titleKey ? text(titleKey) : '';
  const others = keys.filter((k) => k !== titleKey);
  const subtitleKey = others.includes('subtitle') ? 'subtitle' : (others.find((k) => text(k) !== '') ?? '');
  const subtitle = subtitleKey ? text(subtitleKey) : '';
  return { title, subtitle };
}

/** True when deleting the slide would lose work: any written text or any screenshot. */
export function slideHasContent(slide: Slide): boolean {
  for (const byKey of Object.values(slide.texts ?? {})) {
    for (const t of Object.values(byKey ?? {})) if (typeof t === 'string' && t.trim() !== '') return true;
  }
  for (const bySlot of Object.values(slide.shots ?? {})) {
    for (const byLang of Object.values(bySlot ?? {})) if (byLang && Object.keys(byLang).length > 0) return true;
  }
  return false;
}

/** Visible devices of the layout without a screenshot in `lang` (after base-language fallback). */
export function missingDevices(slide: Slide, layout: SlideLayout, family: FamilyId, lang: LangCode, baseLang: LangCode): string[] {
  const out: string[] = [];
  for (const el of layout.elements) {
    if (el.kind !== 'device' || el.hidden || !(el.opacity > 0)) continue;
    if (resolveShot(slide, family, el.slot, lang, baseLang) === null) out.push(el.id);
  }
  return out;
}

export interface MissingShots {
  /** Device slots without a screenshot, in the slides that are exported. */
  count: number;
  /** The first slide with one, and its first such device. */
  first: { slideId: string; elementId: string } | null;
}

/** Missing screenshots of `family` in `lang` over the slides the store accepts (the first maxSlides). */
export function countMissingShots(project: Project, family: FamilyId, lang: LangCode): MissingShots {
  const base = project.languages[0] ?? lang;
  const limit = FAMILIES[family]?.maxSlides ?? project.slides.length;
  let count = 0;
  let first: MissingShots['first'] = null;
  project.slides.slice(0, limit).forEach((slide) => {
    const ids = missingDevices(slide, resolveLayout(project, slide, family), family, lang, base);
    if (ids.length && !first) first = { slideId: slide.id, elementId: ids[0] };
    count += ids.length;
  });
  return { count, first };
}

/** Inner width of a slide row in px: sidebar 248 minus the list's (2 x 6) and the row's (2 x 8) padding. */
export const SLIDE_LIST_INNER = 248 - 12 - 16;
/** Width of the slide-number column and the gap after it. */
export const SLIDE_NUMBER_COL = 14 + 8;

export interface ThumbSize {
  /** CSS width of the preview. */
  width: number;
  /** side: thumbnail with text beside it (tall canvases); stacked: full-width thumbnail with text below (wide canvases). */
  layout: 'side' | 'stacked';
}

/**
 * Preview size in the slides list. Portrait canvases share one visual area
 * (iPhone ~ 84 px wide, the others a little wider, capped at 88 px so the
 * text column keeps ~97 px for the headline and "No screenshot"); landscape canvases span the row.
 */
export function thumbSize(family: FamilyId): ThumbSize {
  const d = FAMILIES[family]?.design ?? FAMILIES.iphone.design;
  const aspect = d.height / d.width;
  if (aspect >= 1.15) {
    const width = Math.round(Math.min(88, Math.max(80, Math.sqrt(15400 / aspect))));
    return { width, layout: 'side' };
  }
  return { width: SLIDE_LIST_INNER - SLIDE_NUMBER_COL, layout: 'stacked' };
}

/**
 * Measurements behind the template tests: which texts overflow, and how
 * well each text reads against what is painted behind it. Node only.
 *
 * Contrast is measured on pixels, not on the theme's nominal colours: the
 * slide is rendered without its texts, the lines of each text are laid out
 * exactly as the renderer lays them out, and the background is sampled
 * under every line. The dominant background colour is the mean of those
 * samples; text colours with alpha (or element opacity) are composited
 * over it first.
 */
import { layoutText } from '../../engine';
import type { Ctx2D } from '../../engine/types';
import { FAMILIES, isRtl } from '../../model/catalog';
import { contrast, mixColors } from '../../model/colorMath';
import { resolveLayout, resolveText } from '../../model/resolve';
import type { FamilyId, LangCode, Project, TextElement } from '../../model/types';
import { renderProjectSlide } from './render.node';

export interface TextContrast {
  slide: number;
  id: string;
  key: string;
  /** Mean colour of the background under the text lines. */
  background: string;
  /** Contrast of the (composited) text colour against `background`. */
  text: number;
  /** Contrast of highlighted words (their colour, or their colour on the marker pill). */
  highlight: number | null;
  /** 10th percentile of per-sample contrast: low when part of the text sits on a busy area. */
  low: number;
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** "#rrggbb" and alpha (0..1) of a colour string. */
function split(color: string): { rgb: string; alpha: number } {
  const c = color.toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(c)) return { rgb: c.slice(0, 7), alpha: parseInt(c.slice(7, 9), 16) / 255 };
  return { rgb: c.slice(0, 7), alpha: 1 };
}

/** Colour of `color` (with alpha) drawn at `opacity` over the opaque `bg`. */
export function composite(color: string, opacity: number, bg: string): string {
  const { rgb, alpha } = split(color);
  return mixColors(bg, rgb, alpha * opacity);
}

/** Readable ink on a marker pill, as the engine picks it (text/highlightTextColor). */
function markerInk(color: string, pill: string): string {
  if (contrast(pill, split(color).rgb) >= 3) return split(color).rgb;
  return contrast(pill, '#ffffff') >= contrast(pill, '#111114') ? '#ffffff' : '#111114';
}

function sampleLines(ctx: Ctx2D, el: TextElement, text: string, w: number, h: number, u: number, lang: LangCode): [number, number][] {
  const rtl = isRtl(lang);
  const layout = layoutText(ctx, { text, style: el.style, boxWidth: el.width * u, unit: u, rtl, lang });
  const ay = el.y * h;
  const cy = el.valign === 'top' ? ay + layout.height / 2 : el.valign === 'bottom' ? ay - layout.height / 2 : ay;
  const cx = el.x * w;
  const half = layout.boxWidth / 2;
  const align = el.style.align === 'center' ? 'center' : (el.style.align === 'start') !== rtl ? 'left' : 'right';
  const rad = (el.rotation * Math.PI) / 180;
  const points: [number, number][] = [];
  layout.lines.forEach((line, k) => {
    if (!line.width) return;
    const x0 = align === 'left' ? -half : align === 'right' ? half - line.width : -line.width / 2;
    const top = -layout.height / 2 + k * layout.lineHeightPx;
    // A grid over the line box, inset from its edges where the ink is thinnest.
    for (let iy = 1; iy <= 3; iy++) {
      for (let ix = 0; ix <= 8; ix++) {
        const lx = x0 + ((ix + 0.5) / 9) * line.width;
        const ly = top + (iy / 4) * layout.lineHeightPx;
        const px = cx + lx * Math.cos(rad) - ly * Math.sin(rad);
        const py = cy + lx * Math.sin(rad) + ly * Math.cos(rad);
        if (px >= 0 && py >= 0 && px < w && py < h) points.push([px, py]);
      }
    }
  });
  return points;
}

/**
 * Contrast of every visible text element of slide `index` in `lang`,
 * rendered for `family` at `width` px.
 */
export function slideContrast(project: Project, index: number, family: FamilyId, lang: LangCode, width: number): TextContrast[] {
  const bare = renderProjectSlide(project, index, family, lang, width, {
    filter: (l) => ({ ...l, elements: l.elements.filter((e) => e.kind !== 'text') }),
  });
  const { ctx, height: h } = bare;
  const w = width;
  const u = Math.min(w, h);
  const slide = project.slides[index];
  const layout = resolveLayout(project, slide, family);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const out: TextContrast[] = [];
  for (const el of layout.elements) {
    if (el.kind !== 'text' || el.hidden || el.opacity <= 0) continue;
    const text = resolveText(slide, el.key, lang, project.languages[0]);
    if (!text.trim()) continue;
    const points = sampleLines(ctx, el, text, w, h, u, lang);
    if (!points.length) continue;
    const samples = points.map(([x, y]) => {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]] as const;
    });
    const mean = samples.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]).map((v) => v / samples.length);
    const background = toHex(mean[0], mean[1], mean[2]);
    const ink = composite(el.style.color, el.opacity, background);
    const per = samples.map((s) => contrast(composite(el.style.color, el.opacity, toHex(s[0], s[1], s[2])), toHex(s[0], s[1], s[2]))).sort((a, b) => a - b);
    let highlight: number | null = null;
    if (/\*[^*]+\*/.test(text.replace(/\\\*/g, ''))) {
      if (el.style.highlightMode === 'marker') {
        const pill = composite(el.style.highlight, el.opacity, background);
        highlight = contrast(composite(markerInk(el.style.color, split(el.style.highlight).rgb), el.opacity, pill), pill);
      } else {
        highlight = contrast(composite(el.style.highlight, el.opacity, background), background);
      }
    }
    out.push({ slide: index, id: el.id, key: el.key, background, text: contrast(ink, background), highlight, low: per[Math.floor(per.length * 0.1)] });
  }
  return out;
}

/** Ids of texts that overflow their maxLines on slide `index`, rendered at the family's design size. */
export function overflowingTexts(project: Project, index: number, family: FamilyId, lang: LangCode): string[] {
  const width = FAMILIES[family].design.width;
  return renderProjectSlide(project, index, family, lang, width, {
    // Overflow depends on texts only; skipping devices keeps full-size renders fast.
    filter: (l) => ({ ...l, elements: l.elements.filter((e) => e.kind === 'text') }),
  }).result.overflowingText;
}

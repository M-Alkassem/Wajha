/**
 * Where decorations cross text, for the template tests. A drawn shape (or
 * image) crosses a text when its outline runs through one of the text's
 * lines, laid out exactly as the renderer lays them out in that language
 * (right-to-left copy hugs the other edge of its box, German runs longer).
 * A panel behind a whole line, or a shape clear of it, is fine. Soft glows
 * are light rather than lines and never count. Node only.
 */
import { layoutText } from '../../engine';
import { blobOutline } from '../../engine/shapes';
import { testCanvas } from '../../engine/testing/canvas.node';
import { FAMILIES, isRtl } from '../../model/catalog';
import { familyMetrics } from '../../model/geometry';
import { resolveLayout, resolveText } from '../../model/resolve';
import type { FamilyId, LangCode, Project, SlideElement, TextElement } from '../../model/types';

type Point = [number, number];

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Blur at least this share of a shape's size makes it a soft glow (the rule adaptLayout uses). */
const SOFT_BLUR = 0.1;
/** Pixels per u for measuring text: large enough that rounding never matters. */
const MEASURE_U = 1000;
/** Share of each line box above and below the ink (leading). */
const LEADING = 0.12;
const ELLIPSE_STEPS = 96;
const CURVE_STEPS = 16;

let measure: ReturnType<typeof testCanvas>['ctx'] | null = null;

/** The ink band of every line of `el` showing `text` in `lang`, in u on a canvas `wu` x `hu` u. */
function lineBoxes(el: TextElement, text: string, lang: LangCode, wu: number, hu: number): Rect[] {
  measure ??= testCanvas(1, 1).ctx;
  const rtl = isRtl(lang);
  const layout = layoutText(measure, { text, style: el.style, boxWidth: el.width * MEASURE_U, unit: MEASURE_U, rtl, lang });
  const height = layout.height / MEASURE_U;
  const step = layout.lineHeightPx / MEASURE_U;
  const y = el.y * hu;
  const top = el.valign === 'top' ? y : el.valign === 'bottom' ? y - height : y - height / 2;
  const half = el.width / 2;
  const cx = el.x * wu;
  const align = el.style.align === 'center' ? 'center' : (el.style.align === 'start') !== rtl ? 'left' : 'right';
  return layout.lines.flatMap((line, k) => {
    const w = line.width / MEASURE_U;
    if (w <= 0) return [];
    const left = align === 'left' ? cx - half : align === 'right' ? cx + half - w : cx - w / 2;
    const lineTop = top + k * step;
    return [{ left, right: left + w, top: lineTop + LEADING * step, bottom: lineTop + (1 - LEADING) * step }];
  });
}

/** Liang-Barsky: does the segment a-b touch the open rectangle? */
function segmentHits(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges: [number, number][] = [
    [-dx, a[0] - r.left],
    [dx, r.right - a[0]],
    [-dy, a[1] - r.top],
    [dy, r.bottom - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/** True when the closed outline passes through the rectangle. */
const outlineHits = (outline: Point[], r: Rect) => outline.some((p, i) => segmentHits(p, outline[(i + 1) % outline.length], r));

/** Even-odd point in polygon. */
function contains(outline: Point[], p: Point): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A unit-box outline (centred on 0) placed at the element: scaled to w x h u, rotated, moved. */
function place(points: Point[], el: SlideElement, w: number, h: number, wu: number, hu: number): Point[] {
  const a = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = el.x * wu;
  const cy = el.y * hu;
  return points.map(([x, y]) => [cx + x * w * cos - y * h * sin, cy + x * w * sin + y * h * cos]);
}

const ELLIPSE: Point[] = Array.from({ length: ELLIPSE_STEPS }, (_, i) => [Math.cos((i / ELLIPSE_STEPS) * 2 * Math.PI) / 2, Math.sin((i / ELLIPSE_STEPS) * 2 * Math.PI) / 2]);
const SQUARE: Point[] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

/** The engine's blob outline, flattened. */
function blob(seed: number): Point[] {
  const b = blobOutline(seed);
  const out: Point[] = [];
  let x0 = b[0];
  let y0 = b[1];
  for (let i = 2; i + 5 < b.length; i += 6) {
    for (let k = 0; k < CURVE_STEPS; k++) {
      const t = k / CURVE_STEPS;
      const mt = 1 - t;
      const [c0, c1, c2, c3] = [mt * mt * mt, 3 * mt * mt * t, 3 * mt * t * t, t * t * t];
      out.push([c0 * x0 + c1 * b[i] + c2 * b[i + 2] + c3 * b[i + 4], c0 * y0 + c1 * b[i + 1] + c2 * b[i + 3] + c3 * b[i + 5]]);
    }
    x0 = b[i + 4];
    y0 = b[i + 5];
  }
  return out;
}

/** True when `decor`, drawn on a canvas `wu` x `hu` u, runs through the rectangle. */
function crosses(decor: SlideElement, r: Rect, wu: number, hu: number): boolean {
  if (decor.kind === 'image') return outlineHits(place(SQUARE, decor, decor.width, decor.width, wu, hu), r);
  if (decor.kind !== 'shape') return false;
  const { width: w, height: h } = decor;
  switch (decor.shape) {
    case 'rect':
      return outlineHits(place(SQUARE, decor, w, h, wu, hu), r);
    case 'blob':
      return outlineHits(place(blob(decor.seed), decor, w, h, wu, hu), r);
    case 'circle':
      return outlineHits(place(ELLIPSE, decor, w, h, wu, hu), r);
    case 'ring': {
      const outer = place(ELLIPSE, decor, w, h, wu, hu);
      const inner = place(ELLIPSE, decor, Math.max(0, w - 2 * decor.stroke), Math.max(0, h - 2 * decor.stroke), wu, hu);
      // Through either edge, or lying inside the band itself.
      const corner: Point = [r.left, r.top];
      return outlineHits(outer, r) || outlineHits(inner, r) || (contains(outer, corner) && !contains(inner, corner));
    }
  }
  return false;
}

const isDrawn = (el: SlideElement) =>
  !el.hidden && el.opacity > 0 && (el.kind === 'image' || (el.kind === 'shape' && el.blur < SOFT_BLUR * Math.min(el.width, el.height)));

/** "<decoration> crosses <text key>" for every crossing on slide `index` of `project`, for `family` in `lang`. */
export function slideCrossings(project: Project, index: number, family: FamilyId, lang: LangCode): string[] {
  const { wu, hu } = familyMetrics(FAMILIES[family] ? family : 'iphone');
  const slide = project.slides[index];
  const layout = resolveLayout(project, slide, family);
  const lines = layout.elements.flatMap((el) => {
    if (el.kind !== 'text' || el.hidden || el.opacity <= 0) return [];
    const text = resolveText(slide, el.key, lang, project.languages[0]);
    return text.trim() ? lineBoxes(el, text, lang, wu, hu).map((box) => ({ key: el.key, box })) : [];
  });
  const out: string[] = [];
  for (const el of layout.elements) {
    if (!isDrawn(el)) continue;
    const hit = lines.find((l) => crosses(el, l.box, wu, hu));
    if (hit) out.push(`${el.name ?? (el.kind === 'shape' ? el.shape : el.kind)} crosses ${hit.key}`);
  }
  return out;
}

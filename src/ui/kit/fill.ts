/**
 * Pure helpers behind FillEditor: CSS previews of model fills, conversions
 * between fill types that keep the user's colours, and gradient stop / mesh
 * point editing. Offsets and positions are kept in 0..1 and rounded to three
 * decimals so stored projects stay tidy.
 */
import type { Fill, GradientStop, MeshPoint } from '../../model/types';
import { colorsEqual, mixHex, normalizeHex, relativeLuminance, splitAlpha, withAlpha } from './color';

import { t } from '../../i18n';
export type FillType = Fill['type'];
export type SolidFill = Extract<Fill, { type: 'solid' }>;
export type LinearFill = Extract<Fill, { type: 'linear' }>;
export type RadialFill = Extract<Fill, { type: 'radial' }>;
export type MeshFill = Extract<Fill, { type: 'mesh' }>;
export type ImageFill = Extract<Fill, { type: 'image' }>;
export type GradientFill = LinearFill | RadialFill;

export const FILL_TYPES: readonly FillType[] = ['solid', 'linear', 'radial', 'mesh', 'image'];

export const FILL_TYPE_LABEL: Record<FillType, string> = {
  solid: t('Solid'),
  linear: t('Linear'),
  radial: t('Radial'),
  mesh: t('Mesh'),
  image: t('Image'),
};

export const MIN_STOPS = 2;
export const MAX_STOPS = 10;
export const MAX_MESH_POINTS = 8;

/** Used when a conversion has no colours to start from (an image without tint, say). */
export const FALLBACK_COLORS = ['#FF8A3D', '#FF4D7E', '#7C6CFF', '#3DD6C8', '#FFD166'] as const;

const round3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const pct = (v: number) => `${round3(v * 100)}%`;
const hex = (c: string) => normalizeHex(c) ?? '#000000';

export function isGradientFill(fill: Fill): fill is GradientFill {
  return fill.type === 'linear' || fill.type === 'radial';
}

/* Stops ------------------------------------------------------------------ */

/** Stops in ascending offset order; ties keep their original order. Returns a new array of the same stop objects. */
export function sortStops(stops: readonly GradientStop[]): GradientStop[] {
  return stops
    .map((stop, index) => ({ stop, index }))
    .sort((a, b) => a.stop.offset - b.stop.offset || a.index - b.index)
    .map((x) => x.stop);
}

/** The gradient's colour at `offset` (sRGB interpolation, alpha included). */
export function colorAt(stops: readonly GradientStop[], offset: number): string {
  if (stops.length === 0) return '#000000';
  const sorted = sortStops(stops);
  const t = clamp01(offset);
  if (t <= sorted[0].offset) return hex(sorted[0].color);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (t <= b.offset) {
      const span = b.offset - a.offset;
      return span <= 0 ? hex(b.color) : mixHex(a.color, b.color, (t - a.offset) / span);
    }
  }
  return hex(sorted[sorted.length - 1].color);
}

/**
 * Inserts a stop at `offset` with the colour the gradient already has there,
 * so adding a stop never changes the look. Stops come back sorted; `index`
 * is the new stop's position, or -1 when MAX_STOPS is reached.
 */
export function addStop(stops: readonly GradientStop[], offset: number): { stops: GradientStop[]; index: number } {
  const sorted = sortStops(stops);
  if (stops.length >= MAX_STOPS) return { stops: sorted, index: -1 };
  const o = round3(clamp01(offset));
  const stop: GradientStop = { offset: o, color: colorAt(sorted, o) };
  let index = sorted.findIndex((s) => s.offset > o);
  if (index < 0) index = sorted.length;
  return { stops: [...sorted.slice(0, index), stop, ...sorted.slice(index)], index };
}

/** Removes a stop unless only MIN_STOPS remain. */
export function removeStop(stops: readonly GradientStop[], index: number): GradientStop[] {
  if (stops.length <= MIN_STOPS || index < 0 || index >= stops.length) return [...stops];
  return stops.filter((_, i) => i !== index);
}

/** Moves one stop (clamped to 0..1) without re-sorting, so a dragged handle keeps its index. */
export function moveStop(stops: readonly GradientStop[], index: number, offset: number): GradientStop[] {
  if (index < 0 || index >= stops.length) return [...stops];
  return stops.map((s, i) => (i === index ? { ...s, offset: round3(clamp01(offset)) } : s));
}

export function setStopColor(stops: readonly GradientStop[], index: number, color: string): GradientStop[] {
  const c = normalizeHex(color);
  if (!c || index < 0 || index >= stops.length) return [...stops];
  return stops.map((s, i) => (i === index ? { ...s, color: c } : s));
}

/** Sorts stops and reports where the stop at `selected` ended up. */
export function sortStopsKeepSelection(stops: readonly GradientStop[], selected: number): { stops: GradientStop[]; selected: number } {
  const target = stops[selected];
  const sorted = sortStops(stops);
  return { stops: sorted, selected: target ? sorted.indexOf(target) : Math.min(Math.max(0, selected), sorted.length - 1) };
}

/** Mirrors the gradient (offset -> 1 - offset). */
export function reverseStops(stops: readonly GradientStop[]): GradientStop[] {
  return sortStops(stops.map((s) => ({ ...s, offset: round3(1 - clamp01(s.offset)) })));
}

/** Degrees into [0, 360), two decimals; NaN becomes 0. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 || r === 0 ? 0 : r;
}

/* CSS previews ---------------------------------------------------------- */

/** CSS colour-stop list; a single stop is doubled because CSS needs two. */
export function stopsToCss(stops: readonly GradientStop[]): string {
  const sorted = sortStops(stops);
  if (sorted.length === 0) return 'transparent, transparent';
  const list = sorted.map((s) => `${hex(s.color)} ${pct(clamp01(s.offset))}`);
  return list.length === 1 ? `${list[0]}, ${list[0]}` : list.join(', ');
}

/**
 * Mesh blob alpha profile, 1 - smoothstep(t) sampled at quarters: the same
 * curve the engine's mesh painter uses, so previews match exports.
 */
const MESH_FALLOFF = [0, 0.25, 0.5, 0.75, 1].map((t) => 1 - t * t * (3 - 2 * t));

/** CSS ellipse radii for a radius given as a fraction of max(w, h) on a box of `aspect` = w / h. */
function radii(radius: number, aspect: number): string {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const r = Math.max(0.001, Number.isFinite(radius) ? radius : 0);
  return `${pct(r * Math.max(1, 1 / a))} ${pct(r * Math.max(a, 1))}`;
}

export interface FillCss {
  backgroundColor?: string;
  backgroundImage?: string;
}

/**
 * CSS background for previewing a fill on a box with the given aspect ratio
 * (width / height). Image fills return nothing: the preview layers the
 * picture itself so it can apply fit, opacity, blur and tint.
 */
export function fillToCss(fill: Fill, aspect = 1): FillCss {
  switch (fill.type) {
    case 'solid':
      return { backgroundColor: hex(fill.color) };
    case 'linear':
      return { backgroundImage: `linear-gradient(${normalizeAngle(fill.angle)}deg, ${stopsToCss(fill.stops)})` };
    case 'radial':
      return {
        backgroundImage: `radial-gradient(${radii(fill.radius, aspect)} at ${pct(fill.cx)} ${pct(fill.cy)}, ${stopsToCss(fill.stops)})`,
      };
    case 'mesh': {
      // CSS paints the first layer on top; the engine paints points in order, last on top.
      const layers = [...fill.points].reverse().map((p) => {
        const c = hex(p.color);
        const { alpha } = splitAlpha(c);
        const profile = MESH_FALLOFF.map((f, k) => `${withAlpha(c, alpha * f)} ${pct(k / (MESH_FALLOFF.length - 1))}`).join(', ');
        return `radial-gradient(${radii(p.radius, aspect)} at ${pct(p.x)} ${pct(p.y)}, ${profile})`;
      });
      return layers.length ? { backgroundColor: hex(fill.base), backgroundImage: layers.join(', ') } : { backgroundColor: hex(fill.base) };
    }
    case 'image':
      return {};
  }
}

/** Short human description, e.g. for a swatch's accessible name. */
export function describeFill(fill: Fill): string {
  switch (fill.type) {
    case 'solid':
      return `Solid ${hex(fill.color)}`;
    case 'linear':
      return `Linear gradient, ${fill.stops.length} stops, ${normalizeAngle(fill.angle)}°`;
    case 'radial':
      return `Radial gradient, ${fill.stops.length} stops`;
    case 'mesh':
      return `Mesh gradient, ${fill.points.length} ${fill.points.length === 1 ? 'point' : 'points'}`;
    case 'image':
      return `Image, ${fill.fit}`;
  }
}

/* Conversions -------------------------------------------------------------- */

/** The fill's colours in reading order (first stop / base first). */
export function fillColors(fill: Fill): string[] {
  switch (fill.type) {
    case 'solid':
      return [hex(fill.color)];
    case 'linear':
    case 'radial':
      return sortStops(fill.stops).map((s) => hex(s.color));
    case 'mesh':
      return [hex(fill.base), ...fill.points.map((p) => hex(p.color))];
    case 'image':
      return fill.tint ? [splitAlpha(fill.tint).rgb] : [];
  }
}

/** A companion shade: darker for light colours, lighter for dark ones. */
export function shadeOf(color: string): string {
  return relativeLuminance(color) > 0.45 ? mixHex(color, '#000000', 0.35) : mixHex(color, '#FFFFFF', 0.4);
}

function distinctFrom(existing: readonly string[], candidates: readonly string[]): string | undefined {
  return candidates.find((c) => normalizeHex(c) && !existing.some((e) => colorsEqual(e, c)));
}

export interface ConvertContext {
  /** Theme palette, offered when a conversion needs extra colours. */
  palette?: readonly string[];
  /** Asset to use when converting to an image fill. */
  assetId?: string | null;
}

function stopsFrom(fill: Fill, ctx: ConvertContext): GradientStop[] {
  if (isGradientFill(fill)) return sortStops(fill.stops).map((s) => ({ offset: round3(clamp01(s.offset)), color: hex(s.color) }));
  let colors = fillColors(fill).slice(0, 3);
  if (colors.length === 0) colors = [ctx.palette?.[0] ?? FALLBACK_COLORS[0]].map(hex);
  if (colors.length === 1) colors.push(hex(distinctFrom(colors, ctx.palette ?? []) ?? shadeOf(colors[0])));
  return colors.map((color, i) => ({ offset: round3(i / (colors.length - 1)), color }));
}

/** Spots for the first mesh points: a balanced aurora layout. */
const MESH_SPOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.2, y: 0.18 },
  { x: 0.82, y: 0.3 },
  { x: 0.3, y: 0.84 },
  { x: 0.78, y: 0.8 },
];

/**
 * Converts a fill to another type, carrying its colours across. Returns
 * null only for "image" without an asset (an image fill needs a picture).
 */
export function convertFill(fill: Fill, to: FillType, ctx: ConvertContext = {}): Fill | null {
  if (fill.type === to) return fill;
  switch (to) {
    case 'solid':
      return { type: 'solid', color: fillColors(fill)[0] ?? hex(ctx.palette?.[0] ?? '#FFFFFF') };
    case 'linear':
      return { type: 'linear', angle: 180, stops: stopsFrom(fill, ctx) };
    case 'radial':
      return { type: 'radial', cx: 0.5, cy: 0.5, radius: 0.75, stops: stopsFrom(fill, ctx) };
    case 'mesh': {
      const colors = fillColors(fill);
      const base = colors[0] ?? hex(ctx.palette?.[0] ?? '#0E0B1C');
      const blobs = colors.slice(1, MESH_SPOTS.length + 1);
      while (blobs.length < 2) {
        const extra = distinctFrom([base, ...blobs], [...(ctx.palette ?? []), ...FALLBACK_COLORS]);
        blobs.push(hex(extra ?? shadeOf(base)));
      }
      return {
        type: 'mesh',
        base,
        points: blobs.map((color, i) => ({ ...MESH_SPOTS[i % MESH_SPOTS.length], color, radius: 0.55 })),
      };
    }
    case 'image':
      return ctx.assetId ? { type: 'image', assetId: ctx.assetId, fit: 'cover', opacity: 1, blur: 0, tint: null } : null;
  }
}

/* Mesh points ------------------------------------------------------------- */

/**
 * Adds a mesh point where it is most useful: the free grid spot farthest
 * from existing points, in a palette colour not used yet. Deterministic.
 */
export function addMeshPoint(fill: MeshFill, palette: readonly string[] = []): MeshPoint[] {
  if (fill.points.length >= MAX_MESH_POINTS) return [...fill.points];
  let best: { x: number; y: number } = MESH_SPOTS[0];
  if (fill.points.length > 0) {
    let bestDist = -1;
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const c = { x: 0.1 + gx * 0.2, y: 0.1 + gy * 0.2 };
        const d = Math.min(...fill.points.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
        // Strictly greater keeps the first (top-left most) spot on ties: deterministic.
        if (d > bestDist + 1e-9) {
          bestDist = d;
          best = c;
        }
      }
    }
  }
  const used = [fill.base, ...fill.points.map((p) => p.color)];
  const color = hex(distinctFrom(used, [...palette, ...FALLBACK_COLORS]) ?? shadeOf(fill.points[fill.points.length - 1]?.color ?? fill.base));
  return [...fill.points, { x: round3(best.x), y: round3(best.y), color, radius: 0.5 }];
}

export function removeMeshPoint(points: readonly MeshPoint[], index: number): MeshPoint[] {
  if (index < 0 || index >= points.length) return [...points];
  return points.filter((_, i) => i !== index);
}

/** Updates one point; positions are clamped to 0..1 and the radius to 0.02..1.5. */
export function updateMeshPoint(points: readonly MeshPoint[], index: number, patch: Partial<MeshPoint>): MeshPoint[] {
  if (index < 0 || index >= points.length) return [...points];
  return points.map((p, i) => {
    if (i !== index) return p;
    const next = { ...p, ...patch };
    return {
      x: round3(clamp01(next.x)),
      y: round3(clamp01(next.y)),
      radius: round3(Math.min(1.5, Math.max(0.02, Number.isFinite(next.radius) ? next.radius : p.radius))),
      color: normalizeHex(next.color) ?? p.color,
    };
  });
}

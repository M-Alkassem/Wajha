/**
 * Colour recipes for frame finishes. Every tone is derived from the single
 * body colour the user picks, so graphite, silver, titanium, gold, white,
 * black and pastel clays all get believable highlights and shades.
 */
import type { FrameFinish, FrameStyle } from '../../model/types';
import { darken, lighten, luminance, mix, parseColor, toHex } from '../color';

/** Colour at an offset 0..1. */
export type Stops = ReadonlyArray<readonly [number, string]>;

export interface FramePaint {
  finish: FrameFinish;
  /** Body colour as "#rrggbb". */
  base: string;
  bezel: string;
  /** True when the bezel is drawn in the body colour (clay mockup look). */
  bezelMatchesBody: boolean;
  /** Profile across a band, 0 = outer edge .. 1 = inner edge next to the glass. */
  band: Stops;
  /** Semi-transparent overlay along the body (environment reflection), top-left to bottom-right. */
  sheen: Stops | null;
  /** Hardware buttons: outer (shadowed) edge and lit face. */
  buttonEdge: string;
  buttonFace: string;
  /** Dark luminance class decides whether glints read as light-on-dark. */
  isDarkBody: boolean;
}

export const BLACK_BEZEL = '#050507';

const FINISHES: readonly FrameFinish[] = ['metal', 'matte', 'clay'];

/** Linear interpolation inside a stop list (stops must be sorted by offset). */
export function sampleStops(stops: Stops, t: number): string {
  if (stops.length === 0) return '#000000';
  const k = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  if (k <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [o1, c1] = stops[i];
    if (k <= o1) {
      const [o0, c0] = stops[i - 1];
      return mix(c0, c1, o1 > o0 ? (k - o0) / (o1 - o0) : 1);
    }
  }
  return stops[stops.length - 1][1];
}

/** Opaque "#rrggbb" for any input, so alpha in the body colour never leaks into the artwork. */
function opaque(color: string): string {
  const c = parseColor(color);
  return toHex({ ...c, a: 1 }, false);
}

function metalBand(base: string, L: number): Stops {
  // Light metals read through darker edges, dark metals through bright glints.
  const light = L > 0.5;
  const mid = L > 0.15;
  const edge = darken(base, light ? 0.34 : mid ? 0.46 : 0.42);
  const glint = lighten(base, light ? 0.85 : mid ? 0.62 : 0.4);
  const shade = darken(base, light ? 0.14 : 0.3);
  const inner = darken(base, light ? 0.5 : 0.62);
  return [
    [0, edge],
    [0.12, mix(edge, base, 0.6)],
    [0.27, glint],
    [0.4, mix(glint, base, 0.6)],
    [0.62, base],
    [0.84, shade],
    [1, inner],
  ];
}

function metalSheen(L: number): Stops {
  const k = L > 0.5 ? 0.8 : 1;
  const w = (a: number) => `rgba(255, 255, 255, ${+(a * k).toFixed(3)})`;
  const b = (a: number) => `rgba(0, 0, 0, ${+(a * (L > 0.5 ? 1.2 : 1)).toFixed(3)})`;
  return [
    [0, w(0.3)],
    [0.1, w(0.06)],
    [0.28, b(0.1)],
    [0.47, w(0.16)],
    [0.55, w(0.02)],
    [0.72, b(0.08)],
    [0.88, w(0.08)],
    [1, b(0.22)],
  ];
}

/** Resolves a frame style into concrete paint. Unknown finishes fall back to metal, unknown colours to black. */
export function framePaint(style: FrameStyle): FramePaint {
  // Styles come from user files; tolerate a missing object or fields rather than throwing mid-render.
  const s: Partial<FrameStyle> = style ?? {};
  const finish: FrameFinish = s.finish && FINISHES.includes(s.finish) ? s.finish : 'metal';
  const base = opaque(typeof s.color === 'string' ? s.color : '#000000');
  const L = luminance(base);
  const matchBezel = s.bezel === 'match';
  const bezel = matchBezel ? base : BLACK_BEZEL;
  const isDarkBody = L < 0.18;

  if (finish === 'metal') {
    const band = metalBand(base, L);
    return {
      finish,
      base,
      bezel,
      bezelMatchesBody: matchBezel,
      band,
      sheen: metalSheen(L),
      buttonEdge: darken(base, L > 0.5 ? 0.32 : 0.45),
      buttonFace: sampleStops(band, 0.3),
      isDarkBody,
    };
  }
  if (finish === 'matte') {
    const edge = darken(base, L > 0.5 ? 0.16 : 0.3);
    return {
      finish,
      base,
      bezel,
      bezelMatchesBody: matchBezel,
      band: [
        [0, edge],
        [0.2, base],
        [0.8, base],
        [1, darken(base, L > 0.5 ? 0.2 : 0.38)],
      ],
      sheen: [
        [0, 'rgba(255, 255, 255, 0.10)'],
        [0.5, 'rgba(255, 255, 255, 0)'],
        [1, 'rgba(0, 0, 0, 0.10)'],
      ],
      buttonEdge: edge,
      buttonFace: base,
      isDarkBody,
    };
  }
  // Clay: a soft solid object, defined only by a whisper of edge shading.
  return {
    finish,
    base,
    bezel,
    bezelMatchesBody: matchBezel,
    band: [
      [0, darken(base, 0.08)],
      [0.3, base],
      [1, base],
    ],
    sheen: null,
    buttonEdge: darken(base, 0.1),
    buttonFace: base,
    isDarkBody,
  };
}

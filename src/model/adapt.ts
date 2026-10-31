/**
 * Converts a layout designed for one canvas shape into another (for example
 * an iPhone layout into an iPad or Mac layout). Pure function, no canvas.
 * Owned by the model/store work package.
 *
 * Three arrangements, chosen by canvas shape:
 *  - relative (portrait <-> portrait, wide <-> wide): positions stay
 *    relative and lengths scale with u. Copy keeps its internal spacing in u
 *    (font sizes are in u, so lines never collide) and devices re-fit into
 *    the space between the copy and the canvas edges.
 *  - to wide (portrait -> Mac / feature graphic, with a device): the copy
 *    becomes a centered column on the left half, the devices move to the
 *    right half.
 *  - from wide (with a device): the copy stacks at the top, devices below.
 * Shapes and images keep their relative position and u size, except in the
 * last two arrangements: decorations centred on the devices (a ring, disc
 * or glow behind a phone) move and scale with them and stay clear of the
 * copy, so they never end up across the text.
 *
 * Device heights are estimates (see geometry.ts). A device that was fully
 * visible stays fully visible with ~6 % margins; one that bled off the bottom
 * keeps the same share of itself hidden below the edge.
 */
import { FAMILIES } from './catalog';
import { deepClone } from './clone';
import { canvasMetrics, deviceHeightFactor, familyForCanvas, isFamilyDefaultFrame, type CanvasMetrics } from './geometry';
import { RANGES, clampToRange, type Range } from './rules';
import type { DeviceElement, FamilyId, SlideElement, SlideLayout, TextElement } from './types';

export interface CanvasShape {
  width: number;
  height: number;
}

/** Free space kept around fitted devices, fraction of the canvas. */
const MARGIN = 0.06;
/** Text boxes never get wider than this fraction of the canvas width. */
export const TEXT_MAX_WIDTH = 0.92;
/** Tolerance for "touches the edge" tests, fraction of the canvas. */
const EPS = 0.002;
/** Texts closer than this (u) belong to one copy group. */
const JOIN_GAP_U = 0.15;
/** Copy closer to an edge than NEAR_EDGE_U (u) keeps its u margin; beyond FAR_EDGE_U its relative position. */
const NEAR_EDGE_U = 0.15;
const FAR_EDGE_U = 0.3;
/** Gap between stacked copy groups (u). */
const STACK_GAP_U = 0.05;
/** Device scale limits relative to the u-scaled size. */
const K_MIN = 0.15;
const K_MAX = 3;
/** A decoration belongs to the device group when its centre lies in the group's box grown by this share of its size. */
const GROUP_REACH = 0.1;
/** Decorations wider or taller than this many canvas sides are backdrops (dunes, swells) and never move with devices. */
const BACKDROP = 1.5;
/** Clear space kept between the copy and the decorations that moved with the devices (u). */
const DECOR_GAP_U = 0.03;
/** Those decorations shrink towards the devices to clear the copy, but never below this share. */
const DECOR_MIN_SCALE = 0.5;
/** Shapes blurred by at least this share of their size are soft light, which may sit behind text. */
const SOFT_BLUR = 0.1;
/** The side-by-side copy column keeps at least this share of the canvas height when it avoids edge decorations. */
const MIN_COPY_BAND = 0.4;
/** A decoration belongs to a copy group when it sits within this distance (u) of the group's box. */
const COPY_REACH_U = 0.06;

const WIDE_COPY = { x: 0.28, w: 0.44 };
const WIDE_DEVICES = { x: 0.74, w: 0.42, bleedTop: 0.12 };
const TALL_COPY = { top: 0.11, w: 0.86, gap: 0.07 };

interface Ctx {
  F: CanvasMetrics;
  T: CanvasMetrics;
  /** Default screen aspect of the source and target families. */
  srcAspect: number;
  dstAspect: number;
}

/** Device region for the side-by-side and stacked arrangements, fractions of the canvas. */
interface DeviceRegion {
  cx: number;
  maxW: number;
  top: number;
  bottom: number;
  /** Where a bleeding device group starts. */
  bleedTop: number;
}

/** Copy group shift, fractions of the canvas height. */
interface GroupShift {
  srcTop: number;
  srcBottom: number;
  dstTop: number;
  dstBottom: number;
}

interface TextGroup {
  members: number[];
  /** Estimated extents in u from the top of the source canvas. */
  top: number;
  bottom: number;
}

/** An axis-aligned box in u. */
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * How placeDeviceGroup moved the devices, so decorations can follow: the
 * group's box before (source u, source frames) and after (target u, target
 * frames), and the scale applied to the devices.
 */
interface GroupMove {
  from: Box;
  to: Box;
  scale: number;
}

/** How relative() moved one copy group: its source box (u), its centre before and after (u), its vertical map (u -> u) and scale. */
interface CopyMove {
  box: Box;
  fromX: number;
  toX: number;
  y(u: number): number;
  scale: number;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Like clamp, but centers when the interval is empty. */
const clampInto = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));

function isElementLike(e: unknown): e is SlideElement {
  return typeof e === 'object' && e !== null && typeof (e as { kind?: unknown }).kind === 'string';
}

export function adaptLayout(layout: SlideLayout, from: CanvasShape, to: CanvasShape, toFamily: FamilyId): SlideLayout {
  const fam = FAMILIES[toFamily] ?? FAMILIES.iphone;
  const F = canvasMetrics(from);
  const T = canvasMetrics(to);
  const c: Ctx = { F, T, srcAspect: FAMILIES[familyForCanvas(F)].screenAspect, dstAspect: fam.screenAspect };

  const src: SlideElement[] = Array.isArray(layout?.elements) ? layout.elements.filter(isElementLike) : [];
  const out: SlideElement[] = src.map((el) => deepClone(el));
  for (const el of out) {
    if (el.kind === 'device' && isFamilyDefaultFrame(el.frame)) el.frame = fam.defaultFrame;
  }

  const hasDevice = src.some((e) => e.kind === 'device');
  if (hasDevice && !F.wide && T.wide) toWide(src, out, c);
  else if (hasDevice && F.wide && !T.wide) fromWide(src, out, c);
  else relative(src, out, c);

  const maxTextW = TEXT_MAX_WIDTH * T.wu;
  for (const el of out) if (el.kind === 'text') capTextWidth(el, maxTextW);

  return {
    background: layout?.background ? deepClone(layout.background) : null,
    elements: out.map(finalize),
  };
}

/* Estimates --------------------------------------------------------- */

/** Text block extents in u, assuming two lines (one when maxLines is 1). */
function textExtent(el: TextElement, M: CanvasMetrics): { top: number; bottom: number } {
  const size = num(el.style?.size, 0.05);
  const lineHeight = num(el.style?.lineHeight, 1.2);
  const lines = num(el.style?.maxLines, 0) === 1 ? 1 : 2;
  const h = Math.max(0, lines * size * lineHeight);
  const y = num(el.y, 0.5) * M.hu;
  const top = el.valign === 'middle' ? y - h / 2 : el.valign === 'bottom' ? y - h : y;
  return { top, bottom: top + h };
}

/** Bounding box (u) of a device `w` u wide, rotated by `rotation` degrees. */
function deviceBox(w: number, factor: number, rotation: number): { bw: number; bh: number } {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const h = w * factor;
  return { bw: w * cos + h * sin, bh: w * sin + h * cos };
}

/** Texts sorted top to bottom and merged into groups of nearby lines. */
function clusterTexts(src: SlideElement[], idx: number[], F: CanvasMetrics): TextGroup[] {
  const items = idx
    .map((i) => ({ i, ...textExtent(src[i] as TextElement, F) }))
    .sort((a, b) => a.top - b.top || a.i - b.i);
  const groups: TextGroup[] = [];
  for (const it of items) {
    const g = groups.length ? groups[groups.length - 1] : undefined;
    if (g && it.top <= g.bottom + JOIN_GAP_U) {
      g.members.push(it.i);
      g.bottom = Math.max(g.bottom, it.bottom);
    } else {
      groups.push({ members: [it.i], top: it.top, bottom: it.bottom });
    }
  }
  return groups;
}

const indicesOf = (src: SlideElement[], kind: SlideElement['kind']) =>
  src.reduce<number[]>((acc, e, i) => (e.kind === kind ? (acc.push(i), acc) : acc), []);

/** True when a device's outline keeps roughly its proportions through the adaptation (its frame may change). */
function keepsShape(s: DeviceElement, o: DeviceElement, c: Ctx): boolean {
  const ratio = deviceHeightFactor(o.frame, c.dstAspect) / deviceHeightFactor(s.frame, c.srcAspect);
  return ratio > 0.6 && ratio < 1.6;
}

/* Relative arrangement --------------------------------------------- */

function relative(src: SlideElement[], out: SlideElement[], c: Ctx): void {
  const { F, T } = c;
  const textIdx = indicesOf(src, 'text');
  const shifts: GroupShift[] = [];
  const copyMoves: CopyMove[] = [];
  // Wide canvases measure u by their height, so a copy column keeps its share
  // of the canvas width (and its type scales with it) between Mac and banner.
  // It grows by a fifth at most: on a very wide, short canvas (an iPhone on its
  // side) taller copy would run into whatever rises from the bottom edge.
  const scale = F.wide && T.wide ? clamp(T.wu / F.wu, 0.5, 1.2) : 1;
  // Text-only slides switching between portrait and wide: re-center the copy.
  const recenter = F.wide !== T.wide;

  for (const g of clusterTexts(src, textIdx, F)) {
    const center = (g.top + g.bottom) / 2;
    const rel = center / F.hu;
    // Copy near an edge stays pinned to that edge and grows away from it.
    let anchorSrc: number;
    let anchorDst: number;
    if (rel < 0.4) {
      anchorSrc = g.top;
      anchorDst = edgeDistance(g.top, F, T, scale);
    } else if (rel > 0.6) {
      anchorSrc = g.bottom;
      anchorDst = T.hu - edgeDistance(F.hu - g.bottom, F, T, scale);
    } else {
      anchorSrc = center;
      anchorDst = (center / F.hu) * T.hu;
    }
    const map = (u: number) => anchorDst + (u - anchorSrc) * scale;
    let shift = 0;
    const top = map(g.top);
    const bottom = map(g.bottom);
    if (g.top >= -EPS * F.hu && g.bottom <= F.hu * (1 + EPS)) {
      const lo = 0.02 * T.hu;
      const hi = 0.98 * T.hu;
      if (bottom - top > hi - lo) shift = (lo + hi) / 2 - (top + bottom) / 2;
      else if (top < lo) shift = lo - top;
      else if (bottom > hi) shift = hi - bottom;
    }

    let left = Infinity;
    let right = -Infinity;
    for (const i of g.members) {
      const s = src[i] as TextElement;
      const w = Math.max(0, num(s.width, 0.8));
      left = Math.min(left, num(s.x, 0.5) * F.wu - w / 2);
      right = Math.max(right, num(s.x, 0.5) * F.wu + w / 2);
    }
    const groupCenter = (left + right) / 2;

    let placedLeft = Infinity;
    let placedRight = -Infinity;
    for (const i of g.members) {
      const s = src[i] as TextElement;
      const o = out[i] as TextElement;
      o.y = (map(num(s.y, 0.5) * F.hu) + shift) / T.hu;
      o.width = num(s.width, 0.8) * scale;
      if (o.style) o.style.size = num(s.style?.size, 0.05) * scale;
      const xU = recenter ? T.wu / 2 + (num(s.x, 0.5) * F.wu - groupCenter) * scale : num(s.x, 0.5) * T.wu;
      placeTextX(s, o, c, xU);
      placedLeft = Math.min(placedLeft, o.x * T.wu - o.width / 2);
      placedRight = Math.max(placedRight, o.x * T.wu + o.width / 2);
    }
    shifts.push({ srcTop: g.top / F.hu, srcBottom: g.bottom / F.hu, dstTop: (top + shift) / T.hu, dstBottom: (bottom + shift) / T.hu });
    copyMoves.push({ box: { left, right, top: g.top, bottom: g.bottom }, fromX: groupCenter, toX: (placedLeft + placedRight) / 2, y: (u) => map(u) + shift, scale });
  }

  const deviceIdx = indicesOf(src, 'device');
  for (const i of deviceIdx) fitDevice(src[i] as DeviceElement, out[i] as DeviceElement, c, shifts);
  // Decorations around the devices follow them as they re-fit, between portrait canvases and
  // between wide ones whose devices keep their shape (a laptop that becomes a TV, a Vision Pro
  // window or a phone on its side). A laptop that becomes an upright phone keeps its
  // decorations in place instead: they would not fit around it.
  const withDevices = new Set<number>();
  const follow = !F.wide && !T.wide ? true : F.wide && T.wide && deviceIdx.every((i) => keepsShape(src[i] as DeviceElement, out[i] as DeviceElement, c));
  if (deviceIdx.length && follow) {
    const { box: from } = sourceDevices(src, deviceIdx, c);
    const decor = groupDecor(src, from, c);
    for (const i of decor) withDevices.add(i);
    moveDecor(src, out, decor, fittedMove(src, out, deviceIdx, from, c), copyBox(out, textIdx, T), c, copyBox(src, textIdx, F));
  }
  moveCopyDecor(src, out, copyMoves, withDevices, c);
}

/**
 * Decorations that belong to a copy group: small enough to sit around it
 * and centred on its box grown by COPY_REACH, like a rule under an eyebrow,
 * an emblem above a headline or a panel behind the text. They move (and
 * scale) with their group, so they keep their place in the copy when it
 * keeps its distance to an edge on a canvas of another height.
 */
function moveCopyDecor(src: SlideElement[], out: SlideElement[], moves: CopyMove[], skip: ReadonlySet<number>, c: Ctx): void {
  if (!moves.length) return;
  const { F, T } = c;
  src.forEach((el, i) => {
    if ((el.kind !== 'shape' && el.kind !== 'image') || skip.has(i)) return;
    const size = decorExtent(el);
    const x = num(el.x, 0.5) * F.wu;
    const y = num(el.y, 0.5) * F.hu;
    const move = moves.find(({ box: b }) => {
      const w = b.right - b.left;
      const h = b.bottom - b.top;
      return size.w <= w + 2 * COPY_REACH_U && size.h <= h + 2 * COPY_REACH_U && x > b.left - COPY_REACH_U && x < b.right + COPY_REACH_U && y > b.top - COPY_REACH_U && y < b.bottom + COPY_REACH_U;
    });
    if (!move) return;
    const o = out[i];
    o.x = (move.toX + (x - move.fromX) * move.scale) / T.wu;
    o.y = move.y(y) / T.hu;
    if (move.scale === 1) return;
    if (o.kind === 'shape') {
      o.width = num(o.width, 0.4) * move.scale;
      o.height = num(o.height, 0.4) * move.scale;
      o.stroke = num(o.stroke, 0) * move.scale;
      o.blur = num(o.blur, 0) * move.scale;
    } else if (o.kind === 'image') {
      o.width = num(o.width, 0.4) * move.scale;
    }
  });
}

/** The move of devices fitted one by one (fitDevice): their box before and after, and their overall scale. */
function fittedMove(src: SlideElement[], out: SlideElement[], idx: number[], from: Box, c: Ctx): GroupMove {
  const { T } = c;
  const to: Box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  let before = 0;
  let after = 0;
  for (const i of idx) {
    const o = out[i] as DeviceElement;
    const w = num(o.width, 0.6);
    const b = deviceBox(w, deviceHeightFactor(o.frame, c.dstAspect), num(o.rotation, 0));
    const x = num(o.x, 0.5) * T.wu;
    const y = num(o.y, 0.5) * T.hu;
    to.left = Math.min(to.left, x - b.bw / 2);
    to.right = Math.max(to.right, x + b.bw / 2);
    to.top = Math.min(to.top, y - b.bh / 2);
    to.bottom = Math.max(to.bottom, y + b.bh / 2);
    before += Math.max(RANGES.deviceWidth.min, num((src[i] as DeviceElement).width, 0.6));
    after += w;
  }
  return { from, to, scale: after / Math.max(1e-6, before) };
}

/**
 * Target distance (u) between copy and the canvas edge it is pinned to. A
 * small margin is typographic and kept in u (it scales with the type); copy
 * further in keeps its relative position. Between the two the rules blend,
 * so nothing jumps and a round trip lands where it started.
 */
function edgeDistance(distU: number, F: CanvasMetrics, T: CanvasMetrics, scale: number): number {
  const relative = (distU / F.hu) * T.hu;
  if (distU < 0) return relative;
  const w = clamp((distU - NEAR_EDGE_U) / (FAR_EDGE_U - NEAR_EDGE_U), 0, 1);
  return (1 - w) * distU * scale + w * relative;
}

/** Shrinks a too-wide text box (and its font, so line breaks stay the same). */
function capTextWidth(o: TextElement, maxW: number): void {
  const w = num(o.width, 0.8);
  if (w <= maxW) return;
  o.width = maxW;
  if (o.style) o.style.size = num(o.style.size, 0.05) * (maxW / w);
}

/** Sets x from `xU` (u); a text box that was inside the source canvas stays inside. */
function placeTextX(s: TextElement, o: TextElement, c: Ctx, xU: number): void {
  const { F, T } = c;
  capTextWidth(o, TEXT_MAX_WIDTH * T.wu);
  const x = num(s.x, 0.5);
  const w = num(s.width, 0.8);
  const inside = x * F.wu - w / 2 >= -EPS * F.wu && x * F.wu + w / 2 <= F.wu * (1 + EPS);
  const half = num(o.width, w) / 2;
  o.x = (inside ? clampInto(xU, half, T.wu - half) : xU) / T.wu;
}

/** Margin kept on one side: the source's own margin up to MARGIN; MARGIN where it bled. */
const sideMargin = (free: number) => (free < -EPS ? MARGIN : Math.min(MARGIN, Math.max(0, free)));

/**
 * Re-fits one device. Fully visible devices fill the band they occupied
 * (between the copy above and below them, keeping the gap to the copy in u),
 * keep their relative width when the frame shape changes, and never leave
 * the canvas. Bleeding devices keep their top edge (relative to the copy)
 * and the hidden share of their height. A device that turns from portrait
 * into landscape (phone -> laptop) or back cannot keep its bleed and is
 * fitted fully visible instead.
 */
function fitDevice(s: DeviceElement, o: DeviceElement, c: Ctx, groups: GroupShift[]): void {
  const { F, T } = c;
  const rot = num(s.rotation, 0);
  const wF = Math.max(RANGES.deviceWidth.min, num(s.width, 0.6));
  const fF = deviceHeightFactor(s.frame, c.srcAspect);
  const fT = deviceHeightFactor(o.frame, c.dstAspect);
  const sb = deviceBox(wF, fF, rot);
  const cx = num(s.x, 0.5);
  const cy = num(s.y, 0.5);
  const topF = cy - sb.bh / (2 * F.hu);
  const bottomF = cy + sb.bh / (2 * F.hu);
  const leftF = cx - sb.bw / (2 * F.wu);
  const rightF = cx + sb.bw / (2 * F.wu);
  const shapeChange = fF >= 1 !== fT >= 1;
  const bleedT = !shapeChange && topF < -EPS;
  const bleedB = !shapeChange && bottomF > 1 + EPS;
  const fitsW = leftF >= -EPS && rightF <= 1 + EPS;
  const srcH = Math.max(1e-6, bottomF - topF);
  const srcW = sb.bw / F.wu;

  let above: GroupShift | null = null;
  let below: GroupShift | null = null;
  for (const g of groups) {
    if (g.srcBottom <= topF + 0.02 && (!above || g.srcBottom > above.srcBottom)) above = g;
    if (g.srcTop >= bottomF - 0.02 && (!below || g.srcTop < below.srcTop)) below = g;
  }
  // Where the copy now ends, plus the original gap measured in u.
  const topLimit = above ? above.dstBottom + ((topF - above.srcBottom) * F.hu) / T.hu : null;
  const bottomLimit = below ? below.dstTop - ((below.srcTop - bottomF) * F.hu) / T.hu : null;

  const tb = deviceBox(wF, fT, rot);
  const bh1 = Math.max(1e-6, tb.bh / T.hu);
  const bw1 = Math.max(1e-6, tb.bw / T.wu);

  let kV: number;
  let placeY: (bh: number) => number;
  let band: { lo: number; hi: number } | null = null;

  if (!bleedT && !bleedB) {
    const mTop = sideMargin(topF);
    const mBot = sideMargin(1 - bottomF);
    let availTop = topLimit !== null ? Math.max(mTop, topLimit) : mTop;
    let availBottom = bottomLimit !== null ? Math.min(1 - mBot, bottomLimit) : 1 - mBot;
    if (availBottom - availTop < 0.08) {
      // The copy now covers the device's space: use the canvas, overlap beats vanishing.
      availTop = MARGIN;
      availBottom = 1 - MARGIN;
    }
    let bandTop = Math.max(availTop, topLimit ?? topF);
    let bandBottom = Math.min(availBottom, bottomLimit ?? bottomF);
    if (bandBottom - bandTop < 0.08) {
      bandTop = availTop;
      bandBottom = availBottom;
    }
    const kFill = (bandBottom - bandTop) / bh1;
    const kAvail = (availBottom - availTop) / bh1;
    // A laptop turning into a phone would shrink to a sliver if it only kept its height.
    const kKeepWidth = srcW / bw1;
    kV = Math.min(kAvail, Math.max(kFill, kKeepWidth));
    const mid = (bandTop + bandBottom) / 2;
    placeY = () => mid;
    band = { lo: availTop, hi: availBottom };
  } else if (bleedB && !bleedT) {
    const hidden = clamp((bottomF - 1) / srcH, 0, 0.75);
    const top = clamp(topLimit ?? topF, 0, 0.75);
    kV = (1 - top) / (1 - hidden) / bh1;
    // The bottom edge sits below the canvas by the same share of the device.
    placeY = (bh) => 1 + hidden * bh - bh / 2;
  } else if (bleedT && !bleedB) {
    const hidden = clamp(-topF / srcH, 0, 0.75);
    const bottom = clamp(bottomLimit ?? bottomF, 0.25, 1);
    kV = bottom / (1 - hidden) / bh1;
    placeY = (bh) => -hidden * bh + bh / 2;
  } else {
    kV = srcH / bh1;
    placeY = () => cy;
  }

  let kH = Infinity;
  let mL = 0;
  let mR = 0;
  if (fitsW) {
    mL = sideMargin(leftF);
    mR = sideMargin(1 - rightF);
    let maxW = 1 - mL - mR;
    if (T.wide && Math.abs(cx - 0.5) > 0.1) {
      // Side-by-side layouts: a device on one side stays on its side of the copy.
      maxW = Math.min(maxW, Math.max(srcW, 2 * (Math.abs(cx - 0.5) - 0.02)));
    }
    kH = maxW / bw1;
  }

  const k = clamp(Math.min(kV, kH), K_MIN, K_MAX);
  const w = clampToRange(wF * k, RANGES.deviceWidth);
  const b = deviceBox(w, fT, rot);
  const bh = b.bh / T.hu;
  const bw = b.bw / T.wu;
  let y = placeY(bh);
  if (band) y = clampInto(y, band.lo + bh / 2, band.hi - bh / 2);
  const x = fitsW ? clampInto(cx, mL + bw / 2, 1 - mR - bw / 2) : cx;
  o.width = w;
  o.x = x;
  o.y = y;
}

/* Side-by-side and stacked arrangements ----------------------------- */

interface StackOptions {
  /** Column center and maximum width, u. */
  cx: number;
  maxW: number;
  /** Maximum block height, u. */
  maxH: number;
  /** Largest allowed scale-up. */
  grow: number;
  /** Block top (u); when absent the block is centered vertically. */
  top?: number;
  centerAlign: boolean;
}

/**
 * Stacks the copy groups into one column: each group keeps its internal
 * spacing, groups sit STACK_GAP_U apart, everything scales uniformly so the
 * widest box fits the column. Returns the block's top and bottom in u.
 */
function stackCopy(src: SlideElement[], out: SlideElement[], idx: number[], c: Ctx, o: StackOptions): { top: number; bottom: number } {
  const { F, T } = c;
  const groups = clusterTexts(src, idx, F);
  const offsets = new Map<number, number>();
  let cursor = 0;
  let left = Infinity;
  let right = -Infinity;
  let widest = 0;
  for (const g of groups) {
    for (const i of g.members) {
      const s = src[i] as TextElement;
      offsets.set(i, cursor + (num(s.y, 0.5) * F.hu - g.top));
      const w = Math.max(0, num(s.width, 0.8));
      const xu = num(s.x, 0.5) * F.wu;
      left = Math.min(left, xu - w / 2);
      right = Math.max(right, xu + w / 2);
      widest = Math.max(widest, w);
    }
    cursor += g.bottom - g.top + STACK_GAP_U;
  }
  const height = Math.max(1e-6, cursor - STACK_GAP_U);
  const scale = clamp(Math.min(o.grow, o.maxW / Math.max(1e-6, widest), o.maxH / height), 0.3, 1.5);
  const top = o.top ?? T.hu / 2 - (height * scale) / 2;
  const centerX = Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : F.wu / 2;
  for (const i of idx) {
    const s = src[i] as TextElement;
    const t = out[i] as TextElement;
    const width = Math.max(0, num(s.width, 0.8)) * scale;
    const xu = o.cx + (num(s.x, 0.5) * F.wu - centerX) * scale;
    t.width = width;
    t.x = clampInto(xu, width / 2 + 0.02 * T.wu, T.wu - width / 2 - 0.02 * T.wu) / T.wu;
    t.y = (top + (offsets.get(i) ?? 0) * scale) / T.hu;
    if (t.style) {
      t.style.size = num(s.style?.size, 0.05) * scale;
      if (o.centerAlign) t.style.align = 'center';
    }
  }
  return { top, bottom: top + height * scale };
}

/** Width, rotation and centre (source u) of each device, plus the group's box (source frames). */
function sourceDevices(src: SlideElement[], idx: number[], c: Ctx): { items: { i: number; w: number; rot: number; cx: number; cy: number }[]; box: Box } {
  const { F } = c;
  const box: Box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  const items = idx.map((i) => {
    const s = src[i] as DeviceElement;
    const w = Math.max(RANGES.deviceWidth.min, num(s.width, 0.6));
    const rot = num(s.rotation, 0);
    const b = deviceBox(w, deviceHeightFactor(s.frame, c.srcAspect), rot);
    const cx = num(s.x, 0.5) * F.wu;
    const cy = num(s.y, 0.5) * F.hu;
    box.left = Math.min(box.left, cx - b.bw / 2);
    box.right = Math.max(box.right, cx + b.bw / 2);
    box.top = Math.min(box.top, cy - b.bh / 2);
    box.bottom = Math.max(box.bottom, cy + b.bh / 2);
    return { i, w, rot, cx, cy };
  });
  return { items, box };
}

/**
 * Moves all devices as one group into `r`, keeping their relative offsets.
 * A group that bled off the bottom keeps bleeding by the same share, unless
 * the region is too narrow for that (laptops on a wide canvas), where a
 * bottom-anchored device would leave the upper half empty: it is centered.
 * Returns how the group moved, or null without devices.
 */
function placeDeviceGroup(src: SlideElement[], out: SlideElement[], idx: number[], c: Ctx, r: DeviceRegion): GroupMove | null {
  if (!idx.length) return null;
  const { F, T } = c;
  const { items, box } = sourceDevices(src, idx, c);
  const { left: sl, right: sr, top: st, bottom: sbm } = box;
  const gcx = (sl + sr) / 2;
  const gcy = (st + sbm) / 2;
  const bleedB = sbm > F.hu * (1 + EPS);
  const bleedT = st < -EPS * F.hu;

  let tl = Infinity;
  let tr = -Infinity;
  let tt = Infinity;
  let tbm = -Infinity;
  for (const it of items) {
    const b = deviceBox(it.w, deviceHeightFactor((out[it.i] as DeviceElement).frame, c.dstAspect), it.rot);
    const dx = it.cx - gcx;
    const dy = it.cy - gcy;
    tl = Math.min(tl, dx - b.bw / 2);
    tr = Math.max(tr, dx + b.bw / 2);
    tt = Math.min(tt, dy - b.bh / 2);
    tbm = Math.max(tbm, dy + b.bh / 2);
  }
  const GW = Math.max(1e-6, tr - tl);
  const GH = Math.max(1e-6, tbm - tt);
  const ocx = (tl + tr) / 2;
  const ocy = (tt + tbm) / 2;

  const gW = (r.maxW * T.wu) / GW;
  const regionH = Math.max(1e-6, (r.bottom - r.top) * T.hu);
  let g = Math.min(gW, regionH / GH);
  let cyU = ((r.top + r.bottom) / 2) * T.hu;
  if (bleedB && !bleedT) {
    const hidden = clamp((sbm - F.hu) / Math.max(1e-6, sbm - st), 0.02, 0.6);
    const topU = r.bleedTop * T.hu;
    const gV = (T.hu - topU) / (1 - hidden) / GH;
    const gb = Math.min(gV, gW);
    const gh = GH * gb;
    const groupTop = T.hu + hidden * gh - gh;
    if (!(gW < gV && groupTop > ((r.top + r.bottom) / 2) * T.hu)) {
      g = gb;
      cyU = groupTop + gh / 2;
    }
  }
  g = clamp(g, K_MIN, K_MAX);
  const cxU = r.cx * T.wu;
  for (const it of items) {
    const o = out[it.i] as DeviceElement;
    o.width = clampToRange(it.w * g, RANGES.deviceWidth);
    o.x = (cxU + (it.cx - gcx - ocx) * g) / T.wu;
    o.y = (cyU + (it.cy - gcy - ocy) * g) / T.hu;
  }
  const to = { left: cxU - (GW * g) / 2, right: cxU + (GW * g) / 2, top: cyU - (GH * g) / 2, bottom: cyU + (GH * g) / 2 };
  return { from: box, to, scale: g };
}

/** Painted size (u) of a decoration's bounding box: rotated, plus its blur. Images count as squares (their aspect is unknown here). */
function decorExtent(el: SlideElement): { w: number; h: number } {
  const w = Math.max(0, num((el as { width?: unknown }).width, 0.4));
  const h = el.kind === 'shape' ? Math.max(0, num(el.height, 0.4)) : w;
  const r = (num(el.rotation, 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const blur = el.kind === 'shape' ? 2 * Math.max(0, num(el.blur, 0)) : 0;
  return { w: w * cos + h * sin + blur, h: w * sin + h * cos + blur };
}

/** Soft light (a blurred glow) rather than a drawn shape. */
const isSoft = (el: SlideElement) => el.kind === 'shape' && num(el.blur, 0) >= SOFT_BLUR * Math.min(num(el.width, 0.4), num(el.height, 0.4));

/**
 * Largest k in [0, 1] for which [c + (lo - c) k, c + (hi - c) k] stays clear
 * of [a, b]; 0 when the centre `c` itself lies inside [a, b].
 */
function clearScale(c: number, lo: number, hi: number, a: number, b: number): number {
  if (hi <= a || lo >= b) return 1;
  if (c >= b) return lo < c ? Math.min(1, (c - b) / (c - lo)) : 1;
  if (c <= a) return hi > c ? Math.min(1, (a - c) / (hi - c)) : 1;
  return 0;
}

/** Union of the placed text boxes in target u, or null without texts. */
function copyBox(out: SlideElement[], idx: number[], T: CanvasMetrics): Box | null {
  let box: Box | null = null;
  for (const i of idx) {
    const t = out[i] as TextElement;
    const half = Math.max(0, num(t.width, 0.8)) / 2;
    const x = num(t.x, 0.5) * T.wu;
    const { top, bottom } = textExtent(t, T);
    box = box
      ? { left: Math.min(box.left, x - half), right: Math.max(box.right, x + half), top: Math.min(box.top, top), bottom: Math.max(box.bottom, bottom) }
      : { left: x - half, right: x + half, top, bottom };
  }
  return box;
}

/**
 * Decorations that belong to the device group: centred inside its box grown
 * by GROUP_REACH, within the canvas, like a ring or a disc behind a phone.
 * Backdrops (much larger than the canvas) and decorations elsewhere, such as
 * panorama pieces on the seams, are not.
 */
function groupDecor(src: SlideElement[], group: Box, c: Ctx): number[] {
  const { F } = c;
  const reachX = GROUP_REACH * (group.right - group.left);
  const reachY = GROUP_REACH * (group.bottom - group.top);
  const left = Math.max(0, group.left - reachX);
  const right = Math.min(F.wu, group.right + reachX);
  const top = Math.max(0, group.top - reachY);
  const bottom = Math.min(F.hu, group.bottom + reachY);
  return src.reduce<number[]>((acc, el, i) => {
    if (el.kind !== 'shape' && el.kind !== 'image') return acc;
    const size = decorExtent(el);
    if (size.w > BACKDROP * F.wu || size.h > BACKDROP * F.hu) return acc;
    const x = num(el.x, 0.5) * F.wu;
    const y = num(el.y, 0.5) * F.hu;
    if (x > left && x < right && y > top && y < bottom) acc.push(i);
    return acc;
  }, []);
}

/**
 * Vertical room (u) for the side-by-side copy column: the canvas within its
 * margins, minus drawn decorations that rise from the bottom edge or hang
 * from the top edge across the column (dunes, hills, waves). Decorations
 * that move with the devices do not count. Falls back to the whole canvas
 * when that leaves too little room.
 */
function copyBand(src: SlideElement[], out: SlideElement[], skip: ReadonlySet<number>, c: Ctx): { top: number; bottom: number } {
  const { T } = c;
  const full = { top: MARGIN * T.hu, bottom: (1 - MARGIN) * T.hu };
  const band = { ...full };
  const colLeft = (WIDE_COPY.x - WIDE_COPY.w / 2) * T.wu;
  const colRight = (WIDE_COPY.x + WIDE_COPY.w / 2) * T.wu;
  out.forEach((el, i) => {
    if ((el.kind !== 'shape' && el.kind !== 'image') || skip.has(i) || isSoft(src[i])) return;
    const size = decorExtent(el);
    const x = num(el.x, 0.5) * T.wu;
    const y = num(el.y, 0.5) * T.hu;
    if (x + size.w / 2 <= colLeft || x - size.w / 2 >= colRight) return;
    const top = y - size.h / 2;
    const bottom = y + size.h / 2;
    if (bottom >= T.hu * (1 - EPS) && top > T.hu / 2) band.bottom = Math.min(band.bottom, top - DECOR_GAP_U);
    if (top <= T.hu * EPS && bottom < T.hu / 2) band.top = Math.max(band.top, bottom + DECOR_GAP_U);
  });
  return band.bottom - band.top < MIN_COPY_BAND * T.hu ? full : band;
}

/**
 * Moves the decorations of the device group with it, keeping their place
 * relative to its box (a ring at a phone's corner ends up at the laptop's
 * corner), scaled like the devices. When a drawn one would still reach the
 * copy, all of them shrink towards the devices until it clears (soft glows
 * may light the text and never force that). With `before` (the copy on the
 * source canvas), a decoration that already reached the copy there is left
 * to: the design meant it.
 */
function moveDecor(src: SlideElement[], out: SlideElement[], idx: number[], move: GroupMove, copy: Box | null, c: Ctx, before: Box | null = null): void {
  if (!idx.length) return;
  const { F, T } = c;
  const { from, to } = move;
  const fromX = (from.left + from.right) / 2;
  const fromY = (from.top + from.bottom) / 2;
  const toX = (to.left + to.right) / 2;
  const toY = (to.top + to.bottom) / 2;
  // Box to box, per axis: frames may change shape (phone -> laptop).
  const sx = (to.right - to.left) / Math.max(1e-6, from.right - from.left);
  const sy = (to.bottom - to.top) / Math.max(1e-6, from.bottom - from.top);
  const attached = idx.map((i) => ({ i, x: toX + (num(src[i].x, 0.5) * F.wu - fromX) * sx, y: toY + (num(src[i].y, 0.5) * F.hu - fromY) * sy }));

  let k = 1;
  if (copy) {
    const keep: Box = { left: copy.left - DECOR_GAP_U, right: copy.right + DECOR_GAP_U, top: copy.top - DECOR_GAP_U, bottom: copy.bottom + DECOR_GAP_U };
    for (const a of attached) {
      if (isSoft(src[a.i])) continue;
      const size = decorExtent(src[a.i]);
      if (before) {
        const x = num(src[a.i].x, 0.5) * F.wu;
        const y = num(src[a.i].y, 0.5) * F.hu;
        if (x - size.w / 2 < before.right && x + size.w / 2 > before.left && y - size.h / 2 < before.bottom && y + size.h / 2 > before.top) continue;
      }
      const hw = (size.w * move.scale) / 2;
      const hh = (size.h * move.scale) / 2;
      const kx = clearScale(toX, a.x - hw, a.x + hw, keep.left, keep.right);
      const ky = clearScale(toY, a.y - hh, a.y + hh, keep.top, keep.bottom);
      k = Math.min(k, Math.max(kx, ky));
    }
    k = Math.max(DECOR_MIN_SCALE, k);
  }

  const s = move.scale * k;
  for (const a of attached) {
    const o = out[a.i];
    o.x = (toX + (a.x - toX) * k) / T.wu;
    o.y = (toY + (a.y - toY) * k) / T.hu;
    if (o.kind === 'shape') {
      o.width = num(o.width, 0.4) * s;
      o.height = num(o.height, 0.4) * s;
      o.stroke = num(o.stroke, 0) * s;
      o.blur = num(o.blur, 0) * s;
    } else if (o.kind === 'image') {
      o.width = num(o.width, 0.4) * s;
      if (o.shadow) o.shadow = { ...o.shadow, blur: num(o.shadow.blur, 0) * s, x: num(o.shadow.x, 0) * s, y: num(o.shadow.y, 0) * s };
    }
  }
}

function toWide(src: SlideElement[], out: SlideElement[], c: Ctx): void {
  const { T } = c;
  const textIdx = indicesOf(src, 'text');
  const deviceIdx = indicesOf(src, 'device');
  const decor = deviceIdx.length ? groupDecor(src, sourceDevices(src, deviceIdx, c).box, c) : [];
  if (textIdx.length) {
    const band = copyBand(src, out, new Set(decor), c);
    const block = stackCopy(src, out, textIdx, c, {
      cx: WIDE_COPY.x * T.wu,
      maxW: WIDE_COPY.w * T.wu,
      maxH: band.bottom - band.top,
      grow: 1,
      centerAlign: true,
    });
    // Centred on the canvas, unless that reaches into a decoration at an edge.
    const shift = block.bottom > band.bottom ? band.bottom - block.bottom : block.top < band.top ? band.top - block.top : 0;
    if (shift) for (const i of textIdx) out[i].y = num(out[i].y, 0.5) + shift / T.hu;
  }
  const region: DeviceRegion = textIdx.length
    ? { cx: WIDE_DEVICES.x, maxW: WIDE_DEVICES.w, top: MARGIN, bottom: 1 - MARGIN, bleedTop: WIDE_DEVICES.bleedTop }
    : { cx: 0.5, maxW: 1 - 2 * MARGIN, top: MARGIN, bottom: 1 - MARGIN, bleedTop: WIDE_DEVICES.bleedTop };
  const move = placeDeviceGroup(src, out, deviceIdx, c, region);
  if (move) moveDecor(src, out, decor, move, copyBox(out, textIdx, T), c);
}

function fromWide(src: SlideElement[], out: SlideElement[], c: Ctx): void {
  const { T } = c;
  const textIdx = indicesOf(src, 'text');
  let regionTop = MARGIN;
  if (textIdx.length) {
    const { bottom } = stackCopy(src, out, textIdx, c, {
      cx: T.wu / 2,
      maxW: TALL_COPY.w * T.wu,
      maxH: 0.4 * T.hu,
      grow: 1.25,
      top: TALL_COPY.top,
      centerAlign: false,
    });
    regionTop = Math.min(0.6, (bottom + TALL_COPY.gap) / T.hu);
  }
  const deviceIdx = indicesOf(src, 'device');
  const move = placeDeviceGroup(src, out, deviceIdx, c, {
    cx: 0.5,
    maxW: 1 - 2 * MARGIN,
    top: regionTop,
    bottom: 1 - MARGIN,
    bleedTop: regionTop,
  });
  if (move) moveDecor(src, out, groupDecor(src, move.from, c), move, copyBox(out, textIdx, T), c);
}

/* Output hygiene ---------------------------------------------------- */

const tidy = (v: unknown, fallback: number, range: Range) => Math.round(clampToRange(num(v, fallback), range) * 1e6) / 1e6;

/** Clamps and rounds every number this module may have touched; NaN never leaves. */
function finalize(el: SlideElement): SlideElement {
  el.x = tidy(el.x, 0.5, RANGES.position);
  el.y = tidy(el.y, 0.5, RANGES.position);
  el.rotation = tidy(el.rotation, 0, RANGES.rotation);
  el.opacity = tidy(el.opacity, 1, RANGES.unit);
  switch (el.kind) {
    case 'device':
      el.width = tidy(el.width, 0.6, RANGES.deviceWidth);
      el.cornerRadius = tidy(el.cornerRadius, 0, RANGES.cornerRadius);
      break;
    case 'text':
      el.width = tidy(el.width, 0.8, RANGES.textWidth);
      if (el.style) {
        el.style.size = tidy(el.style.size, 0.05, RANGES.fontSize);
        el.style.lineHeight = tidy(el.style.lineHeight, 1.2, RANGES.lineHeight);
        el.style.letterSpacing = tidy(el.style.letterSpacing, 0, RANGES.letterSpacing);
      }
      break;
    case 'shape':
      el.width = tidy(el.width, 0.4, RANGES.shapeSize);
      el.height = tidy(el.height, 0.4, RANGES.shapeSize);
      el.stroke = tidy(el.stroke, 0, RANGES.stroke);
      el.blur = tidy(el.blur, 0, RANGES.blur);
      break;
    case 'image':
      el.width = tidy(el.width, 0.4, RANGES.imageWidth);
      if (el.shadow) el.shadow = { ...el.shadow, blur: tidy(el.shadow.blur, 0, RANGES.blur), x: tidy(el.shadow.x, 0, RANGES.shadowOffset), y: tidy(el.shadow.y, 0, RANGES.shadowOffset) };
      break;
  }
  return el;
}

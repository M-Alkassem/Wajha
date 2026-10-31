import { memo, useId, type CSSProperties, type ReactNode, type SVGProps } from 'react';
import { ImageUp, Lock } from 'lucide-react';
import type { FamilyId, TextElement } from '../../../model/types';
import { FONT_FALLBACK_STACK } from '../../../model/catalog';
import { useEditor } from '../../../store';
import { Spinner, cx } from '../../kit';
import { textRoleLabel } from '../sidebar/labels';
import { boxBounds, boxCorners, crisp, handlePoint, resizeCursor, rotationStem, type Box, type HandleId } from './geometry';
import { handlesFor } from './gestures';
import { coveringBoxes, labelSpot, screenBox, type MarkBox } from './hints';
import type { Guide } from './snapping';
import { stageBoxes, useRenderSnapshot, useStageUi, type DropTarget, type GestureVisual, type StageBox } from './stageStore';

import { t } from '../../../i18n';
/** Handle square side (CSS px). */
export const HANDLE_SIZE = 8;
/** Distance from the top edge to the rotation knob. */
export const ROTATE_STEM = 20;
/** Side handles disappear when the box is shorter than this along their edge. */
const SIDE_HANDLE_MIN = 28;
/** Empty-slot hints and empty-text placeholders only appear on slides at least this wide. */
export const HINT_MIN_SLIDE_W = 120;

type HintLayout = 'row' | 'stack' | 'icon';
/** Room each hint label layout needs (CSS px, as drawn plus a hair), tried in this order. */
const HINT_LABELS: readonly { layout: HintLayout; w: number; h: number }[] = [
  { layout: 'row', w: 144, h: 40 },
  { layout: 'stack', w: 122, h: 64 },
  { layout: 'icon', w: 28, h: 28 },
];
/** Empty-text placeholders write their role only from this font size (CSS px) up. */
const PLACEHOLDER_MIN_FONT = 7;
/**
 * Colours of marks drawn over the slide picture, which can be any colour:
 * a dark halo under a light or amber dash reads on light and dark designs
 * alike (the theme's --warning is tuned for text on panels, not pictures).
 */
const HALO = 'rgba(0, 0, 0, 0.35)';
const CANVAS_WARNING = '#f5b544';

const EMPTY: readonly StageBox[] = [];
const NONE: readonly string[] = [];

export interface OverlayViewProps {
  width: number;
  height: number;
  dpr: number;
  family: FamilyId;
  /** Corner radius of the slide (clips the marks, shapes the drop ring). */
  radius: string;
  /** The slide is the active one: its hovered or selected empty device shows a "Drop a screenshot" hint. */
  active: boolean;
  /** A file drag is over the stage: every empty device shows its screen outline. */
  dragging: boolean;
  boxes: readonly StageBox[];
  missingShots: readonly string[];
  pendingImages: readonly string[];
  /** Text layers without words: editor-only placeholders. */
  emptyText: readonly string[];
  /** Text layers that still overflow their line limit: an amber outline. */
  overflowText: readonly string[];
  /** The slide's language is right-to-left (placeholders align like its text). */
  rtl: boolean;
  selection: string | null;
  hover: string | null;
  gesture: GestureVisual | null;
  drop: DropTarget | null;
}

/** SVG polygon points of a box outline, pixel-snapped when it is not rotated. */
function outlinePoints(box: Box, dpr: number): string {
  if (!box.rotation) {
    const l = crisp(box.cx - box.w / 2, dpr);
    const t = crisp(box.cy - box.h / 2, dpr);
    const r = crisp(box.cx + box.w / 2, dpr);
    const b = crisp(box.cy + box.h / 2, dpr);
    return `${l},${t} ${r},${t} ${r},${b} ${l},${b}`;
  }
  return boxCorners(box)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
}

/** Absolutely positions a child over a rotated box (same centre, size and rotation). */
function boxStyle(box: Box): CSSProperties {
  return {
    left: box.cx - box.w / 2,
    top: box.cy - box.h / 2,
    width: box.w,
    height: box.h,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
  };
}

const grow = (box: Box, by: number): Box => ({ ...box, w: box.w + 2 * by, h: box.h + 2 * by });

function guideLine(g: Guide, dpr: number, i: number): ReactNode {
  const pos = crisp(g.pos, dpr);
  return g.axis === 'x' ? (
    <line key={`g${i}`} x1={pos} x2={pos} y1={g.from} y2={g.to} />
  ) : (
    <line key={`g${i}`} x1={g.from} x2={g.to} y1={pos} y2={pos} />
  );
}

/** A mark drawn over the picture: its area, and the layers above it that hide part of it. */
interface Mark {
  id: string;
  area: MarkBox;
  covers: readonly StageBox[];
  /** SVG mask id when something covers the mark. */
  mask?: string;
}

/** Rounded rect of a mark's area, shrunk by `inset`, with its rotation. */
function markRect(area: MarkBox, inset: number, props: SVGProps<SVGRectElement>): ReactNode {
  const w = Math.max(0, area.w - 2 * inset);
  const h = Math.max(0, area.h - 2 * inset);
  return (
    <rect
      x={area.cx - w / 2}
      y={area.cy - h / 2}
      width={w}
      height={h}
      rx={Math.max(0, Math.min(area.radius - inset, w / 2, h / 2))}
      transform={area.rotation ? `rotate(${area.rotation} ${area.cx} ${area.cy})` : undefined}
      {...props}
    />
  );
}

/** Dashed outline that reads on any picture: a soft dark line under a light dash. */
function dashedOutline(m: Mark, inset: number, qa: string): ReactNode {
  return (
    <g key={`${qa}-${m.id}`} mask={m.mask ? `url(#${m.mask})` : undefined} data-qa={qa}>
      {markRect(m.area, inset, { stroke: HALO, strokeWidth: 2 })}
      {markRect(m.area, inset, { stroke: 'var(--knob)', strokeWidth: 1, strokeDasharray: '4 3' })}
    </g>
  );
}

/** "Drop a screenshot" label on an empty device screen: solid, so it reads on light and dark screens. */
function HintLabel({ spot, layout }: { spot: Box; layout: HintLayout }) {
  return (
    <div className="absolute flex items-center justify-center" style={boxStyle(spot)} data-qa="empty-slot-label">
      <div
        className={cx(
          'flex items-center rounded-md bg-tooltip text-tooltip-text shadow-md',
          'animate-[kit-fade-in_var(--dur-fast)_var(--ease-out)] motion-reduce:animate-none',
          layout === 'row' && 'gap-2 py-1.5 ps-2 pe-2.5',
          layout === 'stack' && 'flex-col gap-1 px-2.5 py-2 text-center',
          layout === 'icon' && 'p-1.5',
        )}
      >
        <ImageUp aria-hidden className={layout === 'icon' ? 'size-3.5' : 'size-4 shrink-0'} strokeWidth={2} />
        {layout !== 'icon' && (
          <span className="flex flex-col whitespace-nowrap">
            <span className="text-2xs leading-3.5 font-medium">{t('Drop a screenshot')}</span>
            <span className="text-[10px] leading-3 text-tooltip-text/70">{t('or double-click')}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Rough advance of a run of text (CSS px), to decide whether a placeholder's words fit its box. */
function roughWidth(text: string, px: number, upper: boolean, spacingEm: number): number {
  return text.length * px * ((upper ? 0.68 : 0.56) + Math.max(0, spacingEm));
}

/**
 * Editor-only stand-in for an empty text layer: its role ("Headline") in the
 * layer's own font, colour and alignment, faded, where the words will go.
 */
function TextPlaceholder({ el, area, unit, rtl }: { el: TextElement; area: Box; unit: number; rtl: boolean }) {
  const s = el.style;
  const px = s.size * unit;
  if (!(px >= PLACEHOLDER_MIN_FONT)) return null;
  const upper = s.transform === 'uppercase';
  const role = textRoleLabel(el.key);
  const full = `${role} · double-click to type`;
  const words = roughWidth(full, px, upper, s.letterSpacing) <= area.w ? full : role;
  const start = (s.align === 'start') !== rtl;
  const justify = s.align === 'center' ? 'center' : start ? 'flex-start' : 'flex-end';
  return (
    <div
      className="absolute flex items-center overflow-hidden whitespace-nowrap"
      style={{
        ...boxStyle(area),
        justifyContent: justify,
        fontFamily: `"${s.font.replace(/["\\\r\n;{}]/g, '')}", ${FONT_FALLBACK_STACK}`,
        fontWeight: s.weight,
        fontSize: px,
        lineHeight: 1.15,
        letterSpacing: s.letterSpacing ? `${s.letterSpacing}em` : undefined,
        textTransform: upper ? 'uppercase' : undefined,
        color: s.color,
        opacity: 0.45,
      }}
      data-qa="text-placeholder"
    >
      {words}
    </div>
  );
}

function PendingBadge({ spot }: { spot: Box }) {
  return (
    <div className="absolute flex items-center justify-center" style={boxStyle(spot)}>
      <span className="flex size-6 items-center justify-center rounded-full bg-tooltip/80 text-tooltip-text shadow-md backdrop-blur-sm">
        <Spinner size={12} label={null} />
      </span>
    </div>
  );
}

function Handle({ id, box }: { id: HandleId; box: Box }) {
  const p = handlePoint(box, id);
  const half = HANDLE_SIZE / 2;
  return (
    <div
      data-handle={id}
      className="pointer-events-auto absolute rounded-[2px] border border-accent bg-knob shadow-[0_1px_2px_rgba(0,0,0,0.25)] before:absolute before:-inset-1.5"
      style={{
        left: Math.round(p.x) - half,
        top: Math.round(p.y) - half,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        cursor: resizeCursor(id, box.rotation),
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
      }}
    />
  );
}

function visibleHandles(box: StageBox): HandleId[] {
  return handlesFor(box.element.kind).filter((h) => {
    if (h === 'n' || h === 's') return box.w >= SIDE_HANDLE_MIN;
    if (h === 'e' || h === 'w') return box.h >= SIDE_HANDLE_MIN;
    return true;
  });
}

/** Everything drawn over one slide, from plain data (unit-testable without a store). */
export function OverlayView(props: OverlayViewProps) {
  const { width, height, dpr, family, boxes, selection, hover, gesture, drop, dragging } = props;
  const uid = useId();
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const order = new Map(boxes.map((b, i) => [b.id, i]));
  const selected = selection ? (byId.get(selection) ?? null) : null;
  const hovered = hover && hover !== selection && !gesture ? (byId.get(hover) ?? null) : null;
  const moving = gesture?.kind === 'move';
  const editable = !!selected && !selected.element.locked;
  const stem = selected && editable && !moving ? rotationStem(selected, ROTATE_STEM) : null;
  const bounds = selected ? boxBounds(selected) : null;
  const slide = { width, height };

  /** Masks of the marks something covers: the covering layers cut out of the slide. */
  const masks: { id: string; covers: readonly StageBox[] }[] = [];
  /** A mark over `area` of `box`, knowing which upper layers cover it; `masked` gives it a mask for SVG drawing. */
  const mark = (box: StageBox, area: MarkBox, masked: boolean): Mark => {
    const covers = coveringBoxes(boxes, order.get(box.id) ?? boxes.length, area);
    let mask: string | undefined;
    if (masked && covers.length) {
      mask = `${uid}m${masks.length}`;
      masks.push({ id: mask, covers });
    }
    return { id: box.id, area, covers, mask };
  };

  // Empty screens hint only where it helps: the hovered or selected device of the active slide, or every one while files are dragged.
  const hintable = width >= HINT_MIN_SLIDE_W;
  const hints: { m: Mark; label: { spot: Box; layout: HintLayout } | null }[] = [];
  for (const id of props.missingShots) {
    const box = byId.get(id);
    if (!hintable || !box || id === drop?.deviceId) continue;
    const focused = props.active && !gesture && (id === hover || id === selection);
    if (!dragging && !focused) continue;
    const m = mark(box, screenBox(box, family), true);
    let label: { spot: Box; layout: HintLayout } | null = null;
    // While files are dragged the drop label says it all; the outlines only show where screenshots can go.
    for (const v of dragging ? [] : HINT_LABELS) {
      const spot = labelSpot(m.area, v, m.covers, slide);
      if (spot) {
        label = { spot, layout: v.layout };
        break;
      }
    }
    hints.push({ m, label });
  }

  const placeholders: { m: Mark; el: TextElement }[] = [];
  for (const id of props.emptyText) {
    const box = byId.get(id);
    if (!hintable || box?.element.kind !== 'text') continue;
    const area = { cx: box.cx, cy: box.cy, w: box.w, h: box.h, rotation: box.rotation, radius: 3 };
    placeholders.push({ m: mark(box, area, true), el: box.element });
  }

  const pending: Box[] = [];
  for (const id of props.pendingImages) {
    const box = byId.get(id);
    const m = box ? mark(box, screenBox(box, family), false) : null;
    const spot = m ? labelSpot(m.area, { w: 24, h: 24 }, m.covers, slide) : null;
    if (spot) pending.push(spot);
  }

  const dropBox = drop?.deviceId ? (byId.get(drop.deviceId) ?? null) : null;
  const dropMark = drop && dropBox ? mark(dropBox, screenBox(dropBox, family), true) : null;
  const overflowing = props.overflowText.flatMap((id) => byId.get(id) ?? []);
  const unit = Math.min(width, height);

  // Labels stay near the slide even when the element hangs far off it.
  const labelTop = bounds ? Math.min(Math.round(bounds.bottom) + 10, Math.round(height) + 10) : 0;
  const badgeInside = !!bounds && bounds.top < 24;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Marks belong to the picture: clipped to the slide like the canvas, and drawn under the layers above them. */}
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: props.radius }}>
        {(hints.length > 0 || placeholders.length > 0 || dropMark) && (
          <svg className="absolute top-0 left-0" width={width} height={height} fill="none">
            <defs>
              {masks.map((m) => (
                <mask key={m.id} id={m.id} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
                  <rect width={width} height={height} fill="white" />
                  {m.covers.map((c) => (
                    <polygon key={c.id} points={outlinePoints(c, dpr)} fill="black" />
                  ))}
                </mask>
              ))}
            </defs>
            {placeholders.map(({ m }) => dashedOutline(m, 0, 'text-placeholder-outline'))}
            {hints.map(({ m }) => dashedOutline(m, 3, 'empty-slot'))}
            {dropMark && (
              <g mask={dropMark.mask ? `url(#${dropMark.mask})` : undefined} data-qa="drop-device">
                {markRect(dropMark.area, 0, { fill: 'var(--accent)', fillOpacity: 0.25, stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 4' })}
              </g>
            )}
          </svg>
        )}
        {placeholders.map(({ m, el }) => (m.covers.length ? null : <TextPlaceholder key={`ph-${m.id}`} el={el} area={m.area} unit={unit} rtl={props.rtl} />))}
        {hints.map(({ m, label }) => label && <HintLabel key={`hint-${m.id}`} spot={label.spot} layout={label.layout} />)}
        {pending.map((spot, i) => (
          <PendingBadge key={`pending-${i}`} spot={spot} />
        ))}
      </div>

      {drop && (
        <div className="absolute inset-0 bg-accent/10 ring-2 ring-accent" style={{ borderRadius: props.radius }} data-qa="drop-slide" />
      )}
      {drop && !drop.stage && (
        <div
          className="absolute flex h-6 items-center gap-1.5 rounded-full bg-accent px-2.5 text-xs font-medium whitespace-nowrap text-accent-text shadow-md"
          style={{
            left: dropBox ? dropBox.cx : width / 2,
            top: dropBox ? Math.min(height - 20, Math.max(16, dropBox.cy)) : height / 2,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <ImageUp aria-hidden className="size-3.5" />
          {drop.label}
        </div>
      )}

      <svg className="absolute top-0 left-0 overflow-visible" width={width} height={height} fill="none" strokeWidth={1}>
        {overflowing.map((b) => (
          // Text past its line limit is caught on the canvas before export; exports never see this.
          <g key={`overflow-${b.id}`} data-qa="overflow">
            <polygon points={outlinePoints(grow(b, 3), dpr)} stroke={HALO} strokeWidth={2.5} strokeLinejoin="round" />
            <polygon points={outlinePoints(grow(b, 3), dpr)} stroke={CANVAS_WARNING} strokeWidth={1.5} strokeDasharray="5 3" />
          </g>
        ))}
        {hovered && <polygon points={outlinePoints(hovered, dpr)} stroke="var(--accent)" />}
        {selected && (
          <>
            {/* A soft light halo keeps the accent line visible on saturated (violet) designs. */}
            <polygon points={outlinePoints(selected, dpr)} stroke="var(--knob)" strokeOpacity={0.4} strokeWidth={3} strokeLinejoin="round" />
            <polygon points={outlinePoints(selected, dpr)} stroke="var(--accent)" />
          </>
        )}
        {stem && <line x1={stem.base.x} y1={stem.base.y} x2={stem.knob.x} y2={stem.knob.y} stroke="var(--accent)" />}
        {gesture && gesture.guides.length > 0 && <g stroke="var(--brand-pink)">{gesture.guides.map((g, i) => guideLine(g, dpr, i))}</g>}
      </svg>

      {selected && editable && !moving && visibleHandles(selected).map((h) => <Handle key={h} id={h} box={selected} />)}
      {stem && (
        <div
          data-handle="rotate"
          className="pointer-events-auto absolute size-2.5 rounded-full border border-accent bg-knob shadow-[0_1px_2px_rgba(0,0,0,0.25)] before:absolute before:-inset-1.5 before:rounded-full"
          style={{ left: Math.round(stem.knob.x) - 5, top: Math.round(stem.knob.y) - 5, cursor: gesture?.kind === 'rotate' ? 'grabbing' : 'grab' }}
        />
      )}
      {selected && !editable && bounds && (
        <div
          className="absolute flex size-4 items-center justify-center rounded-xs bg-accent text-accent-text shadow-sm"
          style={{ left: Math.round(bounds.left) + (badgeInside ? 4 : 0), top: Math.round(bounds.top) + (badgeInside ? 4 : -20) }}
          data-qa="locked-badge"
        >
          <Lock className="size-2.5" strokeWidth={2.5} />
        </div>
      )}
      {gesture?.label && bounds && (
        <div
          className="absolute flex h-5 items-center rounded-xs bg-accent px-1.5 text-2xs font-medium whitespace-nowrap text-accent-text tabular-nums shadow-md"
          style={{ left: Math.round((bounds.left + bounds.right) / 2), top: labelTop, transform: 'translateX(-50%)' }}
          data-qa="gesture-label"
        >
          {gesture.label}
        </div>
      )}
    </div>
  );
}

export interface SelectionOverlayProps {
  slideId: string;
  width: number;
  height: number;
  family: FamilyId;
  dpr: number;
  radius: string;
}

/** Live overlay of one slide: subscribes to its render snapshot and to the selection, hover, gesture and drop state of that slide only. */
export const SelectionOverlay = memo(function SelectionOverlay({ slideId, width, height, family, dpr, radius }: SelectionOverlayProps) {
  const snapshot = useRenderSnapshot(slideId);
  const active = useEditor((s) => s.activeSlideId === slideId);
  const selection = useEditor((s) => (s.activeSlideId === slideId ? s.selection : null));
  const storeHover = useEditor((s) => (s.activeSlideId === slideId ? s.hoverId : null));
  const localHover = useStageUi((s) => (s.hover?.slideId === slideId ? s.hover.elementId : null));
  const gesture = useStageUi((s) => (s.gesture?.slideId === slideId ? s.gesture : null));
  const drop = useStageUi((s) => (s.drop?.slideId === slideId ? s.drop : null));
  const dragging = useStageUi((s) => s.drop !== null);
  const current = snapshot && snapshot.family === family ? snapshot : null;
  return (
    <OverlayView
      width={width}
      height={height}
      dpr={dpr}
      family={family}
      radius={radius}
      active={active}
      dragging={dragging}
      boxes={current ? stageBoxes(current, width) : EMPTY}
      missingShots={current?.result.missingShots ?? NONE}
      pendingImages={current?.result.pendingImages ?? NONE}
      emptyText={current?.emptyText ?? NONE}
      overflowText={current?.result.overflowingText ?? NONE}
      rtl={current?.rtl ?? false}
      selection={selection}
      hover={storeHover ?? localHover}
      gesture={gesture}
      drop={drop}
    />
  );
});

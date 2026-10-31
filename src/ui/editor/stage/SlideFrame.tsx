import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Ellipsis, Plus, TriangleAlert } from 'lucide-react';
import type { AssetInfo, FamilyId } from '../../../model/types';
import { FAMILIES } from '../../../model/catalog';
import { resolveLayout } from '../../../model/resolve';
import { MAX_SLIDES, useEditor } from '../../../store';
import {
  Badge,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  cx,
} from '../../kit';
import { contextTarget, doubleClickSlide, hoverSlide, leaveSlide, pressSlide, type MenuTarget, type SlideTarget } from './interaction';
import { SelectionOverlay } from './SelectionOverlay';
import { SlideCanvas } from './SlideCanvas';
import { elementEntries, renderContextEntries, renderDropdownEntries, slideEntries } from './SlideMenus';
import { cornerRadius, overLimitText, slideRadius } from './frame';
import { HEADER_H } from './stageLayout';

import { t } from '../../../i18n';
const EMPTY_ASSETS: Record<string, AssetInfo> = Object.freeze({}) as Record<string, AssetInfo>;

export interface SlideFrameProps {
  slideId: string;
  index: number;
  count: number;
  /** Slide box position and size in stage content coordinates (the header sits above it). */
  left: number;
  top: number;
  width: number;
  height: number;
  family: FamilyId;
  panorama: boolean;
  dpr: number;
  root: Element | null;
}

interface SlideHeaderProps {
  slideId: string;
  index: number;
  width: number;
  active: boolean;
  family: FamilyId;
  /** Panorama slides touch: the header keeps clear of its neighbours'. */
  panorama: boolean;
}

/** Memoised: it stays put while the slide below it re-renders on every drag frame. */
const SlideHeader = memo(function SlideHeader({ slideId, index, width, active, family, panorama }: SlideHeaderProps) {
  const max = FAMILIES[family].maxSlides;
  const over = index >= max;
  const narrow = width < 150;
  // Zoomed far out there is room for the number only; the store limit shows as its colour.
  if (width < 72) {
    return (
      <div className="pointer-events-none absolute top-0 start-0 flex h-6 items-center" style={{ width }}>
        <Tooltip content={over ? overLimitText(family) : null}>
          <button
            type="button"
            aria-current={active ? 'true' : undefined}
            aria-label={over ? t('Slide {v}, {overLimitText}', { v: index + 1, overLimitText: overLimitText(family) }) : t('Slide {v}', { v: index + 1 })}
            onClick={() => useEditor.getState().select(null, slideId)}
            className={cx(
              'pointer-events-auto flex h-6 min-w-0 items-center gap-1 rounded-sm px-0.5 text-2xs font-medium tabular-nums outline-none',
              'transition-[color] duration-(--dur-fast) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus',
              over ? 'text-warning' : active ? 'text-text' : 'text-text-3 hover:text-text-2',
            )}
          >
            {active && <span aria-hidden className="size-1 shrink-0 rounded-full bg-accent" />}
            <span className="truncate">{index + 1}</span>
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className={cx('pointer-events-none absolute top-0 start-0 flex h-6 items-center gap-1', panorama ? 'px-2.5' : '')} style={{ width }}>
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-label={t('Slide {v}', { v: index + 1 })}
        onClick={() => useEditor.getState().select(null, slideId)}
        className={cx(
          'pointer-events-auto flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1 text-xs font-medium tabular-nums outline-none',
          !panorama && '-ml-1',
          'transition-[color] duration-(--dur-fast) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus',
          active ? 'text-text' : 'text-text-3 hover:text-text-2',
        )}
      >
        {active && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
        <span className="truncate">{narrow ? index + 1 : t('Slide {v}', { v: index + 1 })}</span>
      </button>
      <span className="min-w-0 flex-1" />
      {over && (
        <Tooltip content={overLimitText(family)}>
          <span tabIndex={0} aria-label={overLimitText(family)} className="pointer-events-auto flex rounded-[4px] outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus" data-qa="over-limit">
            <Badge variant="warning" size="sm" icon={<TriangleAlert aria-hidden />}>
              {narrow ? null : t('Not exported')}
            </Badge>
          </span>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label={t('Slide {v} options', { v: index + 1 })}
            tooltip={t('Slide options')}
            icon={<Ellipsis />}
            size="sm"
            className={cx(
              // The kit's ring relies on outline-style, which its outline-none turns off in Tailwind 4.
              'pointer-events-auto transition-opacity duration-(--dur-fast) focus-visible:outline-solid',
              !panorama && '-mr-1',
              !active && 'opacity-0 group-hover/frame:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[216px]">
          <HeaderMenuItems slideId={slideId} family={family} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

/** Rendered only while the menu is open, so entries reflect the project at that moment. */
function HeaderMenuItems({ slideId, family }: { slideId: string; family: FamilyId }) {
  return <>{renderDropdownEntries(slideEntries(slideId, family))}</>;
}

/** The seam between two slides of a panorama: a dashed hairline over the picture, ticks outside it. */
function PanoramaSeam() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-0 border-s border-dashed border-knob/60 shadow-[1px_0_0_rgba(0,0,0,0.16)]" />
      <div aria-hidden className="pointer-events-none absolute -top-2 left-0 h-1.5 w-px -translate-x-1/2 bg-text-3" />
      <div aria-hidden className="pointer-events-none absolute -bottom-2 left-0 h-1.5 w-px -translate-x-1/2 bg-text-3" />
    </>
  );
}

function FrameMenu({ slideId, family, target }: { slideId: string; family: FamilyId; target: MenuTarget }) {
  if (target.kind === 'element') {
    const s = useEditor.getState();
    const slide = s.project?.slides.find((x) => x.id === slideId);
    const el = s.project && slide ? resolveLayout(s.project, slide, family).elements.find((e) => e.id === target.elementId) : undefined;
    if (el) return <>{renderContextEntries(elementEntries(slideId, family, el))}</>;
  }
  return <>{renderContextEntries(slideEntries(slideId, family))}</>;
}

/**
 * One slide on the stage: header (number, store-limit warning, options),
 * the canvas, its overlay and its context menu. Subscribes to its own
 * slide only, so editing one slide never re-renders the others.
 */
export const SlideFrame = memo(function SlideFrame(props: SlideFrameProps) {
  const { slideId, index, count, left, top, width, height, family, panorama, dpr, root } = props;
  const slide = useEditor((s) => s.project?.slides.find((x) => x.id === slideId) ?? null);
  const theme = useEditor((s) => s.project?.theme ?? null);
  const lang = useEditor((s) => s.activeLang);
  const baseLang = useEditor((s) => s.project?.languages[0] ?? s.activeLang);
  const familiesKey = useEditor((s) => s.project?.families.join(',') ?? '');
  const assets = useEditor((s) => s.project?.assets ?? EMPTY_ASSETS);
  const active = useEditor((s) => s.activeSlideId === slideId);
  const slideSelected = useEditor((s) => s.activeSlideId === slideId && s.selection === null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuTarget>({ kind: 'slide' });

  const target = useCallback((): SlideTarget | null => (boxRef.current ? { slideId, el: boxRef.current, width, height, family } : null), [slideId, width, height, family]);
  const radius = cornerRadius(index, count, slideRadius(width, height), panorama);
  // Stable identity keeps the memoised canvas from re-rendering with its frame.
  const canvasStyle = useMemo<CSSProperties>(
    () => ({ borderRadius: radius, boxShadow: panorama ? undefined : 'var(--shadow-slide), 0 0 0 1px var(--line)' }),
    [radius, panorama],
  );

  if (!slide || !theme) return null;

  return (
    <div
      role="group"
      aria-label={t('Slide {v} of {count}', { v: index + 1, count })}
      data-slide-frame={slideId}
      className={cx('group/frame absolute', active && 'z-10')}
      style={{ left, top: top - HEADER_H, width, height: height + HEADER_H }}
    >
      <SlideHeader slideId={slideId} index={index} width={width} active={active} family={family} panorama={panorama} />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={boxRef}
            data-slide-box=""
            data-slide-id={slideId}
            data-slide-index={index}
            className="absolute start-0 touch-none"
            style={{ top: HEADER_H, width, height }}
            onPointerDown={(e) => {
              const t = target();
              if (t) pressSlide(e.nativeEvent, t);
            }}
            onPointerMove={(e) => {
              const t = target();
              if (t) hoverSlide(e.nativeEvent, t);
            }}
            onPointerLeave={() => {
              const t = target();
              if (t) leaveSlide(t);
            }}
            onDoubleClick={(e) => {
              const t = target();
              if (t) doubleClickSlide(e.nativeEvent, t);
            }}
            onContextMenu={(e) => {
              const t = target();
              if (t) setMenu(contextTarget(e.nativeEvent, t));
            }}
          >
            <SlideCanvas
              slideId={slideId}
              slide={slide}
              slideIndex={index}
              slideCount={count}
              family={family}
              lang={lang}
              baseLang={baseLang}
              theme={theme}
              familiesKey={familiesKey}
              assets={assets}
              width={width}
              height={height}
              dpr={dpr}
              root={root}
              className="pointer-events-none absolute inset-0 block"
              style={canvasStyle}
            />
            {panorama && index > 0 && <PanoramaSeam />}
            {slideSelected && <div aria-hidden className="pointer-events-none absolute inset-0 ring-1 ring-accent" style={{ borderRadius: radius }} />}
            <SelectionOverlay slideId={slideId} width={width} height={height} family={family} dpr={dpr} radius={radius} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[232px]">
          <FrameMenu slideId={slideId} family={family} target={menu} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
});

export interface AddSlideTileProps {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  disabled: boolean;
  onAdd(): void;
}

/** Dashed "Add slide" tile at the end of the filmstrip. */
export const AddSlideTile = memo(function AddSlideTile({ left, top, width, height, radius, disabled, onAdd }: AddSlideTileProps) {
  const compact = width < 96 || height < 120;
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      aria-label={t('Add slide')}
      data-qa="add-slide"
      className={cx(
        'group/add flex size-full flex-col items-center justify-center gap-2.5 border border-dashed border-line-strong text-text-3 outline-none',
        'transition-[color,border-color,background-color] duration-(--dur-fast) ease-out',
        'hover:border-accent-line hover:bg-accent-soft hover:text-accent-fg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
      style={{ borderRadius: radius }}
    >
      <span
        className={cx(
          'flex items-center justify-center rounded-full border border-line-strong bg-surface text-text-2 shadow-[var(--highlight)]',
          'transition-[color,border-color,background-color] duration-(--dur-fast) ease-out',
          'group-hover/add:border-transparent group-hover/add:bg-accent group-hover/add:text-accent-text',
          compact ? 'size-7 [&_svg]:size-3.5' : 'size-9 [&_svg]:size-4',
        )}
      >
        <Plus aria-hidden strokeWidth={2.25} />
      </span>
      {!compact && <span className="text-xs font-medium">{t('Add slide')}</span>}
    </button>
  );
  return (
    <div className="absolute" style={{ left, top, width, height }}>
      {disabled ? (
        <Tooltip content={t('A project can have up to {MAX_SLIDES} slides', { MAX_SLIDES })}>
          <span tabIndex={0} className="block size-full rounded-md outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {button}
          </span>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
});

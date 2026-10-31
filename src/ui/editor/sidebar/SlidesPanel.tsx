import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { DndContext, closestCenter, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, ImageOff, Plus, Trash2 } from 'lucide-react';
import { FAMILIES, languageInfo } from '../../../model/catalog';
import { resolveLayout } from '../../../model/resolve';
import type { FamilyId, LangCode, Project, Slide } from '../../../model/types';
import { MAX_SLIDES, useEditor } from '../../../store';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  IconButton,
  ScrollArea,
  Tooltip,
  cx,
} from '../../kit';
import { SlidePreview } from '../../shared/SlidePreview';
import { isListDragging, setListDragging } from '../chrome';
import { MOVE_DOWN_KEYS, MOVE_UP_KEYS, moveDelta, prefersReducedMotion, restrictToVerticalAxis, scrollIntoViewWithin, sortInstructions, useListSensors } from './dnd';
import { missingDevices, slideTitle, thumbSize } from './labels';
import { addSlideAfter, deleteSlideWithConfirm, moveSlideBy } from './slideActions';

import { t } from '../../../i18n';
const slideNumber = (id: string | number) => {
  const p = useEditor.getState().project;
  const i = p ? p.slides.findIndex((s) => s.id === id) : -1;
  return i + 1;
};

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Picked up slide ${slideNumber(active.id)}.`,
  onDragOver: ({ active, over }) => (over ? `Slide ${slideNumber(active.id)} is over position ${slideNumber(over.id)}.` : undefined),
  // Announced after the store applied the move, so the slide's own index is its new position.
  onDragEnd: ({ active }) => `Slide dropped at position ${slideNumber(active.id)}.`,
  onDragCancel: ({ active }) => `Moving cancelled. Slide ${slideNumber(active.id)} stays in place.`,
};

const ACCESSIBILITY = { announcements: ANNOUNCEMENTS, screenReaderInstructions: { draggable: sortInstructions('slide') } };
const MODIFIERS = [restrictToVerticalAxis];

/** Focuses the slide row with `id` in `list`. */
function focusSlide(list: Element | null, id: string): void {
  list?.querySelector<HTMLElement>(`[data-slide-option="${id}"]`)?.focus();
}

/**
 * The slides of the project in order: thumbnails with their headline,
 * drag (or Mod+arrow keys) to reorder, hover actions, a context menu, and
 * the store's slide limit for the active family marked in the list.
 */
export function SlidesPanel() {
  const project = useEditor((s) => s.project);
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const family = useEditor((s) => s.activeFamily);
  const lang = useEditor((s) => s.activeLang);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sensors = useListSensors();
  // What the last keyboard or menu move did, for screen readers (dnd-kit announces pointer drags itself).
  const [moved, setMoved] = useState('');
  const slides = project?.slides;
  const ids = useMemo(() => (slides ?? []).map((s) => s.id), [slides]);
  const count = ids.length;

  // Keep the active slide in view when it changes from the stage, the keyboard or a new slide.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !activeSlideId) return;
    const el = viewport.querySelector<HTMLElement>(`[data-slide-id="${activeSlideId}"]`);
    if (el) scrollIntoViewWithin(viewport, el, 8, !prefersReducedMotion());
  }, [activeSlideId, count]);

  // A drag cut short by unmounting never reports its end; the editor shortcuts must not stay paused.
  useEffect(() => () => setListDragging(false), []);

  const moveBy = useCallback((id: string, delta: -1 | 1) => {
    if (!moveSlideBy(id, delta)) return;
    setMoved(`Slide moved to position ${slideNumber(id)} of ${useEditor.getState().project?.slides.length ?? 0}.`);
    // React keeps focus on the moved row but restores the list's scroll position; follow the row.
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const el = viewport?.querySelector<HTMLElement>(`[data-slide-id="${id}"]`);
      if (viewport && el) scrollIntoViewWithin(viewport, el, 8, !prefersReducedMotion());
    });
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setListDragging(false);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const p = useEditor.getState().project;
    if (!p) return;
    const from = p.slides.findIndex((s) => s.id === active.id);
    const to = p.slides.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) useEditor.getState().moveSlide(from, to);
  }, []);

  if (!project || !slides) return null;
  const { width: thumbWidth, layout } = thumbSize(family);
  const limit = FAMILIES[family].maxSlides;
  const full = count >= MAX_SLIDES;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={MODIFIERS}
          accessibility={ACCESSIBILITY}
          onDragStart={() => setListDragging(true)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setListDragging(false)}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div role="listbox" aria-label={t('Slides')} aria-orientation="vertical" className="flex flex-col gap-0.5 px-1.5 py-2">
              {slides.map((slide, index) => (
                <SlideItem
                  key={slide.id}
                  project={project}
                  slide={slide}
                  index={index}
                  count={count}
                  family={family}
                  lang={lang}
                  active={slide.id === activeSlideId}
                  limit={limit}
                  thumbWidth={thumbWidth}
                  stacked={layout === 'stacked'}
                  onMove={moveBy}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>
      <div aria-live="polite" aria-atomic className="sr-only">
        {moved}
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <Button
          variant="ghost"
          fullWidth
          leadingIcon={<Plus />}
          disabled={full}
          onClick={() => useEditor.getState().addSlide()}
          className="border border-dashed border-line-strong hover:border-solid"
        >
          {full ? t('Slide limit reached ({MAX_SLIDES})', { MAX_SLIDES }) : t('Add slide')}
        </Button>
      </div>
    </div>
  );
}

interface SlideItemProps {
  /** Compared loosely (see sameItem): only what the preview of this slide depends on. */
  project: Project;
  slide: Slide;
  index: number;
  count: number;
  family: FamilyId;
  lang: LangCode;
  active: boolean;
  /** The family's store limit: slides from this index on are not exported. */
  limit: number;
  thumbWidth: number;
  stacked: boolean;
  /** Moves the slide one place up (-1) or down (1) and tells screen readers. */
  onMove(id: string, delta: -1 | 1): void;
}

/**
 * Re-render only when this slide's picture or row can change: its own data,
 * its position, the view, or project-wide inputs of the renderer (theme,
 * images, languages, families). Edits to other slides skip this row.
 */
function sameItem(a: SlideItemProps, b: SlideItemProps): boolean {
  return (
    a.slide === b.slide &&
    a.index === b.index &&
    a.count === b.count &&
    a.family === b.family &&
    a.lang === b.lang &&
    a.active === b.active &&
    a.limit === b.limit &&
    a.thumbWidth === b.thumbWidth &&
    a.stacked === b.stacked &&
    a.onMove === b.onMove &&
    a.project.theme === b.project.theme &&
    a.project.assets === b.project.assets &&
    a.project.languages === b.project.languages &&
    a.project.families === b.project.families
  );
}

const SlideItem = memo(function SlideItem({ project, slide, index, count, family, lang, active, limit, thumbWidth, stacked, onMove }: SlideItemProps) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: slide.id,
    attributes: { role: 'option', roleDescription: 'sortable slide' },
  });
  const base = project.languages[0] ?? lang;
  const layout = resolveLayout(project, slide, family);
  const { title, subtitle } = slideTitle(slide, layout, lang, base);
  const missing = missingDevices(slide, layout, family, lang, base).length;
  const devices = layout.elements.filter((e) => e.kind === 'device' && !e.hidden && e.opacity > 0).length;
  const beyond = index >= limit;
  const rtl = languageInfo(lang).rtl;
  const number = index + 1;
  const canDelete = count > 1;

  const select = () => useEditor.getState().setActiveSlide(slide.id);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A pointer drag keeps the keys until it ends (Escape cancels it).
    if (isListDragging() || e.defaultPrevented || e.target !== e.currentTarget) return;
    const delta = moveDelta(e);
    if (delta !== 0) {
      // Claimed even at either end of the list, where the browser would scroll it instead.
      e.preventDefault();
      onMove(slide.id, delta);
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const p = useEditor.getState().project;
    if (!p) return;
    const i = p.slides.findIndex((s) => s.id === slide.id);
    let next: Slide | undefined;
    if (e.key === 'ArrowUp') next = p.slides[i - 1];
    else if (e.key === 'ArrowDown') next = p.slides[i + 1];
    else if (e.key === 'Home') next = p.slides[0];
    else if (e.key === 'End') next = p.slides[p.slides.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      // Like the layer rows: Space selects too, and never scrolls the list.
      e.preventDefault();
      select();
      return;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const list = e.currentTarget.closest('[role="listbox"]');
      void deleteSlideWithConfirm(slide.id).then((done) => {
        // Deleted: focus the slide that took its place. Kept: back to this row after the question.
        const id = done ? useEditor.getState().activeSlideId : slide.id;
        if (id) requestAnimationFrame(() => focusSlide(list, id));
      });
      return;
    } else return;
    e.preventDefault();
    if (!next) return;
    useEditor.getState().setActiveSlide(next.id);
    focusSlide(e.currentTarget.closest('[role="listbox"]'), next.id);
  };

  const stop = (e: MouseEvent) => e.stopPropagation();

  const label = [title ? t('Slide {number}: {title}', { number, title }) : t('Slide {number}', { number }), missing ? t('no screenshot') : '', beyond ? t('not exported') : '']
    .filter(Boolean)
    .join(t(', '));

  const actions = (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={cx(
        'flex shrink-0 items-center transition-opacity duration-(--dur-fast)',
        'opacity-0 group-hover/slide:opacity-100 group-focus-within/slide:opacity-100',
        // Over a wide thumbnail the buttons sit on a small glass plate in its corner.
        stacked && 'absolute top-1.5 end-1.5 rounded-md bg-popover/85 p-0.5 shadow-md backdrop-blur-sm',
        isDragging && 'opacity-0!',
      )}
    >
      <IconButton
        size="sm"
        label={t('Duplicate slide')}
        icon={<Copy />}
        tabIndex={-1}
        disabled={count >= MAX_SLIDES}
        onClick={(e) => {
          stop(e);
          useEditor.getState().duplicateSlide(slide.id);
        }}
      />
      <IconButton
        size="sm"
        label={t('Delete slide')}
        icon={<Trash2 />}
        tabIndex={-1}
        disabled={!canDelete}
        onClick={(e) => {
          stop(e);
          void deleteSlideWithConfirm(slide.id);
        }}
        className="hover:text-danger!"
      />
    </div>
  );

  const preview = (
    <div
      className={cx(
        'relative shrink-0 overflow-hidden rounded-[5px] bg-surface-2 ring-1 transition-[outline-color,box-shadow,opacity] duration-(--dur-fast)',
        active ? 'ring-transparent outline-2 outline-offset-2 outline-accent' : 'ring-line outline-0 outline-transparent group-hover/slide:ring-line-strong',
      )}
    >
      <SlidePreview project={project} slideIndex={index} family={family} lang={lang} width={thumbWidth} className={cx(beyond && 'opacity-45')} />
      {stacked && actions}
    </div>
  );

  // The wide (stacked) row has room for an icon only; the tooltip says the rest.
  const missingMark = missing > 0 && (
    <Tooltip content={missing > 1 ? t('{missing} screenshots missing: mock screens stand in', { missing }) : t('No screenshot yet: a mock screen stands in')}>
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] text-warning">
        <ImageOff className="size-3.5" />
      </span>
    </Tooltip>
  );

  return (
    <div ref={setNodeRef} data-slide-id={slide.id} style={{ transform: DndCSS.Translate.toString(transform), transition }} className={cx('relative', isDragging && 'z-10')}>
      {index === limit && index > 0 && (
        <div aria-hidden className="flex items-center gap-2 px-2 pt-2.5 pb-2 text-2xs font-medium text-text-3">
          <span className="h-px flex-1 bg-line" />
          <span className="shrink-0">{limit === 1 ? t('Only the first slide is exported') : t('Only the first {limit} are exported', { limit })}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            role="option"
            aria-selected={active}
            aria-label={label}
            tabIndex={active ? 0 : -1}
            data-slide-option={slide.id}
            onClick={select}
            onContextMenu={select}
            onKeyDown={onKeyDown}
            className={cx(
              'group/slide relative flex cursor-default gap-2 rounded-md p-2 outline-none select-none',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus',
              isDragging ? 'cursor-grabbing bg-popover shadow-lg ring-1 ring-line' : 'hover:bg-surface-2/50',
            )}
          >
            <span
              aria-hidden
              className={cx('w-3.5 shrink-0 pt-px text-end text-2xs leading-4 font-semibold tabular-nums', active ? 'text-accent-fg' : 'text-text-3')}
            >
              {number}
            </span>
            {stacked ? (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {preview}
                <div className="flex min-h-6 items-center gap-1">
                  <span dir={rtl ? 'rtl' : 'auto'} lang={lang} className={cx('min-w-0 flex-1 truncate text-xs font-medium', title ? 'text-text' : 'text-text-3')}>
                    {title || t('No headline')}
                  </span>
                  {missingMark}
                  {beyond && <span className="shrink-0 text-2xs text-text-3">{t('Not exported')}</span>}
                </div>
              </div>
            ) : (
              <>
                {preview}
                <div className="flex min-w-0 flex-1 flex-col py-0.5">
                  <p
                    dir={rtl ? 'rtl' : 'auto'}
                    lang={lang}
                    className={cx('line-clamp-4 text-xs leading-4 font-medium break-words', title ? 'text-text' : 'text-text-3')}
                  >
                    {title || t('No headline')}
                  </p>
                  {subtitle && (
                    <p dir={rtl ? 'rtl' : 'auto'} lang={lang} className="mt-1 line-clamp-3 text-2xs leading-[14px] break-words text-text-3">
                      {subtitle}
                    </p>
                  )}
                  {(missing > 0 || beyond) && (
                    <div className="mt-2 flex flex-col gap-1 text-2xs leading-[14px] text-text-3">
                      {missing > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageOff className="size-3 shrink-0 text-warning" />
                          <span className="truncate">{missing < devices ? t('{missing} of {devices} missing', { missing, devices }) : missing > 1 ? t('No screenshots') : t('No screenshot')}</span>
                        </span>
                      )}
                      {beyond && <span className="truncate">{t('Not exported')}</span>}
                    </div>
                  )}
                  <div className="mt-auto flex justify-end pt-2">{actions}</div>
                </div>
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[220px]">
          <ContextMenuItem icon={<Plus />} disabled={count >= MAX_SLIDES} onSelect={() => addSlideAfter(slide.id)}>
            {t('New slide after')}
          </ContextMenuItem>
          <ContextMenuItem icon={<Copy />} disabled={count >= MAX_SLIDES} onSelect={() => useEditor.getState().duplicateSlide(slide.id)}>
            {t('Duplicate')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<ArrowUp />} disabled={index === 0} shortcut={MOVE_UP_KEYS} onSelect={() => onMove(slide.id, -1)}>
            {t('Move up')}
          </ContextMenuItem>
          <ContextMenuItem icon={<ArrowDown />} disabled={index === count - 1} shortcut={MOVE_DOWN_KEYS} onSelect={() => onMove(slide.id, 1)}>
            {t('Move down')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Trash2 />} danger disabled={!canDelete} shortcut="backspace" onSelect={() => void deleteSlideWithConfirm(slide.id)}>
            {t('Delete slide')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}, sameItem);

import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEventHandler } from 'react';
import { DndContext, closestCenter, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  RotateCcw,
  Shapes,
  Trash2,
  Type,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { FAMILIES } from '../../../model/catalog';
import { resolveLayout } from '../../../model/resolve';
import type { FamilyId, SlideElement } from '../../../model/types';
import { selectActiveLayout, selectActiveSlide, selectActiveSlideIndex, toast, useEditor } from '../../../store';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  EmptyState,
  IconButton,
  ListRow,
  ScrollArea,
  Tooltip,
  cx,
} from '../../kit';
import { isListDragging, setListDragging } from '../chrome';
import { FRAME_ICONS } from '../familyMeta';
import { shortcutKeys } from '../shortcuts';
import { AddElementMenu } from './AddElementMenu';
import { MOVE_DOWN_KEYS, MOVE_UP_KEYS, moveDelta, restrictToVerticalAxis, scrollIntoViewWithin, sortInstructions, useListSensors } from './dnd';
import { elementLabel } from './labels';

const NO_ELEMENTS: readonly SlideElement[] = [];
const MODIFIERS = [restrictToVerticalAxis];

/** Icon for a layer row by kind (devices by frame). */
function layerIcon(el: SlideElement): LucideIcon {
  switch (el.kind) {
    case 'text':
      return Type;
    case 'device':
      return FRAME_ICONS[el.frame] ?? FRAME_ICONS.iphone;
    case 'shape':
      return Shapes;
    case 'image':
      return ImageIcon;
    default:
      return Layers;
  }
}

/** Display position (topmost first) of a layer id in the active layout. */
const layerPosition = (id: string | number) => {
  const s = useEditor.getState();
  const slide = selectActiveSlide(s);
  if (!s.project || !slide) return 0;
  const els = resolveLayout(s.project, slide, s.activeFamily).elements;
  const i = els.findIndex((e) => e.id === id);
  return i < 0 ? 0 : els.length - i;
};

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Picked up layer ${layerPosition(active.id)}.`,
  onDragOver: ({ active, over }) => (over ? `Layer ${layerPosition(active.id)} is over position ${layerPosition(over.id)}.` : undefined),
  // Announced after the store restacked, so the layer's own position is its new one.
  onDragEnd: ({ active }) => `Layer dropped at position ${layerPosition(active.id)}.`,
  onDragCancel: () => 'Moving cancelled. The layer stays in place.',
};

const ACCESSIBILITY = { announcements: ANNOUNCEMENTS, screenReaderInstructions: { draggable: sortInstructions('layer') } };

/**
 * Layers of the active slide in the active family, topmost first: select,
 * hover to highlight on the stage, hide and lock toggles, double-click (or
 * F2) to rename, drag (or Mod+arrow keys) to restack, and a context menu.
 */
export function LayersPanel() {
  const project = useEditor((s) => s.project);
  const slide = useEditor(selectActiveSlide);
  const slideIndex = useEditor(selectActiveSlideIndex);
  const family = useEditor((s) => s.activeFamily);
  const lang = useEditor((s) => s.activeLang);
  const selection = useEditor((s) => s.selection);
  const sensors = useListSensors();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // What the last keyboard or menu restack did, for screen readers (dnd-kit announces pointer drags itself).
  const [moved, setMoved] = useState('');

  const layout = project && slide ? resolveLayout(project, slide, family) : null;
  const elements = layout?.elements ?? NO_ELEMENTS;
  const rows = useMemo(() => [...elements].reverse(), [elements]);
  const ids = useMemo(() => rows.map((e) => e.id), [rows]);

  // Stage highlights follow the pointer only while it is over the list.
  useEffect(() => () => useEditor.getState().hover(null), []);

  // A drag cut short by unmounting never reports its end; the editor shortcuts must not stay paused.
  useEffect(() => () => setListDragging(false), []);

  // Keep the selected layer in view when it is picked on the stage.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !selection) return;
    const el = viewport.querySelector<HTMLElement>(`[data-layer-id="${selection}"]`);
    if (el) scrollIntoViewWithin(viewport, el, 4);
  }, [selection]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setListDragging(false);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const s = useEditor.getState();
    const current = selectActiveSlide(s);
    if (!s.project || !current) return;
    const els = resolveLayout(s.project, current, s.activeFamily).elements;
    const to = els.findIndex((x) => x.id === over.id);
    // Rows are listed topmost first; the store counts painter's order from the bottom, which maps one to one.
    if (to >= 0) s.reorderElement(current.id, s.activeFamily, String(active.id), to);
  }, []);

  const onRenamingChange = useCallback((id: string, editing: boolean) => {
    setRenaming((cur) => (editing ? id : cur === id ? null : cur));
  }, []);

  const onMove = useCallback((slideId: string, fam: FamilyId, id: string, delta: -1 | 1) => {
    const ed = useEditor.getState();
    // Rows are listed topmost first: up the list is forward in the stack.
    if (!(delta < 0 ? ed.bringForward(slideId, fam, id) : ed.sendBackward(slideId, fam, id))) return;
    const count = selectActiveLayout(useEditor.getState())?.elements.length ?? 0;
    setMoved(`Layer moved to position ${layerPosition(id)} of ${count}.`);
    // React keeps focus on the moved row but restores the list's scroll position; follow the row.
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const el = viewport?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
      if (viewport && el) scrollIntoViewWithin(viewport, el, 4);
    });
  }, []);

  if (!project || !slide || !layout) return null;

  const primary = project.families[0];
  const own = !!slide.layouts[family];
  const ctx = { slide, lang, baseLang: project.languages[0] ?? lang, assets: project.assets };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 pr-2 pl-3">
        <span className="text-xs font-semibold text-text">Slide {slideIndex + 1}</span>
        <span className="truncate text-2xs text-text-3">· {FAMILIES[family].label}</span>
        <span className="ml-auto" />
        <AddElementMenu />
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-start justify-center pt-6">
          <EmptyState
            size="sm"
            icon={<Layers />}
            title="This slide is empty"
            description="Add a headline, a device with your screenshot, shapes or images."
            actions={<AddElementMenu variant="button" align="start" />}
          />
        </div>
      ) : (
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
              <div
                role="listbox"
                aria-label={`Layers of slide ${slideIndex + 1}`}
                className="flex flex-col gap-px px-1.5 pb-2"
                onPointerLeave={() => useEditor.getState().hover(null)}
              >
                {rows.map((el) => (
                  <LayerRow
                    key={el.id}
                    el={el}
                    label={elementLabel(el, ctx)}
                    selected={el.id === selection}
                    slideId={slide.id}
                    family={family}
                    editing={renaming === el.id}
                    onEditingChange={onRenamingChange}
                    onMove={onMove}
                    isTop={el === rows[0]}
                    isBottom={el === rows[rows.length - 1]}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>
      )}
      <div aria-live="polite" aria-atomic className="sr-only">
        {moved}
      </div>

      {family !== primary && (
        <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-line py-1.5 pr-2 pl-3 text-2xs text-text-3">
          {own ? <Unlink className="size-3.5 shrink-0" /> : <Link2 className="size-3.5 shrink-0 text-accent-fg" />}
          <span className="min-w-0 flex-1 leading-[14px]">
            {own ? `Own ${FAMILIES[family].shortLabel} layout` : `Follows the ${FAMILIES[primary].shortLabel} layout until edited`}
          </span>
          {own && (
            <Tooltip content={`Follow the ${FAMILIES[primary].label} layout instead`} side="top">
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<RotateCcw />}
                onClick={() => {
                  if (useEditor.getState().resetLayout(slide.id, family)) toast.success('Layout reset', `It now follows the ${FAMILIES[primary].label} layout.`);
                }}
              >
                Reset
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

interface LayerRowProps {
  el: SlideElement;
  label: string;
  selected: boolean;
  slideId: string;
  family: FamilyId;
  editing: boolean;
  onEditingChange(id: string, editing: boolean): void;
  /** Moves the layer one row up (-1, forward) or down (1, backward) and tells screen readers. */
  onMove(slideId: string, family: FamilyId, id: string, delta: -1 | 1): void;
  isTop: boolean;
  isBottom: boolean;
}

const LayerRow = memo(function LayerRow({ el, label, selected, slideId, family, editing, onEditingChange, onMove, isTop, isBottom }: LayerRowProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: el.id,
    attributes: { role: 'option', roleDescription: 'sortable layer' },
  });
  const icon = createElement(layerIcon(el));
  const ed = useEditor.getState;
  // Renaming starts once the context menu has closed, or its focus return would end it at once.
  const renameAfterMenu = useRef(false);
  const hidden = !!el.hidden;
  const locked = !!el.locked;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ListRow
          ref={setNodeRef}
          data-layer-id={el.id}
          style={{ transform: DndCSS.Translate.toString(transform), transition }}
          aria-roledescription={attributes['aria-roledescription']}
          aria-describedby={attributes['aria-describedby']}
          onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
          onKeyDown={(e) => {
            // A pointer drag keeps the keys until it ends (Escape cancels it).
            if (isListDragging() || e.defaultPrevented || e.target !== e.currentTarget) return;
            const delta = moveDelta(e);
            if (delta !== 0) {
              // Claimed even at either end of the list, where the browser would scroll it instead.
              e.preventDefault();
              onMove(slideId, family, el.id, delta);
              return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            // The focused row is deleted (it may not be the selected one), then focus moves to its neighbour.
            e.preventDefault();
            const row = e.currentTarget;
            const list = row.closest('[role="listbox"]');
            const neighbour = (row.nextElementSibling ?? row.previousElementSibling)?.getAttribute('data-layer-id');
            if (ed().deleteElement(slideId, family, el.id) && neighbour) {
              requestAnimationFrame(() => list?.querySelector<HTMLElement>(`[data-layer-id="${neighbour}"]`)?.focus());
            }
          }}
          onPointerEnter={() => ed().hover(el.id)}
          onContextMenu={() => ed().select(el.id)}
          label={label}
          icon={icon}
          selected={selected}
          muted={hidden}
          onSelect={() => ed().select(el.id)}
          onRename={(name) => ed().updateElement(slideId, family, el.id, { name })}
          renameValue={el.name?.trim() || label}
          editing={editing}
          onEditingChange={(v) => onEditingChange(el.id, v)}
          trailingVisible={hidden || locked}
          className={cx(isDragging && 'z-10 bg-popover! shadow-md ring-1 ring-line')}
          trailing={
            <span className="flex items-center" onPointerDown={(e) => e.stopPropagation()}>
              <IconButton
                size="sm"
                tooltip={false}
                tabIndex={-1}
                label={locked ? 'Unlock' : 'Lock'}
                icon={locked ? <Lock /> : <LockOpen />}
                className={cx('size-5!', !locked && 'opacity-60 hover:opacity-100')}
                onClick={(e) => {
                  e.stopPropagation();
                  ed().toggleLocked(slideId, family, el.id);
                }}
              />
              <IconButton
                size="sm"
                tooltip={false}
                tabIndex={-1}
                label={hidden ? 'Show' : 'Hide'}
                icon={hidden ? <EyeOff /> : <Eye />}
                className={cx('size-5!', !hidden && 'opacity-60 hover:opacity-100')}
                onClick={(e) => {
                  e.stopPropagation();
                  ed().toggleHidden(slideId, family, el.id);
                }}
              />
            </span>
          }
        />
      </ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-[220px]"
        onCloseAutoFocus={(e) => {
          if (!renameAfterMenu.current) return;
          renameAfterMenu.current = false;
          e.preventDefault();
          onEditingChange(el.id, true);
        }}
      >
        <ContextMenuItem
          icon={<Pencil />}
          shortcut="F2"
          onSelect={() => {
            renameAfterMenu.current = true;
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem icon={<Copy />} shortcut={shortcutKeys('duplicate')} onSelect={() => ed().duplicateElement(slideId, family, el.id)}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<ArrowUpToLine />} disabled={isTop} onSelect={() => ed().bringToFront(slideId, family, el.id)}>
          Bring to front
        </ContextMenuItem>
        <ContextMenuItem icon={<ChevronUp />} disabled={isTop} shortcut={MOVE_UP_KEYS} onSelect={() => onMove(slideId, family, el.id, -1)}>
          Bring forward
        </ContextMenuItem>
        <ContextMenuItem icon={<ChevronDown />} disabled={isBottom} shortcut={MOVE_DOWN_KEYS} onSelect={() => onMove(slideId, family, el.id, 1)}>
          Send backward
        </ContextMenuItem>
        <ContextMenuItem icon={<ArrowDownToLine />} disabled={isBottom} onSelect={() => ed().sendToBack(slideId, family, el.id)}>
          Send to back
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={hidden ? <Eye /> : <EyeOff />} onSelect={() => ed().toggleHidden(slideId, family, el.id)}>
          {hidden ? 'Show' : 'Hide'}
        </ContextMenuItem>
        <ContextMenuItem icon={locked ? <LockOpen /> : <Lock />} onSelect={() => ed().toggleLocked(slideId, family, el.id)}>
          {locked ? 'Unlock' : 'Lock'}
        </ContextMenuItem>
        {el.name && (
          <ContextMenuItem icon={<RotateCcw />} onSelect={() => ed().updateElement(slideId, family, el.id, { name: '' })}>
            Use automatic name
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger shortcut="backspace" onSelect={() => ed().deleteElement(slideId, family, el.id)}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

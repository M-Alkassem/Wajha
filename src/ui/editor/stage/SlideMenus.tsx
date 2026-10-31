/**
 * Menus of the stage: element and slide context menus, the slide header's
 * "More" menu and the empty-stage menu. Entries are plain data rendered by
 * either menu flavour, so the context menu and the dropdown never drift.
 */
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  ImageUp,
  Lock,
  LockOpen,
  Maximize,
  Plus,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { DeviceElement, FamilyId, SlideElement } from '../../../model/types';
import { resolveLayout, resolveShot } from '../../../model/resolve';
import { MAX_SLIDES, useEditor } from '../../../store';
import { ContextMenuItem, ContextMenuSeparator, DropdownMenuItem, DropdownMenuSeparator } from '../../kit';
import { pickScreenshotsForSlot } from '../importShots';
import { shortcutKeys, type EditorShortcutId } from '../shortcuts';
import { addSlideAfter, deleteSlideWithConfirm } from '../sidebar/slideActions';

import { t } from '../../../i18n';
/** Shortcut labels come from the editor's shortcut table, so menus only show keys that are bound. */
const keysOf = (id: EditorShortcutId): string | undefined => {
  try {
    return shortcutKeys(id);
  } catch {
    return undefined;
  }
};

export interface MenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export type MenuEntry = MenuAction | 'separator';

/** Drops separators at the ends and doubled ones (after optional entries were left out). */
export function tidyEntries(entries: readonly (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (!e) continue;
    if (e === 'separator' && (out.length === 0 || out[out.length - 1] === 'separator')) continue;
    out.push(e);
  }
  while (out[out.length - 1] === 'separator') out.pop();
  return out;
}

export function renderContextEntries(entries: readonly MenuEntry[]): ReactNode {
  return entries.map((e, i) =>
    e === 'separator' ? (
      <ContextMenuSeparator key={`sep-${i}`} />
    ) : (
      <ContextMenuItem key={e.key} icon={e.icon} shortcut={e.shortcut} danger={e.danger} disabled={e.disabled} onSelect={e.run}>
        {e.label}
      </ContextMenuItem>
    ),
  );
}

export function renderDropdownEntries(entries: readonly MenuEntry[]): ReactNode {
  return entries.map((e, i) =>
    e === 'separator' ? (
      <DropdownMenuSeparator key={`sep-${i}`} />
    ) : (
      <DropdownMenuItem key={e.key} icon={e.icon} shortcut={e.shortcut} danger={e.danger} disabled={e.disabled} onSelect={e.run}>
        {e.label}
      </DropdownMenuItem>
    ),
  );
}

function deviceHasShot(slideId: string, family: FamilyId, device: DeviceElement): boolean {
  const s = useEditor.getState();
  const slide = s.project?.slides.find((x) => x.id === slideId);
  if (!s.project || !slide) return false;
  return resolveShot(slide, family, device.slot, s.activeLang, s.project.languages[0]) !== null;
}

/** Makes `elementId` the selection on its slide, so clipboard actions act on it. */
function ensureSelected(slideId: string, elementId: string): void {
  const s = useEditor.getState();
  if (s.activeSlideId !== slideId || s.selection !== elementId) s.select(elementId, slideId);
}

export function elementEntries(slideId: string, family: FamilyId, el: SlideElement): MenuEntry[] {
  const s = useEditor.getState();
  const slide = s.project?.slides.find((x) => x.id === slideId);
  const elements = s.project && slide ? resolveLayout(s.project, slide, family).elements : [];
  const index = elements.findIndex((e) => e.id === el.id);
  const top = index >= elements.length - 1;
  const bottom = index <= 0;
  const id = el.id;
  const store = () => useEditor.getState();
  return tidyEntries([
    el.kind === 'device' && {
      key: 'shot',
      label: deviceHasShot(slideId, family, el) ? t('Replace screenshot…') : t('Add screenshot…'),
      icon: <ImageUp />,
      run: () => void pickScreenshotsForSlot(slideId, el.slot),
    },
    'separator',
    { key: 'duplicate', label: t('Duplicate'), icon: <CopyPlus />, shortcut: keysOf('duplicate'), run: () => store().duplicateElement(slideId, family, id) },
    {
      key: 'copy',
      label: t('Copy'),
      icon: <ClipboardCopy />,
      shortcut: keysOf('copy'),
      run: () => {
        ensureSelected(slideId, id);
        store().copySelection();
      },
    },
    {
      key: 'cut',
      label: t('Cut'),
      icon: <Scissors />,
      shortcut: keysOf('cut'),
      run: () => {
        ensureSelected(slideId, id);
        store().cutSelection();
      },
    },
    {
      key: 'paste',
      label: t('Paste'),
      icon: <ClipboardPaste />,
      shortcut: keysOf('paste'),
      disabled: s.clipboard === null,
      run: () => {
        ensureSelected(slideId, id);
        store().paste();
      },
    },
    'separator',
    { key: 'forward', label: t('Bring forward'), icon: <ArrowUp />, disabled: top, run: () => store().bringForward(slideId, family, id) },
    { key: 'backward', label: t('Send backward'), icon: <ArrowDown />, disabled: bottom, run: () => store().sendBackward(slideId, family, id) },
    { key: 'front', label: t('Bring to front'), icon: <ArrowUpToLine />, disabled: top, run: () => store().bringToFront(slideId, family, id) },
    { key: 'back', label: t('Send to back'), icon: <ArrowDownToLine />, disabled: bottom, run: () => store().sendToBack(slideId, family, id) },
    'separator',
    { key: 'hide', label: t('Hide'), icon: <EyeOff />, run: () => store().toggleHidden(slideId, family, id) },
    {
      key: 'lock',
      label: el.locked ? t('Unlock') : t('Lock'),
      icon: el.locked ? <LockOpen /> : <Lock />,
      run: () => store().toggleLocked(slideId, family, id),
    },
    'separator',
    { key: 'delete', label: t('Delete'), icon: <Trash2 />, shortcut: keysOf('delete'), danger: true, run: () => store().deleteElement(slideId, family, id) },
  ]);
}

export function slideEntries(slideId: string, family: FamilyId): MenuEntry[] {
  const s = useEditor.getState();
  const p = s.project;
  const slide = p?.slides.find((x) => x.id === slideId);
  const count = p?.slides.length ?? 0;
  const device = p && slide ? (resolveLayout(p, slide, family).elements.find((e): e is DeviceElement => e.kind === 'device') ?? null) : null;
  const full = count >= MAX_SLIDES;
  const store = () => useEditor.getState();
  return tidyEntries([
    { key: 'add', label: t('Add slide'), icon: <Plus />, disabled: full, run: () => addSlideAfter(slideId) },
    { key: 'duplicate-slide', label: t('Duplicate slide'), icon: <Copy />, disabled: full, run: () => store().duplicateSlide(slideId) },
    device && {
      key: 'shot',
      label: deviceHasShot(slideId, family, device) ? t('Replace screenshot…') : t('Add screenshot…'),
      icon: <ImageUp />,
      run: () => void pickScreenshotsForSlot(slideId, device.slot),
    },
    {
      key: 'paste',
      label: t('Paste'),
      icon: <ClipboardPaste />,
      shortcut: keysOf('paste'),
      disabled: s.clipboard === null,
      run: () => {
        if (store().activeSlideId !== slideId) store().setActiveSlide(slideId);
        store().paste();
      },
    },
    'separator',
    // Same as the slides list: a slide with texts or screenshots asks first.
    { key: 'delete-slide', label: t('Delete slide'), icon: <Trash2 />, danger: true, disabled: count <= 1, run: () => void deleteSlideWithConfirm(slideId) },
  ]);
}

/** Menu of the empty stage around the slides. */
export function stageEntries(): MenuEntry[] {
  const s = useEditor.getState();
  const p = s.project;
  const count = p?.slides.length ?? 0;
  const last = p?.slides[count - 1];
  return tidyEntries([
    { key: 'add', label: t('Add slide'), icon: <Plus />, disabled: !last || count >= MAX_SLIDES, run: () => last && addSlideAfter(last.id) },
    { key: 'paste', label: t('Paste'), icon: <ClipboardPaste />, shortcut: keysOf('paste'), disabled: s.clipboard === null || !s.activeSlideId, run: () => useEditor.getState().paste() },
    'separator',
    { key: 'fit', label: t('Zoom to fit'), icon: <Maximize />, shortcut: keysOf('zoomFit'), disabled: s.fit, run: () => useEditor.getState().setFit(true) },
  ]);
}

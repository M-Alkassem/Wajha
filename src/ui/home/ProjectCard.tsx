import { Fragment, memo, useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Copy, Ellipsis, FileDown, Languages, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { FamilyId, ProjectMeta } from '../../model/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  matchShortcut,
  platformIsMac,
  Spinner,
  Tooltip,
} from '../kit';
import { FamilyGlyph } from './FamilyGlyph';
import { formatEdited, isGridKey, listFamilies, plural, type GridKey } from './format';
import { useDelayedFlag, useNow, useTruncationTooltip } from './hooks';
import {
  cancelRename,
  deleteProjectWithConfirm,
  duplicateProjectById,
  exportProjectFile,
  openProject,
  renameProject,
  renameWhenMenuCloses,
  startPendingRename,
  startRename,
  useLibrary,
} from './library';
import { ProjectThumb } from './ProjectThumb';

import { t } from '../../i18n';
export interface ProjectCardProps {
  meta: ProjectMeta;
  index: number;
  /** The grid's roving tab stop. */
  tabbable: boolean;
  /** Briefly rings the card (a new copy, a renamed card). */
  highlighted: boolean;
  registerButton(id: string, el: HTMLButtonElement | null): void;
  onFocusIndex(index: number): void;
  onNavigate(index: number, key: GridKey): void;
}

/** Card shell shared with the "New project" tile and the skeletons. */
export const CARD_CLASS =
  'group/card relative flex flex-col rounded-lg border border-line bg-surface p-1.5 shadow-[var(--highlight)] light:bg-raised light:shadow-sm ' +
  'transition-[border-color,box-shadow,translate] duration-(--dur) ease-out';

/** Hover lift, kept while the card's context menu (data-state) or "…" menu (MENU_LIFT) is open. */
const LIFT =
  'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg motion-reduce:hover:translate-y-0 ' +
  'data-[state=open]:-translate-y-0.5 data-[state=open]:border-line-strong data-[state=open]:shadow-lg motion-reduce:data-[state=open]:translate-y-0';
const MENU_LIFT = '-translate-y-0.5 border-line-strong shadow-lg motion-reduce:translate-y-0';
/** The "Opening…" veil waits this long: most projects open before it would show, and a one-frame flash looks broken. */
const OPENING_VEIL_DELAY_MS = 150;

/** A project in the library grid: open on click or Enter, menus for everything else. */
export const ProjectCard = memo(function ProjectCard({ meta, index, tabbable, highlighted, registerButton, onFocusIndex, onNavigate }: ProjectCardProps) {
  const id = meta.id;
  const busy = useLibrary((s) => s.busy[id]);
  const renaming = useLibrary((s) => s.renamingId === id);
  const descId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const nameTip = useTruncationTooltip([nameRef]);
  // Radix makes the page inert while a menu is open, so hover alone cannot keep the card lifted.
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu unmounts while the card is busy; it must not pop back open afterwards.
  if (busy && menuOpen) setMenuOpen(false);
  const opening = useDelayedFlag(busy === 'opening', OPENING_VEIL_DELAY_MS);

  const setButton = useCallback(
    (el: HTMLButtonElement | null) => {
      buttonRef.current = el;
      registerButton(id, el);
    },
    [id, registerButton],
  );

  const onCloseAutoFocus = useCallback(
    (e: Event) => {
      if (startPendingRename(id)) e.preventDefault();
    },
    [id],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (isGridKey(e.key) && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      onNavigate(index, e.key);
      return;
    }
    const mac = platformIsMac();
    if (matchShortcut(e, 'f2', mac)) {
      e.preventDefault();
      startRename(id);
    } else if (matchShortcut(e, 'mod+d', mac)) {
      e.preventDefault();
      void duplicateProjectById(id);
    } else if (matchShortcut(e, 'delete', mac) || matchShortcut(e, 'backspace', mac)) {
      e.preventDefault();
      void deleteProjectWithConfirm(id);
    }
  };

  const actions: MenuAction[] = [
    { key: 'open', label: t('Open'), icon: <SquareArrowOutUpRight />, shortcut: 'enter', run: () => void openProject(id) },
    { key: 'rename', label: t('Rename'), icon: <Pencil />, shortcut: 'f2', run: () => renameWhenMenuCloses(id) },
    { key: 'duplicate', label: t('Duplicate'), icon: <Copy />, shortcut: 'mod+d', run: () => void duplicateProjectById(id) },
    { key: 'export', label: t('Export as file…'), icon: <FileDown />, run: () => void exportProjectFile(id) },
    { key: 'delete', label: t('Delete…'), icon: <Trash2 />, shortcut: platformIsMac() ? 'backspace' : 'delete', danger: true, run: () => void deleteProjectWithConfirm(id) },
  ];
  const disabled = !!busy;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={renaming}>
        <div
          aria-busy={disabled || undefined}
          data-project-id={id}
          className={cx(
            CARD_CLASS,
            !renaming && LIFT,
            menuOpen && MENU_LIFT,
            highlighted && 'ring-2 ring-accent',
            busy === 'deleting' && 'opacity-60',
          )}
        >
          {/* The whole card is the open button; the name field and the menu button sit above it. A cut-off name shows in full on hover. */}
          <Tooltip content={<span dir="auto">{meta.name}</span>} side="bottom" align="start" open={nameTip.open} onOpenChange={nameTip.onOpenChange}>
            <button
              ref={setButton}
              type="button"
              tabIndex={tabbable ? 0 : -1}
              aria-label={t('Open {name}', { name: meta.name })}
              aria-describedby={descId}
              onClick={() => void openProject(id)}
              onFocus={() => onFocusIndex(index)}
              onKeyDown={onKeyDown}
              className="absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </Tooltip>
          <ProjectThumb id={id} name={meta.name} updatedAt={meta.updatedAt} families={meta.families} opening={opening} className="rounded-[6px]" />
          <div className="flex items-start gap-1 pt-2.5 pe-0.5 pb-1 ps-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {renaming ? (
                <RenameField
                  initial={meta.name}
                  onCommit={(name, viaKeyboard) => void renameProject(id, name, viaKeyboard)}
                  onCancel={(viaKeyboard) => {
                    cancelRename();
                    if (viaKeyboard) buttonRef.current?.focus();
                  }}
                />
              ) : (
                <span ref={nameRef} aria-hidden dir="auto" className="block h-5 truncate text-start text-ui leading-5 font-medium text-text">
                  {meta.name}
                </span>
              )}
              <CardMeta descId={descId} updatedAt={meta.updatedAt} families={meta.families} languages={meta.languages.length} />
            </div>
            <div className="relative z-[2] flex size-6 shrink-0 items-center justify-center">
              {busy && busy !== 'opening' ? (
                <Spinner size={14} label={busyLabel(busy)} className="text-text-3" />
              ) : (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild disabled={disabled || renaming}>
                    <IconButton
                      size="sm"
                      label={t('Actions for {name}', { name: meta.name })}
                      tooltip={t('More actions')}
                      icon={<Ellipsis />}
                      tabIndex={tabbable ? 0 : -1}
                      className={cx(
                        'opacity-0 transition-opacity duration-(--dur-fast) group-focus-within/card:opacity-100 group-hover/card:opacity-100',
                        'focus-visible:opacity-100 aria-expanded:bg-surface-2 aria-expanded:text-text aria-expanded:opacity-100',
                      )}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[200px]" onCloseAutoFocus={onCloseAutoFocus}>
                    {renderItems(actions, DropdownMenuItem, DropdownMenuSeparator)}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]" onCloseAutoFocus={onCloseAutoFocus}>
        {renderItems(actions, ContextMenuItem, ContextMenuSeparator, disabled)}
      </ContextMenuContent>
    </ContextMenu>
  );
});

function busyLabel(busy: string): string {
  switch (busy) {
    case 'renaming':
      return 'Renaming';
    case 'duplicating':
      return 'Duplicating';
    case 'exporting':
      return 'Exporting';
    case 'deleting':
      return 'Deleting';
    default:
      return 'Working';
  }
}

interface MenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  danger?: boolean;
  run(): void;
}

type ItemComponent = typeof DropdownMenuItem | typeof ContextMenuItem;
type SeparatorComponent = typeof DropdownMenuSeparator | typeof ContextMenuSeparator;

function renderItems(actions: MenuAction[], Item: ItemComponent, Separator: SeparatorComponent, disabled = false) {
  return actions.map((a) => (
    <Fragment key={a.key}>
      {a.danger && <Separator />}
      <Item icon={a.icon} shortcut={a.shortcut} danger={a.danger} disabled={disabled && a.key !== 'open'} onSelect={a.run}>
        {a.label}
      </Item>
    </Fragment>
  ));
}

const CardMeta = memo(function CardMeta({ descId, updatedAt, families, languages }: { descId: string; updatedAt: number; families: FamilyId[]; languages: number }) {
  const now = useNow();
  const shown = families.slice(0, 3);
  return (
    // Hidden from the tree but still the open button's description (aria-describedby reads hidden text).
    <span id={descId} aria-hidden className="flex h-4 min-w-0 items-center gap-1.5 text-xs leading-4 text-text-3">
      <span className="truncate">{formatEdited(updatedAt, now)}</span>
      <span aria-hidden className="text-line-strong">
        ·
      </span>
      <span aria-hidden className="flex shrink-0 items-center gap-0.5">
        {shown.map((f) => (
          <FamilyGlyph key={f} family={f} size={12} />
        ))}
        {families.length > shown.length && <span className="text-2xs">+{families.length - shown.length}</span>}
      </span>
      <span aria-hidden className="flex shrink-0 items-center gap-0.5 tabular-nums">
        <Languages className="size-3" />
        {languages}
      </span>
      <span className="sr-only">{['', listFamilies(families), plural(languages, 'language')].filter((x, i) => i === 0 || x).join(', ')}</span>
    </span>
  );
});

function RenameField({ initial, onCommit, onCancel }: { initial: string; onCommit(name: string, viaKeyboard: boolean): void; onCancel(viaKeyboard: boolean): void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Enter unmounts the field, which can also blur it: finish once.
  const done = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean, viaKeyboard: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && value.trim() && value.trim() !== initial) onCommit(value, viaKeyboard);
    else onCancel(viaKeyboard);
  };

  return (
    <input
      ref={ref}
      dir="auto"
      value={value}
      maxLength={200}
      aria-label={t('Project name')}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false, true);
        }
      }}
      onBlur={() => finish(true, false)}
      // Left-aligned like the name it edits, so an Arabic name does not jump sides on Enter.
      className="relative z-[2] -mx-[5px] h-5 min-w-0 rounded-xs border border-accent-line bg-surface px-1 text-start text-ui leading-[18px] font-medium text-text ring-2 ring-focus-soft outline-none light:bg-raised"
    />
  );
}

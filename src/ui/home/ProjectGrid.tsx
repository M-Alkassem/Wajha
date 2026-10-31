import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ProjectMeta } from '../../model/types';
import { cx, Skeleton } from '../kit';
import { gridNeighbor, isGridKey, type GridKey } from './format';
import { useHomeUi } from './homeUi';
import { useLibrary } from './library';
import { CARD_CLASS, ProjectCard } from './ProjectCard';

import { t } from '../../i18n';
/** Shared by the grid, its skeleton and the featured templates: cards at least 232 px wide. */
export const GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-5';

const NEW_TILE = '\u0000new';

export interface ProjectGridProps {
  projects: ProjectMeta[];
  /** Leads the grid with a "New project" tile (hidden while searching). */
  showNewTile: boolean;
}

/**
 * The library grid. One roving tab stop: Tab enters the grid on the last
 * focused card, arrow keys move between cards (rows wrap), Home and End
 * jump to the ends.
 */
export function ProjectGrid({ projects, showNewTile }: ProjectGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const ids = showNewTile ? [NEW_TILE, ...projects.map((p) => p.id)] : projects.map((p) => p.id);
  const idsRef = useRef(ids);
  useLayoutEffect(() => {
    idsRef.current = ids;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = Math.max(0, activeId ? ids.indexOf(activeId) : 0);

  const registerButton = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el);
    else buttons.current.delete(id);
  }, []);

  const focusId = useCallback((id: string) => {
    const el = buttons.current.get(id);
    if (!el) return false;
    el.focus();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }, []);

  const onFocusIndex = useCallback((index: number) => {
    const id = idsRef.current[index];
    if (id) setActiveId(id);
  }, []);

  const onNavigate = useCallback(
    (index: number, key: GridKey) => {
      const grid = gridRef.current;
      // The resolved track list ("250px 250px 250px") tells how many columns fit right now.
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 1;
      const next = gridNeighbor(index, key, idsRef.current.length, columns);
      if (next !== null) focusId(idsRef.current[next]);
    },
    [focusId],
  );

  // A card asked for focus (a fresh copy, a renamed card, the neighbour of a deleted one).
  // Handled once per request, as soon as that card is in the DOM (its button registers during
  // commit); focusing it makes it the tab stop through its onFocus.
  const focusRequest = useLibrary((s) => s.focusRequest);
  const flashId = useLibrary((s) => s.flashId);
  const handled = useRef(0);
  const idsKey = ids.join('\u0001');
  useLayoutEffect(() => {
    if (!focusRequest || focusRequest.nonce === handled.current || !idsRef.current.includes(focusRequest.id)) return;
    handled.current = focusRequest.nonce;
    focusId(focusRequest.id);
  }, [focusRequest, idsKey, focusId]);

  const tileIndex = showNewTile ? 1 : 0;

  return (
    <div ref={gridRef} role="list" aria-label={t('Projects')} className={GRID_CLASS}>
      {showNewTile && (
        <NewProjectTile
          tabbable={activeIndex === 0}
          registerButton={registerButton}
          onFocus={() => onFocusIndex(0)}
          onNavigate={(key) => onNavigate(0, key)}
        />
      )}
      {projects.map((meta, i) => (
        <div key={meta.id} role="listitem" className="home-rise" style={{ ['--i' as string]: Math.min(i, 12) }}>
          <ProjectCard
            meta={meta}
            index={i + tileIndex}
            tabbable={activeIndex === i + tileIndex}
            highlighted={flashId === meta.id}
            registerButton={registerButton}
            onFocusIndex={onFocusIndex}
            onNavigate={onNavigate}
          />
        </div>
      ))}
    </div>
  );
}

function NewProjectTile({
  tabbable,
  registerButton,
  onFocus,
  onNavigate,
}: {
  tabbable: boolean;
  registerButton(id: string, el: HTMLButtonElement | null): void;
  onFocus(): void;
  onNavigate(key: GridKey): void;
}) {
  const open = useHomeUi((s) => s.openNewProject);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (isGridKey(e.key) && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      onNavigate(e.key);
    }
  };
  return (
    <div role="listitem" className="home-rise flex">
      <button
        ref={(el) => registerButton(NEW_TILE, el)}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        onClick={() => open()}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className={cx(
          'group/tile flex min-h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong p-1.5 text-text-2 outline-none',
          'transition-[border-color,background-color,color] duration-(--dur) ease-out hover:border-accent-line hover:bg-accent-soft hover:text-text',
          'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-text-2 shadow-[var(--highlight)] transition-[scale,color,border-color] duration-(--dur) ease-out group-hover/tile:scale-105 group-hover/tile:border-accent-line group-hover/tile:text-accent-fg light:bg-raised motion-reduce:group-hover/tile:scale-100">
          <Plus className="size-[18px]" />
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <span className="text-ui font-medium text-text">{t('New project')}</span>
          <span className="text-xs text-text-3">{t('From a template or blank')}</span>
        </span>
      </button>
    </div>
  );
}

/** Placeholder grid while the library loads (shown only when loading is slow). */
export function ProjectGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden className={GRID_CLASS}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={CARD_CLASS}>
          <Skeleton height="auto" radius="sm" className="aspect-[16/10] w-full" />
          <div className="flex flex-col gap-2 px-1.5 pt-3 pb-2">
            <Skeleton width="58%" height={11} />
            <Skeleton width="38%" height={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

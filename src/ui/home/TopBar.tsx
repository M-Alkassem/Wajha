import { forwardRef, type KeyboardEvent } from 'react';
import { FolderOpen, Plus, Search, Settings, X } from 'lucide-react';
import { Wordmark } from '../brand/Wordmark';
import { Button, IconButton, Input, Kbd, Tooltip } from '../kit';
import { useHomeUi } from './homeUi';
import { openProjectFile, useLibrary } from './library';

export interface HomeTopBarProps {
  /** The project search is pointless on an empty library. */
  showSearch: boolean;
  /** Off on the first-run page, whose own primary button creates the first project. Default on. */
  showNewProject?: boolean;
  /** ArrowDown in the search field moves into the grid. */
  onSearchArrowDown?(): void;
}

/**
 * The 52 px window bar: wordmark, project search, Open file…, Settings and
 * New project (except on the first-run page). Empty areas drag the desktop window (each filler carries
 * data-tauri-drag-region itself) and the left inset keeps clear of the
 * macOS traffic lights.
 */
export const HomeTopBar = forwardRef<HTMLInputElement, HomeTopBarProps>(function HomeTopBar({ showSearch, showNewProject = true, onSearchArrowDown }, searchRef) {
  const query = useHomeUi((s) => s.query);
  const setQuery = useHomeUi((s) => s.setQuery);
  const openNew = useHomeUi((s) => s.openNewProject);
  const openSettings = useHomeUi((s) => s.setSettingsOpen);
  const importing = useLibrary((s) => s.importing);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        setQuery('');
      } else {
        e.currentTarget.blur();
      }
    } else if (e.key === 'ArrowDown' && onSearchArrowDown) {
      e.preventDefault();
      onSearchArrowDown();
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="relative z-10 grid h-[52px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,340px)_minmax(0,1fr)] items-center gap-4 border-b border-line bg-panel pr-3 pl-[calc(var(--traffic-lights-w)+16px)]"
    >
      <div data-tauri-drag-region className="flex h-full min-w-0 items-center">
        {/* Clicks fall through the wordmark to the drag region underneath. */}
        <span className="pointer-events-none flex">
          <Wordmark size="sm" />
        </span>
      </div>
      <div data-tauri-drag-region className="flex h-full min-w-0 items-center justify-center">
        {showSearch && (
          <Input
            ref={searchRef}
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects"
            aria-label="Search projects"
            leadingIcon={<Search />}
            suffix={
              query ? (
                <IconButton size="sm" label="Clear search" tooltip={false} icon={<X />} className="-mr-1 size-5" onClick={() => setQuery('')} />
              ) : (
                <Kbd keys="mod+f" className="opacity-80" />
              )
            }
            containerClassName="w-full"
          />
        )}
      </div>
      <div data-tauri-drag-region className="flex h-full min-w-0 items-center justify-end gap-1">
        <Tooltip content="Open a .wajha project" shortcut="mod+o">
          <Button variant="ghost" leadingIcon={<FolderOpen />} loading={importing} onClick={() => void openProjectFile()}>
            Open file…
          </Button>
        </Tooltip>
        <IconButton label="Settings" shortcut="mod+," icon={<Settings />} onClick={() => openSettings(true)} />
        {showNewProject && (
          <>
            <span data-tauri-drag-region className="mx-1.5 h-4 w-px bg-line" />
            <Tooltip content="Start a new project" shortcut="mod+n">
              <Button variant="primary" leadingIcon={<Plus />} onClick={() => openNew()}>
                New project
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
});

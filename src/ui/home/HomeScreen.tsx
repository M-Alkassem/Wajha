/** Home screen: project library, new-project flow, template gallery and settings. */
import './home.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { FileDown, SearchX, TriangleAlert } from 'lucide-react';
import { getPlatform, megabytes, OPEN_FILE_MAX_BYTES } from '../../platform';
import { toast, useApp } from '../../store';
import { Button, cx, EmptyState, matchShortcut, platformIsMac, ScrollArea } from '../kit';
import { EmptyLibrary } from './EmptyLibrary';
import { archiveKind, matchesSearch, plural, shorten } from './format';
import { useDelayedFlag } from './hooks';
import { useHomeUi } from './homeUi';
import { errorText, importProjectBytes, openProjectFile, refreshProjects, restoreReturnFocus, useLibrary } from './library';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectGrid, ProjectGridSkeleton } from './ProjectGrid';
import { SettingsDialog } from './SettingsDialog';
import { importTemplateBytes } from './sources';
import { cancelThumbnailRequests } from './thumbs';
import { HomeTopBar } from './TopBar';

export function HomeScreen() {
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasProjects = useLibrary((s) => s.status === 'ready' && s.projects.length > 0);
  // The first-run page has its own "Create your first project": one primary action per screen.
  const firstRun = useLibrary((s) => s.status === 'ready' && s.projects.length === 0);

  // Fresh list on every visit (returning from the editor), and when the window comes back.
  useEffect(() => {
    useHomeUi.getState().setQuery('');
    void refreshProjects().then(restoreReturnFocus);
    const onFocus = () => void refreshProjects();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshProjects();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      cancelThumbnailRequests();
    };
  }, []);

  useHomeShortcuts(searchRef);

  const focusFirstCard = useCallback(() => {
    contentRef.current?.querySelector<HTMLButtonElement>('[role="listitem"] button')?.focus();
  }, []);

  const drop = useArchiveDrop();

  return (
    <div className="relative flex h-full flex-col bg-app text-text" {...drop.handlers}>
      <HomeTopBar ref={searchRef} showSearch={hasProjects} showNewProject={!firstRun} onSearchArrowDown={focusFirstCard} />
      <main ref={contentRef} className="relative min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="size-full" contentStyle={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          <HomeContent />
        </ScrollArea>
        {drop.over && <DropOverlay />}
      </main>
      <NewProjectDialog />
      <SettingsDialog />
    </div>
  );
}

function HomeContent() {
  const status = useLibrary((s) => s.status);
  const projects = useLibrary((s) => s.projects);
  const error = useLibrary((s) => s.error);
  const slow = useDelayedFlag(status === 'loading', 200);

  if (status === 'loading') {
    return slow ? (
      <div className="mx-auto w-full max-w-[1680px] px-8 pt-7 pb-14">
        <div className="mb-5 h-12" />
        <ProjectGridSkeleton />
      </div>
    ) : null;
  }
  if (status === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<TriangleAlert />}
          title="Your projects could not be read"
          description={error ?? 'Something went wrong while reading the library.'}
          actions={<Button onClick={() => void refreshProjects()}>Try again</Button>}
        />
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="relative flex flex-1 flex-col">
        <PageGlow />
        <EmptyLibrary />
      </div>
    );
  }
  return <Library />;
}

/** A faint sunset glow at the top of the first-run page. */
function PageGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
      <div className="kit-glow absolute -top-[440px] left-1/2 h-[880px] w-[1460px] -translate-x-1/2 opacity-[0.11] light:opacity-[0.09]" />
    </div>
  );
}

function Library() {
  const projects = useLibrary((s) => s.projects);
  const query = useHomeUi((s) => s.query);
  const setQuery = useHomeUi((s) => s.setQuery);
  const searching = query.trim() !== '';
  const shown = useMemo(() => (searching ? projects.filter((p) => matchesSearch(query, p.name)) : projects), [projects, query, searching]);
  const where = getPlatform().kind === 'desktop' ? 'Saved on this computer' : 'Saved in this browser';
  const none = shown.length === 0;
  // Isolated, so a right-to-left query keeps its quotes around it.
  const quoted = <>“<bdi>{shorten(query, 40)}</bdi>”</>;
  const noMatch = <>No projects match {quoted}</>;

  return (
    <div className="mx-auto w-full max-w-[1680px] px-8 pt-7 pb-14">
      <div className="mb-5 flex min-h-12 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.02em] text-text">{searching ? 'Search results' : 'Projects'}</h1>
          {/* Announces every result count; no match only to screen readers, as the empty state below shows it. */}
          <p className={cx('text-xs text-text-3', none && 'sr-only')} aria-live="polite">
            {!searching ? `${plural(projects.length, 'project')} · ${where}` : none ? noMatch : <>{plural(shown.length, 'project')} matching {quoted}</>}
          </p>
        </div>
      </div>
      {none ? (
        <EmptyState
          className="py-20"
          icon={<SearchX />}
          title={noMatch}
          description={`Check the spelling, or clear the search to see ${projects.length === 1 ? 'your project' : `all ${projects.length} projects`}.`}
          actions={<Button onClick={() => setQuery('')}>Clear search</Button>}
        />
      ) : (
        <ProjectGrid projects={shown} showNewTile={!searching} />
      )}
    </div>
  );
}

/* Shortcuts ------------------------------------------------------------------- */

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** ⌘N new project, ⌘O open file, ⌘, settings, ⌘F or / search; idle while a dialog or menu is open. */
function useHomeShortcuts(searchRef: { current: HTMLInputElement | null }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const ui = useHomeUi.getState();
      if (ui.newProject || ui.settingsOpen || useApp.getState().confirmRequest) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const mac = platformIsMac();
      if (matchShortcut(e, 'mod+n', mac)) {
        e.preventDefault();
        ui.openNewProject();
      } else if (matchShortcut(e, 'mod+o', mac)) {
        e.preventDefault();
        void openProjectFile();
      } else if (matchShortcut(e, 'mod+,', mac)) {
        e.preventDefault();
        ui.setSettingsOpen(true);
      } else if (matchShortcut(e, 'mod+f', mac) || (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target))) {
        const input = searchRef.current;
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchRef]);
}

/* Drop to open ------------------------------------------------------------------- */

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

async function openDroppedFile(file: File): Promise<void> {
  const kind = archiveKind(file.name);
  if (!kind) {
    const image = /\.(png|jpe?g|webp)$/i.test(file.name);
    toast.error(
      `Wajha can’t open “${shorten(file.name, 48)}” here`,
      image ? 'Open a project first, then drop screenshots onto its slides.' : 'Drop a .wajha project or a .wajha-template file.',
    );
    return;
  }
  // Checked before reading: the open dialog applies the same limit.
  if (file.size > OPEN_FILE_MAX_BYTES[kind]) {
    toast.error(`Could not open “${shorten(file.name, 48)}”`, `The file is larger than ${megabytes(OPEN_FILE_MAX_BYTES[kind])}.`);
    return;
  }
  let data: Uint8Array;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    toast.error(`Could not read “${shorten(file.name, 48)}”`, errorText(e));
    return;
  }
  if (kind === 'project') {
    await importProjectBytes(data, file.name);
    return;
  }
  const template = await importTemplateBytes(data, file.name);
  if (template) useHomeUi.getState().openNewProject({ templateId: template.id, source: 'mine' });
}

/** Drag a .wajha (opens it) or a .wajha-template (adds it to My templates) anywhere onto the home screen. */
function useArchiveDrop() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  // A file dropped outside the screen (a dialog's backdrop) must not make the webview navigate to it.
  useEffect(() => {
    const block = (e: globalThis.DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void openDroppedFile(file);
    },
  };
  return { over, handlers };
}

function DropOverlay() {
  return (
    <div className="home-fade pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-line bg-[var(--glass)] backdrop-blur-md">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg [&_svg]:size-6">
          <FileDown />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold text-text">Drop to open</span>
          <span className="text-xs text-text-2">A .wajha project opens in the editor; a .wajha-template joins My templates.</span>
        </div>
      </div>
    </div>
  );
}

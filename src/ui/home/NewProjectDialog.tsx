import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Blend,
  Bookmark,
  Ellipsis,
  Feather,
  FileDown,
  FileUp,
  GalleryHorizontal,
  Gem,
  Globe,
  LayoutGrid,
  Moon,
  PartyPopper,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
  Type,
  WifiOff,
  X,
} from 'lucide-react';
import { REPO_URL } from '../../config';
import type { FamilyId, GalleryEntry, LangCode, Template, TemplateCategory } from '../../model/types';
import { getPlatform } from '../../platform';
import { createAndOpenProject, toast } from '../../store';
import { BUILTIN_TEMPLATES } from '../../templates';
import {
  Button,
  cx,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  matchShortcut,
  platformIsMac,
  ScrollArea,
  Tooltip,
} from '../kit';
import { listFamilies, plural, relativeEdited } from './format';
import { useHomeUi, type NewProjectRequest, type TemplateSource } from './homeUi';
import { errorText } from './library';
import { loadNewProjectPrefs, saveNewProjectPrefs } from './prefs';
import { DevicePicker, LanguagePicker, PreviewStage } from './SetupPanel';
import {
  deleteTemplateWithConfirm,
  exportTemplateFile,
  importTemplateFile,
  installFromGallery,
  loadGallery,
  refreshUserTemplates,
  useGallery,
  useUserTemplates,
} from './sources';
import { onTemplateGridKeyDown } from './gridKeys';
import { useNow } from './hooks';
import { BlankCard, GalleryCard, TEMPLATE_GRID_CLASS, TemplateCard, TemplateGridSkeleton } from './TemplateCard';
import { blankPreviewProject, CATEGORY_LABEL, CATEGORY_ORDER, countByCategory, galleryEntryMatches, templateMatches, templatePreviewProject } from './templates';

type Selection = { kind: 'blank' } | { kind: 'template'; template: Template; source: 'builtin' | 'user' };

const CATEGORY_ICON: Record<TemplateCategory, ReactNode> = {
  minimal: <Feather />,
  bold: <Type />,
  gradient: <Blend />,
  dark: <Moon />,
  playful: <PartyPopper />,
  panorama: <GalleryHorizontal />,
  elegant: <Gem />,
};
type Category = 'all' | TemplateCategory;

/**
 * "New project": pick a starting point (built-in templates by category, the
 * community gallery, My templates, or Blank) and set the project up
 * (name, device families, languages) with a live preview.
 */
export function NewProjectDialog() {
  const request = useHomeUi((s) => s.newProject);
  const close = useHomeUi((s) => s.closeNewProject);
  // The content stays mounted with the last request while the dialog animates out.
  const [last, setLast] = useState<NewProjectRequest | null>(request);
  if (request && request !== last) setLast(request);
  const busy = useRef(false);

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy.current) close();
      }}
    >
      {last && <NewProjectContent key={last.nonce} request={last} busyRef={busy} />}
    </Dialog>
  );
}

function initialSelection(request: NewProjectRequest, user: readonly Template[]): Selection {
  if (request.templateId === null) return { kind: 'blank' };
  if (request.templateId) {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === request.templateId);
    if (builtin) return { kind: 'template', template: builtin, source: 'builtin' };
    const mine = user.find((t) => t.id === request.templateId);
    if (mine) return { kind: 'template', template: mine, source: 'user' };
  }
  if (request.source === 'mine' && user[0]) return { kind: 'template', template: user[0], source: 'user' };
  const first = BUILTIN_TEMPLATES[0];
  return first ? { kind: 'template', template: first, source: 'builtin' } : { kind: 'blank' };
}

const nameFor = (s: Selection) => (s.kind === 'template' ? s.template.name : 'Untitled');
const BLANK: Selection = { kind: 'blank' };

function NewProjectContent({ request, busyRef }: { request: NewProjectRequest; busyRef: { current: boolean } }) {
  const userTemplates = useUserTemplates((s) => s.templates);
  const [prefs] = useState(loadNewProjectPrefs);
  const [source, setSource] = useState<TemplateSource>(() => {
    if (request.source) return request.source;
    if (request.templateId && !BUILTIN_TEMPLATES.some((t) => t.id === request.templateId)) return 'mine';
    return 'builtin';
  });
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [picked, setSelection] = useState<Selection>(() => initialSelection(request, userTemplates));
  const userStatus = useUserTemplates((s) => s.status);
  // A picked user template that has since been deleted reads as Blank.
  const selection: Selection =
    picked.kind === 'template' && picked.source === 'user' && userStatus === 'ready' && !userTemplates.some((t) => t.id === picked.template.id)
      ? BLANK
      : picked;
  const [name, setName] = useState(() => nameFor(selection));
  // Once the user types a name, picking another template no longer replaces it.
  const nameTouched = useRef(false);
  const [families, setFamilies] = useState<FamilyId[]>(prefs.families);
  const [languages, setLanguages] = useState<LangCode[]>(prefs.languages);
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const searchId = `${titleId}-search`;
  const bodyRef = useRef<HTMLDivElement>(null);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (!nameTouched.current) setName(nameFor(next));
  }, []);

  useEffect(() => {
    void refreshUserTemplates();
  }, []);

  // A user template asked for by id may only be known once My templates has loaded.
  const wanted = useRef(request.templateId && !BUILTIN_TEMPLATES.some((t) => t.id === request.templateId) ? request.templateId : undefined);
  useEffect(() => {
    const id = wanted.current;
    const mine = id ? userTemplates.find((t) => t.id === id) : undefined;
    if (!mine) return;
    wanted.current = undefined;
    select({ kind: 'template', template: mine, source: 'user' });
  }, [userTemplates, select]);


  const family = families[0];
  const lang = languages[0];
  const previewProject = useMemo(
    () => (selection.kind === 'template' ? templatePreviewProject(selection.template, family, lang) : blankPreviewProject(family, lang)),
    [selection, family, lang],
  );

  const create = async () => {
    // The ref, not the state: a quick double-click must not create two projects.
    if (busyRef.current) return;
    const template = selection.kind === 'template' ? selection.template : null;
    setPending(true);
    busyRef.current = true;
    try {
      await createAndOpenProject(template, { name: name.trim() || nameFor(selection), families, languages });
      saveNewProjectPrefs({ families, languages });
      busyRef.current = false;
      useHomeUi.getState().closeNewProject();
    } catch (e) {
      busyRef.current = false;
      setPending(false);
      toast.error('Could not create the project', errorText(e));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (matchShortcut(e, 'mod+enter', platformIsMac())) {
      e.preventDefault();
      void create();
    }
  };

  const slideCount = previewProject.slides.length;
  const startName = selection.kind === 'template' ? selection.template.name : 'Blank';
  const summary = `${startName} · ${plural(slideCount, 'slide')} · ${listFamilies(families)} · ${plural(languages.length, 'language')}`;

  return (
    <DialogContent
      size="full"
      title="New project"
      description="Pick a starting point, then choose devices and languages. You can change everything later."
      flush
      style={{ maxWidth: 1320, maxHeight: 880 }}
      onKeyDown={onKeyDown}
      onEscapeKeyDown={(e) => {
        // Escape first clears a template search, then closes; never mid-creation.
        if (pending) e.preventDefault();
        else if (query && document.activeElement?.id === searchId) {
          e.preventDefault();
          setQuery('');
        }
      }}
      onPointerDownOutside={(e) => {
        if (pending) e.preventDefault();
      }}
      onOpenAutoFocus={(e) => {
        // Start on the picked tile (Enter then creates the project), else on the template search.
        const content = (e.currentTarget ?? e.target) as HTMLElement | null;
        const target = content?.querySelector<HTMLElement>('[data-tile][aria-pressed="true"]') ?? content?.querySelector<HTMLElement>(`[id="${searchId}"]`);
        if (!target) return;
        e.preventDefault();
        target.focus();
        target.scrollIntoView({ block: 'nearest' });
      }}
      footerStart={<span className="truncate">{summary}</span>}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={() => useHomeUi.getState().closeNewProject()}>
            Cancel
          </Button>
          <Tooltip content="Create and open the project" shortcut="mod+enter">
            <Button variant="primary" loading={pending} onClick={() => void create()}>
              Create project
            </Button>
          </Tooltip>
        </>
      }
    >
      <div ref={bodyRef} className="flex h-full min-h-0 border-t border-line">
        <SourceRail
          source={source}
          category={category}
          onChange={(s, c) => {
            setSource(s);
            setCategory(c);
          }}
          userCount={userTemplates.length}
        />
        <section role="tabpanel" aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col">
          {source === 'builtin' && (
            <BuiltinPane
              titleId={titleId}
              searchId={searchId}
              category={category}
              query={query}
              onQuery={setQuery}
              selection={selection}
              onSelect={select}
              onActivate={() => void create()}
            />
          )}
          {source === 'community' && (
            <CommunityPane titleId={titleId} searchId={searchId} query={query} onQuery={setQuery} selection={selection} onSelect={select} />
          )}
          {source === 'mine' && (
            <MinePane
              titleId={titleId}
              searchId={searchId}
              query={query}
              onQuery={setQuery}
              selection={selection}
              onSelect={select}
              onActivate={() => void create()}
              onBrowseGallery={() => {
                setSource('community');
                setCategory('all');
                // The clicked button goes away with the pane: keyboard focus follows to the Gallery tab.
                requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
              }}
            />
          )}
        </section>
        <aside aria-label="Project setup" className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel light:bg-surface">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 p-5">
              <PreviewStage project={previewProject} family={family} lang={lang} title={selection.kind === 'template' ? selection.template.name : 'Blank project'} />
              <form
                className="flex flex-col gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void create();
                }}
              >
                <label htmlFor={`${titleId}-name`} className="text-xs font-medium text-text-2">
                  Project name
                </label>
                <Input
                  id={`${titleId}-name`}
                  size="lg"
                  containerClassName="light:bg-raised"
                  value={name}
                  maxLength={200}
                  placeholder={nameFor(selection)}
                  onChange={(e) => {
                    setName(e.target.value);
                    nameTouched.current = true;
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </form>
              <DevicePicker value={families} onChange={setFamilies} />
              <LanguagePicker value={languages} onChange={setLanguages} />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </DialogContent>
  );
}

/* Rail ------------------------------------------------------------------------------ */

function SourceRail({
  source,
  category,
  onChange,
  userCount,
}: {
  source: TemplateSource;
  category: Category;
  onChange(source: TemplateSource, category: Category): void;
  userCount: number;
}) {
  const counts = useMemo(() => countByCategory(BUILTIN_TEMPLATES), []);
  const items: Array<{ key: string; source: TemplateSource; category: Category; label: string; icon?: ReactNode; count?: number; group: string }> = [
    { key: 'all', source: 'builtin', category: 'all', label: 'All templates', icon: <LayoutGrid />, count: BUILTIN_TEMPLATES.length + 1, group: 'Built-in' },
    ...CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => ({
      key: c,
      source: 'builtin' as const,
      category: c,
      label: CATEGORY_LABEL[c],
      icon: CATEGORY_ICON[c],
      count: counts[c],
      group: 'Built-in',
    })),
    { key: 'community', source: 'community', category: 'all', label: 'Gallery', icon: <Globe />, group: 'Community' },
    { key: 'mine', source: 'mine', category: 'all', label: 'My templates', icon: <Bookmark />, count: userCount, group: 'Yours' },
  ];
  const isOn = (i: (typeof items)[number]) => i.source === source && (i.source !== 'builtin' || i.category === category);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(items.length - 1, index + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const item = items[next];
    onChange(item.source, item.category);
    refs.current[next]?.focus();
  };

  let lastGroup = '';
  return (
    <nav aria-label="Template sources" className="flex w-[200px] shrink-0 flex-col border-r border-line bg-panel light:bg-surface">
      <ScrollArea className="min-h-0 flex-1">
        <div role="tablist" aria-orientation="vertical" className="flex flex-col px-2.5 pt-3 pb-4">
          {items.map((item, i) => {
            const header = item.group !== lastGroup;
            lastGroup = item.group;
            const on = isOn(item);
            return (
              <div key={item.key} className="flex flex-col">
                {header && (
                  <span className={cx('px-2 pb-1.5 text-2xs font-medium tracking-[0.04em] text-text-3 uppercase', i > 0 && 'mt-4')}>{item.group}</span>
                )}
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={item.count !== undefined ? `${item.label}, ${plural(item.count, 'template')}` : item.label}
                  tabIndex={on ? 0 : -1}
                  onClick={() => onChange(item.source, item.category)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={cx(
                    'flex h-7 items-center gap-2 rounded-sm px-2 text-ui outline-none select-none',
                    'transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    on ? 'bg-accent-soft font-medium text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <span className={cx('flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5', on ? 'text-accent-fg' : 'text-text-3')}>
                    {item.icon ?? <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  {item.count !== undefined && <span className={cx('shrink-0 text-2xs tabular-nums', on ? 'text-text-2' : 'text-text-3')}>{item.count}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </nav>
  );
}

/* Panes ----------------------------------------------------------------------------- */

function PaneHeader({
  titleId,
  searchId,
  title,
  count,
  query,
  onQuery,
  showSearch = true,
  children,
}: {
  titleId: string;
  searchId: string;
  title: string;
  count?: number;
  query: string;
  onQuery(q: string): void;
  /** Off when there is nothing to search (an empty or unreachable source). */
  showSearch?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-5">
      {/* The title keeps its width at the smallest window; the search narrows instead. */}
      <h3 id={titleId} className="flex shrink-0 items-baseline gap-2 text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text">
        <span className="truncate">{title}</span>
        {count !== undefined && <span className="text-xs font-normal text-text-3 tabular-nums">{count}</span>}
      </h3>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {children}
        {showSearch && (
          <Input
            id={searchId}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            leadingIcon={<Search />}
            suffix={
              query ? (
                <IconButton size="sm" label="Clear search" tooltip={false} icon={<X />} className="-mr-1 size-5" onClick={() => onQuery('')} />
              ) : undefined
            }
            containerClassName="w-56 min-w-36 shrink"
          />
        )}
      </div>
    </header>
  );
}

function PaneBody({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-5 pt-1 pb-6">{children}</div>
    </ScrollArea>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear(): void }) {
  return (
    <EmptyState
      size="sm"
      className="py-16"
      icon={<SearchX />}
      title="No templates match"
      description={`Nothing here matches “${query.trim()}”. Try another word or another source.`}
      actions={
        <Button size="sm" onClick={onClear}>
          Clear search
        </Button>
      }
    />
  );
}

interface PaneProps {
  titleId: string;
  searchId: string;
  query: string;
  onQuery(q: string): void;
  selection: Selection;
  onSelect(s: Selection): void;
  onActivate?(): void;
}

function BuiltinPane({ titleId, searchId, category, query, onQuery, selection, onSelect, onActivate }: PaneProps & { category: Category }) {
  const list = BUILTIN_TEMPLATES.filter((t) => (category === 'all' || t.category === category) && templateMatches(t, query));
  const showBlank = category === 'all' && (!query.trim() || 'blank empty scratch'.includes(query.trim().toLowerCase()));
  const title = category === 'all' ? 'All templates' : CATEGORY_LABEL[category];
  const selectedId = selection.kind === 'template' ? selection.template.id : null;
  return (
    <>
      <PaneHeader titleId={titleId} searchId={searchId} title={title} count={list.length + (showBlank ? 1 : 0)} query={query} onQuery={onQuery} />
      <PaneBody>
        {list.length === 0 && !showBlank ? (
          <NoMatches query={query} onClear={() => onQuery('')} />
        ) : (
          <div className={TEMPLATE_GRID_CLASS} onKeyDown={onTemplateGridKeyDown}>
            {showBlank && <BlankCard selected={selection.kind === 'blank'} onSelect={() => onSelect({ kind: 'blank' })} onActivate={onActivate} />}
            {list.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={selection.kind === 'template' && selection.source === 'builtin' && selectedId === t.id}
                onSelect={() => onSelect({ kind: 'template', template: t, source: 'builtin' })}
                onActivate={onActivate}
              />
            ))}
          </div>
        )}
      </PaneBody>
    </>
  );
}

function CommunityPane({ titleId, searchId, query, onQuery, selection, onSelect }: PaneProps) {
  const now = useNow();
  const status = useGallery((s) => s.status);
  const result = useGallery((s) => s.result);
  const installing = useGallery((s) => s.installing);
  const userTemplates = useUserTemplates((s) => s.templates);
  const installedIds = useMemo(() => new Set(userTemplates.map((t) => t.id)), [userTemplates]);

  useEffect(() => {
    void loadGallery();
  }, []);

  const entries = result?.index.templates ?? [];
  const shown = entries.filter((e) => galleryEntryMatches(e, query));
  const selectedId = selection.kind === 'template' && selection.source === 'user' ? selection.template.id : null;

  const use = async (entry: GalleryEntry) => {
    const existing = useUserTemplates.getState().templates.find((t) => t.id === entry.id);
    const template = existing ?? (await installFromGallery(entry));
    if (template) onSelect({ kind: 'template', template, source: 'user' });
  };

  const loading = status === 'idle' || status === 'loading';
  const unreachable = status === 'error' && !result;
  return (
    <>
      <PaneHeader
        titleId={titleId}
        searchId={searchId}
        title="Community gallery"
        count={status === 'ready' ? shown.length : undefined}
        query={query}
        onQuery={onQuery}
        showSearch={entries.length > 0}
      >
        {!unreachable && <IconButton label="Refresh the gallery" icon={<RefreshCw />} loading={status === 'loading'} onClick={() => void loadGallery(true)} />}
      </PaneHeader>
      <PaneBody>
        {result?.offline && (
          <div role="status" className="mb-4 flex items-center gap-3 rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-text">
            <WifiOff className="size-4 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              You’re offline. Showing the gallery as saved {relativeEdited(result.fetchedAt, now)}.
            </span>
            <Button size="sm" variant="ghost" onClick={() => void loadGallery(true)}>
              Try again
            </Button>
          </div>
        )}
        {loading && !result ? (
          <TemplateGridSkeleton image />
        ) : unreachable ? (
          <EmptyState
            className="py-16"
            icon={<WifiOff />}
            title="Can’t reach the community gallery"
            description="Check your internet connection and try again. Built-in templates and your own keep working offline."
            actions={
              <Button leadingIcon={<RefreshCw />} onClick={() => void loadGallery(true)}>
                Try again
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<Globe />}
            title="No community templates yet"
            description="The gallery is where people share their designs. Yours could be the first."
            actions={
              <Button leadingIcon={<Globe />} onClick={() => void getPlatform().openUrl(`${REPO_URL}/tree/main/gallery`).catch(() => undefined)}>
                Share a template on GitHub
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <NoMatches query={query} onClear={() => onQuery('')} />
        ) : (
          <div className={TEMPLATE_GRID_CLASS} onKeyDown={onTemplateGridKeyDown}>
            {shown.map((entry) => (
              <GalleryCard
                key={entry.id}
                entry={entry}
                installed={installedIds.has(entry.id)}
                installing={!!installing[entry.id]}
                selected={selectedId === entry.id}
                onUse={() => void use(entry)}
              />
            ))}
          </div>
        )}
      </PaneBody>
    </>
  );
}

function MinePane({ titleId, searchId, query, onQuery, selection, onSelect, onActivate, onBrowseGallery }: PaneProps & { onBrowseGallery(): void }) {
  const status = useUserTemplates((s) => s.status);
  const templates = useUserTemplates((s) => s.templates);
  const busy = useUserTemplates((s) => s.busy);
  const importing = useUserTemplates((s) => s.importing);
  const error = useUserTemplates((s) => s.error);
  const shown = templates.filter((t) => templateMatches(t, query));
  const selectedId = selection.kind === 'template' && selection.source === 'user' ? selection.template.id : null;

  const importFile = async () => {
    const t = await importTemplateFile();
    if (t) onSelect({ kind: 'template', template: t, source: 'user' });
  };

  return (
    <>
      <PaneHeader
        titleId={titleId}
        searchId={searchId}
        title="My templates"
        count={status === 'ready' ? shown.length : undefined}
        query={query}
        onQuery={onQuery}
        showSearch={templates.length > 0}
      >
        {templates.length > 0 && <IconButton label="Import template file…" icon={<FileUp />} loading={importing} onClick={() => void importFile()} />}
      </PaneHeader>
      <PaneBody>
        {status !== 'ready' && status !== 'error' && templates.length === 0 ? (
          <TemplateGridSkeleton count={3} />
        ) : status === 'error' && templates.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<Bookmark />}
            title="Your templates could not be read"
            description={error ?? undefined}
            actions={<Button onClick={() => void refreshUserTemplates()}>Try again</Button>}
          />
        ) : templates.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<Bookmark />}
            title="No templates of your own yet"
            description="Save any project as a template from the editor, install one from the gallery, or import a .wajha-template file someone shared with you."
            actions={
              <>
                <Button leadingIcon={<FileUp />} loading={importing} onClick={() => void importFile()}>
                  Import template file…
                </Button>
                <Button variant="ghost" leadingIcon={<Globe />} onClick={onBrowseGallery}>
                  Browse the gallery
                </Button>
              </>
            }
          />
        ) : shown.length === 0 ? (
          <NoMatches query={query} onClear={() => onQuery('')} />
        ) : (
          <div className={TEMPLATE_GRID_CLASS} onKeyDown={onTemplateGridKeyDown}>
            {shown.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                busy={!!busy[t.id]}
                selected={selectedId === t.id}
                onSelect={() => onSelect({ kind: 'template', template: t, source: 'user' })}
                onActivate={onActivate}
                menu={<UserTemplateMenu template={t} onDeleted={() => selectedId === t.id && onSelect({ kind: 'blank' })} />}
              />
            ))}
          </div>
        )}
      </PaneBody>
    </>
  );
}

function UserTemplateMenu({ template, onDeleted }: { template: Template; onDeleted(): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" label={`Actions for ${template.name}`} tooltip="More actions" icon={<Ellipsis />} className="aria-expanded:bg-surface-2 aria-expanded:text-text" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem icon={<FileDown />} onSelect={() => void exportTemplateFile(template)}>
          Export as file…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<Trash2 />}
          danger
          onSelect={() => {
            void deleteTemplateWithConfirm(template).then((deleted) => deleted && onDeleted());
          }}
        >
          Delete template…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


/**
 * Languages: the project's languages pinned on top (base first), every
 * other catalog language below, one searchable list. Checking adds a
 * language; unchecking removes it (after confirming: its texts and
 * screenshots go too); "Make base" moves a language first.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Languages, Search, X } from 'lucide-react';
import { LANGUAGES, languageInfo, type LanguageInfo } from '../../../model/catalog';
import { LIMITS } from '../../../model/rules';
import type { LangCode, Project } from '../../../model/types';
import { confirmDialog, useEditor } from '../../../store';
import { Badge, Button, Checkbox, Dialog, DialogContent, EmptyState, IconButton, Input, Tooltip, cx } from '../../kit';
import { closeOrReturn, useEditorWhileOpen, useOpenSession } from './dialogState';
import { listJoin, plural } from './labels';
import { searchLanguages } from './languagesModel';
import type { EditorDialogProps } from './types';

import { t } from '../../../i18n';
export function LanguagesDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <LanguagesSession key={session} open={open} onOpenChange={onOpenChange} />;
}

function LanguagesSession({ open, onOpenChange }: EditorDialogProps) {
  const project = useEditorWhileOpen((s) => s.project, open);
  if (!project) return null;
  return <LanguagesBody project={project} open={open} onOpenChange={onOpenChange} />;
}

type Item = { kind: 'heading'; id: string; label: string } | { kind: 'language'; info: LanguageInfo; inProject: boolean; base: boolean };

function LanguagesBody({ project, open, onOpenChange }: EditorDialogProps & { project: Project }) {
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<LangCode | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const langs = project.languages;
  const atLimit = langs.length >= LIMITS.languages;

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  const items = useMemo<Item[]>(() => {
    const own = langs.map((code) => languageInfo(code));
    const ownMatches = query.trim() ? searchLanguages(query, own) : own;
    const others = searchLanguages(query, LANGUAGES.filter((l) => !langs.includes(l.code)));
    const list: Item[] = [];
    if (ownMatches.length) {
      list.push({ kind: 'heading', id: 'own', label: t('In this project') });
      for (const info of ownMatches) list.push({ kind: 'language', info, inProject: true, base: info.code === langs[0] });
    }
    if (others.length) {
      list.push({ kind: 'heading', id: 'more', label: query.trim() ? t('Add a language') : t('More languages') });
      for (const info of others) list.push({ kind: 'language', info, inProject: false, base: false });
    }
    return list;
  }, [langs, query]);

  const add = (code: LangCode) => {
    if (useEditor.getState().addLanguage(code)) setFlash(code);
  };

  const remove = async (code: LangCode) => {
    const p = useEditor.getState().project;
    if (!p || p.languages.length <= 1 || !p.languages.includes(code)) return;
    const name = t(languageInfo(code).name);
    const next = p.languages[0] === code ? t(languageInfo(p.languages[1]).name) : null;
    const ok = await confirmDialog({
      title: t('Remove {name}?', { name }),
      message: t('Its texts and screenshots are removed from every slide.{v} You can undo this.', { v: next ? ` ${next} becomes the base language.` : '' }),
      confirmLabel: t('Remove {name}', { name }),
      danger: true,
    });
    if (ok) useEditor.getState().removeLanguage(code);
  };

  const makeBase = (code: LangCode) => {
    useEditor.getState().setBaseLanguage(code);
    setFlash(code);
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const first = items.find((i): i is Extract<Item, { kind: 'language' }> => i.kind === 'language' && !i.inProject);
      if (first && query.trim() && !atLimit) {
        e.preventDefault();
        add(first.info.code);
        setQuery('');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      listRef.current?.querySelector<HTMLElement>('[data-lang-row] button[role="checkbox"]')?.focus();
    }
  };

  // Arrow keys move between rows; Tab leaves the list.
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const boxes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-lang-row] button[role="checkbox"]') ?? []);
    const i = boxes.findIndex((b) => b === document.activeElement || b.closest('[data-lang-row]')?.contains(document.activeElement));
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) searchRef.current?.focus();
    else boxes[Math.max(0, Math.min(boxes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  const names = langs.map((l) => t(languageInfo(l).name));
  // Opened from Translations: Done, Escape and the close button all go back there.
  const close = () => closeOrReturn('languages', () => onOpenChange(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        size="md"
        icon={<Languages />}
        title={t('Languages')}
        description={t('Texts are per language and shared by every device. Screenshots and texts not translated yet fall back to the base language.')}
        flush
        bodyClassName="flex flex-col"
        onEscapeKeyDown={(e) => {
          if (query && document.activeElement === searchRef.current) {
            e.preventDefault();
            setQuery('');
          }
        }}
        footerStart={<span className="truncate">{`${plural(langs.length, 'language')}: ${listJoin(names)}`}</span>}
        footer={
          <Button variant="primary" onClick={close}>
            {t('Done')}
          </Button>
        }
      >
        <div className="shrink-0 px-5 pb-3">
          <Input
            ref={searchRef}
            type="search"
            aria-label={t('Search languages')}
            placeholder={t('Search {length} languages', { length: LANGUAGES.length })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            leadingIcon={<Search />}
            suffix={query ? <IconButton size="sm" label={t('Clear search')} tooltip={false} icon={<X />} onClick={() => setQuery('')} className="-mr-1" /> : undefined}
          />
        </div>
        <div
          ref={listRef}
          role="list"
          aria-label={t('Languages')}
          onKeyDown={onListKeyDown}
          className="h-[min(440px,calc(100vh-300px))] overflow-y-auto border-t border-line px-3 pb-3"
        >
          {items.length === 0 ? (
            <EmptyState size="sm" className="h-full" icon={<Search />} title={t('No language matches “{v}”', { v: query.trim() })} description={t('Try its English or native name, or a code like “pt-BR”.')} />
          ) : (
            items.map((item) =>
              item.kind === 'heading' ? (
                <div key={`h:${item.id}`} role="presentation" className="flex items-baseline gap-2.5 px-2 pt-4 pb-1.5">
                  <span className="flex-1 text-2xs font-semibold tracking-[0.06em] text-text-3 uppercase">{item.label}</span>
                  <span aria-hidden className="w-[76px] shrink-0 text-right text-2xs text-text-3">
                    {t('App Store')}
                  </span>
                  <span aria-hidden className="w-[76px] shrink-0 text-right text-2xs text-text-3">
                    {t('Google Play')}
                  </span>
                </div>
              ) : (
                <LanguageRow
                  key={item.info.code}
                  info={item.info}
                  inProject={item.inProject}
                  base={item.base}
                  only={item.inProject && langs.length <= 1}
                  disabledAdd={!item.inProject && atLimit}
                  flash={flash === item.info.code}
                  onAdd={add}
                  onRemove={(code) => void remove(code)}
                  onMakeBase={makeBase}
                />
              ),
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface LanguageRowProps {
  info: LanguageInfo;
  inProject: boolean;
  base: boolean;
  /** The project's only language: cannot be removed. */
  only: boolean;
  disabledAdd: boolean;
  flash: boolean;
  onAdd(code: LangCode): void;
  onRemove(code: LangCode): void;
  onMakeBase(code: LangCode): void;
}

function LanguageRow({ info, inProject, base, only, disabledAdd, flash, onAdd, onRemove, onMakeBase }: LanguageRowProps) {
  const id = `lang-${info.code}`;
  const native = info.native && info.native !== info.name ? info.native : null;
  const checkbox = (
    <Checkbox
      id={id}
      checked={inProject}
      disabled={only || disabledAdd}
      onCheckedChange={(v) => (v === true ? onAdd(info.code) : onRemove(info.code))}
    />
  );
  return (
    <div
      role="listitem"
      data-lang-row
      className={cx(
        'group/lang flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors duration-(--dur-slow) hover:bg-surface-2',
        flash && 'bg-accent-soft hover:bg-accent-soft',
      )}
    >
      {only ? (
        <Tooltip content={t('A project needs at least one language')}>
          <span className="flex">{checkbox}</span>
        </Tooltip>
      ) : (
        checkbox
      )}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-default items-center gap-2 self-stretch">
        <span className="truncate text-ui text-text">{t(info.name)}</span>
        {native && (
          <span dir="auto" lang={info.code} className="truncate text-xs text-text-3">
            {native}
          </span>
        )}
        {base && (
          <Badge size="sm" variant="accent">
            {t('Base')}
          </Badge>
        )}
        {info.rtl && (
          <Badge size="sm" variant="neutral">
            {t('RTL')}
          </Badge>
        )}
      </label>
      {inProject && !base && (
        <Tooltip content={t('The base language fills in texts and screenshots that are not translated yet.')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMakeBase(info.code)}
            className="opacity-0 group-focus-within/lang:opacity-100 group-hover/lang:opacity-100 focus-visible:opacity-100"
          >
            {t('Make base')}
          </Button>
        </Tooltip>
      )}
      <StoreLocale store="App Store" code={info.appStore} name={t(info.name)} />
      <StoreLocale store="Google Play" code={info.play} name={t(info.name)} />
    </div>
  );
}

/** A store's locale code for the language, or a warning that the store does not offer it. */
function StoreLocale({ store, code, name }: { store: string; code: string | null; name: string }) {
  if (code) {
    return (
      <span className="w-[76px] shrink-0 truncate text-right font-mono text-2xs text-text-2">
        <span className="sr-only">{store}: </span>
        {code}
      </span>
    );
  }
  return (
    <Tooltip content={t('{store} has no {name} localization. {name2} is skipped for {store2} sizes when you export.', { store, name, name2: name, store2: store })}>
      <span className="w-[76px] shrink-0 text-right text-2xs font-medium text-warning">
        <span className="sr-only">{store}: </span>
        {t('Not offered')}
      </span>
    </Tooltip>
  );
}

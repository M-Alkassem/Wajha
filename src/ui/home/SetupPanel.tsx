import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus, Search, Star, X } from 'lucide-react';
import { FAMILIES, FAMILY_ORDER, LANGUAGES, languageInfo } from '../../model/catalog';
import type { FamilyId, LangCode, Project } from '../../model/types';
import { SlidePreview } from '../shared/SlidePreview';
import { Badge, Button, cx, IconButton, Input, Popover, PopoverContent, PopoverTrigger, Tooltip } from '../kit';
import { FamilyGlyph } from './FamilyGlyph';
import { FAMILY_NAME, fitStrip, foldForSearch, matchesSearch, plural } from './format';
import { useElementSize } from './hooks';
import { requestPreviewFonts } from './templates';

import { t } from '../../i18n';
import { tx } from '../../i18n/react';
import { familyLabel } from '../shared/names';
/* Preview ------------------------------------------------------------------------ */

const STAGE_PAD = 20;
const STAGE_GAP = 10;

export interface PreviewStageProps {
  project: Project;
  family: FamilyId;
  lang: LangCode;
  /** Caption under the stage: what is being previewed. */
  title: string;
}

/**
 * The selected template on a little stage, in the first chosen device and
 * language: as many slides as fit well (three phones, two tablets, one Mac).
 */
export function PreviewStage({ project, family, lang, title }: PreviewStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const design = FAMILIES[family].design;
  const fit = fitStrip(width - STAGE_PAD * 2, height - STAGE_PAD * 2, design.height / design.width, project.slides.length, STAGE_GAP, 3);
  const info = languageInfo(lang);
  const radius = Math.max(4, Math.round(fit.width * 0.06));

  useEffect(() => requestPreviewFonts(project), [project]);

  return (
    <figure className="flex flex-col gap-2.5">
      <div
        ref={ref}
        className="relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-stage"
        style={{
          // Shorter on short windows, so the setup controls stay in view.
          height: 'clamp(160px, calc(100vh - 560px), 236px)',
          gap: STAGE_GAP,
          backgroundImage: 'radial-gradient(var(--stage-dot) 1px, transparent 1.2px)',
          backgroundSize: '14px 14px',
        }}
      >
        {width > 0 &&
          height > 0 &&
          fit.width > 0 &&
          Array.from({ length: fit.count }, (_, i) =>
            project.slides[i] ? (
              <div key={i} className="shrink-0 overflow-hidden shadow-slide" style={{ width: fit.width, height: fit.height, borderRadius: radius }}>
                <SlidePreview project={project} slideIndex={i} family={family} lang={lang} width={fit.width} />
              </div>
            ) : null,
          )}
      </div>
      <figcaption className="flex min-w-0 items-center gap-2 px-0.5 text-xs text-text-3">
        <span dir="auto" className="min-w-0 truncate font-medium text-text-2">
          {title}
        </span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{plural(project.slides.length, 'slide')}</span>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          <FamilyGlyph family={family} size={12} />
          {FAMILY_NAME[family]}
          <span aria-hidden>·</span>
          <span dir="auto">{info.native}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/* Devices ------------------------------------------------------------------------ */

const DEVICE_GROUPS: ReadonlyArray<{ store: string; families: FamilyId[] }> = [
  { store: 'App Store', families: ['iphone', 'iphone-landscape', 'ipad', 'ipad-landscape', 'mac', 'watch', 'apple-tv', 'vision'] },
  { store: 'Google Play', families: ['android-phone', 'android-landscape', 'android-tablet', 'play-feature'] },
];

/** Tile labels: the store heading already says which platform. */
const TILE_LABEL: Readonly<Record<FamilyId, string>> = {
  iphone: t('iPhone'),
  'iphone-landscape': t('iPhone ↔'),
  ipad: t('iPad'),
  'ipad-landscape': t('iPad ↔'),
  mac: t('Mac'),
  watch: t('Watch'),
  'apple-tv': t('Apple TV'),
  vision: t('Vision Pro'),
  'android-phone': t('Phone'),
  'android-landscape': t('Phone ↔'),
  'android-tablet': t('Tablet'),
  'play-feature': t('Feature'),
};

const ORDER: readonly FamilyId[] = FAMILY_ORDER;

export interface DevicePickerProps {
  value: FamilyId[];
  onChange(families: FamilyId[]): void;
}

/** Device families as toggle tiles grouped by store; at least one stays on. */
export function DevicePicker({ value, onChange }: DevicePickerProps) {
  const labelId = useId();
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (!warn) return;
    const t = setTimeout(() => setWarn(false), 2600);
    return () => clearTimeout(t);
  }, [warn]);

  const toggle = (f: FamilyId) => {
    if (value.includes(f)) {
      if (value.length === 1) {
        setWarn(true);
        return;
      }
      onChange(value.filter((x) => x !== f));
    } else {
      onChange(ORDER.filter((x) => x === f || value.includes(x)));
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex h-4 items-center justify-between">
        <span id={labelId} className="text-xs font-medium text-text-2">
          {t('Devices')}
        </span>
        <span aria-live="polite" className={cx('text-xs', warn ? 'text-warning' : 'text-text-3')}>
          {warn ? t('Keep at least one device') : t('{length} selected', { length: value.length })}
        </span>
      </div>
      {DEVICE_GROUPS.map((group) => (
        <div key={group.store} className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium tracking-[0.04em] text-text-3 uppercase">{group.store}</span>
          <div className="grid grid-cols-4 gap-1.5">
            {group.families.map((f) => {
              const on = value.includes(f);
              const d = FAMILIES[f].design;
              return (
                <Tooltip key={f} content={`${familyLabel(f)} · ${d.width} × ${d.height}`} side="bottom">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={FAMILY_NAME[f]}
                    onClick={() => toggle(f)}
                    className={cx(
                      'relative flex h-[60px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border px-1 outline-none',
                      'transition-[background-color,border-color,color,box-shadow] duration-(--dur-fast) ease-out',
                      'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus',
                      on
                        ? 'border-accent-line bg-accent-soft text-text shadow-[var(--highlight)]'
                        : 'border-line bg-field text-text-2 hover:border-line-strong hover:bg-field-hover hover:text-text light:bg-raised light:hover:bg-surface',
                    )}
                  >
                    <FamilyGlyph family={f} size={20} strokeWidth={1.75} className={on ? 'text-accent-fg' : undefined} />
                    <span className="max-w-full truncate text-2xs leading-[14px] font-medium">{TILE_LABEL[f]}</span>
                    {on && (
                      <span aria-hidden className="absolute top-1 end-1 flex size-3.5 items-center justify-center rounded-full bg-accent text-accent-text">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Languages ---------------------------------------------------------------------- */

export interface LanguagePickerProps {
  value: LangCode[];
  onChange(languages: LangCode[]): void;
}

/**
 * Project languages: a list with the base language first (the fallback for
 * missing texts and screenshots), each removable or promotable to base,
 * and a searchable picker over every store language.
 */
export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const labelId = useId();
  const [open, setOpen] = useState(false);

  const toggle = (code: LangCode) => {
    if (value.includes(code)) {
      if (value.length > 1) onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex h-4 items-center justify-between">
        <span id={labelId} className="text-xs font-medium text-text-2">
          {t('Languages')}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" leadingIcon={<Plus />} className="-mr-1.5">
              {t('Add')}
            </Button>
          </PopoverTrigger>
          <PopoverContent width={320} padding="none" align="end" side="top" sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}>
            <LanguageSearch selected={value} onToggle={toggle} />
          </PopoverContent>
        </Popover>
      </div>
      <ul className="flex flex-col gap-1">
        {value.map((code, i) => {
          const info = languageInfo(code);
          const base = i === 0;
          return (
            <li
              key={code}
              className="group/lang flex h-8 items-center gap-2 rounded-md border border-line bg-field pe-1 ps-2.5 light:bg-raised"
            >
              <LanguageNames code={code} native={info.native} name={t(info.name)} />
              {info.rtl && (
                <Badge size="sm" variant="accent" title={t('Right-to-left')}>
                  {t('RTL')}
                </Badge>
              )}
              {base ? (
                <Badge size="sm" title={t('Texts and screenshots fall back to the base language')}>
                  {t('Base')}
                </Badge>
              ) : (
                <IconButton
                  size="sm"
                  label={t('Make {name} the base language', { name: t(info.name) })}
                  tooltip={t('Make base language')}
                  icon={<Star />}
                  onClick={() => onChange([code, ...value.filter((c) => c !== code)])}
                  className="opacity-0 group-focus-within/lang:opacity-100 group-hover/lang:opacity-100 focus-visible:opacity-100"
                />
              )}
              {value.length > 1 && <IconButton size="sm" label={t('Remove {name}', { name: t(info.name) })} tooltip={t('Remove')} icon={<X />} onClick={() => toggle(code)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A language's own name, then its English name, which is the one cut short when space runs out. */
function LanguageNames({ code, native, name, secondaryClassName }: { code: LangCode; native: string; name: string; secondaryClassName?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span dir="auto" lang={code} className="max-w-full shrink-0 truncate text-ui text-text">
        {native}
      </span>
      {native !== name && <span className={cx('min-w-0 truncate text-xs text-text-3', secondaryClassName)}>{name}</span>}
    </span>
  );
}

/** Languages matching `query`, those whose name or code starts with it first. */
function rankLanguages(query: string) {
  const q = foldForSearch(query);
  const hits = LANGUAGES.filter((l) => matchesSearch(query, l.name, l.native, l.code));
  if (!q) return hits;
  const starts = (l: (typeof LANGUAGES)[number]) =>
    [l.name, l.native, l.code].some((f) => foldForSearch(f).startsWith(q) || foldForSearch(f).split(/[\s(]+/).some((w) => w.startsWith(q)));
  return [...hits.filter(starts), ...hits.filter((l) => !starts(l))];
}

function LanguageSearch({ selected, onToggle }: { selected: LangCode[]; onToggle(code: LangCode): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => rankLanguages(query), [query]);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const activeCode = options[activeIndex]?.code;

  // Focus the field after the popover has positioned itself (no scroll jump).
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.min(options.length - 1, Math.max(0, activeIndex + delta)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeCode) onToggle(activeCode);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-line p-2">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('Search languages')}
          leadingIcon={<Search />}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeCode ? `${listId}-${activeCode}` : undefined}
          aria-autocomplete="list"
          aria-label={t('Search languages')}
        />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-multiselectable="true" aria-label={t('Languages')} className="max-h-[280px] overflow-y-auto p-1">
        {options.map((l, i) => {
          const on = selected.includes(l.code);
          const locked = on && selected.length === 1;
          return (
            <li
              key={l.code}
              id={`${listId}-${l.code}`}
              data-index={i}
              role="option"
              aria-selected={on}
              aria-disabled={locked || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== activeIndex && setActive(i)}
              onClick={() => onToggle(l.code)}
              className={cx(
                'group/option flex h-8 cursor-default items-center gap-2.5 rounded-[5px] px-2 select-none',
                // surface-2 barely differs from the dark popover; secondary text then needs text-2 to stay at 4.5:1.
                i === activeIndex && 'bg-surface-3 light:bg-surface-2',
                locked && 'opacity-60',
              )}
              data-active={i === activeIndex || undefined}
            >
              <span
                aria-hidden
                className={cx(
                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-(--dur-fast)',
                  on ? 'border-accent bg-accent text-accent-text' : 'border-line-strong bg-field',
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <LanguageNames code={l.code} native={l.native} name={l.name} secondaryClassName="group-data-[active]/option:text-text-2" />
              {l.rtl && (
                <Badge size="sm" variant="accent">
                  {t('RTL')}
                </Badge>
              )}
              <span className="w-12 shrink-0 text-end font-mono text-2xs text-text-3 group-data-[active]/option:text-text-2">{l.code}</span>
            </li>
          );
        })}
        {options.length === 0 && <li className="px-2 py-6 text-center text-xs text-text-3">{tx('No language matches “{v}”', { v: query.trim() })}</li>}
      </ul>
      <div className="flex h-8 items-center border-t border-line px-3 text-2xs text-text-3">
        {tx('{plural} · the first is the base language', { plural: plural(selected.length, 'language') })}
      </div>
    </div>
  );
}

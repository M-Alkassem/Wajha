/**
 * Font picker: a searchable list of the project's own fonts, the bundled
 * fonts (by category, each name drawn in its own face) and the fonts
 * installed on the system, which are listed lazily the first time the picker
 * opens. "Add font file…" stores a font with the project and picks it. The
 * list is windowed, so hundreds of system fonts stay cheap.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { getPlatform } from '../../../platform';
import { registerProjectFonts } from '../../../runtime';
import { putProjectFont } from '../../../storage';
import { toast, useEditor } from '../../../store';
import { Button, FIELD_SHELL, Input, Popover, PopoverContent, PopoverTrigger, ScrollArea, Spinner, cx, useFieldControl } from '../../kit';
import { bundledFont, fontGroups, fontLabel, fontPreviewFamily } from './format';
import { loadSystemFonts } from './systemFonts';

const ROW = 28;
const LIST_MAX = 308;
const OVERSCAN = 6;

const SAMPLES: Partial<Record<string, string>> = {
  arabic: 'أبجد',
};

type Item = { kind: 'header'; key: string; label: string } | { kind: 'font'; key: string; family: string; label: string; sample?: string; scriptFont: boolean };

export interface FontPickerProps {
  value: string;
  onChange: (family: string) => void;
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
}

/** Field-like trigger showing the current font in its own face; opens the searchable list. */
export const FontPicker = memo(function FontPicker({ value, onChange, disabled, ...aria }: FontPickerProps) {
  const field = useFieldControl({ id: aria.id });
  const [open, setOpen] = useState(false);
  const label = fontLabel(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={field.id}
          aria-label={aria['aria-label'] ? `${aria['aria-label']}: ${label}` : undefined}
          aria-labelledby={aria['aria-label'] ? undefined : field.labelId ? `${field.labelId} ${field.id}-value` : undefined}
          aria-describedby={field['aria-describedby']}
          className={cx(
            'group/font inline-flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-sm pr-1.5 pl-2 text-left text-xs outline-none',
            FIELD_SHELL,
            'focus-visible:border-accent-line focus-visible:ring-3 focus-visible:ring-focus-soft data-[state=open]:border-accent-line data-[state=open]:bg-field-hover',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <span id={`${field.id}-value`} className="min-w-0 truncate text-ui leading-none" style={{ fontFamily: fontPreviewFamily(value) }}>
            {label}
          </span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-text-3 transition-transform duration-(--dur) ease-out group-data-[state=open]/font:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent padding="none" width={272} align="start" side="bottom" aria-label="Fonts" onOpenAutoFocus={(e) => e.preventDefault()}>
        {open && (
          <FontList
            value={value}
            onPick={(family) => {
              setOpen(false);
              if (family !== value) onChange(family);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});

function FontList({ value, onPick }: { value: string; onPick: (family: string) => void }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState<string[] | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  /** Key of the highlighted option; null = the current font (or the first match while searching). */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isWeb = getPlatform().kind === 'web';
  const ownFonts = useEditor((s) => s.project?.fonts);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadSystemFonts().then((list) => {
      if (alive) setSystem(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const groups = fontGroups(system ?? [], query, (ownFonts ?? []).map((f) => f.family));
    const out: Item[] = [];
    const listed = groups.some((g) => g.fonts.some((f) => f.family === value));
    if (!listed && value && !query.trim()) {
      out.push({ kind: 'header', key: 'h:current', label: 'Current' });
      out.push({ kind: 'font', key: `f:${value}`, family: value, label: fontLabel(value), scriptFont: false });
    }
    for (const g of groups) {
      out.push({ kind: 'header', key: `h:${g.id}`, label: g.label });
      for (const f of g.fonts) {
        const info = bundledFont(f.family);
        const scriptFont = !!info && !info.scripts.includes('latin');
        out.push({ kind: 'font', key: `f:${f.family}`, family: f.family, label: f.label, sample: SAMPLES[f.category], scriptFont });
      }
    }
    return out;
  }, [system, query, value, ownFonts]);

  const fontIndexes = useMemo(() => items.flatMap((it, i) => (it.kind === 'font' ? [i] : [])), [items]);
  const searching = query.trim() !== '';
  const explicit = activeKey === null ? -1 : items.findIndex((it) => it.key === activeKey);
  const currentIndex = searching ? -1 : items.findIndex((it) => it.kind === 'font' && it.family === value);
  const active = explicit >= 0 ? explicit : currentIndex >= 0 ? currentIndex : (fontIndexes[0] ?? -1);

  const height = Math.min(LIST_MAX, Math.max(ROW, items.length * ROW));

  const onScroll = useCallback((e: Event) => setScrollTop((e.currentTarget as HTMLElement).scrollTop), []);
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current?.removeEventListener('scroll', onScroll);
      viewportRef.current = node;
      node?.addEventListener('scroll', onScroll, { passive: true });
    },
    [onScroll],
  );

  const scrollToIndex = useCallback(
    (index: number, align: 'nearest' | 'center' = 'nearest') => {
      const viewport = viewportRef.current;
      if (!viewport || index < 0) return;
      const top = index * ROW;
      const view = viewport.clientHeight || height;
      let next = viewport.scrollTop;
      if (align === 'center') next = Math.max(0, top - view / 2 + ROW / 2);
      else if (top < next) next = top;
      else if (top + ROW > next + view) next = top + ROW - view;
      if (next !== viewport.scrollTop) viewport.scrollTo({ top: next });
    },
    [height],
  );

  // Opening scrolls the current font into the middle of the list (once).
  const centered = useRef(false);
  useLayoutEffect(() => {
    if (centered.current || active < 0 || !viewportRef.current) return;
    centered.current = true;
    scrollToIndex(active, 'center');
  }, [active, scrollToIndex]);

  const move = (delta: number) => {
    if (!fontIndexes.length) return;
    const pos = fontIndexes.indexOf(active);
    const nextPos = pos < 0 ? 0 : Math.min(fontIndexes.length - 1, Math.max(0, pos + delta));
    const next = fontIndexes[nextPos];
    setActiveKey(items[next].key);
    scrollToIndex(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (e.key in steps) {
      e.preventDefault();
      move(steps[e.key]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[active];
      if (it?.kind === 'font') onPick(it.family);
    }
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  const activeItem = items[active];
  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <div className="flex flex-col">
      <div className="border-b border-line p-2">
        <Input
          ref={inputRef}
          size="md"
          role="combobox"
          aria-label="Search fonts"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem?.kind === 'font' ? optionId(active) : undefined}
          leadingIcon={<Search />}
          placeholder="Search fonts"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveKey(null);
            viewportRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-text-3">{system === null ? 'Loading fonts…' : `No fonts match “${query.trim()}”`}</p>
      ) : (
        <ScrollArea viewportRef={setViewport} style={{ height }} type="hover">
          <div id={listId} role="listbox" aria-label="Fonts" className="relative" style={{ height: items.length * ROW }}>
            {items.slice(first, last).map((it, k) => {
              const i = first + k;
              const top = i * ROW;
              if (it.kind === 'header') {
                return (
                  <div
                    key={it.key}
                    role="presentation"
                    className="absolute inset-x-0 flex items-end px-3 pb-1 text-2xs font-medium text-text-3 select-none"
                    style={{ top, height: ROW }}
                  >
                    {it.label}
                  </div>
                );
              }
              const selected = it.family === value;
              return (
                <div
                  key={it.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => {
                    if (active !== i) setActiveKey(it.key);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(it.family)}
                  className={cx(
                    'absolute inset-x-1 flex cursor-default items-center gap-2 rounded-[5px] pr-2 pl-2 text-ui select-none',
                    i === active && 'bg-surface-2',
                    selected ? 'text-accent-fg' : 'text-text',
                  )}
                  style={{ top, height: ROW }}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">{selected && <Check aria-hidden className="size-3.5" strokeWidth={2.5} />}</span>
                  <span className="min-w-0 flex-1 truncate" style={it.scriptFont ? undefined : { fontFamily: fontPreviewFamily(it.family) }}>
                    {it.label}
                  </span>
                  {it.sample && (
                    <span dir="rtl" lang="ar" className="shrink-0 text-ui text-text-2" style={{ fontFamily: fontPreviewFamily(it.family) }}>
                      {it.sample}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
      <div className="border-t border-line p-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          leadingIcon={adding ? <Spinner size={12} label={null} /> : <Plus />}
          disabled={adding}
          onClick={() => {
            setAdding(true);
            void addFontFile()
              .then((family) => {
                if (family) onPick(family);
              })
              .finally(() => setAdding(false));
          }}
        >
          Add font file…
        </Button>
      </div>
      {(system === null || (isWeb && !searching)) && (
        <div className="flex h-8 items-center gap-2 border-t border-line px-3 text-2xs text-text-3">
          {system === null ? (
            <>
              <Spinner size={12} label={null} />
              Looking for installed fonts…
            </>
          ) : (
            'Installed fonts are listed in the desktop app.'
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Picks a font file, stores it with the open project and registers it, so
 * text can use it at once. Returns its family, or null when cancelled or
 * refused (the user is told why).
 */
async function addFontFile(): Promise<string | null> {
  const project = useEditor.getState().project;
  if (!project) return null;
  try {
    const picked = await getPlatform().openFile('font');
    if (!picked) return null;
    const font = await putProjectFont(project.id, picked.data, picked.name);
    const store = useEditor.getState();
    if (store.project?.id !== project.id) return null;
    store.addFonts([font]);
    const now = useEditor.getState().project;
    if (now) await registerProjectFonts(now);
    toast.success(`Added ${font.family}`, 'It is saved with this project, so it travels with it.');
    return now?.fonts?.find((f) => f.file === font.file)?.family ?? font.family;
  } catch (err) {
    toast.error('Could not add the font', err instanceof Error ? err.message : String(err));
    return null;
  }
}

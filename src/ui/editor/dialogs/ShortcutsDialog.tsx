/**
 * Keyboard shortcuts: the editor's shortcut table (src/ui/editor/shortcuts.ts),
 * the keys of the sidebar lists and the stage's Space pan, grouped and
 * searchable by action or key name, with keys drawn for this platform.
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { Keyboard, Search, X } from 'lucide-react';
import { Dialog, DialogContent, EmptyState, IconButton, Input, Kbd } from '../../kit';
import { EDITOR_SHORTCUTS } from '../shortcuts';
import { MOVE_DOWN_KEYS, MOVE_UP_KEYS } from '../sidebar/dnd';
import { useOpenSession } from './dialogState';
import { displayShortcuts, filterShortcuts, groupShortcuts, type ShortcutLike } from './shortcutsModel';
import type { EditorDialogProps } from './types';

import { t } from '../../../i18n';
/** Keys of the sidebar lists: they act on the focused row, so they are not in the editor-wide table. */
const LIST_SHORTCUTS: readonly ShortcutLike[] = [
  { id: 'moveSlide', label: t('Move slide up or down (slides list)'), keys: [MOVE_UP_KEYS, MOVE_DOWN_KEYS], group: 'Slides' },
  { id: 'moveLayer', label: t('Bring layer forward or send it backward (layers list)'), keys: [MOVE_UP_KEYS, MOVE_DOWN_KEYS], group: 'Arrange' },
];

/** Held with a drag on the stage, which handles it itself (see Stage.tsx). */
const STAGE_SHORTCUTS: readonly ShortcutLike[] = [{ id: 'pan', label: t('Pan the stage (hold and drag)'), keys: ['space'], group: 'View' }];

const SHORTCUTS: readonly ShortcutLike[] = [...EDITOR_SHORTCUTS, ...LIST_SHORTCUTS, ...STAGE_SHORTCUTS];

export function ShortcutsDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <ShortcutsBody key={session} open={open} onOpenChange={onOpenChange} />;
}

function ShortcutsBody({ open, onOpenChange }: EditorDialogProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupShortcuts(filterShortcuts(SHORTCUTS, query)), [query]);
  const opener = SHORTCUTS.find((s) => s.id === 'shortcuts')?.keys[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        icon={<Keyboard />}
        title={t('Keyboard shortcuts')}
        description={t('Work faster with the keyboard. Shortcuts pause while you type in a field.')}
        flush
        bodyClassName="flex flex-col"
        onEscapeKeyDown={(e) => {
          if (query && document.activeElement === searchRef.current) {
            e.preventDefault();
            setQuery('');
          }
        }}
        footerStart={
          opener ? (
            <span className="flex items-center gap-1.5">
              {t('Press')} <Kbd keys={opener} /> {t('in the editor to open this list.')}
            </span>
          ) : undefined
        }
      >
        <div className="shrink-0 px-5 pb-3">
          <Input
            ref={searchRef}
            type="search"
            aria-label={t('Search shortcuts')}
            placeholder={t('Search shortcuts')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leadingIcon={<Search />}
            suffix={query ? <IconButton size="sm" label={t('Clear search')} tooltip={false} icon={<X />} onClick={() => setQuery('')} className="-mr-1" /> : undefined}
          />
        </div>
        <div className="h-[min(520px,calc(100vh-280px))] overflow-y-auto border-t border-line px-5 pt-4 pb-5">
          {groups.length === 0 ? (
            <EmptyState size="sm" className="h-full" icon={<Keyboard />} title={t('No shortcut matches “{v}”', { v: query.trim() })} description={t('Try an action like “zoom” or a key like “shift”.')} />
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map(({ group, items }) => (
                <section key={group} aria-labelledby={`shortcuts-${group}`} className="flex flex-col gap-2">
                  <h3 id={`shortcuts-${group}`} className="text-2xs font-semibold tracking-[0.06em] text-text-3 uppercase">
                    {group}
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-field light:bg-raised">
                    {items.map((s) => (
                      <li key={s.id} className="flex min-h-9 items-center justify-between gap-4 px-3 py-1.5">
                        <span className="min-w-0 text-ui text-text">{s.label}</span>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {displayShortcuts(s.keys).map((parts, i) => (
                            <Fragment key={i}>
                              {i > 0 && <span className="text-2xs text-text-3">{t('or')}</span>}
                              <Kbd keys={parts} />
                            </Fragment>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

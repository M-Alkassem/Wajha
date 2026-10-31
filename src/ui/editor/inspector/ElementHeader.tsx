/**
 * Header of the element inspector: what is selected (kind icon and an
 * editable name) and what can be done to it (duplicate, delete, arrange,
 * lock, hide).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, BringToFront, Copy, Ellipsis, Eye, EyeOff, Lock, LockOpen, SendToBack, Trash2 } from 'lucide-react';
import type { SlideElement } from '../../../model/types';
import { useEditor } from '../../../store';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, cx } from '../../kit';
import { defaultElementName } from './format';
import { ElementIcon } from './icons';
import type { Target } from './state';

import { t } from '../../../i18n';
const KIND_LABEL: Record<SlideElement['kind'], string> = { text: t('Text'), device: t('Device'), shape: t('Shape'), image: t('Image') };

export interface ElementHeaderProps {
  el: SlideElement;
  target: Target;
  /** Index in painter's order and the layer count, for the arrange items. */
  index: number;
  count: number;
}

export const ElementHeader = memo(function ElementHeader({ el, target, index, count }: ElementHeaderProps) {
  // Only image names depend on the project (their file name); a string selector keeps renders rare.
  const fallback = useEditor((s) => defaultElementName(el, s.project));
  const { slideId, family, elementId } = target;
  const store = useEditor.getState;
  const atTop = index >= count - 1;
  const atBottom = index <= 0;

  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-fg [&_svg]:size-3.5"
        title={KIND_LABEL[el.kind]}
      >
        <ElementIcon el={el} />
      </span>
      <EditableName
        key={el.id}
        value={el.name ?? ''}
        placeholder={fallback}
        kind={KIND_LABEL[el.kind]}
        onCommit={(name) => store().updateElement(slideId, family, elementId, { name })}
      />
      {el.locked && (
        <IconButton size="sm" label={t('Locked on the canvas. Unlock')} icon={<Lock />} className="text-text-3" onClick={() => store().toggleLocked(slideId, family, elementId)} />
      )}
      {el.hidden && (
        <IconButton size="sm" label={t('Hidden. Show')} icon={<EyeOff />} className="text-text-3" onClick={() => store().toggleHidden(slideId, family, elementId)} />
      )}
      <IconButton size="sm" label={t('Duplicate')} icon={<Copy />} onClick={() => store().duplicateElement(slideId, family, elementId)} />
      <IconButton size="sm" label={t('Delete')} icon={<Trash2 />} onClick={() => store().deleteElement(slideId, family, elementId)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" label={t('More actions')} icon={<Ellipsis />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuLabel>{t('Arrange')}</DropdownMenuLabel>
          <DropdownMenuItem icon={<BringToFront />} disabled={atTop} onSelect={() => store().bringToFront(slideId, family, elementId)}>
            {t('Bring to front')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ArrowUp />} disabled={atTop} onSelect={() => store().bringForward(slideId, family, elementId)}>
            {t('Bring forward')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ArrowDown />} disabled={atBottom} onSelect={() => store().sendBackward(slideId, family, elementId)}>
            {t('Send backward')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={<SendToBack />} disabled={atBottom} onSelect={() => store().sendToBack(slideId, family, elementId)}>
            {t('Send to back')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={el.locked ? <LockOpen /> : <Lock />} onSelect={() => store().toggleLocked(slideId, family, elementId)}>
            {el.locked ? t('Unlock') : t('Lock on canvas')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={el.hidden ? <Eye /> : <EyeOff />} onSelect={() => store().toggleHidden(slideId, family, elementId)}>
            {el.hidden ? t('Show') : t('Hide')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Copy />} onSelect={() => store().duplicateElement(slideId, family, elementId)}>
            {t('Duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem danger icon={<Trash2 />} onSelect={() => store().deleteElement(slideId, family, elementId)}>
            {t('Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
});

/** Name that reads as a title and edits in place; empty falls back to the default name. */
function EditableName({ value, placeholder, kind, onCommit }: { value: string; placeholder: string; kind: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // The handlers read the draft through a ref: Enter and Escape blur the field, and the
  // blur handler of that same render would otherwise see the draft they just finished.
  const pending = useRef<string | null>(null);
  const shown = draft ?? value;

  // Selecting something else unmounts the field mid-edit: keep what was typed.
  const latest = useRef({ value, onCommit });
  useLayoutEffect(() => {
    latest.current = { value, onCommit };
  });
  useEffect(
    () => () => {
      const text = pending.current?.replace(/\s+/g, ' ').trim();
      pending.current = null;
      if (text !== undefined && text !== latest.current.value) latest.current.onCommit(text);
    },
    [],
  );

  const finish = (save: boolean) => {
    const text = pending.current;
    pending.current = null;
    setDraft(null);
    if (!save || text === null) return;
    const next = text.replace(/\s+/g, ' ').trim();
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      // Escape reverts the name; it must not also clear the selection.
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      dir="auto"
      spellCheck={false}
      autoComplete="off"
      maxLength={200}
      aria-label={t('{kind} name', { kind })}
      title={shown || placeholder}
      value={shown}
      placeholder={placeholder}
      onChange={(e) => {
        pending.current = e.target.value;
        setDraft(e.target.value);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={onKeyDown}
      className={cx(
        'h-7 min-w-0 flex-1 truncate rounded-sm border border-transparent bg-transparent px-1.5 text-ui font-semibold text-text outline-none',
        'transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-out placeholder:text-text',
        'hover:bg-field focus:border-accent-line focus:bg-field focus:ring-3 focus:ring-focus-soft focus:placeholder:text-text-3',
      )}
    />
  );
}

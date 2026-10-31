import { useLayoutEffect, useRef, useState } from 'react';
import { LIMITS } from '../../../model/rules';
import { useEditor } from '../../../store';
import { Tooltip, cx } from '../../kit';

import { t } from '../../../i18n';
const TEXT = 'text-ui font-semibold tracking-[-0.005em]';

/**
 * The project name in the top bar: click (or Enter) to rename in place.
 * Enter or leaving the field saves, Escape cancels. The field grows with the
 * text up to the same width the name may take.
 */
export function ProjectName() {
  const name = useEditor((s) => s.project?.name ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [tipOpen, setTipOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter unmounts the input, which also fires blur: finish only once.
  const done = useRef(false);
  // Keyboard endings hand focus back to the name; a click elsewhere keeps it there.
  const refocus = useRef(false);

  useLayoutEffect(() => {
    if (editing) {
      done.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const start = () => {
    setDraft(name);
    setTipOpen(false);
    setEditing(true);
  };

  const finish = (commit: boolean, viaKeyboard: boolean) => {
    if (done.current) return;
    done.current = true;
    refocus.current = viaKeyboard;
    setEditing(false);
    const next = draft.trim();
    if (commit && next && next !== name) useEditor.getState().renameProject(next);
  };

  if (editing) {
    return (
      <span className="inline-grid max-w-[320px] min-w-[140px] shrink">
        <span aria-hidden className={cx('invisible col-start-1 row-start-1 h-7 overflow-hidden border border-transparent px-2 leading-[26px] whitespace-pre', TEXT)}>
          {draft || ' '}
        </span>
        <input
          ref={inputRef}
          value={draft}
          size={1}
          dir="auto"
          maxLength={LIMITS.name}
          aria-label={t('Project name')}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(true, true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              finish(false, true);
            }
          }}
          onBlur={() => finish(true, false)}
          className={cx(
            'col-start-1 row-start-1 h-7 w-full min-w-0 rounded-sm border border-accent-line bg-field px-2 text-text outline-none ring-3 ring-focus-soft',
            'light:bg-raised',
            TEXT,
          )}
        />
      </span>
    );
  }

  return (
    <Tooltip
      content={name}
      side="bottom"
      align="start"
      open={tipOpen}
      onOpenChange={(open) => {
        const el = buttonRef.current;
        // Only a truncated name needs its full text in a tooltip.
        setTipOpen(open && !!el && el.scrollWidth > el.clientWidth + 1);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        dir="auto"
        onClick={start}
        aria-label={t('Project name: {name}. Click to rename', { name })}
        className={cx(
          'block h-7 max-w-[320px] min-w-0 shrink truncate rounded-sm px-2 text-start text-text outline-none',
          'transition-colors duration-(--dur-fast) hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-focus',
          TEXT,
        )}
      >
        {name || t('Untitled')}
      </button>
    </Tooltip>
  );
}

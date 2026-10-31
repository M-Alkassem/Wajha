import { useEffect, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { Spinner, Tooltip, cx } from '../../kit';
import { useSaveStatus } from '../../shell/saveStatus';
import { retrySave } from './actions';

import { t } from '../../../i18n';
/** "Saving…" appears only for saves slower than this, so quick saves never flicker. */
const SAVING_DELAY_MS = 300;
/** How long "Saved" stays before it fades. */
const SAVED_VISIBLE_MS = 1600;

/**
 * Quiet autosave feedback next to the project name: a spinner for slow
 * saves, a "Saved" check that fades away, and a persistent "Not saved"
 * button (error in the tooltip, click to retry) when saving fails. It keeps
 * a fixed width so the bar never shifts.
 */
export function SaveIndicator() {
  const status = useSaveStatus((s) => s.status);
  const error = useSaveStatus((s) => s.error);
  const savedAt = useSaveStatus((s) => s.savedAt);
  const [retrying, setRetrying] = useState(false);
  // One timer per phase: it marks a save as slow enough to show, or a "Saved" as old enough to fade.
  const phase = `${status}:${savedAt ?? 0}`;
  const [elapsedPhase, setElapsedPhase] = useState<string | null>(null);
  const elapsed = elapsedPhase === phase;

  useEffect(() => {
    if (status !== 'saving' && status !== 'saved') return;
    const t = setTimeout(() => setElapsedPhase(phase), status === 'saving' ? SAVING_DELAY_MS : SAVED_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [status, phase]);

  if (status === 'error') {
    const retry = async () => {
      if (retrying) return;
      setRetrying(true);
      try {
        await retrySave();
      } finally {
        setRetrying(false);
      }
    };
    return (
      <div className="flex w-[84px] shrink-0 items-center">
        <Tooltip content={<span className="block max-w-[240px]">{error ?? 'Could not save'} · Click to try again</span>} side="bottom">
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            aria-label={t('Changes not saved. Try again')}
            className={cx(
              'inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium text-danger outline-none',
              'transition-colors duration-(--dur-fast) hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
              'disabled:opacity-70',
            )}
          >
            {retrying ? <Spinner size={12} label={null} /> : <CircleAlert className="size-3.5" />}
            <span>{t('Not saved')}</span>
          </button>
        </Tooltip>
        <span role="alert" className="sr-only">
          {t('Your changes could not be saved.')}
        </span>
      </div>
    );
  }

  const saving = status === 'saving' && elapsed;
  const saved = status === 'saved' && !elapsed;
  return (
    <div className="flex w-[84px] shrink-0 items-center px-1.5 text-2xs text-text-3" aria-hidden={!saving && !saved}>
      <span
        className={cx(
          'inline-flex items-center gap-1 transition-opacity ease-out',
          saving || saved ? 'opacity-100 duration-(--dur-fast)' : 'opacity-0 duration-(--dur-slow)',
        )}
      >
        {saving ? (
          <>
            <Spinner size={11} label={null} />
            <span>{t('Saving…')}</span>
          </>
        ) : (
          <>
            <Check className="size-3 text-success" strokeWidth={2.5} />
            <span>{t('Saved')}</span>
          </>
        )}
      </span>
    </div>
  );
}

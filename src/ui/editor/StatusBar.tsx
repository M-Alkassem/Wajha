import { useMemo } from 'react';
import { CircleCheck, ImageOff, Keyboard } from 'lucide-react';
import { FAMILIES, languageInfo } from '../../model/catalog';
import { useApp, useEditor } from '../../store';
import { Kbd, Tooltip, cx } from '../kit';
import { useEditorUi } from './editorUi';
import { FAMILY_ICONS } from './familyMeta';
import { shortcutKeys } from './shortcuts';
import { countMissingShots } from './sidebar/labels';

import { t, tn } from '../../i18n';
import { tx } from '../../i18n/react';
function Dot() {
  return <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-text-3/60" />;
}

const plural = (n: number, one: string, many: string) => tn(n, `{count} ${one}`, `{count} ${many}`);

/**
 * Thin status line under the editor: the active canvas and its pixel size,
 * the slide count against the store limit, screenshots still missing in the
 * preview language (click to go to the first), and a quiet hint.
 */
export function StatusBar() {
  const project = useEditor((s) => s.project);
  const family = useEditor((s) => s.activeFamily);
  const lang = useEditor((s) => s.activeLang);
  const hints = useApp((s) => s.settings.hints);
  // Cheap: layouts are cached per slide, so this is a walk over a few elements per slide.
  const missing = useMemo(() => (project ? countMissingShots(project, family, lang) : { count: 0, first: null }), [project, family, lang]);

  if (!project) return null;
  const info = FAMILIES[family];
  const Icon = FAMILY_ICONS[family];
  const count = project.slides.length;
  const over = Math.max(0, count - info.maxSlides);
  const language = t(languageInfo(lang).name);

  const goToMissing = () => {
    const first = missing.first;
    if (!first) return;
    const ed = useEditor.getState();
    ed.setActiveSlide(first.slideId);
    ed.select(first.elementId, first.slideId);
  };

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2.5 border-t border-line bg-panel px-3 text-2xs text-text-3 select-none">
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3 shrink-0" />
        <span className="truncate text-text-2">{info.label}</span>
        <span className="tabular-nums">
          {info.design.width} × {info.design.height}
        </span>
      </span>
      <Dot />
      <span className="shrink-0 tabular-nums">
        {plural(count, 'slide', 'slides')}
        {over > 0 && (
          <Tooltip content={t('{label} listings show at most {maxSlides}; the rest are not exported', { label: info.label, maxSlides: info.maxSlides })}>
            <span className="ms-1 text-warning">{tx('· {over} not exported', { over })}</span>
          </Tooltip>
        )}
      </span>
      <Dot />
      {missing.count > 0 ? (
        <Tooltip content={t('Slides without a screenshot in {language} show a mock screen. Click to go to the first.', { language })}>
          <button
            type="button"
            onClick={goToMissing}
            className={cx(
              'inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1 -mx-1 text-text-2 outline-none',
              'transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus',
            )}
          >
            <ImageOff className="size-3 text-warning" />
            <span className="tabular-nums">{plural(missing.count, 'missing screenshot', 'missing screenshots')}</span>
          </button>
        </Tooltip>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1">
          <CircleCheck className="size-3 text-success" />
          {t('All screenshots added')}
        </span>
      )}
      <span className="min-w-4 flex-1" />
      {hints && <span className="hidden truncate lg:inline">{t('Drop screenshots or a folder onto the slides to place them')}</span>}
      <button
        type="button"
        onClick={() => useEditorUi.getState().openDialog('shortcuts')}
        aria-label={t('Keyboard shortcuts')}
        className={cx(
          'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[4px] px-1 -me-1 text-text-3 outline-none',
          'transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus',
        )}
      >
        <Keyboard className="size-3.5" />
        <span>{t('Shortcuts')}</span>
        <Kbd keys={shortcutKeys('shortcuts')} className="[&>kbd]:h-4 [&>kbd]:min-w-4" />
      </button>
    </footer>
  );
}

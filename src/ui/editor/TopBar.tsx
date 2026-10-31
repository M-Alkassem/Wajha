import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, PanelLeft, Redo2, Share, Undo2 } from 'lucide-react';
import type { FamilyId } from '../../model/types';
import { useEditor } from '../../store';
import { Button, IconButton, Tooltip } from '../kit';
import { useEditorChrome } from './chrome';
import { useEditorUi } from './editorUi';
import { shortcutKeys } from './shortcuts';
import { leaveEditor } from './topbar/actions';
import { topBarDensity } from './topbar/density';
import { FamilySwitcher } from './topbar/FamilySwitcher';
import { LanguageMenu } from './topbar/LanguageMenu';
import { MoreMenu } from './topbar/MoreMenu';
import { ProjectName } from './topbar/ProjectName';
import { SaveIndicator } from './topbar/SaveIndicator';
import { ZoomMenu } from './topbar/ZoomMenu';

import { t } from '../../i18n';
interface BarSize {
  width: number;
  /** Room reserved for the macOS window buttons (0 elsewhere). */
  inset: number;
}

/** The bar's width and its window-button inset, kept current with a ResizeObserver. */
function useBarSize(bar: RefObject<HTMLElement | null>, inset: RefObject<HTMLElement | null>): BarSize {
  const [size, setSize] = useState<BarSize>(() => ({ width: typeof window === 'undefined' ? 0 : window.innerWidth, inset: 0 }));
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.getBoundingClientRect().width, inset: inset.current?.offsetWidth ?? 0 };
      setSize((prev) => (prev.width === next.width && prev.inset === next.inset ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The inset arrives late: the platform is detected after the first paint.
    if (inset.current) ro.observe(inset.current);
    return () => ro.disconnect();
  }, [bar, inset]);
  return size;
}

const NO_FAMILIES: FamilyId[] = [];

function Separator() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" />;
}

/**
 * The editor's title bar: back to projects, sidebar toggle, project name
 * and save state on the left; device families centered; preview language,
 * history, zoom, more and Export on the right. Empty areas drag the desktop
 * window (each filler carries the bare data-tauri-drag-region attribute,
 * which only reacts to clicks on that exact element).
 */
export function TopBar() {
  const ref = useRef<HTMLElement>(null);
  const insetRef = useRef<HTMLDivElement>(null);
  const size = useBarSize(ref, insetRef);
  const families = useEditor((s) => s.project?.families ?? NO_FAMILIES);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const leftOpen = useEditorChrome((s) => s.leftOpen);
  const [leaving, setLeaving] = useState(false);
  const density = topBarDensity(size.width, families, size.inset);

  const back = async () => {
    setLeaving(true);
    try {
      await leaveEditor();
    } finally {
      // The editor may be gone by now; React ignores the update then.
      setLeaving(false);
    }
  };

  return (
    <header
      ref={ref}
      data-tauri-drag-region
      className="relative z-20 grid h-13 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-3 border-b border-line bg-panel pe-3 ps-2 select-none"
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center">
        <div ref={insetRef} data-tauri-drag-region aria-hidden className="h-full shrink-0 self-stretch" style={{ width: 'var(--traffic-lights-w, 0px)' }} />
        <IconButton label={t('Back to projects')} icon={<ChevronLeft className="rtl:-scale-x-100" />} tooltipSide="bottom" loading={leaving} onClick={() => void back()} />
        <IconButton
          label={leftOpen ? t('Hide sidebar') : t('Show sidebar')}
          icon={<PanelLeft className="rtl:-scale-x-100" />}
          shortcut={shortcutKeys('toggleSidebar')}
          tooltipSide="bottom"
          onClick={() => useEditorChrome.getState().toggleLeft()}
          className="ms-0.5"
        />
        <Separator />
        <ProjectName />
        <SaveIndicator />
        <div data-tauri-drag-region className="h-full min-w-2 flex-1 self-stretch" />
      </div>

      <FamilySwitcher labels={density.familyLabels} />

      <div data-tauri-drag-region className="flex items-center justify-end gap-1">
        <div data-tauri-drag-region className="h-full flex-1 self-stretch" />
        <LanguageMenu showName={density.languageName} />
        <Separator />
        <IconButton label={t('Undo')} icon={<Undo2 className="rtl:-scale-x-100" />} shortcut={shortcutKeys('undo')} tooltipSide="bottom" disabled={!canUndo} onClick={() => useEditor.getState().undo()} />
        <IconButton label={t('Redo')} icon={<Redo2 className="rtl:-scale-x-100" />} shortcut={shortcutKeys('redo')} tooltipSide="bottom" disabled={!canRedo} onClick={() => useEditor.getState().redo()} />
        <ZoomMenu />
        <Separator />
        <MoreMenu />
        <Tooltip content={t('Export screenshots')} shortcut={shortcutKeys('export')} side="bottom">
          <Button variant="brand" leadingIcon={<Share />} className="ms-1.5" onClick={() => useEditorUi.getState().openDialog('export')}>
            {t('Export')}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

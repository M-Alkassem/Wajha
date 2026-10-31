import { useCallback, useEffect } from 'react';
import { useApp, useEditor } from '../../store';
import { Spinner } from '../kit';
import { useEditorChrome } from './chrome';
import { BrandKitDialog, ExportDialog, FamiliesDialog, LanguagesDialog, SaveTemplateDialog, ShortcutsDialog, TranslationsDialog } from './dialogs';
import { useEditorUi } from './editorUi';
import { Inspector } from './inspector/Inspector';
import { LeftSidebar } from './sidebar/LeftSidebar';
import { Stage } from './stage/Stage';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { useEditorShortcuts } from './useEditorShortcuts';

import { t } from '../../i18n';
/** How long the editor waits for its project before it gives up and shows the projects. */
const NO_PROJECT_MS = 1500;

/**
 * Editor layout: top bar over [slides and layers | stage | inspector] over a
 * thin status line, with every editor dialog mounted and controlled by
 * useEditorUi, and the keyboard shortcuts installed.
 */
export function EditorScreen() {
  const hasProject = useEditor((s) => s.project !== null);

  useEffect(() => {
    if (hasProject) return;
    const t = setTimeout(() => {
      if (!useEditor.getState().project) useApp.getState().navigate({ name: 'home' });
    }, NO_PROJECT_MS);
    return () => clearTimeout(t);
  }, [hasProject]);

  // A dialog left open must not reappear with the next project.
  useEffect(() => () => useEditorUi.getState().closeDialog(), []);

  if (!hasProject) return <OpeningProject />;
  return <EditorLayout />;
}

function EditorLayout() {
  const leftOpen = useEditorChrome((s) => s.leftOpen);
  const rightOpen = useEditorChrome((s) => s.rightOpen);
  useEditorShortcuts();

  return (
    <div className="flex h-full flex-col bg-app text-text">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {leftOpen && <LeftSidebar />}
        <main aria-label={t('Slides canvas')} className="relative min-w-0 flex-1 bg-stage">
          <Stage />
        </main>
        {rightOpen && (
          <aside aria-label={t('Inspector')} className="flex h-full w-(--inspector-w) shrink-0 flex-col border-l border-line bg-panel">
            <Inspector />
          </aside>
        )}
      </div>
      <StatusBar />
      <EditorDialogs />
    </div>
  );
}

/** The dialog useEditorUi asks for. Closing one puts focus back on whatever opened it (the kit Dialog does). */
function EditorDialogs() {
  const dialog = useEditorUi((s) => s.dialog);
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) useEditorUi.getState().closeDialog();
  }, []);
  return (
    <>
      <ExportDialog open={dialog === 'export'} onOpenChange={onOpenChange} />
      <TranslationsDialog open={dialog === 'translations'} onOpenChange={onOpenChange} />
      <LanguagesDialog open={dialog === 'languages'} onOpenChange={onOpenChange} />
      <FamiliesDialog open={dialog === 'families'} onOpenChange={onOpenChange} />
      <SaveTemplateDialog open={dialog === 'saveTemplate'} onOpenChange={onOpenChange} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onOpenChange={onOpenChange} />
      <BrandKitDialog open={dialog === 'brand'} onOpenChange={onOpenChange} />
    </>
  );
}

/** Shown while the project loads; the window stays draggable. */
function OpeningProject() {
  return (
    <div data-tauri-drag-region className="flex h-full items-center justify-center bg-app">
      <div className="flex animate-[kit-fade-in_var(--dur-slow)_var(--ease-out)_200ms_both] flex-col items-center gap-3 text-text-3">
        <Spinner size={20} label={t('Opening project')} />
        <span className="text-xs">{t('Opening project…')}</span>
      </div>
    </div>
  );
}

/**
 * Top bar flows with side effects: leaving the editor (save first, offer to
 * leave anyway when saving fails), saving a retry, and writing the project
 * as a .wajha file.
 */
import { sanitizeSegment } from '../../../export';
import { getPlatform } from '../../../platform';
import { exportProjectArchive } from '../../../storage';
import { flushProject, goHome, toast, useApp, useEditor } from '../../../store';

import { t } from '../../../i18n';
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

let leaving: Promise<void> | null = null;

/**
 * Saves pending edits and returns to the projects. When the save fails the
 * editor stays open and an error toast offers "Leave anyway".
 * Concurrent calls share one attempt.
 */
export function leaveEditor(): Promise<void> {
  if (leaving) return leaving;
  leaving = (async () => {
    try {
      await goHome();
    } catch (err) {
      useApp.getState().pushToast({
        kind: 'error',
        title: t('Your latest changes are not saved'),
        description: t('{message} Stay to try again, or leave and lose them.', { message: message(err) }),
        action: { label: t('Leave anyway'), run: () => void goHome({ discard: true }) },
        duration: 12000,
      });
    } finally {
      leaving = null;
    }
  })();
  return leaving;
}

/** Retries a failed autosave now. Resolves true when it worked. */
export async function retrySave(): Promise<boolean> {
  try {
    await flushProject();
    return true;
  } catch (err) {
    toast.error(t('Still could not save'), message(err));
    return false;
  }
}

/** File name for the project archive. */
export function projectFileName(name: string): string {
  return `${sanitizeSegment(name)}.wajha`;
}

let exporting = false;

/**
 * Writes the open project (with its images) as a .wajha file through the
 * save dialog (desktop) or a download (web). A slow export shows a progress
 * toast after a moment.
 */
export async function exportProjectFile(): Promise<void> {
  const project = useEditor.getState().project;
  if (!project || exporting) return;
  exporting = true;
  const progress: { toast: string | null } = { toast: null };
  const timer = setTimeout(() => {
    progress.toast = useApp.getState().pushToast({ kind: 'info', title: t('Preparing the project file…'), duration: 0 });
  }, 400);
  try {
    await flushProject();
    const bytes = await exportProjectArchive(project.id);
    clearTimeout(timer);
    // The save dialog is the progress from here on.
    if (progress.toast) useApp.getState().dismissToast(progress.toast);
    const saved = await getPlatform().saveFile(projectFileName(project.name), bytes);
    if (saved) toast.success(t('Project file saved'), saved);
  } catch (err) {
    toast.error(t('Could not export the project'), message(err));
  } finally {
    clearTimeout(timer);
    if (progress.toast) useApp.getState().dismissToast(progress.toast);
    exporting = false;
  }
}

/**
 * Template sources beyond the built-ins: the user's own templates (saved
 * or installed from the gallery) and the community gallery index. Module
 * level, so reopening the new-project dialog does not refetch.
 */
import { create } from 'zustand';
import type { GalleryEntry, Template } from '../../model/types';
import { getPlatform } from '../../platform';
import {
  deleteUserTemplate,
  exportTemplateArchive,
  fetchGallery,
  importTemplateArchive,
  installGalleryTemplate,
  listUserTemplates,
  type GalleryResult,
} from '../../storage';
import { confirmDialog, toast } from '../../store';
import { archiveFileName, shorten } from './format';
import { errorText } from './library';

import { t } from '../../i18n';
/* My templates -------------------------------------------------------- */

export interface UserTemplatesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  templates: Template[];
  error: string | null;
  /** Template ids with an export or delete in flight. */
  busy: Readonly<Record<string, true>>;
  importing: boolean;
}

export const useUserTemplates = create<UserTemplatesState>()(() => ({
  status: 'idle',
  templates: [],
  error: null,
  busy: {},
  importing: false,
}));

let userTicket = 0;

export async function refreshUserTemplates(): Promise<Template[]> {
  const ticket = ++userTicket;
  if (useUserTemplates.getState().status !== 'ready') useUserTemplates.setState({ status: 'loading', error: null });
  try {
    const templates = await listUserTemplates();
    if (ticket === userTicket) useUserTemplates.setState({ status: 'ready', templates, error: null });
    return templates;
  } catch (e) {
    if (ticket === userTicket && useUserTemplates.getState().status !== 'ready') {
      useUserTemplates.setState({ status: 'error', error: errorText(e) });
    }
    return useUserTemplates.getState().templates;
  }
}

function setTemplateBusy(id: string, busy: boolean): void {
  useUserTemplates.setState((s) => {
    const next = { ...s.busy };
    if (busy) next[id] = true;
    else delete next[id];
    return { busy: next };
  });
}

const isCancel = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'cancelled';

/** Asks, then deletes a user template. Resolves true when it was deleted. */
export async function deleteTemplateWithConfirm(template: Template): Promise<boolean> {
  const ok = await confirmDialog({
    title: t('Delete the template “{shorten}”?', { shorten: shorten(template.name) }),
    message: t('Projects made from it keep their design. The template itself cannot be restored.'),
    confirmLabel: t('Delete template'),
    danger: true,
  });
  if (!ok) return false;
  setTemplateBusy(template.id, true);
  try {
    await deleteUserTemplate(template.id);
    useUserTemplates.setState((s) => ({ templates: s.templates.filter((x) => x.id !== template.id) }));
    return true;
  } catch (e) {
    toast.error(t('Could not delete the template'), errorText(e));
    return false;
  } finally {
    setTemplateBusy(template.id, false);
    void refreshUserTemplates();
  }
}

export async function exportTemplateFile(template: Template): Promise<void> {
  setTemplateBusy(template.id, true);
  try {
    const bytes = await exportTemplateArchive(template.id);
    const saved = await getPlatform().saveFile(archiveFileName(template.name, 'wajha-template'), bytes);
    if (saved) toast.success(t('Template exported'), saved);
  } catch (e) {
    if (!isCancel(e)) toast.error(t('Could not export the template'), errorText(e));
  } finally {
    setTemplateBusy(template.id, false);
  }
}

/** Imports .wajha-template bytes; resolves with the stored template, or null after an error toast. */
export async function importTemplateBytes(data: Uint8Array, fileName: string): Promise<Template | null> {
  useUserTemplates.setState({ importing: true });
  try {
    const template = await importTemplateArchive(data);
    await refreshUserTemplates();
    toast.success(t('Template imported'), t('“{shorten}” is in My templates.', { shorten: shorten(template.name) }));
    return template;
  } catch (e) {
    toast.error(t('Could not import “{shorten}”', { shorten: shorten(fileName, 48) }), errorText(e));
    return null;
  } finally {
    useUserTemplates.setState({ importing: false });
  }
}

/** "Import template file": picks a .wajha-template and imports it. */
export async function importTemplateFile(): Promise<Template | null> {
  if (useUserTemplates.getState().importing) return null;
  let file: { name: string; data: Uint8Array } | null;
  try {
    file = await getPlatform().openFile('template');
  } catch (e) {
    if (!isCancel(e)) toast.error(t('Could not open the file'), errorText(e));
    return null;
  }
  return file ? importTemplateBytes(file.data, file.name) : null;
}

/* Community gallery ----------------------------------------------------- */

export interface GalleryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  result: GalleryResult | null;
  /** Gallery ids being downloaded. */
  installing: Readonly<Record<string, true>>;
}

export const useGallery = create<GalleryState>()(() => ({ status: 'idle', result: null, installing: {} }));

let galleryTicket = 0;

/** Loads the gallery index once per session; `force` refetches (Retry). */
export async function loadGallery(force = false): Promise<void> {
  const s = useGallery.getState();
  if (!force && (s.status === 'loading' || s.status === 'ready')) return;
  const ticket = ++galleryTicket;
  useGallery.setState({ status: 'loading' });
  try {
    const result = await fetchGallery();
    if (ticket !== galleryTicket) return;
    // null: offline with nothing cached.
    useGallery.setState(result ? { status: 'ready', result } : { status: 'error', result: null });
  } catch {
    if (ticket === galleryTicket) useGallery.setState({ status: 'error', result: null });
  }
}

/** Downloads a gallery template into My templates; resolves with it, or null after an error toast. */
export async function installFromGallery(entry: GalleryEntry): Promise<Template | null> {
  if (useGallery.getState().installing[entry.id]) return null;
  useGallery.setState((s) => ({ installing: { ...s.installing, [entry.id]: true } }));
  try {
    const template = await installGalleryTemplate(entry);
    await refreshUserTemplates();
    // The download proves the network is back: replace the cached index and its "You're offline" notice.
    if (useGallery.getState().result?.offline) void loadGallery(true);
    return template;
  } catch (e) {
    toast.error(t('Could not install “{shorten}”', { shorten: shorten(entry.name, 48) }), errorText(e));
    return null;
  } finally {
    useGallery.setState((s) => {
      const installing = { ...s.installing };
      delete installing[entry.id];
      return { installing };
    });
  }
}

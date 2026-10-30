/**
 * Editor flows with side effects: create, open and leave projects, delete
 * them, save the open project as a template. I/O only: the UI catches the
 * rejections (storage errors) and shows them.
 */
import { blankProject } from '../model/defaults';
import { newId } from '../model/ids';
import { projectFromTemplate, templateFromProject, templateIdFrom, type NewProjectOptions, type TemplateMeta } from '../model/instantiate';
import { isTemplateId } from '../model/rules';
import type { Project, Template } from '../model/types';
import { validateProject } from '../model/validate';
import { copyTemplateAssets, deleteProject, listUserTemplates, loadProject, readAsset, saveProject, saveUserTemplate, withPresentAssets } from '../storage';
import { BUILTIN_TEMPLATES } from '../templates';
import { useApp } from './app';
import { useEditor } from './editor';

let flusher: (() => Promise<void>) | null = null;
/** Bumped by every open and goHome, so a slow load cannot open a project the user already left. */
let navigation = 0;

/**
 * Registers how pending edits are written before the editor closes (the
 * runtime passes its autosave `flush`). Without one, the project is saved directly.
 */
export function setProjectFlusher(fn: (() => Promise<void>) | null): void {
  flusher = fn;
}

/** Writes the open project now. */
export async function flushProject(): Promise<void> {
  if (flusher) {
    await flusher();
    return;
  }
  const project = useEditor.getState().project;
  if (project) await saveProject(project);
}

/** Creates and saves a project from a template (copying its images); returns the new id. */
export async function createProjectFromTemplate(template: Template, opts: NewProjectOptions): Promise<string> {
  const project = projectFromTemplate(template, opts);
  const assetIds = Object.keys(project.assets);
  try {
    const copied = assetIds.length ? await copyTemplateAssets(template.id, project.id, assetIds) : [];
    // An image missing or damaged in the template goes with every reference to it.
    await saveProject(copied.length < assetIds.length ? validateProject(withPresentAssets(project, new Set(copied))) : project);
  } catch (e) {
    // Leave nothing half-created behind (copied images without a project).
    await deleteProject(project.id).catch(() => undefined);
    throw e;
  }
  return project.id;
}

/** Creates and saves a blank project; returns the new id. */
export async function createBlankProject(opts: NewProjectOptions): Promise<string> {
  const project = blankProject(opts.name, opts.families, opts.languages);
  await saveProject(project);
  return project.id;
}

/**
 * Loads a project into the editor and routes to it. Resolves with the open
 * project, or null when another navigation happened while it was loading.
 */
export async function openProjectById(id: string): Promise<Project | null> {
  const ticket = ++navigation;
  const current = useEditor.getState().project;
  if (current && current.id === id) {
    // Already open: reloading from disk would drop edits autosave has not written yet.
    useApp.getState().navigate({ name: 'editor', projectId: id });
    return current;
  }
  if (current) await flushProject();
  // Nothing can bring back an image the saved project no longer uses: no undo history exists yet.
  const project = await loadProject(id, { pruneAssets: true });
  if (ticket !== navigation) return null;
  useEditor.getState().openProject(project);
  const opened = useEditor.getState().project;
  if (!opened) return null;
  useApp.getState().navigate({ name: 'editor', projectId: opened.id });
  return opened;
}

/** Creates a project (from a template, or blank with null) and opens it. */
export async function createAndOpenProject(template: Template | null, opts: NewProjectOptions): Promise<Project | null> {
  const id = template ? await createProjectFromTemplate(template, opts) : await createBlankProject(opts);
  return openProjectById(id);
}

/**
 * Saves pending edits, closes the editor and shows the home screen. When
 * saving fails it rejects and the editor stays open, unless `discard` is set.
 */
export async function goHome(options: { discard?: boolean } = {}): Promise<void> {
  navigation++;
  if (!options.discard) await flushProject();
  useEditor.getState().closeProject();
  useApp.getState().navigate({ name: 'home' });
}

/** Deletes a project from the library, closing it first when it is open. */
export async function deleteProjectById(id: string): Promise<void> {
  if (useEditor.getState().project?.id === id) await goHome({ discard: true });
  await deleteProject(id);
}

/**
 * Saves the open project as a user template (design only, see
 * templateFromProject) with its design images and an optional preview JPEG.
 * A missing or unusable `meta.id` gets a fresh id that no other template uses.
 */
export async function saveProjectAsTemplate(meta: TemplateMeta, preview: Uint8Array | null = null): Promise<Template> {
  const project = useEditor.getState().project;
  if (!project) throw new Error('No project is open.');
  const template = templateFromProject(project, meta);
  if (!isTemplateId(meta.id)) {
    const taken = new Set([...BUILTIN_TEMPLATES.map((t) => t.id), ...(await listUserTemplates()).map((t) => t.id)]);
    template.id = freeTemplateId(templateIdFrom('', template.name), taken);
  }
  const files: Record<string, Uint8Array> = {};
  for (const id of Object.keys(template.assets)) {
    const bytes = await readAsset(project.id, id);
    // Without the file the reference would dangle; validation drops it on load.
    if (bytes) files[id] = bytes;
    else delete template.assets[id];
  }
  await saveUserTemplate(template, preview, files);
  return template;
}

function freeTemplateId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < taken.size + 3; n++) {
    const id = `${base.slice(0, 60)}-${n}`;
    if (!taken.has(id) && isTemplateId(id)) return id;
  }
  return newId('t');
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankProject } from '../../model/defaults';
import type { ProjectMeta } from '../../model/types';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../../platform';
import { exportProjectArchive, listProjects, loadProject, saveProject } from '../../storage';
import { useApp, useEditor } from '../../store';
import {
  deleteProjectWithConfirm,
  duplicateProjectById,
  errorText,
  exportProjectFile,
  mergeProjects,
  openProject,
  openProjectFile,
  refreshProjects,
  renameProject,
  renameWhenMenuCloses,
  startPendingRename,
  useLibrary,
} from './library';

let platform: MemoryPlatform;

async function addProject(name: string, updatedAt: number): Promise<string> {
  const p = blankProject(name, ['iphone'], ['en-US']);
  p.updatedAt = updatedAt;
  p.createdAt = updatedAt;
  await saveProject(p);
  return p.id;
}

/** Answers the next confirm dialog. */
function answerConfirm(ok: boolean): void {
  queueMicrotask(() => useApp.getState().resolveConfirm(ok));
}

const toasts = () => useApp.getState().toasts.map((t) => `${t.kind}: ${t.title}`);

beforeEach(() => {
  platform = createMemoryPlatform();
  setPlatform(platform);
  useLibrary.setState({ status: 'loading', projects: [], error: null, busy: {}, openingId: null, renamingId: null, focusRequest: null, flashId: null, importing: false });
  useEditor.getState().closeProject();
  useApp.getState().navigate({ name: 'home' });
  useApp.getState().clearToasts();
});

afterEach(() => {
  useApp.getState().clearToasts();
  while (useApp.getState().confirmRequest) useApp.getState().resolveConfirm(false);
});

describe('mergeProjects', () => {
  const meta = (id: string, name: string, updatedAt = 1): ProjectMeta => ({
    id,
    name,
    updatedAt,
    createdAt: 1,
    slideCount: 3,
    families: ['iphone'],
    languages: ['en-US'],
    templateId: null,
  });

  it('reuses unchanged entries and takes changed ones', () => {
    const a = meta('a', 'A');
    const b = meta('b', 'B');
    const next = mergeProjects([a, b], [meta('b', 'B'), meta('a', 'A2')]);
    expect(next[0]).toBe(b);
    expect(next[1]).not.toBe(a);
    expect(next[1].name).toBe('A2');
  });

  it('notices list changes inside an entry', () => {
    const a = meta('a', 'A');
    const changed = { ...meta('a', 'A'), languages: ['en-US', 'ar-SA'] };
    expect(mergeProjects([a], [changed])[0]).toBe(changed);
  });
});

describe('refreshProjects', () => {
  it('lists the library most recent first', async () => {
    await addProject('Old', 1000);
    await addProject('New', 2000);
    await refreshProjects();
    const s = useLibrary.getState();
    expect(s.status).toBe('ready');
    expect(s.projects.map((p) => p.name)).toEqual(['New', 'Old']);
  });

  it('keeps entry identity across refreshes', async () => {
    await addProject('One', 1000);
    await refreshProjects();
    const first = useLibrary.getState().projects[0];
    await refreshProjects();
    expect(useLibrary.getState().projects[0]).toBe(first);
  });

  it('reports a failed first load, but keeps a good list when a later one fails', async () => {
    const list = platform.list.bind(platform);
    platform.list = async () => {
      throw new Error('disk on fire');
    };
    await refreshProjects();
    expect(useLibrary.getState()).toMatchObject({ status: 'error', error: 'disk on fire' });

    platform.list = list;
    await addProject('Kept', 1000);
    await refreshProjects();
    platform.list = async () => {
      throw new Error('again');
    };
    await refreshProjects();
    expect(useLibrary.getState().status).toBe('ready');
    expect(useLibrary.getState().projects.map((p) => p.name)).toEqual(['Kept']);
  });
});

describe('renameProject', () => {
  it('saves the cleaned name with a fresh updatedAt and moves the card first', async () => {
    const a = await addProject('Alpha', 1000);
    await addProject('Beta', 2000);
    await refreshProjects();
    await renameProject(a, '  Alpha\u0007 2  ', true);
    const saved = await loadProject(a);
    expect(saved.name).toBe('Alpha 2');
    expect(saved.updatedAt).toBeGreaterThan(2000);
    expect(useLibrary.getState().projects[0].id).toBe(a);
    expect(useLibrary.getState().focusRequest?.id).toBe(a);
    expect(useLibrary.getState().renamingId).toBeNull();
    expect(useLibrary.getState().busy[a]).toBeUndefined();
  });

  it('ignores empty and unchanged names', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    await renameProject(a, '   ');
    await renameProject(a, 'Alpha');
    expect((await loadProject(a)).updatedAt).toBe(1000);
  });

  it('reverts and explains a failed save', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    const write = platform.write.bind(platform);
    platform.write = async () => {
      throw new Error('read-only volume');
    };
    await renameProject(a, 'Beta');
    platform.write = write;
    expect(useLibrary.getState().projects[0].name).toBe('Alpha');
    expect(toasts()).toContain('error: Could not rename the project');
  });
});

describe('rename from a menu', () => {
  it('opens the field only for the card whose menu asked, once', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    expect(startPendingRename(a)).toBe(false);
    renameWhenMenuCloses(a);
    expect(startPendingRename('other')).toBe(false);
    expect(startPendingRename(a)).toBe(true);
    expect(useLibrary.getState().renamingId).toBe(a);
    expect(startPendingRename(a)).toBe(false);
  });
});

describe('duplicate, export, delete', () => {
  it('duplicates as "<name> copy" and focuses the copy', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    await duplicateProjectById(a);
    const names = (await listProjects()).map((p) => p.name);
    expect(names).toEqual(['Alpha copy', 'Alpha']);
    const copy = useLibrary.getState().projects.find((p) => p.name === 'Alpha copy');
    expect(useLibrary.getState().focusRequest?.id).toBe(copy?.id);
    // The copy is ringed for a moment to show where it landed.
    expect(useLibrary.getState().flashId).toBe(copy?.id);
  });

  it('exports a .wajha file with a safe name', async () => {
    const a = await addProject('My: App/1', 1000);
    await refreshProjects();
    await exportProjectFile(a);
    expect(platform.testing.savedFiles).toHaveLength(1);
    expect(platform.testing.savedFiles[0].name).toBe('My App1.wajha');
    expect(platform.testing.savedFiles[0].data.byteLength).toBeGreaterThan(100);
    expect(toasts()).toContain('success: Project exported');
  });

  it('stays quiet when the save dialog is cancelled', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    platform.testing.setHandlers({ saveFile: () => null });
    await exportProjectFile(a);
    expect(toasts()).toEqual([]);
  });

  it('deletes only after confirmation', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();

    answerConfirm(false);
    await deleteProjectWithConfirm(a);
    expect(await listProjects()).toHaveLength(1);

    answerConfirm(true);
    await deleteProjectWithConfirm(a);
    expect(await listProjects()).toHaveLength(0);
    expect(useLibrary.getState().projects).toEqual([]);
  });

  it('says where the project is deleted from', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    const askedMessage = async () => {
      const done = deleteProjectWithConfirm(a);
      await new Promise((r) => setTimeout(r, 0));
      const message = useApp.getState().confirmRequest?.message;
      useApp.getState().resolveConfirm(false);
      await done;
      return message;
    };
    // The browser build keeps projects in the browser, not on "this computer".
    expect(await askedMessage()).toBe('The project and its screenshots will be removed from this browser. This cannot be undone.');
    Object.defineProperty(platform, 'kind', { value: 'desktop' });
    expect(await askedMessage()).toBe('The project and its screenshots will be removed from this computer. This cannot be undone.');
  });
});

describe('opening', () => {
  it('opens a project in the editor and clears the busy state', async () => {
    const a = await addProject('Alpha', 1000);
    await refreshProjects();
    await openProject(a);
    expect(useApp.getState().route).toEqual({ name: 'editor', projectId: a });
    expect(useEditor.getState().project?.id).toBe(a);
    expect(useLibrary.getState()).toMatchObject({ openingId: null, busy: {} });
  });

  it('explains a project that cannot be opened', async () => {
    await refreshProjects();
    await openProject('missing-project');
    expect(useApp.getState().route).toEqual({ name: 'home' });
    expect(toasts()).toContain('error: Could not open the project');
    expect(useLibrary.getState().openingId).toBeNull();
  });

  it('imports a picked .wajha file as a new project and opens it', async () => {
    const a = await addProject('Shared', 1000);
    const bytes = await exportProjectArchive(a);
    platform.testing.setHandlers({ openFile: () => ({ name: 'Shared.wajha', data: bytes }) });
    await openProjectFile();
    const route = useApp.getState().route;
    expect(route.name).toBe('editor');
    expect(route.name === 'editor' && route.projectId).not.toBe(a);
    expect(useEditor.getState().project?.name).toBe('Shared (imported)');
    expect(useLibrary.getState().importing).toBe(false);
  });

  it('reports a file that is not a project', async () => {
    platform.testing.setHandlers({ openFile: () => ({ name: 'notes.wajha', data: new Uint8Array([1, 2, 3]) }) });
    await openProjectFile();
    expect(useApp.getState().route).toEqual({ name: 'home' });
    expect(toasts()).toContain('error: Could not open “notes.wajha”');
    expect(useLibrary.getState().importing).toBe(false);
  });

  it('does nothing when the picker is cancelled', async () => {
    await openProjectFile();
    expect(toasts()).toEqual([]);
  });
});

describe('errorText', () => {
  it('reads errors, strings and the rest', () => {
    expect(errorText(new Error('boom'))).toBe('boom');
    expect(errorText('plain')).toBe('plain');
    expect(errorText(42)).toBe('Something went wrong.');
  });
});

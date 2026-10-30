import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankProject } from '../model/defaults';
import { assetId, assetInfo, sampleTemplate } from '../model/fixtures.node';
import type { Project, Template } from '../model/types';

const storage = vi.hoisted(() => {
  const saved = new Map<string, Project>();
  return {
    saved,
    loadProject: vi.fn(async (id: string): Promise<Project> => {
      const p = saved.get(id);
      if (!p) throw new Error(`not_found: ${id}`);
      return JSON.parse(JSON.stringify(p)) as Project;
    }),
    saveProject: vi.fn(async (p: Project): Promise<void> => {
      saved.set(p.id, JSON.parse(JSON.stringify(p)) as Project);
    }),
    deleteProject: vi.fn(async (id: string): Promise<void> => {
      saved.delete(id);
    }),
    copyTemplateAssets: vi.fn(async (_t: string, _p: string, ids: string[]): Promise<string[]> => ids),
    readAsset: vi.fn(async (_p: string, _a: string): Promise<Uint8Array | null> => new Uint8Array([1, 2, 3])),
    saveUserTemplate: vi.fn(async (_t: Template, _preview: Uint8Array | null, _assets: Record<string, Uint8Array>): Promise<void> => undefined),
    listUserTemplates: vi.fn(async (): Promise<Template[]> => []),
    loadSettings: vi.fn(async () => ({ theme: 'system' as const, hints: true })),
    saveSettings: vi.fn(async () => undefined),
  };
});
vi.mock('../storage', async () => ({
  ...storage,
  withPresentAssets: (await vi.importActual<typeof import('../storage/refs')>('../storage/refs')).withPresentAssets,
}));
vi.mock('../templates', () => ({ BUILTIN_TEMPLATES: [{ id: 'aurora' }] }));

import {
  createAndOpenProject,
  createBlankProject,
  createProjectFromTemplate,
  deleteProjectById,
  flushProject,
  goHome,
  openProjectById,
  saveProjectAsTemplate,
  setProjectFlusher,
} from './actions';
import { useApp } from './app';
import { useEditor } from './editor';

const opts = { name: 'Shop', families: ['iphone' as const], languages: ['en-US'] };

beforeEach(() => {
  storage.saved.clear();
  for (const fn of Object.values(storage)) if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
  useEditor.getState().closeProject();
  useApp.getState().navigate({ name: 'home' });
  setProjectFlusher(null);
});

afterEach(() => {
  setProjectFlusher(null);
});

describe('creating projects', () => {
  it('creates a project from a template and saves it', async () => {
    const id = await createProjectFromTemplate(sampleTemplate(3), opts);
    expect(storage.saveProject).toHaveBeenCalledTimes(1);
    const saved = storage.saved.get(id)!;
    expect(saved).toMatchObject({ name: 'Shop', templateId: 'sample-glow', families: ['iphone'] });
    expect(saved.slides).toHaveLength(3);
    expect(storage.copyTemplateAssets).not.toHaveBeenCalled();
  });

  it('copies template images first and cleans up when anything fails', async () => {
    const t: Template = { ...sampleTemplate(1), assets: { [assetId(1)]: assetInfo(1) } };
    const id = await createProjectFromTemplate(t, opts);
    expect(storage.copyTemplateAssets).toHaveBeenCalledWith('sample-glow', id, [assetId(1)]);
    storage.saveProject.mockRejectedValueOnce(new Error('disk full'));
    await expect(createProjectFromTemplate(t, opts)).rejects.toThrow('disk full');
    expect(storage.deleteProject).toHaveBeenCalledTimes(1);
    storage.copyTemplateAssets.mockRejectedValueOnce(new Error('missing image'));
    await expect(createProjectFromTemplate(t, opts)).rejects.toThrow('missing image');
    expect(storage.saved.size).toBe(1);
  });

  it('drops every reference to a template image that could not be copied', async () => {
    const fill = { type: 'image' as const, assetId: assetId(1), fit: 'cover' as const, opacity: 1, blur: 0, tint: null };
    const base = sampleTemplate(1);
    const t: Template = { ...base, theme: { ...base.theme, background: { fill, pattern: null } }, assets: { [assetId(1)]: assetInfo(1) } };
    storage.copyTemplateAssets.mockResolvedValueOnce([]);
    const saved = storage.saved.get(await createProjectFromTemplate(t, opts))!;
    expect(saved.assets).toEqual({});
    expect(saved.theme.background.fill.type).not.toBe('image');
    // Copied images keep their references.
    const kept = storage.saved.get(await createProjectFromTemplate(t, opts))!;
    expect(Object.keys(kept.assets)).toEqual([assetId(1)]);
    expect(kept.theme.background.fill).toEqual(fill);
  });

  it('creates blank projects', async () => {
    const id = await createBlankProject({ name: 'Blank', families: ['ipad'], languages: ['ar-SA'] });
    expect(storage.saved.get(id)).toMatchObject({ name: 'Blank', families: ['ipad'], languages: ['ar-SA'], templateId: null });
  });

  it('creates and opens in one go', async () => {
    const p = await createAndOpenProject(null, opts);
    expect(p?.name).toBe('Shop');
    expect(useApp.getState().route).toEqual({ name: 'editor', projectId: p!.id });
    const q = await createAndOpenProject(sampleTemplate(2), opts);
    expect(q?.templateId).toBe('sample-glow');
  });
});

describe('opening and leaving', () => {
  it('opens a project into the editor and routes to it', async () => {
    const p = blankProject('Open me', ['iphone'], ['en-US']);
    await storage.saveProject(p);
    const opened = await openProjectById(p.id);
    expect(opened?.id).toBe(p.id);
    expect(useEditor.getState().project?.name).toBe('Open me');
    expect(useApp.getState().route).toEqual({ name: 'editor', projectId: p.id });
  });

  it('propagates load errors and stays where it was', async () => {
    await expect(openProjectById('missing')).rejects.toThrow('not_found');
    expect(useEditor.getState().project).toBeNull();
    expect(useApp.getState().route).toEqual({ name: 'home' });
  });

  it('lets the latest navigation win when loads race', async () => {
    const a = blankProject('A', ['iphone'], ['en-US']);
    const b = blankProject('B', ['iphone'], ['en-US']);
    await storage.saveProject(a);
    await storage.saveProject(b);
    let release: () => void = () => undefined;
    storage.loadProject.mockImplementationOnce(async (id: string) => {
      await new Promise<void>((r) => (release = r));
      return JSON.parse(JSON.stringify(storage.saved.get(id))) as Project;
    });
    const slow = openProjectById(a.id);
    const fast = await openProjectById(b.id);
    release();
    expect(await slow).toBeNull();
    expect(fast?.id).toBe(b.id);
    expect(useEditor.getState().project?.id).toBe(b.id);
  });

  it('saves pending edits before going home', async () => {
    const p = await createAndOpenProject(null, opts);
    useEditor.getState().renameProject('Edited');
    storage.saveProject.mockClear();
    await goHome();
    expect(storage.saveProject).toHaveBeenCalledTimes(1);
    expect(storage.saved.get(p!.id)?.name).toBe('Edited');
    expect(useEditor.getState().project).toBeNull();
    expect(useApp.getState().route).toEqual({ name: 'home' });
  });

  it('uses the registered flusher (autosave) when there is one', async () => {
    await createAndOpenProject(null, opts);
    const flush = vi.fn(async () => undefined);
    setProjectFlusher(flush);
    storage.saveProject.mockClear();
    await flushProject();
    await goHome();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(storage.saveProject).not.toHaveBeenCalled();
  });

  it('stays in the editor when saving fails, unless discarding', async () => {
    await createAndOpenProject(null, opts);
    storage.saveProject.mockRejectedValueOnce(new Error('read-only'));
    await expect(goHome()).rejects.toThrow('read-only');
    expect(useEditor.getState().project).not.toBeNull();
    await goHome({ discard: true });
    expect(useEditor.getState().project).toBeNull();
  });

  it('flushes the open project before opening another one', async () => {
    const first = await createAndOpenProject(null, opts);
    useEditor.getState().renameProject('First edited');
    const second = blankProject('Second', ['iphone'], ['en-US']);
    await storage.saveProject(second);
    await openProjectById(second.id);
    expect(storage.saved.get(first!.id)?.name).toBe('First edited');
    expect(useEditor.getState().project?.id).toBe(second.id);
  });

  it('deletes projects, closing them first when open', async () => {
    const p = await createAndOpenProject(null, opts);
    await deleteProjectById(p!.id);
    expect(storage.deleteProject).toHaveBeenCalledWith(p!.id);
    expect(useEditor.getState().project).toBeNull();
    expect(useApp.getState().route).toEqual({ name: 'home' });
    const other = blankProject('Other', ['iphone'], ['en-US']);
    await storage.saveProject(other);
    await deleteProjectById(other.id);
    expect(storage.saved.has(other.id)).toBe(false);
  });
});

describe('saving as a template', () => {
  it('saves the design with its images and a free id', async () => {
    const p = blankProject('Shop', ['iphone'], ['en-US']);
    p.assets = { [assetId(1)]: assetInfo(1), [assetId(2)]: assetInfo(2) };
    p.slides[0].layouts.iphone!.elements.push({ id: 'logo', kind: 'image', x: 0.5, y: 0.9, rotation: 0, opacity: 1, assetId: assetId(1), width: 0.2, cornerRadius: 0, shadow: null });
    p.slides[0].shots = { iphone: { main: { 'en-US': assetId(2) } } };
    await storage.saveProject(p);
    await openProjectById(p.id);
    storage.listUserTemplates.mockResolvedValueOnce([{ id: 'aurora-2' } as Template]);
    const meta = { id: '', name: 'Aurora', author: 'Me', description: '', category: 'gradient' as const, tags: [] };
    const t = await saveProjectAsTemplate(meta, new Uint8Array([9]));
    // "aurora" is a built-in id and "aurora-2" a user template: the next free one is used.
    expect(t.id).toBe('aurora-3');
    expect(Object.keys(t.assets)).toEqual([assetId(1)]);
    const [saved, preview, files] = storage.saveUserTemplate.mock.calls[0];
    expect(saved).toBe(t);
    expect(preview).toEqual(new Uint8Array([9]));
    expect(Object.keys(files)).toEqual([assetId(1)]);
  });

  it('keeps an explicit id (updating that template) and drops unreadable images', async () => {
    const p = blankProject('Shop', ['iphone'], ['en-US']);
    p.assets = { [assetId(1)]: assetInfo(1) };
    p.slides[0].layouts.iphone!.elements.push({ id: 'logo', kind: 'image', x: 0.5, y: 0.9, rotation: 0, opacity: 1, assetId: assetId(1), width: 0.2, cornerRadius: 0, shadow: null });
    await storage.saveProject(p);
    await openProjectById(p.id);
    storage.readAsset.mockResolvedValueOnce(null);
    const t = await saveProjectAsTemplate({ id: 'my-look', name: 'Look', author: '', description: '', category: 'bold', tags: [] });
    expect(t.id).toBe('my-look');
    expect(t.assets).toEqual({});
    expect(storage.listUserTemplates).not.toHaveBeenCalled();
  });

  it('refuses without an open project', async () => {
    await expect(saveProjectAsTemplate({ id: 'x', name: 'x', author: '', description: '', category: 'bold', tags: [] })).rejects.toThrow('No project');
  });
});

describe('re-opening', () => {
  it('does not reload a project that is already open', async () => {
    const p = await createAndOpenProject(null, opts);
    useEditor.getState().renameProject('Unsaved edit');
    storage.loadProject.mockClear();
    const again = await openProjectById(p!.id);
    expect(storage.loadProject).not.toHaveBeenCalled();
    expect(again?.name).toBe('Unsaved edit');
    expect(useApp.getState().route).toEqual({ name: 'editor', projectId: p!.id });
  });
});

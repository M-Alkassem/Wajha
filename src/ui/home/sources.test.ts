import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleTemplate } from '../../model/fixtures.node';
import type { GalleryEntry } from '../../model/types';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../../platform';
import { exportTemplateArchive, listUserTemplates, saveUserTemplate } from '../../storage';
import { useApp } from '../../store';
import {
  deleteTemplateWithConfirm,
  exportTemplateFile,
  importTemplateBytes,
  importTemplateFile,
  installFromGallery,
  loadGallery,
  refreshUserTemplates,
  useGallery,
  useUserTemplates,
} from './sources';

let platform: MemoryPlatform;
const toasts = () => useApp.getState().toasts.map((t) => `${t.kind}: ${t.title}`);
const answerConfirm = (ok: boolean) => queueMicrotask(() => useApp.getState().resolveConfirm(ok));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const entry: GalleryEntry = {
  id: 'sample-glow',
  name: 'Sample Glow',
  author: 'Ada',
  description: 'A test template.',
  category: 'gradient',
  tags: [],
  version: 1,
  template: 'templates/sample-glow/template.json',
  preview: 'templates/sample-glow/preview.jpg',
  assets: [],
  bytes: 10,
};

beforeEach(() => {
  platform = createMemoryPlatform();
  setPlatform(platform);
  useUserTemplates.setState({ status: 'idle', templates: [], error: null, busy: {}, importing: false });
  useGallery.setState({ status: 'idle', result: null, installing: {} });
  useApp.getState().clearToasts();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useApp.getState().clearToasts();
  while (useApp.getState().confirmRequest) useApp.getState().resolveConfirm(false);
});

describe('my templates', () => {
  it('lists saved templates', async () => {
    await saveUserTemplate(sampleTemplate(), null, {});
    const list = await refreshUserTemplates();
    expect(list.map((t) => t.id)).toEqual(['sample-glow']);
    expect(useUserTemplates.getState().status).toBe('ready');
  });

  it('deletes only after confirmation', async () => {
    await saveUserTemplate(sampleTemplate(), null, {});
    await refreshUserTemplates();
    const t = useUserTemplates.getState().templates[0];
    answerConfirm(false);
    expect(await deleteTemplateWithConfirm(t)).toBe(false);
    expect(await listUserTemplates()).toHaveLength(1);
    answerConfirm(true);
    expect(await deleteTemplateWithConfirm(t)).toBe(true);
    expect(await listUserTemplates()).toHaveLength(0);
    expect(useUserTemplates.getState().templates).toEqual([]);
  });

  it('exports and imports .wajha-template files without overwriting', async () => {
    await saveUserTemplate(sampleTemplate(), null, {});
    await refreshUserTemplates();
    await exportTemplateFile(useUserTemplates.getState().templates[0]);
    expect(platform.testing.savedFiles[0].name).toBe('Sample Glow.wajha-template');

    const bytes = await exportTemplateArchive('sample-glow');
    const imported = await importTemplateBytes(bytes, 'Sample Glow.wajha-template');
    expect(imported?.id).toBe('sample-glow-2');
    expect(imported?.name).toBe('Sample Glow (imported)');
    expect(useUserTemplates.getState().templates.map((t) => t.id).sort()).toEqual(['sample-glow', 'sample-glow-2']);
    expect(toasts()).toContain('success: Template imported');
    expect(useUserTemplates.getState().importing).toBe(false);
  });

  it('explains a file that is not a template and ignores a cancelled picker', async () => {
    expect(await importTemplateFile()).toBeNull();
    expect(toasts()).toEqual([]);
    platform.testing.setHandlers({ openFile: () => ({ name: 'x.wajha-template', data: new Uint8Array([9, 9]) }) });
    expect(await importTemplateFile()).toBeNull();
    expect(toasts()).toContain('error: Could not import “x.wajha-template”');
  });
});

describe('community gallery', () => {
  const index = { format: 'wajha.gallery', version: 1, updatedAt: '2026-10-01', templates: [entry] };

  it('loads the index once per session and refetches on demand', async () => {
    const fetchMock = vi.fn(async () => json(index));
    vi.stubGlobal('fetch', fetchMock);
    await loadGallery();
    expect(useGallery.getState().status).toBe('ready');
    expect(useGallery.getState().result?.index.templates.map((t) => t.id)).toEqual(['sample-glow']);
    await loadGallery();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await loadGallery(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the cached index when offline, or reports an error without one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await loadGallery(true);
    expect(useGallery.getState()).toMatchObject({ status: 'error', result: null });

    vi.stubGlobal('fetch', vi.fn(async () => json(index)));
    await loadGallery(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await loadGallery(true);
    expect(useGallery.getState().status).toBe('ready');
    expect(useGallery.getState().result?.offline).toBe(true);
  });

  it('installs a template into My templates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (String(url).endsWith('template.json') ? json(sampleTemplate()) : new Response('', { status: 404 }))),
    );
    const t = await installFromGallery(entry);
    expect(t?.id).toBe('sample-glow');
    expect(useUserTemplates.getState().templates.map((x) => x.id)).toEqual(['sample-glow']);
    expect(useGallery.getState().installing).toEqual({});
  });

  it('drops the offline notice once a download shows the network is back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(index)));
    await loadGallery(true);
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', offline);
    await loadGallery(true);
    expect(useGallery.getState().result?.offline).toBe(true);

    const online = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('index.json')) return json(index);
      return u.endsWith('template.json') ? json(sampleTemplate()) : new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', online);
    expect(await installFromGallery(entry)).not.toBeNull();
    await vi.waitFor(() => expect(useGallery.getState()).toMatchObject({ status: 'ready', result: { offline: false } }));
  });

  it('does not refetch an online gallery after a download', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('index.json')) return json(index);
      return u.endsWith('template.json') ? json(sampleTemplate()) : new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await loadGallery(true);
    await installFromGallery(entry);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('index.json'))).toHaveLength(1);
  });

  it('reports a failed install and clears its progress', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await installFromGallery(entry)).toBeNull();
    expect(toasts()).toContain('error: Could not install “Sample Glow”');
    expect(useGallery.getState().installing).toEqual({});
  });
});

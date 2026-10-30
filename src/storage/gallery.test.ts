import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  GALLERY_BASE_URL: 'https://cdn.test/gh/owner/wajha@main/gallery/',
}));

vi.mock('../model/validate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../model/validate')>();
  return {
    ...actual,
    validateProject: vi.fn((json: unknown) => json),
    validateTemplate: vi.fn((json: unknown) => json),
    validateGalleryIndex: vi.fn((json: unknown) => json),
  };
});

import type { GalleryEntry, GalleryIndex, Template } from '../model/types';
import { ValidationError, validateGalleryIndex, validateTemplate } from '../model/validate';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../platform';
import {
  GALLERY_TIMEOUT_MS,
  StorageError,
  fetchGallery,
  fetchGalleryPreview,
  galleryUrl,
  installGalleryTemplate,
  listUserTemplates,
  readTemplateAsset,
  readTemplatePreview,
} from './index';
import { galleryPath } from './gallery';
import { assetIdOf, imageFill, jpeg, makeTemplate, png } from './fixtures.node';

const BASE = 'https://cdn.test/gh/owner/wajha@main/gallery';
const ASSET = png(7);
const ASSET_ID = assetIdOf(ASSET, 'png');
const MB = 1024 * 1024;

/** A template whose theme background is the image `assetId`. */
function galleryTemplate(assetId = ASSET_ID, over: Partial<Template> = {}): Template {
  const base = makeTemplate();
  return makeTemplate({
    theme: { ...base.theme, background: { fill: imageFill(assetId), pattern: null } },
    assets: { [assetId]: { id: assetId, name: 'bg.png', width: 4, height: 4, bytes: 64, addedAt: 1 } },
    ...over,
  });
}

function entry(over: Partial<GalleryEntry> = {}): GalleryEntry {
  return {
    id: 'sunset-glow',
    name: 'Sunset glow',
    author: 'Wajha',
    description: 'Warm gradient',
    category: 'gradient',
    tags: ['warm'],
    version: 1,
    template: 'templates/sunset-glow/template.json',
    preview: 'templates/sunset-glow/preview.jpg',
    assets: [`templates/sunset-glow/assets/${ASSET_ID}`],
    bytes: 4096,
    ...over,
  };
}

function index(templates: GalleryEntry[] = [entry()]): GalleryIndex {
  return { format: 'wajha.gallery', version: 1, updatedAt: '2026-10-01T00:00:00Z', templates };
}

type Route = (init?: RequestInit) => Response | Promise<Response>;

const jsonResponse = (value: unknown) => () => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const bytesResponse = (bytes: Uint8Array) => () => new Response(bytes.slice());
const status = (code: number) => () => new Response('nope', { status: code });
const networkError: Route = () => {
  throw new TypeError('Failed to fetch');
};
/** Never answers, but rejects like real fetch once its signal aborts. */
const hang: Route = (init) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });

function mockFetch(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const route = routes[String(input)];
    return route ? route(init) : new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function templateRoutes(template: Template = galleryTemplate()): Record<string, Route> {
  return {
    [`${BASE}/templates/sunset-glow/template.json`]: jsonResponse(template),
    [`${BASE}/templates/sunset-glow/preview.jpg`]: bytesResponse(jpeg(1)),
    [`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`]: bytesResponse(ASSET),
  };
}

let mem: MemoryPlatform;
beforeEach(() => {
  mem = createMemoryPlatform();
  setPlatform(mem);
  vi.mocked(validateGalleryIndex).mockImplementation((v) => v as GalleryIndex);
  vi.mocked(validateTemplate).mockImplementation((v) => v as Template);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function errorOf(p: Promise<unknown>): Promise<StorageError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StorageError) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

describe('galleryUrl', () => {
  it('joins the base URL and a relative path with one slash', () => {
    expect(galleryUrl('index.json')).toBe(`${BASE}/index.json`);
    expect(galleryUrl('/templates/a/template.json')).toBe(`${BASE}/templates/a/template.json`);
    expect(galleryUrl('///x.json')).toBe(`${BASE}/x.json`);
  });
});

describe('galleryPath', () => {
  it('accepts plain relative paths', () => {
    expect(galleryPath('templates/a/preview.jpg')).toBe('templates/a/preview.jpg');
    expect(galleryPath('/templates/a b/preview.jpg')).toBe('templates/a b/preview.jpg');
    expect(galleryPath('templates/a%20b/x.png')).toBe('templates/a%20b/x.png');
  });

  it('keeps protocol-relative paths under the gallery base', () => {
    expect(galleryUrl(galleryPath('//evil.example/x'))).toBe(`${BASE}/evil.example/x`);
  });

  it.each([
    '../../attacker/evil@main/template.json',
    'templates/../../x.json',
    'https://evil.example/template.json',
    'templates/%2e%2e/%2E%2E/x.json',
    'templates/a%2fb.json',
    'templates/x.json?download=1',
    'templates/x.json#frag',
    'templates\\x.json',
    'templates/%zz.json',
    '',
    42,
  ])('rejects %j', (rel) => {
    expect(() => galleryPath(rel)).toThrow(StorageError);
  });
});

describe('fetchGallery', () => {
  it('returns the index online and caches it', async () => {
    const fetchMock = mockFetch({ [`${BASE}/index.json`]: jsonResponse(index()) });
    const before = Date.now();
    const result = await fetchGallery();
    expect(result).toEqual({ index: index(), offline: false, fetchedAt: expect.any(Number) });
    expect(result!.fetchedAt).toBeGreaterThanOrEqual(before);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe('omit');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const cached = JSON.parse((await mem.readText('cache/gallery-index.json'))!);
    expect(cached).toEqual({ fetchedAt: result!.fetchedAt, index: index() });
  });

  it('falls back to the cache when the network fails', async () => {
    mockFetch({ [`${BASE}/index.json`]: jsonResponse(index()) });
    const online = (await fetchGallery())!;
    mockFetch({ [`${BASE}/index.json`]: networkError });
    expect(await fetchGallery()).toEqual({ index: index(), offline: true, fetchedAt: online.fetchedAt });
  });

  it('gives up after the timeout and uses the cache', async () => {
    await mem.write('cache/gallery-index.json', JSON.stringify({ fetchedAt: 42, index: index() }));
    vi.useFakeTimers();
    const fetchMock = mockFetch({ [`${BASE}/index.json`]: hang });
    let settled = false;
    const pending = fetchGallery().then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(GALLERY_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ index: index(), offline: true, fetchedAt: 42 });
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(true);
    expect(GALLERY_TIMEOUT_MS).toBe(6000);
  });

  it('settles on time even when fetch ignores the abort signal', async () => {
    vi.useFakeTimers();
    mockFetch({ [`${BASE}/index.json`]: () => new Promise<Response>(() => undefined) });
    const pending = fetchGallery();
    await vi.advanceTimersByTimeAsync(GALLERY_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });

  it('treats invalid JSON as a failure', async () => {
    mockFetch({ [`${BASE}/index.json`]: () => new Response('<html>captive portal</html>') });
    expect(await fetchGallery()).toBeNull();
    await mem.write('cache/gallery-index.json', JSON.stringify({ fetchedAt: 7, index: index() }));
    expect(await fetchGallery()).toEqual({ index: index(), offline: true, fetchedAt: 7 });
  });

  it('treats HTTP errors as a failure', async () => {
    mockFetch({ [`${BASE}/index.json`]: status(404) });
    expect(await fetchGallery()).toBeNull();
    mockFetch({ [`${BASE}/index.json`]: status(503) });
    expect(await fetchGallery()).toBeNull();
  });

  it('treats an index that fails validation as a failure', async () => {
    await mem.write('cache/gallery-index.json', JSON.stringify({ fetchedAt: 9, index: index([]) }));
    mockFetch({ [`${BASE}/index.json`]: jsonResponse({ format: 'something else' }) });
    vi.mocked(validateGalleryIndex).mockImplementationOnce(() => {
      throw new ValidationError('format', 'must be "wajha.gallery"');
    });
    expect(await fetchGallery()).toEqual({ index: index([]), offline: true, fetchedAt: 9 });
  });

  it('returns null offline without a usable cache', async () => {
    mockFetch({ [`${BASE}/index.json`]: networkError });
    expect(await fetchGallery()).toBeNull();
    await mem.write('cache/gallery-index.json', '{broken');
    expect(await fetchGallery()).toBeNull();
    await mem.write('cache/gallery-index.json', JSON.stringify({ index: index() }));
    expect(await fetchGallery()).toBeNull();
  });

  it('still answers online when the cache cannot be written', async () => {
    setPlatform({
      ...mem,
      write: async () => {
        throw new Error('read-only');
      },
    });
    mockFetch({ [`${BASE}/index.json`]: jsonResponse(index()) });
    expect((await fetchGallery())?.offline).toBe(false);
  });
});

describe('fetchGalleryPreview', () => {
  const previewUrl = `${BASE}/templates/sunset-glow/preview.jpg`;

  it('returns the preview when it is a small image', async () => {
    const preview = jpeg(1, 64, { width: 1200, height: 860 });
    const fetchMock = mockFetch({ [previewUrl]: bytesResponse(preview) });
    expect(await fetchGalleryPreview(entry())).toEqual(preview);
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('omit');
  });

  it('returns null for a preview the webview should not decode, or that cannot be had', async () => {
    mockFetch({ [previewUrl]: bytesResponse(png(1, 64, { width: 30000, height: 30000 })) });
    expect(await fetchGalleryPreview(entry())).toBeNull();
    mockFetch({ [previewUrl]: () => new Response(new Uint8Array(16), { headers: { 'content-length': String(4 * MB + 1) } }) });
    expect(await fetchGalleryPreview(entry())).toBeNull();
    mockFetch({ [previewUrl]: status(404) });
    expect(await fetchGalleryPreview(entry())).toBeNull();
    const fetchMock = mockFetch({});
    expect(await fetchGalleryPreview(entry({ preview: '' }))).toBeNull();
    expect(await fetchGalleryPreview(entry({ preview: '../../evil.jpg' }))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('installGalleryTemplate', () => {
  it('downloads, verifies and stores the template', async () => {
    const template = galleryTemplate();
    const fetchMock = mockFetch(templateRoutes(template));
    expect(await installGalleryTemplate(entry())).toEqual(template);
    expect((await listUserTemplates()).map((t) => t.id)).toEqual(['sunset-glow']);
    expect(await readTemplatePreview('sunset-glow')).toEqual(jpeg(1));
    expect(await readTemplateAsset('sunset-glow', ASSET_ID)).toEqual(ASSET);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) expect(init?.credentials).toBe('omit');
  });

  it('downloads the files in parallel', async () => {
    const routes = templateRoutes();
    let started = 0;
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated: Record<string, Route> = {};
    for (const [url, route] of Object.entries(routes)) {
      gated[url] = async (init) => {
        if (++started === 3) release();
        await barrier;
        return route(init);
      };
    }
    mockFetch(gated);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('downloads were not parallel')), 1000));
    await Promise.race([installGalleryTemplate(entry()), timeout]);
    expect(started).toBe(3);
  });

  it('rejects a template whose id differs from the entry', async () => {
    mockFetch(templateRoutes(makeTemplate({ id: 'something-else' })));
    const e = await errorOf(installGalleryTemplate(entry()));
    expect(e.code).toBe('invalid_file');
    expect(mem.testing.files().size).toBe(0);
  });

  it('rejects assets whose content does not match their name', async () => {
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`]: bytesResponse(png(8)) });
    const e = await errorOf(installGalleryTemplate(entry()));
    expect(e.code).toBe('invalid_file');
    expect(e.message).toMatch(/does not match its name/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('refuses an image whose header declares a huge canvas, before anything decodes it', async () => {
    const bomb = png(9, 64, { width: 50000, height: 50000 });
    const bombId = assetIdOf(bomb, 'png');
    mockFetch({ ...templateRoutes(galleryTemplate(bombId)), [`${BASE}/templates/sunset-glow/assets/${bombId}`]: bytesResponse(bomb) });
    const e = await errorOf(installGalleryTemplate(entry({ assets: [`templates/sunset-glow/assets/${bombId}`] })));
    expect(e.code).toBe('invalid_file');
    expect(e.message).toMatch(/larger than supported/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('installs without a preview that is not a small image', async () => {
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/preview.jpg`]: bytesResponse(png(1, 64, { width: 30000, height: 30000 })) });
    await installGalleryTemplate(entry());
    expect(await readTemplatePreview('sunset-glow')).toBeNull();
    expect(await readTemplateAsset('sunset-glow', ASSET_ID)).toEqual(ASSET);
  });

  it('stores only the listed images the template uses, and drops references to any other', async () => {
    const { validateTemplate: realValidate } = await vi.importActual<typeof import('../model/validate')>('../model/validate');
    vi.mocked(validateTemplate).mockImplementation(realValidate);
    const unlisted = assetIdOf(png(30), 'png');
    const extra = png(31);
    const extraId = assetIdOf(extra, 'png');
    // The background points at an image the entry does not list (so it is never downloaded).
    const template = galleryTemplate(unlisted);
    mockFetch({ ...templateRoutes(template), [`${BASE}/templates/sunset-glow/assets/${extraId}`]: bytesResponse(extra) });
    const installed = await installGalleryTemplate(entry({ assets: [`templates/sunset-glow/assets/${extraId}`] }));
    expect(installed.assets).toEqual({});
    expect(installed.theme.background.fill.type).not.toBe('image');
    expect(await readTemplateAsset('sunset-glow', extraId)).toBeNull();
    expect((await listUserTemplates())[0].assets).toEqual({});
  });

  it('downloads at most four images at a time', async () => {
    const images = Array.from({ length: 10 }, (_, i) => png(100 + i));
    const ids = images.map((b) => assetIdOf(b, 'png'));
    let active = 0;
    let peak = 0;
    const routes = templateRoutes(galleryTemplate(ids[0]));
    images.forEach((bytes, i) => {
      routes[`${BASE}/templates/sunset-glow/assets/${ids[i]}`] = async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return new Response(bytes.slice());
      };
    });
    mockFetch(routes);
    await installGalleryTemplate(entry({ assets: ids.map((id) => `templates/sunset-glow/assets/${id}`) }));
    expect(peak).toBe(4);
  });

  it('gives every file its own size limit within the template total', async () => {
    const declares = (bytes: number) => () => new Response(new Uint8Array(16), { headers: { 'content-length': String(bytes) } });
    // template.json over 16 MB
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/template.json`]: declares(16 * MB + 1) });
    expect((await errorOf(installGalleryTemplate(entry()))).code).toBe('too_large');
    // one image over 100 MB
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`]: declares(100 * MB + 1) });
    expect((await errorOf(installGalleryTemplate(entry()))).code).toBe('too_large');
    // two images that each fit, but not together (sent without a length, 1 MB at a time)
    const chunk = new Uint8Array(MB);
    const streamed = (total: number) => () => {
      let sent = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent >= total) controller.close();
            else controller.enqueue(chunk);
            sent += chunk.length;
          },
        }),
      );
    };
    const secondId = assetIdOf(png(8), 'png');
    mockFetch({
      ...templateRoutes(),
      [`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`]: streamed(60 * MB),
      [`${BASE}/templates/sunset-glow/assets/${secondId}`]: streamed(60 * MB),
    });
    const both = entry({ assets: [`templates/sunset-glow/assets/${ASSET_ID}`, `templates/sunset-glow/assets/${secondId}`] });
    expect((await errorOf(installGalleryTemplate(both))).code).toBe('too_large');
    // a preview over 4 MB is only skipped
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/preview.jpg`]: declares(4 * MB + 1) });
    await installGalleryTemplate(entry());
    expect(await readTemplatePreview('sunset-glow')).toBeNull();
    expect(mem.testing.files().size).toBeGreaterThan(0);
  });

  it('rejects unsafe paths and asset names before downloading', async () => {
    const fetchMock = mockFetch(templateRoutes());
    for (const bad of [
      entry({ template: '../../attacker/evil@main/template.json' }),
      entry({ preview: 'https://evil.example/p.jpg' }),
      entry({ assets: ['templates/sunset-glow/assets/%2e%2e'] }),
      entry({ assets: ['templates/sunset-glow/assets/logo.png'] }),
      entry({ id: '../escape' }),
    ]) {
      await expect(installGalleryTemplate(bad)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.testing.files().size).toBe(0);
  });

  it('fails with a network error when a file is missing', async () => {
    const routes = templateRoutes();
    delete routes[`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`];
    mockFetch(routes);
    const e = await errorOf(installGalleryTemplate(entry()));
    expect(e.code).toBe('network');
    expect(e.message).toMatch(/404/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('installs without a preview when it cannot be downloaded', async () => {
    const routes = templateRoutes();
    routes[`${BASE}/templates/sunset-glow/preview.jpg`] = status(500);
    mockFetch(routes);
    await installGalleryTemplate(entry());
    expect(await readTemplatePreview('sunset-glow')).toBeNull();
    expect(await readTemplateAsset('sunset-glow', ASSET_ID)).toEqual(ASSET);
  });

  it('rejects invalid template JSON and templates that fail validation', async () => {
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/template.json`]: () => new Response('{') });
    expect((await errorOf(installGalleryTemplate(entry()))).message).toMatch(/not valid JSON/);
    mockFetch(templateRoutes());
    vi.mocked(validateTemplate).mockImplementationOnce(() => {
      throw new ValidationError('theme.palette[0]', 'must be a colour');
    });
    expect((await errorOf(installGalleryTemplate(entry()))).message).toMatch(/theme\.palette\[0\]: must be a colour/);
    expect(mem.testing.files().size).toBe(0);
  });

  it('an update replaces the files of the installed version', async () => {
    mockFetch(templateRoutes());
    await installGalleryTemplate(entry());
    const next = png(70);
    const nextId = assetIdOf(next, 'png');
    mockFetch({
      [`${BASE}/templates/sunset-glow/template.json`]: jsonResponse(galleryTemplate(nextId, { name: 'Sunset glow 2' })),
      [`${BASE}/templates/sunset-glow/preview.jpg`]: bytesResponse(jpeg(2)),
      [`${BASE}/templates/sunset-glow/assets/${nextId}`]: bytesResponse(next),
    });
    await installGalleryTemplate(entry({ version: 2, assets: [`templates/sunset-glow/assets/${nextId}`] }));
    expect(await readTemplateAsset('sunset-glow', ASSET_ID)).toBeNull();
    expect(await readTemplateAsset('sunset-glow', nextId)).toEqual(next);
    expect(await readTemplatePreview('sunset-glow')).toEqual(jpeg(2));
    expect((await listUserTemplates())[0].name).toBe('Sunset glow 2');
  });

  it('times out a stalled download', async () => {
    vi.useFakeTimers();
    mockFetch({ ...templateRoutes(), [`${BASE}/templates/sunset-glow/assets/${ASSET_ID}`]: hang });
    const pending = errorOf(installGalleryTemplate(entry()));
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await pending).code).toBe('network');
    expect(mem.testing.files().size).toBe(0);
  });

  it('refuses downloads that are far larger than a template can be', async () => {
    mockFetch({
      ...templateRoutes(),
      [`${BASE}/templates/sunset-glow/template.json`]: () =>
        new Response(new Uint8Array(16), { headers: { 'content-length': String(1024 * 1024 * 1024) } }),
    });
    expect((await errorOf(installGalleryTemplate(entry()))).code).toBe('too_large');
  });
});

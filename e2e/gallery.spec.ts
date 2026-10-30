/**
 * Journey 12: the community gallery. Browse it in the New project dialog,
 * install a template and start a project from it. Every gallery request is
 * answered from the repository's gallery/ folder through page.route, so
 * nothing goes to the network (nor to the dev server's own /gallery/).
 * Cards show previews only from bytes the app downloaded and checked,
 * through object URLs that last as long as the cards, and a preview whose
 * header claims a huge image is never shown.
 */
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GalleryEntry, GalleryIndex, Template } from '../src/model/types.ts';
import { expect, test } from './fixtures';
import { makePng, readLibraryFile, waitForEditor } from './helpers';

const GALLERY = new URL('../gallery/', import.meta.url);

/** A PNG of a few bytes whose header claims 30 000 × 30 000 px: 3.6 GB once decoded. */
function hugeHeaderPng(): Buffer {
  const png = makePng(1, 1, [255, 255, 255]);
  png.writeUInt32BE(30_000, 16);
  png.writeUInt32BE(30_000, 20);
  return png;
}

/**
 * Answers every gallery request from local files: an index of the
 * repository's first two templates, plus one whose preview claims a huge
 * size; anything else is a 404. Returns the entries and a log of what the
 * page asked for, and how (a fetch, an image...).
 */
async function serveGallery(page: Page) {
  const index = JSON.parse(await readFile(new URL('index.json', GALLERY), 'utf8')) as GalleryIndex;
  const entries = index.templates.slice(0, 2);
  if (entries.length < 2) throw new Error('gallery/index.json lists fewer than two templates');
  const huge: GalleryEntry = { ...entries[0], id: 'huge-preview', name: 'Huge preview', template: 'templates/huge-preview/template.json', preview: 'templates/huge-preview/preview.png' };
  const requests: { path: string; type: string }[] = [];
  await page.route('**/gallery/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/gallery\//, '');
    requests.push({ path, type: route.request().resourceType() });
    if (path === 'index.json') return route.fulfill({ json: { ...index, templates: [...entries, huge] } });
    if (path === huge.preview) return route.fulfill({ contentType: 'image/png', body: hugeHeaderPng() });
    if (!entries.some((e) => path === e.template || path === e.preview)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: path.endsWith('.json') ? 'application/json' : 'image/jpeg', body: await readFile(new URL(path, GALLERY)) });
  });
  return { entries, huge, requests };
}

/** Keeps the page's live object URLs in `window.objectUrls`, from before the app's first line runs. */
function trackObjectUrls(): void {
  const live = new Set<string>();
  Object.assign(window, { objectUrls: live });
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = create(obj);
    live.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    live.delete(url);
    revoke(url);
  };
}

const liveObjectUrls = (page: Page) => page.evaluate(() => [...(window as unknown as { objectUrls: Set<string> }).objectUrls].sort());

test('browse the community gallery, then start a project from one of its templates', async ({ page }) => {
  await page.addInitScript(trackObjectUrls);
  const { entries, huge, requests } = await serveGallery(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create your first project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: 'Gallery' }).click();
  const tile = (entry: GalleryEntry, action = 'Download and use') => dialog.getByRole('button', { name: `${action} ${entry.name} by ${entry.author}`, exact: true });
  // The card around a tile's button, whose picture is decoration (hidden from assistive technology).
  const card = (entry: GalleryEntry) => tile(entry).locator('xpath=..');

  for (const entry of entries) {
    const preview = card(entry).locator('img');
    await expect(preview, `${entry.name} shows its preview from the checked bytes`).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { message: `${entry.name}'s preview is decoded` }).toBe(true);
  }
  await expect(card(huge).getByText('No preview')).toBeVisible();
  await expect(card(huge).locator('img')).toHaveCount(0);
  const shown = await dialog.locator('img').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src).sort());
  expect(await liveObjectUrls(page), 'the only object URLs are the previews on screen: none holds the huge one').toEqual(shown);
  expect(requests.filter((r) => r.type !== 'fetch'), 'the app downloads every gallery file itself, no <img> does').toEqual([]);

  // Closing the dialog lets every preview go.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => liveObjectUrls(page), { message: 'no object URL outlives its card' }).toEqual([]);

  // Install the first template and start a project with it.
  const [chosen] = entries;
  await page.getByRole('button', { name: 'Create your first project' }).click();
  await dialog.getByRole('tab', { name: 'Gallery' }).click();
  await tile(chosen).click();
  await expect(tile(chosen, 'Use'), 'installed, and picked').toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Project name' })).toHaveValue(chosen.name);
  await dialog.getByRole('button', { name: 'Create project' }).click();

  const project = await waitForEditor(page);
  const installed = JSON.parse((await readLibraryFile(page, `templates/${chosen.id}/template.json`)) ?? 'null') as Template | null;
  expect(installed?.id, 'the template is in My templates').toBe(chosen.id);
  expect(project).toMatchObject({ name: chosen.name, templateId: chosen.id });
  expect(project.theme, 'the project wears the installed design').toEqual(installed?.theme);
  expect(requests.map((r) => r.path), 'the install downloaded the template').toContain(chosen.template);
});

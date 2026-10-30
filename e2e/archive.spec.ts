/**
 * Journey 8: the project file round trip. Export a .wajha from the project's
 * card menu on the home screen, delete the project (with the confirmation),
 * then open the file with "Open file…": the project comes back with its
 * screenshot.
 */
import { createHash } from 'node:crypto';
import { expect, test } from './fixtures';
import {
  backToProjects,
  catchDownload,
  closeColor,
  downloadBytes,
  elementOnStage,
  expectToast,
  libraryKeys,
  missingShotsShown,
  openDemo,
  openProject,
  pickFiles,
  screenshot,
  stagePixel,
  unzip,
  waitForEditor,
  type Rgb,
} from './helpers';

const GREEN: Rgb = [30, 160, 90];

test('export a project file, delete the project, open the file again', async ({ page }) => {
  const { name, id } = await openDemo(page, { template: 'sunset-boulevard' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('listbox', { name: 'iPhone screenshots by language' }).getByRole('option', { name: /English/ }).click();
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Choose…' }).click(), screenshot('home.png', GREEN));
  await expectToast(page, 'Screenshot added');
  const original = await openProject(page);
  const assetId = original.slides[0].shots.iphone!.main!['en-US'];
  const missing = await missingShotsShown(page);

  await backToProjects(page);
  const card = page.getByRole('button', { name: `Open ${name}`, exact: true });
  await expect(card).toBeVisible();

  // Export from the card's menu.
  await card.hover();
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  const download = await catchDownload(page, () => page.getByRole('menuitem', { name: 'Export as file…' }).click());
  expect(download.suggestedFilename()).toBe(`${name}.wajha`);
  await expectToast(page, 'Project exported');
  const archive = await downloadBytes(download);
  const entries = unzip(archive);
  expect(Object.keys(entries)).toEqual(expect.arrayContaining(['project.json', `assets/${assetId}`]));
  const asset = entries[`assets/${assetId}`];
  expect(createHash('sha256').update(asset).digest('hex'), 'the asset is stored under its own SHA-256').toBe(assetId.split('.')[0]);
  const packed = JSON.parse(Buffer.from(entries['project.json']).toString('utf8')) as typeof original;
  expect(packed.slides[0].shots.iphone?.main?.['en-US']).toBe(assetId);

  // Delete it.
  await card.hover();
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const confirm = page.getByRole('dialog', { name: `Delete “${name}”?` });
  await expect(confirm).toContainText('This cannot be undone.');
  await confirm.getByRole('button', { name: 'Delete project' }).click();
  await expect(confirm).toBeHidden();
  await expect(card).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Make your app store page shine' }), 'an empty library shows the first-run page again').toBeVisible();
  await expect.poll(() => libraryKeys(page, `projects/${id}/`), { message: 'every file of the project is gone' }).toEqual([]);

  // Open the file again.
  await pickFiles(page, () => page.getByRole('button', { name: 'Open file…' }).click(), { name: `${name}.wajha`, mimeType: 'application/zip', buffer: archive });
  const restored = await waitForEditor(page);
  expect(restored.id, 'imported under a fresh id').not.toBe(id);
  expect(restored.name).toBe(name);
  expect(restored.slides.map((s) => s.texts)).toEqual(original.slides.map((s) => s.texts));
  expect(restored.slides[0].shots.iphone?.main?.['en-US']).toBe(assetId);
  expect(restored.assets[assetId]).toMatchObject({ name: 'home.png', width: 1206, height: 2622 });
  expect(await libraryKeys(page, `projects/${restored.id}/assets/`)).toEqual([`projects/${restored.id}/assets/${assetId}`]);
  await expect.poll(() => missingShotsShown(page)).toBe(missing);
  const device = await elementOnStage(page, 0, { kind: 'device' });
  await expect.poll(async () => closeColor(await stagePixel(page, 0, device), GREEN), { message: 'the restored screenshot is drawn' }).toBe(true);
});

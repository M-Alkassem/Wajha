/**
 * Storage stays lean: images the project no longer shows are deleted when it
 * closes ("releaseProject" prunes unused assets) or, after a session that
 * ended without closing it, when it opens again; and the .wajha file carries
 * only the images the project uses.
 */
import { expect, test } from './fixtures';
import {
  backToProjects,
  catchDownload,
  downloadBytes,
  expectToast,
  libraryKeys,
  openDemo,
  openFromHome,
  openProject,
  pickFiles,
  reloadHome,
  screenshot,
  unzip,
  waitForAutosave,
} from './helpers';

test('a replaced screenshot leaves storage and the project file', async ({ page }) => {
  const { id, name } = await openDemo(page, { template: 'sunset-boulevard' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('listbox', { name: 'iPhone screenshots by language' }).getByRole('option', { name: /English/ }).click();
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Choose…' }).click(), screenshot('first-try.png', [200, 40, 40]));
  await expectToast(page, 'Screenshot added');
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Replace…' }).click(), screenshot('final.png', [40, 200, 40]));
  await expectToast(page, 'Screenshot added');
  const project = await openProject(page);
  const kept = project.slides[0].shots.iphone!.main!['en-US'];
  expect(project.assets[kept].name).toBe('final.png');
  expect(Object.keys(project.assets)).toHaveLength(2);

  // Closing the project prunes images it no longer uses.
  await backToProjects(page);
  await expect
    .poll(() => libraryKeys(page, `projects/${id}/assets/`), { message: 'only the screenshot in use is left in IndexedDB', timeout: 8_000 })
    .toEqual([`projects/${id}/assets/${kept}`]);

  // And the project file only carries that one.
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).hover();
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  const download = await catchDownload(page, () => page.getByRole('menuitem', { name: 'Export as file…' }).click());
  const assets = Object.keys(unzip(await downloadBytes(download))).filter((path) => path.startsWith('assets/'));
  expect(assets).toEqual([`assets/${kept}`]);
});

test('images replaced in a session that ended without closing the project are deleted when it opens again', async ({ page }) => {
  const { id, name } = await openDemo(page, { template: 'sunset-boulevard' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('listbox', { name: 'iPhone screenshots by language' }).getByRole('option', { name: /English/ }).click();
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Choose…' }).click(), screenshot('first-try.png', [200, 40, 40]));
  await expectToast(page, 'Screenshot added');
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Replace…' }).click(), screenshot('final.png', [40, 200, 40]));
  await expectToast(page, 'Screenshot added');
  await waitForAutosave(page);
  const kept = (await openProject(page)).slides[0].shots.iphone!.main!['en-US'];

  // Quitting the app (here: leaving the page) never closes the project, so nothing was pruned.
  await reloadHome(page);
  expect(await libraryKeys(page, `projects/${id}/assets/`)).toHaveLength(2);

  // Opening it again prunes first: no undo step exists that could bring the first try back.
  await openFromHome(page, name);
  expect(await libraryKeys(page, `projects/${id}/assets/`)).toEqual([`projects/${id}/assets/${kept}`]);
  expect(Object.keys((await openProject(page)).assets)).toEqual([kept]);
});

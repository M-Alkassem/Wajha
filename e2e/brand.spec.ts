/**
 * Journey 14: the brand kit. Keep a brand's colours, font and logo once,
 * then apply them to a project: the colours become the theme palette, the
 * font is copied into the project and set for headlines, the logo lands on
 * every slide. The kit is still there the next time it opens.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { openDemo, openProject, pickFiles, screenshot, toast } from './helpers';

const FONT = new URL('../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2', import.meta.url);

test('build a brand kit and apply it to a project', async ({ page }) => {
  await openDemo(page, { template: 'sunset-boulevard', families: ['iphone'], langs: ['en-US'] });
  const openKit = async () => {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Brand kit…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Brand kit' });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  let dialog = await openKit();

  // Colours: take the project's, then use them as the theme palette.
  const before = await openProject(page);
  await dialog.getByRole('button', { name: "Add this project's colours" }).click();
  await expect(dialog.getByRole('img', { name: before.theme.palette[0] })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use as theme colours' }).click();
  await expect(toast(page, /Theme colours (updated|already match)/)).toBeVisible();

  // A font: added to the kit, then used for headlines.
  await pickFiles(page, () => dialog.getByRole('button', { name: 'Add font file…' }).click(), {
    name: 'Fraunces.woff2',
    mimeType: 'font/woff2',
    buffer: await readFile(FONT),
  });
  const row = dialog.getByRole('listitem').filter({ hasText: 'Fraunces.woff2' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Headlines' }).click();
  await expect(toast(page, /is now the headline font/)).toBeVisible();
  const withFont = await openProject(page);
  expect(withFont.fonts).toHaveLength(1);
  expect(withFont.theme.fonts.heading).toBe(withFont.fonts![0].family);

  // A logo on every slide.
  await pickFiles(page, () => dialog.getByRole('button', { name: 'Choose logo…' }).click(), screenshot('logo.png', [240, 110, 40], { width: 120, height: 60 }));
  await expect(dialog.getByRole('img', { name: 'Logo: logo.png' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to every slide' }).click();
  await expect(toast(page, /Logo added to \d+ slides/)).toBeVisible();
  const withLogo = await openProject(page);
  for (const slide of withLogo.slides) expect(slide.layouts.iphone?.elements.some((e) => e.kind === 'image')).toBe(true);

  // The kit is kept for next time.
  await dialog.getByRole('button', { name: 'Done' }).click();
  dialog = await openKit();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Fraunces.woff2' })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Logo: logo.png' })).toBeVisible();
});

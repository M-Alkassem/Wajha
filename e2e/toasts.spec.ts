/**
 * Toasts: the ones raised while a dialog is open (exporting or importing
 * the translations CSV, importing a template in the New project dialog,
 * export errors...) and how long toasts stay. Over a dialog a toast stays in
 * the accessibility tree, keeps clear of the footer buttons, and dismissing
 * it leaves the dialog open; a toast the pointer rests on does not time out.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { catchDownload, openDemo, pickFiles, screenshot, toast } from './helpers';

/** Opens the Translations dialog and exports the CSV, which raises a success toast over the dialog. */
async function toastOverTranslations(page: Page) {
  await openDemo(page, { template: 'sunset-boulevard' });
  await page.getByRole('button', { name: /^Preview language:/ }).click();
  await page.getByRole('menuitem', { name: 'Translations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translations' });
  await expect(dialog).toBeVisible();
  await catchDownload(page, () => dialog.getByRole('button', { name: 'Export CSV' }).click());
  await expect(toast(page, 'Translations exported', true)).toBeVisible();
  return dialog;
}

test('a toast raised over a dialog is announced to assistive technology', async ({ page }) => {
  await toastOverTranslations(page);
  await expect(toast(page, 'Translations exported'), 'the toast is in the accessibility tree').toBeVisible({ timeout: 2_000 });
});

test('dismissing a toast keeps the dialog under it open', async ({ page }) => {
  const dialog = await toastOverTranslations(page);
  await toast(page, 'Translations exported', true).getByRole('button', { name: 'Dismiss notification', includeHidden: true }).click({ timeout: 2_000 });
  await expect(toast(page, 'Translations exported', true)).toBeHidden();
  await expect(dialog, 'the Translations dialog stays open').toBeVisible({ timeout: 2_000 });
});

test("a toast does not cover the open dialog's footer buttons", async ({ page }) => {
  const dialog = await toastOverTranslations(page);
  // Where a click in the middle of Done lands, checked in one step while the toast is still up.
  const probe = await dialog.getByRole('button', { name: 'Done' }).evaluate((button) => {
    const r = button.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const toastUp = Array.from(document.querySelectorAll('[role="status"]')).some((el) => el.textContent?.includes('Translations exported'));
    return { toastUp, reachesDone: !!target && button.contains(target) };
  });
  expect(probe.toastUp, 'the toast is still up').toBe(true);
  expect(probe.reachesDone, 'a click on Done reaches Done, not the toast').toBe(true);
});

test('"Create project" still works while an error toast is up', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create your first project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: /^My templates/ }).click();
  // A file that is not a template: the import fails with an error toast (8 s).
  await pickFiles(page, () => dialog.getByRole('button', { name: 'Import template file…' }).click(), {
    name: 'broken.wajha-template',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a zip archive'),
  });
  await expect(toast(page, 'Could not import', true)).toBeVisible();
  // The preselected built-in template is still chosen: a plain click on Create project, as a person would.
  await expect(dialog).toContainText('Aurora · 5 slides');
  const box = (await dialog.getByRole('button', { name: 'Create project' }).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('region', { name: 'Slides' }), 'the project is created and opened').toBeVisible({ timeout: 5_000 });
});

test('a toast stays while the pointer rests on it', async ({ page }) => {
  // Fake timers that flow normally until fast-forwarded: no real waiting for the 4 s timeout.
  await page.clock.install();
  await openDemo(page, { template: 'sunset-boulevard' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('listbox', { name: 'iPhone screenshots by language' }).getByRole('option', { name: /English/ }).click();
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Choose…' }).click(), screenshot('home.png', [30, 160, 90]));
  const added = toast(page, 'Screenshot added');
  await expect(added).toBeVisible();
  await added.hover();
  await page.clock.fastForward(10_000);
  await expect(added, 'the hovered toast is still there').toBeVisible({ timeout: 1_000 });
});

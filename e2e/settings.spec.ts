/**
 * Journey 11: settings. On a system in dark mode, switch the app to the
 * light theme; the choice is saved and survives a reload.
 */
import { expect, test } from './fixtures';
import { readLibraryFile } from './helpers';

test.use({ colorScheme: 'dark' });

test('the light theme persists after a reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html, 'the default theme follows the system (dark here)').toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const themes = dialog.getByRole('radiogroup', { name: 'Theme' });
  await expect(themes.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await themes.getByRole('radio', { name: 'Light' }).click();
  await expect(themes.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // Saved in the library, not just applied.
  await expect.poll(async () => JSON.parse((await readLibraryFile(page, 'settings.json')) ?? '{}').theme).toBe('light');
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make your app store page shine' })).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(lightBackground);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(dialog.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
});

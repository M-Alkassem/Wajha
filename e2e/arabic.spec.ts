/**
 * Journey 15: the Arabic interface. Switching the language in Settings
 * reloads the window right to left with Arabic text everywhere, the slide
 * canvas keeps reading left to right, and switching back restores English.
 */
import { expect, test } from './fixtures';

test('switch the interface to Arabic and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('radio', { name: 'العربية' }).click();

  // The window reloads in Arabic, mirrored.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('button', { name: 'الإعدادات' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('اجعل صفحة تطبيقك في المتجر');

  // The editor is in Arabic too; the canvas stays left to right.
  await page.goto('/?demo=aurora&families=iphone&langs=ar-SA,en-US');
  await expect(page.getByRole('region', { name: 'الشرائح' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'تصدير' }).first()).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'الخصائص' })).toBeVisible();
  const canvasLtr = await page.evaluate(() => document.querySelector('[dir="ltr"].bg-stage')?.contains(document.querySelector('[data-slide-box]')) ?? false);
  expect(canvasLtr, 'the slides sit in a left-to-right canvas').toBe(true);

  // Back to English.
  await page.goto('/');
  await page.getByRole('button', { name: 'الإعدادات' }).click();
  await page.getByRole('dialog', { name: 'الإعدادات' }).getByRole('radio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

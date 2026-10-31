/**
 * Journey 1: a first-time user creates a project from a template with the
 * New project dialog: template, name, devices (iPhone + Android phone),
 * Arabic as a second language, then lands in the editor on the template's
 * slides.
 */
import { expect, test } from './fixtures';
import { builtinTemplate, headlines, openProject, waitForEditor } from './helpers';

test('first run: create a project from a template with iPhone, Android phone and Arabic', async ({ page }) => {
  await page.goto('/');

  // The first-run hero, not an empty project grid.
  await expect(page.getByRole('heading', { name: 'Make your app store page shine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start from a template' })).toBeVisible();

  await page.getByRole('button', { name: 'Create your first project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog).toBeVisible();

  // Pick a template other than the preselected first one.
  const template = await builtinTemplate(page, 'sunset-boulevard', ['en-US', 'ar-SA']);
  const english = template.headlines['en-US'];
  const tile = dialog.getByRole('button', { name: /^Sunset Boulevard, Gradient template/ });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /^Aurora, Gradient template/ })).toHaveAttribute('aria-pressed', 'false');

  const name = dialog.getByRole('textbox', { name: 'Project name' });
  await expect(name, 'the name follows the picked template until typed').toHaveValue('Sunset Boulevard');
  await name.fill('Road Trip Planner');

  // Devices: exactly iPhone and Android phone.
  const devices = dialog.getByRole('group', { name: 'Devices' });
  for (const [label, wanted] of [
    ['iPhone', true],
    ['iPad', false],
    ['Mac', false],
    ['Android phone', true],
    ['Android tablet', false],
    ['Feature graphic', false],
  ] as const) {
    const toggle = devices.getByRole('button', { name: label, exact: true });
    if ((await toggle.getAttribute('aria-pressed')) !== String(wanted)) await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', String(wanted));
  }
  await expect(devices).toContainText('2 selected');

  // Languages: add Arabic through the searchable picker.
  const languages = dialog.getByRole('group', { name: 'Languages' });
  await languages.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('combobox', { name: 'Search languages' }).fill('arab');
  const arabic = page.getByRole('listbox', { name: 'Languages' }).getByRole('option', { name: /Arabic/ });
  await expect(arabic).toHaveAttribute('aria-selected', 'false');
  await arabic.click();
  await expect(arabic).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Search languages' })).toBeHidden();
  await expect(dialog, 'Escape closes only the language picker').toBeVisible();
  await expect(languages.getByRole('listitem')).toHaveCount(2);
  await expect(languages.getByRole('listitem').nth(0)).toContainText('English (US)');
  await expect(languages.getByRole('listitem').nth(0)).toContainText('Base');
  await expect(languages.getByRole('listitem').nth(1)).toContainText('العربية');
  await expect(languages.getByRole('listitem').nth(1)).toContainText('RTL');

  await expect(dialog).toContainText('Sunset Boulevard · 5 slides · iPhone and Android phone · 2 languages');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  // The editor, on the template's slides.
  await waitForEditor(page);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Project name: Road Trip Planner/ })).toBeVisible();
  const family = page.getByRole('radiogroup', { name: 'Device family' });
  await expect(family.getByRole('radio')).toHaveCount(2);
  await expect(family.getByRole('radio', { name: 'iPhone', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(family.getByRole('radio', { name: 'Android phone' })).toBeVisible();

  const project = await openProject(page);
  expect(project.name).toBe('Road Trip Planner');
  expect(project.templateId).toBe('sunset-boulevard');
  expect(project.families).toEqual(['iphone', 'android-phone']);
  expect(project.languages).toEqual(['en-US', 'ar-SA']);
  // Every language starts with the template's sample copy in that language.
  expect(headlines(project, 'en-US')).toEqual(english);
  expect(headlines(project, 'ar-SA')).toEqual(template.headlines['ar-SA']);
  expect(headlines(project, 'ar-SA')).not.toEqual(english);

  const slides = page.getByRole('listbox', { name: 'Slides' }).getByRole('option');
  await expect(slides).toHaveCount(english.length);
  for (const [i, headline] of english.entries()) {
    await expect(slides.nth(i)).toHaveAccessibleName(new RegExp(`^Slide ${i + 1}: ${escapeRegExp(headline.replace(/\*/g, ''))}`));
  }
  await expect(page.getByRole('region', { name: 'Slides' }).getByRole('group')).toHaveCount(english.length);
  await expect(page.getByRole('contentinfo')).toContainText('iPhone');
  await expect(page.getByRole('contentinfo')).toContainText('1320 × 2868');
  await expect(page.getByRole('contentinfo')).toContainText(`${english.length} slides`);
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

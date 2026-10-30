/**
 * Journey 9: save the open project's design as a template, find it under
 * My templates in the New project dialog, and create a project from it.
 */
import { expect, test } from './fixtures';
import { backToProjects, clickOnStage, expectToast, headlines, libraryKeys, openDemo, openProject, waitForAutosave, waitForEditor } from './helpers';

const HEADLINE = 'My *own* design';

test('save as template, then start a new project from it', async ({ page }) => {
  await openDemo(page, { template: 'sunset-boulevard' });

  // Make the design recognisable: a new headline on slide 1.
  await clickOnStage(page, 0, { kind: 'text', key: 'headline' });
  await page.getByRole('textbox', { name: 'Text in English (US)' }).fill(HEADLINE);
  const source = await openProject(page);
  expect(source.slides[0].texts['en-US'].headline).toBe(HEADLINE);

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as template' });
  await expect(dialog).toBeVisible();
  const nameField = dialog.getByRole('textbox', { name: 'Name' });
  await expect(nameField).toBeFocused();
  await nameField.fill('E2E Sunset');
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Saved by the end-to-end suite.');
  await dialog.getByRole('button', { name: 'Save template' }).click();
  await expect(dialog).toBeHidden();
  await expectToast(page, 'Template saved');
  expect(await libraryKeys(page, 'templates/')).toEqual(expect.arrayContaining(['templates/e2e-sunset/template.json']));

  await waitForAutosave(page);
  await backToProjects(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const newProject = page.getByRole('dialog', { name: 'New project' });
  await newProject.getByRole('tab', { name: 'My templates, 1 template' }).click();
  await expect(newProject.getByRole('heading', { name: /^My templates/ })).toBeVisible();
  const tile = newProject.getByRole('button', { name: /^E2E Sunset, .* template by You$/ });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(newProject.getByRole('textbox', { name: 'Project name' })).toHaveValue('E2E Sunset');
  await newProject.getByRole('button', { name: 'Create project' }).click();

  const created = await waitForEditor(page);
  expect(created.id).not.toBe(source.id);
  expect(created.name).toBe('E2E Sunset');
  expect(created.templateId).toBe('e2e-sunset');
  expect(headlines(created, 'en-US')).toEqual(headlines(source, 'en-US'));
  expect(created.theme).toEqual(source.theme);
  expect(created.slides.length).toBe(source.slides.length);
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first()).toHaveAccessibleName(/^Slide 1: My own design/);
});

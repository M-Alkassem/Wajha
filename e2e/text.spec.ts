/**
 * Journey 3: editing a headline. Select it on the canvas, type in the
 * inspector, highlight a word (*markup*), switch the preview to Arabic and
 * write the Arabic headline, then reload the app, reopen the project from the
 * home screen and find both texts saved (IndexedDB).
 */
import { expect, test } from './fixtures';
import { clickOnStage, editorState, openDemo, openFromHome, openProject, reloadHome, savedProject, waitForAutosave } from './helpers';

const ENGLISH = 'Plan *smarter* trips';
const ARABIC = 'خطط *رحلتك* بذكاء';

test('edit a headline in English and Arabic; both persist across a reload', async ({ page }) => {
  const { name } = await openDemo(page, { template: 'sunset-boulevard' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  // Select the headline of slide 1 on the canvas.
  const headlineId = await clickOnStage(page, 0, { kind: 'text', key: 'headline' });
  const english = inspector.getByRole('textbox', { name: 'Text in English (US)' });
  await expect(english).toHaveValue('Plan the *perfect* road trip');

  // Type a new headline, then highlight one word with the inspector's button.
  await english.click();
  // Select all is the browser's own text editing key: Control on Linux and Windows.
  await page.keyboard.press('ControlOrMeta+A');
  await english.pressSequentially('Plan smarter trips');
  await page.keyboard.press('End');
  for (let i = 0; i < ' trips'.length; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 'smarter'.length; i++) await page.keyboard.press('Shift+ArrowLeft');
  await inspector.getByRole('button', { name: 'Highlight selected words' }).click();
  await expect(english).toHaveValue(ENGLISH);
  // The word itself stays selected (inside the asterisks), ready to type over.
  await expect(english).toHaveJSProperty('selectionStart', 'Plan *'.length);
  await expect(english).toHaveJSProperty('selectionEnd', 'Plan *smarter'.length);
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first()).toHaveAccessibleName(/^Slide 1: Plan smarter trips/);

  // Arabic preview: the same element, its Arabic text, right-to-left.
  await page.getByRole('button', { name: /^Preview language:/ }).click();
  await page.getByRole('menuitemradio', { name: /Arabic/ }).click();
  const arabic = inspector.getByRole('textbox', { name: 'Text in Arabic' });
  await expect(arabic).toBeVisible();
  await expect(arabic).toHaveAttribute('dir', 'rtl');
  expect((await editorState(page))?.selection, 'the headline stays selected').toBe(headlineId);
  await arabic.fill(ARABIC);
  await expect(arabic).toHaveValue(ARABIC);

  let project = await openProject(page);
  expect(project.slides[0].texts['en-US'].headline).toBe(ENGLISH);
  expect(project.slides[0].texts['ar-SA'].headline).toBe(ARABIC);

  // Autosave writes both to IndexedDB on its own (no explicit save, no leaving the editor).
  await waitForAutosave(page);
  const saved = await savedProject(page, project.id);
  expect(saved?.slides[0].texts['en-US'].headline).toBe(ENGLISH);
  expect(saved?.slides[0].texts['ar-SA'].headline).toBe(ARABIC);

  // Reload, reopen from the home screen.
  await reloadHome(page);
  project = await openFromHome(page, name);
  expect(project.slides[0].texts['en-US'].headline).toBe(ENGLISH);
  expect(project.slides[0].texts['ar-SA'].headline).toBe(ARABIC);

  await clickOnStage(page, 0, { kind: 'text', key: 'headline' });
  await expect(inspector.getByRole('textbox', { name: 'Text in English (US)' })).toHaveValue(ENGLISH);
  await page.getByRole('button', { name: /^Preview language:/ }).click();
  await page.getByRole('menuitemradio', { name: /Arabic/ }).click();
  await expect(inspector.getByRole('textbox', { name: 'Text in Arabic' })).toHaveValue(ARABIC);
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first()).toHaveAccessibleName(/^Slide 1: خطط رحلتك بذكاء/);
});

/**
 * Keyboard focus around the kit's overlays: a dialog hands focus back to the
 * control that opened it (a button clicked with the mouse, which WebKit does
 * not focus; the button of the menu it was picked from; through the dialog
 * it was opened from), a visible tooltip never swallows Escape, a
 * destructive confirm starts on Cancel however it was opened, and a mouse
 * click leaves no focus ring behind (WebKit counts focus that radix moves
 * after a click as :focus-visible).
 */
import { expect, test } from './fixtures';
import { backToProjects, openDemo } from './helpers';

test('closing a dialog opened from the keyboard puts focus back on its button', async ({ page }) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings' });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(settings, 'focus is back on the Settings button, not lost to the page').toBeFocused();
});

test('closing a dialog opened with a mouse click puts focus back on the clicked button', async ({ page }) => {
  await openDemo(page);
  // WebKit does not focus a button it clicks: the dialog has to remember the click.
  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  await exportButton.click();
  const dialog = page.getByRole('dialog', { name: 'Export screenshots' });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(exportButton, 'focus is on Export, not lost to the page').toBeFocused();
});

test('closing a dialog picked from a menu puts focus back on the menu button', async ({ page }) => {
  await openDemo(page);
  const more = page.getByRole('button', { name: 'More', exact: true });
  await more.click();
  // The item that opened the dialog goes away with its menu.
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(more, 'focus is on "More", where the menu was').toBeFocused();
});

test('a dialog opened from another one hands focus back through it', async ({ page }) => {
  await openDemo(page);
  const opener = page.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Translations…' });
  await opener.click();
  const translations = page.getByRole('dialog', { name: 'Translations' });
  await translations.getByRole('button', { name: 'Manage languages' }).click();
  const languages = page.getByRole('dialog', { name: 'Languages' });
  await expect(translations, 'Languages takes the place of Translations').toBeHidden();
  await languages.getByRole('button', { name: 'Done' }).click();
  await expect(translations, 'Done goes back to Translations').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(opener, 'focus is on the button that opened Translations').toBeFocused();
});

test('Escape closes a dialog even while a tooltip in it is showing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: 'Close' }).hover();
  await expect(page.getByRole('tooltip', { name: /Close/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog, 'one Escape closes the dialog').toBeHidden();
});

test('a delete confirm starts on Cancel and gives focus back, from Backspace or from a menu', async ({ page }) => {
  const project = await openDemo(page);
  await backToProjects(page);
  const card = page.getByRole('button', { name: `Open ${project.name}`, exact: true });
  const confirm = page.getByRole('dialog', { name: /^Delete/ });
  const cancel = confirm.getByRole('button', { name: 'Cancel' });

  // Backspace on a card: Enter right after must not delete the project.
  await card.focus();
  await page.keyboard.press('Backspace');
  await expect(cancel, 'the safe choice is the default').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirm).toBeHidden();
  await expect(card, 'still there, and focused again').toBeFocused();

  // The card's "..." menu: the item that opened the confirm is gone by the time it closes.
  const actions = page.getByRole('button', { name: `Actions for ${project.name}` });
  await actions.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: /^Delete/ }).click();
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(actions, 'focus returns to the menu button, not to the page').toBeFocused();
});

test('a mouse click leaves no focus ring; the keyboard brings it back', async ({ page }) => {
  await openDemo(page);
  const layers = page.getByRole('tab', { name: /^Layers/ });
  await layers.click();
  await expect(layers).toBeFocused();
  await expect(layers, 'no ring after a click').toHaveCSS('outline-style', 'none');
  await page.keyboard.press('ArrowLeft');
  const slides = page.getByRole('tab', { name: /^Slides/ });
  await expect(slides).toBeFocused();
  await expect(slides, 'a ring for keyboard focus').toHaveCSS('outline-style', 'solid');
});

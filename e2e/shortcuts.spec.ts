/**
 * The Keyboard shortcuts dialog finds shortcuts by the keys people type, as
 * well as by name: "cmd z" (or "ctrl z" off a Mac) lists what presses both
 * keys, "esc" and "space" the shortcuts on those keys, the stage's Space
 * pan included.
 */
import { expect, test } from './fixtures';
import { modKey, openDemo } from './helpers';

test('search the shortcuts by the keys people type', async ({ page }) => {
  await openDemo(page);
  // The app names the command key after the user agent, a Mac's in this suite (see modKey).
  const command = (await modKey(page)) === 'Meta' ? 'cmd' : 'ctrl';
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  const search = dialog.getByRole('searchbox', { name: 'Search shortcuts' });
  await expect(search).toBeFocused();
  const found = dialog.getByRole('listitem');

  await search.fill(`${command} z`);
  await expect(found, `"${command} z" finds the shortcuts that press both keys`).toHaveText([/^Undo/, /^Redo/]);
  await search.fill('esc');
  await expect(found).toHaveText([/deselect/]);
  await search.fill('space');
  await expect(found).toHaveText([/^Pan the stage/]);
});

/**
 * Journey 5: managing slides from the slides list: add, duplicate, reorder
 * with the keyboard (Mod+arrow keys) and delete with the confirmation. The
 * list keeps no hold on Space: right after a click on a row, Space and a
 * drag over the stage still pan it.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { editorState, elementOnStage, headlines, modKey, openDemo, openProject, stage } from './helpers';

const ids = async (page: Page) => (await openProject(page)).slides.map((s) => s.id);

test('add, duplicate, reorder and delete slides', async ({ page }) => {
  const start = await openDemo(page, { template: 'sunset-boulevard' });
  const original = headlines(start, 'en-US');
  const sidebar = page.getByRole('complementary', { name: 'Slides and layers' });
  const list = sidebar.getByRole('listbox', { name: 'Slides' });
  const rows = list.getByRole('option');
  await expect(rows).toHaveCount(5);

  // Add: a new slide right after the active one (slide 1), with its design and no copy.
  await sidebar.getByRole('button', { name: 'Add slide', exact: true }).click();
  await expect(rows).toHaveCount(6);
  await expect(sidebar.getByRole('tab', { name: /^Slides/ })).toHaveAccessibleName('Slides 6');
  await expect(stage(page).getByRole('group', { name: 'Slide 6 of 6' })).toBeVisible();
  let project = await openProject(page);
  const added = project.slides[1];
  expect(added.id).not.toBe(start.slides[1].id);
  expect(added.texts['en-US']?.headline ?? '').toBe('');
  expect(Object.keys(added.layouts), 'the new slide copies the design of slide 1').toEqual(Object.keys(start.slides[0].layouts));
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1)).toHaveAccessibleName(/^Slide 2(, no screenshot)?$/);

  // Duplicate slide 3 ("Travel with friends") with its hover button.
  await rows.nth(2).hover();
  await rows.nth(2).getByRole('button', { name: 'Duplicate slide' }).click();
  await expect(rows).toHaveCount(7);
  project = await openProject(page);
  expect(headlines(project, 'en-US')).toEqual([original[0], '', original[1], original[1], original[2], original[3], original[4]]);
  expect(project.slides[3].id).not.toBe(project.slides[2].id);
  expect(project.slides[3].texts).toEqual(project.slides[2].texts);
  await expect(rows.nth(3)).toHaveAttribute('aria-selected', 'true');

  // Reorder with the keyboard: Space never picks a slide up (it is the stage's pan key);
  // Mod+ArrowDown moves the focused slide one place per press, twice here.
  // Each step waits for the list's screen reader announcement, as a listener would.
  const before = await ids(page);
  const announcer = sidebar.locator('[aria-live="polite"]');
  const mod = await modKey(page);
  await rows.nth(0).click();
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press(`${mod}+ArrowDown`);
  await expect(announcer).toHaveText('Slide moved to position 2 of 7.');
  await page.keyboard.press(`${mod}+ArrowDown`);
  await expect(announcer).toHaveText('Slide moved to position 3 of 7.');
  await expect.poll(() => ids(page), { message: 'slide 1 moved to position 3' }).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
  await expect(rows.nth(2), 'focus stays on the moved slide').toBeFocused();
  await expect(rows.nth(2)).toHaveAccessibleName(new RegExp(`^Slide 3: ${original[0].replace(/\*/g, '')}`));
  await expect(stage(page).getByRole('group', { name: 'Slide 3 of 7' })).toBeVisible();

  // Delete slide 4 (a copy of "Travel with friends"): cancel first, then confirm.
  const doomedSlide = (await openProject(page)).slides[3];
  const doomed = doomedSlide.id;
  expect(doomedSlide.texts['en-US'].headline).toBe(original[1]);
  await rows.nth(3).hover();
  await rows.nth(3).getByRole('button', { name: 'Delete slide' }).click();
  let confirm = page.getByRole('dialog', { name: 'Delete slide 4?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('You can undo this.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows).toHaveCount(7);

  await rows.nth(3).hover();
  await rows.nth(3).getByRole('button', { name: 'Delete slide' }).click();
  confirm = page.getByRole('dialog', { name: 'Delete slide 4?' });
  await confirm.getByRole('button', { name: 'Delete slide' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows).toHaveCount(6);
  expect(await ids(page)).not.toContain(doomed);
  await expect(stage(page).getByRole('group')).toHaveCount(6);
  await expect(page.getByRole('contentinfo')).toContainText('6 slides');

  // "You can undo this": the slide comes back, in its place, with its texts.
  const kept = await openProject(page);
  await page.keyboard.press(`${await modKey(page)}+Z`);
  await expect(rows).toHaveCount(7);
  const restored = await openProject(page);
  expect(restored.slides[3].id).toBe(doomed);
  expect(restored.slides[3].texts).toEqual(doomedSlide.texts);
  expect(restored.slides.filter((s) => s.id !== doomed).map((s) => s.id)).toEqual(kept.slides.map((s) => s.id));
});

test('Space and a drag pan the stage, also right after a click on a slide row', async ({ page }) => {
  await openDemo(page);
  const row = page.getByRole('listbox', { name: 'Slides' }).getByRole('option').first();
  await row.click();
  await expect(row, 'the clicked row has focus, so it sees the Space key first').toBeFocused();
  const before = await editorState(page);
  const viewport = stage(page);
  const scrolled = () => viewport.evaluate((el) => el.scrollLeft);
  const left = await scrolled();

  // Space held with the pointer on the phone of slide 1, then a drag 150 px to the left.
  const device = await elementOnStage(page, 0, { kind: 'device' });
  await page.mouse.move(device.x, device.y);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(device.x - 150, device.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');

  await expect.poll(scrolled, { message: 'the slides follow the pointer' }).toBeCloseTo(left + 150, 0);
  expect(await editorState(page), 'the phone did not move and the selection is the same').toEqual(before);
  await expect(row).toHaveAttribute('aria-selected', 'true');
});

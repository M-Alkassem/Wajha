/**
 * Journey 4: undo and redo with the keyboard across a canvas drag and a text
 * edit. A whole drag is one undo step, and so is a burst of typing.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickOnStage, editorState, elementOnStage, modKey, openDemo, stage } from './helpers';

/** The device of slide 1 (its position) and the slide's English headline. */
async function slide1(page: Page) {
  const state = await editorState(page);
  const slide = state!.project.slides[0];
  const device = slide.layouts.iphone?.elements.find((e) => e.kind === 'device');
  return { x: device?.x ?? NaN, y: device?.y ?? NaN, headline: slide.texts['en-US'].headline, canUndo: state!.canUndo, canRedo: state!.canRedo };
}

test('undo and redo a canvas drag and a text edit with Cmd+Z and Cmd+Shift+Z', async ({ page }) => {
  await openDemo(page, { template: 'sunset-boulevard' });
  const mod = await modKey(page);
  const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
  const redoButton = page.getByRole('button', { name: 'Redo', exact: true });

  const before = await slide1(page);
  expect(Number.isFinite(before.x), 'slide 1 has an iPhone layout with a device').toBe(true);
  await expect(undoButton).toBeDisabled();

  // Drag the device of slide 1 by 60 × 40 px in many small moves: one gesture.
  const device = await elementOnStage(page, 0, { kind: 'device' });
  await page.mouse.move(device.x, device.y);
  await page.mouse.down();
  await page.mouse.move(device.x + 60, device.y + 40, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await slide1(page)).x).not.toBe(before.x);
  const moved = await slide1(page);
  expect(moved.y).not.toBe(before.y);
  const box = await page.getByRole('group', { name: 'Slide 1 of 5' }).locator('[data-slide-box]').boundingBox();
  expect(Math.round((moved.x - before.x) * box!.width), 'the device follows the pointer horizontally').toBeGreaterThan(40);
  await expect(undoButton).toBeEnabled();

  // A burst of typing in the headline: one more step.
  await clickOnStage(page, 0, { kind: 'text', key: 'headline' });
  const field = page.getByRole('textbox', { name: 'Text in English (US)' });
  await field.click();
  // Select all is the browser's own text editing key: Control on Linux and Windows.
  await page.keyboard.press('ControlOrMeta+A');
  await field.pressSequentially('Typed in one go');
  await expect.poll(async () => (await slide1(page)).headline).toBe('Typed in one go');

  // Leave the text field (inside it, Cmd+Z is the field's own undo): click the empty stage.
  const area = (await stage(page).boundingBox())!;
  await page.mouse.click(area.x + 12, area.y + area.height - 10);
  await expect(field).toBeHidden();

  await page.keyboard.press(`${mod}+Z`);
  await expect.poll(async () => (await slide1(page)).headline, { message: 'one undo reverts the whole typing burst' }).toBe(before.headline);
  expect(await slide1(page)).toMatchObject({ x: moved.x, y: moved.y });

  await page.keyboard.press(`${mod}+Z`);
  await expect.poll(async () => (await slide1(page)).x, { message: 'one undo reverts the whole drag' }).toBe(before.x);
  expect(await slide1(page)).toMatchObject({ x: before.x, y: before.y, headline: before.headline, canUndo: false, canRedo: true });
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeEnabled();

  await page.keyboard.press(`${mod}+Shift+Z`);
  await expect.poll(async () => (await slide1(page)).x, { message: 'redo re-applies the drag' }).toBe(moved.x);
  expect((await slide1(page)).headline).toBe(before.headline);

  await page.keyboard.press(`${mod}+Shift+Z`);
  await expect.poll(async () => (await slide1(page)).headline, { message: 'redo re-applies the typing' }).toBe('Typed in one go');
  expect(await slide1(page)).toMatchObject({ x: moved.x, y: moved.y, canUndo: true, canRedo: false });
  await expect(redoButton).toBeDisabled();
});

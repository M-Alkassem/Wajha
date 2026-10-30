/**
 * Pressing and dragging in the inspector: a control at the panel's edge
 * takes its presses even with the scrollbar thumb right beside it (the
 * 10 px scrollbar track takes clicks, nothing reaches past it), and Escape
 * during a scrub puts the value back, with no edit and no undo step left.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickOnStage, editorState, openDemo, openProject } from './helpers';

/** The inspector's scroll viewport and its vertical scrollbar thumb (radix ScrollArea parts, which have no role). */
function inspectorScroll(page: Page) {
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const viewport = inspector.locator('[data-radix-scroll-area-viewport]');
  return { viewport, thumb: inspector.locator('[data-radix-scroll-area-viewport] ~ [data-orientation="vertical"] > *') };
}

/** The point 2 px inside a control's right edge, halfway down, once the scrollbar thumb is beside it. */
async function rightEdgeBesideThumb(page: Page, control: Locator): Promise<{ x: number; y: number }> {
  const { thumb } = inspectorScroll(page);
  let at = { x: 0, y: 0 };
  await expect
    .poll(
      async () => {
        const box = (await control.boundingBox())!;
        const bar = await thumb.boundingBox();
        at = { x: box.x + box.width - 2, y: box.y + box.height / 2 };
        return !!bar && bar.y < at.y && at.y < bar.y + bar.height;
      },
      { message: 'the scrollbar thumb is beside the control' },
    )
    .toBe(true);
  return at;
}

test('controls at the edge of the inspector take presses next to its scrollbar', async ({ page }) => {
  await openDemo(page);
  const id = await clickOnStage(page, 0, { kind: 'device' });
  /** The selected phone, as the store has it. */
  const device = async () => {
    const el = (await openProject(page)).slides[0].layouts.iphone?.elements.find((e) => e.id === id);
    if (el?.kind !== 'device') throw new Error(`slide 1 has no device ${id}`);
    return el;
  };
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const { viewport } = inspectorScroll(page);
  const scrollTop = () => viewport.evaluate((el) => el.scrollTop);

  // Scroll to the end with the wheel: the thumb then sits beside the rotation dial and the Shadow
  // switch, and the scrollbar shows while the pointer stays over the panel.
  const panel = (await viewport.boundingBox())!;
  await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
  await page.mouse.wheel(0, 2_000);
  await expect.poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(1);
  const scrolled = await scrollTop();

  // A press 2 px inside the dial's right edge and a short drag up turn the device.
  const dial = inspector.getByRole('slider', { name: 'Rotation dial' });
  const rotation = (await device()).rotation;
  const onDial = await rightEdgeBesideThumb(page, dial);
  await page.mouse.move(onDial.x, onDial.y);
  await page.mouse.down();
  await page.mouse.move(onDial.x - 4, onDial.y - 14, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await device()).rotation, { message: 'the dial turned the device' }).not.toBe(rotation);
  expect(await scrollTop(), 'the drag did not scroll the inspector').toBe(scrolled);

  // A click 2 px inside the Shadow switch's right edge toggles it.
  const shadow = inspector.getByRole('switch', { name: 'Shadow' });
  await expect(shadow).toBeChecked();
  const onSwitch = await rightEdgeBesideThumb(page, shadow);
  await page.mouse.click(onSwitch.x, onSwitch.y);
  await expect(shadow).not.toBeChecked();
  expect((await device()).shadow, 'the device has no shadow any more').toBeNull();
});

test('Escape during a scrub puts the value back and leaves no edit or undo step', async ({ page }) => {
  await openDemo(page);
  // Nothing selected: the inspector shows the theme, whose background is a mesh of colour points.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const field = inspector.getByRole('spinbutton', { name: 'Point 1 X' });
  const value = await field.inputValue();
  const before = (await editorState(page))!;
  expect(before.canUndo, 'a fresh project has nothing to undo').toBe(false);

  // Drag the field's "X" label to the right (scrubbing), then press Escape before letting go.
  const handle = inspector.getByRole('list', { name: 'Mesh points' }).getByRole('listitem').first().getByText('X', { exact: true });
  const box = (await handle.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, y, { steps: 8 });
  await expect(field, 'the scrub changes the value as it goes').not.toHaveValue(value);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(field).toHaveValue(value);
  const after = (await editorState(page))!;
  expect(after.project.theme).toEqual(before.project.theme);
  expect(after.project.updatedAt, 'not even the edit time moved').toBe(before.project.updatedAt);
  expect(after.canUndo, 'no undo step').toBe(false);
});

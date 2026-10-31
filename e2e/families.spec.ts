/**
 * Journey 10: device families. Turn on iPad in "Devices & stores": its tab
 * shows the slides adapted to the iPad canvas (iPad frames). Add an iPad
 * screenshot, then turn iPad off again, which asks first because the
 * screenshot would no longer be exported.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dropFiles, elementOnStage, expectToast, openDemo, openProject, screenshot, stage, type Rgb } from './helpers';

const VIOLET: Rgb = [120, 70, 200];

/** Device frames the stage painted on slide `index` (what the active family's layout resolved to). */
async function paintedFrames(page: Page, index: number): Promise<string[]> {
  return page.evaluate(async (index) => {
    const storeUrl = '/src/store/index.ts';
    const stageUrl = '/src/ui/editor/stage/stageStore.ts';
    const { useEditor } = (await import(/* @vite-ignore */ storeUrl)) as typeof import('../src/store/index.ts');
    const { getSnapshot } = (await import(/* @vite-ignore */ stageUrl)) as typeof import('../src/ui/editor/stage/stageStore.ts');
    const slide = useEditor.getState().project!.slides[index];
    const snap = getSnapshot(slide.id);
    return snap ? snap.layout.elements.flatMap((e) => (e.kind === 'device' ? [e.frame] : [])) : [];
  }, index);
}

test('turn iPad on, see the adapted slides, turn it off again', async ({ page }) => {
  await openDemo(page, { template: 'sunset-boulevard' });
  const switcher = page.getByRole('radiogroup', { name: 'Device family' });
  await expect(switcher.getByRole('radio')).toHaveCount(2);

  await page.getByRole('button', { name: 'Device families' }).click();
  const dialog = page.getByRole('dialog', { name: 'Devices & stores' });
  const ipadSwitch = dialog.getByRole('switch', { name: 'iPad', exact: true });
  await expect(ipadSwitch).toHaveAttribute('aria-checked', 'false');
  await ipadSwitch.click();
  await expect(ipadSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(dialog).toContainText('Adapts from iPhone until you change its layouts');
  // A family turned on later joins at the end, after the primary one.
  await expect(dialog).toContainText('3 devices: iPhone, Android phone and iPad');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  expect((await openProject(page)).families).toEqual(['iphone', 'android-phone', 'ipad']);
  const ipadTab = switcher.getByRole('radio', { name: 'iPad', exact: true });
  await ipadTab.click();
  await expect(ipadTab).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('contentinfo')).toContainText('iPad');
  await expect(page.getByRole('contentinfo')).toContainText('2064 × 2752');

  // Every slide is there, on the iPad canvas, with iPad frames.
  await expect(stage(page).getByRole('group')).toHaveCount(5);
  const box = (await stage(page).getByRole('group', { name: 'Slide 1 of 5' }).locator('[data-slide-box]').boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(2064 / 2752, 2);
  await elementOnStage(page, 0, { kind: 'device' });
  expect(await paintedFrames(page, 0)).toEqual(['ipad']);
  await expect(page.getByRole('listbox', { name: 'iPad screenshots by language' })).toBeVisible();

  // An iPad screenshot makes turning iPad off worth a question.
  const device = await elementOnStage(page, 0, { kind: 'device' });
  const slide1 = stage(page).getByRole('group', { name: 'Slide 1 of 5' }).locator('[data-slide-box]');
  await dropFiles(page, slide1, [screenshot('ipad-home.png', VIOLET, { width: 2064, height: 2752 })], device);
  await expectToast(page, 'Screenshot added');
  const withShot = await openProject(page);
  const ipadShot = withShot.slides[0].shots.ipad?.main?.['en-US'];
  expect(ipadShot).toMatch(/^[0-9a-f]{64}\.png$/);

  await page.getByRole('button', { name: 'Device families' }).click();
  await dialog.getByRole('switch', { name: 'iPad', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Turn off iPad?' });
  await expect(confirm).toContainText('iPad has 1 screenshot.');
  await confirm.getByRole('button', { name: 'Turn off' }).click();
  await expect(confirm).toBeHidden();
  await expect(dialog.getByRole('switch', { name: 'iPad', exact: true })).toHaveAttribute('aria-checked', 'false');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(switcher.getByRole('radio')).toHaveCount(2);
  await expect(switcher.getByRole('radio', { name: 'iPad', exact: true })).toHaveCount(0);
  await expect(switcher.getByRole('radio', { name: 'iPhone', exact: true })).toHaveAttribute('aria-checked', 'true');
  const after = await openProject(page);
  expect(after.families).toEqual(['iphone', 'android-phone']);
  expect(after.slides[0].shots.ipad?.main?.['en-US'], 'the iPad screenshot stays in the project').toBe(ipadShot);
  await expect(page.getByRole('contentinfo')).toContainText('1320 × 2868');
});

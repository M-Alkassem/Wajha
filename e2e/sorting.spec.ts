/**
 * Journey 13: dropping a mixed pile of screenshots (as a simulator or a
 * translator leaves them) on the stage. Wajha sorts them by device, from
 * their size and name, and by language, from the language in their name,
 * fills the first slides of each, and offers to add a device the project
 * does not have yet.
 */
import { expect, test } from './fixtures';
import { dropFiles, openDemo, openProject, screenshot, stage, toast, type Rgb } from './helpers';

const GREEN: Rgb = [30, 160, 90];
const RED: Rgb = [210, 60, 60];
const BLUE: Rgb = [40, 90, 220];
const GOLD: Rgb = [230, 180, 40];

/** Whether slide `index` has a screenshot for `family` in `lang`. */
const hasShot = (project: Awaited<ReturnType<typeof openProject>>, index: number, family: string, lang: string) =>
  Object.values((project.slides[index].shots as Record<string, Record<string, Record<string, string>>>)[family] ?? {}).some((byLang) => typeof byLang[lang] === 'string');

test('a mixed drop is sorted into devices and languages', async ({ page }) => {
  await openDemo(page, { template: 'sunset-boulevard', families: ['iphone', 'ipad'], langs: ['en-US', 'ar-SA'] });
  const box = (await stage(page).boundingBox())!;
  await dropFiles(
    page,
    stage(page),
    [
      screenshot('02-home-ar-SA.png', RED),
      screenshot('01-home-en-US.png', GREEN),
      screenshot('Simulator Screenshot - iPad Pro 13-inch (M5) - 2026-10-31 at 10.11.12.png', BLUE, { width: 2064, height: 2752 }),
      screenshot('Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-10-31 at 10.12.00.png', GOLD, { width: 422, height: 514 }),
    ],
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );

  await expect(toast(page, 'Sorted 3 screenshots')).toBeVisible({ timeout: 10_000 });
  const sorted = await openProject(page);
  expect(hasShot(sorted, 0, 'iphone', 'en-US'), 'the English iPhone shot opens the iPhone slides').toBe(true);
  expect(hasShot(sorted, 0, 'iphone', 'ar-SA'), 'the Arabic one becomes its Arabic version').toBe(true);
  expect(hasShot(sorted, 0, 'ipad', 'en-US'), 'the iPad capture goes to the iPad slides').toBe(true);
  expect(hasShot(sorted, 1, 'iphone', 'en-US'), 'nothing spills onto slide 2').toBe(false);

  // The watch capture waits for its device; one click adds Apple Watch and places it.
  const offer = toast(page, /screenshot is for Apple Watch/);
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Add Watch' }).click();
  await expect(toast(page, 'Sorted 1 screenshot')).toBeVisible({ timeout: 10_000 });
  const withWatch = await openProject(page);
  expect(withWatch.families).toContain('watch');
  expect(hasShot(withWatch, 0, 'watch', 'en-US')).toBe(true);
});

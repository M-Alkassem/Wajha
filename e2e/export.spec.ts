/**
 * Journey 6: exporting. Choose sizes and languages in the Export dialog, run
 * the export, catch the zip download and check every file: the folder
 * structure, the file count, exact store pixel sizes, and PNGs that are
 * 24-bit RGB without alpha (the stores reject transparency). Then one JPEG
 * export.
 */
import { expect, test } from './fixtures';
import {
  catchDownload,
  closeColor,
  downloadBytes,
  expectToast,
  jpegSize,
  openDemo,
  openProject,
  pickFiles,
  pngChunkTypes,
  pngHeader,
  pngPixel,
  screenshot,
  unzip,
  type Rgb,
} from './helpers';

const GREEN: Rgb = [30, 160, 90];

test('export PNGs for two stores and two languages, then a JPEG set', async ({ page }) => {
  test.setTimeout(150_000);
  const { name } = await openDemo(page, { template: 'sunset-boulevard' });

  // A real screenshot on slide 1, so the export has to load a full-resolution image.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('listbox', { name: 'iPhone screenshots by language' }).getByRole('option', { name: /English/ }).click();
  await pickFiles(page, () => inspector.getByRole('button', { name: 'Choose…' }).click(), screenshot('home.png', GREEN));
  await expectToast(page, 'Screenshot added');
  const project = await openProject(page);
  const device = project.slides[0].layouts.iphone!.elements.find((e) => e.kind === 'device')!;

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export screenshots' });
  await expect(dialog).toBeVisible();

  // Sizes: iPhone 6.9″ and the Android phone, not iPhone 6.3″. Languages: both.
  const sizes = dialog.getByRole('region', { name: 'Sizes' });
  const size69 = sizes.getByRole('checkbox', { name: /^iPhone 6\.9″ for/ });
  const size63 = sizes.getByRole('checkbox', { name: /^iPhone 6\.3″ for/ });
  const play = sizes.getByRole('checkbox', { name: /^Phone 1080 × 1920 for/ });
  await expect(size69).toBeChecked();
  await expect(play).toBeChecked();
  await size63.uncheck();
  await expect(size63).not.toBeChecked();
  const languages = dialog.getByRole('region', { name: 'Languages' });
  await expect(languages.getByRole('checkbox', { name: /^English \(US\)/ })).toBeChecked();
  await expect(languages.getByRole('checkbox', { name: /^Arabic/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'PNG' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('radio', { name: /^Stores/ })).toHaveAttribute('aria-checked', 'true');

  const run = dialog.getByRole('button', { name: 'Export 20 files' });
  await expect(run).toBeEnabled();
  const download = await catchDownload(page, () => run.click(), 120_000);
  expect(download.suggestedFilename()).toBe(`${name} screenshots.zip`);
  await expect(dialog.getByRole('heading', { name: '20 files exported' })).toBeVisible();
  await expect(dialog).toContainText(`Downloaded ${name} screenshots.zip`);

  const files = unzip(await downloadBytes(download));
  const expected: string[] = [];
  for (const [store, locale, folder] of [
    ['App Store', 'en-US', 'iPhone 6.9'],
    ['App Store', 'ar-SA', 'iPhone 6.9'],
    ['Google Play', 'en-US', 'Phone'],
    ['Google Play', 'ar', 'Phone'],
  ]) {
    for (let n = 1; n <= 5; n++) expected.push(`${name}/${store}/${locale}/${folder}/0${n}.png`);
  }
  expect(Object.keys(files).sort()).toEqual([...expected].sort());

  for (const [path, bytes] of Object.entries(files)) {
    const header = pngHeader(bytes);
    const store = path.includes('/App Store/') ? { width: 1320, height: 2868 } : { width: 1080, height: 1920 };
    expect({ path, ...header }).toEqual({ path, ...store, bitDepth: 8, colorType: 2 });
    expect(pngChunkTypes(bytes), `${path} has no transparency chunk`).not.toContain('tRNS');
  }

  // The full-resolution screenshot is inside slide 1's device.
  const shot = pngPixel(files[`${name}/App Store/en-US/iPhone 6.9/01.png`], Math.round(device.x * 1320), Math.round(device.y * 2868));
  expect(closeColor(shot, GREEN), `device centre of slide 1 is the screenshot's green, got ${shot.join(',')}`).toBe(true);

  // JPEG: iPhone 6.9″ in English only.
  await dialog.getByRole('button', { name: 'Export again' }).click();
  await dialog.getByRole('radio', { name: 'JPEG' }).click();
  await expect(dialog.getByRole('slider', { name: 'JPEG quality' })).toBeVisible();
  await play.uncheck();
  await languages.getByRole('checkbox', { name: /^Arabic/ }).uncheck();
  const jpegs = await catchDownload(page, () => dialog.getByRole('button', { name: 'Export 5 files' }).click(), 60_000);
  await expect(dialog.getByRole('heading', { name: '5 files exported' })).toBeVisible();
  const jpegFiles = unzip(await downloadBytes(jpegs));
  expect(Object.keys(jpegFiles).sort()).toEqual([1, 2, 3, 4, 5].map((n) => `${name}/App Store/en-US/iPhone 6.9/0${n}.jpg`));
  for (const [path, bytes] of Object.entries(jpegFiles)) {
    expect({ path, ...jpegSize(bytes) }).toEqual({ path, width: 1320, height: 2868, components: 3 });
  }

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
});

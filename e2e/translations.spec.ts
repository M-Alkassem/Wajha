/**
 * Journey 7: the translations table round trip. Export the CSV from the
 * Translations dialog, change cells as a translator would (in Node), import
 * the file back through the dialog, and find the new texts in the project
 * and in the table.
 */
import { expect, test } from './fixtures';
import { catchDownload, downloadBytes, downloadName, expectToast, openDemo, openProject, parseCsv, pickFiles, toCsv } from './helpers';

const NEW_ARABIC = 'سافر مع *الجميع*';
const NEW_SUBTITLE = 'Routes, stops and "hidden gems", all on one map.';
const GERMAN = 'Plane die *perfekte* Reise';

test('export the translations CSV, edit it, import it back', async ({ page }) => {
  const { name } = await openDemo(page, { template: 'sunset-boulevard' });
  const before = await openProject(page);

  await page.getByRole('button', { name: /^Preview language:/ }).click();
  await page.getByRole('menuitem', { name: 'Translations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translations' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Translations' })).toBeVisible();
  await expect(dialog.getByRole('searchbox', { name: 'Search texts' }), 'opens in the search field').toBeFocused();

  // Export.
  const download = await catchDownload(page, () => dialog.getByRole('button', { name: 'Export CSV' }).click());
  expect(downloadName(download)).toBe(`${name} translations.csv`);
  await expectToast(page, 'Translations exported');
  const bytes = await downloadBytes(download);
  expect([...bytes.subarray(0, 3)], 'UTF-8 with a byte order mark, for Excel').toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  expect(text, 'CRLF line ends').toContain('\r\n');
  const rows = parseCsv(text).filter((r) => r.some((c) => c !== ''));
  expect(rows[0]).toEqual(['slide', 'key', 'en-US', 'ar-SA']);
  const body = rows.slice(1);
  expect(body.length, 'one row per slide and text').toBe(before.slides.length * 2);
  const find = (slide: number, key: string) => {
    const row = body.find((r) => r[0] === String(slide) && r[1] === key);
    expect(row, `row for slide ${slide} ${key}`).toBeDefined();
    return row!;
  };
  expect(find(1, 'headline')).toEqual(['1', 'headline', before.slides[0].texts['en-US'].headline, before.slides[0].texts['ar-SA'].headline]);
  expect(find(2, 'headline')[3]).toBe(before.slides[1].texts['ar-SA'].headline);

  // A translator edits two cells (one needs quoting), adds a German column with one
  // translation, and sends the file back.
  find(2, 'headline')[3] = NEW_ARABIC;
  find(1, 'subtitle')[2] = NEW_SUBTITLE;
  rows[0].push('de-DE');
  for (const row of body) row.push(row === find(1, 'headline') ? GERMAN : '');
  const edited = Buffer.from(`\uFEFF${toCsv(rows)}`, 'utf8');

  await pickFiles(page, () => dialog.getByRole('button', { name: 'Import CSV' }).click(), { name: 'translations-edited.csv', mimeType: 'text/csv', buffer: edited });
  await expectToast(page, /Updated 3 texts.*Added German/);

  const after = await openProject(page);
  expect(after.languages).toEqual(['en-US', 'ar-SA', 'de-DE']);
  expect(after.slides[1].texts['ar-SA'].headline).toBe(NEW_ARABIC);
  expect(after.slides[0].texts['en-US'].subtitle).toBe(NEW_SUBTITLE);
  expect(after.slides[0].texts['de-DE']?.headline).toBe(GERMAN);
  // Nothing else changed.
  expect(after.slides[1].texts['en-US']).toEqual(before.slides[1].texts['en-US']);
  expect(after.slides[0].texts['ar-SA']).toEqual(before.slides[0].texts['ar-SA']);
  expect(after.slides.slice(2).map((s) => s.texts)).toEqual(before.slides.slice(2).map((s) => s.texts));

  // The table shows the imported texts.
  await expect(dialog.getByRole('textbox', { name: 'Slide 2, Headline, Arabic' })).toHaveValue(NEW_ARABIC);
  await expect(dialog.getByRole('textbox', { name: 'Slide 1, Subtitle, English (US)' })).toHaveValue(NEW_SUBTITLE);
  await expect(dialog.getByRole('textbox', { name: 'Slide 1, Headline, German' })).toHaveValue(GERMAN);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listbox', { name: 'Slides' }).getByRole('option').nth(0)).toContainText(NEW_SUBTITLE);
});

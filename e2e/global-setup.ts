/**
 * Warms the Vite dev server up before the workers start: one page loads the
 * home screen and opens the editor (?demo), so every module the journeys
 * need is transformed once instead of by all workers at the same time on a
 * cold server. The project it creates lives in this throwaway browser only.
 */
import { webkit, type FullConfig } from '@playwright/test';

export default async function warmUp(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/?demo`, { timeout: 180_000 });
    await page.getByRole('region', { name: 'Slides' }).waitFor({ timeout: 180_000 });
  } finally {
    await browser.close();
  }
}

/**
 * The fixture every spec uses: Playwright gives each test a fresh browser
 * context (so a fresh IndexedDB library: the first-run state), and this adds
 * an automatic watcher that fails the test on any uncaught page error,
 * console.error or page crash.
 *
 * Nothing is allow-listed. Only `error` messages count: the Vite client logs
 * its connection at `debug` level, and the app reports cosmetic problems
 * (a thumbnail that could not be drawn) with console.warn on purpose.
 */
import { test as base, expect, type ConsoleMessage, type Page } from '@playwright/test';

export interface PageProblems {
  /** Uncaught errors and console.error calls seen so far, oldest first. */
  readonly list: string[];
}

function describeConsole(m: ConsoleMessage): string {
  const where = m.location();
  const at = where.url ? ` (${where.url.replace(/^https?:\/\/[^/]+/, '')}:${where.lineNumber})` : '';
  return `console.error: ${m.text()}${at}`;
}

/** Starts collecting problems on `page` and its web workers (the PNG encoder runs in one). */
export function watchPage(page: Page): PageProblems {
  const list: string[] = [];
  const onConsole = (m: ConsoleMessage) => {
    // A worker's message may be reported by both the worker and the page: count it once.
    if (m.type() === 'error' && !list.includes(describeConsole(m))) list.push(describeConsole(m));
  };
  page.on('pageerror', (err) => list.push(`pageerror: ${err.message}${err.stack ? `\n${err.stack}` : ''}`));
  page.on('console', onConsole);
  page.on('worker', (worker) => worker.on('console', onConsole));
  page.on('crash', () => list.push('the page crashed'));
  return { list };
}

export const test = base.extend<{ problems: PageProblems }>({
  problems: [
    async ({ page }, use) => {
      const problems = watchPage(page);
      await use(problems);
      expect(problems.list, 'uncaught page errors and console.error calls').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Regenerates the screenshots used by README.md (docs/media/*) from the real
 * app in WebKit. Start the dev server first, then run:
 *
 *   npm run dev
 *   node scripts/readme-media.mjs [--url http://localhost:1420] [--out docs/media]
 *
 * Every run starts from an empty browser profile, creates a small library of
 * projects from built-in templates and captures the home screen, the new
 * project dialog, the editor in English and Arabic, and the export dialog.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { webkit } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const base = arg('--url', 'http://localhost:1420').replace(/\/$/, '');
const out = arg('--out', 'docs/media');
const theme = arg('--theme', 'dark');

const LIBRARY = [
  { template: 'aurora', name: 'Sleepwell' },
  { template: 'sunset-boulevard', name: 'Wanderly' },
  { template: 'mono-swiss', name: 'Inkwell Notes' },
  { template: 'midnight-neon', name: 'Nightlife Tickets' },
  { template: 'noor', name: 'نور · Noor' },
  { template: 'clay-garden', name: 'Bloom Habits' },
  { template: 'launchpad', name: 'Liftoff' },
];

await mkdir(out, { recursive: true });
const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e)));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));

// The browser build says where projects live and how exports arrive; the
// README shows the desktop app, so those lines get the desktop app's wording.
const DESKTOP_WORDING = [
  ['Saved in this browser', 'Saved on this computer'],
  ['Downloads as “Sleepwell screenshots.zip”.', 'Choose a folder next. Files go into “Sleepwell” inside it.'],
  ['Inside Sleepwell screenshots.zip', 'Inside the folder you choose'],
];

const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.evaluate((pairs) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const [from, to] of pairs) if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replace(from, to);
    }
  }, DESKTOP_WORDING);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 82 });
  console.log(`  ${name}.jpg`);
};

await page.goto(`${base}/`, { waitUntil: 'networkidle' });

// A small library, created through the app's own store (newest first on the home screen).
await page.evaluate(async (library) => {
  const store = await import('/src/store/index.ts');
  const { BUILTIN_TEMPLATES } = await import('/src/templates/index.ts');
  for (const item of [...library].reverse()) {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === item.template) ?? null;
    await store.createAndOpenProject(template, { name: item.name, families: ['iphone', 'android-phone'], languages: ['en-US', 'ar-SA'] });
    await store.goHome();
  }
}, LIBRARY);

// Home: wait until every card shows its rendered thumbnail.
await page.waitForFunction(
  (count) => {
    const imgs = [...document.querySelectorAll('main img')].filter((img) => img.complete && img.naturalWidth > 0);
    return imgs.length >= count;
  },
  LIBRARY.length,
  { timeout: 60_000 },
);
await page.mouse.move(5, 895);
await shot('home');

// New project dialog with a template picked and Arabic added.
await page.getByRole('button', { name: 'New project' }).first().click();
await page.getByRole('button', { name: /^Sunset Boulevard,/ }).first().click();
await shot('new-project');
await page.keyboard.press('Escape');

// Editor: open the first project and select the first headline.
await page.getByRole('button', { name: 'Open Sleepwell' }).click();
await page.waitForFunction(async () => (await import('/src/store/index.ts')).useEditor.getState().project !== null);
const selectHeadline = () =>
  page.evaluate(async () => {
    const { useEditor } = await import('/src/store/index.ts');
    const { resolveLayout } = await import('/src/model/resolve.ts');
    const s = useEditor.getState();
    const slide = s.project.slides[0];
    const layout = resolveLayout(s.project, slide, s.activeFamily);
    const headline = layout.elements.find((e) => e.kind === 'text' && e.key === 'headline') ?? layout.elements.find((e) => e.kind === 'text');
    if (headline) s.select(headline.id, slide.id);
  });
await page.waitForTimeout(1500);
await selectHeadline();
await page.mouse.move(5, 895);
await shot('editor');

// The same slides in Arabic.
await page.evaluate(async () => (await import('/src/store/index.ts')).useEditor.getState().setActiveLang('ar-SA'));
await selectHeadline();
await shot('arabic');

// Export dialog.
await page.evaluate(async () => (await import('/src/store/index.ts')).useEditor.getState().setActiveLang('en-US'));
await page.evaluate(async () => (await import('/src/ui/editor/editorUi.ts')).useEditorUi.getState().openDialog('export'));
await shot('export');

await browser.close();
await copyFile('src-tauri/icons/128x128@2x.png', join(out, 'icon.png'));
console.log('  icon.png');
if (problems.length) {
  console.error('Console errors while capturing:\n' + problems.join('\n'));
  process.exit(1);
}

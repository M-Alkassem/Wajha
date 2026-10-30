/**
 * Shared steps and checks for the end-to-end journeys.
 *
 * Tests drive the UI by roles and accessible names. Where the UI is not
 * enough to *check* a result (what the store holds, what IndexedDB holds,
 * where an element sits on the canvas) they read the live app modules
 * through the Vite dev server: `import('/src/store/index.ts')` in the page
 * returns the very module instance the app uses.
 */
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import type { FamilyId, LangCode, Project } from '../src/model/types.ts';

type StoreModule = typeof import('../src/store/index.ts');
type StageStoreModule = typeof import('../src/ui/editor/stage/stageStore.ts');
type TemplatesModule = typeof import('../src/templates/index.ts');

const STORE_URL = '/src/store/index.ts';
const STAGE_STORE_URL = '/src/ui/editor/stage/stageStore.ts';
const TEMPLATES_URL = '/src/templates/index.ts';

/* App state ------------------------------------------------------------------ */

export interface EditorSnapshot {
  project: Project;
  activeFamily: FamilyId;
  activeLang: LangCode;
  activeSlideId: string | null;
  selection: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** The editor store as plain data (null when no project is open). */
export async function editorState(page: Page): Promise<EditorSnapshot | null> {
  return page.evaluate(async (url) => {
    const { useEditor } = (await import(/* @vite-ignore */ url)) as StoreModule;
    const s = useEditor.getState();
    if (!s.project) return null;
    return {
      project: JSON.parse(JSON.stringify(s.project)) as Project,
      activeFamily: s.activeFamily,
      activeLang: s.activeLang,
      activeSlideId: s.activeSlideId,
      selection: s.selection,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
    };
  }, STORE_URL);
}

/** The open project (fails the test when none is open). */
export async function openProject(page: Page): Promise<Project> {
  const state = await editorState(page);
  expect(state, 'a project is open in the editor').not.toBeNull();
  return state!.project;
}

/** Headline texts of a project's slides in `lang`, in slide order. */
export function headlines(project: Project, lang: LangCode = project.languages[0]): string[] {
  return project.slides.map((s) => s.texts[lang]?.headline ?? '');
}

/** The built-in template with `id`, as the app has it: its name and its headlines per language (sample copy falls back to English). */
export async function builtinTemplate(page: Page, id: string, langs: LangCode[] = ['en-US']): Promise<{ name: string; headlines: Record<LangCode, string[]> }> {
  return page.evaluate(
    async ({ url, id, langs }) => {
      const { BUILTIN_TEMPLATES } = (await import(/* @vite-ignore */ url)) as TemplatesModule;
      const t = BUILTIN_TEMPLATES.find((x) => x.id === id);
      if (!t) throw new Error(`no built-in template ${id}`);
      const headlines: Record<string, string[]> = {};
      for (const lang of langs) headlines[lang] = t.slides.map((s) => (s.texts[lang] ?? s.texts['en-US'])?.headline ?? '');
      return { name: t.name, headlines };
    },
    { url: TEMPLATES_URL, id, langs },
  );
}

/** One file of the library, read straight from IndexedDB (database "wajha", store "files"); null when missing. */
export async function readLibraryFile(page: Page, path: string): Promise<string | null> {
  return page.evaluate(
    (path) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('wajha');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('files')) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction('files', 'readonly').objectStore('files').get(path);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            const rec = get.result as { data?: Uint8Array } | undefined;
            resolve(rec?.data ? new TextDecoder().decode(rec.data) : null);
          };
        };
      }),
    path,
  );
}

/** Keys of the library in IndexedDB that start with `prefix`. */
export async function libraryKeys(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(
    (prefix) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('wajha');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('files')) {
            db.close();
            resolve([]);
            return;
          }
          const req = db.transaction('files', 'readonly').objectStore('files').getAllKeys();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            db.close();
            resolve(req.result.map(String).filter((k) => k.startsWith(prefix)));
          };
        };
      }),
    prefix,
  );
}

/** The project as saved in IndexedDB. */
export async function savedProject(page: Page, id: string): Promise<Project | null> {
  const text = await readLibraryFile(page, `projects/${id}/project.json`);
  return text ? (JSON.parse(text) as Project) : null;
}

/** Waits until autosave has written the editor's current project to IndexedDB. */
export async function waitForAutosave(page: Page): Promise<void> {
  const project = await openProject(page);
  await expect
    .poll(async () => (await savedProject(page, project.id))?.updatedAt ?? 0, { message: 'autosave writes the project to IndexedDB', timeout: 15_000 })
    .toBeGreaterThanOrEqual(project.updatedAt);
}

/* Navigation ----------------------------------------------------------------- */

/** The editor's canvas region, present once a project is open. */
export const stage = (page: Page) => page.getByRole('region', { name: 'Slides' });

/** Waits until the editor shows the open project. */
export async function waitForEditor(page: Page): Promise<Project> {
  await expect(stage(page)).toBeVisible({ timeout: 30_000 });
  const project = await openProject(page);
  await expect(page.getByRole('group', { name: new RegExp(`^Slide 1 of ${project.slides.length}$`) })).toBeVisible();
  return project;
}

export interface DemoOptions {
  template?: string;
  families?: FamilyId[];
  langs?: LangCode[];
}

/**
 * Opens a ready-made project (the app's "?demo" entry point). Journeys that
 * are not about creating projects start here; the New project dialog has its
 * own journey.
 */
export async function openDemo(page: Page, opts: DemoOptions = {}): Promise<Project> {
  const params = new URLSearchParams();
  params.set('demo', opts.template ?? '');
  params.set('families', (opts.families ?? ['iphone', 'android-phone']).join(','));
  params.set('langs', (opts.langs ?? ['en-US', 'ar-SA']).join(','));
  await page.goto(`/?${params.toString().replace('demo=&', 'demo&')}`);
  return waitForEditor(page);
}

/**
 * Reloads the app on the home screen. (The page URL may still carry "?demo",
 * which would create yet another project on a plain reload.)
 */
export async function reloadHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^(Projects|Make your app store page shine)$/ })).toBeVisible();
}

/** "Back to projects" in the editor's top bar. */
export async function backToProjects(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
}

/** Opens a project from its home screen card. */
export async function openFromHome(page: Page, name: string): Promise<Project> {
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  return waitForEditor(page);
}

/* Toasts ------------------------------------------------------------------------ */

/**
 * A toast by its text. Toasts are live regions ("status", or "alert" for
 * errors) and stay in the accessibility tree while a dialog is open.
 * `includeHidden` also finds a toast assistive technology would miss, for
 * the tests that check exactly that (toasts.spec.ts).
 */
export function toast(page: Page, text: string | RegExp, includeHidden = false): Locator {
  const region = page.getByRole('region', { name: 'Notifications', includeHidden });
  return region
    .getByRole('status', { includeHidden })
    .or(region.getByRole('alert', { includeHidden }))
    .filter({ hasText: text })
    .first();
}

/**
 * Waits for a toast whose text matches and dismisses it, so it cannot cover
 * anything. Over a dialog, dismissing a toast leaves the dialog open.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  const shown = toast(page, text);
  await expect(shown).toBeVisible();
  // On a slow machine the toast may time out on its own before the click lands; either way it is gone.
  await shown
    .getByRole('button', { name: 'Dismiss notification' })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
  await expect(shown).toBeHidden();
}

/* Status bar --------------------------------------------------------------------- */

/** The missing-screenshot count the status bar shows (0 for "All screenshots added"). */
export async function missingShotsShown(page: Page): Promise<number> {
  const text = await page.getByRole('contentinfo').innerText();
  if (/All screenshots added/.test(text)) return 0;
  const m = /(\d+) missing screenshots?/.exec(text);
  if (!m) throw new Error(`status bar shows no screenshot count: ${text}`);
  return Number(m[1]);
}

/* Keyboard ------------------------------------------------------------------------ */

/**
 * The command key of the app's own shortcuts (Cmd+Z, Cmd+E...). The app
 * picks it from the user agent, which is Safari on a Mac in this suite, so
 * it is Meta even when the tests run on Linux. Native text editing (select
 * all in a field) follows the real OS instead: use 'ControlOrMeta' there.
 */
export async function modKey(page: Page): Promise<'Meta' | 'Control'> {
  const mac = await page.evaluate(() => /mac|iphone|ipad|darwin/i.test(navigator.platform) || /Macintosh|Mac OS X/.test(navigator.userAgent));
  return mac ? 'Meta' : 'Control';
}

/* Canvas geometry ------------------------------------------------------------------- */

export interface ElementQuery {
  kind: 'text' | 'device' | 'shape' | 'image';
  /** Text key ("headline") or device slot ("main"). */
  key?: string;
}

export interface ElementOnScreen {
  id: string;
  /** Centre in page (viewport) pixels. */
  x: number;
  y: number;
  /** Unrotated size in CSS pixels. */
  w: number;
  h: number;
}

/**
 * Where an element of slide `slideIndex` is drawn on the stage, from the
 * slide's last paint (the same boxes the stage hit-tests against). Waits for
 * the slide to be painted and fully inside the stage viewport.
 */
export async function elementOnStage(page: Page, slideIndex: number, query: ElementQuery): Promise<ElementOnScreen> {
  let found: ElementOnScreen | null = null;
  await expect
    .poll(
      async () => {
        found = await page.evaluate(
          async ({ storeUrl, stageUrl, slideIndex, query }) => {
            const { useEditor } = (await import(/* @vite-ignore */ storeUrl)) as StoreModule;
            const { getSnapshot, stageBoxes } = (await import(/* @vite-ignore */ stageUrl)) as StageStoreModule;
            const state = useEditor.getState();
            const slide = state.project?.slides[slideIndex];
            if (!slide) return null;
            const box = document.querySelector<HTMLElement>(`[data-slide-box][data-slide-id="${slide.id}"]`);
            const viewport = document.querySelector<HTMLElement>('[data-stage-viewport]');
            const snap = getSnapshot(slide.id);
            if (!box || !viewport || !snap) return null;
            const r = box.getBoundingClientRect();
            const v = viewport.getBoundingClientRect();
            if (r.left < v.left - 0.5 || r.right > v.right + 0.5) return null;
            // Only a paint of the family on screen, at the slide's current shape, counts.
            if (snap.family !== state.activeFamily || Math.abs(snap.bitmapW / snap.bitmapH - r.width / r.height) > 0.01) return null;
            const hit = stageBoxes(snap, r.width).find((b) => {
              const el = b.element;
              if (el.kind !== query.kind || el.hidden) return false;
              if (!query.key) return true;
              return (el.kind === 'text' && el.key === query.key) || (el.kind === 'device' && el.slot === query.key);
            });
            return hit ? { id: hit.id, x: r.left + hit.cx, y: r.top + hit.cy, w: hit.w, h: hit.h } : null;
          },
          { storeUrl: STORE_URL, stageUrl: STAGE_STORE_URL, slideIndex, query },
        );
        return found;
      },
      { message: `slide ${slideIndex + 1} is painted on screen with a ${query.kind}${query.key ? ` "${query.key}"` : ''}` },
    )
    .not.toBeNull();
  return found!;
}

/** Brings slide `index` (0-based) into view by choosing it in the slides list, like a person would. */
export async function showSlide(page: Page, index: number): Promise<void> {
  const option = page.getByRole('listbox', { name: 'Slides' }).getByRole('option').nth(index);
  await option.click();
  await expect(option).toHaveAttribute('aria-selected', 'true');
}

/** Clicks an element on the canvas; resolves its id. */
export async function clickOnStage(page: Page, slideIndex: number, query: ElementQuery): Promise<string> {
  const el = await elementOnStage(page, slideIndex, query);
  await page.mouse.click(el.x, el.y);
  await expect.poll(async () => (await editorState(page))?.selection).toBe(el.id);
  return el.id;
}

/* Files ----------------------------------------------------------------------------- */

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Runs `open` (which makes the app show a file picker) and answers the picker with `files`. */
export async function pickFiles(page: Page, open: () => Promise<unknown>, files: FilePayload | FilePayload[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await open();
  await (await chooser).setFiles(files);
}

/** Drops files onto `target` at a page point, as the system drag-and-drop does (dragenter, dragover, drop). */
export async function dropFiles(page: Page, target: Locator, files: FilePayload[], at: { x: number; y: number }): Promise<void> {
  const payload = files.map((f) => ({ name: f.name, type: f.mimeType, base64: f.buffer.toString('base64') }));
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bin = atob(f.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    return dt;
  }, payload);
  const init = { dataTransfer, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true };
  await target.dispatchEvent('dragenter', init);
  await target.dispatchEvent('dragover', init);
  await target.dispatchEvent('drop', init);
  await dataTransfer.dispose();
}

/** The bytes of a finished download. */
export async function downloadBytes(download: Download): Promise<Buffer> {
  const failure = await download.failure();
  expect(failure, `download of ${download.suggestedFilename()} failed`).toBeNull();
  return readFile((await download.path())!);
}

/** Runs `start` and resolves the download it triggers. */
export async function catchDownload(page: Page, start: () => Promise<unknown>, timeout = 60_000): Promise<Download> {
  const download = page.waitForEvent('download', { timeout });
  await start();
  return download;
}

/** Unzips a zip archive; file paths map to their bytes (directory entries are left out). */
export function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  const all = unzipSync(bytes);
  return Object.fromEntries(Object.entries(all).filter(([name]) => !name.endsWith('/')));
}

/* Images ------------------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

export type Rgb = readonly [number, number, number];

/**
 * A real PNG "screenshot" encoded in Node: a solid colour with a darker
 * status-bar band on top. Different colours give different bytes, so every
 * image becomes its own asset (assets are content-addressed).
 */
export function makePng(width: number, height: number, [r, g, b]: Rgb, opts: { alpha?: boolean } = {}): Buffer {
  const bpp = opts.alpha ? 4 : 3;
  const stride = width * bpp + 1;
  const raw = Buffer.alloc(stride * height);
  const band = Math.round(height * 0.06);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0; // filter: none
    const dim = y < band ? 2 : 1;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * bpp;
      raw[i] = Math.floor(r / dim);
      raw[i + 1] = Math.floor(g / dim);
      raw[i + 2] = Math.floor(b / dim);
      if (opts.alpha) raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opts.alpha ? 6 : 2; // RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A screenshot file for the pickers, 1206 × 2622 (iPhone 6.3″) unless told otherwise. */
export function screenshot(name: string, color: Rgb, opts: { alpha?: boolean; width?: number; height?: number } = {}): FilePayload {
  return { name, mimeType: 'image/png', buffer: makePng(opts.width ?? 1206, opts.height ?? 2622, color, opts) };
}

export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** The IHDR of a PNG file (throws when it is not a PNG). */
export function pngHeader(bytes: Uint8Array): PngHeader {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, i) => bytes[i] === v)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== 'IHDR') throw new Error(`first PNG chunk is ${type}, not IHDR`);
  return { width: view.getUint32(16), height: view.getUint32(20), bitDepth: bytes[24], colorType: bytes[25] };
}

/** Chunk types of a PNG, in file order. */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const len = view.getUint32(at);
    types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    at += 12 + len;
  }
  return types;
}

/** Decodes an 8-bit RGB PNG (colour type 2, no interlace) and returns the colour at (x, y). */
export function pngPixel(bytes: Uint8Array, x: number, y: number): Rgb {
  const { width, height, bitDepth, colorType } = pngHeader(bytes);
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`pngPixel reads 8-bit RGB only, got depth ${bitDepth} type ${colorType}`);
  if (bytes[28] !== 0) throw new Error('interlaced PNGs are not supported');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const len = view.getUint32(at);
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  let prev = new Uint8Array(stride);
  for (let row = 0; row <= Math.min(y, height - 1); row++) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const out = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? out[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter} on row ${row}`);
      out[i] = v & 0xff;
    }
    prev = out;
  }
  const i = Math.min(x, width - 1) * 3;
  return [prev[i], prev[i + 1], prev[i + 2]];
}

/** Width and height from a baseline or progressive JPEG's SOF segment (throws when it is not a JPEG). */
export function jpegSize(bytes: Uint8Array): { width: number; height: number; components: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG file');
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error(`bad JPEG marker at ${at}`);
    const marker = bytes[at + 1];
    const len = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8], components: bytes[at + 9] };
    }
    at += 2 + len;
  }
  throw new Error('JPEG without a frame header');
}

/** Average colour of a square around a page point on a slide's canvas (as drawn on screen). */
export async function stagePixel(page: Page, slideIndex: number, at: { x: number; y: number }): Promise<Rgb> {
  return page.evaluate(
    async ({ storeUrl, slideIndex, at }) => {
      const { useEditor } = (await import(/* @vite-ignore */ storeUrl)) as StoreModule;
      const slide = useEditor.getState().project?.slides[slideIndex];
      const canvas = slide ? document.querySelector<HTMLCanvasElement>(`[data-slide-box][data-slide-id="${slide.id}"] canvas`) : null;
      if (!canvas) throw new Error('slide canvas not found');
      const r = canvas.getBoundingClientRect();
      const kx = canvas.width / r.width;
      const ky = canvas.height / r.height;
      const x = Math.round((at.x - r.left) * kx);
      const y = Math.round((at.y - r.top) * ky);
      const d = canvas.getContext('2d')!.getImageData(x - 2, y - 2, 5, 5).data;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      for (let i = 0; i < d.length; i += 4) {
        rr += d[i];
        gg += d[i + 1];
        bb += d[i + 2];
      }
      const n = d.length / 4;
      return [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)] as const;
    },
    { storeUrl: STORE_URL, slideIndex, at },
  );
}

/** True when two colours are within `tolerance` on every channel. */
export function closeColor(a: Rgb, b: Rgb, tolerance = 14): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

/* CSV ------------------------------------------------------------------------------------ */

/** Parses RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Writes rows as RFC 4180 CSV with CRLF line ends. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

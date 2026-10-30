/**
 * Unit tests for scripts/build-gallery-index.mjs on throwaway gallery folders:
 * entries, versions that follow the template file hash, stable updatedAt,
 * the problems a contributor gets told about (previews and images are held
 * to the app's own limits), and the command line on plain Node.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { IMAGE_LIMITS, THUMBNAIL_LIMITS } from '../src/platform/limits';

interface Built {
  index: { updatedAt: string; templates: { id: string; version: number; bytes: number; assets: string[]; category: string; tags: string[] }[] };
  hashes: Record<string, { sha256: string; version: number }>;
  problems: string[];
}
// A computed specifier keeps TypeScript from looking for declarations of the plain JavaScript module.
const builderPath = './build-gallery-index.mjs';
const { buildGalleryIndex: build } = (await import(/* @vite-ignore */ builderPath)) as {
  buildGalleryIndex(dir: string, o?: { now?: Date; previous?: unknown; previousHashes?: unknown }): Built;
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function gallery(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wajha-gallery-'));
  dirs.push(dir);
  return dir;
}

/* Image headers: the bytes the app's header reader looks at, nothing to decode. */

/** Signature and IHDR chunk (8-bit RGBA). */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b.set([8, 6], 24);
  return b;
}

/** Start of image, a baseline frame header and end of image. */
function jpeg(width: number, height: number): Buffer {
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  b.writeUInt16BE(height, 7);
  b.writeUInt16BE(width, 9);
  return b;
}

/** An extended (VP8X) WebP header. */
function webp(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

function addTemplate(root: string, id: string, extra: Record<string, unknown> = {}, preview: Buffer | null = jpeg(1200, 860)): void {
  const dir = join(root, 'templates', id);
  mkdirSync(dir, { recursive: true });
  const t = { format: 'wajha.template', version: 1, id, name: `Name ${id}`, author: 'Someone', description: 'A test template.', category: 'bold', tags: ['a', 'b'], slides: [{ texts: {}, layouts: { tall: { background: null, elements: [] } } }], assets: {}, ...extra };
  writeFileSync(join(dir, 'template.json'), JSON.stringify(t));
  if (preview) writeFileSync(join(dir, 'preview.jpg'), preview);
}

/** Stores `bytes` in the template's assets folder under their content hash; returns the asset id. */
function addAsset(root: string, template: string, bytes: Buffer, ext = 'png'): string {
  const id = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const dir = join(root, 'templates', template, 'assets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, id), bytes);
  return id;
}

const assetMap = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { name: 'p.png', width: 1, height: 1, bytes: 1 }]));

/** Grows a file to `bytes` without writing them (a sparse file): over a limit at no cost. */
function inflate(path: string, bytes: number): void {
  truncateSync(path, bytes);
}

describe('buildGalleryIndex', () => {
  it('lists every template folder, sorted, with paths and sizes', () => {
    const root = gallery();
    addTemplate(root, 'zeta');
    addTemplate(root, 'alpha');
    const { index, problems } = build(root, { now: new Date('2026-01-01T00:00:00Z') });
    expect(problems).toEqual([]);
    expect(index.templates.map((e) => e.id)).toEqual(['alpha', 'zeta']);
    expect(index.templates[0]).toMatchObject({ version: 1, category: 'bold', tags: ['a', 'b'], assets: [] });
    expect(index.templates[0].bytes).toBeGreaterThan(jpeg(1, 1).length);
    expect(index.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps versions and updatedAt for unchanged files and bumps a changed template', () => {
    const root = gallery();
    addTemplate(root, 'one');
    addTemplate(root, 'two');
    const first = build(root, { now: new Date('2026-01-01T00:00:00Z'), previous: null, previousHashes: {} });
    const again = build(root, { now: new Date('2026-02-01T00:00:00Z'), previous: first.index, previousHashes: first.hashes });
    expect(again.index).toEqual(first.index);

    addTemplate(root, 'two', { name: 'Renamed' });
    const changed = build(root, { now: new Date('2026-03-01T00:00:00Z'), previous: again.index, previousHashes: again.hashes });
    expect(changed.index.templates.map((e) => [e.id, e.version])).toEqual([
      ['one', 1],
      ['two', 2],
    ]);
    expect(changed.index.updatedAt).toBe('2026-03-01T00:00:00.000Z');
    // Rebuilding after the bump does not bump again.
    const stable = build(root, { now: new Date('2026-04-01T00:00:00Z'), previous: changed.index, previousHashes: changed.hashes });
    expect(stable.index).toEqual(changed.index);
  });

  it('lists assets that match their content hash', () => {
    const root = gallery();
    const bytes = png(1, 1);
    const assetId = addAsset(root, 'pics', bytes);
    addTemplate(root, 'pics', { assets: assetMap([assetId]) });
    const { index, problems } = build(root);
    expect(problems).toEqual([]);
    expect(index.templates[0].assets).toEqual([`templates/pics/assets/${assetId}`]);
    const dir = join(root, 'templates', 'pics');
    const sizes = ['template.json', 'preview.jpg', `assets/${assetId}`].map((f) => statSync(join(dir, f)).size);
    expect(index.templates[0].bytes).toBe(sizes.reduce((a, b) => a + b));
  });

  it('reports what keeps a template from being published', () => {
    const root = gallery();
    addTemplate(root, 'no-preview', {}, null);
    addTemplate(root, 'wrong-folder', { id: 'other-id' });
    addTemplate(root, 'bad-category', { category: 'neon' });
    addTemplate(root, 'missing-asset', { assets: { [`${'a'.repeat(64)}.png`]: {} } });
    // The folder itself cannot be called "aux" on Windows, so only the id says it.
    addTemplate(root, 'device-name', { id: 'aux' });
    mkdirSync(join(root, 'templates', 'empty'), { recursive: true });
    const { problems } = build(root);
    expect(problems.join('\n')).toMatch(/no-preview: preview\.jpg is missing/);
    expect(problems.join('\n')).toMatch(/wrong-folder: the folder must be named after the template id "other-id"/);
    expect(problems.join('\n')).toMatch(/bad-category: "category" must be one of/);
    expect(problems.join('\n')).toMatch(/missing-asset: assets\/a{64}\.png is missing/);
    expect(problems.join('\n')).toMatch(/empty: template\.json is missing/);
    expect(problems.join('\n')).toMatch(/device-name: "id" must not be a name Windows reserves/);
  });

  it('works on an empty gallery', () => {
    const { index, problems } = build(gallery());
    expect(problems).toEqual([]);
    expect(index).toMatchObject({ format: 'wajha.gallery', version: 1, templates: [] });
  });
});

describe('image limits', () => {
  it('accepts PNG, JPEG and WebP files up to the limits the app applies', () => {
    const root = gallery();
    // Each exactly at a limit: the longest side and the pixel budget of images, the pixel budget and the bytes of previews.
    const ids = [addAsset(root, 'at-limits', png(16384, 4096)), addAsset(root, 'at-limits', jpeg(8192, 8192), 'jpg'), addAsset(root, 'at-limits', webp(1, 1), 'webp')];
    addTemplate(root, 'at-limits', { assets: assetMap(ids) }, png(4096, 1024));
    // The app reads the type from the content, so a WebP named preview.jpg is shown too.
    addTemplate(root, 'webp-preview', {}, webp(1200, 860));
    addTemplate(root, 'heavy-preview');
    inflate(join(root, 'templates', 'heavy-preview', 'preview.jpg'), THUMBNAIL_LIMITS.maxBytes);
    const { index, problems } = build(root);
    expect(problems).toEqual([]);
    expect(index.templates.find((e) => e.id === 'at-limits')?.assets).toHaveLength(3);
  });

  it('refuses a preview the app would not show, naming the file and the reason', () => {
    const root = gallery();
    addTemplate(root, 'too-heavy');
    inflate(join(root, 'templates', 'too-heavy', 'preview.jpg'), THUMBNAIL_LIMITS.maxBytes + 1);
    addTemplate(root, 'too-wide', {}, jpeg(4097, 100));
    addTemplate(root, 'too-many-pixels', {}, jpeg(3000, 2000));
    addTemplate(root, 'not-an-image', {}, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    addTemplate(root, 'no-size', {}, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const notShown = ', so the app would not show it';
    expect(build(root).problems).toEqual([
      `no-size: preview.jpg is a JPEG image whose header does not state its size${notShown}`,
      `not-an-image: preview.jpg is not a PNG, JPEG or WebP image${notShown}`,
      `too-heavy: preview.jpg is larger than 4 MB (the limit for template previews)${notShown}`,
      `too-many-pixels: preview.jpg is 3000 x 2000 px, more than template previews may have (4096 px per side, 2048 x 2048 px in all)${notShown}`,
      `too-wide: preview.jpg is 4097 x 100 px, more than template previews may have (4096 px per side, 2048 x 2048 px in all)${notShown}`,
    ]);
  });

  it('refuses images the app would not install, naming the file and the reason', () => {
    const root = gallery();
    const fine = addAsset(root, 'pics', png(10, 10));
    const wide = addAsset(root, 'pics', png(16385, 1));
    const many = addAsset(root, 'pics', png(9000, 9000));
    const renamed = addAsset(root, 'pics', jpeg(10, 10), 'png');
    const text = addAsset(root, 'pics', Buffer.from('not an image'), 'webp');
    // Apple's CgBI PNG puts a chunk before IHDR, so its header states no size the app trusts.
    const cgbiChunk = Buffer.concat([Buffer.from([0, 0, 0, 4]), Buffer.from('CgBI', 'latin1'), Buffer.alloc(8)]);
    const cgbi = addAsset(root, 'pics', Buffer.concat([png(1, 1).subarray(0, 8), cgbiChunk, png(1, 1).subarray(8)]));
    // Never read: the size on disk is enough to refuse it.
    const heavy = `${'f'.repeat(64)}.png`;
    writeFileSync(join(root, 'templates', 'pics', 'assets', heavy), png(10, 10));
    inflate(join(root, 'templates', 'pics', 'assets', heavy), IMAGE_LIMITS.maxBytes + 1);
    addTemplate(root, 'pics', { assets: assetMap([fine, wide, many, renamed, text, cgbi, heavy]) });

    const { index, problems } = build(root);
    const notInstalled = ', so the app would not install the template';
    expect([...problems].sort()).toEqual(
      [
        `pics: assets/${wide} is 16385 x 1 px, more than images may have (16384 px per side, 8192 x 8192 px in all)${notInstalled}`,
        `pics: assets/${many} is 9000 x 9000 px, more than images may have (16384 px per side, 8192 x 8192 px in all)${notInstalled}`,
        `pics: assets/${renamed} holds JPEG data, not PNG${notInstalled}`,
        `pics: assets/${text} is not a PNG, JPEG or WebP image${notInstalled}`,
        `pics: assets/${cgbi} is a PNG image whose header does not state its size${notInstalled}`,
        `pics: assets/${heavy} is larger than 100 MB (the limit for images)${notInstalled}`,
      ].sort(),
    );
    expect(index.templates[0].assets).not.toContain(`templates/pics/assets/${heavy}`);
  });
});

describe('the command line', () => {
  const script = join(import.meta.dirname, 'build-gallery-index.mjs');
  // Plain Node, as contributors run it: this also proves limits.ts loads without a bundler.
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('writes the index, then finds it up to date', () => {
    const root = gallery();
    addTemplate(root, 'alpha');
    expect(run('--check', '--gallery', root)).toMatchObject({ status: 1, stderr: expect.stringContaining('index.json is out of date') });
    expect(run('--gallery', root)).toMatchObject({ status: 0, stdout: expect.stringContaining('wrote index.json with 1 templates (alpha v1)') });
    expect(run('--check', '--gallery', root)).toMatchObject({ status: 0, stdout: expect.stringContaining('index.json is up to date') });
  });

  it('fails on a submission the app would refuse, writing nothing', () => {
    const root = gallery();
    addTemplate(root, 'too-wide', {}, jpeg(5000, 100));
    const result = run('--gallery', root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('too-wide: preview.jpg is 5000 x 100 px');
    expect(existsSync(join(root, 'index.json'))).toBe(false);
  });
});

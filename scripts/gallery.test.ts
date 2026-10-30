/**
 * The community gallery folder is consistent: index.json matches the
 * templates on disk (as scripts/build-gallery-index.mjs would write it),
 * every template is valid, ids match folder names, previews exist and are
 * small, and sample copy fits its text boxes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGalleryIndex, validateTemplate } from '../src/model/validate';
import type { GalleryIndex } from '../src/model/types';
import { BUILTIN_TEMPLATES } from '../src/templates';
import { overflowingTexts } from '../src/templates/testing/inspect.node';
import { projectFor, registerFonts } from '../src/templates/testing/render.node';

/** The parts of scripts/build-gallery-index.mjs (plain JavaScript) these tests use. */
interface IndexBuilder {
  INDEX_FILE: string;
  HASHES_FILE: string;
  buildGalleryIndex(dir: string): { index: GalleryIndex; hashes: unknown; problems: string[] };
  formatJson(value: unknown): string;
}
// A computed specifier keeps TypeScript from looking for declarations of the .mjs file.
const builderPath = './build-gallery-index.mjs';
const { HASHES_FILE, INDEX_FILE, buildGalleryIndex, formatJson } = (await import(/* @vite-ignore */ builderPath)) as IndexBuilder;

const GALLERY = join(import.meta.dirname, '..', 'gallery');
const TEMPLATES = join(GALLERY, 'templates');
const folders = readdirSync(TEMPLATES).filter((d) => !d.startsWith('.') && statSync(join(TEMPLATES, d)).isDirectory());
const index = JSON.parse(readFileSync(join(GALLERY, INDEX_FILE), 'utf8')) as GalleryIndex;

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

describe('community gallery', () => {
  it('has templates', () => {
    expect(folders.length).toBeGreaterThanOrEqual(4);
  });

  it('index.json is valid and exactly what build-gallery-index.mjs writes for the folder', () => {
    expect(validateGalleryIndex(index)).toEqual(index);
    const built = buildGalleryIndex(GALLERY);
    expect(built.problems).toEqual([]);
    expect(readFileSync(join(GALLERY, INDEX_FILE), 'utf8')).toBe(formatJson(built.index));
    expect(readFileSync(join(GALLERY, HASHES_FILE), 'utf8')).toBe(formatJson(built.hashes));
    expect(index.templates.map((e) => e.id).sort()).toEqual([...folders].sort());
  });

  it('docs/TEMPLATES.md shows a complete, valid template', () => {
    const doc = readFileSync(join(import.meta.dirname, '..', 'docs', 'TEMPLATES.md'), 'utf8');
    const block = /```json\n(\{\n  "format": "wajha\.template"[\s\S]*?)\n```/.exec(doc)?.[1];
    expect(block, 'the example template block').toBeTruthy();
    const example: unknown = JSON.parse(block ?? '{}');
    // Already canonical: the validator neither drops nor repairs anything.
    expect(validateTemplate(example)).toEqual(example);
  });

  it('never reuses a built-in template id', () => {
    const builtin = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
    for (const id of folders) expect(builtin.has(id), id).toBe(false);
  });

  for (const id of folders) {
    describe(id, () => {
      const dir = join(TEMPLATES, id);
      const json: unknown = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
      const entry = index.templates.find((e) => e.id === id);

      it('validates and is named after its folder', () => {
        const t = validateTemplate(json);
        expect(t.id).toBe(id);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.description.length).toBeGreaterThan(20);
        expect(t.slides.length).toBeGreaterThanOrEqual(3);
        for (const s of t.slides) expect(s.texts['en-US'], `${id} needs English sample copy`).toBeTruthy();
      });

      it('is listed with paths and sizes that match the files', () => {
        expect(entry).toBeTruthy();
        if (!entry) return;
        const t = validateTemplate(json);
        expect(entry).toMatchObject({ name: t.name, author: t.author, description: t.description, category: t.category, tags: t.tags });
        let bytes = 0;
        for (const rel of [entry.template, entry.preview, ...entry.assets]) {
          const path = join(GALLERY, rel);
          expect(existsSync(path), rel).toBe(true);
          bytes += statSync(path).size;
        }
        expect(entry.bytes).toBe(bytes);
        expect(entry.version).toBeGreaterThanOrEqual(1);
      });

      it('has a small 1200 x 860 JPEG preview', () => {
        const preview = readFileSync(join(dir, 'preview.jpg'));
        expect(preview.byteLength).toBeLessThan(400 * 1024);
        expect(jpegSize(preview)).toEqual({ width: 1200, height: 860 });
      });
    });
  }

  it('sample copy fits its text boxes (English, iPhone)', () => {
    registerFonts('latin');
    const problems: string[] = [];
    for (const id of folders) {
      const t = validateTemplate(JSON.parse(readFileSync(join(TEMPLATES, id, 'template.json'), 'utf8')));
      const project = projectFor(t, ['iphone'], ['en-US']);
      project.slides.forEach((_, i) => {
        for (const el of overflowingTexts(project, i, 'iphone', 'en-US')) problems.push(`${id} slide ${i + 1}: ${el}`);
      });
    }
    expect(problems).toEqual([]);
  });
});

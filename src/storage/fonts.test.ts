import { beforeEach, describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { createMemoryPlatform, setPlatform, type MemoryPlatform } from '../platform';
import { emptyBrandKit, putBrandFont, putBrandLogo, readBrandKit, writeBrandKit } from './brand';
import { exportProjectArchive, importProjectArchive } from './archive';
import { familyFromFileName, fontFamilyName, putProjectFont, readProjectFont, sniffFontExt, projectFontFile } from './fonts';
import { loadProject, saveProject } from './library';
import { makeProject, png } from './fixtures.node';

/**
 * A minimal TrueType file: an sfnt header with one table, "name", holding
 * `family` as name 1 (Windows, UTF-16BE, US English). Enough for the name
 * reader and the signature check; not drawable.
 */
function ttf(family: string, typographic?: string): Uint8Array {
  const records: Array<[number, string]> = [[1, family], ...(typographic ? ([[16, typographic]] as Array<[number, string]>) : [])];
  const strings = records.map(([, t]) => {
    const b = new Uint8Array(t.length * 2);
    for (let i = 0; i < t.length; i++) {
      b[i * 2] = t.charCodeAt(i) >> 8;
      b[i * 2 + 1] = t.charCodeAt(i) & 0xff;
    }
    return b;
  });
  const nameHeader = 6 + records.length * 12;
  const nameLength = nameHeader + strings.reduce((n, b) => n + b.length, 0);
  const nameAt = 12 + 16;
  const out = new Uint8Array(nameAt + nameLength);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, 1);
  out.set([0x6e, 0x61, 0x6d, 0x65], 12); // "name"
  v.setUint32(12 + 8, nameAt);
  v.setUint32(12 + 12, nameLength);
  v.setUint16(nameAt + 2, records.length);
  v.setUint16(nameAt + 4, nameHeader);
  let offset = 0;
  records.forEach(([id], i) => {
    const rec = nameAt + 6 + i * 12;
    v.setUint16(rec, 3);
    v.setUint16(rec + 2, 1);
    v.setUint16(rec + 4, 0x409);
    v.setUint16(rec + 6, id);
    v.setUint16(rec + 8, strings[i].length);
    v.setUint16(rec + 10, offset);
    out.set(strings[i], nameAt + nameHeader + offset);
    offset += strings[i].length;
  });
  return out;
}

const woff2 = () => new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);

let platform: MemoryPlatform;
beforeEach(() => {
  platform = createMemoryPlatform();
  setPlatform(platform);
});

describe('font files', () => {
  it('tells fonts by their signature and refuses everything else', () => {
    expect(sniffFontExt(ttf('Gilroy'))).toBe('ttf');
    expect(sniffFontExt(woff2())).toBe('woff2');
    expect(sniffFontExt(new TextEncoder().encode('OTTO and more bytes'))).toBe('otf');
    expect(sniffFontExt(png(4, 4))).toBeNull();
    expect(sniffFontExt(new TextEncoder().encode('ttcf collection....'))).toBeNull();
  });

  it("reads the family name from inside the file, preferring the typographic family", () => {
    expect(fontFamilyName(ttf('Gilroy Bold'))).toBe('Gilroy Bold');
    expect(fontFamilyName(ttf('Gilroy Bold', 'Gilroy'))).toBe('Gilroy');
    expect(fontFamilyName(woff2())).toBeNull();
    expect(familyFromFileName('Gilroy-ExtraBold.woff2')).toBe('Gilroy ExtraBold');
  });

  it('stores a font with a project under its hash and reads it back', async () => {
    const font = await putProjectFont('p1', ttf('Brandish'), 'brandish.ttf');
    expect(font.family).toBe('Brandish');
    expect(font.file).toMatch(/^[0-9a-f]{64}\.ttf$/);
    expect(await readProjectFont('p1', font.file)).toEqual(ttf('Brandish'));
    await expect(putProjectFont('p1', png(4, 4), 'logo.png')).rejects.toThrow(/not a font/);
  });
});

describe('fonts in project files', () => {
  it('carry a project font through a .wajha file and drop one whose file is missing', async () => {
    const font = await putProjectFont('src1', ttf('Brandish'), 'brandish.ttf');
    const ghost = { family: 'Ghost', file: `${'a'.repeat(64)}.ttf`, name: 'ghost.ttf' };
    await saveProject({ ...makeProject({ id: 'src1' }), fonts: [font, ghost] });
    const bytes = await exportProjectArchive('src1');
    expect(Object.keys(unzipSync(bytes))).toContain(`fonts/${font.file}`);

    const meta = await importProjectArchive(bytes);
    const imported = await loadProject(meta.id);
    expect(imported.fonts).toEqual([font]);
    expect(await platform.read(projectFontFile(meta.id, font.file))).toEqual(ttf('Brandish'));
  });
});

describe('brand kit', () => {
  it('starts empty and keeps what it is given, repaired', async () => {
    expect(await readBrandKit()).toEqual(emptyBrandKit());
    const font = await putBrandFont(ttf('Brandish'), 'brandish.ttf');
    const logo = await putBrandLogo(png(7, undefined, { width: 40, height: 20 }), 'logo.png');
    const saved = await writeBrandKit({ colors: ['#FF0000', '#ff0000', 'nope', '#00ff00'], fonts: [font, font], logo });
    expect(logo).toMatchObject({ width: 40, height: 20, name: 'logo.png' });
    expect(saved).toEqual({ colors: ['#ff0000', '#00ff00'], fonts: [font], logo });
    expect(await readBrandKit()).toEqual(saved);
  });

  it('deletes the files of fonts and logos it no longer lists', async () => {
    const font = await putBrandFont(ttf('Brandish'), 'brandish.ttf');
    await writeBrandKit({ ...emptyBrandKit(), fonts: [font] });
    expect((await platform.list('brand/files')).map((e) => e.name)).toEqual([font.file]);
    await writeBrandKit(emptyBrandKit());
    expect(await platform.list('brand/files')).toEqual([]);
  });

  it('refuses a logo that is not a safe image', async () => {
    await expect(putBrandLogo(ttf('x'), 'font.ttf')).rejects.toThrow(/not an image/);
  });
});

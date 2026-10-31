import { describe, expect, it, vi } from 'vitest';
import { blankProject } from './defaults';
import { assetId, assetInfo, sampleTemplate } from './fixtures.node';
import type { DeviceElement, ImageElement, Project, ShapeElement, TextElement } from './types';
import { CURRENT_VERSION, ValidationError, migrate, validateGalleryIndex, validateProject, validateTemplate } from './validate';

type Json = Record<string, unknown>;

/** Walks a dotted path ("slides.0.layouts.iphone") through plain JSON. */
function walk(root: unknown, path: string): { parent: Json; key: string } {
  const parts = path.split('.');
  let cur = root as Json;
  for (const part of parts.slice(0, -1)) cur = cur[part] as Json;
  return { parent: cur, key: parts[parts.length - 1] };
}
const at = (root: unknown, path: string): Json => {
  const { parent, key } = walk(root, path);
  return parent[key] as Json;
};
const list = (root: unknown, path: string): unknown[] => at(root, path) as unknown as unknown[];
function setAt(root: unknown, path: string, value: unknown): void {
  const { parent, key } = walk(root, path);
  parent[key] = value;
}
function delAt(root: unknown, path: string): void {
  const { parent, key } = walk(root, path);
  delete parent[key];
}
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const EL = 'slides.0.layouts.iphone.elements';

/** A JSON copy of a valid project with two assets, an image element and screenshots. */
function projectJson(): Json {
  const p = blankProject('Fixture', ['iphone', 'ipad'], ['en-US', 'ar-SA']);
  p.assets = { [assetId(1)]: assetInfo(1), [assetId(2)]: assetInfo(2) };
  p.slides[0].shots = { iphone: { main: { 'en-US': assetId(1), 'ar-SA': assetId(2) } } };
  p.slides[0].layouts.iphone!.elements.push({ id: 'img', kind: 'image', x: 0.5, y: 0.9, rotation: 0, opacity: 1, assetId: assetId(2), width: 0.2, cornerRadius: 0.1, shadow: null });
  p.slides[0].texts['en-US'] = { headline: 'Hello *world*', subtitle: 'Sub' };
  return copy(p) as unknown as Json;
}

function errorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e;
    throw e;
  }
  throw new Error('expected a ValidationError');
}

describe('validateProject: well-formed input', () => {
  it('returns a valid project unchanged', () => {
    const json = projectJson();
    expect(validateProject(json)).toEqual(json);
  });

  it('never returns the input objects themselves', () => {
    const json = projectJson();
    const out = validateProject(json);
    expect(out.slides[0]).not.toBe(list(json, 'slides')[0]);
    expect(out.theme).not.toBe(json.theme);
  });

  it('fills optional values with defaults', () => {
    const json = projectJson();
    for (const k of ['theme', 'export', 'assets', 'templateId', 'createdAt', 'updatedAt', 'slides.0.shots', `${EL}.0.rotation`, `${EL}.0.opacity`, `${EL}.0.shadow`]) delAt(json, k);
    const out = validateProject(json);
    expect(out.theme.background.fill.type).toBe('mesh');
    expect(out.export.format).toBe('png');
    expect(out.assets).toEqual({});
    expect(out.templateId).toBeNull();
    expect(out.createdAt).toBeGreaterThan(0);
    expect(out.updatedAt).toBe(out.createdAt);
    const d = out.slides[0].layouts.iphone!.elements[0] as DeviceElement;
    expect([d.rotation, d.opacity, d.shadow]).toEqual([0, 1, null]);
    // The image's asset went with `assets`: the element is dropped.
    expect(out.slides[0].layouts.iphone!.elements.some((e) => e.kind === 'image')).toBe(false);
  });

  it('drops unknown keys at every level', () => {
    const json = projectJson();
    for (const k of ['extra', 'theme.extra', 'slides.0.extra', 'slides.0.layouts.iphone.extra', `${EL}.0.extra`, `${EL}.0.style.extra`, 'export.extra', 'theme.background.extra']) setAt(json, k, 1);
    expect(JSON.stringify(validateProject(json))).not.toContain('extra');
  });
});

describe('validateProject: hostile input', () => {
  it('rejects non-objects and wrong formats', () => {
    for (const bad of [null, 1, 'x', [], undefined]) expect(errorOf(() => validateProject(bad)).path).toBe('$');
    expect(errorOf(() => validateProject({ ...projectJson(), format: 'wajha.template' })).path).toBe('format');
  });

  it('checks the version through the migrate hook', () => {
    const json = projectJson();
    expect(errorOf(() => validateProject({ ...json, version: 2 })).message).toMatch(/newer/);
    expect(errorOf(() => validateProject({ ...json, version: undefined })).path).toBe('version');
    for (const v of [0, -1, 1.5, '1', NaN]) expect(errorOf(() => validateProject({ ...json, version: v })).path).toBe('version');
    expect(CURRENT_VERSION).toBe(1);
    expect(migrate('project', { version: 1, a: 1 })).toEqual({ version: 1, a: 1 });
  });

  it('requires a path-safe project id', () => {
    for (const id of ['', '../x', 'a/b', 'x'.repeat(65), 5, null]) expect(errorOf(() => validateProject({ ...projectJson(), id })).path).toBe('id');
  });

  it('names the exact path of a wrong type', () => {
    const json = projectJson();
    setAt(json, 'slides.2.layouts.iphone.elements.0.width', '0.5');
    expect(errorOf(() => validateProject(json)).path).toBe('slides[2].layouts.iphone.elements[0].width');
    const j2 = projectJson();
    setAt(j2, 'slides.0.layouts.ipad.elements.1.style.color', 'red');
    expect(errorOf(() => validateProject(j2)).path).toBe('slides[0].layouts.ipad.elements[1].style.color');
    const j3 = projectJson();
    setAt(j3, 'slides.1.texts.en-US', { headline: 42 });
    expect(errorOf(() => validateProject(j3)).path).toBe('slides[1].texts.en-US.headline');
    const j4 = projectJson();
    // Asset ids contain a dot, so they are set directly rather than through a dotted path.
    at(j4, 'assets')[assetId(1)] = { ...assetInfo(1), width: 'wide' };
    expect(errorOf(() => validateProject(j4)).path).toBe(`assets["${assetId(1)}"].width`);
  });

  it('rejects unknown element kinds, frames, finishes, fills and patterns', () => {
    const cases: [string, unknown, string][] = [
      [`${EL}.0.kind`, 'video', 'slides[0].layouts.iphone.elements[0].kind'],
      [`${EL}.0.frame`, 'pixel', 'slides[0].layouts.iphone.elements[0].frame'],
      [`${EL}.0.style.finish`, 'gold', 'slides[0].layouts.iphone.elements[0].style.finish'],
      ['theme.background.fill.type', 'conic', 'theme.background.fill.type'],
      ['theme.background.pattern', { kind: 'stars', color: '#ffffff' }, 'theme.background.pattern.kind'],
      [`${EL}.1.style.align`, 'justify', 'slides[0].layouts.iphone.elements[1].style.align'],
      [`${EL}.1.key`, 'a b', 'slides[0].layouts.iphone.elements[1].key'],
      [`${EL}.1.valign`, 'center', 'slides[0].layouts.iphone.elements[1].valign'],
    ];
    for (const [path, value, expected] of cases) {
      const json = projectJson();
      setAt(json, path, value);
      expect(errorOf(() => validateProject(json)).path).toBe(expected);
    }
  });

  it('ignores prototype-pollution keys everywhere', () => {
    const text = JSON.stringify(projectJson())
      .replace('"texts":{', '"texts":{"__proto__":{"polluted":"yes"},"constructor":{"x":"y"},')
      .replace('"headline":', '"__proto__":"x","constructor":"y","headline":')
      .replace('"layouts":{', '"layouts":{"__proto__":{"elements":[]},"prototype":{},')
      .replace('"shots":{', '"shots":{"__proto__":{"main":{}},')
      .replace('"assets":{', '"assets":{"__proto__":{"id":"x"},');
    const out = validateProject(JSON.parse(text));
    const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
    expect(({} as Json).polluted).toBeUndefined();
    expect(own(out.slides[0].texts, '__proto__')).toBe(false);
    expect(own(out.slides[0].texts, 'constructor')).toBe(false);
    expect(own(out.slides[0].layouts, 'prototype')).toBe(false);
    for (const s of out.slides) {
      expect(Object.getPrototypeOf(s.texts)).toBe(Object.prototype);
      for (const t of Object.values(s.texts)) {
        expect(Object.getPrototypeOf(t)).toBe(Object.prototype);
        expect(own(t, 'constructor')).toBe(false);
      }
    }
    expect(Object.getPrototypeOf(out.assets)).toBe(Object.prototype);
    expect(Object.keys(out.assets)).toEqual([assetId(1), assetId(2)]);
  });

  it('refuses text keys and slots named after inherited members', () => {
    const json = projectJson();
    setAt(json, 'slides.0.texts.en-US', { headline: 'Hi', toString: 'x', valueOf: 'y' });
    setAt(json, 'slides.0.shots.iphone', { main: { 'en-US': assetId(1) }, hasOwnProperty: { 'en-US': assetId(2) } });
    const out = validateProject(json);
    expect(Object.keys(out.slides[0].texts['en-US'])).toEqual(['headline']);
    expect(Object.keys(out.slides[0].shots.iphone!)).toEqual(['main']);
    const els = list(json, EL) as Json[];
    const textIndex = els.findIndex((e) => e.kind === 'text');
    setAt(json, `${EL}.${textIndex}.key`, 'toString');
    expect(errorOf(() => validateProject(json)).path).toBe(`slides[0].layouts.iphone.elements[${textIndex}].key`);
  });

  it('never reads inherited properties', () => {
    const sneaky = Object.create({ name: 'Inherited', families: ['mac'] }) as Json;
    Object.assign(sneaky, projectJson());
    delete sneaky.name;
    delete sneaky.families;
    const out = validateProject(sneaky);
    expect(out.name).toBe('Untitled');
    expect(out.families).toEqual(['iphone']);
  });

  it('truncates huge arrays and strings quickly', () => {
    const json = projectJson();
    const slide = list(json, 'slides')[1];
    setAt(json, 'slides', Array.from({ length: 5000 }, () => copy(slide)));
    const text = list(json, 'slides.1.layouts.iphone.elements')[1];
    setAt(json, `${EL}`, Array.from({ length: 5000 }, () => copy(text)));
    setAt(json, 'theme.palette', Array.from({ length: 10_000 }, (_, i) => `#${(i % 4096).toString(16).padStart(3, '0')}`));
    setAt(json, 'name', 'n'.repeat(1_000_000));
    setAt(json, 'slides.0.texts.en-US', { headline: 'h'.repeat(100_000) });
    const t0 = performance.now();
    const out = validateProject(json);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(out.slides).toHaveLength(100);
    expect(out.slides[0].layouts.iphone!.elements).toHaveLength(200);
    expect(out.theme.palette.length).toBeLessThanOrEqual(32);
    expect(out.name).toHaveLength(200);
    expect(out.slides[0].texts['en-US'].headline).toHaveLength(2000);
  });

  it('clamps numbers and handles NaN / Infinity', () => {
    const json = projectJson();
    setAt(json, `${EL}.0.width`, 1e9);
    setAt(json, `${EL}.0.opacity`, -3);
    setAt(json, `${EL}.0.x`, -1e9);
    setAt(json, `${EL}.1.style.weight`, 5000);
    setAt(json, `${EL}.1.style.maxLines`, 2.6);
    setAt(json, 'export.jpegQuality', 0);
    const out = validateProject(json);
    const od = out.slides[0].layouts.iphone!.elements[0] as DeviceElement;
    expect([od.width, od.opacity, od.x]).toEqual([4, 0, -2]);
    const ot = out.slides[0].layouts.iphone!.elements[1] as TextElement;
    expect([ot.style.weight, ot.style.maxLines]).toEqual([1000, 3]);
    expect(out.export.jpegQuality).toBe(0.5);

    // Objects that never went through JSON can carry NaN and Infinity.
    const raw = projectJson();
    setAt(raw, `${EL}.0.rotation`, NaN);
    setAt(raw, `${EL}.0.width`, Infinity);
    const r = validateProject(raw).slides[0].layouts.iphone!.elements[0] as DeviceElement;
    expect(r.rotation).toBe(0);
    expect(r.width).toBe(4);
    const req = projectJson();
    setAt(req, `${EL}.0.x`, NaN);
    expect(errorOf(() => validateProject(req)).path).toBe('slides[0].layouts.iphone.elements[0].x');
  });

  it('drops dangling asset references instead of failing', () => {
    const json = projectJson();
    const assets = at(json, 'assets');
    delete assets[assetId(2)];
    assets['not-an-asset.png'] = assetInfo(5);
    const imageFill = (n: number) => ({ type: 'image', assetId: assetId(n), fit: 'cover', opacity: 1, blur: 0, tint: null });
    setAt(json, 'slides.0.layouts.iphone.background', { fill: imageFill(7), pattern: null });
    setAt(json, 'theme.background', { fill: imageFill(8), pattern: null });
    list(json, 'slides.0.layouts.ipad.elements').push({ id: 'sh', kind: 'shape', shape: 'rect', x: 0.5, y: 0.5, width: 0.2, height: 0.2, fill: imageFill(9) });
    const out = validateProject(json);
    expect(Object.keys(out.assets)).toEqual([assetId(1)]);
    expect(out.slides[0].shots).toEqual({ iphone: { main: { 'en-US': assetId(1) } } });
    expect(out.slides[0].layouts.iphone!.elements.some((e) => (e as ImageElement).assetId === assetId(2))).toBe(false);
    expect(out.slides[0].layouts.iphone!.background).toBeNull();
    expect(out.theme.background.fill.type).toBe('mesh');
    const shape = out.slides[0].layouts.ipad!.elements.find((e) => e.id === 'sh') as ShapeElement;
    expect(shape.fill).toEqual({ type: 'solid', color: '#808080' });
  });

  it('repairs families, languages and slides', () => {
    const json = projectJson();
    json.families = ['toaster', 'ipad', 'ipad', 'iphone'];
    json.languages = ['EN', 'ar-SA', 'ar-SA', 'x y'];
    const out = validateProject(json);
    expect(out.families).toEqual(['ipad', 'iphone']);
    expect(out.languages).toEqual(['ar-SA']);
    expect(validateProject({ ...json, families: [], languages: [], slides: [] })).toMatchObject({ families: ['iphone'], languages: ['en-US'] });
    expect(validateProject({ ...json, slides: [] }).slides).toHaveLength(1);
    expect(errorOf(() => validateProject({ ...json, families: [3] })).path).toBe('families[0]');
    expect(errorOf(() => validateProject({ ...json, slides: {} })).path).toBe('slides');
    expect(errorOf(() => validateProject({ ...json, slides: [null] })).path).toBe('slides[0]');
  });

  it('regenerates missing, malformed and duplicate ids', () => {
    const json = projectJson();
    const firstId = at(json, 'slides.0').id;
    setAt(json, 'slides.1.id', firstId);
    setAt(json, 'slides.2.id', 'bad id!');
    const deviceId = at(json, `${EL}.0`).id;
    setAt(json, `${EL}.1.id`, deviceId);
    delAt(json, `${EL}.2.id`);
    const out = validateProject(json);
    expect(new Set(out.slides.map((s) => s.id)).size).toBe(3);
    expect(out.slides[0].id).toBe(firstId);
    const ids = out.slides[0].layouts.iphone!.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(deviceId);
  });

  it('normalizes colours and keeps only valid record keys', () => {
    const json = projectJson();
    setAt(json, `${EL}.0.style.color`, '#ABC');
    setAt(json, 'slides.0.texts.bad lang', { headline: 'x' });
    setAt(json, 'slides.0.texts.de-DE', { 'bad key': 'x', ok: 'y', gone: null });
    setAt(json, 'slides.0.shots.toaster', { main: { 'en-US': assetId(1) } });
    setAt(json, 'slides.0.layouts.toaster', at(json, 'slides.0.layouts.iphone'));
    setAt(json, 'export', { sizes: ['ios-6.9', 'ios-6.9', 'retired-size'], languages: ['ar-SA', 'fr-FR'], format: 'jpeg', jpegQuality: 0.8, structure: 'fastlane' });
    const out = validateProject(json);
    expect((out.slides[0].layouts.iphone!.elements[0] as DeviceElement).style.color).toBe('#aabbcc');
    expect(Object.keys(out.slides[0].texts)).not.toContain('bad lang');
    expect(out.slides[0].texts['de-DE']).toEqual({ ok: 'y' });
    expect(Object.keys(out.slides[0].shots)).toEqual(['iphone']);
    expect(Object.keys(out.slides[0].layouts)).toEqual(['iphone', 'ipad']);
    expect(out.export).toEqual({ sizes: ['ios-6.9'], languages: ['ar-SA'], format: 'jpeg', jpegQuality: 0.8, structure: 'fastlane' });
  });

  it('keeps RTL and astral text intact, cleans control characters', () => {
    const json = projectJson();
    json.name = '  متجر 🛍️\n ';
    setAt(json, 'slides.0.texts.ar-SA', { headline: '‏تسوّق *الآن*\r\nبسهولة\u0000' });
    const out = validateProject(json);
    expect(out.name).toBe('متجر 🛍️');
    expect(out.slides[0].texts['ar-SA'].headline).toBe('‏تسوّق *الآن*\nبسهولة');
  });

  it('never stores unpaired surrogates', () => {
    const json = projectJson();
    json.name = 'My app \ud83d';
    setAt(json, 'slides.0.texts.en-US', { headline: '\udc00Hi 😀' });
    const out = validateProject(json);
    expect(out.name).toBe('My app �');
    expect(out.slides[0].texts['en-US'].headline).toBe('�Hi 😀');
  });

  it('turns invalid template ids into null', () => {
    expect(validateProject({ ...projectJson(), templateId: 'Not Kebab' }).templateId).toBeNull();
    expect(validateProject({ ...projectJson(), templateId: 'sunset-glow' }).templateId).toBe('sunset-glow');
    expect(errorOf(() => validateProject({ ...projectJson(), templateId: 7 })).path).toBe('templateId');
  });

  it('accepts a project produced by the factories for every family', () => {
    const p: Project = blankProject('x', ['iphone', 'ipad', 'android-phone', 'android-tablet', 'mac', 'play-feature'], ['en-US', 'ar-SA', 'zh-Hans']);
    expect(validateProject(copy(p))).toEqual(p);
  });
});

describe('validateTemplate', () => {
  const json = () => copy(sampleTemplate(3)) as unknown as Json;

  it('returns a valid template unchanged', () => {
    const t = json();
    expect(validateTemplate(t)).toEqual(t);
  });

  it('requires a kebab-case id and the template format', () => {
    expect(errorOf(() => validateTemplate({ ...json(), id: 'Sunset Glow' })).path).toBe('id');
    const device = errorOf(() => validateTemplate({ ...json(), id: 'nul' }));
    expect(device.path).toBe('id');
    expect(device.message).toMatch(/Windows reserves/);
    expect(errorOf(() => validateTemplate({ ...json(), format: 'wajha.project' })).path).toBe('format');
    expect(errorOf(() => validateTemplate({ ...json(), version: 9 })).path).toBe('version');
  });

  it('defaults optional fields and checks enums', () => {
    const t = json();
    for (const k of ['author', 'description', 'category', 'tags', 'assets']) delAt(t, k);
    expect(validateTemplate(t)).toMatchObject({ author: '', description: '', category: 'minimal', tags: [], assets: {} });
    expect(errorOf(() => validateTemplate({ ...json(), category: 'neon' })).path).toBe('category');
    expect(validateTemplate({ ...json(), tags: ['A', 'a', 'A', ''] }).tags).toEqual(['A', 'a']);
    expect(errorOf(() => validateTemplate({ ...json(), tags: [1] })).path).toBe('tags[0]');
  });

  it('derives a missing tall layout and English sample copy', () => {
    const t = json();
    delAt(t, 'slides.0.layouts.tall');
    delAt(t, 'slides.1.texts.en-US');
    const out = validateTemplate(t);
    expect(out.slides[0].layouts.tall.elements.find((e) => e.kind === 'device')).toMatchObject({ frame: 'iphone' });
    expect(out.slides[1].texts['en-US']).toEqual(out.slides[1].texts.ar);
    const none = json();
    setAt(none, 'slides.2.layouts', {});
    expect(errorOf(() => validateTemplate(none)).path).toBe('slides[2].layouts.tall');
    const missing = json();
    delAt(missing, 'slides.2.layouts');
    expect(errorOf(() => validateTemplate(missing)).path).toBe('slides[2].layouts');
  });

  it('keeps at most 10 slides and repairs an empty list', () => {
    const t = json();
    const first = list(t, 'slides')[0];
    setAt(t, 'slides', Array.from({ length: 30 }, () => copy(first)));
    expect(validateTemplate(t).slides).toHaveLength(10);
    expect(validateTemplate({ ...json(), slides: [] }).slides).toHaveLength(1);
  });

  it('drops references to assets the template does not carry', () => {
    const t = json();
    list(t, 'slides.0.layouts.tall.elements').push({ id: 'i', kind: 'image', x: 0.5, y: 0.5, assetId: assetId(4), width: 0.3 });
    t.assets = { [assetId(5)]: assetInfo(5) };
    list(t, 'slides.1.layouts.tall.elements').push({ id: 'i2', kind: 'image', x: 0.5, y: 0.5, assetId: assetId(5), width: 0.3 });
    const out = validateTemplate(t);
    expect(out.slides[0].layouts.tall.elements.some((e) => e.id === 'i')).toBe(false);
    expect(out.slides[1].layouts.tall.elements.some((e) => e.id === 'i2')).toBe(true);
  });
});

describe('validateGalleryIndex', () => {
  const entry = (id: string) => ({
    id,
    name: `Name ${id}`,
    author: 'Someone',
    description: 'Nice',
    category: 'bold',
    tags: ['x'],
    version: 3,
    template: `templates/${id}/template.json`,
    preview: `templates/${id}/preview.jpg`,
    assets: [`templates/${id}/assets/${assetId(1)}`],
    bytes: 1234,
  });
  const index = (): Json => copy({ format: 'wajha.gallery', version: 1, updatedAt: '2026-10-01T00:00:00Z', templates: [entry('a'), entry('b')] });

  it('returns a valid index unchanged', () => {
    expect(validateGalleryIndex(index())).toEqual(index());
  });

  it('skips entries with unsafe paths and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const bad of ['../secret', '/abs/path.json', 'https://evil.com/x.json', 'a//b', 'a\\b', 'a/./b']) {
      const i = index();
      setAt(i, 'templates.1.template', bad);
      expect(validateGalleryIndex(i).templates.map((t) => t.id)).toEqual(['a']);
    }
    const i = index();
    setAt(i, 'templates.0.assets', ['ok/a.png', '../x.png']);
    expect(validateGalleryIndex(i).templates.map((t) => t.id)).toEqual(['b']);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('templates[0].assets[1]'));
    warn.mockRestore();
  });

  it('drops duplicates, caps the list and defaults optional fields', () => {
    const i = index();
    list(i, 'templates').push(entry('a'));
    delAt(i, 'templates.1.version');
    delAt(i, 'templates.1.bytes');
    delAt(i, 'updatedAt');
    const out = validateGalleryIndex(i);
    expect(out.templates.map((t) => t.id)).toEqual(['a', 'b']);
    expect(out.templates[1]).toMatchObject({ version: 1, bytes: 0 });
    expect(out.updatedAt).toBe('');
    const huge = index();
    setAt(huge, 'templates', Array.from({ length: 5000 }, (_, k) => entry(`t${k}`)));
    expect(validateGalleryIndex(huge).templates).toHaveLength(1000);
  });

  it('requires format, version and a template list', () => {
    expect(errorOf(() => validateGalleryIndex({ ...index(), format: 'x' })).path).toBe('format');
    expect(errorOf(() => validateGalleryIndex({ ...index(), version: 2 })).path).toBe('version');
    expect(errorOf(() => validateGalleryIndex({ ...index(), templates: 'nope' })).path).toBe('templates');
  });

  it('skips an entry without a valid id or template/preview paths, so one broken entry cannot hide the gallery', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i = index();
    delAt(i, 'templates.0.preview');
    expect(validateGalleryIndex(i).templates.map((t) => t.id)).toEqual(['b']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('templates[0].preview'));
    const j = index();
    setAt(j, 'templates.0.id', 'Bad Id');
    setAt(j, 'templates.1', 'not an entry');
    expect(validateGalleryIndex(j).templates).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe('ValidationError', () => {
  it('carries the path and a readable message', () => {
    const e = errorOf(() => validateProject({ ...projectJson(), id: '' }));
    expect(e.name).toBe('ValidationError');
    expect(e.message).toMatch(/^id: /);
    expect(e).toBeInstanceOf(Error);
  });
});

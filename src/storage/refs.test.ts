import { describe, expect, it } from 'vitest';
import { collectAssetRefs, keepAssets, usedAssetIds, withPresentAssets } from './refs';
import { imageFill, makeProject, makeSlide, makeTemplate } from './fixtures.node';

const id = (c: string, ext = 'png') => `${c.repeat(64)}.${ext}`;

describe('collectAssetRefs', () => {
  it('finds ids in values and keys anywhere in the document', () => {
    const project = makeProject({
      theme: { ...makeProject().theme, background: { fill: imageFill(id('1')), pattern: null } },
      slides: [makeSlide('s1', { shots: { ipad: { main: { 'ar-SA': id('2', 'jpg') } } } })],
      assets: { [id('3', 'webp')]: { id: id('3', 'webp'), name: 'x', width: 1, height: 1, bytes: 1, addedAt: 1 } },
    });
    expect([...collectAssetRefs(project)].sort()).toEqual([id('1'), id('2', 'jpg'), id('3', 'webp')].sort());
  });

  it('ignores strings that only look similar', () => {
    const refs = collectAssetRefs({
      a: `${'a'.repeat(63)}.png`,
      b: `${'A'.repeat(64)}.png`,
      c: `${'a'.repeat(64)}.gif`,
      d: `../${'a'.repeat(64)}.png`,
      e: 'headline',
      f: 42,
      g: null,
      h: true,
    });
    expect(refs.size).toBe(0);
  });

  it('works on templates and plain values', () => {
    expect(collectAssetRefs(makeTemplate()).size).toBe(0);
    expect(collectAssetRefs(id('9'))).toEqual(new Set([id('9')]));
    expect(collectAssetRefs(undefined).size).toBe(0);
  });

  it('survives cycles and very deep nesting', () => {
    const cyclic: Record<string, unknown> = { asset: id('4') };
    cyclic.self = cyclic;
    expect(collectAssetRefs(cyclic)).toEqual(new Set([id('4')]));
    let deep: unknown = id('5');
    for (let i = 0; i < 50_000; i++) deep = [deep];
    expect(collectAssetRefs(deep)).toEqual(new Set([id('5')]));
  });
});

const entry = (assetId: string) => ({ id: assetId, name: 'x.png', width: 1, height: 1, bytes: 1, addedAt: 1 });

describe('usedAssetIds', () => {
  it('counts every reference but not the registry, which only describes files', () => {
    const project = makeProject({
      slides: [makeSlide('s1', { shots: { iphone: { main: { 'en-US': id('1') } } } })],
      // id('2') was replaced: only the registry still names it.
      assets: { [id('1')]: entry(id('1')), [id('2')]: entry(id('2')) },
    });
    expect(usedAssetIds(project)).toEqual(new Set([id('1')]));
    expect(usedAssetIds(makeTemplate({ assets: { [id('3')]: entry(id('3')) } })).size).toBe(0);
  });
});

describe('keepAssets', () => {
  it('drops registry entries outside the set, and returns the same object when there are none', () => {
    const project = makeProject({ assets: { [id('1')]: entry(id('1')), [id('2')]: entry(id('2')) } });
    expect(keepAssets(project, new Set([id('1'), id('2'), id('3')]))).toBe(project);
    const kept = keepAssets(project, new Set([id('2')]));
    expect(kept.assets).toEqual({ [id('2')]: entry(id('2')) });
    expect(Object.keys(project.assets)).toHaveLength(2);
  });
});

describe('withPresentAssets', () => {
  it('limits the registry of parsed JSON to the files that are present', () => {
    // As parsed from a hostile file: "__proto__" is an own key there.
    const json: unknown = JSON.parse(
      JSON.stringify({ format: 'wajha.project', assets: { [id('1')]: entry(id('1')), [id('2')]: entry(id('2')) } }).replace('"assets":{', '"assets":{"__proto__":{"polluted":true},'),
    );
    const out = withPresentAssets(json, new Set([id('2')])) as { assets: Record<string, unknown> };
    expect(Object.keys(out.assets)).toEqual([id('2')]);
    expect(Object.getPrototypeOf(out.assets)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(withPresentAssets(json, new Map([[id('1'), 0]]))).toMatchObject({ format: 'wajha.project', assets: { [id('1')]: entry(id('1')) } });
  });

  it('leaves anything without a registry to the validator', () => {
    expect(withPresentAssets(null, new Set())).toBeNull();
    expect(withPresentAssets([1], new Set())).toEqual([1]);
    expect(withPresentAssets({ assets: 'nope' }, new Set())).toEqual({ assets: 'nope' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  RANGES,
  clampToRange,
  cleanFontName,
  cleanName,
  cleanText,
  isAssetId,
  isFamilyId,
  isId,
  isLangCode,
  isSafeKey,
  isSafeRelPath,
  isTemplateId,
  isWindowsDeviceName,
  normalizeColor,
  truncate,
  uniqueFamilies,
  uniqueLanguages,
  wellFormed,
} from './rules';
import { assetId } from './fixtures.node';

describe('identifier rules', () => {
  it('accepts ids that are safe path segments', () => {
    expect(isId('abc123')).toBe(true);
    expect(isId('s_x-1')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId('a/b')).toBe(false);
    expect(isId('..')).toBe(false);
    expect(isId('a'.repeat(64))).toBe(true);
    expect(isId('a'.repeat(65))).toBe(false);
    expect(isId(42)).toBe(false);
  });

  it('accepts kebab-case template ids only', () => {
    expect(isTemplateId('sunset-glow')).toBe(true);
    expect(isTemplateId('t0abc')).toBe(true);
    expect(isTemplateId('Sunset')).toBe(false);
    expect(isTemplateId('-a')).toBe(false);
    expect(isTemplateId('a--b')).toBe(false);
    expect(isTemplateId('a-')).toBe(false);
    expect(isTemplateId(`${'a'.repeat(65)}`)).toBe(false);
  });

  it('refuses template ids Windows cannot use as a folder name', () => {
    for (const id of ['con', 'prn', 'aux', 'nul', 'com1', 'com0', 'lpt1', 'lpt9']) expect(isTemplateId(id), id).toBe(false);
    for (const name of ['CON', 'Aux', 'nUl', 'COM3', 'lpt2']) expect(isWindowsDeviceName(name), name).toBe(true);
    for (const id of ['console', 'con-app', 'aux2', 'com10', 'lpt', 'null']) expect(isTemplateId(id), id).toBe(true);
  });

  it('checks asset ids against the content-addressed format', () => {
    expect(isAssetId(assetId(1))).toBe(true);
    expect(isAssetId(assetId(1, 'jpg'))).toBe(true);
    expect(isAssetId(assetId(1, 'webp'))).toBe(true);
    expect(isAssetId(`${'A'.repeat(64)}.png`)).toBe(false);
    expect(isAssetId(`${'a'.repeat(64)}.gif`)).toBe(false);
    expect(isAssetId(`${'a'.repeat(63)}.png`)).toBe(false);
    expect(isAssetId('../x.png')).toBe(false);
  });

  it('knows catalog families and nothing from the prototype', () => {
    expect(isFamilyId('iphone')).toBe(true);
    expect(isFamilyId('play-feature')).toBe(true);
    expect(isFamilyId('watch')).toBe(false);
    expect(isFamilyId('toString')).toBe(false);
    expect(isFamilyId('__proto__')).toBe(false);
  });

  it('accepts BCP-47 shaped language codes', () => {
    for (const ok of ['en-US', 'ar', 'zh-Hans', 'es-419', 'fil', 'sr-Latn-RS']) expect(isLangCode(ok)).toBe(true);
    for (const bad of ['EN', 'e', 'en_US', 'en-', 'english', '', 'en-US-'.repeat(10), 7]) expect(isLangCode(bad)).toBe(false);
  });

  it('rejects prototype keys as record keys', () => {
    expect(isSafeKey('headline')).toBe(true);
    expect(isSafeKey('main.2')).toBe(true);
    expect(isSafeKey('__proto__')).toBe(false);
    expect(isSafeKey('constructor')).toBe(false);
    expect(isSafeKey('prototype')).toBe(false);
    expect(isSafeKey('has space')).toBe(false);
    expect(isSafeKey('a'.repeat(41))).toBe(false);
  });

  it('rejects every inherited member name, so lookups never find a function', () => {
    for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__lookupSetter__']) {
      expect(isSafeKey(key), key).toBe(false);
    }
    // Only exact names: keys that merely contain one stay usable.
    expect(isSafeKey('toString2')).toBe(true);
    expect(isSafeKey('my.valueOf')).toBe(true);
  });
});

describe('colours', () => {
  it('normalizes to lower-case #rrggbb[aa]', () => {
    expect(normalizeColor('#FFAA00')).toBe('#ffaa00');
    expect(normalizeColor('#ffaa0080')).toBe('#ffaa0080');
    expect(normalizeColor('#fa0')).toBe('#ffaa00');
    expect(normalizeColor('#fa08')).toBe('#ffaa0088');
  });

  it('rejects everything else', () => {
    for (const bad of ['ffaa00', '#ffaa0', 'red', 'rgb(0,0,0)', '#gggggg', '', ' #ffffff', '#ffffffff00', null, 3]) {
      expect(normalizeColor(bad)).toBeNull();
    }
  });
});

describe('numbers', () => {
  it('clamps, rounds integers and survives NaN and Infinity', () => {
    expect(clampToRange(5, RANGES.unit)).toBe(1);
    expect(clampToRange(-5, RANGES.unit)).toBe(0);
    expect(clampToRange(Infinity, RANGES.position)).toBe(3);
    expect(clampToRange(-Infinity, RANGES.position)).toBe(-2);
    expect(clampToRange(NaN, RANGES.unit)).toBe(0);
    expect(clampToRange(450.6, RANGES.fontWeight)).toBe(451);
    expect(clampToRange(2.4, RANGES.maxLines)).toBe(2);
  });
});

describe('strings', () => {
  it('truncates by code points without splitting surrogate pairs', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 3)).toBe('hel');
    const emoji = '😀😀😀';
    expect(truncate(emoji, 2)).toBe('😀😀');
    expect(truncate(`a${emoji}`, 2)).toBe('a😀');
    expect(truncate('عربي نص', 4)).toBe('عربي');
  });

  it('cleans names: single line, trimmed, limited', () => {
    expect(cleanName('  My\nApp\t ')).toBe('My App');
    expect(cleanName('a\u0000b')).toBe('a b');
    expect(cleanName('x'.repeat(500))).toHaveLength(200);
    expect(cleanName('x'.repeat(10_000_000)).length).toBe(200);
    expect(cleanName('واجهة')).toBe('واجهة');
  });

  it('cleans texts: keeps line breaks and bidi marks, drops other controls', () => {
    expect(cleanText('a\r\nb\rc')).toBe('a\nb\nc');
    expect(cleanText('a\u0000\u0007b')).toBe('ab');
    expect(cleanText('‏مرحبا⁦x⁩')).toBe('‏مرحبا⁦x⁩');
    expect(cleanText('y'.repeat(5000))).toHaveLength(2000);
  });

  it('replaces unpaired surrogates, keeps pairs', () => {
    expect(wellFormed('ok 😀 واجهة')).toBe('ok 😀 واجهة');
    expect(wellFormed('a\ud83d')).toBe('a\ufffd');
    expect(wellFormed('\ude00b\ud83d\ude00')).toBe('\ufffdb😀');
    expect(wellFormed('\udc00\ud800')).toBe('\ufffd\ufffd');
    expect(cleanName('My app \ud83d')).toBe('My app \ufffd');
    expect(cleanText('Hi \udc00 there')).toBe('Hi \ufffd there');
    expect(cleanFontName('Inter\ud800', 'X')).toBe('Inter\ufffd');
    // The fast cut of huge input can split a pair; the half left over is replaced too.
    expect(cleanName(`${' '.repeat(863)}😀x`)).toBe('\ufffd');
  });

  it('makes font names safe for canvas font strings', () => {
    expect(cleanFontName('Inter Variable', 'X')).toBe('Inter Variable');
    expect(cleanFontName('Evil", serif; x{', 'X')).toBe('Evil, serif x');
    expect(cleanFontName('   ', 'Fallback')).toBe('Fallback');
    expect(cleanFontName('f'.repeat(300), 'X')).toHaveLength(100);
  });

  it('only accepts tame relative gallery paths', () => {
    expect(isSafeRelPath('templates/sunset-glow/template.json')).toBe(true);
    expect(isSafeRelPath('preview.jpg')).toBe(true);
    for (const bad of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a/./b', 'https://x.com/a', 'a\\b', 'a b', 'a/'.repeat(200)]) {
      expect(isSafeRelPath(bad)).toBe(false);
    }
  });
});

describe('lists', () => {
  it('keeps valid unique families in order', () => {
    expect(uniqueFamilies(['ipad', 'iphone', 'ipad', 'nope', 3, 'mac'])).toEqual(['ipad', 'iphone', 'mac']);
    expect(uniqueFamilies(null)).toEqual([]);
  });

  it('keeps valid unique languages in order, bounded', () => {
    expect(uniqueLanguages(['en-US', 'ar-SA', 'en-US', 'bad code'])).toEqual(['en-US', 'ar-SA']);
    const many = Array.from({ length: 500 }, (_, i) => `x${String.fromCharCode(97 + (i % 26))}-${i}${i}`);
    expect(uniqueLanguages(many).length).toBeLessThanOrEqual(100);
  });
});

import { describe, expect, it } from 'vitest';
import { ALL_SIZES, FAMILIES, sizeById } from '../model/catalog';
import type { FamilyId } from '../model/types';
import { deliverScreenshotSet, exportPath, MAX_SEGMENT_LENGTH, sanitizeSegment, storeLocale } from './paths';
import type { ExportJob } from './types';

const job = (family: FamilyId, sizeId: string, lang: string, slideIndex = 0): Omit<ExportJob, 'path'> => ({
  family,
  sizeId,
  width: 1,
  height: 1,
  lang,
  slideIndex,
});

describe('sanitizeSegment', () => {
  it('keeps ordinary names, including RTL scripts and emoji', () => {
    expect(sanitizeSegment('My App')).toBe('My App');
    expect(sanitizeSegment('iPhone 6.9 (1290)')).toBe('iPhone 6.9 (1290)');
    expect(sanitizeSegment('واجهة')).toBe('واجهة');
    expect(sanitizeSegment('חנות')).toBe('חנות');
    expect(sanitizeSegment('Fun 🎉 app 👨\u200d👩\u200d👧')).toBe('Fun 🎉 app 👨\u200d👩\u200d👧');
    expect(sanitizeSegment('en-US')).toBe('en-US');
  });

  it('strips characters Windows and POSIX forbid', () => {
    expect(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(sanitizeSegment('Notes: Pro / Lite')).toBe('Notes Pro Lite');
    expect(sanitizeSegment('../../etc/passwd')).toBe('etcpasswd');
  });

  it('removes control and bidi-override characters but keeps joiners', () => {
    expect(sanitizeSegment('a\u0000b\u0007c\u007fd\u009be')).toBe('abcde');
    // RLO "spoofs" extensions: "photo\u202egnp.exe" displays as "photoexe.png".
    expect(sanitizeSegment('photo\u202egnp.exe')).toBe('photognp.exe');
    expect(sanitizeSegment('\u200fسلام\u200e\u2066x\u2069\u061c')).toBe('سلامx');
    expect(sanitizeSegment('می\u200cخواهم')).toBe('می\u200cخواهم');
  });

  it('drops unpaired surrogates, which no file system accepts, and keeps pairs', () => {
    expect(sanitizeSegment('My app \ud83d')).toBe('My app');
    expect(sanitizeSegment('a\udc00b\ud83d\ude00')).toBe('ab😀');
    expect(sanitizeSegment('\ud800')).toBe('Untitled');
  });

  it('collapses whitespace, including newlines, tabs and exotic spaces', () => {
    expect(sanitizeSegment('  a \t\n b\u00a0\u3000c  ')).toBe('a b c');
    expect(sanitizeSegment('a / b')).toBe('a b');
    expect(sanitizeSegment('\ufeffname')).toBe('name');
  });

  it('trims leading and trailing dots and spaces', () => {
    expect(sanitizeSegment('.hidden')).toBe('hidden');
    expect(sanitizeSegment('name. . ')).toBe('name');
    expect(sanitizeSegment(' ..x.. ')).toBe('x');
    expect(sanitizeSegment('v1.2')).toBe('v1.2');
  });

  it('never returns an empty name', () => {
    for (const s of ['', ' ', '.', '..', '...', '///', '\u0000', '\u202e', ' . / . ']) expect(sanitizeSegment(s), JSON.stringify(s)).toBe('Untitled');
  });

  it('renames Windows device names, with or without extension', () => {
    expect(sanitizeSegment('CON')).toBe('CON_');
    expect(sanitizeSegment('nul')).toBe('nul_');
    expect(sanitizeSegment('Aux.txt')).toBe('Aux_.txt');
    expect(sanitizeSegment('com1.tar.gz')).toBe('com1_.tar.gz');
    expect(sanitizeSegment('LPT9')).toBe('LPT9_');
    expect(sanitizeSegment('COM¹')).toBe('COM¹_');
    expect(sanitizeSegment('con .png')).toBe('con_.png');
    expect(sanitizeSegment('CONSOLE')).toBe('CONSOLE');
    expect(sanitizeSegment('com10')).toBe('com10');
  });

  it('limits length to 80 code units without splitting characters', () => {
    expect(sanitizeSegment('a'.repeat(200))).toBe('a'.repeat(MAX_SEGMENT_LENGTH));
    const emoji = sanitizeSegment('😀'.repeat(60));
    expect(emoji).toBe('😀'.repeat(40));
    const family = '👨\u200d👩\u200d👧\u200d👦'; // 11 code units, one grapheme
    const cut = sanitizeSegment(family.repeat(10));
    expect(cut).toBe(family.repeat(7));
    expect(cut.length).toBeLessThanOrEqual(MAX_SEGMENT_LENGTH);
    // A truncation that ends on a space or dot is trimmed again.
    expect(sanitizeSegment(`${'b'.repeat(79)} tail`)).toBe('b'.repeat(79));
    // Always within 255 UTF-8 bytes, the strictest common file system limit.
    for (const s of ['é'.repeat(300), '中'.repeat(300), '😀'.repeat(300), 'ع'.repeat(300)]) {
      expect(new TextEncoder().encode(sanitizeSegment(s)).length).toBeLessThanOrEqual(255);
    }
  });

  it('normalises to NFC so composed and decomposed names agree', () => {
    expect(sanitizeSegment('Café')).toBe('Café');
    expect(sanitizeSegment('Café')).toBe(sanitizeSegment('Café'));
  });

  it('is idempotent', () => {
    for (const s of ['CON', ' a/b ', '😀'.repeat(60), '..x..', 'Notes: Pro', 'ok']) expect(sanitizeSegment(sanitizeSegment(s))).toBe(sanitizeSegment(s));
  });
});

describe('exportPath', () => {
  it('builds "stores" paths per store', () => {
    expect(exportPath('stores', job('iphone', 'ios-6.9', 'en-US'), 'png', 'App')).toBe('App Store/en-US/iPhone 6.9/01.png');
    expect(exportPath('stores', job('iphone', 'ios-6.9-b', 'ar-SA', 9), 'jpg', 'App')).toBe('App Store/ar-SA/iPhone 6.9 (1290)/10.jpg');
    expect(exportPath('stores', job('ipad', 'ipad-13', 'zh-Hans', 2), 'png', 'App')).toBe('App Store/zh-Hans/iPad 13/03.png');
    expect(exportPath('stores', job('mac', 'mac-2880', 'de-DE'), 'png', 'App')).toBe('App Store/de-DE/Mac 2880/01.png');
    expect(exportPath('stores', job('android-phone', 'play-phone', 'he', 4), 'png', 'App')).toBe('Google Play/iw-IL/Phone/05.png');
    expect(exportPath('stores', job('android-tablet', 'play-tablet-10', 'es-MX'), 'jpg', 'App')).toBe('Google Play/es-419/Tablet 10/01.jpg');
    expect(exportPath('stores', job('play-feature', 'play-feature', 'ar-SA'), 'png', 'App')).toBe('Google Play/ar/Feature graphic.png');
  });

  it('builds fastlane deliver and supply paths', () => {
    expect(exportPath('fastlane', job('iphone', 'ios-6.9', 'en-US'), 'png', 'App')).toBe('fastlane/screenshots/en-US/01_ios-6.9.png');
    expect(exportPath('fastlane', job('ipad', 'ipad-12.9', 'fr-CA', 7), 'jpg', 'App')).toBe('fastlane/screenshots/fr-CA/08_ipad-12.9.jpg');
    expect(exportPath('fastlane', job('android-phone', 'play-phone', 'de-DE', 1), 'png', 'App')).toBe('fastlane/metadata/android/de-DE/images/phoneScreenshots/02.png');
    expect(exportPath('fastlane', job('android-tablet', 'play-tablet-7', 'ja'), 'png', 'App')).toBe('fastlane/metadata/android/ja-JP/images/sevenInchScreenshots/01.png');
    expect(exportPath('fastlane', job('android-tablet', 'play-tablet-10', 'ja'), 'png', 'App')).toBe('fastlane/metadata/android/ja-JP/images/tenInchScreenshots/01.png');
    expect(exportPath('fastlane', job('play-feature', 'play-feature', 'fa'), 'jpg', 'App')).toBe('fastlane/metadata/android/fa/images/featureGraphic.jpg');
  });

  it('builds flat paths from the size id and the project language code', () => {
    expect(exportPath('flat', job('iphone', 'ios-6.9', 'en-US'), 'png', 'App')).toBe('ios-6.9/en-US/01.png');
    expect(exportPath('flat', job('android-phone', 'play-phone', 'he', 11), 'png', 'App')).toBe('play-phone/he/12.png');
    expect(exportPath('flat', job('play-feature', 'play-feature', 'ar-SA'), 'png', 'App')).toBe('play-feature/ar-SA/01.png');
    // Flat paths need no store locale, so languages a store lacks still have a path.
    expect(exportPath('flat', job('iphone', 'ios-6.9', 'fa'), 'png', 'App')).toBe('ios-6.9/fa/01.png');
  });

  it('sanitises language codes that come from user data', () => {
    const evil = job('iphone', 'ios-6.9', '../../evil');
    expect(exportPath('flat', evil, 'png', 'App')).toBe('ios-6.9/evil/01.png');
    expect(exportPath('stores', evil, 'png', 'App')).toBe('App Store/evil/iPhone 6.9/01.png');
    expect(exportPath('fastlane', job('android-phone', 'play-phone', 'a\\b:c'), 'png', 'App')).toBe('fastlane/metadata/android/abc/images/phoneScreenshots/01.png');
    expect(exportPath('flat', job('iphone', 'ios-6.9', ''), 'png', 'App')).toBe('ios-6.9/Untitled/01.png');
    for (const structure of ['stores', 'fastlane', 'flat'] as const) {
      const path = exportPath(structure, evil, 'png', '../Project');
      expect(path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..'), path).toBe(true);
      expect(path.startsWith('/')).toBe(false);
    }
  });

  it('ignores the project name (the export target folder carries it)', () => {
    const a = exportPath('stores', job('iphone', 'ios-6.9', 'en-US'), 'png', 'One');
    expect(exportPath('stores', job('iphone', 'ios-6.9', 'en-US'), 'png', 'Two: / other')).toBe(a);
  });

  it('pads slide numbers to two digits and keeps larger ones', () => {
    expect(exportPath('flat', job('iphone', 'ios-6.9', 'en-US', 0), 'png', 'x')).toMatch(/\/01\.png$/);
    expect(exportPath('flat', job('iphone', 'ios-6.9', 'en-US', 8), 'png', 'x')).toMatch(/\/09\.png$/);
    expect(exportPath('flat', job('iphone', 'ios-6.9', 'en-US', 99), 'png', 'x')).toMatch(/\/100\.png$/);
  });

  it('rejects jobs it cannot name', () => {
    expect(() => exportPath('stores', job('iphone', 'ios-99', 'en-US'), 'png', 'x')).toThrow(/Unknown export size/);
    expect(() => exportPath('stores', job('iphone', 'ios-6.9', 'fa'), 'png', 'x')).toThrow(/no App Store locale/);
    expect(() => exportPath('fastlane', job('android-phone', 'play-phone', 'or-IN'), 'png', 'x')).toThrow(/no Google Play locale/);
    expect(() => exportPath('flat', job('iphone', 'ios-6.9', 'en-US', -1), 'png', 'x')).toThrow(RangeError);
    expect(() => exportPath('flat', job('iphone', 'ios-6.9', 'en-US', 1.5), 'png', 'x')).toThrow(RangeError);
    expect(() => exportPath('flat', job('iphone', 'ios-6.9', 'en-US', Number.NaN), 'png', 'x')).toThrow(RangeError);
    expect(() => exportPath('zip' as never, job('iphone', 'ios-6.9', 'en-US'), 'png', 'x')).toThrow(/Unknown export structure/);
  });
});

describe('deliverScreenshotSet', () => {
  it('knows the fastlane deliver set of every App Store size in the catalog', () => {
    for (const s of ALL_SIZES.filter((x) => x.store === 'app-store')) expect(deliverScreenshotSet(s), s.id).toMatch(/^APP_/);
    const set = (id: string) => deliverScreenshotSet(sizeById(id)!);
    expect(set('ios-6.9')).toBe('APP_IPHONE_67');
    expect(set('ios-6.9-b')).toBe('APP_IPHONE_67');
    expect(set('ios-6.5')).toBe(set('ios-6.5-b'));
    expect(set('ios-6.3')).toBe('APP_IPHONE_61');
    expect(set('ios-6.1')).toBe('APP_IPHONE_58');
    expect(set('ipad-13')).toBe(set('ipad-12.9'));
    expect(set('ipad-11')).toBe('APP_IPAD_PRO_3GEN_11');
    expect(new Set(FAMILIES.mac.sizes.map((s) => deliverScreenshotSet(s)))).toEqual(new Set(['APP_DESKTOP']));
    // Landscape shares the portrait set; Apple TV and Vision Pro differ despite one resolution.
    expect(set('ios-6.9-land')).toBe('APP_IPHONE_67');
    expect(set('ipad-13-land')).toBe(set('ipad-13'));
    expect(set('tv-4k')).toBe('APP_APPLE_TV');
    expect(set('vision-pro')).toBe('APP_APPLE_VISION_PRO');
    expect(set('watch-ultra-3')).toBe('APP_WATCH_ULTRA');
    // The default iPhone sizes fill two different sets.
    expect(set('ios-6.9')).not.toBe(set('ios-6.3'));
  });

  it('keeps unknown resolutions apart', () => {
    expect(deliverScreenshotSet({ width: 1000, height: 2000 })).toBe('SIZE_1000x2000');
    expect(deliverScreenshotSet({ width: 1000, height: 2000 })).not.toBe(deliverScreenshotSet({ width: 1001, height: 2000 }));
  });
});

describe('storeLocale', () => {
  it('returns the store-specific code or null', () => {
    expect(storeLocale('he', 'app-store')).toBe('he');
    expect(storeLocale('he', 'google-play')).toBe('iw-IL');
    expect(storeLocale('fa', 'app-store')).toBeNull();
    expect(storeLocale('or-IN', 'google-play')).toBeNull();
    expect(storeLocale('xx', 'google-play')).toBe('xx');
  });
});

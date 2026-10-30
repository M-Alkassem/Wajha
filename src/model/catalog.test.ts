/**
 * Store rules the catalog must keep. The official values below were checked
 * on 2026-10-30 against:
 *  - Apple "Screenshot specifications"
 *    https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
 *  - App Store Connect API locale shortcodes (linked from "App Store localizations")
 *    https://developer.apple.com/documentation/appstoreconnectapi/managing-metadata-in-your-app-by-using-locale-shortcodes
 *  - Google Play "Add preview assets to showcase your app"
 *    https://support.google.com/googleplay/android-developer/answer/9866151
 *  - Google Play "Translate and localize your app" (store listing languages)
 *    https://support.google.com/googleplay/android-developer/answer/9844778
 *  - fastlane deliver / supply docs (locale folders, supply image folders)
 *    https://docs.fastlane.tools/actions/deliver/ , https://docs.fastlane.tools/actions/supply/
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SIZES, BUNDLED_FONTS, FAMILIES, FAMILY_ORDER, FONT_FALLBACK_STACK, LANGUAGES, isRtl, languageInfo, sizeById } from './catalog';
import type { ExportSize, FamilyId } from './types';

const dims = (w: number, h: number) => `${w}x${h}`;

/** Apple display groups and their accepted portrait sizes. */
const APPLE_IPHONE: Record<string, string[]> = {
  'iPhone Duo': [dims(1398, 2034), dims(2007, 2853)],
  'Dynamic Island (large)': [dims(1260, 2736), dims(1290, 2796), dims(1320, 2868)],
  'Face ID (large)': [dims(1284, 2778), dims(1242, 2688)],
  'Dynamic Island (medium)': [dims(1179, 2556), dims(1206, 2622)],
  'Face ID (medium)': [dims(1170, 2532), dims(1125, 2436), dims(1080, 2340)],
  'Home Button (large)': [dims(1242, 2208)],
  'Home Button (medium)': [dims(750, 1334)],
  'Home Button (4")': [dims(640, 1096), dims(640, 1136)],
  'Home Button (3.5")': [dims(640, 920), dims(640, 960)],
};
const APPLE_IPAD: Record<string, string[]> = {
  '13"': [dims(2064, 2752), dims(2048, 2732)],
  '12.9"': [dims(2048, 2732)],
  '11"': [dims(1488, 2266), dims(1668, 2420), dims(1668, 2388), dims(1640, 2360)],
  '10.5"': [dims(1668, 2224)],
  '9.7"': [dims(1536, 2008), dims(1536, 2048), dims(768, 1004), dims(768, 1024)],
};
const APPLE_MAC = [dims(1280, 800), dims(1440, 900), dims(2560, 1600), dims(2880, 1800)];

/** App Store Connect locale shortcodes (all 50 App Store languages). */
const APPLE_LOCALES = [
  'ar-SA', 'bn-BD', 'ca', 'zh-Hans', 'zh-Hant', 'hr', 'cs', 'da', 'nl-NL', 'en-AU', 'en-CA', 'en-GB', 'en-US', 'fi', 'fr-FR', 'fr-CA',
  'de-DE', 'el', 'gu-IN', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'kn-IN', 'ko', 'ms', 'ml-IN', 'mr-IN', 'no', 'or-IN', 'pl', 'pt-BR',
  'pt-PT', 'pa-IN', 'ro', 'ru', 'sk', 'sl-SI', 'es-MX', 'es-ES', 'sv', 'ta-IN', 'te-IN', 'th', 'tr', 'uk', 'ur-PK', 'vi',
];

/** Google Play store listing language codes. */
const PLAY_LOCALES = [
  'af', 'sq', 'am', 'ar', 'hy-AM', 'az-AZ', 'bn-BD', 'eu-ES', 'be', 'bg', 'my-MM', 'ca', 'zh-HK', 'zh-CN', 'zh-TW', 'hr', 'cs-CZ',
  'da-DK', 'nl-NL', 'en-AU', 'en-CA', 'en-US', 'en-GB', 'en-IN', 'en-SG', 'en-ZA', 'et', 'fil', 'fi-FI', 'fr-CA', 'fr-FR', 'gl-ES',
  'ka-GE', 'de-DE', 'el-GR', 'gu', 'iw-IL', 'hi-IN', 'hu-HU', 'is-IS', 'id', 'it-IT', 'ja-JP', 'kn-IN', 'kk', 'km-KH', 'ko-KR',
  'ky-KG', 'lo-LA', 'lv', 'lt', 'mk-MK', 'ms-MY', 'ms', 'ml-IN', 'mr-IN', 'mn-MN', 'ne-NP', 'no-NO', 'fa', 'fa-AE', 'fa-AF', 'fa-IR',
  'pl-PL', 'pt-BR', 'pt-PT', 'pa', 'ro', 'rm', 'ru-RU', 'sr', 'si-LK', 'sk', 'sl', 'es-419', 'es-ES', 'es-US', 'sw', 'sv-SE', 'ta-IN',
  'te-IN', 'th', 'tr-TR', 'uk', 'ur', 'vi', 'zu',
];

const appleSizes = ALL_SIZES.filter((s) => s.store === 'app-store');
const playSizes = ALL_SIZES.filter((s) => s.store === 'google-play');
const isFeature = (s: ExportSize) => s.supplyFolder === 'featureGraphic';
const groupOf = (table: Record<string, string[]>, s: ExportSize) =>
  Object.keys(table).filter((g) => table[g].includes(dims(s.width, s.height)));

describe('families and sizes', () => {
  it('lists every family once, in FAMILY_ORDER, keyed by its own id', () => {
    expect([...FAMILY_ORDER].sort()).toEqual(Object.keys(FAMILIES).sort());
    expect(new Set(FAMILY_ORDER).size).toBe(FAMILY_ORDER.length);
    for (const id of FAMILY_ORDER) expect(FAMILIES[id].id).toBe(id);
    expect(ALL_SIZES).toEqual(FAMILY_ORDER.flatMap((f) => FAMILIES[f].sizes));
  });

  it('uses positive integer pixel sizes everywhere', () => {
    for (const f of FAMILY_ORDER) {
      const { design, screenAspect } = FAMILIES[f];
      expect(Number.isInteger(design.width) && design.width > 0, f).toBe(true);
      expect(Number.isInteger(design.height) && design.height > 0, f).toBe(true);
      expect(Number.isFinite(screenAspect) && screenAspect > 0, f).toBe(true);
    }
    for (const s of ALL_SIZES) {
      expect(Number.isInteger(s.width) && s.width > 0, s.id).toBe(true);
      expect(Number.isInteger(s.height) && s.height > 0, s.id).toBe(true);
    }
  });

  it('keeps sizes consistent with their family and store', () => {
    for (const f of FAMILY_ORDER) {
      const info = FAMILIES[f];
      expect(info.sizes.length, f).toBeGreaterThan(0);
      expect(info.stores.length, f).toBe(1);
      for (const s of info.sizes) {
        expect(s.family, s.id).toBe(f);
        expect(info.stores, s.id).toContain(s.store);
      }
      // The design canvas is one of the real export sizes, so the master never needs rescaling to a new aspect.
      expect(info.sizes.some((s) => s.width === info.design.width && s.height === info.design.height), f).toBe(true);
      expect(info.sizes.some((s) => s.default), `${f} has a default size`).toBe(true);
    }
  });

  it('has unique, path-safe ids and folders', () => {
    const ids = ALL_SIZES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ALL_SIZES) {
      expect(s.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
      expect(s.label.trim()).not.toBe('');
      expect(s.devices.trim()).not.toBe('');
      expect(s.folder).not.toMatch(/[/\\:*?"<>|]|^[. ]|[. ]$/);
      expect(sizeById(s.id)).toBe(s);
    }
    for (const store of ['app-store', 'google-play'] as const) {
      const folders = ALL_SIZES.filter((s) => s.store === store).map((s) => s.folder);
      expect(new Set(folders).size, store).toBe(folders.length);
    }
    expect(sizeById('nope')).toBeUndefined();
  });

  it('caps slides at the store limits (Apple 10 per size, Google Play 8 per device type, 1 feature graphic)', () => {
    for (const f of FAMILY_ORDER) {
      const info = FAMILIES[f];
      const expected = info.stores[0] === 'app-store' ? 10 : f === 'play-feature' ? 1 : 8;
      expect(info.maxSlides, f).toBe(expected);
    }
  });
});

describe('App Store sizes', () => {
  it('only uses sizes App Store Connect accepts', () => {
    for (const s of FAMILIES.iphone.sizes) expect(groupOf(APPLE_IPHONE, s), s.id).not.toEqual([]);
    for (const s of FAMILIES.ipad.sizes) expect(groupOf(APPLE_IPAD, s), s.id).not.toEqual([]);
    for (const s of FAMILIES.mac.sizes) {
      expect(APPLE_MAC, s.id).toContain(dims(s.width, s.height));
      expect(s.width / s.height, s.id).toBeCloseTo(16 / 10, 10);
    }
    expect(appleSizes.every((s) => s.supplyFolder === undefined)).toBe(true);
  });

  it('puts every size in the display group its label claims', () => {
    const expectGroup = (id: string, group: string) => expect(groupOf(APPLE_IPHONE, sizeById(id)!), id).toContain(group);
    expectGroup('ios-6.9', 'Dynamic Island (large)');
    expectGroup('ios-6.9-b', 'Dynamic Island (large)');
    expectGroup('ios-6.5', 'Face ID (large)');
    expectGroup('ios-6.5-b', 'Face ID (large)');
    expectGroup('ios-6.3', 'Dynamic Island (medium)');
    expectGroup('ios-6.1', 'Face ID (medium)');
    expect(groupOf(APPLE_IPAD, sizeById('ipad-13')!)).toContain('13"');
    expect(groupOf(APPLE_IPAD, sizeById('ipad-11')!)).toContain('11"');
  });

  it('marks and exports by default the sizes Apple requires', () => {
    const required = (family: FamilyId, groups: Record<string, string[]>, group: string) =>
      FAMILIES[family].sizes.filter((s) => s.required && s.default && groups[group].includes(dims(s.width, s.height)));
    // "Required device sizes: iPhone: at least one screenshot for iPhone with Dynamic Island (medium display)".
    expect(required('iphone', APPLE_IPHONE, 'Dynamic Island (medium)').length).toBeGreaterThan(0);
    // Face ID (large) is required unless Dynamic Island (large) is provided: we provide the latter.
    expect(required('iphone', APPLE_IPHONE, 'Dynamic Island (large)').length).toBeGreaterThan(0);
    expect(required('ipad', APPLE_IPAD, '13"').length).toBeGreaterThan(0);
    expect(FAMILIES.mac.sizes.some((s) => s.required && s.default)).toBe(true);
  });
});

describe('Google Play sizes', () => {
  it('keeps screenshots within 320..3840 px with the long side at most twice the short side', () => {
    for (const s of playSizes.filter((x) => !isFeature(x))) {
      const lo = Math.min(s.width, s.height);
      const hi = Math.max(s.width, s.height);
      expect(lo, s.id).toBeGreaterThanOrEqual(320);
      expect(hi, s.id).toBeLessThanOrEqual(3840);
      expect(hi / lo, s.id).toBeLessThanOrEqual(2);
    }
  });

  it('meets the recommendation rules: 9:16 or 16:9 with at least 1080 px (tablets 1080..7680 px)', () => {
    for (const s of playSizes.filter((x) => !isFeature(x))) {
      const lo = Math.min(s.width, s.height);
      const hi = Math.max(s.width, s.height);
      expect(lo, s.id).toBeGreaterThanOrEqual(1080);
      expect(hi * 9, s.id).toBe(lo * 16);
      if (s.family === 'android-tablet') expect(hi, s.id).toBeLessThanOrEqual(7680);
    }
  });

  it('has exactly one 1024 x 500 feature graphic', () => {
    const features = playSizes.filter(isFeature);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ id: 'play-feature', family: 'play-feature', width: 1024, height: 500 });
  });

  it('maps every size to its fastlane supply folder', () => {
    const folders = { 'android-phone': 'phoneScreenshots', 'android-tablet': null, 'play-feature': 'featureGraphic' } as const;
    for (const s of playSizes) {
      expect(s.supplyFolder, s.id).toBeDefined();
      const expected = folders[s.family as keyof typeof folders];
      if (expected) expect(s.supplyFolder, s.id).toBe(expected);
    }
    expect(sizeById('play-tablet-7')?.supplyFolder).toBe('sevenInchScreenshots');
    expect(sizeById('play-tablet-10')?.supplyFolder).toBe('tenInchScreenshots');
  });

  it('requires the phone screenshots and the feature graphic', () => {
    expect(FAMILIES['android-phone'].sizes.some((s) => s.required && s.default)).toBe(true);
    expect(FAMILIES['play-feature'].sizes.every((s) => s.required && s.default)).toBe(true);
  });
});

describe('languages', () => {
  it('has unique project codes and unique store codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    const apple = LANGUAGES.flatMap((l) => (l.appStore ? [l.appStore] : []));
    expect(new Set(apple).size).toBe(apple.length);
    const play = LANGUAGES.flatMap((l) => (l.play ? [l.play] : []));
    expect(new Set(play).size).toBe(play.length);
    for (const l of LANGUAGES) {
      expect(l.name.trim(), l.code).not.toBe('');
      expect(l.native.trim(), l.code).not.toBe('');
      expect(l.appStore !== null || l.play !== null, `${l.code} is offered by some store`).toBe(true);
    }
  });

  it('uses App Store Connect locale codes and covers all of them', () => {
    for (const l of LANGUAGES) if (l.appStore !== null) expect(APPLE_LOCALES, l.code).toContain(l.appStore);
    const ours = LANGUAGES.map((l) => l.appStore).filter((c) => c !== null);
    expect([...ours].sort()).toEqual([...APPLE_LOCALES].sort());
  });

  it('uses Google Play listing codes', () => {
    for (const l of LANGUAGES) if (l.play !== null) expect(PLAY_LOCALES, l.code).toContain(l.play);
    // The odd ones are deliberate: Hebrew is "iw-IL", Latin American Spanish is "es-419" on Google Play.
    expect(languageInfo('he').play).toBe('iw-IL');
    expect(languageInfo('es-MX').play).toBe('es-419');
    expect(languageInfo('fa').appStore).toBeNull();
    expect(languageInfo('or-IN').play).toBeNull();
  });

  it('keeps store codes in BCP 47 shape', () => {
    for (const l of LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2,3}(-(Hans|Hant|[A-Z]{2}))?$/);
      if (l.appStore) expect(l.appStore).toMatch(/^[a-z]{2,3}(-(Hans|Hant|[A-Z]{2}))?$/);
      if (l.play) expect(l.play).toMatch(/^[a-z]{2,3}(-([A-Z]{2}|\d{3}))?$/);
    }
  });

  it('flags exactly Arabic, Hebrew, Persian and Urdu as right-to-left', () => {
    const rtl = LANGUAGES.filter((l) => l.rtl).map((l) => l.code.split('-')[0]);
    expect(rtl.sort()).toEqual(['ar', 'fa', 'he', 'ur']);
    for (const code of ['ar-SA', 'he', 'fa', 'ur-PK']) {
      expect(isRtl(code), code).toBe(true);
      // Native names really are in a right-to-left script.
      expect(languageInfo(code).native, code).toMatch(/[\u0590-\u05ff\u0600-\u06ff]/);
    }
    expect(isRtl('en-US')).toBe(false);
  });

  it('breaks CJK text between characters', () => {
    for (const code of ['zh-Hans', 'zh-Hant', 'ja']) expect(languageInfo(code).wrap, code).toBe('char');
    expect(languageInfo('en-US').wrap).toBe('space');
  });

  it('describes unknown codes with a neutral fallback', () => {
    expect(languageInfo('xx-YY')).toEqual({ code: 'xx-YY', name: 'xx-YY', native: 'xx-YY', rtl: false, appStore: 'xx-YY', play: 'xx-YY', wrap: 'space' });
    expect(isRtl('xx-YY')).toBe(false);
  });
});

describe('bundled fonts', () => {
  const base = join(import.meta.dirname, '..', '..', 'node_modules', '@fontsource-variable');
  const packages = readdirSync(base).filter((p) => !p.startsWith('.'));
  const css = (pkg: string) => readFileSync(join(base, pkg, 'index.css'), 'utf8');
  const pkgOf = (label: string) => label.toLowerCase().replace(/\s+/g, '-');

  it('registers each family under the @font-face name of its package', () => {
    for (const font of BUNDLED_FONTS) {
      const pkg = pkgOf(font.label);
      expect(packages, font.label).toContain(pkg);
      const families = new Set([...css(pkg).matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]));
      expect([...families], font.label).toEqual([font.family]);
    }
  });

  it('declares the variable weight range and scripts the package really has', () => {
    for (const font of BUNDLED_FONTS) {
      const sheet = css(pkgOf(font.label));
      const ranges = [...sheet.matchAll(/font-weight:\s*(\d+)\s+(\d+)\s*;/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(ranges.length, font.label).toBeGreaterThan(0);
      for (const r of ranges) expect(r, font.label).toEqual(font.weights);
      for (const script of font.scripts) expect(sheet, `${font.label} ${script}`).toContain(`-${script}-wght-normal`);
    }
  });

  it('bundles every installed package exactly once', () => {
    const labels = BUNDLED_FONTS.map((f) => pkgOf(f.label));
    expect(new Set(labels).size).toBe(labels.length);
    expect([...labels].sort()).toEqual([...packages].sort());
  });

  it('falls back to bundled Arabic and Hebrew capable fonts first', () => {
    const first = FONT_FALLBACK_STACK.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(first.slice(0, 2)).toEqual(['Noto Sans Arabic Variable', 'Rubik Variable']);
    for (const name of first.slice(0, 2)) expect(BUNDLED_FONTS.map((f) => f.family)).toContain(name);
    expect(first.at(-1)).toBe('sans-serif');
  });
});

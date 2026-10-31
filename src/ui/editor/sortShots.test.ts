import { describe, expect, it } from 'vitest';
import type { FamilyId, LangCode } from '../../model/types';
import { compareShots, familyForShot, langForShot, planSort, wantsSorting, type ShotCandidate } from './sortShots';

const shot = (name: string, width: number, height: number, folders: string[] = []): ShotCandidate => ({ name, width, height, folders });
const ALL: FamilyId[] = ['iphone', 'iphone-landscape', 'ipad', 'ipad-landscape', 'mac', 'watch', 'apple-tv', 'vision', 'android-phone', 'android-landscape', 'android-tablet', 'play-feature'];

describe('familyForShot', () => {
  it('knows simulator captures by their resolution', () => {
    expect(familyForShot(shot('Simulator Screenshot - iPhone 17 Pro Max - 2026-10-31 at 10.11.12.png', 1320, 2868), ALL)).toBe('iphone');
    expect(familyForShot(shot('Simulator Screenshot - iPhone 16 - 2026-10-31 at 10.11.12.png', 1179, 2556), ALL)).toBe('iphone');
    expect(familyForShot(shot('Simulator Screenshot - iPad Pro 13-inch (M5) - 2026.png', 2064, 2752), ALL)).toBe('ipad');
    expect(familyForShot(shot('Simulator Screenshot - iPad Pro 13-inch (M5) - 2026.png', 2752, 2064), ALL)).toBe('ipad-landscape');
    expect(familyForShot(shot('Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026.png', 422, 514), ALL)).toBe('watch');
  });

  it('lets the file name decide between devices that share a resolution', () => {
    expect(familyForShot(shot('Simulator Screenshot - Apple Vision Pro - 2026.png', 3840, 2160), ALL)).toBe('vision');
    expect(familyForShot(shot('Simulator Screenshot - Apple TV 4K (3rd generation) - 2026.png', 3840, 2160), ALL)).toBe('apple-tv');
    expect(familyForShot(shot('Screenshot_20261031_101112.png', 1080, 2400), ALL)).toBe('android-phone');
    expect(familyForShot(shot('Screenshot_20261031_101112.png', 2400, 1080), ALL)).toBe('android-landscape');
  });

  it("falls back to the closest canvas shape among the project's families", () => {
    expect(familyForShot(shot('home.png', 1080, 2340), ['iphone', 'mac'])).toBe('iphone');
    expect(familyForShot(shot('home.png', 1080, 2400), ['android-phone', 'ipad'])).toBe('android-phone');
    expect(familyForShot(shot('wide.png', 3000, 1900), ['iphone', 'mac'])).toBe('mac');
    // A square image fits nothing.
    expect(familyForShot(shot('logo.png', 1000, 1000), ['iphone', 'mac'])).toBeNull();
    // An iPad shot in an iPhone-only project has no family there.
    expect(familyForShot(shot('Simulator Screenshot - iPad Air.png', 1640, 2360), ['iphone'])).toBeNull();
  });
});

describe('langForShot', () => {
  const langs: LangCode[] = ['en-US', 'ar-SA', 'de-DE'];

  it('reads fastlane and hand-made folders', () => {
    expect(langForShot(shot('1.png', 1, 1, ['screenshots', 'ar-SA']), langs)).toBe('ar-SA');
    expect(langForShot(shot('1.png', 1, 1, ['Arabic']), langs)).toBe('ar-SA');
    expect(langForShot(shot('1.png', 1, 1, ['العربية']), langs)).toBe('ar-SA');
    expect(langForShot(shot('1.png', 1, 1, ['de']), langs)).toBe('de-DE');
    expect(langForShot(shot('1.png', 1, 1, ['Deutsch', 'iPhone']), langs)).toBe('de-DE');
    expect(langForShot(shot('1.png', 1, 1, ['en_us']), langs)).toBe('en-US');
  });

  it('reads codes and names inside file names', () => {
    expect(langForShot(shot('01-home-ar-SA.png', 1, 1), langs)).toBe('ar-SA');
    expect(langForShot(shot('02_settings_de.png', 1, 1), langs)).toBe('de-DE');
    expect(langForShot(shot('screen (Arabic).png', 1, 1), langs)).toBe('ar-SA');
  });

  it('does not guess when the path names no language, or names one two languages share', () => {
    expect(langForShot(shot('Simulator Screenshot - iPhone 17 Pro - 2026-10-31.png', 1, 1), langs)).toBeNull();
    expect(langForShot(shot('home.png', 1, 1, ['en']), ['en-US', 'en-GB'])).toBeNull();
    expect(langForShot(shot('home.png', 1, 1, ['en-GB']), ['en-US', 'en-GB'])).toBe('en-GB');
    // Words that only look like codes elsewhere stay unmatched.
    expect(langForShot(shot('detail.png', 1, 1, ['design']), langs)).toBeNull();
  });
});

describe('planSort', () => {
  it('groups by family and language and orders by name, numbers by value', () => {
    const shots = [
      shot('10.png', 1320, 2868, ['ar-SA']),
      shot('2.png', 1320, 2868, ['ar-SA']),
      shot('1.png', 1320, 2868, ['en-US']),
      shot('1.png', 2064, 2752, ['en-US']),
      shot('Simulator Screenshot - iPad Pro - 2026.png', 2064, 2752),
      shot('logo.png', 800, 800),
      shot('Simulator Screenshot - Apple Watch.png', 422, 514),
    ];
    const plan = planSort(shots, ['iphone', 'ipad'], ['en-US', 'ar-SA']);
    expect(plan.groups.map((g) => [g.family, g.lang, g.shots.map((s) => s.name)])).toEqual([
      ['iphone', 'en-US', ['1.png']],
      ['iphone', 'ar-SA', ['2.png', '10.png']],
      ['ipad', 'en-US', ['Simulator Screenshot - iPad Pro - 2026.png', '1.png']],
    ]);
    expect([...plan.otherFamily.keys()]).toEqual(['watch']);
    expect(plan.unmatched.map((s) => s.name)).toEqual(['logo.png']);
  });

  it('orders simulator captures by their timestamp', () => {
    const a = shot('Simulator Screenshot - iPhone 17 - 2026-10-31 at 09.05.01.png', 1, 1);
    const b = shot('Simulator Screenshot - iPhone 17 - 2026-10-31 at 10.11.12.png', 1, 1);
    expect([b, a].sort(compareShots)).toEqual([a, b]);
  });
});

describe('wantsSorting', () => {
  const active = { family: 'iphone' as FamilyId, lang: 'en-US' as LangCode };
  it('sorts folders, other devices and other languages, and pours plain files', () => {
    expect(wantsSorting([shot('1.png', 1320, 2868)], ['iphone', 'ipad'], ['en-US', 'ar-SA'], active)).toBe(false);
    expect(wantsSorting([shot('1.png', 1320, 2868, ['shots'])], ['iphone'], ['en-US'], active)).toBe(true);
    expect(wantsSorting([shot('1.png', 2064, 2752)], ['iphone', 'ipad'], ['en-US'], active)).toBe(true);
    expect(wantsSorting([shot('1-ar-SA.png', 1320, 2868)], ['iphone'], ['en-US', 'ar-SA'], active)).toBe(true);
  });
});

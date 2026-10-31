/**
 * Sorting a pile of screenshots (a dropped folder, simulator output, a
 * fastlane screenshots folder) into the project: which device family and
 * which language each image belongs to, and in what order. Pure: callers
 * read the image sizes and do the importing.
 *
 * Device: an exact store or simulator resolution, helped by what the file
 * name says ("Simulator Screenshot - iPad Pro …", "Screenshot_2026…" from an
 * Android emulator), else the enabled family whose canvas has the closest
 * shape. Language: a folder or file name that is one of the project's
 * languages, as a code ("ar-SA", "de", "pt_BR"), a store locale code or a
 * name ("Arabic", "العربية"). Order: natural file name order, so "2.png"
 * comes before "10.png" and simulator timestamps sort by time.
 */
import { ALL_SIZES, FAMILIES, FAMILY_ORDER, languageInfo } from '../../model/catalog';
import type { FamilyId, LangCode } from '../../model/types';

export interface ShotCandidate {
  /** File name, e.g. "Simulator Screenshot - iPhone 17 Pro - 2026-10-31 at 10.11.12.png". */
  name: string;
  /** Folders from the dropped root down to the file, e.g. ["screenshots", "ar-SA"]. */
  folders: readonly string[];
  width: number;
  height: number;
}

export interface SortedGroup<T extends ShotCandidate> {
  family: FamilyId;
  lang: LangCode;
  shots: T[];
}

export interface SortPlan<T extends ShotCandidate> {
  groups: SortedGroup<T>[];
  /** Images for a family the project does not have, by that family. */
  otherFamily: Map<FamilyId, T[]>;
  /** Images whose shape matches no family of the project. */
  unmatched: T[];
}

/* Device ------------------------------------------------------------------ */

type Kind = 'iphone' | 'ipad' | 'android' | 'mac' | 'watch' | 'tv' | 'vision';

/** What a path says about the device, most specific first. */
const NAME_HINTS: ReadonlyArray<readonly [RegExp, Kind]> = [
  [/vision\s*pro|visionos/, 'vision'],
  [/apple\s*tv|tvos/, 'tv'],
  [/apple\s*watch|watchos|\bwatch\b/, 'watch'],
  [/\bipad/, 'ipad'],
  [/\biphone/, 'iphone'],
  [/macbook|\bmacos\b|\bmac\b|desktop/, 'mac'],
  [/pixel|android|galaxy|emulator|screenshot_\d/, 'android'],
];

/** Families of each kind, in the order to try them. */
const KIND_FAMILIES: Record<Kind, FamilyId[]> = {
  iphone: ['iphone', 'iphone-landscape'],
  ipad: ['ipad', 'ipad-landscape'],
  android: ['android-phone', 'android-landscape', 'android-tablet'],
  mac: ['mac'],
  watch: ['watch'],
  tv: ['apple-tv'],
  vision: ['vision'],
};

/**
 * Simulator and emulator resolutions that are not store sizes, so a raw
 * capture still lands on the right device (store sizes come from the catalog).
 */
const DEVICE_SIZES: ReadonlyArray<readonly [number, number, FamilyId]> = [
  [1179, 2556, 'iphone'], // iPhone 16, 15 Pro
  [1080, 2340, 'iphone'], // iPhone mini
  [750, 1334, 'iphone'], // iPhone SE
  [1640, 2360, 'ipad'], // iPad 10th gen, iPad Air 11″
  [1488, 2266, 'ipad'], // iPad mini
  [1620, 2160, 'ipad'], // iPad 9th gen
  [1080, 2400, 'android-phone'], // Pixel 7, 8, 9
  [1344, 2992, 'android-phone'], // Pixel 8 Pro
  [1600, 2560, 'android-tablet'], // Pixel Tablet
  [3024, 1964, 'mac'], // MacBook Pro 14″ display
  [3456, 2234, 'mac'], // MacBook Pro 16″ display
];

/** A screenshot is a screen: compare it with the family's screen, not its slide canvas. */
const shapeOf = (f: FamilyId) => FAMILIES[f].screenAspect;

/** The same device on its side. */
const TURNED: Partial<Record<FamilyId, FamilyId>> = { iphone: 'iphone-landscape', ipad: 'ipad-landscape', 'android-phone': 'android-landscape' };

/** The feature graphic is a designed banner, never a screenshot. */
const SCREEN_FAMILIES = FAMILY_ORDER.filter((f) => f !== 'play-feature');

/** How far apart two shapes are (0 = same aspect ratio). */
const shapeDistance = (a: number, b: number) => Math.abs(Math.log(a / b));

/** Shapes further apart than this never match (about 15 %). */
const MAX_SHAPE_DISTANCE = 0.14;

function hintedKind(text: string): Kind | null {
  for (const [re, kind] of NAME_HINTS) if (re.test(text)) return kind;
  return null;
}

/**
 * The device family an image belongs to, or null when no family fits.
 * `enabled` limits the answer to the project's families; pass the whole
 * catalog to learn which family an unmatched image wanted.
 */
export function familyForShot(shot: ShotCandidate, enabled: readonly FamilyId[]): FamilyId | null {
  const { width: w, height: h } = shot;
  if (!(w > 0 && h > 0)) return null;
  const kind = hintedKind(`${shot.folders.join('/')}/${shot.name}`.toLowerCase());
  const allowed = (f: FamilyId) => enabled.includes(f) && (kind === null || KIND_FAMILIES[kind].includes(f));
  // An exact store size, or a device resolution in either orientation.
  const exact: FamilyId[] = [];
  for (const size of ALL_SIZES) if (size.width === w && size.height === h) exact.push(size.family);
  for (const [sw, sh, f] of DEVICE_SIZES) {
    if (sw === w && sh === h) exact.push(f);
    const turned = TURNED[f];
    if (turned && sw === h && sh === w) exact.push(turned);
  }
  const match = SCREEN_FAMILIES.find((f) => exact.includes(f) && allowed(f));
  if (match) return match;
  // Otherwise the closest screen shape among the allowed families.
  let best: FamilyId | null = null;
  let bestDistance = MAX_SHAPE_DISTANCE;
  for (const f of SCREEN_FAMILIES) {
    if (!allowed(f)) continue;
    const d = shapeDistance(h / w, shapeOf(f));
    if (d < bestDistance) {
      best = f;
      bestDistance = d;
    }
  }
  return best;
}

/* Language ----------------------------------------------------------------- */

/** Lower case, "_" as "-": "pt_BR" and "PT-br" read alike. */
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/_/g, '-').trim();

/** Every way a folder or file name may spell `lang`. */
function spellings(lang: LangCode): string[] {
  const info = languageInfo(lang);
  const out = new Set<string>([lang, info.appStore ?? '', info.play ?? '', info.name, info.native].map(norm));
  // "English (US)" also as "english"; "de-DE" also as "de" unless that is ambiguous (handled by the caller).
  out.add(norm(info.name.replace(/\s*\(.*\)$/, '')));
  out.add(norm(lang.split('-')[0]));
  out.delete('');
  return [...out];
}

/**
 * The project language a path names, or null. Folder names count first
 * (deepest first), then the words of the file name. A spelling two project
 * languages share ("en" with English (US) and English (UK)) matches neither,
 * unless it is exactly one language's own code.
 */
export function langForShot(shot: ShotCandidate, languages: readonly LangCode[]): LangCode | null {
  const owners = new Map<string, Set<LangCode>>();
  for (const lang of languages) for (const s of spellings(lang)) owners.set(s, (owners.get(s) ?? new Set()).add(lang));
  const lookup = (word: string): LangCode | null => {
    const key = norm(word);
    const found = owners.get(key);
    if (!found) return null;
    if (found.size === 1) return [...found][0];
    return [...found].find((l) => norm(l) === key) ?? null;
  };
  for (const folder of [...shot.folders].reverse()) {
    const hit = lookup(folder);
    if (hit) return hit;
  }
  // File name words: "home-ar-SA.png", "01_de.png", "screen (Arabic).png".
  const words = shot.name
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[\s._()[\]{},-]+/)
    .filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    // A region code keeps its hyphen in a name ("ar-SA"), so try each word with the next one first.
    const hit = (i + 1 < words.length ? lookup(`${words[i]}-${words[i + 1]}`) : null) ?? lookup(words[i]);
    if (hit) return hit;
  }
  return null;
}

/* Plan ---------------------------------------------------------------------- */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural order by folder path, then file name. */
export function compareShots(a: ShotCandidate, b: ShotCandidate): number {
  return collator.compare(a.folders.join('/'), b.folders.join('/')) || collator.compare(a.name, b.name);
}

/**
 * Sorts `shots` into the project's families and languages. Images with no
 * language in their path go to `baseLang`. Groups come in family order, then
 * project language order; images inside a group in natural name order.
 */
export function planSort<T extends ShotCandidate>(shots: readonly T[], families: readonly FamilyId[], languages: readonly LangCode[]): SortPlan<T> {
  const groups = new Map<string, SortedGroup<T>>();
  const otherFamily = new Map<FamilyId, T[]>();
  const unmatched: T[] = [];
  const base = languages[0];
  for (const shot of shots) {
    const family = familyForShot(shot, families);
    if (!family) {
      const wanted = familyForShot(shot, FAMILY_ORDER);
      if (wanted) otherFamily.set(wanted, [...(otherFamily.get(wanted) ?? []), shot]);
      else unmatched.push(shot);
      continue;
    }
    const lang = langForShot(shot, languages) ?? base;
    const key = `${family}\u0000${lang}`;
    const group = groups.get(key) ?? { family, lang, shots: [] };
    group.shots.push(shot);
    groups.set(key, group);
  }
  const order = (g: SortedGroup<T>) => FAMILY_ORDER.indexOf(g.family) * 1000 + languages.indexOf(g.lang);
  const sorted = [...groups.values()].sort((a, b) => order(a) - order(b));
  for (const g of sorted) g.shots.sort(compareShots);
  return { groups: sorted, otherFamily, unmatched };
}

/**
 * True when a plain drop should be sorted rather than poured into the
 * active family and language: it came as folders, or its images belong to
 * another family or name a language other than the active one.
 */
export function wantsSorting(shots: readonly ShotCandidate[], families: readonly FamilyId[], languages: readonly LangCode[], active: { family: FamilyId; lang: LangCode }): boolean {
  if (shots.some((s) => s.folders.length > 0)) return true;
  return shots.some((s) => {
    if (familyForShot(s, families) !== active.family) return true;
    const lang = langForShot(s, languages);
    return lang !== null && lang !== active.lang;
  });
}

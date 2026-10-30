/**
 * Folder and file naming for the "stores", "fastlane" and "flat" export
 * structures (ARCHITECTURE 6.5), plus the sanitiser applied to every path
 * segment, so user data (language codes, names) can never escape the export
 * folder or produce a name some file system refuses.
 */
import { languageInfo, sizeById } from '../model/catalog';
import type { ExportStructure, StoreId } from '../model/types';
import type { ExportJob } from './types';

/** Longest segment we emit, in UTF-16 code units: at most 240 UTF-8 bytes, under every file system's 255 limit. */
export const MAX_SEGMENT_LENGTH = 80;

/** Characters Windows forbids in names; "/" and "\\" are separators everywhere else too. */
const FORBIDDEN = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/** Device names Windows reserves regardless of extension ("nul.png" is as broken as "NUL"). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/**
 * Invisible directional formatting characters. They have no business in a
 * file name and the overrides allow "RLO" tricks that disguise extensions.
 * Zero-width joiners stay: Persian words and emoji sequences need them.
 */
function isBidiControl(cp: number): boolean {
  return cp === 0x061c || cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

function isControl(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

/** Iterating by code points joins surrogate pairs, so a code point in this range is an unpaired half: no file system accepts it. */
function isLoneSurrogate(cp: number): boolean {
  return cp >= 0xd800 && cp <= 0xdfff;
}

let graphemes: Intl.Segmenter | null | undefined;

/** Shared grapheme segmenter, or null where Intl.Segmenter is missing (older WebKit). */
function graphemeSegmenter(): Intl.Segmenter | null {
  if (graphemes === undefined) {
    graphemes = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  return graphemes;
}

/** Cuts `s` to at most `max` code units without splitting an emoji, a combining sequence or a surrogate pair. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = '';
  const seg = graphemeSegmenter();
  if (seg) {
    for (const { segment } of seg.segment(s)) {
      if (out.length + segment.length > max) break;
      out += segment;
    }
  }
  // A single cluster longer than the limit (or no Segmenter): fall back to code points.
  if (out === '') {
    for (const ch of s) {
      if (out.length + ch.length > max) break;
      out += ch;
    }
  }
  return out;
}

const trimDotsAndSpaces = (s: string) => s.replace(/^[. ]+|[. ]+$/g, '');

/**
 * Makes `name` safe as one path segment on macOS, Windows and Linux: strips
 * `/ \ : * ? " < > |`, control and bidi-control characters and unpaired
 * surrogates, collapses whitespace, trims leading/trailing dots and spaces
 * (hidden files, Windows quirks), keeps at most 80 code units, renames
 * Windows device names ("CON" -> "CON_") and never returns an empty string
 * ("Untitled").
 */
export function sanitizeSegment(name: string): string {
  let out = '';
  // NFC first so a name typed on macOS (decomposed) and Windows (composed) maps to one folder.
  for (const ch of String(name).normalize('NFC').replace(/\s+/g, ' ')) {
    const cp = ch.codePointAt(0) ?? 0;
    if (FORBIDDEN.has(ch) || isControl(cp) || isBidiControl(cp) || isLoneSurrogate(cp)) continue;
    out += ch;
  }
  out = trimDotsAndSpaces(out.replace(/ {2,}/g, ' '));
  const dot = out.indexOf('.');
  const stem = (dot < 0 ? out : out.slice(0, dot)).trimEnd();
  if (WINDOWS_RESERVED.test(stem)) out = `${stem}_${dot < 0 ? '' : out.slice(dot)}`;
  out = trimDotsAndSpaces(truncate(out, MAX_SEGMENT_LENGTH));
  return out === '' ? 'Untitled' : out;
}

/**
 * fastlane deliver files screenshots by resolution, and several of our
 * sizes land in the same App Store Connect screenshot set (from deliver's
 * app_screenshot.rb). Two sizes in one set would upload every slide twice.
 */
const DELIVER_SETS: Record<string, string> = {
  '1320x2868': 'APP_IPHONE_67',
  '1290x2796': 'APP_IPHONE_67',
  '1260x2736': 'APP_IPHONE_67',
  '1284x2778': 'APP_IPHONE_65',
  '1242x2688': 'APP_IPHONE_65',
  '1206x2622': 'APP_IPHONE_61',
  '1179x2556': 'APP_IPHONE_61',
  '1170x2532': 'APP_IPHONE_58',
  '1125x2436': 'APP_IPHONE_58',
  '1080x2340': 'APP_IPHONE_58',
  // "12.9" plus "2nd generation" in the file name would select APP_IPAD_PRO_129; our names never say that.
  '2064x2752': 'APP_IPAD_PRO_3GEN_129',
  '2048x2732': 'APP_IPAD_PRO_3GEN_129',
  '1668x2420': 'APP_IPAD_PRO_3GEN_11',
  '1668x2388': 'APP_IPAD_PRO_3GEN_11',
  '1640x2360': 'APP_IPAD_PRO_3GEN_11',
  '1488x2266': 'APP_IPAD_PRO_3GEN_11',
  '2880x1800': 'APP_DESKTOP',
  '2560x1600': 'APP_DESKTOP',
  '1440x900': 'APP_DESKTOP',
  '1280x800': 'APP_DESKTOP',
};

/** The App Store Connect screenshot set fastlane deliver files an App Store size under; a unique key for unknown resolutions. */
export function deliverScreenshotSet(size: { width: number; height: number }): string {
  const key = `${size.width}x${size.height}`;
  return DELIVER_SETS[key] ?? `SIZE_${key}`;
}

/** The store's locale code for a project language, or null when that store has none. */
export function storeLocale(lang: string, store: StoreId): string | null {
  const info = languageInfo(lang);
  return store === 'app-store' ? info.appStore : info.play;
}

/** "App Store" / "Google Play", as used in folder names and messages. */
export function storeLabel(store: StoreId): string {
  return store === 'app-store' ? 'App Store' : 'Google Play';
}

/**
 * Relative POSIX path of one exported file:
 *  - stores:   "App Store/<locale>/<size folder>/NN.ext", "Google Play/<locale>/<size folder>/NN.ext",
 *              feature graphic "Google Play/<locale>/Feature graphic.ext"
 *  - fastlane: "fastlane/screenshots/<locale>/NN_<size id>.ext" (deliver),
 *              "fastlane/metadata/android/<locale>/images/<supplyFolder>/NN.ext" (supply),
 *              feature graphic ".../images/featureGraphic.ext"
 *  - flat:     "<size id>/<lang>/NN.ext"
 * NN is the 1-based slide number with two digits. Throws for an unknown size
 * or a language the size's store has no locale for (planExport skips those).
 *
 * `projectName` is part of the contract but no structure contains it: files
 * go straight into the folder the user picked, which `pickExportTarget`
 * already names after the project.
 */
export function exportPath(structure: ExportStructure, job: Omit<ExportJob, 'path'>, ext: 'png' | 'jpg', _projectName: string): string {
  const size = sizeById(job.sizeId);
  if (!size) throw new Error(`Unknown export size "${job.sizeId}"`);
  if (!Number.isInteger(job.slideIndex) || job.slideIndex < 0) throw new RangeError(`Invalid slide index ${job.slideIndex}`);
  const nn = String(job.slideIndex + 1).padStart(2, '0');
  const feature = size.supplyFolder === 'featureGraphic';

  if (structure === 'flat') return `${sanitizeSegment(size.id)}/${sanitizeSegment(job.lang)}/${nn}.${ext}`;
  if (structure !== 'stores' && structure !== 'fastlane') throw new Error(`Unknown export structure "${String(structure)}"`);

  const code = storeLocale(job.lang, size.store);
  if (code === null) throw new Error(`${languageInfo(job.lang).name} has no ${storeLabel(size.store)} locale code`);
  const locale = sanitizeSegment(code);

  if (size.store === 'app-store') {
    return structure === 'stores'
      ? `App Store/${locale}/${sanitizeSegment(size.folder)}/${nn}.${ext}`
      : `fastlane/screenshots/${locale}/${nn}_${sanitizeSegment(size.id)}.${ext}`;
  }
  if (structure === 'stores') {
    return feature ? `Google Play/${locale}/Feature graphic.${ext}` : `Google Play/${locale}/${sanitizeSegment(size.folder)}/${nn}.${ext}`;
  }
  const images = `fastlane/metadata/android/${locale}/images`;
  if (feature) return `${images}/featureGraphic.${ext}`;
  if (!size.supplyFolder) throw new Error(`Export size "${size.id}" has no fastlane supply folder`);
  return `${images}/${size.supplyFolder}/${nn}.${ext}`;
}

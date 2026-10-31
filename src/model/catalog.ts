/**
 * Static catalogs: device families with their store export sizes, languages
 * with their store locale codes, and the fonts bundled with the app.
 *
 * Sizes and locale codes follow Apple's "Screenshot specifications" and
 * Google Play's "Add preview assets" help pages. Keep them in sync with the
 * stores; `catalog.test.ts` checks every store rule we rely on.
 */
import type { FamilyId, FamilyInfo, ExportSize, LangCode } from './types';

const size = (s: ExportSize): ExportSize => s;

/** The landscape version of portrait sizes: the same screens on their side. */
const turned = (family: FamilyId, sizes: ExportSize[]): ExportSize[] =>
  sizes.map((s) => ({ ...s, id: `${s.id}-land`, family, label: `${s.label} landscape`, width: s.height, height: s.width, folder: `${s.folder} landscape` }));

const IPHONE_SIZES: ExportSize[] = [
  size({ id: 'ios-6.9', family: 'iphone', store: 'app-store', label: 'iPhone 6.9″', devices: 'iPhone 17 Pro Max, 16 Pro Max', width: 1320, height: 2868, required: true, default: true, folder: 'iPhone 6.9' }),
  size({ id: 'ios-6.9-b', family: 'iphone', store: 'app-store', label: 'iPhone 6.9″ (1290)', devices: 'iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max', width: 1290, height: 2796, required: false, default: false, folder: 'iPhone 6.9 (1290)' }),
  size({ id: 'ios-6.5', family: 'iphone', store: 'app-store', label: 'iPhone 6.5″', devices: 'iPhone 14 Plus, 13 Pro Max, 12 Pro Max', width: 1284, height: 2778, required: false, default: false, folder: 'iPhone 6.5' }),
  size({ id: 'ios-6.5-b', family: 'iphone', store: 'app-store', label: 'iPhone 6.5″ (1242)', devices: 'iPhone 11 Pro Max, XS Max', width: 1242, height: 2688, required: false, default: false, folder: 'iPhone 6.5 (1242)' }),
  size({ id: 'ios-6.3', family: 'iphone', store: 'app-store', label: 'iPhone 6.3″', devices: 'iPhone 17 Pro, 17, 16 Pro', width: 1206, height: 2622, required: true, default: true, folder: 'iPhone 6.3' }),
  size({ id: 'ios-6.1', family: 'iphone', store: 'app-store', label: 'iPhone 6.1″', devices: 'iPhone 17e, 16e, 14, 13, 13 Pro, 12, 12 Pro', width: 1170, height: 2532, required: false, default: false, folder: 'iPhone 6.1' }),
];

const IPAD_SIZES: ExportSize[] = [
  size({ id: 'ipad-13', family: 'ipad', store: 'app-store', label: 'iPad 13″', devices: 'iPad Pro 13″ (M4, M5), iPad Air 13″', width: 2064, height: 2752, required: true, default: true, folder: 'iPad 13' }),
  size({ id: 'ipad-12.9', family: 'ipad', store: 'app-store', label: 'iPad 12.9″', devices: 'iPad Pro 12.9″ (2nd–6th gen)', width: 2048, height: 2732, required: false, default: false, folder: 'iPad 12.9' }),
  size({ id: 'ipad-11', family: 'ipad', store: 'app-store', label: 'iPad 11″', devices: 'iPad Pro 11″ (M4), iPad Air 11″', width: 1668, height: 2420, required: false, default: false, folder: 'iPad 11' }),
];

const PLAY_PHONE_SIZES: ExportSize[] = [
  size({ id: 'play-phone', family: 'android-phone', store: 'google-play', label: 'Phone 1080 × 1920', devices: 'All Android phones (9:16)', width: 1080, height: 1920, required: true, default: true, folder: 'Phone', supplyFolder: 'phoneScreenshots' }),
  size({ id: 'play-phone-hd', family: 'android-phone', store: 'google-play', label: 'Phone 1440 × 2560', devices: 'All Android phones (9:16, high resolution)', width: 1440, height: 2560, required: false, default: false, folder: 'Phone (1440)', supplyFolder: 'phoneScreenshots' }),
];

export const FAMILIES: Record<FamilyId, FamilyInfo> = {
  iphone: {
    id: 'iphone',
    label: 'iPhone',
    shortLabel: 'iPhone',
    stores: ['app-store'],
    design: { width: 1320, height: 2868 },
    aspectClass: 'tall',
    defaultFrame: 'iphone',
    screenAspect: 2868 / 1320,
    maxSlides: 10,
    sizes: IPHONE_SIZES,
  },
  'iphone-landscape': {
    id: 'iphone-landscape',
    label: 'iPhone landscape',
    shortLabel: 'iPhone ↔',
    stores: ['app-store'],
    design: { width: 2868, height: 1320 },
    aspectClass: 'wide',
    defaultFrame: 'iphone',
    screenAspect: 1320 / 2868,
    maxSlides: 10,
    landscape: true,
    sizes: turned('iphone-landscape', IPHONE_SIZES),
  },
  ipad: {
    id: 'ipad',
    label: 'iPad',
    shortLabel: 'iPad',
    stores: ['app-store'],
    design: { width: 2064, height: 2752 },
    aspectClass: 'tablet',
    defaultFrame: 'ipad',
    screenAspect: 2752 / 2064,
    maxSlides: 10,
    sizes: IPAD_SIZES,
  },
  'ipad-landscape': {
    id: 'ipad-landscape',
    label: 'iPad landscape',
    shortLabel: 'iPad ↔',
    stores: ['app-store'],
    design: { width: 2752, height: 2064 },
    aspectClass: 'wide',
    defaultFrame: 'ipad',
    screenAspect: 2064 / 2752,
    maxSlides: 10,
    landscape: true,
    sizes: turned('ipad-landscape', IPAD_SIZES),
  },
  'android-phone': {
    id: 'android-phone',
    label: 'Android phone',
    shortLabel: 'Android',
    stores: ['google-play'],
    design: { width: 1080, height: 1920 },
    aspectClass: 'tall',
    defaultFrame: 'android-phone',
    screenAspect: 2400 / 1080,
    maxSlides: 8,
    sizes: PLAY_PHONE_SIZES,
  },
  'android-landscape': {
    id: 'android-landscape',
    label: 'Android phone landscape',
    shortLabel: 'Android ↔',
    stores: ['google-play'],
    design: { width: 1920, height: 1080 },
    aspectClass: 'wide',
    defaultFrame: 'android-phone',
    screenAspect: 1080 / 2400,
    maxSlides: 8,
    landscape: true,
    sizes: turned('android-landscape', PLAY_PHONE_SIZES),
  },
  'android-tablet': {
    id: 'android-tablet',
    label: 'Android tablet',
    shortLabel: 'Tablet',
    stores: ['google-play'],
    design: { width: 1440, height: 2560 },
    aspectClass: 'tablet',
    defaultFrame: 'android-tablet',
    screenAspect: 2560 / 1600,
    maxSlides: 8,
    sizes: [
      size({ id: 'play-tablet-7', family: 'android-tablet', store: 'google-play', label: '7″ tablet', devices: '7-inch Android tablets (9:16)', width: 1080, height: 1920, required: false, default: true, folder: 'Tablet 7', supplyFolder: 'sevenInchScreenshots' }),
      size({ id: 'play-tablet-10', family: 'android-tablet', store: 'google-play', label: '10″ tablet', devices: '10-inch Android tablets (9:16)', width: 1440, height: 2560, required: false, default: true, folder: 'Tablet 10', supplyFolder: 'tenInchScreenshots' }),
    ],
  },
  mac: {
    id: 'mac',
    label: 'Mac',
    shortLabel: 'Mac',
    stores: ['app-store'],
    design: { width: 2880, height: 1800 },
    aspectClass: 'wide',
    defaultFrame: 'macbook',
    screenAspect: 1800 / 2880,
    maxSlides: 10,
    sizes: [
      size({ id: 'mac-2880', family: 'mac', store: 'app-store', label: 'Mac 2880 × 1800', devices: 'Mac (Retina 16:10)', width: 2880, height: 1800, required: true, default: true, folder: 'Mac 2880' }),
      size({ id: 'mac-2560', family: 'mac', store: 'app-store', label: 'Mac 2560 × 1600', devices: 'Mac (Retina 16:10)', width: 2560, height: 1600, required: false, default: false, folder: 'Mac 2560' }),
      size({ id: 'mac-1440', family: 'mac', store: 'app-store', label: 'Mac 1440 × 900', devices: 'Mac (16:10)', width: 1440, height: 900, required: false, default: false, folder: 'Mac 1440' }),
      size({ id: 'mac-1280', family: 'mac', store: 'app-store', label: 'Mac 1280 × 800', devices: 'Mac (16:10)', width: 1280, height: 800, required: false, default: false, folder: 'Mac 1280' }),
    ],
  },
  watch: {
    id: 'watch',
    label: 'Apple Watch',
    shortLabel: 'Watch',
    stores: ['app-store'],
    design: { width: 422, height: 514 },
    aspectClass: 'tablet',
    defaultFrame: 'watch',
    screenAspect: 514 / 422,
    maxSlides: 10,
    sizes: [
      size({ id: 'watch-ultra-3', family: 'watch', store: 'app-store', label: 'Apple Watch Ultra 3', devices: 'Apple Watch Ultra 3', width: 422, height: 514, required: true, default: true, folder: 'Apple Watch Ultra 3' }),
      size({ id: 'watch-11', family: 'watch', store: 'app-store', label: 'Apple Watch Series 11', devices: 'Apple Watch Series 11, 10', width: 416, height: 496, required: false, default: false, folder: 'Apple Watch Series 11' }),
      size({ id: 'watch-ultra-2', family: 'watch', store: 'app-store', label: 'Apple Watch Ultra 2', devices: 'Apple Watch Ultra 2, Ultra', width: 410, height: 502, required: false, default: false, folder: 'Apple Watch Ultra 2' }),
      size({ id: 'watch-9', family: 'watch', store: 'app-store', label: 'Apple Watch Series 9', devices: 'Apple Watch Series 9, 8, 7', width: 396, height: 484, required: false, default: false, folder: 'Apple Watch Series 9' }),
      size({ id: 'watch-6', family: 'watch', store: 'app-store', label: 'Apple Watch Series 6', devices: 'Apple Watch Series 6, 5, 4, SE', width: 368, height: 448, required: false, default: false, folder: 'Apple Watch Series 6' }),
      size({ id: 'watch-3', family: 'watch', store: 'app-store', label: 'Apple Watch Series 3', devices: 'Apple Watch Series 3', width: 312, height: 390, required: false, default: false, folder: 'Apple Watch Series 3' }),
    ],
  },
  'apple-tv': {
    id: 'apple-tv',
    label: 'Apple TV',
    shortLabel: 'TV',
    stores: ['app-store'],
    design: { width: 3840, height: 2160 },
    aspectClass: 'wide',
    defaultFrame: 'tv',
    screenAspect: 2160 / 3840,
    maxSlides: 10,
    sizes: [
      size({ id: 'tv-4k', family: 'apple-tv', store: 'app-store', label: 'Apple TV 3840 × 2160', devices: 'Apple TV 4K', width: 3840, height: 2160, required: true, default: true, folder: 'Apple TV 4K' }),
      size({ id: 'tv-hd', family: 'apple-tv', store: 'app-store', label: 'Apple TV 1920 × 1080', devices: 'Apple TV HD', width: 1920, height: 1080, required: false, default: false, folder: 'Apple TV' }),
    ],
  },
  vision: {
    id: 'vision',
    label: 'Apple Vision Pro',
    shortLabel: 'Vision',
    stores: ['app-store'],
    design: { width: 3840, height: 2160 },
    aspectClass: 'wide',
    defaultFrame: 'vision',
    screenAspect: 2160 / 3840,
    maxSlides: 10,
    sizes: [
      size({ id: 'vision-pro', family: 'vision', store: 'app-store', label: 'Apple Vision Pro 3840 × 2160', devices: 'Apple Vision Pro', width: 3840, height: 2160, required: true, default: true, folder: 'Apple Vision Pro' }),
    ],
  },
  'play-feature': {
    id: 'play-feature',
    label: 'Play feature graphic',
    shortLabel: 'Feature',
    stores: ['google-play'],
    design: { width: 1024, height: 500 },
    aspectClass: 'wide',
    defaultFrame: 'android-phone',
    screenAspect: 2400 / 1080,
    maxSlides: 1,
    sizes: [
      size({ id: 'play-feature', family: 'play-feature', store: 'google-play', label: 'Feature graphic 1024 × 500', devices: 'Google Play store listing banner', width: 1024, height: 500, required: true, default: true, folder: 'Feature graphic', supplyFolder: 'featureGraphic' }),
    ],
  },
};

export const FAMILY_ORDER: FamilyId[] = [
  'iphone',
  'iphone-landscape',
  'ipad',
  'ipad-landscape',
  'mac',
  'watch',
  'apple-tv',
  'vision',
  'android-phone',
  'android-landscape',
  'android-tablet',
  'play-feature',
];

export const ALL_SIZES: ExportSize[] = FAMILY_ORDER.flatMap((f) => FAMILIES[f].sizes);

export function sizeById(id: string): ExportSize | undefined {
  return ALL_SIZES.find((s) => s.id === id);
}

/* ------------------------------------------------------------------ */
/* Languages                                                           */
/* ------------------------------------------------------------------ */

export interface LanguageInfo {
  /** Canonical code used inside projects. */
  code: LangCode;
  /** English name */
  name: string;
  /** Name in the language itself */
  native: string;
  rtl: boolean;
  /** App Store Connect locale code, or null when the App Store has none. */
  appStore: string | null;
  /** Google Play listing locale code, or null when Google Play has none. */
  play: string | null;
  /** Word-break strategy for text layout. */
  wrap: 'space' | 'char';
}

const L = (code: string, name: string, native: string, appStore: string | null, play: string | null, rtl = false, wrap: 'space' | 'char' = 'space'): LanguageInfo => ({
  code,
  name,
  native,
  rtl,
  appStore,
  play,
  wrap,
});

export const LANGUAGES: LanguageInfo[] = [
  L('en-US', 'English (US)', 'English (US)', 'en-US', 'en-US'),
  L('en-GB', 'English (UK)', 'English (UK)', 'en-GB', 'en-GB'),
  L('en-AU', 'English (Australia)', 'English (Australia)', 'en-AU', 'en-AU'),
  L('en-CA', 'English (Canada)', 'English (Canada)', 'en-CA', 'en-CA'),
  L('ar-SA', 'Arabic', 'العربية', 'ar-SA', 'ar', true),
  L('bn-BD', 'Bangla', 'বাংলা', 'bn-BD', 'bn-BD'),
  L('ca', 'Catalan', 'Català', 'ca', 'ca'),
  L('zh-Hans', 'Chinese (Simplified)', '简体中文', 'zh-Hans', 'zh-CN', false, 'char'),
  L('zh-Hant', 'Chinese (Traditional)', '繁體中文', 'zh-Hant', 'zh-TW', false, 'char'),
  L('hr', 'Croatian', 'Hrvatski', 'hr', 'hr'),
  L('cs', 'Czech', 'Čeština', 'cs', 'cs-CZ'),
  L('da', 'Danish', 'Dansk', 'da', 'da-DK'),
  L('nl-NL', 'Dutch', 'Nederlands', 'nl-NL', 'nl-NL'),
  L('fi', 'Finnish', 'Suomi', 'fi', 'fi-FI'),
  L('fr-FR', 'French', 'Français', 'fr-FR', 'fr-FR'),
  L('fr-CA', 'French (Canada)', 'Français (Canada)', 'fr-CA', 'fr-CA'),
  L('de-DE', 'German', 'Deutsch', 'de-DE', 'de-DE'),
  L('el', 'Greek', 'Ελληνικά', 'el', 'el-GR'),
  L('gu-IN', 'Gujarati', 'ગુજરાતી', 'gu-IN', 'gu'),
  L('he', 'Hebrew', 'עברית', 'he', 'iw-IL', true),
  L('hi', 'Hindi', 'हिन्दी', 'hi', 'hi-IN'),
  L('hu', 'Hungarian', 'Magyar', 'hu', 'hu-HU'),
  L('id', 'Indonesian', 'Bahasa Indonesia', 'id', 'id'),
  L('it', 'Italian', 'Italiano', 'it', 'it-IT'),
  L('ja', 'Japanese', '日本語', 'ja', 'ja-JP', false, 'char'),
  L('kn-IN', 'Kannada', 'ಕನ್ನಡ', 'kn-IN', 'kn-IN'),
  L('ko', 'Korean', '한국어', 'ko', 'ko-KR'),
  L('ms', 'Malay', 'Bahasa Melayu', 'ms', 'ms'),
  L('ml-IN', 'Malayalam', 'മലയാളം', 'ml-IN', 'ml-IN'),
  L('mr-IN', 'Marathi', 'मराठी', 'mr-IN', 'mr-IN'),
  L('no', 'Norwegian', 'Norsk', 'no', 'no-NO'),
  L('or-IN', 'Odia', 'ଓଡ଼ିଆ', 'or-IN', null),
  L('fa', 'Persian', 'فارسی', null, 'fa', true),
  L('pl', 'Polish', 'Polski', 'pl', 'pl-PL'),
  L('pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)', 'pt-BR', 'pt-BR'),
  L('pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)', 'pt-PT', 'pt-PT'),
  L('pa-IN', 'Punjabi', 'ਪੰਜਾਬੀ', 'pa-IN', 'pa'),
  L('ro', 'Romanian', 'Română', 'ro', 'ro'),
  L('ru', 'Russian', 'Русский', 'ru', 'ru-RU'),
  L('sk', 'Slovak', 'Slovenčina', 'sk', 'sk'),
  L('sl-SI', 'Slovenian', 'Slovenščina', 'sl-SI', 'sl'),
  L('es-ES', 'Spanish (Spain)', 'Español (España)', 'es-ES', 'es-ES'),
  L('es-MX', 'Spanish (Mexico)', 'Español (México)', 'es-MX', 'es-419'),
  L('sv', 'Swedish', 'Svenska', 'sv', 'sv-SE'),
  L('ta-IN', 'Tamil', 'தமிழ்', 'ta-IN', 'ta-IN'),
  L('te-IN', 'Telugu', 'తెలుగు', 'te-IN', 'te-IN'),
  L('th', 'Thai', 'ไทย', 'th', 'th', false, 'char'),
  L('tr', 'Turkish', 'Türkçe', 'tr', 'tr-TR'),
  L('uk', 'Ukrainian', 'Українська', 'uk', 'uk'),
  L('ur-PK', 'Urdu', 'اردو', 'ur-PK', 'ur', true),
  L('vi', 'Vietnamese', 'Tiếng Việt', 'vi', 'vi'),
];

export function languageInfo(code: LangCode): LanguageInfo {
  return (
    LANGUAGES.find((l) => l.code === code) ?? {
      code,
      name: code,
      native: code,
      rtl: false,
      appStore: code,
      play: code,
      wrap: 'space',
    }
  );
}

export function isRtl(code: LangCode): boolean {
  return languageInfo(code).rtl;
}

/* ------------------------------------------------------------------ */
/* Bundled fonts                                                       */
/* ------------------------------------------------------------------ */

export interface FontInfo {
  /** CSS family name exactly as registered by @fontsource-variable. */
  family: string;
  label: string;
  category: 'sans' | 'serif' | 'display' | 'arabic' | 'multi';
  /** Variable weight range. */
  weights: [number, number];
  /** Scripts the font covers beyond Latin. */
  scripts: string[];
}

export const BUNDLED_FONTS: FontInfo[] = [
  { family: 'Inter Variable', label: 'Inter', category: 'sans', weights: [100, 900], scripts: ['latin', 'cyrillic', 'greek', 'vietnamese'] },
  { family: 'Plus Jakarta Sans Variable', label: 'Plus Jakarta Sans', category: 'sans', weights: [200, 800], scripts: ['latin', 'vietnamese'] },
  { family: 'Manrope Variable', label: 'Manrope', category: 'sans', weights: [200, 800], scripts: ['latin', 'cyrillic', 'greek'] },
  { family: 'DM Sans Variable', label: 'DM Sans', category: 'sans', weights: [100, 1000], scripts: ['latin'] },
  { family: 'Outfit Variable', label: 'Outfit', category: 'sans', weights: [100, 900], scripts: ['latin'] },
  { family: 'Sora Variable', label: 'Sora', category: 'sans', weights: [100, 800], scripts: ['latin'] },
  { family: 'Space Grotesk Variable', label: 'Space Grotesk', category: 'display', weights: [300, 700], scripts: ['latin', 'vietnamese'] },
  { family: 'Bricolage Grotesque Variable', label: 'Bricolage Grotesque', category: 'display', weights: [200, 800], scripts: ['latin', 'vietnamese'] },
  { family: 'Fraunces Variable', label: 'Fraunces', category: 'serif', weights: [100, 900], scripts: ['latin', 'vietnamese'] },
  { family: 'Playfair Display Variable', label: 'Playfair Display', category: 'serif', weights: [400, 900], scripts: ['latin', 'cyrillic', 'vietnamese'] },
  { family: 'Rubik Variable', label: 'Rubik', category: 'multi', weights: [300, 900], scripts: ['latin', 'cyrillic', 'hebrew'] },
  { family: 'Cairo Variable', label: 'Cairo', category: 'arabic', weights: [200, 1000], scripts: ['latin', 'arabic'] },
  { family: 'Readex Pro Variable', label: 'Readex Pro', category: 'arabic', weights: [160, 700], scripts: ['latin', 'arabic', 'vietnamese'] },
  { family: 'Noto Sans Arabic Variable', label: 'Noto Sans Arabic', category: 'arabic', weights: [100, 900], scripts: ['arabic'] },
];

/**
 * Appended to every font in canvas text so Arabic, Hebrew, CJK and other
 * scripts always find glyphs, even when the chosen font lacks them.
 */
export const FONT_FALLBACK_STACK =
  '"Noto Sans Arabic Variable", "Rubik Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif';

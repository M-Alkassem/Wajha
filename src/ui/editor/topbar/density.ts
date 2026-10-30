/**
 * How much the top bar can show at a given width. The family tabs stay
 * centered between two equal side columns, so the bar needs room for the
 * tabs plus twice the wider side. Family labels go before the language name:
 * telling families apart matters more than reading "English (US)" next to
 * its code.
 */
import type { FamilyId } from '../../../model/types';

export interface TopBarDensity {
  /** Family tabs show their names (else icons with tooltips). */
  familyLabels: boolean;
  /** The language button shows the native name next to the code. */
  languageName: boolean;
}

/** Widths (px) of the top bar parts, measured from the rendered bar (WebKit, system UI font). */
export const TOPBAR_METRICS = {
  /** Outer padding plus the two column gaps. */
  chrome: 44,
  /** Back and sidebar buttons, divider, a short name and the save status. */
  leftMin: 248,
  /**
   * Language button with a native name, history, zoom, more and Export
   * (421 measured with "English (US)"). Longer names still fit: the right
   * column takes its content width and the tabs shift a few pixels.
   */
  rightFull: 424,
  /** The same with only the language code. */
  rightCompact: 344,
  /** An icon-only family tab. */
  tabIcon: 24,
  /** Segmented control padding, gap and the "+" button. */
  tabsExtra: 36,
} as const;

/** Labelled family tab widths (icon, gap, short label, padding). */
const TAB_LABELED: Record<FamilyId, number> = {
  iphone: 80,
  ipad: 66,
  'android-phone': 86,
  'android-tablet': 76,
  mac: 64,
  'play-feature': 84,
};

/** Width the bar needs for a combination. */
export function topBarNeeds(families: readonly FamilyId[], d: TopBarDensity, insetLeft = 0): number {
  const m = TOPBAR_METRICS;
  const list = families.length ? families : (['iphone'] as const);
  const tabs = list.reduce((sum, f) => sum + (d.familyLabels ? (TAB_LABELED[f] ?? 86) : m.tabIcon), 0);
  const side = Math.max(m.leftMin + Math.max(0, insetLeft), d.languageName ? m.rightFull : m.rightCompact);
  return m.chrome + tabs + m.tabsExtra + 2 * side;
}

const ORDER: readonly TopBarDensity[] = [
  { familyLabels: true, languageName: true },
  { familyLabels: true, languageName: false },
  { familyLabels: false, languageName: true },
  { familyLabels: false, languageName: false },
];

/** The richest density that fits `width`; the most compact one when nothing fits. */
export function topBarDensity(width: number, families: readonly FamilyId[], insetLeft = 0): TopBarDensity {
  if (!(width > 0)) return ORDER[0];
  for (const d of ORDER) if (topBarNeeds(families, d, insetLeft) <= width) return d;
  return ORDER[ORDER.length - 1];
}

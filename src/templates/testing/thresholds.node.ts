/**
 * Contrast rules the built-in templates must meet (WCAG ratios). Headlines
 * are large display text (3:1); subtitles and small labels are body text
 * (4.5:1). `low` guards against part of a text sitting on a busy area.
 */
import type { TextContrast } from './inspect.node';

export const CONTRAST_MIN = {
  headline: 3,
  text: 4.5,
  /** Highlighted words in headlines (large text). */
  highlight: 3,
  /** 10th-percentile sample, relative to the rule above. */
  lowFactor: 0.75,
} as const;

/** Human-readable failures for a slide's measurements. */
export function contrastFailures(rows: TextContrast[], where: string): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const min = r.key === 'headline' ? CONTRAST_MIN.headline : CONTRAST_MIN.text;
    const tag = `${where} slide ${r.slide + 1} ${r.key} on ${r.background}`;
    if (r.text < min) out.push(`${tag}: text ${r.text.toFixed(2)} < ${min}`);
    if (r.low < min * CONTRAST_MIN.lowFactor) out.push(`${tag}: part of the text ${r.low.toFixed(2)} < ${(min * CONTRAST_MIN.lowFactor).toFixed(2)}`);
    if (r.highlight !== null && r.highlight < (r.key === 'headline' ? CONTRAST_MIN.highlight : min)) out.push(`${tag}: highlight ${r.highlight.toFixed(2)}`);
  }
  return out;
}

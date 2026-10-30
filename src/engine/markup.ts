/**
 * Slide text markup. Users type plain text with three conventions:
 *   *word*   highlighted run (toggles, so "*a* b *c*" highlights a and c)
 *   \*       a literal asterisk
 *   newline  hard line break (CR LF, CR and the Unicode line/paragraph
 *            separators are treated the same, since CSV imports carry them)
 * When the number of unescaped asterisks is odd, the last one is literal, so
 * "5* rating" and "*unfinished" never turn the rest of a text into a highlight.
 */
import { engineCache } from './cache';

export interface MarkupRun {
  readonly text: string;
  readonly highlighted: boolean;
}

/** One hard-broken line of text; empty for blank lines. */
export type MarkupParagraph = readonly MarkupRun[];

const parsed = engineCache<string, readonly MarkupParagraph[]>(256);

/** Parses markup into paragraphs of runs. Adjacent runs never share the same highlight state. */
export function parseMarkup(text: string): readonly MarkupParagraph[] {
  const source = typeof text === 'string' ? text : '';
  const hit = parsed.get(source);
  if (hit) return hit;

  const src = source.replace(/\r\n?|[\u2028\u2029]/g, '\n');
  let toggles = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\' && src[i + 1] === '*') i++;
    else if (src[i] === '*') toggles++;
  }
  const lastIsLiteral = toggles % 2 === 1;

  const paragraphs: MarkupParagraph[] = [];
  let runs: MarkupRun[] = [];
  let buf = '';
  let highlighted = false;
  let seen = 0;
  const flush = () => {
    if (!buf) return;
    const last = runs[runs.length - 1];
    // Empty toggles ("a**b") would otherwise leave two plain runs side by side.
    if (last && last.highlighted === highlighted) runs[runs.length - 1] = { text: last.text + buf, highlighted };
    else runs.push({ text: buf, highlighted });
    buf = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '*') {
      buf += '*';
      i++;
    } else if (ch === '*') {
      seen++;
      if (lastIsLiteral && seen === toggles) {
        buf += '*';
      } else {
        flush();
        highlighted = !highlighted;
      }
    } else if (ch === '\n') {
      flush();
      paragraphs.push(Object.freeze(runs.map((r) => Object.freeze(r))));
      runs = [];
    } else {
      buf += ch;
    }
  }
  flush();
  paragraphs.push(Object.freeze(runs.map((r) => Object.freeze(r))));

  const result = Object.freeze(paragraphs);
  parsed.set(source, result);
  return result;
}

/** The text with markup removed (for character counts, accessibility labels, search). */
export function plainText(text: string): string {
  return parseMarkup(text)
    .map((p) => p.map((r) => r.text).join(''))
    .join('\n');
}

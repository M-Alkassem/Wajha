/**
 * The "highlight" button of the text field: toggles *highlight* markup on
 * the selected words. Works on what the text shows, not on its source, so
 * selecting across existing markers, escaped asterisks (\*) and line breaks
 * does the expected thing. Follows the engine's markup rules (see
 * engine/markup.ts): unescaped "*" toggles, "\*" is literal, and with an odd
 * number of toggles the last "*" is literal.
 */

export interface TextSelection {
  text: string;
  /** Selection in UTF-16 offsets of `text`. */
  start: number;
  end: number;
}

interface Glyph {
  /** One code point (or a whole "\*" escape rendered as "*"). */
  ch: string;
  /** Literal asterisk: must be written back escaped. */
  literal: boolean;
  highlighted: boolean;
  /** Source offsets of the glyph, including an escape backslash. */
  from: number;
  to: number;
}

const WORD = /[\p{L}\p{N}\p{M}\p{Pc}'’-]/u;
const SPACE = /\s/u;

/** Visible characters of markup text with their highlight state. */
function glyphsOf(text: string): Glyph[] {
  let toggles = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '*') i++;
    else if (text[i] === '*') toggles++;
  }
  const lastIsLiteral = toggles % 2 === 1;
  const out: Glyph[] = [];
  let on = false;
  let seen = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] === '*') {
      out.push({ ch: '*', literal: true, highlighted: on, from: i, to: i + 2 });
      i += 2;
      continue;
    }
    if (text[i] === '*') {
      seen++;
      if (lastIsLiteral && seen === toggles) out.push({ ch: '*', literal: true, highlighted: on, from: i, to: i + 1 });
      else on = !on;
      i++;
      continue;
    }
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    out.push({ ch, literal: false, highlighted: on, from: i, to: i + ch.length });
    i += ch.length;
  }
  return out;
}

/** Index of the first glyph that starts at or after `offset`. */
function glyphIndexAt(glyphs: readonly Glyph[], offset: number): number {
  let i = 0;
  while (i < glyphs.length && glyphs[i].from < offset) i++;
  return i;
}

/** Writes glyphs back as markup and reports where glyph `a` starts and glyph `b - 1` ends. */
function serialize(glyphs: readonly Glyph[], a: number, b: number): TextSelection {
  let out = '';
  let on = false;
  let start = -1;
  let end = -1;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    // Line breaks carry the state across: toggling around them would only add noise.
    const want: boolean = g.ch === '\n' ? on : g.highlighted;
    if (want !== on) {
      out += '*';
      on = want;
    }
    if (i === a) start = out.length;
    out += g.literal ? '\\*' : g.ch;
    if (i === b - 1) end = out.length;
  }
  if (on) out += '*';
  if (start < 0) start = out.length;
  if (end < 0) end = start;
  return { text: out, start, end };
}

/**
 * Toggles highlighting on the selected text: highlights it unless every
 * selected word already is, in which case the highlight is removed. A caret
 * inside a word acts on that word; a caret elsewhere inserts an empty "**"
 * pair and puts the caret between the asterisks.
 */
export function toggleHighlight(text: string, selStart: number, selEnd: number): TextSelection {
  const len = text.length;
  let s = Math.max(0, Math.min(len, Math.min(selStart, selEnd)));
  let e = Math.max(0, Math.min(len, Math.max(selStart, selEnd)));
  if (!Number.isFinite(s) || !Number.isFinite(e)) s = e = len;
  const glyphs = glyphsOf(text);

  let a = glyphIndexAt(glyphs, s);
  let b = glyphIndexAt(glyphs, e);

  if (a === b) {
    // Caret: grow to the word around it.
    while (a > 0 && WORD.test(glyphs[a - 1].ch)) a--;
    while (b < glyphs.length && WORD.test(glyphs[b].ch)) b++;
    if (a === b) {
      const at = s;
      return { text: `${text.slice(0, at)}**${text.slice(at)}`, start: at + 1, end: at + 1 };
    }
  }

  // Markers hug the words: leading and trailing spaces stay outside.
  while (a < b && SPACE.test(glyphs[a].ch)) a++;
  while (b > a && SPACE.test(glyphs[b - 1].ch)) b--;
  if (a === b) return { text, start: s, end: e };

  const words = glyphs.slice(a, b).filter((g) => !SPACE.test(g.ch));
  const highlight = !words.every((g) => g.highlighted);
  const next = glyphs.map((g, i) => (i >= a && i < b ? { ...g, highlighted: highlight } : g));
  return serialize(next, a, b);
}

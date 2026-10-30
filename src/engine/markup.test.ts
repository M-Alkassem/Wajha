import { describe, expect, it } from 'vitest';
import { parseMarkup, plainText } from './markup';

const flat = (text: string) => parseMarkup(text).map((p) => p.map((r) => (r.highlighted ? `[${r.text}]` : r.text)).join(''));

describe('parseMarkup', () => {
  it('returns one empty paragraph for empty text', () => {
    expect(parseMarkup('')).toEqual([[]]);
  });

  it('keeps plain text as one run', () => {
    expect(parseMarkup('Track your habits')).toEqual([[{ text: 'Track your habits', highlighted: false }]]);
  });

  it('highlights *words* and toggles', () => {
    expect(flat('Track *every* habit')).toEqual(['Track [every] habit']);
    expect(flat('*a* b *c*')).toEqual(['[a] b [c]']);
    expect(flat('*all of it*')).toEqual(['[all of it]']);
  });

  it('treats nested-looking asterisks as toggles', () => {
    expect(flat('*a *b* c*')).toEqual(['[a ]b[ c]']);
  });

  it('keeps escaped asterisks literal', () => {
    expect(flat('5\\* rating')).toEqual(['5* rating']);
    expect(flat('*\\*star\\**')).toEqual(['[*star*]']);
    expect(flat('a\\b')).toEqual(['a\\b']);
  });

  it('keeps an unbalanced trailing asterisk literal', () => {
    expect(flat('5* rating')).toEqual(['5* rating']);
    expect(flat('*Fast* and 5* rated')).toEqual(['[Fast] and 5* rated']);
    expect(flat('*unclosed')).toEqual(['*unclosed']);
    expect(flat('*')).toEqual(['*']);
  });

  it('drops empty toggles without splitting runs', () => {
    expect(parseMarkup('a**b')).toEqual([[{ text: 'ab', highlighted: false }]]);
    expect(parseMarkup('**')).toEqual([[]]);
  });

  it('splits paragraphs on every newline flavour and keeps highlight state across them', () => {
    expect(flat('one\ntwo')).toEqual(['one', 'two']);
    expect(flat('one\r\ntwo\rthree\u2028four')).toEqual(['one', 'two', 'three', 'four']);
    expect(flat('a\n\nb')).toEqual(['a', '', 'b']);
    expect(flat('*big\nidea*')).toEqual(['[big]', '[idea]']);
    expect(flat('trailing\n')).toEqual(['trailing', '']);
  });

  it('handles unicode text untouched', () => {
    expect(flat('تتبع *عاداتك* اليومية')).toEqual(['تتبع [عاداتك] اليومية']);
    expect(flat('👩\u200d👩\u200d👧 *家族* 🇯🇵')).toEqual(['👩\u200d👩\u200d👧 [家族] 🇯🇵']);
  });

  it('caches and freezes results', () => {
    const a = parseMarkup('cache *me*');
    expect(parseMarkup('cache *me*')).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0][0])).toBe(true);
  });

  it('survives non-string and huge input', () => {
    expect(parseMarkup(undefined as unknown as string)).toEqual([[]]);
    const big = 'word *hl* '.repeat(5000);
    const out = parseMarkup(big);
    expect(out).toHaveLength(1);
    expect(out[0].filter((r) => r.highlighted)).toHaveLength(5000);
  });
});

describe('plainText', () => {
  it('strips markup', () => {
    expect(plainText('Track *every* habit\n5\\* rated')).toBe('Track every habit\n5* rated');
  });
});

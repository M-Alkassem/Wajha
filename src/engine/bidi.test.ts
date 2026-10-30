import { describe, expect, it } from 'vitest';
import { AL, AN, BIDI_RANGES, bidiClass, CS, EN, ES, ET, isUnidirectional, L, NSM, ON, R, resolveLevels, strongDirections, visualOrder, WS } from './bidi';

/** Characters of `text` in visual order (left to right) using the resolved levels. */
function visual(text: string, rtl: boolean): string {
  const levels = resolveLevels(text, rtl);
  const chars = [...text];
  // Map code-point index -> UTF-16 level (both halves share a level).
  const lv: number[] = [];
  let i = 0;
  for (const ch of chars) {
    lv.push(levels[i]);
    i += ch.length;
  }
  return visualOrder(lv)
    .map((k) => chars[k])
    .join('');
}

describe('class table', () => {
  it('is sorted and non-overlapping', () => {
    for (let i = 0; i < BIDI_RANGES.length; i++) {
      const [a, b] = BIDI_RANGES[i];
      expect(a).toBeLessThanOrEqual(b);
      if (i > 0) expect(a).toBeGreaterThan(BIDI_RANGES[i - 1][1]);
    }
  });

  it('classifies representative characters', () => {
    const c = (s: string) => bidiClass(s.codePointAt(0) ?? 0);
    expect(c('A')).toBe(L);
    expect(c('é')).toBe(L);
    expect(c('Ж')).toBe(L);
    expect(c('漢')).toBe(L);
    expect(c('א')).toBe(R);
    expect(c('ب')).toBe(AL);
    expect(c('ی')).toBe(AL);
    expect(c('5')).toBe(EN);
    expect(c('۵')).toBe(EN); // Persian digits are European numbers in UAX #9
    expect(c('٥')).toBe(AN);
    expect(c('+')).toBe(ES);
    expect(c('%')).toBe(ET);
    expect(c('€')).toBe(ET);
    expect(c(',')).toBe(CS);
    expect(c('،')).toBe(CS);
    expect(c(' ')).toBe(WS);
    expect(c('!')).toBe(ON);
    expect(c('😀')).toBe(ON);
    expect(c('َ')).toBe(NSM); // fatha
    expect(c('\u200f')).toBe(R); // RLM
  });

  it('reports strong directions', () => {
    expect(strongDirections('hello 123')).toEqual({ ltr: true, rtl: false });
    expect(strongDirections('مرحبا 123')).toEqual({ ltr: false, rtl: true });
    expect(strongDirections('Wajha مرحبا')).toEqual({ ltr: true, rtl: true });
    expect(strongDirections('123 !?')).toEqual({ ltr: false, rtl: false });
  });
});

describe('resolveLevels', () => {
  it('keeps pure left-to-right text at level 0', () => {
    expect([...resolveLevels('Hello, world 42!', false)].every((l) => l === 0)).toBe(true);
  });

  it('puts Arabic at level 1 and Latin/digits at level 2 in an RTL paragraph', () => {
    const text = 'اشترك في Wajha 2024';
    const lv = resolveLevels(text, true);
    expect(lv[0]).toBe(1);
    expect(lv[text.indexOf('W')]).toBe(2);
    expect(lv[text.indexOf('2')]).toBe(2);
    // The space between two Latin words stays with them; the one after Arabic is RTL.
    expect(lv[text.indexOf('a 2') + 1]).toBe(2);
    expect(lv[text.indexOf(' ')]).toBe(1);
  });

  it('turns European digits after Arabic letters into Arabic numbers (level 2, not joined to Latin)', () => {
    const lv = resolveLevels('عدد 12', true);
    expect(lv[4]).toBe(2);
    expect(lv[5]).toBe(2);
  });

  it('joins numbers across a single separator and keeps percent signs with them', () => {
    const text = 'הנחה 1,500% עכשיו';
    const lv = resolveLevels(text, true);
    const s = text.indexOf('1');
    for (let i = s; i < s + 6; i++) expect(lv[i]).toBe(2);
  });

  it('treats digits after Arabic letters as Arabic numbers, so a following % is neutral (UAX #9 W2, W5)', () => {
    const text = 'خصم 1,500% الآن';
    const lv = resolveLevels(text, true);
    const s = text.indexOf('1');
    for (let i = s; i < s + 5; i++) expect(lv[i]).toBe(2);
    expect(lv[text.indexOf('%')]).toBe(1);
  });

  it('keeps bracket pairs with the text they enclose (N0)', () => {
    const level = (text: string, rtl: boolean, ch: string) => resolveLevels(text, rtl)[text.indexOf(ch)];
    // Latin in brackets right after Latin, in Arabic text: both brackets go with the Latin words.
    expect(level('جديد Wajha (Pro)', true, '(')).toBe(2);
    expect(level('جديد Wajha (Pro)', true, ')')).toBe(2);
    expect(level('اشترك في Wajha (Pro) اليوم', true, ')')).toBe(2);
    expect(level('جديد Wajha (Pro [Max])', true, ')')).toBe(2);
    expect(level('جديد Wajha (Pro [Max])', true, ']')).toBe(2);
    // After Arabic, the brackets keep the paragraph direction.
    expect(level('تطبيق (Pro) الجديد', true, '(')).toBe(1);
    expect(level('تطبيق (Pro) الجديد', true, ')')).toBe(1);
    // Arabic in brackets after Arabic, in English text.
    expect(level('Now in العربية (جديد) too', false, '(')).toBe(1);
    expect(level('Now in العربية (جديد) too', false, ')')).toBe(1);
    // Text of the paragraph direction inside the brackets wins; numbers count as R.
    expect(level('Wajha (Pro مرحبا) اليوم', true, ')')).toBe(1);
    expect(level('Get (٥٠) now', false, '(')).toBe(0);
    // Unpaired brackets are ordinary neutrals; a mark on a bracket follows it.
    expect(level('Wajha (Pro اليوم', true, '(')).toBe(2);
    expect(level('جديد Wajha (Pro]', true, ']')).toBe(1);
    const marked = 'جديد Wajha (Pro)́';
    expect(resolveLevels(marked, true)[marked.length - 1]).toBe(2);
  });

  it('returns trailing whitespace to the paragraph level', () => {
    const lv = resolveLevels('abc  ', true);
    expect(lv[3]).toBe(1);
    expect(lv[4]).toBe(1);
  });

  it('handles surrogate pairs and empty strings', () => {
    expect(resolveLevels('', true)).toHaveLength(0);
    const lv = resolveLevels('😀 مرحبا', false);
    expect(lv).toHaveLength('😀 مرحبا'.length);
    expect(lv[0]).toBe(lv[1]);
  });
});

describe('isUnidirectional', () => {
  const sameAsLevels = (text: string, rtl: boolean) => resolveLevels(text, rtl).every((l) => l === (rtl ? 1 : 0));

  it('tells lines that read in one direction from lines that need reordering', () => {
    expect(isUnidirectional('Track every habit, 24/7!', false)).toBe(true);
    expect(isUnidirectional('تتبع عاداتك اليومية!', true)).toBe(true);
    expect(isUnidirectional('', true)).toBe(true);
    // Digits read left to right inside right-to-left text, Arabic-Indic ones too.
    expect(isUnidirectional('خصم 50% اليوم', true)).toBe(false);
    expect(isUnidirectional('خصم ٥٠٪ اليوم', true)).toBe(false);
    expect(isUnidirectional('תמונה ²', true)).toBe(false);
    expect(isUnidirectional('iOS 18 جديد كلياً', true)).toBe(false);
    expect(isUnidirectional('Now in العربية too', false)).toBe(false);
    expect(isUnidirectional('Price ١٢٣', false)).toBe(false);
    // Marks and joiners belong to the letter before them.
    expect(isUnidirectional('كلياً‍', true)).toBe(true);
  });

  it('agrees with resolveLevels on every mix of character classes', () => {
    // One sample per class, plus surrogate pairs (emoji, a Hebrew-range supplementary letter).
    const alphabet = ['a', 'Ж', 'א', 'ب', '5', '۵', '٥', '+', '%', '$', ',', '.', '،', 'ً', '́', '​', '⁠', ' ', '\t', '!', '(', ')', '[', ']', '😀', '𐤀', '²'];
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let n = 0; n < 4000; n++) {
      let s = '';
      const len = 1 + (next() % 7);
      for (let k = 0; k < len; k++) s += alphabet[next() % alphabet.length];
      for (const rtl of [false, true]) expect(isUnidirectional(s, rtl), `${JSON.stringify(s)} rtl=${rtl}`).toBe(sameAsLevels(s, rtl));
    }
  });
});

describe('visual order', () => {
  it('reverses right-to-left text', () => {
    expect(visual('אבג', true)).toBe('גבא');
  });

  it('keeps embedded Latin phrases readable inside RTL text', () => {
    expect(visual('אב Wajha Pro גד', true)).toBe('דג Wajha Pro בא');
  });

  it('places an RTL phrase correctly inside LTR text', () => {
    expect(visual('Try אבג today', false)).toBe('Try גבא today');
  });

  it('keeps numbers left-to-right in RTL paragraphs', () => {
    expect(visual('אב 123 גד', true)).toBe('דג 123 בא');
  });

  it('orders items by level (L2)', () => {
    expect(visualOrder([0, 0, 0])).toEqual([0, 1, 2]);
    expect(visualOrder([1, 1, 1])).toEqual([2, 1, 0]);
    expect(visualOrder([1, 2, 2, 1])).toEqual([3, 1, 2, 0]);
    expect(visualOrder([0, 1, 2])).toEqual([0, 2, 1]);
    expect(visualOrder([])).toEqual([]);
  });
});

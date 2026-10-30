import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../engine/markup';
import { toggleHighlight } from './highlight';

/** The highlighted words of a markup text, as the engine sees them. */
function highlighted(text: string): string[] {
  return parseMarkup(text).flatMap((p) => p.filter((r) => r.highlighted).map((r) => r.text));
}

const sel = (text: string, word: string) => {
  const start = text.indexOf(word);
  return [start, start + word.length] as const;
};

describe('toggleHighlight', () => {
  it('wraps the selection and keeps the words selected', () => {
    const text = 'Track every habit';
    const r = toggleHighlight(text, ...sel(text, 'habit'));
    expect(r.text).toBe('Track every *habit*');
    expect(r.text.slice(r.start, r.end)).toBe('habit');
  });

  it('removes the highlight when every selected word already has it', () => {
    const text = 'Track every *habit*';
    const r = toggleHighlight(text, ...sel(text, 'habit'));
    expect(r.text).toBe('Track every habit');
    expect(r.text.slice(r.start, r.end)).toBe('habit');
  });

  it('treats a selection that includes the markers like the words inside', () => {
    const text = 'Track every *habit*';
    const r = toggleHighlight(text, ...sel(text, '*habit*'));
    expect(r.text).toBe('Track every habit');
  });

  it('extends a partial highlight over the whole selection', () => {
    const text = 'Track every *habit*';
    const r = toggleHighlight(text, ...sel(text, 'every *ha'));
    expect(r.text).toBe('Track *every habit*');
    expect(highlighted(r.text)).toEqual(['every habit']);
    expect(r.text.slice(r.start, r.end)).toBe('every ha');
  });

  it('keeps spaces at the edges of the selection outside the markers', () => {
    const text = 'one two three';
    const r = toggleHighlight(text, 3, 8);
    expect(r.text).toBe('one *two* three');
  });

  it('acts on the word around a collapsed caret', () => {
    const text = 'Sleep better tonight';
    const caret = text.indexOf('better') + 2;
    const r = toggleHighlight(text, caret, caret);
    expect(r.text).toBe('Sleep *better* tonight');
    expect(r.text.slice(r.start, r.end)).toBe('better');
  });

  it('inserts an empty pair when the caret is not in a word', () => {
    const r = toggleHighlight('Hello ', 6, 6);
    expect(r.text).toBe('Hello **');
    expect(r.start).toBe(7);
    expect(r.end).toBe(7);
    const empty = toggleHighlight('', 0, 0);
    expect(empty).toEqual({ text: '**', start: 1, end: 1 });
  });

  it('leaves escaped asterisks literal', () => {
    const text = '5\\* rated app';
    const r = toggleHighlight(text, ...sel(text, 'rated'));
    expect(r.text).toBe('5\\* *rated* app');
    expect(highlighted(r.text)).toEqual(['rated']);
  });

  it('keeps an unmatched trailing asterisk literal, escaping it', () => {
    const text = 'Rated 5* by users';
    const r = toggleHighlight(text, ...sel(text, 'users'));
    expect(highlighted(r.text)).toEqual(['users']);
    expect(parseMarkup(r.text)[0].map((x) => x.text).join('')).toBe('Rated 5* by users');
  });

  it('works across line breaks', () => {
    const text = 'All your notes\nin one place';
    const r = toggleHighlight(text, 0, text.length);
    expect(r.text).toBe('*All your notes\nin one place*');
    expect(highlighted(r.text)).toEqual(['All your notes', 'in one place']);
    const back = toggleHighlight(r.text, ...sel(r.text, 'one place'));
    expect(highlighted(back.text)).toEqual(['All your notes', 'in ']);
  });

  it('handles Arabic words and diacritics', () => {
    const text = 'تتبّع كل عاداتك';
    const caret = text.indexOf('عاداتك') + 1;
    const r = toggleHighlight(text, caret, caret);
    expect(r.text).toBe('تتبّع كل *عاداتك*');
    const first = toggleHighlight(text, 2, 2);
    expect(first.text).toBe('*تتبّع* كل عاداتك');
  });

  it('never splits emoji', () => {
    const text = 'Go 🚀 now';
    const r = toggleHighlight(text, 0, text.length);
    expect(r.text).toBe('*Go 🚀 now*');
  });

  it('does nothing for a selection of spaces only', () => {
    expect(toggleHighlight('a   b', 1, 4)).toEqual({ text: 'a   b', start: 1, end: 4 });
  });

  it('accepts reversed and out-of-range selections', () => {
    const r = toggleHighlight('hello', 99, -3);
    expect(r.text).toBe('*hello*');
  });
});

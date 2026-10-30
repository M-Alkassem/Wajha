import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS } from '../model/catalog';
import { TEMPLATE_CATEGORIES, projectFromTemplate } from '../model/instantiate';
import { TEMPLATE_ID_RE } from '../model/rules';
import type { SlideLayout, Template } from '../model/types';
import { validateProject, validateTemplate } from '../model/validate';
import { BUILTIN_TEMPLATES, builtinTemplate } from './index';
import { BUILD_PROBLEMS, elementsOverlap, mockAppAt } from './kit';

const FONT_NAMES = new Set(BUNDLED_FONTS.map((f) => f.family));

const layoutsOf = (t: Template): [string, SlideLayout][] =>
  t.slides.flatMap((s, i) =>
    (['tall', 'tablet', 'wide'] as const).flatMap((cls) => {
      const l = s.layouts[cls];
      return l ? [[`slide ${i + 1} ${cls}`, l] as [string, SlideLayout]] : [];
    }),
  );

describe('built-in templates', () => {
  it('ships 20 templates with unique kebab-case ids and names', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(20);
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(TEMPLATE_ID_RE);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.name)).size).toBe(ids.length);
  });

  it('covers every category, with at least two templates each', () => {
    for (const c of TEMPLATE_CATEGORIES) expect(BUILTIN_TEMPLATES.filter((t) => t.category === c).length, c).toBeGreaterThanOrEqual(2);
  });

  it('builds without problems', () => {
    expect(BUILD_PROBLEMS).toEqual([]);
  });

  it('finds templates by id', () => {
    expect(builtinTemplate(BUILTIN_TEMPLATES[3].id)).toBe(BUILTIN_TEMPLATES[3]);
    expect(builtinTemplate('no-such-template')).toBeUndefined();
  });

  it('uses every bundled font somewhere', () => {
    const used = new Set<string>();
    for (const t of BUILTIN_TEMPLATES) {
      used.add(t.theme.fonts.heading);
      used.add(t.theme.fonts.body);
      for (const [, l] of layoutsOf(t)) for (const el of l.elements) if (el.kind === 'text') used.add(el.style.font);
    }
    expect([...FONT_NAMES].filter((f) => !used.has(f))).toEqual([]);
  });

  it('gives at least six templates tablet and wide layouts on every slide', () => {
    const full = BUILTIN_TEMPLATES.filter((t) => t.slides.every((s) => s.layouts.tablet && s.layouts.wide));
    expect(full.length).toBeGreaterThanOrEqual(6);
  });

  it('has German copy for at least five templates', () => {
    const german = BUILTIN_TEMPLATES.filter((t) => t.slides.every((s) => s.texts['de-DE']));
    expect(german.length).toBeGreaterThanOrEqual(5);
  });

  it('marks exactly the panorama templates as panoramic', () => {
    for (const t of BUILTIN_TEMPLATES) expect(t.theme.panorama, t.id).toBe(t.category === 'panorama');
  });

  it('designs every canvas shape of the panorama templates', () => {
    // Adapting a layout cannot keep decorations on the seams and keep them clear of the copy.
    for (const t of BUILTIN_TEMPLATES.filter((x) => x.theme.panorama)) {
      t.slides.forEach((s, i) => expect(!!(s.layouts.tablet && s.layouts.wide), `${t.id} slide ${i + 1}`).toBe(true));
    }
  });

  it('varies the mock screens within each template', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const apps = t.slides.map((s, i) => {
        const index = s.layouts.tall.elements.findIndex((e) => e.kind === 'device');
        return index < 0 ? null : mockAppAt(i, index);
      });
      const shown = apps.filter((a) => a !== null);
      // Consecutive slides never repeat a screen.
      for (let i = 1; i < apps.length; i++) if (apps[i] && apps[i - 1]) expect(apps[i], `${t.id} slide ${i + 1}`).not.toBe(apps[i - 1]);
      expect(new Set(shown).size, t.id).toBeGreaterThanOrEqual(Math.min(3, shown.length));
    }
  });

  for (const t of BUILTIN_TEMPLATES) {
    describe(t.id, () => {
      it('is already in canonical form (validateTemplate changes nothing)', () => {
        expect(validateTemplate(JSON.parse(JSON.stringify(t)))).toEqual(t);
      });

      it('has five slides with sample copy in English and Arabic for every text it shows', () => {
        expect(t.slides).toHaveLength(5);
        expect(t.name.length).toBeGreaterThan(2);
        expect(t.description.length).toBeGreaterThan(40);
        expect(t.tags.length).toBeGreaterThanOrEqual(3);
        t.slides.forEach((s, i) => {
          const keys = new Set<string>();
          for (const l of [s.layouts.tall, s.layouts.tablet, s.layouts.wide]) for (const el of l?.elements ?? []) if (el.kind === 'text') keys.add(el.key);
          expect(keys.size, `slide ${i + 1}`).toBeGreaterThan(0);
          for (const lang of ['en-US', 'ar-SA', ...(s.texts['de-DE'] ? ['de-DE'] : [])]) {
            for (const key of keys) expect(s.texts[lang]?.[key]?.trim(), `slide ${i + 1} ${lang} ${key}`).toBeTruthy();
            // No stray keys either: every sample text is shown somewhere.
            expect(Object.keys(s.texts[lang]).sort(), `slide ${i + 1} ${lang}`).toEqual([...keys].sort());
          }
          // Arabic copy is written in Arabic, not left in English.
          for (const key of keys) expect(s.texts['ar-SA'][key], `slide ${i + 1} ar ${key}`).toMatch(/[؀-ۿ]/);
        });
      });

      it('highlights one phrase in every headline', () => {
        t.slides.forEach((s, i) => {
          for (const lang of Object.keys(s.texts)) {
            const h = s.texts[lang].headline;
            if (h === undefined) continue;
            expect((h.match(/\*/g) ?? []).length, `slide ${i + 1} ${lang}: ${h}`).toBe(2);
          }
        });
      });

      it('uses unique element ids per layout and bundled fonts only', () => {
        for (const [where, l] of layoutsOf(t)) {
          const ids = l.elements.map((e) => e.id);
          expect(new Set(ids).size, where).toBe(ids.length);
          for (const el of l.elements) if (el.kind === 'text') expect(FONT_NAMES.has(el.style.font), `${where} ${el.id} ${el.style.font}`).toBe(true);
          expect(l.elements.some((e) => e.kind === 'text'), where).toBe(true);
        }
        expect(FONT_NAMES.has(t.theme.fonts.heading)).toBe(true);
        expect(FONT_NAMES.has(t.theme.fonts.body)).toBe(true);
      });

      it('keeps every text box clear of every device', () => {
        // Whole boxes (full width, maxLines lines): right-to-left copy hugs the other edge of its box,
        // and longer translations fill more lines, so the space must be free whatever the text.
        const problems: string[] = [];
        t.slides.forEach((s, i) => {
          for (const cls of ['tall', 'tablet', 'wide'] as const) {
            const els = s.layouts[cls]?.elements ?? [];
            for (const text of els.filter((e) => e.kind === 'text')) {
              for (const dev of els.filter((e) => e.kind === 'device')) {
                if (elementsOverlap(text, dev, cls, { effects: false, margin: 0.03 })) problems.push(`slide ${i + 1} ${cls}: ${text.id} touches ${dev.id}`);
              }
            }
          }
        });
        expect(problems).toEqual([]);
      });

      it('keeps the same element ids across the class layouts of a slide', () => {
        t.slides.forEach((s, i) => {
          const tall = new Set(s.layouts.tall.elements.filter((e) => e.kind !== 'shape').map((e) => e.id));
          for (const l of [s.layouts.tablet, s.layouts.wide]) {
            if (!l) continue;
            for (const el of l.elements) if (el.kind === 'text') expect(tall.has(el.id), `slide ${i + 1} ${el.id}`).toBe(true);
          }
        });
      });

      it('has a palette whose first colour is a usable accent', () => {
        expect(t.theme.palette.length).toBeGreaterThanOrEqual(4);
        expect(t.theme.palette[0]).toMatch(/^#[0-9a-f]{6}$/);
      });

      it('instantiates into a valid project for every family', () => {
        const p = projectFromTemplate(t, { name: 'x', families: ['iphone', 'ipad', 'android-phone', 'android-tablet', 'mac', 'play-feature'], languages: ['en-US', 'ar-SA', 'de-DE', 'ja'] });
        expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
        expect(p.slides).toHaveLength(5);
        // Sample copy only in the languages the template is written in; the rest fall back to the base text.
        expect(p.slides[0].texts['en-US']).toEqual(t.slides[0].texts['en-US']);
        expect(p.slides[0].texts['ar-SA']).toEqual(t.slides[0].texts['ar-SA']);
        expect(p.slides[0].texts['de-DE']).toEqual(t.slides[0].texts['de-DE']);
        expect(p.slides[0].texts.ja).toBeUndefined();
        // Android follows the iPhone layout; only other canvas shapes the template designs are stored.
        for (const s of p.slides) expect(s.layouts['android-phone']).toBeUndefined();
      });
    });
  }
});

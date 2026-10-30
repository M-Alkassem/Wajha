/**
 * Visual QA of the built-in templates (Latin scripts): contact sheets of
 * every slide per template for iPhone, iPad, Mac, Android and the feature
 * graphic in English (plus German where a template has German copy), and an
 * overview of every template's first slide. Arabic sheets come from
 * qa-ar.test.ts (a separate process, because fonts are registered per script).
 *
 *   WAJHA_TEMPLATES_QA=1 npx vitest run src/templates/qa
 *   WAJHA_TEMPLATES_QA=1 WAJHA_TEMPLATES_QA_ONLY=aurora,noor npx vitest run src/templates/qa
 *
 * Output: .qa/templates/<id>-{iphone,ipad,mac,android,feature,de}.png and overview.png
 */
import { describe, expect, it } from 'vitest';
import type { FamilyId } from '../model/types';
import { BUILTIN_TEMPLATES } from './index';
import { mockAppAt } from './kit';
import { contactSheet, projectFor, registerFonts, renderProjectSlide, saveSheet, type SheetCell } from './testing/render.node';

const enabled = process.env.WAJHA_TEMPLATES_QA === '1';
const only = (process.env.WAJHA_TEMPLATES_QA_ONLY ?? '').split(',').filter(Boolean);
const selected = BUILTIN_TEMPLATES.filter((t) => !only.length || only.includes(t.id));

const SHEETS: { suffix: string; family: FamilyId; lang: string; width: number }[] = [
  { suffix: 'iphone', family: 'iphone', lang: 'en-US', width: 360 },
  { suffix: 'ipad', family: 'ipad', lang: 'en-US', width: 360 },
  { suffix: 'mac', family: 'mac', lang: 'en-US', width: 480 },
  { suffix: 'android', family: 'android-phone', lang: 'en-US', width: 360 },
  { suffix: 'feature', family: 'play-feature', lang: 'en-US', width: 480 },
];

describe.skipIf(!enabled)('template QA sheets (latin)', () => {
  registerFonts('latin');

  for (const template of selected) {
    it(`renders ${template.id}`, () => {
      const hasGerman = template.slides.some((s) => s.texts['de-DE']);
      const project = projectFor(template, ['iphone', 'ipad', 'mac', 'android-phone', 'play-feature'], hasGerman ? ['en-US', 'de-DE'] : ['en-US']);
      const sheets = hasGerman ? [...SHEETS, { suffix: 'de', family: 'iphone' as FamilyId, lang: 'de-DE', width: 360 }] : SHEETS;
      for (const sheet of sheets) {
        const cells: SheetCell[] = project.slides.map((_, i) => ({ image: renderProjectSlide(project, i, sheet.family, sheet.lang, sheet.width) }));
        const overflow = cells.flatMap((c, i) => c.image.result.overflowingText.map((id) => `slide ${i + 1}: ${id}`));
        if (overflow.length) console.warn(`[qa] ${template.id} ${sheet.suffix}: overflowing ${overflow.join(', ')}`);
        const out = saveSheet(contactSheet(cells, cells.length, 14), `templates/${template.id}-${sheet.suffix}.png`);
        expect(out).toContain('.qa');
      }
    }, 120_000);
  }

  it('lists the mock app each device shows (tall / tablet / wide)', () => {
    const lines = selected.map((t) => {
      const cells = t.slides.map((s, i) =>
        (['tall', 'tablet', 'wide'] as const)
          .map((cls) => s.layouts[cls]?.elements.map((e, k) => (e.kind === 'device' ? mockAppAt(i, k) : '')).filter(Boolean).join('+') ?? '-')
          .join('/'),
      );
      return `${t.id.padEnd(18)} ${cells.join(' | ')}`;
    });
    console.info(`[qa] mock screens\n${lines.join('\n')}`);
  });

  it.skipIf(only.length > 0)('renders the adapted iPad and Mac canvases of templates without their own layouts', () => {
    const adapted = BUILTIN_TEMPLATES.filter((t) => !t.slides.every((s) => s.layouts.tablet && s.layouts.wide));
    const cells: SheetCell[] = adapted.flatMap((template) => {
      const project = projectFor(template, ['ipad', 'mac'], ['en-US']);
      return [
        ...project.slides.map((_, i) => ({ image: renderProjectSlide(project, i, 'ipad', 'en-US', 150), label: i === 0 ? template.id : '' })),
        ...project.slides.map((_, i) => ({ image: renderProjectSlide(project, i, 'mac', 'en-US', 200) })),
      ];
    });
    if (cells.length) saveSheet(contactSheet(cells, 10, 10, 22), 'templates/adapted.png');
  }, 120_000);

  it.skipIf(only.length > 0)('renders the overview of first slides', () => {
    const cells: SheetCell[] = BUILTIN_TEMPLATES.map((template) => {
      const project = projectFor(template, ['iphone'], ['en-US']);
      return { image: renderProjectSlide(project, 0, 'iphone', 'en-US', 270), label: `${template.name} · ${template.category}` };
    });
    saveSheet(contactSheet(cells, 10, 18, 30), 'templates/overview.png');
  }, 120_000);
});

/**
 * Visual QA of the built-in templates in Arabic (right-to-left): contact
 * sheets of every slide for iPhone, plus iPad and Mac strips. Runs in its
 * own process because fonts are registered per script (see render.node.ts).
 *
 *   WAJHA_TEMPLATES_QA=1 npx vitest run src/templates/qa
 *
 * Output: .qa/templates/<id>-ar.png and <id>-ar-{ipad,mac}.png
 */
import { describe, expect, it } from 'vitest';
import type { FamilyId } from '../model/types';
import { BUILTIN_TEMPLATES } from './index';
import { contactSheet, projectFor, registerFonts, renderProjectSlide, saveSheet, type SheetCell } from './testing/render.node';

const enabled = process.env.WAJHA_TEMPLATES_QA === '1';
const only = (process.env.WAJHA_TEMPLATES_QA_ONLY ?? '').split(',').filter(Boolean);
const selected = BUILTIN_TEMPLATES.filter((t) => !only.length || only.includes(t.id));

const SHEETS: { suffix: string; family: FamilyId; width: number }[] = [
  { suffix: 'ar', family: 'iphone', width: 360 },
  { suffix: 'ar-ipad', family: 'ipad', width: 300 },
  { suffix: 'ar-mac', family: 'mac', width: 400 },
];

describe.skipIf(!enabled)('template QA sheets (arabic)', () => {
  registerFonts('arabic');

  for (const template of selected) {
    it(`renders ${template.id} in Arabic`, () => {
      const project = projectFor(template, ['iphone', 'ipad', 'mac'], ['ar-SA', 'en-US']);
      for (const sheet of SHEETS) {
        const cells: SheetCell[] = project.slides.map((_, i) => ({ image: renderProjectSlide(project, i, sheet.family, 'ar-SA', sheet.width) }));
        const overflow = cells.flatMap((c, i) => c.image.result.overflowingText.map((id) => `slide ${i + 1}: ${id}`));
        if (overflow.length) console.warn(`[qa] ${template.id} ${sheet.suffix}: overflowing ${overflow.join(', ')}`);
        expect(saveSheet(contactSheet(cells, cells.length, 14), `templates/${template.id}-${sheet.suffix}.png`)).toContain('.qa');
      }
    }, 120_000);
  }
});

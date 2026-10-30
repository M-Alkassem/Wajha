/**
 * Renders every built-in template in Latin scripts (English, German) on
 * @napi-rs/canvas: no text may overflow at the iPhone design size, every
 * text must read against what is painted behind it, and no decoration may
 * run through text on any device family, whether the template designs that
 * canvas or adaptLayout derives it. Arabic runs in render-ar.test.ts (fonts
 * are registered per script, per process).
 */
import { describe, expect, it } from 'vitest';
import { FAMILY_ORDER } from '../model/catalog';
import { blankProject, newShapeElement } from '../model/defaults';
import type { ShapeElement, TextElement } from '../model/types';
import { BUILTIN_TEMPLATES } from './index';
import { slideCrossings } from './testing/crossing.node';
import { overflowingTexts, slideContrast } from './testing/inspect.node';
import { projectFor, registerFonts } from './testing/render.node';
import { CONTRAST_MIN, contrastFailures } from './testing/thresholds.node';

registerFonts('latin');

describe('slideCrossings', () => {
  const project = () => {
    const p = blankProject('x', ['mac'], ['en-US']);
    p.slides[0].texts['en-US'] = { headline: 'A headline that wraps', subtitle: 'And a subtitle below it' };
    return p;
  };
  const headline = (p: ReturnType<typeof blankProject>) => p.slides[0].layouts.mac!.elements.find((e): e is TextElement => e.kind === 'text' && e.key === 'headline')!;
  const shape = (o: Partial<ShapeElement>): ShapeElement => ({ ...newShapeElement('ring', { ...project().theme }), id: 'decor', ...o });

  it('reports a ring through a line of text, not a panel behind it or a soft glow', () => {
    const p = project();
    const h = headline(p);
    const layout = p.slides[0].layouts.mac!;
    layout.elements.unshift(shape({ x: h.x, y: h.y, width: 0.2, height: 0.2, stroke: 0.01, blur: 0 }));
    expect(slideCrossings(p, 0, 'mac', 'en-US')).toEqual(['ring crosses headline']);
    layout.elements[0] = shape({ shape: 'rect', x: 0.5, y: 0.5, width: 3, height: 1.5, stroke: 0, blur: 0 });
    expect(slideCrossings(p, 0, 'mac', 'en-US')).toEqual([]);
    layout.elements[0] = shape({ shape: 'circle', x: h.x, y: h.y, width: 0.3, height: 0.3, stroke: 0, blur: 0.1 });
    expect(slideCrossings(p, 0, 'mac', 'en-US')).toEqual([]);
  });
});

describe('built-in templates render cleanly (latin)', () => {
  for (const t of BUILTIN_TEMPLATES) {
    it(`${t.id}: no overflowing text at the design sizes`, () => {
      const german = t.slides.every((s) => s.texts['de-DE']);
      const project = projectFor(t, ['iphone', 'ipad', 'mac'], german ? ['en-US', 'de-DE'] : ['en-US']);
      const problems: string[] = [];
      for (const lang of project.languages) {
        for (const family of project.families) {
          project.slides.forEach((_, i) => {
            for (const id of overflowingTexts(project, i, family, lang)) problems.push(`${lang} ${family} slide ${i + 1}: ${id}`);
          });
        }
      }
      expect(problems).toEqual([]);
    });

    it(`${t.id}: texts contrast with their background (${CONTRAST_MIN.headline}:1 headlines, ${CONTRAST_MIN.text}:1 other text)`, () => {
      const project = projectFor(t, ['iphone', 'ipad', 'mac'], ['en-US']);
      const failures: string[] = [];
      for (const family of project.families) {
        project.slides.forEach((_, i) => failures.push(...contrastFailures(slideContrast(project, i, family, 'en-US', family === 'mac' ? 576 : 360), family)));
      }
      expect(failures).toEqual([]);
    });

    it(`${t.id}: no decoration runs through text on any device family`, () => {
      const problems: string[] = [];
      for (const lang of ['en-US', ...(t.slides.every((s) => s.texts['de-DE']) ? ['de-DE'] : [])]) {
        const project = projectFor(t, [...FAMILY_ORDER], [lang]);
        for (const family of project.families) {
          project.slides.forEach((_, i) => problems.push(...slideCrossings(project, i, family, lang).map((p) => `${lang} ${family} slide ${i + 1}: ${p}`)));
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

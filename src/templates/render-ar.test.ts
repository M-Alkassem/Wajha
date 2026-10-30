/**
 * Renders every built-in template in Arabic (right-to-left) on
 * @napi-rs/canvas with Arabic-first fonts: no text may overflow at the
 * iPhone, iPad and Mac design sizes, every text must read against what is
 * painted behind it, and no decoration may run through the right-aligned
 * Arabic copy on any device family.
 */
import { describe, expect, it } from 'vitest';
import { FAMILY_ORDER } from '../model/catalog';
import { BUILTIN_TEMPLATES } from './index';
import { slideCrossings } from './testing/crossing.node';
import { overflowingTexts, slideContrast } from './testing/inspect.node';
import { projectFor, registerFonts } from './testing/render.node';
import { contrastFailures } from './testing/thresholds.node';

registerFonts('arabic');

describe('built-in templates render cleanly (arabic)', () => {
  for (const t of BUILTIN_TEMPLATES) {
    it(`${t.id}: no overflowing Arabic text at the design sizes`, () => {
      const project = projectFor(t, ['iphone', 'ipad', 'mac'], ['ar-SA', 'en-US']);
      const problems: string[] = [];
      for (const family of project.families) {
        project.slides.forEach((_, i) => {
          for (const id of overflowingTexts(project, i, family, 'ar-SA')) problems.push(`${family} slide ${i + 1}: ${id}`);
        });
      }
      expect(problems).toEqual([]);
    });

    it(`${t.id}: Arabic texts contrast with their background`, () => {
      const project = projectFor(t, ['iphone'], ['ar-SA']);
      const failures: string[] = [];
      project.slides.forEach((_, i) => failures.push(...contrastFailures(slideContrast(project, i, 'iphone', 'ar-SA', 360), 'iphone')));
      expect(failures).toEqual([]);
    });

    it(`${t.id}: no decoration runs through Arabic text on any device family`, () => {
      const project = projectFor(t, [...FAMILY_ORDER], ['ar-SA']);
      const problems: string[] = [];
      for (const family of project.families) {
        project.slides.forEach((_, i) => problems.push(...slideCrossings(project, i, family, 'ar-SA').map((p) => `${family} slide ${i + 1}: ${p}`)));
      }
      expect(problems).toEqual([]);
    });
  }
});

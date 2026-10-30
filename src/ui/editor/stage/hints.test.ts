import { describe, expect, it } from 'vitest';
import { deviceGeometry } from '../../../engine';
import { FAMILY_ORDER } from '../../../model/catalog';
import { defaultTheme, newDeviceElement, newShapeElement, newSlide, newTextElement } from '../../../model/defaults';
import { projectFromTemplate } from '../../../model/instantiate';
import { resolveLayout } from '../../../model/resolve';
import type { SlideElement, SlideLayout } from '../../../model/types';
import { BUILTIN_TEMPLATES } from '../../../templates';
import { boxCorners, boxesOverlap, toLocal } from './geometry';
import { coveringBoxes, emptyTextIds, labelSpot, screenBox } from './hints';
import type { StageBox } from './stageStore';

const theme = defaultTheme();
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

function box(element: SlideElement, cx: number, cy: number, w: number, h: number, rotation = 0): StageBox {
  return { id: element.id, cx, cy, w, h, rotation, element };
}

const phone = (id: string, cx: number, cy: number, w: number, h: number, rotation = 0) => box({ ...newDeviceElement('iphone', theme), id }, cx, cy, w, h, rotation);

describe('screenBox', () => {
  it('finds the screen inside an upright phone', () => {
    const g = deviceGeometry('iphone', 260, 2868 / 1320);
    const s = screenBox(phone('p', 170, 420, 260, g.height), 'iphone');
    close(s.cx, 170);
    close(s.w, g.screen.w);
    close(s.h, g.screen.h);
    close(s.radius, g.screen.radius);
    expect(s.cy - s.h / 2).toBeGreaterThan(420 - g.height / 2);
  });

  it('turns with a rotated phone', () => {
    const g = deviceGeometry('iphone', 200, 2868 / 1320);
    const upright = screenBox(phone('p', 100, 300, 200, g.height), 'iphone');
    const tilted = screenBox(phone('p', 100, 300, 200, g.height, 30), 'iphone');
    expect(tilted.rotation).toBe(30);
    const local = toLocal({ cx: 100, cy: 300, w: 200, h: g.height, rotation: 30 }, { x: tilted.cx, y: tilted.cy });
    close(local.x, upright.cx - 100);
    close(local.y, upright.cy - 300);
  });

  it('reads the screen shape of a screenshot that differs from the family default back from the painted box', () => {
    const g = deviceGeometry('iphone', 240, 1.5);
    const s = screenBox(phone('p', 120, 200, 240, g.height), 'iphone');
    expect(Math.abs(s.h - g.screen.h)).toBeLessThan(0.5);
  });

  it('uses the whole box for other elements', () => {
    const shape = box({ ...newShapeElement('rect', theme), id: 's' }, 10, 20, 30, 40, 5);
    expect(screenBox(shape, 'iphone')).toEqual({ cx: 10, cy: 20, w: 30, h: 40, rotation: 5, radius: 0 });
  });
});

describe('coveringBoxes', () => {
  it('lists only the layers above that overlap the area', () => {
    const below = phone('below', 100, 100, 50, 100);
    const target = phone('target', 100, 100, 50, 100);
    const over = phone('over', 120, 100, 50, 100);
    const away = phone('away', 400, 100, 50, 100);
    const boxes = [below, target, over, away];
    expect(coveringBoxes(boxes, 1, target).map((b) => b.id)).toEqual(['over']);
    expect(coveringBoxes(boxes, 3, away)).toEqual([]);
  });
});

describe('labelSpot', () => {
  const area = { cx: 100, cy: 200, w: 160, h: 300, rotation: 0 };
  const size = { w: 100, h: 40 };
  const slide = { width: 400, height: 800 };

  it('takes the middle when nothing covers it', () => {
    const spot = labelSpot(area, size, [], slide);
    expect(spot).toEqual({ cx: 100, cy: 200, w: 100, h: 40, rotation: 0 });
  });

  it('moves clear of a covering layer, and gives up when every spot is covered', () => {
    const cover = { cx: 100, cy: 200, w: 200, h: 80, rotation: 0 };
    const spot = labelSpot(area, size, [cover], slide);
    expect(spot).not.toBeNull();
    expect(boxesOverlap(spot!, cover)).toBe(false);
    expect(labelSpot(area, size, [{ ...area }], slide)).toBeNull();
  });

  it('needs room inside the area and on the slide', () => {
    expect(labelSpot({ ...area, w: 90 }, size, [], slide)).toBeNull();
    expect(labelSpot({ ...area, h: 45 }, size, [], slide)).toBeNull();
    // A screen hanging off the top of the slide: its middle is off the slide, a lower spot is on it.
    const low = labelSpot({ ...area, cy: -50 }, size, [], slide);
    expect(low).not.toBeNull();
    expect(low!.cy).toBeGreaterThan(-50);
    expect(low!.cy - low!.h / 2).toBeGreaterThanOrEqual(0);
    expect(labelSpot({ ...area, cy: -400 }, size, [], slide)).toBeNull();
  });

  it('keeps labels upright and inside a tilted area', () => {
    const tilted = { ...area, rotation: 20 };
    const spot = labelSpot(tilted, size, [], slide);
    expect(spot!.rotation).toBe(0);
    for (const corner of boxCorners(spot!)) {
      const p = toLocal(tilted, corner);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(tilted.w / 2 - 4 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(tilted.h / 2 - 4 + 1e-9);
    }
    // Turned far enough, the upright label no longer fits across the narrow area.
    expect(labelSpot({ ...area, w: 110, rotation: 40 }, size, [], slide)).toBeNull();
  });
});

describe('emptyTextIds', () => {
  const slide = newSlide(['iphone'], theme, ['en-US', 'ar-SA']);
  const head = { ...newTextElement('headline', 'iphone', theme), id: 'h' };
  const sub = { ...newTextElement('subtitle', 'iphone', theme), id: 's' };
  const layout: SlideLayout = { background: null, elements: [head, sub] };

  it('lists text layers without words, markup and spaces included', () => {
    expect(emptyTextIds(slide, layout, 'en-US', 'en-US')).toEqual(['h', 's']);
    const marked = { ...slide, texts: { 'en-US': { headline: ' ** ', subtitle: 'Sleep *better*' } } };
    expect(emptyTextIds(marked, layout, 'en-US', 'en-US')).toEqual(['h']);
  });

  it('follows the base-language fallback', () => {
    const base = { ...slide, texts: { 'en-US': { headline: 'Hello', subtitle: '' }, 'ar-SA': { headline: '', subtitle: '' } } };
    expect(emptyTextIds(base, layout, 'ar-SA', 'en-US')).toEqual(['s']);
  });

  it('skips hidden and transparent layers', () => {
    const hidden: SlideLayout = { background: null, elements: [{ ...head, hidden: true }, { ...sub, opacity: 0 }] };
    expect(emptyTextIds(slide, hidden, 'en-US', 'en-US')).toEqual([]);
  });

  it('finds nothing in a fresh template project, so it looks like a finished listing', () => {
    const problems: string[] = [];
    for (const template of BUILTIN_TEMPLATES) {
      const p = projectFromTemplate(template, { name: 'Fresh', families: [...FAMILY_ORDER], languages: ['en-US', 'ar-SA'] });
      for (const lang of p.languages) {
        for (const family of p.families) {
          p.slides.forEach((s, i) => {
            const ids = emptyTextIds(s, resolveLayout(p, s, family), lang, p.languages[0]);
            if (ids.length) problems.push(`${template.id} slide ${i + 1} ${family} ${lang}`);
          });
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

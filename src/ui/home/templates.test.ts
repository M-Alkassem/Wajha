import { describe, expect, it } from 'vitest';
import { sampleTemplate } from '../../model/fixtures.node';
import {
  blankPreviewProject,
  categoryLabel,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  countByCategory,
  heroPreviewProject,
  templateMatches,
  templatePreviewProject,
} from './templates';

describe('categories', () => {
  it('labels every category and keeps the model order', () => {
    expect(CATEGORY_ORDER).toEqual(['minimal', 'bold', 'gradient', 'dark', 'playful', 'panorama', 'elegant']);
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABEL[c]).toMatch(/^[A-Z]/);
    expect(categoryLabel('unknown')).toBe('unknown');
  });

  it('counts templates per category', () => {
    const counts = countByCategory([{ category: 'bold' }, { category: 'bold' }, { category: 'dark' }]);
    expect(counts.bold).toBe(2);
    expect(counts.dark).toBe(1);
    expect(counts.minimal).toBe(0);
  });
});

describe('templateMatches', () => {
  const t = { ...sampleTemplate(), tags: ['fitness', 'health'] };
  it('searches name, author, description, tags and category', () => {
    expect(templateMatches(t, 'glow')).toBe(true);
    expect(templateMatches(t, 'wajha')).toBe(true);
    expect(templateMatches(t, 'health')).toBe(true);
    expect(templateMatches(t, 'gradient')).toBe(true);
    expect(templateMatches(t, 'test template')).toBe(true);
    expect(templateMatches(t, 'neon')).toBe(false);
  });
});

describe('preview projects', () => {
  it('memoises one project per template, family and language', () => {
    const t = sampleTemplate();
    const a = templatePreviewProject(t, 'iphone', 'en-US');
    expect(templatePreviewProject(t, 'iphone', 'en-US')).toBe(a);
    const b = templatePreviewProject(t, 'mac', 'en-US');
    expect(b).not.toBe(a);
    expect(a.families).toEqual(['iphone']);
    expect(a.languages).toEqual(['en-US']);
    expect(b.families).toEqual(['mac']);
    expect(a.slides).toHaveLength(t.slides.length);
  });

  it('uses the template copy of the preview language', () => {
    const t = sampleTemplate();
    const ar = templatePreviewProject(t, 'iphone', 'ar-SA');
    expect(ar.slides[0].texts['ar-SA'].headline).toBe('عنوان 1');
  });

  it('memoises blank previews', () => {
    const a = blankPreviewProject('iphone', 'en-US');
    expect(blankPreviewProject('iphone', 'en-US')).toBe(a);
    expect(blankPreviewProject('ipad', 'en-US')).not.toBe(a);
    expect(a.templateId).toBeNull();
  });

  it('illustrates the hero with the first template, or sample copy without one', () => {
    const t = sampleTemplate();
    expect(heroPreviewProject([t])).toBe(templatePreviewProject(t, 'iphone', 'en-US'));
    const sample = heroPreviewProject([]);
    expect(sample.slides).toHaveLength(3);
    expect(sample.slides.every((s) => s.texts['en-US'].headline.length > 0)).toBe(true);
    expect(heroPreviewProject([])).toBe(sample);
  });
});

import { describe, expect, it } from 'vitest';
import { languageTypography, styleForLanguage } from './typography';
import { defaultTheme, newTextElement } from './defaults';

const style = newTextElement('headline', 'iphone', defaultTheme()).style;

describe('languageTypography', () => {
  it('returns the settings of that language only', () => {
    const project = { typography: { 'ar-SA': { font: 'Cairo Variable', lineSpacing: 1.2 } } };
    expect(languageTypography(project, 'ar-SA')).toEqual({ font: 'Cairo Variable', lineSpacing: 1.2 });
    expect(languageTypography(project, 'en-US')).toBeNull();
    expect(languageTypography(project, 'toString')).toBeNull();
    expect(languageTypography({}, 'ar-SA')).toBeNull();
    expect(languageTypography(null, 'ar-SA')).toBeNull();
  });
});

describe('styleForLanguage', () => {
  it('swaps the font, keeps the weight and scales the line height', () => {
    const out = styleForLanguage(style, { font: 'Cairo Variable', lineSpacing: 1.25 });
    expect(out.font).toBe('Cairo Variable');
    expect(out.weight).toBe(style.weight);
    expect(out.lineHeight).toBeCloseTo(style.lineHeight * 1.25);
    expect(out.size).toBe(style.size);
  });

  it('changes only what is set, and returns the style itself when nothing is', () => {
    expect(styleForLanguage(style, { lineSpacing: 1.1 }).font).toBe(style.font);
    expect(styleForLanguage(style, { font: 'Cairo Variable' }).lineHeight).toBe(style.lineHeight);
    expect(styleForLanguage(style, null)).toBe(style);
    expect(styleForLanguage(style, {})).toBe(style);
    expect(styleForLanguage(style, { font: '', lineSpacing: NaN })).toBe(style);
  });
});

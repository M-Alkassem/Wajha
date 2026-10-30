import { describe, expect, it } from 'vitest';
import { backgroundTone, contrast, fillTone, luminance, mixColors, pickAccent, prefersLightText, withAlpha } from './colorMath';
import { defaultBackground } from './defaults';

describe('colour math', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1);
  });

  it('mixes and adds alpha', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#000000', '#ffffff', NaN)).toBe('#000000');
    expect(withAlpha('#ffffff', 0.75)).toBe('#ffffffbf');
    expect(withAlpha('#ffffff80', 1)).toBe('#ffffffff');
  });

  it('summarizes fills with one representative tone', () => {
    expect(fillTone({ type: 'solid', color: '#ff0000' })).toBe('#ff0000');
    expect(fillTone({ type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] })).toBe('#808080');
    expect(fillTone({ type: 'mesh', base: '#000000', points: [] })).toBe('#000000');
    expect(fillTone({ type: 'image', assetId: 'x', fit: 'cover', opacity: 1, blur: 0, tint: null })).toBe('#303030');
  });

  it('copes with malformed fills', () => {
    expect(fillTone({ type: 'linear' } as never)).toBe('#808080');
    expect(fillTone({ type: 'nope' } as never)).toBe('#808080');
    expect(backgroundTone(undefined as never)).toBe('#808080');
  });

  it('prefers light text on the default deep violet background', () => {
    const tone = backgroundTone(defaultBackground());
    expect(prefersLightText(tone)).toBe(true);
    expect(contrast(tone, '#ffffff')).toBeGreaterThan(4.5);
    expect(prefersLightText('#f5f5f5')).toBe(false);
  });

  it('picks the accent that pops and differs from the text colour', () => {
    const accent = pickAccent(['#ffffff', '#120a2e', '#ffc46b'], '#2a1660', '#ffffff', '#000000');
    expect(accent).toBe('#ffc46b');
    expect(pickAccent([], '#2a1660', '#ffffff', '#abcdef')).toBe('#abcdef');
    expect(pickAccent(['#2a1661'], '#2a1660', '#ffffff', '#abcdef')).toBe('#abcdef');
  });
});

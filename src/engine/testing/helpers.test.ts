import { describe, expect, it } from 'vitest';
import { pixel, registerBundledFonts, solidImage, testCanvas } from './canvas.node';
import { contrast, mix, parseColor, rgba, toHex } from '../color';

describe('test canvas helpers', () => {
  it('draws and reads pixels', () => {
    const { ctx } = testCanvas(20, 20);
    ctx.drawImage(solidImage(20, 20, '#ff0000', '#0000ff'), 0, 0);
    expect(pixel(ctx, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(pixel(ctx, 15, 15)).toEqual([255, 0, 0, 255]);
  });
  it('registers bundled fonts', () => {
    registerBundledFonts();
    const { ctx } = testCanvas(10, 10);
    ctx.font = '800 40px "Inter Variable"';
    const bold = ctx.measureText('Hello').width;
    ctx.font = '300 40px "Inter Variable"';
    expect(bold).toBeGreaterThan(ctx.measureText('Hello').width);
  });
});

describe('color', () => {
  it('parses and formats', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor('#11223380').a).toBeCloseTo(128 / 255);
    expect(toHex(parseColor('#abcdef'))).toBe('#abcdef');
    expect(rgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(parseColor('nonsense')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  });
});

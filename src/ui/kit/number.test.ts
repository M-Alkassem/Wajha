import { describe, expect, it } from 'vitest';
import {
  MAX_PRECISION,
  clamp,
  evaluateExpression,
  formatNumber,
  modifierMultiplier,
  normalizeDigits,
  normalizeNumber,
  parseNumberInput,
  precisionFromStep,
  roundTo,
  sameAtPrecision,
  scrubAccumulate,
  scrubValue,
  stepValue,
  valueFromFieldText,
  wrap,
} from './number';

describe('clamp', () => {
  it('clamps into range and passes values inside through', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('treats NaN as the lower bound (or 0 when unbounded)', () => {
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
    expect(clamp(Number.NaN)).toBe(0);
  });
  it('handles infinite bounds and inverted ranges', () => {
    expect(clamp(1e300)).toBe(1e300);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 5)).toBe(5);
    expect(clamp(3, 10, 0)).toBe(10);
  });
});

describe('precisionFromStep', () => {
  it('counts the decimals a step needs', () => {
    expect(precisionFromStep(1)).toBe(0);
    expect(precisionFromStep(10)).toBe(0);
    expect(precisionFromStep(0.1)).toBe(1);
    expect(precisionFromStep(0.25)).toBe(2);
    expect(precisionFromStep(0.005)).toBe(3);
    expect(precisionFromStep(1e-7)).toBe(7);
  });
  it('falls back to 0 for nonsense and caps tiny steps', () => {
    expect(precisionFromStep(0)).toBe(0);
    expect(precisionFromStep(-1)).toBe(0);
    expect(precisionFromStep(Number.NaN)).toBe(0);
    expect(precisionFromStep(Math.PI / 1e6)).toBe(MAX_PRECISION);
  });
});

describe('roundTo', () => {
  it('rounds halves away from zero without float drift', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(0.1 + 0.2, 10)).toBe(0.3);
  });
  it('never returns negative zero', () => {
    expect(Object.is(roundTo(-0.0001, 2), 0)).toBe(true);
    expect(Object.is(roundTo(-0, 0), 0)).toBe(true);
  });
  it('leaves non-finite values alone and clamps the precision', () => {
    expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(roundTo(Number.NaN, 2))).toBe(true);
    expect(roundTo(1.23456, -3)).toBe(1);
    expect(roundTo(1.23456, 99)).toBe(1.23456);
  });
});

describe('wrap', () => {
  it('wraps angles into [min, max)', () => {
    expect(wrap(370, 0, 360)).toBe(10);
    expect(wrap(-10, 0, 360)).toBe(350);
    expect(wrap(360, 0, 360)).toBe(0);
    expect(wrap(720.5, 0, 360)).toBeCloseTo(0.5);
    expect(wrap(-190, -180, 180)).toBe(170);
  });
  it('degrades to clamping for empty or infinite spans', () => {
    expect(wrap(5, 3, 3)).toBe(3);
    expect(wrap(5, 0, Number.POSITIVE_INFINITY)).toBe(5);
  });
});

describe('normalizeNumber', () => {
  it('rounds then clamps', () => {
    expect(normalizeNumber(12.345, { precision: 1, min: 0, max: 100 })).toBe(12.3);
    expect(normalizeNumber(150, { precision: 0, min: 0, max: 100 })).toBe(100);
  });
  it('wraps when asked, folding a rounded max back to min', () => {
    expect(normalizeNumber(359.96, { precision: 1, min: 0, max: 360, wrap: true })).toBe(0);
    expect(normalizeNumber(-90, { precision: 0, min: 0, max: 360, wrap: true })).toBe(270);
  });
  it('returns the fallback for non-finite candidates', () => {
    expect(normalizeNumber(Number.NaN, {}, 7)).toBe(7);
    expect(normalizeNumber(Number.POSITIVE_INFINITY, { max: 10 }, 3)).toBe(3);
  });
});

describe('formatNumber', () => {
  it('trims trailing zeros and the dot', () => {
    expect(formatNumber(12.5, 2)).toBe('12.5');
    expect(formatNumber(12, 2)).toBe('12');
    expect(formatNumber(0.1 + 0.2, 2)).toBe('0.3');
    expect(formatNumber(100, 0)).toBe('100');
  });
  it('never shows -0 and renders non-finite values empty', () => {
    expect(formatNumber(-0.0001, 2)).toBe('0');
    expect(formatNumber(Number.NaN, 2)).toBe('');
    expect(formatNumber(Number.NEGATIVE_INFINITY, 2)).toBe('');
  });
  it('copes with huge numbers', () => {
    expect(formatNumber(1e21, 0)).toBe('1e+21');
    expect(formatNumber(123456789.123, 1)).toBe('123456789.1');
  });
});

describe('normalizeDigits', () => {
  it('maps Arabic-Indic, Persian, Devanagari and fullwidth digits', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('۱۲۳')).toBe('123');
    expect(normalizeDigits('४२')).toBe('42');
    expect(normalizeDigits('１２')).toBe('12');
  });
  it('maps localized separators and operators', () => {
    expect(normalizeDigits('١٢٫٥')).toBe('12.5');
    expect(normalizeDigits('١٬٠٠٠')).toBe('1000');
    expect(normalizeDigits('−5 × 2 ÷ 4')).toBe('-5 * 2 / 4');
  });
  it('leaves ASCII untouched', () => {
    expect(normalizeDigits('12.5px')).toBe('12.5px');
  });
});

describe('evaluateExpression', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateExpression('1+2*3')).toBe(7);
    expect(evaluateExpression('(1+2)*3')).toBe(9);
    expect(evaluateExpression('100/4 - 5')).toBe(20);
    expect(evaluateExpression(' 2 * -3 ')).toBe(-6);
    expect(evaluateExpression('--4')).toBe(4);
    expect(evaluateExpression('.5+.25')).toBe(0.75);
    expect(evaluateExpression('1e3/2')).toBe(500);
  });
  it('rejects invalid input instead of guessing', () => {
    for (const bad of ['', '   ', 'abc', '1+', '(1', '1)', '2(3)', '1..2', '1e', '5/0', '1/(2-2)', '10%3', 'alert(1)']) {
      expect(evaluateExpression(bad)).toBeNull();
    }
  });
  it('refuses huge or deeply nested input', () => {
    expect(evaluateExpression('1+'.repeat(150) + '1')).toBeNull();
    expect(evaluateExpression('('.repeat(40) + '1' + ')'.repeat(40))).toBeNull();
    expect(evaluateExpression('-'.repeat(40) + '1')).toBeNull();
    expect(evaluateExpression('('.repeat(10) + '1' + ')'.repeat(10))).toBe(1);
  });
  it('rejects results that overflow', () => {
    expect(evaluateExpression('1e308*10')).toBeNull();
  });
});

describe('parseNumberInput', () => {
  it('strips the unit and its aliases', () => {
    expect(parseNumberInput('45°', { unit: '°' })).toBe(45);
    expect(parseNumberInput('45deg', { unit: '°' })).toBe(45);
    expect(parseNumberInput('50 %', { unit: '%' })).toBe(50);
    expect(parseNumberInput('12PX', { unit: 'px' })).toBe(12);
    expect(parseNumberInput('٥٠٪', { unit: '%' })).toBe(50);
  });
  it('does not accept a different unit', () => {
    expect(parseNumberInput('50%', { unit: 'px' })).toBeNull();
  });
  it('reads decimal commas and thousands separators sensibly', () => {
    expect(parseNumberInput('12,5')).toBe(12.5);
    expect(parseNumberInput('1,000')).toBe(1000);
    expect(parseNumberInput('1,234,567')).toBe(1234567);
    expect(parseNumberInput('1,234.5')).toBe(1234.5);
    expect(parseNumberInput('1,5+2,5')).toBe(4);
  });
  it('applies a leading * or / to the current value', () => {
    expect(parseNumberInput('*2', { current: 21 })).toBe(42);
    expect(parseNumberInput('/4', { current: -10 })).toBe(-2.5);
    expect(parseNumberInput('*2')).toBeNull();
    expect(parseNumberInput('*2', { current: Number.NaN })).toBeNull();
  });
  it('accepts localized digits and arithmetic together', () => {
    expect(parseNumberInput('١٢٠/٢', { unit: 'px' })).toBe(60);
  });
  it('returns null for empty or garbage input', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('   ')).toBeNull();
    expect(parseNumberInput('%', { unit: '%' })).toBeNull();
    expect(parseNumberInput('twelve')).toBeNull();
  });
});

describe('valueFromFieldText', () => {
  it('normalizes what was typed, keeping the current value for nonsense', () => {
    expect(valueFromFieldText('12.345', { current: 1, precision: 1, max: 10 })).toBe(10);
    expect(valueFromFieldText('*2', { current: 3, precision: 0 })).toBe(6);
    expect(valueFromFieldText('45°', { current: 0, unit: '°', min: -180, max: 180, wrap: true })).toBe(45);
    expect(valueFromFieldText('abc', { current: 3 })).toBeNull();
  });
  it('commits the empty value for cleared text, and nothing without one', () => {
    expect(valueFromFieldText('', { current: 2, emptyValue: 0, min: 0 })).toBe(0);
    expect(valueFromFieldText('   ', { current: Number.NaN, emptyValue: 0 })).toBe(0);
    expect(valueFromFieldText('', { current: 2 })).toBeNull();
    expect(valueFromFieldText('3', { current: 2, emptyValue: 0 })).toBe(3);
  });
  it('keeps the current value when the number the field shows is typed again', () => {
    // A stage drag stored 74.1692 %; the field shows 74.17, and retyping that must not round the value.
    const x = { current: 74.1692, precision: 2, min: -200, max: 300 };
    expect(valueFromFieldText('74.17', x)).toBeNull();
    expect(valueFromFieldText('74.170 %', { ...x, unit: '%' })).toBeNull();
    expect(valueFromFieldText('*1', x)).toBeNull();
    expect(valueFromFieldText('74.18', x)).toBe(74.18);
    expect(valueFromFieldText('74.16', x)).toBe(74.16);
    expect(valueFromFieldText('5', { current: Number.NaN, precision: 2 })).toBe(5);
  });
  it('compares the typed number with the shown one before clamping or wrapping it', () => {
    // 179.97° shows as 180, which wraps to -180; typing -180 is a change, typing 180 is not.
    const angle = { current: 179.97, precision: 1, min: -180, max: 180, wrap: true };
    expect(valueFromFieldText('180', angle)).toBeNull();
    expect(valueFromFieldText('-180', angle)).toBe(-180);
    // A stored value outside the range moves into it when the limit is typed.
    expect(valueFromFieldText('100', { current: 120, precision: 0, min: 0, max: 100 })).toBe(100);
  });
});

describe('sameAtPrecision', () => {
  it('compares two numbers as a field with that many decimals shows them', () => {
    expect(sameAtPrecision(74.17, 74.1692, 2)).toBe(true);
    expect(sameAtPrecision(74.18, 74.1692, 2)).toBe(false);
    expect(sameAtPrecision(100, 99.99996, 2)).toBe(true);
    expect(sameAtPrecision(5, 5.3, 0)).toBe(true);
    expect(sameAtPrecision(0, -0.001, 2)).toBe(true);
  });
  it('never matches a value that is not a number', () => {
    expect(sameAtPrecision(1, Number.NaN, 2)).toBe(false);
    expect(sameAtPrecision(Number.NaN, Number.NaN, 2)).toBe(false);
  });
});

describe('modifierMultiplier', () => {
  it('maps Shift to x10 and Alt to x0.1', () => {
    expect(modifierMultiplier({})).toBe(1);
    expect(modifierMultiplier({ shiftKey: true })).toBe(10);
    expect(modifierMultiplier({ altKey: true })).toBeCloseTo(0.1);
    expect(modifierMultiplier({ shiftKey: true, altKey: true })).toBeCloseTo(1);
  });
});

describe('stepValue', () => {
  it('steps, scales by the multiplier and normalizes', () => {
    expect(stepValue(10, 1, { step: 1 })).toBe(11);
    expect(stepValue(10, -1, { step: 0.1, multiplier: 10, precision: 1 })).toBe(9);
    expect(stepValue(0.2, 1, { step: 0.1, precision: 1 })).toBe(0.3);
  });
  it('stops at the limits', () => {
    expect(stepValue(100, 1, { step: 1, max: 100 })).toBe(100);
    expect(stepValue(0, -1, { step: 5, min: 0 })).toBe(0);
  });
  it('wraps when asked', () => {
    expect(stepValue(359, 1, { step: 1, min: 0, max: 360, wrap: true })).toBe(0);
    expect(stepValue(0, -1, { step: 15, min: 0, max: 360, wrap: true })).toBe(345);
  });
  it('starts from min (or 0) when the value is not a number', () => {
    expect(stepValue(Number.NaN, 1, { step: 1, min: 5 })).toBe(6);
    expect(stepValue(Number.NaN, -1, { step: 1 })).toBe(-1);
  });
});

describe('scrubAccumulate', () => {
  it('converts pixels to steps with speed and modifiers', () => {
    expect(scrubAccumulate(0, 10, { step: 1 })).toBe(10);
    expect(scrubAccumulate(0, 10, { step: 0.01 })).toBeCloseTo(0.1);
    expect(scrubAccumulate(0, 10, { step: 1, speed: 0.5 })).toBe(5);
    expect(scrubAccumulate(0, 10, { step: 1, multiplier: 10 })).toBe(100);
  });
  it('clamps the raw value so reversing at a limit responds at once', () => {
    const atMax = scrubAccumulate(95, 50, { step: 1, max: 100 });
    expect(atMax).toBe(100);
    expect(scrubAccumulate(atMax, -1, { step: 1, max: 100 })).toBe(99);
  });
  it('accumulates fine Alt moves below the display precision', () => {
    let raw = 10;
    for (let i = 0; i < 10; i++) raw = scrubAccumulate(raw, 1, { step: 1, multiplier: 0.1 });
    expect(raw).toBeCloseTo(11);
  });
  it('does not clamp when wrapping, and ignores bad deltas', () => {
    expect(scrubAccumulate(350, 20, { step: 1, min: 0, max: 360, wrap: true })).toBe(370);
    expect(scrubAccumulate(5, Number.NaN, { step: 1 })).toBe(5);
    expect(scrubAccumulate(5, 0, { step: 1 })).toBe(5);
    expect(scrubAccumulate(1e308, 1e308, { step: 10 })).toBe(1e308);
  });
});

describe('scrubValue', () => {
  // The X field: percent of the canvas width with two decimals, at a value a stage drag stored.
  const x = { min: -200, max: 300, precision: 2 };
  const start = 74.1692;

  it('rounds and clamps the accumulator like the field', () => {
    expect(scrubValue(78.1692, start, x)).toBe(78.17);
    expect(scrubValue(400, start, x)).toBe(300);
    expect(scrubValue(-1.004, 0, { precision: 2 })).toBe(-1);
  });

  it('gives the exact start back wherever the field would show the start', () => {
    expect(scrubValue(start, start, x)).toBe(start);
    expect(scrubValue(74.166, start, x)).toBe(start);
    expect(scrubValue(74.174, start, x)).toBe(start);
    expect(scrubValue(74.176, start, x)).toBe(74.18);
  });

  it('lets a scrub that comes back to where it began leave the value as it was', () => {
    const scrub = (moves: number[]) => moves.reduce((raw, dx) => scrubAccumulate(raw, dx, { step: 0.1, ...x }), start);
    expect(scrubValue(scrub([4, 4, 4]), start, x)).toBe(75.37);
    // Out and back by 4 px moves: this used to store the 74.17 the field shows.
    expect(scrubValue(scrub([4, 4, 4, -4, -4, -4]), start, x)).toBe(start);
    // A path that leaves float error in the accumulator comes back exactly too.
    expect(scrub([9, -3, -3, -3])).not.toBe(start);
    expect(scrubValue(scrub([9, -3, -3, -3]), start, x)).toBe(start);
  });

  it('keeps a start that the field would wrap or clamp', () => {
    // 179.97° shows as 180 but normalizes to -180: back at the start, it stays 179.97.
    const angle = { min: -180, max: 180, wrap: true, precision: 1 };
    expect(scrubValue(179.97, 179.97, angle)).toBe(179.97);
    expect(scrubValue(181.04, 179.97, angle)).toBe(-179);
    // A stored value above the range is not pulled down to the limit by a scrub that pushes up against it.
    expect(scrubValue(100, 120, { min: 0, max: 100, precision: 0 })).toBe(120);
    expect(scrubValue(97, 120, { min: 0, max: 100, precision: 0 })).toBe(97);
  });
});

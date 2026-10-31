import { describe, expect, it } from 'vitest';
import { defaultLayout, defaultTheme } from '../../../model/defaults';
import { logoSpot } from './logoSpot';

describe('logoSpot', () => {
  it('takes the top left corner of an empty slide', () => {
    const spot = logoSpot({ background: null, elements: [] }, 'iphone', 0.5);
    expect(spot.x).toBeLessThan(0.2);
    expect(spot.y).toBeLessThan(0.1);
    expect(spot.width).toBeLessThanOrEqual(0.14);
  });

  it('moves to a corner the copy does not use', () => {
    const layout = defaultLayout('iphone', defaultTheme());
    // The default headline spans the top of a portrait slide.
    const spot = logoSpot(layout, 'iphone', 0.5);
    expect(spot.y).toBeGreaterThan(0.5);
  });

  it('keeps a tall logo small', () => {
    const spot = logoSpot({ background: null, elements: [] }, 'iphone', 3);
    expect(spot.width * 3).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});

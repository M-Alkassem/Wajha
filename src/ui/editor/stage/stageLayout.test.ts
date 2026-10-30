import { describe, expect, it } from 'vitest';
import {
  ADD_GAP,
  HEADER_H,
  MIN_GAP,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
  SLIDE_GAP,
  addTileWidth,
  anchorAt,
  clampZoom,
  computeStageLayout,
  fitSlideHeight,
  pointOf,
  scrollForAnchor,
  scrollToReveal,
  slideGap,
  slideLeft,
  wheelPixels,
  wheelZoomFactor,
  type StageLayoutInput,
} from './stageLayout';

const IPHONE = { width: 1320, height: 2868 };
const MAC = { width: 2880, height: 1800 };
const FEATURE = { width: 1024, height: 500 };

const base: StageLayoutInput = { viewportW: 900, viewportH: 848, design: IPHONE, zoom: 1, slideCount: 3, panorama: false };

describe('fitSlideHeight', () => {
  it('fills the height minus padding on portrait families', () => {
    expect(fitSlideHeight(900, 848, IPHONE)).toBe(848 - PAD_TOP - HEADER_H - PAD_BOTTOM);
  });

  it('never makes one slide wider than the viewport', () => {
    const h = fitSlideHeight(900, 848, FEATURE);
    expect((h * FEATURE.width) / FEATURE.height).toBeLessThanOrEqual(900 - 2 * PAD_X);
    expect(fitSlideHeight(900, 848, MAC)).toBeLessThan(848);
  });

  it('keeps a minimum size in tiny or broken viewports', () => {
    expect(fitSlideHeight(0, 0, IPHONE)).toBeGreaterThan(0);
    expect(fitSlideHeight(-50, Number.NaN, { width: 0, height: 0 })).toBeGreaterThan(0);
  });
});

describe('computeStageLayout', () => {
  it('centres a fitted slide vertically', () => {
    const l = computeStageLayout(base);
    expect(l.slideTop - HEADER_H - PAD_TOP).toBe(base.viewportH - l.slideTop - l.slideH - PAD_BOTTOM + 0);
    expect(l.contentH).toBe(base.viewportH);
    expect(l.slideW).toBe(Math.round((l.slideH * IPHONE.width) / IPHONE.height));
  });

  it('lays slides out with gaps, then the add tile', () => {
    const l = computeStageLayout(base);
    expect(slideLeft(l, 1) - slideLeft(l, 0)).toBe(l.slideW + SLIDE_GAP);
    expect(l.stripW).toBe(3 * l.slideW + 2 * SLIDE_GAP);
    expect(l.addLeft).toBe(l.stripLeft + l.stripW + ADD_GAP);
    expect(l.contentW).toBeGreaterThanOrEqual(l.addLeft + l.addW + PAD_X);
  });

  it('closes the gaps in panorama mode', () => {
    const l = computeStageLayout({ ...base, panorama: true });
    expect(l.gap).toBe(0);
    expect(slideLeft(l, 2)).toBe(l.stripLeft + 2 * l.slideW);
  });

  it('scales with zoom and centres narrow content', () => {
    const fitted = computeStageLayout({ ...base, slideCount: 1 });
    const half = computeStageLayout({ ...base, slideCount: 1, zoom: 0.5 });
    expect(half.slideH).toBe(Math.round(fitted.fitH * 0.5));
    expect(half.contentW).toBe(base.viewportW);
    // Centred: equal room on both sides of slide + tile.
    const right = half.contentW - (half.addLeft + half.addW);
    expect(Math.abs(half.stripLeft - right)).toBeLessThanOrEqual(1);
  });

  it('grows the content past the viewport when zoomed in', () => {
    const l = computeStageLayout({ ...base, zoom: 2 });
    expect(l.contentH).toBe(PAD_TOP + HEADER_H + l.slideH + PAD_BOTTOM);
    expect(l.slideTop).toBe(PAD_TOP + HEADER_H);
  });

  it('clamps zoom and copes with no slides', () => {
    const l = computeStageLayout({ ...base, zoom: 100, slideCount: 0 });
    expect(l.slideH).toBe(Math.round(l.fitH * 4));
    expect(l.stripW).toBe(0);
    expect(l.addLeft).toBe(l.stripLeft);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(0)).toBe(0.1);
  });

  it('can leave out the add tile', () => {
    const l = computeStageLayout({ ...base, addTile: false });
    expect(l.addW).toBe(0);
  });
});

describe('slideGap', () => {
  it('keeps the full gap at normal sizes and narrows when zoomed far out', () => {
    expect(slideGap(342)).toBe(SLIDE_GAP);
    expect(slideGap(200)).toBe(SLIDE_GAP);
    expect(slideGap(100)).toBe(16);
    expect(slideGap(20)).toBe(MIN_GAP);
    expect(slideGap(Number.NaN)).toBe(MIN_GAP);
  });

  it('is what the layout uses', () => {
    const tiny = computeStageLayout({ ...base, zoom: 0.1 });
    expect(tiny.gap).toBe(slideGap(tiny.slideW));
    expect(tiny.addLeft - (tiny.stripLeft + tiny.stripW)).toBe(slideGap(tiny.slideW, ADD_GAP));
  });
});

describe('addTileWidth', () => {
  it('is about phone shaped and never wider than a slide', () => {
    expect(addTileWidth(340, 744)).toBe(335);
    expect(addTileWidth(1100, 690)).toBe(311);
    expect(addTileWidth(60, 40)).toBe(60);
  });
});

describe('zoom anchoring', () => {
  it('maps points on slides, in gaps and around the strip', () => {
    const l = computeStageLayout(base);
    const onSlide = anchorAt(l, slideLeft(l, 1) + l.slideW / 4, l.slideTop + l.slideH / 2);
    expect(onSlide).toMatchObject({ kind: 'slide', index: 1, fx: 0.25, fy: 0.5 });
    expect(anchorAt(l, slideLeft(l, 0) + l.slideW + 10, 0)).toMatchObject({ kind: 'after', index: 0, dx: 10 });
    expect(anchorAt(l, 4, 0)).toMatchObject({ kind: 'before', dx: 4 - l.stripLeft });
  });

  it('finds every anchored point again in the same layout', () => {
    const l = computeStageLayout(base);
    for (const x of [3, l.stripLeft + 5, slideLeft(l, 1) + 17, slideLeft(l, 2) + l.slideW + 9, l.contentW - 3]) {
      const p = pointOf(l, anchorAt(l, x, 200));
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(200, 6);
    }
  });

  it('keeps the content under the cursor in place across a zoom', () => {
    const before = computeStageLayout({ ...base, slideCount: 8 });
    const after = computeStageLayout({ ...base, slideCount: 8, zoom: 2 });
    const scroll = { scrollLeft: 400, scrollTop: 0, viewportW: 900, viewportH: 848 };
    const cursor = { x: 300, y: 420 };
    const anchor = anchorAt(before, scroll.scrollLeft + cursor.x, scroll.scrollTop + cursor.y);
    const next = scrollForAnchor(before, after, scroll, cursor.x, cursor.y);
    const p = pointOf(after, anchor);
    expect(Math.abs(p.x - next.scrollLeft - cursor.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y - next.scrollTop - cursor.y)).toBeLessThanOrEqual(1);
  });

  it('clamps the scroll to the content', () => {
    const before = computeStageLayout({ ...base, zoom: 2 });
    const after = computeStageLayout(base);
    const next = scrollForAnchor(before, after, { scrollLeft: 2000, scrollTop: 900, viewportW: 900, viewportH: 848 }, 450, 424);
    expect(next.scrollLeft).toBeLessThanOrEqual(Math.max(0, after.contentW - 900));
    expect(next.scrollTop).toBe(0);
  });
});

describe('scrollToReveal', () => {
  const l = computeStageLayout({ ...base, slideCount: 10 });

  it('does nothing for a visible slide', () => {
    expect(scrollToReveal(l, 0, 0, 900)).toBeNull();
  });

  it('scrolls just enough to show a slide to the right or left', () => {
    const right = scrollToReveal(l, 5, 0, 900)!;
    expect(right + 900).toBe(slideLeft(l, 5) + l.slideW + 24);
    const left = scrollToReveal(l, 3, slideLeft(l, 6), 900)!;
    expect(left).toBe(slideLeft(l, 3) - 24);
  });

  it('snaps to the ends of the content near them', () => {
    expect(scrollToReveal(l, 0, slideLeft(l, 4), 900)).toBe(0);
    const max = l.contentW - 900;
    expect(scrollToReveal(l, l.count - 1, 0, 900, 24, l.addLeft + l.addW)).toBe(max);
  });

  it('brings the add tile along with the last slide when both fit', () => {
    const last = l.count - 1;
    const through = l.addLeft + l.addW;
    const x = scrollToReveal(l, last, 0, 900, 24, through)!;
    expect(x + 900).toBeGreaterThanOrEqual(through + 24);
    expect(x).toBeLessThanOrEqual(slideLeft(l, last) - 24);
    // Too wide together: only the slide.
    const narrow = l.slideW + 60;
    const tight = scrollToReveal(l, last, 0, narrow, 24, through)!;
    expect(tight + narrow).toBe(slideLeft(l, last) + l.slideW + 24);
  });

  it('centres slides wider than the viewport and ignores bad indexes', () => {
    const wide = computeStageLayout({ ...base, zoom: 4 });
    const x = scrollToReveal(wide, 1, 0, 900)!;
    expect(x + 450).toBeCloseTo(slideLeft(wide, 1) + wide.slideW / 2, 0);
    expect(scrollToReveal(l, -1, 0, 900)).toBeNull();
    expect(scrollToReveal(l, 99, 0, 900)).toBeNull();
  });
});

describe('wheel', () => {
  it('converts lines and pages to pixels', () => {
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(400);
    expect(wheelPixels(Number.NaN, 0)).toBe(0);
  });

  it('zooms in on negative deltas, out on positive, symmetric and bounded', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
    expect(wheelZoomFactor(-10000)).toBe(wheelZoomFactor(-120));
    expect(wheelZoomFactor(-4)).toBeLessThan(1.01);
  });
});

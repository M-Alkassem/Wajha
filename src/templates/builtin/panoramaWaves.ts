/**
 * Panorama Waves: one ocean across the whole listing. A deep-blue to
 * lagoon gradient with rolling wave lines runs from the first screenshot to
 * the last; swell rings and a low sun sit on the seams so they continue
 * from one slide into the next. Story: a surf and tide forecast app.
 *
 * Like every panorama template it designs each canvas shape: adapting a
 * layout cannot keep pieces on the seams and keep them clear of the copy.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, canvas, circle, copyAt, device, glow, linear, onStrip, pattern, r5, ring, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const SUN = '#ffd86b';

const t = typeset({
  heading: F.sora,
  body: F.manrope,
  ink: '#ffffff',
  soft: '#ffffff',
  accent: SUN,
  head: { weight: 700, size: 0.088, lineHeight: 1.12, letterSpacing: -0.03 },
  sub: { weight: 500, size: 0.04 },
});

const SHADOW = { color: '#020b2480', blur: 0.07, x: 0, y: 0.03 };
const phone = (o: DeviceOptions) => device({ color: METAL.white, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.white, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.silver, shadow: SHADOW, ...o });

/**
 * The sea per canvas shape: decoration scale, and the heights (fractions of
 * the canvas) of the swell rings, the sun and the two rows of waves. Smaller
 * canvases get a smaller sea, so the pieces on the seams stay clear of the copy.
 */
const SEA: Record<Cls, { k: number; rings: number; sun: number; swell: number; crest: number }> = {
  tall: { k: 1, rings: 0.66, sun: 0.6, swell: 1.05, crest: 1.11 },
  tablet: { k: 0.72, rings: 0.68, sun: 0.66, swell: 1.04, crest: 1.09 },
  wide: { k: 0.5, rings: 0.7, sun: 0.66, swell: 1.03, crest: 1.08 },
};

/** Everything that flows across slides, as seen from slide `i`. */
function sea(cls: Cls, i: number): SlideElement[] {
  const { wu } = canvas(cls);
  const { k, rings, sun, swell, crest } = SEA[cls];
  const size = (v: number) => r5(v * k);
  /** Half the width of a decoration `v` u wide, in slide widths. */
  const reach = (v: number) => (v * k) / 2 / wu;
  // Rolling swells along the bottom: one row centred on the seams, one between them.
  const swells = [0, 1, 2, 3, 4, 5].flatMap((X) => onStrip(i, X, reach(1.2), (x) => [circle({ name: 'Swell', x, y: swell, size: size(1.2), color: '#1b7fae', opacity: 0.5 })]));
  const crests = [0.5, 1.5, 2.5, 3.5, 4.5].flatMap((X) => onStrip(i, X, reach(1.2), (x) => [circle({ name: 'Crest', x, y: crest, size: size(1.2), color: '#43bfd6', opacity: 0.4 })]));
  const swellRings = (X: number, y: number) =>
    onStrip(i, X, reach(1.48), (x) => [
      ring({ name: 'Swell ring', x, y, size: size(1.44), stroke: 0.006, color: '#ffffff', opacity: 0.34 }),
      ring({ name: 'Swell ring', x, y, size: size(1.12), stroke: 0.004, color: '#ffffff', opacity: 0.24 }),
    ]);
  return [
    ...swellRings(1.0, rings),
    ...swellRings(4.0, r5(rings + 0.02)),
    // The sun going down on the seam between slides 3 | 4.
    ...onStrip(i, 3.0, reach(0.9), (x) => [glow({ name: 'Sun glow', x, y: sun, size: size(0.82), color: '#ffb36b', opacity: 0.55 }), circle({ name: 'Sun', x, y: sun, size: size(0.5), fill: linear(180, '#fff1b0', SUN, '#ff9f5a') })]),
    ...swells,
    ...crests,
  ];
}

function shot(i: number, o: DeviceOptions = {}) {
  return (cls: Cls): SlideElement[] => {
    if (cls === 'wide') {
      // Copy on top and the laptop below, centred: the seams at the slide edges stay free for the sea.
      return [...sea(cls, i), ...copyAt(t, { cls, seam: 0.2, width: 1.0, subWidth: 0.9, head: { size: 0.066 }, sub: { size: 0.03 } }), laptop({ width: 0.96, top: 0.35 })];
    }
    if (cls === 'tablet') {
      return [...sea(cls, i), ...copyAt(t, { cls, seam: 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } }), pad({ width: 0.66, top: 0.3, rotation: (o.rotation ?? 0) / 2 })];
    }
    return [...sea(cls, i), ...copyAt(t, { seam: 0.15 }), phone({ width: 0.7, top: 0.268, ...o })];
  };
}

const o = { classes: ALL_CLASSES };

export const panoramaWaves = template({
  id: 'panorama-waves',
  name: 'Panorama Waves',
  description: 'One ocean across the whole listing: a deep-blue to lagoon gradient with rolling wave lines, swell rings and a low sun that continue from one screenshot into the next.',
  category: 'panorama',
  tags: ['panorama', 'ocean', 'blue', 'waves', 'continuous'],
  apps: ['travel', 'calendar', 'social', 'fitness', 'chat', 'music', 'shop'],
  theme: theme({
    background: background(linear(90, '#061a44', '#0a3a7d', '#0b5a93', '#0a6585'), pattern('waves', '#ffffff', 0.08, 0.07)),
    heading: F.sora,
    body: F.manrope,
    palette: ['#1aa3c7', SUN, '#ff8a5b', '#7ce0d3', '#ffffff', '#061a44'],
    mockDark: false,
    panorama: true,
  }),
  slides: [
    slide(
      {
        en: { headline: 'Catch the *perfect* wave', subtitle: 'Hour-by-hour swell, wind and tide forecasts.' },
        ar: { headline: 'اصطد *الموجة* المثالية', subtitle: 'توقعات الأمواج والرياح والمدّ والجزر ساعة بساعة.' },
      },
      shot(0),
      o,
    ),
    slide(
      {
        en: { headline: 'Know *before* you go', subtitle: 'Live cams and reports from 8,000 surf spots.' },
        ar: { headline: 'اعرف *قبل* أن تنطلق', subtitle: 'كاميرات مباشرة وتقارير من 8000 موقع لركوب الأمواج.' },
      },
      shot(1, { rotation: -4 }),
      o,
    ),
    slide(
      {
        en: { headline: 'Your spots, *your* way', subtitle: 'Favorites, alerts and conditions at a glance.' },
        ar: { headline: 'مواقعك *المفضّلة* دائمًا', subtitle: 'المفضّلة والتنبيهات وأحوال البحر بنظرة واحدة.' },
      },
      shot(2),
      o,
    ),
    slide(
      {
        en: { headline: 'Chase the *sun*', subtitle: 'Sunrise sessions planned around the best light.' },
        ar: { headline: 'طارد *الشمس*', subtitle: 'جلسات الفجر مخطّطة حول أجمل ضوء في اليوم.' },
      },
      shot(3, { rotation: 4 }),
      o,
    ),
    slide(
      {
        en: { headline: 'Ride *together*', subtitle: 'Meet your crew at the next big swell.' },
        ar: { headline: 'اركبوا الموج *معًا*', subtitle: 'التقِ بأصدقائك عند الموجة الكبيرة القادمة.' },
      },
      shot(4),
      o,
    ),
  ],
});

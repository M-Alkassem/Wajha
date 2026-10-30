/**
 * Panorama Peaks: dawn over a mountain range that spans the whole listing.
 * Two ridges of peaks (squares turned 45 degrees) roll across every seam
 * under a violet-to-apricot sky, with the sun rising between slides 2 and
 * 3. Fraunces headlines. Story: a hiking and trail app.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, canvas, circle, copyAt, device, glow, linear, onStrip, rect, r5, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const t = typeset({
  heading: F.fraunces,
  body: F.manrope,
  ink: '#fff8ee',
  soft: '#ece2f7',
  accent: '#ffc387',
  head: { weight: 650, size: 0.092, lineHeight: 1.1, letterSpacing: -0.02 },
  sub: { weight: 500, size: 0.04 },
});

const SHADOW = { color: '#12082a8c', blur: 0.07, x: 0, y: 0.03 };

/** Peak sizes per canvas: the ridges keep their silhouette on every shape of canvas. */
const SCALE: Record<Cls, number> = { tall: 1, tablet: 0.72, wide: 0.5 };

/** A peak whose summit sits at `apex` (fraction of the canvas height): a square turned 45 degrees, mostly below the edge. */
function peak(cls: Cls, i: number, X: number, apex: number, side: number, color: string): SlideElement[] {
  const { wu, hu } = canvas(cls);
  const size = side * SCALE[cls];
  const half = (size * Math.SQRT2) / 2;
  return onStrip(i, X, half / wu, (x) => [rect({ name: 'Peak', x, y: r5(apex + half / hu), size: r5(size), rotation: 45, radius: 0.02, color })]);
}

const FAR: [number, number, number][] = [
  [0.48, 0.64, 1.0],
  [1.24, 0.6, 1.15],
  [1.98, 0.67, 0.95],
  [2.74, 0.61, 1.1],
  [3.5, 0.66, 1.0],
  [4.26, 0.6, 1.15],
  [5.0, 0.65, 1.0],
];
const NEAR: [number, number, number][] = [
  [0.12, 0.8, 1.05],
  [0.86, 0.76, 1.2],
  [1.6, 0.81, 1.05],
  [2.36, 0.77, 1.2],
  [3.12, 0.8, 1.1],
  [3.88, 0.76, 1.2],
  [4.64, 0.8, 1.1],
];

/** The sky and far ridge behind the device, as seen from slide `i`. */
function behind(cls: Cls, i: number): SlideElement[] {
  const k = SCALE[cls];
  return [
    ...onStrip(i, 2.0, 0.6, (x) => [glow({ name: 'Sun glow', x, y: 0.62, size: r5(1.0 * k), color: '#ffb085', opacity: 0.6 }), circle({ name: 'Sun', x, y: 0.62, size: r5(0.46 * k), fill: linear(180, '#fff3d6', '#ffc58f') })]),
    ...FAR.flatMap(([X, apex, side]) => peak(cls, i, X, apex, side, '#6b4b95')),
  ];
}

/** The near ridge, drawn over the lower part of the device so it rises out of the range. */
const front = (cls: Cls, i: number): SlideElement[] => NEAR.flatMap(([X, apex, side]) => peak(cls, i, X, apex, side, '#2b1e4e'));

function shot(i: number, o: DeviceOptions = {}) {
  return (cls: Cls): SlideElement[] => {
    if (cls === 'wide') {
      // Side by side: the laptop stands in front of the far ridge, clear of the near one.
      return [
        ...behind(cls, i),
        ...copyAt(t, { cls, seam: 0.36, x: 0.235, width: 0.5, align: 'start', head: { size: 0.074, maxLines: 3 }, sub: { size: 0.033, maxLines: 3 } }),
        device({ cls, frame: 'macbook', color: METAL.graphite, shadow: SHADOW, width: 0.86, x: 0.68, y: 0.41 }),
        ...front(cls, i),
      ];
    }
    if (cls === 'tablet') {
      return [
        ...behind(cls, i),
        ...copyAt(t, { cls, seam: 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } }),
        device({ cls, frame: 'ipad', color: METAL.graphite, shadow: SHADOW, width: 0.62, top: 0.29, rotation: (o.rotation ?? 0) / 2 }),
        ...front(cls, i),
      ];
    }
    return [...behind(cls, i), ...copyAt(t, { seam: 0.15 }), device({ color: METAL.graphite, shadow: SHADOW, width: 0.66, top: 0.255, ...o }), ...front(cls, i)];
  };
}

const o = { classes: ALL_CLASSES };

export const panoramaPeaks = template({
  id: 'panorama-peaks',
  name: 'Panorama Peaks',
  description: 'Dawn over a mountain range that spans the whole listing: two ridges roll across every seam under a violet-to-apricot sky, the sun rising between slides two and three.',
  category: 'panorama',
  tags: ['panorama', 'mountains', 'sunrise', 'outdoors', 'serif'],
  apps: ['travel', 'fitness', 'calendar', 'social', 'music', 'chat', 'shop'],
  theme: theme({
    background: background(linear(180, ['#171a45', 0], ['#3d2a72', 0.42], ['#b5577a', 0.68], ['#f39b6d', 0.84], ['#ffd29d', 1])),
    heading: F.fraunces,
    body: F.manrope,
    palette: ['#f2785c', '#ffc387', '#7c5cff', '#2b1e4e', '#fff8ee'],
    panorama: true,
  }),
  slides: [
    slide(
      {
        en: { headline: 'Find your next *summit*', subtitle: '40,000 trails with offline maps and elevation.' },
        ar: { headline: 'اكتشف *قمّتك* القادمة', subtitle: '40 ألف مسار مع خرائط تعمل دون إنترنت وبيانات الارتفاع.' },
      },
      shot(0),
      o,
    ),
    slide(
      {
        en: { headline: 'Every step, *tracked*', subtitle: 'Distance, pace and climb, even without signal.' },
        ar: { headline: 'كل خطوة *محسوبة*', subtitle: 'المسافة والسرعة والصعود حتى دون تغطية.' },
      },
      shot(1),
      o,
    ),
    slide(
      {
        en: { headline: 'Start at *sunrise*', subtitle: 'Golden-hour alerts for views worth waking up for.' },
        ar: { headline: 'ابدأ مع *الشروق*', subtitle: 'تنبيهات للحظات الذهبية التي تستحق الاستيقاظ مبكرًا.' },
      },
      shot(2),
      o,
    ),
    slide(
      {
        en: { headline: 'Hike *safer*', subtitle: 'Share your live route with people you trust.' },
        ar: { headline: 'تنزّه *بأمان*', subtitle: 'شارك مسارك المباشر مع من تثق بهم.' },
      },
      shot(3),
      o,
    ),
    slide(
      {
        en: { headline: 'Collect the *peaks*', subtitle: 'Badges and stats for every mountain you climb.' },
        ar: { headline: 'اجمع *القمم*', subtitle: 'أوسمة وإحصاءات لكل جبل تتسلّقه.' },
      },
      shot(4),
      o,
    ),
  ],
});

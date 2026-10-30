/**
 * Panorama Ribbon: bright ribbons of colour loop through the whole listing.
 * A pastel paper strip drifting from peach to lilac to mint, thick gradient
 * rings centred on the seams so every loop continues into the next slide,
 * Bricolage Grotesque headlines with hot pink highlights. Story: a photo
 * editing app.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, canvas, copyAt, device, linear, onStrip, ring, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const PINK = '#ff3d7f';

const t = typeset({
  heading: F.bricolage,
  body: F.jakarta,
  ink: '#1a1424',
  soft: '#4b4458',
  accent: PINK,
  head: { weight: 750, size: 0.092, lineHeight: 1.1, letterSpacing: -0.03 },
  sub: { weight: 500, size: 0.04 },
});

const SHADOW = { color: '#3a1f4d40', blur: 0.07, x: 0, y: 0.03 };

type Loop = [X: number, y: number, size: number, stroke: number, from: string, to: string, angle: number];

/** The loops per canvas shape, kept below the copy so highlights stay readable. */
const LOOPS: Record<Cls, Loop[]> = {
  tall: [
    [-0.02, 0.47, 0.7, 0.08, '#ffb347', '#ff5f8f', 90],
    [1.0, 0.69, 1.5, 0.11, '#ff5f8f', '#ffb347', 120],
    [2.0, 0.94, 1.22, 0.09, '#2ec4b6', '#7c5cff', 30],
    [3.0, 0.65, 1.36, 0.11, '#7c5cff', '#ff5f8f', 60],
    [4.06, 0.92, 1.0, 0.09, '#ffb347', '#2ec4b6', 150],
    [5.02, 0.5, 0.8, 0.08, '#2ec4b6', '#7c5cff', 90],
  ],
  tablet: [
    [-0.02, 0.52, 0.5, 0.06, '#ffb347', '#ff5f8f', 90],
    [1.0, 0.74, 1.04, 0.08, '#ff5f8f', '#ffb347', 120],
    [2.0, 1.0, 0.9, 0.065, '#2ec4b6', '#7c5cff', 30],
    [3.0, 0.7, 0.96, 0.08, '#7c5cff', '#ff5f8f', 60],
    [4.06, 0.98, 0.72, 0.065, '#ffb347', '#2ec4b6', 150],
    [5.02, 0.52, 0.58, 0.06, '#2ec4b6', '#7c5cff', 90],
  ],
  wide: [
    [-0.02, 0.56, 0.44, 0.05, '#ffb347', '#ff5f8f', 90],
    [1.0, 0.66, 0.84, 0.065, '#ff5f8f', '#ffb347', 120],
    [2.0, 0.96, 0.7, 0.055, '#2ec4b6', '#7c5cff', 30],
    [3.0, 0.62, 0.78, 0.065, '#7c5cff', '#ff5f8f', 60],
    [4.04, 0.94, 0.6, 0.055, '#ffb347', '#2ec4b6', 150],
    [5.02, 0.56, 0.5, 0.05, '#2ec4b6', '#7c5cff', 90],
  ],
};

function ribbons(cls: Cls, i: number): SlideElement[] {
  const { wu } = canvas(cls);
  return LOOPS[cls].flatMap(([X, y, size, stroke, from, to, angle]) => onStrip(i, X, size / 2 / wu, (x) => [ring({ name: 'Ribbon', x, y, size, stroke, fill: linear(angle, from, to) })]));
}

function shot(i: number, o: DeviceOptions = {}) {
  return (cls: Cls): SlideElement[] => {
    if (cls === 'wide') {
      return [
        ...ribbons(cls, i),
        ...copyAt(t, { cls, seam: 0.2, width: 1.2, subWidth: 0.95, head: { size: 0.068 }, sub: { size: 0.03 } }),
        device({ cls, frame: 'macbook', color: METAL.silver, shadow: SHADOW, width: 0.98, top: 0.35 }),
      ];
    }
    if (cls === 'tablet') {
      return [
        ...ribbons(cls, i),
        ...copyAt(t, { cls, seam: 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } }),
        device({ cls, frame: 'ipad', color: METAL.silver, shadow: SHADOW, width: 0.68, top: 0.3, rotation: (o.rotation ?? 0) / 2 }),
      ];
    }
    return [...ribbons(cls, i), ...copyAt(t, { seam: 0.15 }), device({ color: METAL.silver, shadow: SHADOW, width: 0.74, top: 0.262, ...o })];
  };
}

const o = { classes: ALL_CLASSES };

export const panoramaRibbon = template({
  id: 'panorama-ribbon',
  name: 'Panorama Ribbon',
  description: 'Bright ribbons loop through the whole listing: a pastel paper strip drifting from peach to lilac to mint, with thick gradient rings centred on the seams so every loop continues into the next slide.',
  category: 'panorama',
  tags: ['panorama', 'light', 'colorful', 'creative', 'continuous'],
  apps: ['social', 'shop', 'music', 'chat', 'calendar', 'travel'],
  theme: theme({
    background: background(linear(90, '#fff2e8', '#f6efff', '#edf4ff', '#effaf4')),
    heading: F.bricolage,
    body: F.jakarta,
    palette: [PINK, '#ffb347', '#7c5cff', '#2ec4b6', '#ffffff', '#1a1424'],
    panorama: true,
  }),
  slides: [
    slide(
      {
        en: { headline: 'Color that *flows*', subtitle: 'Pro-grade photo editing in a single swipe.' },
        ar: { headline: 'ألوان *تنساب* بسلاسة', subtitle: 'تحرير صور احترافي بلمسة واحدة.' },
      },
      shot(0),
      o,
    ),
    slide(
      {
        en: { headline: 'Presets with *soul*', subtitle: 'Film-inspired looks crafted by real photographers.' },
        ar: { headline: 'فلاتر *بروح* فنية', subtitle: 'لمسات مستوحاة من الأفلام صمّمها مصوّرون محترفون.' },
      },
      shot(1, { rotation: -4 }),
      o,
    ),
    slide(
      {
        en: { headline: 'Edit *anywhere*', subtitle: 'Your edits sync across phone, tablet and desktop.' },
        ar: { headline: 'حرّر صورك *أينما* كنت', subtitle: 'تعديلاتك متزامنة بين الهاتف والجهاز اللوحي والحاسوب.' },
      },
      shot(2),
      o,
    ),
    slide(
      {
        en: { headline: 'Share in *style*', subtitle: 'Perfect crops for every feed, story and post.' },
        ar: { headline: 'شارك *بأناقة*', subtitle: 'مقاسات مثالية لكل منشور وقصة.' },
      },
      shot(3, { rotation: 4 }),
      o,
    ),
    slide(
      {
        en: { headline: 'Made for *makers*', subtitle: 'Layers, masks and curves when you want more control.' },
        ar: { headline: 'صُمّم *للمبدعين*', subtitle: 'طبقات وأقنعة ومنحنيات حين تريد تحكّمًا أكبر.' },
      },
      shot(4),
      o,
    ),
  ],
});

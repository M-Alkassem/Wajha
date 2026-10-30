/**
 * Desert Dune (كثيب): designed Arabic first. A sand-to-terracotta sky with
 * a fine pattern of concentric rings, a pale sun, dunes that the desert
 * titanium phone rises out of, Readex Pro type in deep earth tones. Story:
 * a desert camps and experiences app.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, circle, copyAt, device, glow, linear, pattern, slide, template, theme, typeset } from '../kit';

const t = typeset({
  heading: F.readex,
  body: F.readex,
  ink: '#3a1d0e',
  soft: '#5c3a26',
  accent: '#a8431c',
  head: { weight: 700, size: 0.088, lineHeight: 1.24, letterSpacing: -0.015 },
  sub: { weight: 400, size: 0.04, lineHeight: 1.45 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: METAL.desert, shadow: { color: '#5a2a1066', blur: 0.07, x: 0, y: 0.03 }, ...o });

/** Two dunes: one behind the phone, one in front of its lower edge. */
const farDune = (x: number) => circle({ name: 'Far dune', x, y: 1.0, width: 2.3, height: 0.66, color: '#d58e58' });
const nearDune = (x: number) => circle({ name: 'Near dune', x, y: 1.05, width: 2.1, height: 0.5, color: '#b8693b' });
const sun = (x: number, y: number, size: number): SlideElement[] => [glow({ name: 'Sun glow', x, y, size: size * 1.4, color: '#fff3d6', opacity: 0.6 }), circle({ name: 'Sun', x, y, size, color: '#fff1d2', opacity: 0.9 })];

const top = () => copyAt(t, { seam: 0.165 });

const hero = (): SlideElement[] => [...sun(0.78, 0.44, 0.36), farDune(0.15), ...top(), phone({ width: 0.78, top: 0.275 }), nearDune(0.9)];

const tilted = (): SlideElement[] => [...sun(0.2, 0.42, 0.3), farDune(0.85), ...top(), phone({ width: 0.76, top: 0.283, x: 0.53, rotation: -6 }), nearDune(0.12)];

const pair = (): SlideElement[] => [
  ...sun(0.5, 0.42, 0.32),
  farDune(0.5),
  ...top(),
  phone({ width: 0.58, top: 0.33, x: 0.7, rotation: 5, slot: 'second' }),
  phone({ width: 0.62, top: 0.285, x: 0.33, rotation: -4 }),
  nearDune(0.6),
];

/** Night in the camp: the copy sits low on the warm sand, the phone hangs from a starry top. */
const night = (): SlideElement[] => [...sun(0.5, 0.12, 0.5), phone({ width: 0.8, bottom: 0.65 }), ...copyAt(t, { seam: 0.81 })];

const share = (): SlideElement[] => [...sun(0.5, 0.5, 0.95), farDune(0.8), ...top(), phone({ width: 0.76, top: 0.28 }), nearDune(0.2)];

export const desertDune = template({
  id: 'desert-dune',
  name: 'Desert Dune',
  description: 'Designed Arabic first: a sand-to-terracotta sky with a fine pattern of concentric rings, a pale sun and soft dunes the desert-titanium phone rises out of, in deep earth tones.',
  category: 'elegant',
  tags: ['arabic', 'desert', 'warm', 'travel', 'geometric'],
  apps: ['travel', 'shop', 'calendar', 'social', 'chat', 'music'],
  theme: theme({
    background: background(linear(180, ['#f8ead3', 0], ['#efcfa1', 0.55], ['#dd9c69', 1]), pattern('rings', '#8a4b2a', 0.08, 0.075)),
    heading: F.readex,
    body: F.readex,
    palette: ['#c4622d', '#2f7a78', '#e3a04f', '#3a1d0e', '#f8ead3'],
  }),
  slides: [
    slide(
      {
        ar: { headline: 'اكتشف *سحر* الصحراء', subtitle: 'تخييم وسفاري وتجارب لا تُنسى تحت سماء مرصّعة بالنجوم.' },
        en: { headline: 'Discover the desert’s *magic*', subtitle: 'Camping, safaris and nights under a sky full of stars.' },
      },
      hero,
    ),
    slide(
      {
        ar: { headline: 'احجز *مغامرتك* في دقائق', subtitle: 'مرشدون محليون موثوقون وأسعار واضحة دون مفاجآت.' },
        en: { headline: 'Book your *adventure* in minutes', subtitle: 'Trusted local guides and clear prices, no surprises.' },
      },
      tilted,
    ),
    slide(
      {
        ar: { headline: 'تراثٌ *حيّ*', subtitle: 'تذوّق القهوة العربية واستمع إلى حكايات البادية.' },
        en: { headline: 'Living *heritage*', subtitle: 'Taste Arabic coffee and hear the stories of the Bedouin.' },
      },
      pair,
    ),
    slide(
      {
        ar: { headline: 'ليالٍ *تحت النجوم*', subtitle: 'مخيّمات فاخرة بعيدًا عن صخب المدينة.' },
        en: { headline: 'Nights *under the stars*', subtitle: 'Luxury camps far from the noise of the city.' },
      },
      night,
    ),
    slide(
      {
        ar: { headline: 'شارك *رحلتك*', subtitle: 'صور ومسارات وذكريات تتشاركها مع من تحب.' },
        en: { headline: 'Share your *journey*', subtitle: 'Photos, routes and memories to share with loved ones.' },
      },
      share,
    ),
  ],
});

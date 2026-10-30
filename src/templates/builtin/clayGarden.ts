/**
 * Clay Garden: soft, hand-made, happy. Warm cream with pastel blobs, clay
 * phones in sage, peach, lilac, butter and sky with matching bezels,
 * friendly Outfit headlines with terracotta highlights. Story: a plant
 * care app.
 */
import type { SlideElement } from '../../model/types';
import { F, background, blob, circle, copyAt, device, radial, slide, template, theme, typeset } from '../kit';

const CLAY = { sage: '#a8cdb1', peach: '#f4bea3', lilac: '#c9b8f0', butter: '#f2d98f', sky: '#acd0ee' } as const;
const SOFT = { sage: '#d3e8d6', peach: '#fbdccb', lilac: '#e6dcfa', butter: '#f8eabd', sky: '#d4e7f7' } as const;

const t = typeset({
  heading: F.outfit,
  body: F.dmSans,
  ink: '#24382b',
  soft: '#4b5a50',
  accent: '#d45d38',
  head: { weight: 700, size: 0.094, lineHeight: 1.1, letterSpacing: -0.025 },
  sub: { weight: 500, size: 0.041 },
});

const clay = (color: string, o: Parameters<typeof device>[0]) => device({ color, finish: 'clay', bezel: 'match', shadow: { color: '#5a4a3240', blur: 0.06, x: 0, y: 0.028 }, ...o });

const top = () => copyAt(t, { seam: 0.152 });

const hero = (): SlideElement[] => [
  blob({ x: 0.5, y: 0.62, width: 1.1, height: 1.0, seed: 11, color: SOFT.sage }),
  circle({ x: 0.9, y: 0.36, size: 0.18, color: SOFT.peach }),
  circle({ x: 0.08, y: 0.05, size: 0.07, color: SOFT.butter }),
  ...top(),
  clay(CLAY.sage, { width: 0.78, top: 0.258 }),
];

const pair = (): SlideElement[] => [
  blob({ x: 0.72, y: 0.6, width: 0.8, height: 0.74, seed: 4, color: SOFT.peach }),
  blob({ x: 0.26, y: 0.78, width: 0.8, height: 0.7, seed: 9, color: SOFT.lilac }),
  ...top(),
  clay(CLAY.peach, { width: 0.6, top: 0.31, x: 0.7, rotation: 6, slot: 'second' }),
  clay(CLAY.lilac, { width: 0.62, top: 0.262, x: 0.33, rotation: -5 }),
];

const tilted = (): SlideElement[] => [
  blob({ x: 0.36, y: 0.58, width: 1.0, height: 0.9, seed: 21, color: SOFT.butter }),
  circle({ x: 0.12, y: 0.4, size: 0.14, color: SOFT.sky }),
  ...top(),
  clay(CLAY.butter, { width: 0.78, top: 0.266, x: 0.53, rotation: -8 }),
];

const hanging = (): SlideElement[] => [
  blob({ x: 0.5, y: 0.34, width: 1.1, height: 0.95, seed: 15, color: SOFT.sky }),
  circle({ x: 0.86, y: 0.7, size: 0.16, color: SOFT.sage }),
  clay(CLAY.sky, { width: 0.8, bottom: 0.67 }),
  ...copyAt(t, { seam: 0.81 }),
];

const bloom = (): SlideElement[] => [
  blob({ x: 0.2, y: 0.5, width: 0.62, height: 0.56, seed: 2, color: SOFT.peach }),
  blob({ x: 0.82, y: 0.74, width: 0.7, height: 0.62, seed: 31, color: SOFT.sage }),
  ...top(),
  clay(CLAY.lilac, { width: 0.78, top: 0.258 }),
];

export const clayGarden = template({
  id: 'clay-garden',
  name: 'Clay Garden',
  description: 'Soft, hand-made and happy: warm cream with pastel blobs, clay phones in sage, peach, lilac, butter and sky with matching bezels, and friendly headlines with terracotta highlights.',
  category: 'playful',
  tags: ['clay', 'pastel', 'friendly', 'plants', 'soft'],
  apps: ['calendar', 'tasks', 'social', 'shop', 'chat', 'meditation', 'fitness'],
  theme: theme({
    background: background(radial(0.5, 0.28, 0.95, '#fcf7ef', '#f1e8da')),
    heading: F.outfit,
    body: F.dmSans,
    palette: ['#5aa36f', '#d45d38', '#9b7fe0', '#e8b63c', '#fcf7ef', '#24382b'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Happy plants, *happy* home', subtitle: 'Care reminders tailored to every plant you own.' },
        ar: { headline: 'نباتات سعيدة، *بيت* سعيد', subtitle: 'تذكيرات عناية مصمّمة لكل نبتة في بيتك.' },
      },
      hero,
    ),
    slide(
      {
        en: { headline: 'Never miss a *watering*', subtitle: 'Smart schedules adapt to light, season and pot size.' },
        ar: { headline: 'لا تفوّت *موعد* السقاية', subtitle: 'جداول ذكية تتكيّف مع الضوء والموسم وحجم الأصيص.' },
      },
      pair,
    ),
    slide(
      {
        en: { headline: 'Snap to *identify*', subtitle: 'Point your camera at any leaf to learn its name.' },
        ar: { headline: 'صوّر *لتتعرّف*', subtitle: 'وجّه الكاميرا نحو أي ورقة لتعرف اسم النبتة.' },
      },
      tilted,
    ),
    slide(
      {
        en: { headline: 'Grow *together*', subtitle: 'Swap cuttings and tips with plant lovers nearby.' },
        ar: { headline: 'ازرعوا *معًا*', subtitle: 'تبادلوا الشتلات والنصائح مع محبي النباتات من حولكم.' },
      },
      hanging,
    ),
    slide(
      {
        en: { headline: 'Watch them *thrive*', subtitle: 'Growth journals with photos, week after week.' },
        ar: { headline: 'شاهدها *تزدهر*', subtitle: 'مذكّرات نمو مصوّرة أسبوعًا بعد أسبوع.' },
      },
      bloom,
    ),
  ],
});

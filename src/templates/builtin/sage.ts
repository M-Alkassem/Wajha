/**
 * Sage: quiet and unhurried. Soft sage paper, a tonal disc that holds each
 * phone, generous space, Manrope in deep green with a leafy highlight and a
 * natural titanium phone. Story: a habit tracker.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, circle, copyAt, device, ring, slide, solid, template, theme, typeset } from '../kit';

const DISC = '#d5ddcc';
const t = typeset({
  heading: F.manrope,
  body: F.manrope,
  ink: '#1e2a1f',
  soft: '#475448',
  accent: '#467446',
  head: { weight: 700, size: 0.088, lineHeight: 1.12, letterSpacing: -0.03 },
  sub: { weight: 500, size: 0.04, lineHeight: 1.38 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: METAL.titanium, shadow: { color: '#2d3a2a33', blur: 0.07, x: 0, y: 0.03 }, ...o });

const top = () => copyAt(t, { seam: 0.155 });

const hero = (): SlideElement[] => [circle({ name: 'Disc', x: 0.5, y: 0.66, size: 1.12, color: DISC }), ...top(), phone({ width: 0.74, top: 0.27 })];

const offset = (): SlideElement[] => [circle({ name: 'Disc', x: 0.62, y: 0.64, size: 1.0, color: DISC }), ...top(), phone({ width: 0.72, top: 0.272, x: 0.56 })];

const pair = (): SlideElement[] => [
  circle({ name: 'Disc', x: 0.5, y: 0.7, size: 1.2, color: DISC }),
  ...top(),
  phone({ width: 0.56, top: 0.32, x: 0.69, slot: 'second' }),
  phone({ width: 0.6, top: 0.275, x: 0.34 }),
];

const hanging = (): SlideElement[] => [circle({ name: 'Disc', x: 0.5, y: 0.3, size: 1.12, color: DISC }), phone({ width: 0.76, bottom: 0.655 }), ...copyAt(t, { seam: 0.815 })];

const steady = (): SlideElement[] => [
  circle({ name: 'Disc', x: 0.5, y: 0.66, size: 1.0, color: DISC }),
  ring({ x: 0.5, y: 0.66, size: 1.22, stroke: 0.003, color: '#467446', opacity: 0.35 }),
  ...top(),
  phone({ width: 0.72, top: 0.275 }),
];

export const sage = template({
  id: 'sage',
  name: 'Sage',
  description: 'Quiet and unhurried: soft sage paper, a tonal disc that holds each phone, generous space, Manrope in deep green with a leafy highlight and a natural titanium phone.',
  category: 'minimal',
  tags: ['calm', 'green', 'minimal', 'habits', 'soft'],
  apps: ['tasks', 'fitness', 'meditation', 'calendar', 'chat', 'social'],
  theme: theme({
    background: background(solid('#e4e9de')),
    heading: F.manrope,
    body: F.manrope,
    palette: ['#3d9a50', '#e2a54a', '#7b9cc4', '#1e2a1f', '#e4e9de'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Small habits, *big* change', subtitle: 'Build routines that actually stick.' },
        ar: { headline: 'عادات صغيرة، *أثر* كبير', subtitle: 'ابنِ روتينًا يدوم فعلًا.' },
      },
      hero,
    ),
    slide(
      {
        en: { headline: 'One day at a *time*', subtitle: 'Gentle reminders, never guilt trips.' },
        ar: { headline: 'يومًا *بيوم*', subtitle: 'تذكيرات لطيفة دون أي شعور بالذنب.' },
      },
      offset,
    ),
    slide(
      {
        en: { headline: 'See your *streaks*', subtitle: 'Progress you can feel, week after week.' },
        ar: { headline: 'تابع *إنجازاتك*', subtitle: 'تقدّم تلمسه أسبوعًا بعد أسبوع.' },
      },
      pair,
    ),
    slide(
      {
        en: { headline: 'Mindful *mornings*', subtitle: 'Start each day with breath, water and intention.' },
        ar: { headline: 'صباحات *واعية*', subtitle: 'ابدأ يومك بالتنفّس والماء ونيّة واضحة.' },
      },
      hanging,
    ),
    slide(
      {
        en: { headline: 'Quietly *motivating*', subtitle: 'No badges, no noise, just steady progress.' },
        ar: { headline: 'تحفيز *هادئ*', subtitle: 'بلا شارات ولا ضجيج، تقدّم ثابت فقط.' },
      },
      steady,
    ),
  ],
});

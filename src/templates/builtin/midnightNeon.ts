/**
 * Midnight Neon: after dark. A violet night fading to black over a cyan
 * synthwave grid, neon tube rings in magenta and cyan, Space Grotesk set in
 * capitals, black phones. Story: a nightlife and live music app.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, copyAt, device, glow, pattern, radial, ring, slide, template, theme, typeset } from '../kit';

const PINK = '#ff2bd6';
const CYAN = '#00e5ff';

const t = typeset({
  heading: F.spaceGrotesk,
  body: F.spaceGrotesk,
  ink: '#ffffff',
  soft: '#d8d1f4',
  accent: '#ff5ddc',
  head: { weight: 700, size: 0.084, lineHeight: 1.12, letterSpacing: 0.005, transform: 'uppercase' },
  sub: { weight: 400, size: 0.04 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: METAL.black, shadow: { color: '#000000b3', blur: 0.08, x: 0, y: 0.035 }, ...o });

/** A neon tube: a coloured glow with a hot white core. */
const neon = (x: number, y: number, size: number, color: string): SlideElement[] => [
  ring({ name: 'Neon tube', x, y, size, stroke: 0.014, color, blur: 0.035, opacity: 0.95 }),
  ring({ name: 'Neon core', x, y, size: size - 0.009, stroke: 0.004, color: '#fff4fd', opacity: 0.95 }),
];

const lights = (flip = false): SlideElement[] => [
  glow({ x: flip ? 0.86 : 0.14, y: 0.5, size: 0.7, color: PINK, opacity: 0.4 }),
  glow({ x: flip ? 0.16 : 0.86, y: 0.78, size: 0.62, color: CYAN, opacity: 0.32 }),
];

const top = () => copyAt(t, { seam: 0.15 });

const hero = (): SlideElement[] => [...lights(), ...neon(0.5, 0.6, 1.02, PINK), ...top(), phone({ width: 0.78, top: 0.255 })];

const tilted = (): SlideElement[] => [glow({ x: 0.1, y: 0.04, size: 0.34, color: PINK, opacity: 0.34 }), ...neon(0.84, 0.36, 0.42, CYAN), ...top(), phone({ width: 0.78, top: 0.265, x: 0.47, rotation: 8 })];

const crowd = (): SlideElement[] => [
  ...lights(),
  ...top(),
  phone({ width: 0.6, top: 0.31, x: 0.7, rotation: 7, slot: 'second' }),
  phone({ width: 0.63, top: 0.26, x: 0.33, rotation: -6 }),
];

const hanging = (): SlideElement[] => [
  glow({ x: 0.5, y: 0.34, size: 0.9, color: PINK, opacity: 0.36 }),
  ...neon(0.5, 0.33, 1.0, CYAN),
  phone({ width: 0.8, bottom: 0.68 }),
  ...copyAt(t, { seam: 0.81 }),
];

const pair = (): SlideElement[] => [...neon(0.36, 0.56, 0.9, PINK), ...neon(0.66, 0.68, 0.9, CYAN), ...top(), phone({ width: 0.76, top: 0.26 })];

export const midnightNeon = template({
  id: 'midnight-neon',
  name: 'Midnight Neon',
  description: 'After dark: a violet night fading to black over a cyan synthwave grid, neon tube rings in magenta and cyan, capital Space Grotesk headlines and black phones.',
  category: 'dark',
  tags: ['neon', 'night', 'music', 'synthwave', 'glow'],
  apps: ['music', 'social', 'chat', 'calendar', 'shop', 'travel', 'finance'],
  theme: theme({
    background: background(radial(0.5, 0, 1.05, ['#3a0f63', 0], ['#14072b', 0.5], ['#07050d', 1]), pattern('grid', CYAN, 0.07, 0.1)),
    heading: F.spaceGrotesk,
    body: F.spaceGrotesk,
    palette: ['#ff4fd8', CYAN, '#7c4dff', '#ffd23f', '#ffffff', '#07050d'],
    mockDark: true,
  }),
  slides: [
    slide(
      {
        en: { headline: 'Find your *night*', subtitle: 'The best gigs, clubs and DJ sets in your city.' },
        ar: { headline: 'اعثر على *سهرتك*', subtitle: 'أفضل الحفلات والعروض الموسيقية في مدينتك.' },
      },
      hero,
    ),
    slide(
      {
        en: { headline: 'Tickets in *one tap*', subtitle: 'Skip the line with passes that live in your wallet.' },
        ar: { headline: 'تذكرتك *بلمسة*', subtitle: 'تجاوز الطوابير بتذاكر محفوظة في محفظتك الرقمية.' },
      },
      tilted,
    ),
    slide(
      {
        en: { headline: 'Go *together*', subtitle: 'See where friends are heading and join the plan.' },
        ar: { headline: 'اذهبوا *معًا*', subtitle: 'اعرف وجهة أصدقائك وانضم إلى خطتهم.' },
      },
      crowd,
    ),
    slide(
      {
        en: { headline: 'Never miss a *drop*', subtitle: 'Alerts the moment your favorite artists announce.' },
        ar: { headline: 'لا تفوّت أي *حفلة*', subtitle: 'تنبيهات فورية حين يعلن فنانوك المفضّلون عن عروضهم.' },
      },
      hanging,
    ),
    slide(
      {
        en: { headline: 'Relive the *set*', subtitle: 'Playlists from every show you go to.' },
        ar: { headline: 'عِش *اللحظة* من جديد', subtitle: 'قوائم تشغيل من كل حفلة تحضرها.' },
      },
      pair,
    ),
  ],
});

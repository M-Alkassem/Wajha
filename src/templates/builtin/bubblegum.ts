/**
 * Bubblegum: pure fun. Candy pink with a white dot screen, confetti, a
 * jelly blob behind white phones at jaunty angles, round Rubik headlines
 * with sunny marker highlights. Story: a social app for friend groups.
 */
import type { SlideElement } from '../../model/types';
import { F, background, blob, circle, copyAt, device, linear, pattern, ring, slide, template, theme, typeset, type Cls } from '../kit';

const t = typeset({
  heading: F.rubik,
  body: F.rubik,
  ink: '#2b0b3f',
  soft: '#4a1a5c',
  accent: '#fff36b',
  mode: 'marker',
  head: { weight: 800, size: 0.096, lineHeight: 1.12, letterSpacing: -0.02 },
  sub: { weight: 500, size: 0.041 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: '#ffffff', finish: 'matte', shadow: { color: '#7a1f5c4d', blur: 0.06, x: 0, y: 0.03 }, ...o });

/** Confetti: a handful of small dots in party colours. */
const confetti = (spots: [number, number, number, string][]): SlideElement[] => spots.map(([x, y, size, color]) => circle({ name: 'Confetti', x, y, size, color }));

const top = () => copyAt(t, { seam: 0.152 });

const hero = (): SlideElement[] => [
  blob({ x: 0.56, y: 0.6, width: 1.0, height: 0.86, seed: 3, color: '#a98bff' }),
  ...confetti([[0.1, 0.33, 0.06, '#fff36b'], [0.9, 0.44, 0.08, '#ffffff'], [0.14, 0.86, 0.05, '#6ee7c8']]),
  ...top(),
  phone({ width: 0.78, top: 0.264, x: 0.56, rotation: -10 }),
];

const pair = (): SlideElement[] => [
  blob({ x: 0.5, y: 0.7, width: 1.15, height: 0.8, seed: 8, color: '#6ee7c8' }),
  ...confetti([[0.08, 0.4, 0.07, '#fff36b'], [0.93, 0.33, 0.05, '#a98bff']]),
  ...top(),
  phone({ width: 0.6, top: 0.31, x: 0.71, rotation: 10, slot: 'second' }),
  phone({ width: 0.62, top: 0.262, x: 0.32, rotation: -8 }),
];

const tipped = (): SlideElement[] => [
  blob({ x: 0.42, y: 0.62, width: 0.95, height: 0.85, seed: 13, color: '#fff36b' }),
  ...confetti([[0.9, 0.36, 0.07, '#a98bff'], [0.86, 0.84, 0.05, '#ffffff']]),
  ...top(),
  phone({ width: 0.78, top: 0.264, x: 0.47, rotation: 10 }),
];

const hanging = (): SlideElement[] => [
  blob({ x: 0.5, y: 0.32, width: 1.1, height: 0.9, seed: 17, color: '#a98bff' }),
  ...confetti([[0.12, 0.7, 0.06, '#fff36b'], [0.9, 0.66, 0.07, '#6ee7c8']]),
  phone({ width: 0.8, bottom: 0.665, x: 0.5, rotation: 6 }),
  ...copyAt(t, { seam: 0.81 }),
];

const sticker = (): SlideElement[] => [
  ring({ x: 0.5, y: 0.6, size: 1.05, stroke: 0.03, color: '#ffffff', opacity: 0.85 }),
  ...confetti([[0.1, 0.36, 0.07, '#fff36b'], [0.92, 0.5, 0.06, '#a98bff'], [0.08, 0.78, 0.05, '#6ee7c8']]),
  ...top(),
  phone({ width: 0.78, top: 0.258 }),
];

/** Mac: copy in the left column, the laptop on a jelly blob on the right. */
function wide(variant: number): SlideElement[] {
  const blobs = ['#a98bff', '#6ee7c8', '#fff36b', '#a98bff', '#ffffff'];
  return [
    blob({ x: 0.7, y: 0.56, width: 0.95, height: 0.8, seed: 3 + variant * 5, color: blobs[variant % blobs.length], opacity: variant === 4 ? 0.7 : 1 }),
    ...confetti([[0.52, 0.14, 0.05, '#fff36b'], [0.96, 0.2, 0.06, '#ffffff'], [0.93, 0.88, 0.045, '#6ee7c8']]),
    ...copyAt(t, { cls: 'wide', seam: 0.5, x: 0.235, width: 0.5, align: 'start', head: { size: 0.076, maxLines: 3 }, sub: { size: 0.034, maxLines: 3 } }),
    device({ cls: 'wide', frame: 'macbook', color: '#e4e4e7', width: 0.84, x: 0.7, y: 0.5, rotation: variant % 2 ? 3 : -3, shadow: { color: '#7a1f5c4d', blur: 0.06, x: 0, y: 0.03 } }),
  ];
}

const both = (tall: () => SlideElement[], variant: number) => (cls: Cls) => (cls === 'wide' ? wide(variant) : tall());
const WIDE = { classes: ['tall', 'wide'] as Cls[] };

export const bubblegum = template({
  id: 'bubblegum',
  name: 'Bubblegum',
  description: 'Pure fun: candy pink with a white dot screen, confetti and jelly blobs behind white phones at jaunty angles, round Rubik headlines with sunny marker highlights.',
  category: 'playful',
  tags: ['pink', 'fun', 'social', 'marker', 'confetti'],
  apps: ['social', 'chat', 'music', 'shop', 'calendar', 'travel'],
  theme: theme({
    background: background(linear(165, '#ffb8dd', '#ff8ec9'), pattern('dots', '#ffffff', 0.32, 0.06)),
    heading: F.rubik,
    body: F.rubik,
    palette: ['#8b5cf6', '#fff36b', '#2ed3a8', '#ff4fa3', '#ffffff', '#2b0b3f'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Hang out *more*', subtitle: 'Find a time that works for everyone, instantly.' },
        ar: { headline: 'التقوا *أكثر*', subtitle: 'اعثروا على وقت يناسب الجميع في لحظة.' },
      },
      both(hero, 0),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Chat in *color*', subtitle: 'Stickers, voice notes and reactions that pop.' },
        ar: { headline: 'دردشة *ملوّنة*', subtitle: 'ملصقات ورسائل صوتية وتفاعلات مبهجة.' },
      },
      both(pair, 1),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Share the *moment*', subtitle: 'Photo dumps your friends will actually see.' },
        ar: { headline: 'شارك *اللحظة*', subtitle: 'صور يراها أصدقاؤك فعلًا، أولًا بأول.' },
      },
      both(tipped, 2),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Polls for *everything*', subtitle: 'Pizza or tacos? Let the group decide.' },
        ar: { headline: 'تصويت على *كل شيء*', subtitle: 'بيتزا أم برغر؟ دع المجموعة تقرّر.' },
      },
      both(hanging, 3),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Your people, *close*', subtitle: 'Private circles for besties, family and teams.' },
        ar: { headline: 'أحبّتك *بقربك*', subtitle: 'دوائر خاصة للأصدقاء المقرّبين والعائلة والفرق.' },
      },
      both(sticker, 4),
      WIDE,
    ),
  ],
});

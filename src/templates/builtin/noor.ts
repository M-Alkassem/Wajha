/**
 * Noor (نور, "light"): designed Arabic first. Deep emerald with a fine
 * diagonal lattice, gold eight-point stars and rings in the spirit of
 * Islamic geometric ornament, Cairo headlines and Noto Sans Arabic text.
 * Story: an Arabic books and audiobooks app.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, copyAt, device, glow, pattern, radial, rect, ring, slide, template, theme, typeset } from '../kit';

const GOLD = '#e9c98b';

const t = typeset({
  heading: F.cairo,
  body: F.notoArabic,
  ink: '#fbf5e6',
  soft: '#d3e2da',
  accent: GOLD,
  head: { weight: 800, size: 0.088, lineHeight: 1.22, letterSpacing: -0.01 },
  sub: { weight: 500, size: 0.04, lineHeight: 1.45 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: METAL.black, shadow: { color: '#000000a6', blur: 0.08, x: 0, y: 0.035 }, ...o });

/** An eight-point star (two squares, one turned 45 degrees). */
const star = (x: number, y: number, size: number, opacity = 1, color = GOLD): SlideElement[] => [
  rect({ name: 'Star', x, y, size, radius: 0, color, opacity }),
  rect({ name: 'Star', x, y, size, radius: 0, rotation: 45, color, opacity }),
];

/** Ornament behind a device: a faint star and two gold rings. */
const rosette = (x: number, y: number, s = 1): SlideElement[] => [
  ...star(x, y, 0.78 * s, 0.07),
  ring({ name: 'Gold ring', x, y, size: 1.16 * s, stroke: 0.003, color: GOLD, opacity: 0.4 }),
  ring({ name: 'Gold ring', x, y, size: 1.06 * s, stroke: 0.0015, color: GOLD, opacity: 0.32 }),
];

const top = () => copyAt(t, { seam: 0.16 });
const emblem = () => star(0.5, 0.042, 0.04);

const hero = (): SlideElement[] => [glow({ x: 0.5, y: 0.62, size: 0.9, color: '#1f8a72', opacity: 0.4 }), ...rosette(0.5, 0.62), ...emblem(), ...top(), phone({ width: 0.8, top: 0.27 })];

const tilted = (): SlideElement[] => [...rosette(0.56, 0.6, 0.9), ...emblem(), ...top(), phone({ width: 0.78, top: 0.275, x: 0.54, rotation: -7 })];

const pair = (): SlideElement[] => [
  glow({ x: 0.5, y: 0.66, size: 1.0, color: '#1f8a72', opacity: 0.35 }),
  ...emblem(),
  ...top(),
  phone({ width: 0.6, top: 0.32, x: 0.7, rotation: 6, slot: 'second' }),
  phone({ width: 0.63, top: 0.275, x: 0.33, rotation: -5 }),
];

const hanging = (): SlideElement[] => [...rosette(0.5, 0.36, 0.95), phone({ width: 0.8, bottom: 0.67 }), ...star(0.5, 0.715, 0.034), ...copyAt(t, { seam: 0.82 })];

const calm = (): SlideElement[] => [...rosette(0.5, 0.64, 1.08), ...emblem(), ...top(), phone({ width: 0.76, top: 0.28 })];

export const noor = template({
  id: 'noor',
  name: 'Noor',
  description: 'Designed Arabic first: deep emerald with a fine lattice, gold eight-point stars and rings inspired by Islamic geometric ornament, Cairo headlines and Noto Sans Arabic text.',
  category: 'dark',
  tags: ['arabic', 'emerald', 'gold', 'geometric', 'books'],
  apps: ['music', 'calendar', 'social', 'chat', 'meditation', 'tasks', 'shop'],
  theme: theme({
    background: background(radial(0.5, 0.32, 0.92, ['#14493f', 0], ['#0a2c27', 0.55], ['#061a17', 1]), pattern('diagonal', GOLD, 0.05, 0.055)),
    heading: F.cairo,
    body: F.notoArabic,
    palette: [GOLD, '#2bb39a', '#f4a261', '#fbf5e6', '#061a17'],
    mockDark: true,
  }),
  slides: [
    slide(
      {
        ar: { headline: 'اقرأ *واستمع* بالعربية', subtitle: 'آلاف الكتب والكتب الصوتية بين يديك.' },
        en: { headline: 'Read and *listen* in Arabic', subtitle: 'Thousands of books and audiobooks in your pocket.' },
      },
      hero,
    ),
    slide(
      {
        ar: { headline: 'مكتبتك *ترافقك* أينما كنت', subtitle: 'تابع القراءة من حيث توقفت على كل أجهزتك.' },
        en: { headline: 'Your library, *everywhere*', subtitle: 'Pick up where you left off, on every device.' },
      },
      tilted,
    ),
    slide(
      {
        ar: { headline: 'أصوات *تأسرك*', subtitle: 'روايات وكتب يرويها نخبة من أجمل الأصوات العربية.' },
        en: { headline: 'Voices that *captivate*', subtitle: 'Novels and nonfiction, narrated by the finest voices.' },
      },
      pair,
    ),
    slide(
      {
        ar: { headline: 'اقرأ *أكثر* كل يوم', subtitle: 'أهداف قراءة يومية وسلاسل إنجاز تحفّزك.' },
        en: { headline: 'Read *more* every day', subtitle: 'Daily goals and streaks that keep you going.' },
      },
      hanging,
    ),
    slide(
      {
        ar: { headline: 'شارك *ما يُلهمك*', subtitle: 'اقتبس أجمل العبارات وشاركها مع أصدقائك.' },
        en: { headline: 'Share what *inspires* you', subtitle: 'Quote your favorite passages and share them with friends.' },
      },
      calm,
    ),
  ],
});

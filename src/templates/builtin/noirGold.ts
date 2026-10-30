/**
 * Noir Gold: a boutique after closing time. Warm black with a pool of
 * light, Playfair Display in ivory with gold highlights, a spaced gold
 * eyebrow, hairline rings and gold devices on every canvas. Story: a
 * luxury watch and jewellery boutique.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, copyAt, device, r5, radial, rect, ring, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const GOLD = '#d6b46a';
const t = typeset({
  heading: F.playfair,
  body: F.dmSans,
  ink: '#f6f0e4',
  soft: '#c9c0ae',
  accent: GOLD,
  head: { weight: 600, size: 0.094, lineHeight: 1.14, letterSpacing: -0.01 },
  sub: { weight: 400, size: 0.039, lineHeight: 1.45 },
  eyebrow: { size: 0.026, letterSpacing: 0.32, weight: 600 },
});

const SHADOW = { color: '#000000b3', blur: 0.08, x: 0, y: 0.035 };
const phone = (o: DeviceOptions) => device({ color: METAL.gold, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.gold, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.gold, shadow: SHADOW, ...o });

/** Eyebrow, a short gold rule and the headline / subtitle pair. */
function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') {
    const x = 0.235;
    return [
      t.eyebrow({ x, y: 0.22, width: 0.5, align: 'start' }),
      rect({ name: 'Gold rule', x: 0.0975, y: 0.272, width: 0.08, height: 0.003, radius: 0, color: GOLD }),
      ...copyAt(t, { cls, seam: seam ?? 0.57, x: 0.229, width: 0.5, align: 'start', head: { size: 0.076, maxLines: 3 }, sub: { size: 0.032, maxLines: 3 } }),
    ];
  }
  const tablet = cls === 'tablet';
  return [
    t.eyebrow({ y: tablet ? 0.05 : 0.048 }),
    rect({ name: 'Gold rule', x: 0.5, y: tablet ? 0.089 : 0.071, width: 0.08, height: 0.003, radius: 0, color: GOLD }),
    ...copyAt(t, tablet ? { cls, seam: seam ?? 0.2, width: 0.8, subWidth: 0.62, head: { size: 0.07 }, sub: { size: 0.031 } } : { seam: seam ?? 0.185 }),
  ];
}

const halo = (x: number, y: number, s = 1): SlideElement[] => [
  ring({ name: 'Gold ring', x, y, size: 1.2 * s, stroke: 0.0022, color: GOLD, opacity: 0.35 }),
  ring({ name: 'Gold ring', x, y, size: 1.04 * s, stroke: 0.0022, color: GOLD, opacity: 0.22 }),
];

function hero(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...halo(0.705, 0.52, 0.8), ...copy(cls), laptop({ width: 0.88, x: 0.705, y: 0.53 })];
  if (cls === 'tablet') return [...halo(0.5, 0.78, 1.05), ...copy(cls), pad({ width: 0.74, top: 0.32 })];
  return [...halo(0.5, 0.64), ...copy(cls), phone({ width: 0.76, top: 0.282 })];
}

function crafted(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    // Mirrored: the laptop on the left, the copy in the right column.
    const x = 0.77;
    const left = x * 1.6 - 0.24;
    return [
      ...halo(0.3, 0.52, 0.85),
      t.eyebrow({ x, y: 0.22, width: 0.48, align: 'start' }),
      rect({ name: 'Gold rule', x: r5((left + 0.04) / 1.6), y: 0.272, width: 0.08, height: 0.003, radius: 0, color: GOLD }),
      ...copyAt(t, { cls, seam: 0.57, x, width: 0.48, align: 'start', head: { size: 0.076, maxLines: 3 }, sub: { size: 0.032, maxLines: 3 } }),
      laptop({ width: 0.86, x: 0.31, y: 0.53 }),
    ];
  }
  if (cls !== 'tall') return hero(cls);
  return [...halo(0.46, 0.62, 0.92), ...copy(cls), phone({ width: 0.76, top: 0.286, x: 0.53, rotation: -6 })];
}

function salon(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...halo(0.72, 0.52, 0.78), ...copy(cls), laptop({ width: 0.78, x: 0.73, y: 0.6, slot: 'second' }), device({ cls, frame: 'none', width: 0.46, x: 0.57, y: 0.4, cornerRadius: 0.025, shadow: SHADOW })];
  if (cls === 'tablet') return [...halo(0.5, 0.8, 1.05), ...copy(cls), pad({ width: 0.58, top: 0.38, x: 0.66, slot: 'second' }), pad({ width: 0.58, top: 0.33, x: 0.36 })];
  return [...halo(0.5, 0.66), ...copy(cls), phone({ width: 0.58, top: 0.33, x: 0.7, rotation: 5, slot: 'second' }), phone({ width: 0.62, top: 0.29, x: 0.33, rotation: -4 })];
}

function delivered(cls: Cls): SlideElement[] {
  if (cls !== 'tall') return hero(cls);
  return [...halo(0.5, 0.36), phone({ width: 0.78, bottom: 0.655 }), t.eyebrow({ y: 0.698 }), ...copyAt(t, { seam: 0.845 })];
}

function circle(cls: Cls): SlideElement[] {
  // Wide and tablet canvases have no room for a larger halo beside or under the copy: the second pair sits inside the first.
  if (cls === 'wide') return [...halo(0.705, 0.52, 0.6), ...hero(cls)];
  if (cls === 'tablet') return [...halo(0.5, 0.78, 0.84), ...hero(cls)];
  return [...halo(0.5, 0.64, 1.25), ...hero(cls)];
}

const o = { classes: ALL_CLASSES };

export const noirGold = template({
  id: 'noir-gold',
  name: 'Noir Gold',
  description: 'A boutique after closing time: warm black with a pool of light, Playfair Display in ivory with gold highlights, a spaced gold eyebrow, hairline rings and gold devices on every canvas.',
  category: 'elegant',
  tags: ['luxury', 'serif', 'gold', 'black', 'fashion'],
  apps: ['shop', 'travel', 'calendar', 'social', 'chat', 'finance'],
  theme: theme({
    background: background(radial(0.5, 0.45, 0.78, ['#25201a', 0], ['#141210', 0.6], ['#0a0908', 1])),
    heading: F.playfair,
    body: F.dmSans,
    palette: [GOLD, '#b88a4a', '#8e6f3e', '#f6f0e4', '#0a0908'],
    mockDark: true,
  }),
  slides: [
    slide(
      {
        en: { eyebrow: 'The collection', headline: 'Timeless, *curated*', subtitle: 'Rare watches and fine jewelry from the great houses.' },
        ar: { eyebrow: 'المجموعة', headline: 'فخامة *خالدة*', subtitle: 'ساعات نادرة ومجوهرات فاخرة من أعرق الدور العالمية.' },
      },
      hero,
      o,
    ),
    slide(
      {
        en: { eyebrow: 'Authenticity', headline: 'Crafted to *last*', subtitle: 'Every piece inspected and certified by our experts.' },
        ar: { eyebrow: 'الأصالة', headline: 'صُنعت *لتدوم*', subtitle: 'كل قطعة يفحصها خبراؤنا ويوثّقون أصالتها.' },
      },
      crafted,
      o,
    ),
    slide(
      {
        en: { eyebrow: 'Private salon', headline: 'Your personal *stylist*', subtitle: 'Book a private appointment at home or in store.' },
        ar: { eyebrow: 'الصالون الخاص', headline: 'مستشار أناقة *خاص* بك', subtitle: 'احجز موعدًا خاصًا في منزلك أو في المتجر.' },
      },
      salon,
      o,
    ),
    slide(
      {
        en: { eyebrow: 'White glove', headline: 'Delivered with *care*', subtitle: 'Insured, hand-delivered to your door.' },
        ar: { eyebrow: 'خدمة راقية', headline: 'توصيل *بعناية*', subtitle: 'توصيل مؤمَّن يدًا بيد حتى باب منزلك.' },
      },
      delivered,
      o,
    ),
    slide(
      {
        en: { eyebrow: 'Members', headline: 'Join the *circle*', subtitle: 'Early access to limited editions and private events.' },
        ar: { eyebrow: 'العضوية', headline: 'انضم إلى *النخبة*', subtitle: 'وصول مبكر إلى الإصدارات المحدودة والفعاليات الخاصة.' },
      },
      circle,
      o,
    ),
  ],
});

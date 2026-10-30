/**
 * Citrus Pop: fresh and loud. Lemon yellow with a dot screen, heavy black
 * Plus Jakarta Sans with orange marker highlights, citrus-slice discs and
 * a leaf, white phones tipped at playful angles. Story: a recipe and meal
 * kit app.
 */
import type { SlideElement } from '../../model/types';
import { F, background, blob, circle, copyAt, device, pattern, ring, slide, solid, template, theme, typeset, type Cls } from '../kit';

const LEMON = '#ffd43b';
const ORANGE = '#ff7a1a';

const t = typeset({
  heading: F.jakarta,
  body: F.jakarta,
  ink: '#161616',
  soft: '#3d3519',
  accent: '#ff5a1f',
  mode: 'marker',
  head: { weight: 800, size: 0.096, lineHeight: 1.1, letterSpacing: -0.04 },
  sub: { weight: 600, size: 0.04 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: '#fafafa', finish: 'matte', shadow: { color: '#6b4a0059', blur: 0.06, x: 0, y: 0.03 }, ...o });

/** An orange slice: the fruit and the pale ring of its rind. */
const slice = (x: number, y: number, size: number): SlideElement[] => [
  circle({ name: 'Orange slice', x, y, size, color: ORANGE }),
  ring({ name: 'Rind', x, y, size: size * 0.84, stroke: size * 0.035, color: '#ffe3b0' }),
];
const leaf = (x: number, y: number, size: number, rotation: number) => blob({ name: 'Leaf', x, y, width: size, height: size * 0.56, rotation, seed: 5, color: '#2fb36a' });

const top = () => copyAt(t, { seam: 0.152 });

const hero = (): SlideElement[] => [...slice(0.88, 0.42, 0.52), leaf(0.1, 0.36, 0.26, -30), ...top(), phone({ width: 0.78, top: 0.262, x: 0.54, rotation: -9 })];

const classic = (): SlideElement[] => [...slice(0.1, 0.84, 0.6), ...slice(0.92, 0.5, 0.3), ...top(), phone({ width: 0.8, top: 0.255 })];

const duo = (): SlideElement[] => [
  ...slice(0.5, 0.68, 0.9),
  ...top(),
  phone({ width: 0.6, top: 0.3, x: 0.71, rotation: 9, slot: 'second' }),
  phone({ width: 0.62, top: 0.26, x: 0.32, rotation: -7 }),
];

const hanging = (): SlideElement[] => [...slice(0.86, 0.56, 0.4), leaf(0.14, 0.6, 0.3, 24), phone({ width: 0.8, bottom: 0.67, x: 0.48, rotation: 5 }), ...copyAt(t, { seam: 0.81 })];

const tipped = (): SlideElement[] => [...slice(0.12, 0.46, 0.46), leaf(0.9, 0.38, 0.24, 40), ...top(), phone({ width: 0.78, top: 0.262, x: 0.46, rotation: 9 })];

/** Mac: copy in the left column, the laptop on the right with the fruit around it. */
function wide(variant: number): SlideElement[] {
  const fruit: SlideElement[][] = [
    [...slice(0.93, 0.18, 0.34), leaf(0.6, 0.88, 0.2, -20)],
    [...slice(0.6, 0.86, 0.36), ...slice(0.96, 0.3, 0.2)],
    [...slice(0.9, 0.86, 0.42), leaf(0.97, 0.16, 0.2, 30)],
    [...slice(0.94, 0.62, 0.3), leaf(0.6, 0.14, 0.2, 24)],
    [...slice(0.6, 0.16, 0.3), leaf(0.95, 0.84, 0.22, 40)],
  ];
  return [
    ...fruit[variant % fruit.length],
    ...copyAt(t, { cls: 'wide', seam: 0.5, x: 0.235, width: 0.5, align: 'start', head: { size: 0.076, maxLines: 3 }, sub: { size: 0.034, maxLines: 3 } }),
    device({ cls: 'wide', frame: 'macbook', color: '#e4e4e7', width: 0.86, x: 0.69, y: 0.5, shadow: { color: '#6b4a0059', blur: 0.06, x: 0, y: 0.03 } }),
  ];
}

const both = (tall: () => SlideElement[], variant: number) => (cls: Cls) => (cls === 'wide' ? wide(variant) : tall());
const WIDE = { classes: ['tall', 'wide'] as Cls[] };

export const citrusPop = template({
  id: 'citrus-pop',
  name: 'Citrus Pop',
  description: 'Fresh and loud: lemon yellow with a dot screen, heavy black headlines with orange marker highlights, citrus slices and white phones tipped at playful angles.',
  category: 'bold',
  tags: ['yellow', 'food', 'marker', 'playful', 'bright'],
  apps: ['shop', 'calendar', 'tasks', 'chat', 'social', 'travel', 'music'],
  theme: theme({
    background: background(solid(LEMON), pattern('dots', '#1a1a1a', 0.08, 0.05)),
    heading: F.jakarta,
    body: F.jakarta,
    palette: ['#ff5a1f', '#2fb36a', '#161616', LEMON, '#ffffff'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Dinner, *done* in 20', subtitle: 'Fresh recipes with every ingredient, delivered.' },
        ar: { headline: 'عشاؤك *جاهز* في 20 دقيقة', subtitle: 'وصفات طازجة مع كل مكوّناتها حتى باب منزلك.' },
      },
      both(hero, 0),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Cook like a *pro*', subtitle: 'Step-by-step videos make every dish foolproof.' },
        ar: { headline: 'اطبخ *كالمحترفين*', subtitle: 'فيديوهات خطوة بخطوة تضمن نجاح كل طبق.' },
      },
      both(classic, 1),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Plan your *week*', subtitle: 'Pick meals on Sunday, enjoy them all week.' },
        ar: { headline: 'خطّط *لأسبوعك*', subtitle: 'اختر وجباتك يوم الأحد واستمتع بها طوال الأسبوع.' },
      },
      both(duo, 2),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Fresh, *local*, seasonal', subtitle: 'Ingredients from farms near you, at their peak.' },
        ar: { headline: 'طازج *ومحلي* وموسمي', subtitle: 'مكوّنات من مزارع قريبة منك في أفضل مواسمها.' },
      },
      both(hanging, 3),
      WIDE,
    ),
    slide(
      {
        en: { headline: 'Share the *flavor*', subtitle: 'Save favorites and cook together with friends.' },
        ar: { headline: 'شارك *النكهة*', subtitle: 'احفظ وصفاتك المفضّلة واطبخ مع أصدقائك.' },
      },
      both(tipped, 4),
      WIDE,
    ),
  ],
});

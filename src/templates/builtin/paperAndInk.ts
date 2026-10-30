/**
 * Paper & Ink: a well-made notebook. Warm cotton paper with grain, Fraunces
 * set like a book title in ink navy with terracotta highlights, fine ruled
 * circles and a small wax-seal dot, white phones. Story: a journaling app.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, circle, copyAt, device, pattern, ring, slide, solid, template, theme, typeset } from '../kit';

const INK = '#1f2433';
const TERRACOTTA = '#b5502a';

const t = typeset({
  heading: F.fraunces,
  body: F.manrope,
  ink: INK,
  soft: '#4a4e5b',
  accent: TERRACOTTA,
  head: { weight: 600, size: 0.096, lineHeight: 1.1, letterSpacing: -0.02 },
  sub: { weight: 500, size: 0.039, lineHeight: 1.42 },
});

const phone = (o: Parameters<typeof device>[0]) => device({ color: METAL.white, shadow: { color: '#5a46303d', blur: 0.07, x: 0, y: 0.03 }, ...o });

/** Fine ruled circles, like a compass drawing on the page. */
const ruled = (x: number, y: number, s = 1): SlideElement[] => [
  ring({ name: 'Ruled circle', x, y, size: 1.16 * s, stroke: 0.0022, color: INK, opacity: 0.18 }),
  ring({ name: 'Ruled circle', x, y, size: 0.98 * s, stroke: 0.0022, color: INK, opacity: 0.12 }),
];
const seal = (x: number, y: number) => circle({ name: 'Seal', x, y, size: 0.07, color: TERRACOTTA });

const top = () => copyAt(t, { seam: 0.152 });

const hero = (): SlideElement[] => [...ruled(0.5, 0.62), seal(0.86, 0.33), ...top(), phone({ width: 0.78, top: 0.262 })];

const gentle = (): SlideElement[] => [...ruled(0.44, 0.6, 0.9), ...top(), phone({ width: 0.78, top: 0.266, x: 0.54, rotation: -5 }), seal(0.14, 0.86)];

const pages = (): SlideElement[] => [
  ...ruled(0.5, 0.66, 1.05),
  ...top(),
  phone({ width: 0.6, top: 0.31, x: 0.7, rotation: 5, slot: 'second' }),
  phone({ width: 0.62, top: 0.262, x: 0.33, rotation: -4 }),
];

const hanging = (): SlideElement[] => [...ruled(0.5, 0.36), seal(0.88, 0.62), phone({ width: 0.8, bottom: 0.675 }), ...copyAt(t, { seam: 0.82 })];

const locked = (): SlideElement[] => [...ruled(0.5, 0.62, 1.1), seal(0.16, 0.34), ...top(), phone({ width: 0.76, top: 0.266 })];

export const paperAndInk = template({
  id: 'paper-and-ink',
  name: 'Paper & Ink',
  description: 'A well-made notebook: warm cotton paper with grain, Fraunces set like a book title in ink navy with terracotta highlights, fine ruled circles and a wax-seal dot.',
  category: 'elegant',
  tags: ['serif', 'paper', 'warm', 'journal', 'editorial'],
  apps: ['tasks', 'calendar', 'social', 'chat', 'meditation', 'music'],
  theme: theme({
    background: background(solid('#f4eee3'), pattern('noise', '#5a4630', 0.07, 0.05)),
    heading: F.fraunces,
    body: F.manrope,
    palette: [TERRACOTTA, '#3d6b8c', '#c99a3b', INK, '#f4eee3'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Write the *story* of your days', subtitle: 'A beautiful journal that grows with you.' },
        ar: { headline: 'اكتب *حكاية* أيامك', subtitle: 'دفتر يوميات أنيق ينمو معك.' },
      },
      hero,
    ),
    slide(
      {
        en: { headline: 'A page a day, *gently*', subtitle: 'Thoughtful prompts for when words come slowly.' },
        ar: { headline: 'صفحة كل يوم *بهدوء*', subtitle: 'أسئلة ملهمة حين تتأخر الكلمات في المجيء.' },
      },
      gentle,
    ),
    slide(
      {
        en: { headline: 'Moments worth *keeping*', subtitle: 'Add photos, places and moods to every entry.' },
        ar: { headline: 'لحظات تستحق *الحفظ*', subtitle: 'أضف الصور والأماكن والمشاعر إلى كل تدوينة.' },
      },
      pages,
    ),
    slide(
      {
        en: { headline: 'Look *back*, grow forward', subtitle: 'On this day: memories from years past.' },
        ar: { headline: 'تأمّل *الماضي* وانطلق', subtitle: 'في مثل هذا اليوم: ذكريات من أعوام مضت.' },
      },
      hanging,
    ),
    slide(
      {
        en: { headline: 'Yours *alone*', subtitle: 'Locked with Face ID and encrypted on your device.' },
        ar: { headline: 'لك *وحدك*', subtitle: 'مقفل ببصمة الوجه ومشفّر على جهازك.' },
      },
      locked,
    ),
  ],
});

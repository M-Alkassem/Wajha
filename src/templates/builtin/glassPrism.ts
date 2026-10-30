/**
 * Glass Prism: light through frosted glass. An iridescent pastel mesh,
 * translucent glass cards floating behind white phones, crisp Plus Jakarta
 * Sans headlines with violet highlights. Story: a calendar and planner.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, copyAt, device, glow, linear, mesh, pattern, rect, ring, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const t = typeset({
  heading: F.jakarta,
  body: F.jakarta,
  ink: '#15122b',
  soft: '#4a4766',
  accent: '#6a4dff',
  head: { weight: 800, size: 0.088, lineHeight: 1.12, letterSpacing: -0.03 },
  sub: { weight: 500, size: 0.04 },
});

const SHADOW = { color: '#3b2f8a38', blur: 0.08, x: 0, y: 0.035 };
const phone = (o: DeviceOptions) => device({ color: METAL.white, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.white, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.silver, shadow: SHADOW, ...o });

/** A frosted glass card. */
const card = (x: number, y: number, w: number, h: number, rotation: number) =>
  rect({ name: 'Glass card', x, y, width: w, height: h, rotation, radius: 0.16, fill: linear(150, '#ffffffd9', '#ffffff4d'), opacity: 0.9 });

function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: seam ?? 0.215, width: 1.2, subWidth: 0.95, head: { size: 0.066 }, sub: { size: 0.03 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: seam ?? 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.066 }, sub: { size: 0.031 } });
  return copyAt(t, { seam: seam ?? 0.15 });
}

function hero(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [card(0.17, 0.64, 0.42, 0.38, -8), card(0.84, 0.72, 0.36, 0.34, 7), ...copy(cls), laptop({ width: 1.04, top: 0.35 })];
  if (cls === 'tablet') return [card(0.16, 0.62, 0.4, 0.5, -9), card(0.86, 0.78, 0.36, 0.44, 8), ...copy(cls), pad({ width: 0.74, top: 0.29 })];
  return [card(0.17, 0.5, 0.44, 0.62, -10), card(0.85, 0.68, 0.4, 0.5, 8), ...copy(cls), phone({ width: 0.8, top: 0.25 })];
}

function pair(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    return [
      card(0.2, 0.7, 0.4, 0.34, -6),
      ...copy(cls),
      laptop({ width: 0.92, top: 0.37, x: 0.43, slot: 'second' }),
      device({ cls, frame: 'none', width: 0.5, x: 0.76, y: 0.68, cornerRadius: 0.03, shadow: SHADOW }),
    ];
  }
  if (cls === 'tablet') return [card(0.5, 0.7, 0.8, 0.5, -4), ...copy(cls), pad({ width: 0.58, top: 0.36, x: 0.66, slot: 'second' }), pad({ width: 0.58, top: 0.3, x: 0.36 })];
  return [card(0.5, 0.62, 0.86, 0.56, -5), ...copy(cls), phone({ width: 0.6, top: 0.3, x: 0.7, slot: 'second' }), phone({ width: 0.62, top: 0.26, x: 0.33 })];
}

function upside(cls: Cls): SlideElement[] {
  if (cls !== 'tall') return hero(cls);
  return [card(0.82, 0.3, 0.42, 0.56, 9), card(0.16, 0.5, 0.36, 0.46, -8), phone({ width: 0.82, bottom: 0.69 }), ...copy(cls, 0.81)];
}

function side(cls: Cls): SlideElement[] {
  if (cls !== 'tall') return hero(cls);
  return [
    ring({ x: 0.2, y: 0.5, size: 0.5, stroke: 0.006, color: '#ffffff', opacity: 0.9 }),
    card(0.22, 0.66, 0.4, 0.5, -10),
    ...copy(cls),
    phone({ width: 0.76, top: 0.27, x: 0.55, rotation: 6 }),
  ];
}

function halo(cls: Cls): SlideElement[] {
  const rings = (x: number, y: number, s: number) => [
    glow({ x, y, size: 0.9 * s, color: '#ffffff', opacity: 0.7, blur: 0.1 }),
    ring({ x, y, size: 1.04 * s, stroke: 0.006, color: '#ffffff', opacity: 0.85 }),
  ];
  // Low behind the laptop: the halo stays clear of the subtitle, also on the feature graphic where the copy grows.
  if (cls === 'wide') return [...rings(0.5, 0.78, 0.76), ...copy(cls), laptop({ width: 1.04, top: 0.35 })];
  if (cls === 'tablet') return [...rings(0.5, 0.72, 1.05), ...copy(cls), pad({ width: 0.74, top: 0.29 })];
  return [...rings(0.5, 0.6, 1.05), ...copy(cls), phone({ width: 0.78, top: 0.255 })];
}

const o = { classes: ALL_CLASSES };

export const glassPrism = template({
  id: 'glass-prism',
  name: 'Glass Prism',
  description: 'Light through frosted glass: an iridescent pastel mesh, translucent glass cards floating behind white phones and crisp headlines with violet highlights.',
  category: 'gradient',
  tags: ['pastel', 'glass', 'light', 'productivity', 'iridescent'],
  apps: ['calendar', 'tasks', 'chat', 'meditation', 'finance', 'fitness', 'social', 'travel'],
  theme: theme({
    background: background(
      mesh('#f3f0ff', [0.08, 0.06, '#d4c4ff', 0.55], [0.96, 0.28, '#bcdcff', 0.5], [0.1, 0.84, '#ffd3e6', 0.5], [0.92, 0.94, '#c4f1e2', 0.46]),
      pattern('noise', '#4b3fb3', 0.03, 0.05),
    ),
    heading: F.jakarta,
    body: F.jakarta,
    palette: ['#6a4dff', '#ff7eb6', '#4cc9f0', '#2ec4a6', '#ffffff', '#15122b'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Your week, *beautifully* planned', subtitle: 'Calendar, tasks and notes in one calm, colorful space.' },
        ar: { headline: 'أسبوعك *منظّم* بأناقة', subtitle: 'التقويم والمهام والملاحظات في مساحة واحدة هادئة وملوّنة.' },
      },
      hero,
      o,
    ),
    slide(
      {
        en: { headline: 'Time blocks that *flow*', subtitle: 'Drag tasks into your day and watch the plan come together.' },
        ar: { headline: 'جدول يومك *بسلاسة*', subtitle: 'اسحب مهامك إلى يومك وشاهد خطتك تكتمل أمامك.' },
      },
      pair,
      o,
    ),
    slide(
      {
        en: { headline: 'Focus on what *matters*', subtitle: 'Smart priorities surface the next right thing to do.' },
        ar: { headline: 'ركّز على *الأهم*', subtitle: 'أولويات ذكية تُبرز لك الخطوة التالية الصحيحة.' },
      },
      upside,
      o,
    ),
    slide(
      {
        en: { headline: 'Plan *together*', subtitle: 'Shared calendars keep the whole team in sync.' },
        ar: { headline: 'خطّطوا *معًا*', subtitle: 'تقاويم مشتركة تُبقي الفريق بأكمله على تواصل.' },
      },
      side,
      o,
    ),
    slide(
      {
        en: { headline: 'Always *in sync*', subtitle: 'iPhone, iPad and Mac, updated the moment plans change.' },
        ar: { headline: 'متزامن *دائمًا*', subtitle: 'على آيفون وآيباد وماك، تتحدّث خطتك فور تعديلها.' },
      },
      halo,
      o,
    ),
  ],
});

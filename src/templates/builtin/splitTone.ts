/**
 * Split Tone: two colours, one bold diagonal. Deep navy above, a slab of
 * tangerine, cream or sky below, the phone straddling the cut. DM Sans set
 * heavy and tight. Story: a personal finance app.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, canvas, copyAt, device, r5, rect, slide, solid, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const NAVY = '#0f1a3d';
const TANGERINE = '#ff6b2c';
const CREAM = '#f4efe6';
const SKY = '#8ec5ff';

const t = typeset({
  heading: F.dmSans,
  body: F.dmSans,
  ink: '#ffffff',
  soft: '#c9d2ee',
  accent: '#ff9a5c',
  head: { weight: 800, size: 0.094, lineHeight: 1.08, letterSpacing: -0.04 },
  sub: { weight: 500, size: 0.04 },
});

const SHADOW = { color: '#050b2280', blur: 0.07, x: 0, y: 0.03 };
const phone = (o: DeviceOptions) => device({ color: METAL.silver, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.silver, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.silver, shadow: SHADOW, ...o });

/** Where the cut crosses the middle of each canvas, fraction of its height. */
const EDGE: Record<Cls, number> = { tall: 0.52, tablet: 0.6, wide: 0.66 };

/**
 * The slab of colour beyond the cut: a huge rotated rectangle whose edge is
 * the diagonal, crossing the middle of the canvas at `edge`; `above` puts
 * the slab on the upper side of the cut.
 */
function slab(cls: Cls, color: string, angle: number, edge = EDGE[cls], above = false) {
  const { wu, hu } = canvas(cls);
  const height = 1.8 * hu;
  const y = above ? edge - height / 2 / hu : edge + height / 2 / hu;
  return rect({ name: 'Color slab', x: 0.5, y: r5(y), width: r5(2.8 * wu), height: r5(height), rotation: angle, radius: 0, color });
}

function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: seam ?? 0.2, width: 1.2, subWidth: 0.95, head: { size: 0.068 }, sub: { size: 0.03 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: seam ?? 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } });
  return copyAt(t, { seam: seam ?? 0.15 });
}

/** One device straddling the cut. */
function single(color: string, angle: number, o: { x?: number; rotation?: number } = {}) {
  return (cls: Cls): SlideElement[] => {
    if (cls === 'wide') return [slab(cls, color, angle / 2), ...copy(cls), laptop({ width: 0.98, top: 0.35 })];
    if (cls === 'tablet') return [slab(cls, color, angle * 0.7), ...copy(cls), pad({ width: 0.72, top: 0.3, x: 0.5 + ((o.x ?? 0.5) - 0.5) / 2, rotation: (o.rotation ?? 0) / 2 })];
    return [slab(cls, color, angle), ...copy(cls), phone({ width: 0.8, top: 0.255, x: o.x ?? 0.5, rotation: o.rotation ?? 0 })];
  };
}

function duo(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [slab(cls, SKY, -4), ...copy(cls), laptop({ width: 0.86, top: 0.38, x: 0.42, slot: 'second' }), device({ cls, frame: 'none', width: 0.46, x: 0.74, y: 0.7, cornerRadius: 0.03, shadow: SHADOW })];
  if (cls === 'tablet') return [slab(cls, SKY, -6), ...copy(cls), pad({ width: 0.56, top: 0.36, x: 0.68, rotation: 4, slot: 'second' }), pad({ width: 0.58, top: 0.3, x: 0.34, rotation: -3 })];
  return [slab(cls, SKY, -8, 0.56), ...copy(cls), phone({ width: 0.6, top: 0.31, x: 0.7, rotation: 6, slot: 'second' }), phone({ width: 0.62, top: 0.26, x: 0.33, rotation: -5 })];
}

/** The cut runs high and the copy sits below it, on navy again. */
function flipped(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [slab(cls, TANGERINE, -4, 0.42, true), laptop({ width: 0.9, top: 0.07 }), ...copy(cls, 0.83)];
  if (cls === 'tablet') return [slab(cls, TANGERINE, -6, 0.36, true), pad({ width: 0.74, bottom: 0.68 }), ...copy(cls, 0.83)];
  return [slab(cls, TANGERINE, -9, 0.3, true), phone({ width: 0.8, bottom: 0.68 }), ...copyAt(t, { seam: 0.81 })];
}

const o = { classes: ALL_CLASSES };

export const splitTone = template({
  id: 'split-tone',
  name: 'Split Tone',
  description: 'Two colours, one bold diagonal: deep navy above, a slab of tangerine, cream or sky below, and the phone straddling the cut. Heavy, tight DM Sans headlines.',
  category: 'bold',
  tags: ['bold', 'two-tone', 'diagonal', 'finance', 'navy'],
  apps: ['finance', 'shop', 'chat', 'calendar', 'tasks', 'travel', 'social'],
  theme: theme({
    background: background(solid(NAVY)),
    heading: F.dmSans,
    body: F.dmSans,
    palette: [TANGERINE, SKY, '#22c55e', CREAM, '#ffffff', NAVY],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Know where your *money* goes', subtitle: 'Every card and account, sorted automatically.' },
        ar: { headline: 'اعرف أين تذهب *أموالك*', subtitle: 'كل بطاقاتك وحساباتك مصنّفة تلقائيًا.' },
      },
      single(TANGERINE, -10),
      o,
    ),
    slide(
      {
        en: { headline: 'Budgets that *bend*', subtitle: 'Flexible limits that adjust to real life.' },
        ar: { headline: 'ميزانية *مرنة*', subtitle: 'حدود إنفاق تتكيّف مع تفاصيل حياتك اليومية.' },
      },
      single(CREAM, 9, { x: 0.45, rotation: 7 }),
      o,
    ),
    slide(
      {
        en: { headline: 'Split bills in *seconds*', subtitle: 'Settle up with friends without the awkward math.' },
        ar: { headline: 'قسّم الفواتير في *ثوانٍ*', subtitle: 'سدّد حصتك مع الأصدقاء دون حسابات محرجة.' },
      },
      duo,
      o,
    ),
    slide(
      {
        en: { headline: 'Save on *autopilot*', subtitle: 'Round-ups and smart rules grow your savings.' },
        ar: { headline: 'ادّخر *تلقائيًا*', subtitle: 'تقريب المشتريات وقواعد ذكية تنمّي مدّخراتك.' },
      },
      flipped,
      o,
    ),
    slide(
      {
        en: { headline: 'Bank-grade *security*', subtitle: 'Face ID, encryption and alerts for every payment.' },
        ar: { headline: 'أمان *بمستوى البنوك*', subtitle: 'بصمة الوجه والتشفير وتنبيه فوري لكل عملية دفع.' },
      },
      single(TANGERINE, 10),
      o,
    ),
  ],
});

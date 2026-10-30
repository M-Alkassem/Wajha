/**
 * Loud & Clear: poster energy. Cobalt and paper white slides in turn,
 * oversized Outfit Black set in capitals, neon lime accents, compact black
 * phones. Story: a training app.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, background, circle, copyAt, device, slide, solid, template, theme, typeset, type Cls } from '../kit';

const COBALT = '#2340ff';
const LIME = '#d7ff3a';
const PAPER = '#f3f3ee';

const head = { weight: 900, size: 0.16, lineHeight: 1.0, letterSpacing: -0.01, transform: 'uppercase' as const, maxLines: 3, width: 0.92 };
const sub = { weight: 500, size: 0.04, lineHeight: 1.32 };

const blue = typeset({ heading: F.outfit, body: F.outfit, ink: '#ffffff', soft: '#e3e8ff', accent: LIME, head, sub });
const paper = typeset({ heading: F.outfit, body: F.outfit, ink: COBALT, soft: '#363b57', accent: LIME, mode: 'marker', head, sub });

const SHADOW = { color: '#0a0f4d59', blur: 0.06, x: 0, y: 0.03 };
const phone = (o: Parameters<typeof device>[0]) => device({ color: '#1b1b1d', finish: 'matte', width: 0.66, top: 0.4, shadow: SHADOW, ...o });

/** Big headline over a compact device, with one bold disc behind it. */
function poster(onPaper: boolean, o: { disc?: [number, number, number]; rotation?: number; x?: number } = {}) {
  return (cls: Cls): SlideElement[] => {
    const t = onPaper ? paper : blue;
    const [dx, dy, ds] = o.disc ?? [0.84, 0.8, 0.72];
    const disc = (x: number, y: number, size: number) => circle({ name: 'Disc', x, y, size, color: onPaper ? COBALT : LIME, opacity: onPaper ? 1 : 0.95 });
    if (cls === 'wide') {
      return [
        disc(0.8, 0.84, 0.8),
        ...copyAt(t, { cls, seam: 0.56, x: 0.26, width: 0.66, head: { size: 0.12 }, sub: { size: 0.032, width: 0.6 } }),
        device({ cls, frame: 'macbook', color: '#2b2c31', width: 0.74, x: 0.745, y: 0.5, rotation: (o.rotation ?? 0) / 2, shadow: SHADOW }),
      ];
    }
    if (cls === 'tablet') {
      return [
        disc(dx, dy, ds * 0.9),
        ...copyAt(t, { cls, seam: 0.25, head: { size: 0.12 }, sub: { size: 0.032, width: 0.7 } }),
        device({ cls, frame: 'ipad', color: '#1b1b1d', finish: 'matte', width: 0.68, top: 0.375, x: o.x ?? 0.5, rotation: (o.rotation ?? 0) / 2, shadow: SHADOW }),
      ];
    }
    return [disc(dx, dy, ds), ...copyAt(t, { seam: 0.305 }), phone({ rotation: o.rotation ?? 0, x: o.x ?? 0.5 })];
  };
}

const o3 = { classes: ALL_CLASSES };
const PAPER_BG = background(solid(PAPER));

export const loudAndClear = template({
  id: 'loud-and-clear',
  name: 'Loud & Clear',
  description: 'Poster energy: cobalt and paper-white slides in turn, oversized Outfit Black capitals, neon lime accents and compact black phones.',
  category: 'bold',
  tags: ['bold', 'uppercase', 'poster', 'fitness', 'high contrast'],
  apps: ['fitness', 'travel', 'music', 'calendar', 'social', 'chat', 'meditation', 'tasks'],
  theme: theme({
    background: background(solid(COBALT)),
    heading: F.outfit,
    body: F.outfit,
    palette: [COBALT, LIME, '#ff4d2e', '#111111', PAPER],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Train *harder*', subtitle: 'Workouts that adapt to you, every single day.' },
        ar: { headline: 'تمرّن *بقوة*', subtitle: 'تمارين تتكيّف معك يومًا بعد يوم.' },
        de: { headline: 'Trainiere *härter*', subtitle: 'Workouts, die sich jeden Tag an dich anpassen.' },
      },
      poster(false),
      o3,
    ),
    slide(
      {
        en: { headline: 'Lift. Run. *Repeat.*', subtitle: '500+ guided sessions for strength, cardio and mobility.' },
        ar: { headline: 'ارفع. اركض. *كرّر.*', subtitle: 'أكثر من 500 جلسة موجّهة للقوة واللياقة والمرونة.' },
        de: { headline: 'Heben. Laufen. *Wiederholen.*', subtitle: 'Über 500 geführte Einheiten für Kraft, Ausdauer und Mobilität.' },
      },
      poster(true, { disc: [0.14, 0.86, 0.62], rotation: -6, x: 0.53 }),
      { ...o3, background: PAPER_BG },
    ),
    slide(
      {
        en: { headline: 'Every rep *counts*', subtitle: 'Live stats and form tips while you move.' },
        ar: { headline: 'كل تكرار *يُحسب*', subtitle: 'إحصاءات مباشرة ونصائح للأداء الصحيح أثناء التمرين.' },
        de: { headline: 'Jede Wiederholung *zählt*', subtitle: 'Live-Werte und Techniktipps, während du trainierst.' },
      },
      poster(false, { disc: [0.5, 0.92, 1.1] }),
      o3,
    ),
    slide(
      {
        en: { headline: 'Beat your *best*', subtitle: 'Personal records, streaks and weekly goals.' },
        ar: { headline: 'حطّم *أرقامك*', subtitle: 'أرقامك القياسية وسلاسل إنجازك وأهدافك الأسبوعية.' },
        de: { headline: 'Schlag deine *Bestzeit*', subtitle: 'Persönliche Rekorde, Serien und Wochenziele.' },
      },
      poster(true, { disc: [0.86, 0.78, 0.7], rotation: 6, x: 0.47 }),
      { ...o3, background: PAPER_BG },
    ),
    slide(
      {
        en: { headline: 'Join the *crew*', subtitle: 'Challenges with friends keep you coming back.' },
        ar: { headline: 'انضم إلى *الفريق*', subtitle: 'تحديات مع الأصدقاء تُبقي حماسك متّقدًا.' },
        de: { headline: 'Werde Teil der *Crew*', subtitle: 'Challenges mit Freunden halten dich motiviert.' },
      },
      poster(false, { disc: [0.18, 0.78, 0.64] }),
      o3,
    ),
  ],
});

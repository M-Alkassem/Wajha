/**
 * Aurora: northern lights over a midnight sky. A violet / teal / rose mesh
 * with film grain, Sora display type, mint highlights and graphite devices
 * floating in soft glows. Story: a sleep and meditation app.
 */
import type { SlideElement } from '../../model/types';
import { F, METAL, background, circle, copyAt, device, glow, mesh, pattern, ring, template, theme, typeset, type Cls, type DeviceOptions, type SlideSpec } from '../kit';

const t = typeset({
  heading: F.sora,
  body: F.inter,
  ink: '#ffffff',
  soft: '#ebe8ff',
  accent: '#7cf5d6',
  head: { weight: 700, size: 0.09, lineHeight: 1.12, letterSpacing: -0.03 },
  sub: { weight: 450, size: 0.041 },
});

const SHADOW = { color: '#05031aa6', blur: 0.08, x: 0, y: 0.035 };
const phone = (o: DeviceOptions) => device({ color: METAL.graphite, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.graphite, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.graphite, shadow: SHADOW, ...o });

/** Copy at the top (tall, tablet) or in the left column (wide). */
function copy(cls: Cls): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: 0.5, x: 0.22, width: 0.46, align: 'start', head: { size: 0.072, maxLines: 3 }, sub: { size: 0.033, maxLines: 3 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: 0.165, width: 0.8, subWidth: 0.62, head: { size: 0.068 }, sub: { size: 0.032 } });
  return copyAt(t, { seam: 0.15 });
}

/** A few stars in the night sky, clear of the copy and the devices. */
function stars(cls: Cls): SlideElement[] {
  const spots: Record<Cls, [number, number, number][]> = {
    tall: [[0.05, 0.05, 0.012], [0.95, 0.034, 0.009], [0.04, 0.2, 0.008], [0.965, 0.165, 0.012]],
    tablet: [[0.05, 0.05, 0.01], [0.95, 0.04, 0.008], [0.04, 0.2, 0.007], [0.96, 0.17, 0.01]],
    wide: [[0.03, 0.09, 0.012], [0.42, 0.06, 0.008], [0.97, 0.05, 0.01], [0.05, 0.9, 0.008]],
  };
  return spots[cls].map(([x, y, size], i) => circle({ name: 'Star', x, y, size, color: '#ffffff', opacity: i % 2 ? 0.6 : 0.85 }));
}

/** Two lights behind the devices; `flip` mirrors them. */
function lights(cls: Cls, flip = false): SlideElement[] {
  if (cls === 'wide') return [glow({ x: 0.62, y: 0.4, size: 0.75, color: '#7c4dff', opacity: 0.5 }), glow({ x: 0.9, y: 0.82, size: 0.5, color: '#16c8b4', opacity: 0.35 })];
  const y = cls === 'tablet' ? 0.6 : 0.5;
  return [
    glow({ x: flip ? 0.8 : 0.2, y, size: 0.78, color: '#7c4dff', opacity: 0.5 }),
    glow({ x: flip ? 0.18 : 0.82, y: y + 0.3, size: 0.6, color: '#16c8b4', opacity: 0.32 }),
  ];
}

/** The same calm hero on every canvas: copy on top, the device rising from the bottom edge. */
function hero(cls: Cls, flip = false): SlideElement[] {
  if (cls === 'wide') return [...stars(cls), ...lights(cls), ...copy(cls), laptop({ width: 0.9, x: 0.68, y: 0.53 })];
  if (cls === 'tablet') return [...stars(cls), ...lights(cls, flip), ...copy(cls), pad({ width: 0.78, top: 0.285 })];
  return [...stars(cls), ...lights(cls, flip), ...copy(cls), phone({ width: 0.84, top: 0.235 })];
}

function tilted(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    // Mirrored: the laptop on the left, the copy in the right column.
    return [
      ...stars(cls),
      glow({ x: 0.3, y: 0.4, size: 0.75, color: '#7c4dff', opacity: 0.5 }),
      glow({ x: 0.1, y: 0.82, size: 0.5, color: '#16c8b4', opacity: 0.35 }),
      ...copyAt(t, { cls, seam: 0.5, x: 0.77, width: 0.48, align: 'start', head: { size: 0.074, maxLines: 3 }, sub: { size: 0.034, maxLines: 3 } }),
      laptop({ width: 0.86, x: 0.31, y: 0.53 }),
    ];
  }
  return cls === 'tall' ? [...lights(cls, true), ...copy(cls), phone({ width: 0.8, top: 0.255, x: 0.53, rotation: -8 })] : hero(cls, true);
}

function pair(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    return [
      ...lights(cls),
      ...copy(cls),
      laptop({ width: 0.78, x: 0.72, y: 0.6, slot: 'second', opacity: 1 }),
      device({ cls, frame: 'none', width: 0.5, x: 0.55, y: 0.42, cornerRadius: 0.025, shadow: SHADOW }),
    ];
  }
  if (cls === 'tablet') {
    return [...lights(cls), ...copy(cls), pad({ width: 0.6, top: 0.36, x: 0.66, slot: 'second' }), pad({ width: 0.6, top: 0.3, x: 0.36 })];
  }
  return [
    ...lights(cls),
    ...copy(cls),
    phone({ width: 0.6, top: 0.3, x: 0.7, rotation: 6, slot: 'second' }),
    phone({ width: 0.64, top: 0.255, x: 0.34, rotation: -4 }),
  ];
}

function upside(cls: Cls): SlideElement[] {
  if (cls !== 'tall') return hero(cls);
  return [
    glow({ x: 0.28, y: 0.3, size: 0.85, color: '#7c4dff', opacity: 0.5 }),
    glow({ x: 0.86, y: 0.6, size: 0.55, color: '#ff5fb8', opacity: 0.28 }),
    phone({ width: 0.84, bottom: 0.69 }),
    ...copyAt(t, { seam: 0.81 }),
  ];
}

function halo(cls: Cls): SlideElement[] {
  const rings = (y: number, s: number) => [
    ring({ name: 'Halo', x: 0.5, y, size: 1.2 * s, stroke: 0.003, color: '#ffffff', opacity: 0.16 }),
    ring({ name: 'Halo', x: 0.5, y, size: 0.98 * s, stroke: 0.004, color: '#7cf5d6', opacity: 0.3 }),
  ];
  if (cls === 'wide') return [...lights(cls), ...rings(0.53, 0.8).map((r) => ({ ...r, x: 0.68 })), ...copy(cls), laptop({ width: 0.9, x: 0.68, y: 0.53 })];
  if (cls === 'tablet') return [...lights(cls), ...rings(0.72, 1.05), ...copy(cls), pad({ width: 0.74, top: 0.3 })];
  return [...lights(cls), ...rings(0.62, 1), ...copy(cls), phone({ width: 0.78, top: 0.255 })];
}

const slide = (build: (cls: Cls) => SlideElement[], copyText: SlideSpec['copy']): SlideSpec => ({
  copy: copyText,
  tall: build('tall'),
  tablet: build('tablet'),
  wide: build('wide'),
});

export const aurora = template({
  id: 'aurora',
  name: 'Aurora',
  description: 'Northern lights over a midnight sky: a violet and teal mesh with film grain, Sora headlines in white and mint, and graphite devices floating in soft glows.',
  category: 'gradient',
  tags: ['mesh', 'dark', 'glow', 'calm', 'wellness'],
  apps: ['meditation', 'music', 'calendar', 'fitness', 'tasks', 'chat'],
  theme: theme({
    background: background(
      mesh('#0a0820', [0.16, 0.06, '#4b23d6', 0.55], [0.04, 0.78, '#a3237f', 0.5], [0.98, 0.52, '#0e9e93', 0.4], [0.86, 1, '#1f3bd6', 0.48]),
      pattern('noise', '#ffffff', 0.06, 0.05),
    ),
    heading: F.sora,
    body: F.inter,
    palette: ['#7c5cff', '#2ee6c5', '#ff5fb8', '#ffffff', '#0a0820'],
    mockDark: true,
  }),
  slides: [
    slide(hero, {
      en: { headline: 'Sleep *deeper* tonight', subtitle: 'Soundscapes and stories that help you drift off in minutes.' },
      ar: { headline: 'نومٌ *أعمق* كل ليلة', subtitle: 'أصوات هادئة وقصص تساعدك على الاسترخاء والنوم في دقائق.' },
      de: { headline: 'Heute Nacht *tiefer* schlafen', subtitle: 'Klangwelten und Geschichten, mit denen du in Minuten einschläfst.' },
    }),
    slide(tilted, {
      en: { headline: 'Breathe in *calm*', subtitle: 'Guided sessions for stress, focus and slower mornings.' },
      ar: { headline: 'تنفّس *بهدوء*', subtitle: 'جلسات موجّهة تخفف التوتر وتعزز تركيزك كل صباح.' },
      de: { headline: 'Atme *Ruhe* ein', subtitle: 'Geführte Übungen gegen Stress, für Fokus und entspannte Morgen.' },
    }),
    slide(pair, {
      en: { headline: 'See your *progress*', subtitle: 'Streaks, moods and sleep scores in one calm view.' },
      ar: { headline: 'تابع *تقدّمك* بوضوح', subtitle: 'سلاسل الإنجاز ومزاجك وجودة نومك في مكان واحد.' },
      de: { headline: 'Sieh deinen *Fortschritt*', subtitle: 'Serien, Stimmungen und Schlafwerte auf einen Blick.' },
    }),
    slide(upside, {
      en: { headline: 'A story for *every* night', subtitle: 'Hundreds of bedtime stories, read by soothing voices.' },
      ar: { headline: 'قصة *لكل* ليلة', subtitle: 'مئات القصص الهادئة بأصوات تبعث على السكينة.' },
      de: { headline: 'Für *jede* Nacht eine Geschichte', subtitle: 'Hunderte Gutenachtgeschichten, gelesen von ruhigen Stimmen.' },
    }),
    slide(halo, {
      en: { headline: 'Wake up *refreshed*', subtitle: 'A smart alarm that follows your natural rhythm.' },
      ar: { headline: 'استيقظ *بنشاط*', subtitle: 'منبّه ذكي يوقظك في اللحظة المناسبة من دورة نومك.' },
      de: { headline: 'Erholt *aufwachen*', subtitle: 'Ein smarter Wecker, der deinem natürlichen Rhythmus folgt.' },
    }),
  ],
});

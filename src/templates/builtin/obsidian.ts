/**
 * Obsidian: a pro tool after hours. Near-black slate with a cold light from
 * above and fine grain, Manrope headlines with periwinkle highlights,
 * deep-blue titanium phones, tablets and a graphite MacBook on every canvas.
 * Story: a project workspace for makers and engineers.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, copyAt, device, glow, pattern, radial, ring, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const BLUE = '#8fb0ff';
const t = typeset({
  heading: F.manrope,
  body: F.inter,
  ink: '#f4f6fb',
  soft: '#aab4c7',
  accent: BLUE,
  head: { weight: 800, size: 0.088, lineHeight: 1.1, letterSpacing: -0.035 },
  sub: { weight: 450, size: 0.04 },
});

const SHADOW = { color: '#000000b3', blur: 0.08, x: 0, y: 0.035 };
const phone = (o: DeviceOptions) => device({ color: METAL.deepBlue, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.deepBlue, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.graphite, shadow: SHADOW, ...o });

function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: seam ?? 0.5, x: 0.22, width: 0.46, align: 'start', head: { size: 0.072, maxLines: 3 }, sub: { size: 0.032, maxLines: 3 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: seam ?? 0.165, width: 0.8, subWidth: 0.62, head: { size: 0.066 }, sub: { size: 0.031 } });
  return copyAt(t, { seam: seam ?? 0.15 });
}

/** The cold light the devices sit in. */
const light = (cls: Cls) => (cls === 'wide' ? glow({ x: 0.68, y: 0.3, size: 0.9, color: '#4c6fff', opacity: 0.3 }) : glow({ x: 0.5, y: cls === 'tablet' ? 0.42 : 0.36, size: 1.0, color: '#4c6fff', opacity: 0.3 }));

function hero(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [light(cls), ...copy(cls), laptop({ width: 0.92, x: 0.685, y: 0.53 })];
  if (cls === 'tablet') return [light(cls), ...copy(cls), pad({ width: 0.78, top: 0.285 })];
  return [light(cls), ...copy(cls), phone({ width: 0.82, top: 0.24 })];
}

function projects(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [light(cls), ...copy(cls), laptop({ width: 0.8, x: 0.72, y: 0.6, slot: 'second' }), device({ cls, frame: 'none', width: 0.48, x: 0.56, y: 0.38, cornerRadius: 0.025, shadow: SHADOW })];
  if (cls === 'tablet') return [light(cls), ...copy(cls), pad({ width: 0.6, top: 0.36, x: 0.66, slot: 'second' }), pad({ width: 0.6, top: 0.3, x: 0.36 })];
  return [light(cls), ...copy(cls), phone({ width: 0.6, top: 0.3, x: 0.7, slot: 'second' }), phone({ width: 0.64, top: 0.255, x: 0.34 })];
}

function shortcuts(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    // Copy on top, the laptop below it: a second arrangement for the wide canvas.
    return [glow({ x: 0.5, y: 0.6, size: 1.0, color: '#4c6fff', opacity: 0.28 }), ...copyAt(t, { cls, seam: 0.215, width: 1.2, subWidth: 0.95, head: { size: 0.066 }, sub: { size: 0.03 } }), laptop({ width: 1.02, top: 0.35 })];
  }
  if (cls === 'tablet') return hero(cls);
  return [glow({ x: 0.5, y: 0.34, size: 1.0, color: '#4c6fff', opacity: 0.3 }), phone({ width: 0.82, bottom: 0.69 }), ...copy(cls, 0.81)];
}

function teams(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    // Mirrored: the laptop on the left, the copy in the right column.
    return [
      glow({ x: 0.32, y: 0.3, size: 0.9, color: '#4c6fff', opacity: 0.3 }),
      ...copyAt(t, { cls, seam: 0.5, x: 0.77, width: 0.48, align: 'start', head: { size: 0.074, maxLines: 3 }, sub: { size: 0.033, maxLines: 3 } }),
      laptop({ width: 0.86, x: 0.31, y: 0.53 }),
    ];
  }
  if (cls !== 'tall') return projects(cls);
  return [light(cls), ...copy(cls), phone({ width: 0.78, top: 0.262, x: 0.53, rotation: -7 })];
}

function orbit(cls: Cls): SlideElement[] {
  const rings = (x: number, y: number, s: number) => [
    ring({ name: 'Orbit', x, y, size: 1.24 * s, stroke: 0.0025, color: BLUE, opacity: 0.22 }),
    ring({ name: 'Orbit', x, y, size: 1.0 * s, stroke: 0.0025, color: BLUE, opacity: 0.38 }),
  ];
  if (cls === 'wide') return [...rings(0.685, 0.53, 0.78), ...hero(cls)];
  if (cls === 'tablet') return [...rings(0.5, 0.76, 1.06), ...hero(cls)];
  return [...rings(0.5, 0.6, 1.02), ...hero(cls)];
}

const o = { classes: ALL_CLASSES };

export const obsidian = template({
  id: 'obsidian',
  name: 'Obsidian',
  description: 'A pro tool after hours: near-black slate with a cold light from above and fine grain, Manrope headlines with periwinkle highlights, and deep-blue devices on every canvas.',
  category: 'dark',
  tags: ['dark', 'pro', 'mac', 'productivity', 'minimal'],
  apps: ['tasks', 'calendar', 'chat', 'finance', 'music', 'meditation', 'fitness'],
  theme: theme({
    background: background(radial(0.5, -0.05, 0.95, ['#2a3654', 0], ['#141925', 0.55], ['#0c0e13', 1]), pattern('noise', '#ffffff', 0.04, 0.05)),
    heading: F.manrope,
    body: F.inter,
    palette: ['#6d8dff', '#3ddc97', '#ffb547', '#ff6b81', '#f4f6fb', '#0c0e13'],
    mockDark: true,
  }),
  slides: [
    slide(
      {
        en: { headline: 'Deep work, *on demand*', subtitle: 'A focused workspace for projects, notes and code.' },
        ar: { headline: 'عمل عميق *متى شئت*', subtitle: 'مساحة عمل مركّزة للمشاريع والملاحظات والبرمجة.' },
      },
      hero,
      o,
    ),
    slide(
      {
        en: { headline: 'Every project, *one* place', subtitle: 'Boards, docs and timelines that stay in sync.' },
        ar: { headline: 'كل مشاريعك في *مكان* واحد', subtitle: 'لوحات ومستندات وجداول زمنية متزامنة دائمًا.' },
      },
      projects,
      o,
    ),
    slide(
      {
        en: { headline: 'Shortcuts for *everything*', subtitle: 'Fly through your day without touching the mouse.' },
        ar: { headline: 'اختصارات *لكل شيء*', subtitle: 'أنجز يومك بسرعة دون أن تلمس الفأرة.' },
      },
      shortcuts,
      o,
    ),
    slide(
      {
        en: { headline: 'Built for *teams*', subtitle: 'Comments, mentions and reviews in real time.' },
        ar: { headline: 'مصمّم *للفرق*', subtitle: 'تعليقات وإشارات ومراجعات لحظة بلحظة.' },
      },
      teams,
      o,
    ),
    slide(
      {
        en: { headline: 'Dark by *default*', subtitle: 'Easy on the eyes, from first coffee to last commit.' },
        ar: { headline: 'داكن *افتراضيًا*', subtitle: 'مريح للعين من أول فنجان قهوة حتى آخر سطر برمجي.' },
      },
      orbit,
      o,
    ),
  ],
});

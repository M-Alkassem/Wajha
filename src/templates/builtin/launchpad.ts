/**
 * Launchpad: a clean product page for web apps. Cool paper grey with a dot
 * grid, Space Grotesk headlines with electric-blue highlights, light
 * browser windows (a phone beside them where it helps). Story: a privacy
 * friendly web analytics tool.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, copyAt, device, glow, pattern, ring, slide, solid, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const BLUE = '#2563eb';
const t = typeset({
  heading: F.spaceGrotesk,
  body: F.inter,
  ink: '#0b1220',
  soft: '#475266',
  accent: BLUE,
  head: { weight: 700, size: 0.088, lineHeight: 1.1, letterSpacing: -0.035 },
  sub: { weight: 450, size: 0.039, lineHeight: 1.38 },
});

const SHADOW = { color: '#0f172a33', blur: 0.07, x: 0, y: 0.03 };
const browser = (o: DeviceOptions) => device({ frame: 'browser', color: '#ffffff', finish: 'matte', shadow: SHADOW, ...o });
const phone = (o: DeviceOptions) => device({ color: METAL.silver, shadow: SHADOW, ...o });

function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: seam ?? 0.5, x: 0.21, width: 0.46, align: 'start', head: { size: 0.068, maxLines: 3 }, sub: { size: 0.031, maxLines: 3 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: seam ?? 0.165, width: 0.82, subWidth: 0.66, head: { size: 0.066 }, sub: { size: 0.031 } });
  return copyAt(t, { seam: seam ?? 0.15 });
}

/** A faint blue light under the windows: depth on a flat page. */
const halo = (x: number, y: number, size: number) => glow({ x, y, size, color: BLUE, opacity: 0.16, blur: 0.16 });

function hero(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [halo(0.69, 0.55, 0.8), ...copy(cls), browser({ cls, width: 0.96, x: 0.69, y: 0.5 })];
  if (cls === 'tablet') return [halo(0.5, 0.75, 0.9), ...copy(cls), browser({ cls, width: 0.84, top: 0.29 })];
  return [halo(0.5, 0.62, 0.95), ...copy(cls), browser({ width: 0.8, top: 0.24 })];
}

function stacked(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    return [halo(0.7, 0.55, 0.8), ...copy(cls), browser({ cls, width: 0.74, x: 0.74, y: 0.58, slot: 'second' }), browser({ cls, width: 0.74, x: 0.635, y: 0.43 })];
  }
  if (cls === 'tablet') return [halo(0.5, 0.75, 0.9), ...copy(cls), browser({ cls, width: 0.66, top: 0.36, x: 0.62, slot: 'second' }), browser({ cls, width: 0.66, top: 0.3, x: 0.4 })];
  return [halo(0.5, 0.62, 0.95), ...copy(cls), browser({ width: 0.62, top: 0.3, x: 0.66, slot: 'second' }), browser({ width: 0.64, top: 0.255, x: 0.36 })];
}

function upside(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    // Mirrored: the browser on the left, the copy in the right column.
    return [
      halo(0.31, 0.55, 0.8),
      ...copyAt(t, { cls, seam: 0.5, x: 0.775, width: 0.46, align: 'start', head: { size: 0.07, maxLines: 3 }, sub: { size: 0.032, maxLines: 3 } }),
      browser({ cls, width: 0.9, x: 0.31, y: 0.5 }),
    ];
  }
  if (cls !== 'tall') return hero(cls);
  return [halo(0.5, 0.36, 0.95), browser({ width: 0.82, bottom: 0.69 }), ...copy(cls, 0.81)];
}

/** Desktop and phone side by side: the same app on every screen. */
function everywhere(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [halo(0.66, 0.55, 0.8), ...copy(cls), browser({ cls, width: 0.88, x: 0.66, y: 0.47 }), device({ cls, frame: 'none', width: 0.36, x: 0.88, y: 0.72, cornerRadius: 0.04, shadow: SHADOW, slot: 'second' })];
  if (cls === 'tablet') return [halo(0.5, 0.75, 0.9), ...copy(cls), browser({ cls, width: 0.8, top: 0.29, x: 0.44 }), device({ cls, frame: 'ipad', color: METAL.silver, width: 0.36, top: 0.52, x: 0.8, slot: 'second', shadow: SHADOW })];
  return [halo(0.5, 0.62, 0.95), ...copy(cls), browser({ width: 0.76, top: 0.255, x: 0.42 }), phone({ width: 0.42, top: 0.48, x: 0.76, slot: 'second' })];
}

function orbit(cls: Cls): SlideElement[] {
  const rings = (x: number, y: number, s: number) => [
    ring({ name: 'Orbit', x, y, size: 1.1 * s, stroke: 0.003, color: BLUE, opacity: 0.22 }),
    ring({ name: 'Orbit', x, y, size: 0.82 * s, stroke: 0.003, color: BLUE, opacity: 0.3 }),
  ];
  if (cls === 'wide') return [...rings(0.69, 0.5, 0.95), ...hero(cls)];
  if (cls === 'tablet') return [...rings(0.5, 0.7, 1.1), ...hero(cls)];
  return [...rings(0.5, 0.6, 1.05), ...hero(cls)];
}

const o = { classes: ALL_CLASSES };

export const launchpad = template({
  id: 'launchpad',
  name: 'Launchpad',
  description: 'A clean product page for web apps: cool grey paper with a dot grid, Space Grotesk headlines with electric-blue highlights, and light browser windows that work on every canvas.',
  category: 'minimal',
  tags: ['web app', 'browser', 'saas', 'light', 'clean'],
  apps: ['finance', 'fitness', 'tasks', 'calendar', 'chat', 'shop', 'social'],
  theme: theme({
    background: background(solid('#f5f6f8'), pattern('dots', '#0f172a', 0.09, 0.045)),
    heading: F.spaceGrotesk,
    body: F.inter,
    palette: [BLUE, '#14b8a6', '#f59e0b', '#ef4444', '#ffffff', '#0b1220'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Analytics, *simplified*', subtitle: 'Understand your traffic in seconds, without cookies.' },
        ar: { headline: 'تحليلات *أبسط*', subtitle: 'افهم زيارات موقعك في ثوانٍ، دون ملفات تعريف الارتباط.' },
        de: { headline: 'Analytics, *vereinfacht*', subtitle: 'Verstehe deinen Traffic in Sekunden, ganz ohne Cookies.' },
      },
      hero,
      o,
    ),
    slide(
      {
        en: { headline: 'Real-time, *really*', subtitle: 'Watch visitors arrive the moment you launch.' },
        ar: { headline: 'لحظةً *بلحظة*', subtitle: 'شاهد الزوّار يصلون فور إطلاق موقعك.' },
        de: { headline: 'Echtzeit, *wirklich*', subtitle: 'Sieh deine Besucher, sobald du live gehst.' },
      },
      stacked,
      o,
    ),
    slide(
      {
        en: { headline: 'Goals that *convert*', subtitle: 'Track sign-ups, sales and funnels with zero setup.' },
        ar: { headline: 'أهداف *تحقق* النتائج', subtitle: 'تتبّع التسجيلات والمبيعات ومسارات التحويل دون أي إعداد.' },
        de: { headline: 'Ziele, die *konvertieren*', subtitle: 'Verfolge Anmeldungen, Verkäufe und Funnels ohne Einrichtung.' },
      },
      upside,
      o,
    ),
    slide(
      {
        en: { headline: 'Reports your team *loves*', subtitle: 'Live dashboards on every screen, shared with one link.' },
        ar: { headline: 'تقارير *يحبها* فريقك', subtitle: 'لوحات بيانات مباشرة على كل شاشة، تشاركها برابط واحد.' },
        de: { headline: 'Berichte, die dein Team *liebt*', subtitle: 'Live-Dashboards auf jedem Bildschirm, geteilt per Link.' },
      },
      everywhere,
      o,
    ),
    slide(
      {
        en: { headline: 'Privacy *first*', subtitle: 'No cookies, no tracking, fully GDPR compliant.' },
        ar: { headline: 'خصوصية *بلا تنازلات*', subtitle: 'بلا ملفات تعريف ارتباط ولا تتبّع، ومتوافق مع اللائحة الأوروبية.' },
        de: { headline: 'Datenschutz *zuerst*', subtitle: 'Keine Cookies, kein Tracking, voll DSGVO-konform.' },
      },
      orbit,
      o,
    ),
  ],
});

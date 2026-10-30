/**
 * Sunset Boulevard: dusk over the coast road. A violet-to-peach sky with
 * faint waves, a setting sun behind tilted silver devices, Bricolage
 * Grotesque headlines with butter-yellow marker highlights. Story: a
 * road-trip planner.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, METAL, background, circle, copyAt, device, glow, linear, pattern, slide, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const t = typeset({
  heading: F.bricolage,
  body: F.dmSans,
  ink: '#ffffff',
  soft: '#fbe8ff',
  accent: '#ffd166',
  mode: 'marker',
  head: { weight: 760, size: 0.094, lineHeight: 1.12, letterSpacing: -0.025 },
  sub: { weight: 500, size: 0.041 },
});

const SHADOW = { color: '#3b0a3d73', blur: 0.07, x: 0, y: 0.032 };
const phone = (o: DeviceOptions) => device({ color: METAL.silver, shadow: SHADOW, ...o });
const pad = (o: DeviceOptions) => device({ cls: 'tablet', frame: 'ipad', color: METAL.silver, shadow: SHADOW, ...o });
const laptop = (o: DeviceOptions) => device({ cls: 'wide', frame: 'macbook', color: METAL.silver, shadow: SHADOW, ...o });

/** The setting sun: a warm disc with a soft halo. */
const sun = (x: number, y: number, size: number): SlideElement[] => [
  glow({ name: 'Sun glow', x, y, size: size * 1.08, color: '#ff9a6b', opacity: 0.55, blur: 0.12 }),
  circle({ name: 'Sun', x, y, size, fill: linear(180, '#ffe9a6', '#ffb37a', '#ff7e86') }),
];

/** Copy at the top, where the sky is darkest (wide canvases stack copy over the laptop). */
function copy(cls: Cls, seam?: number): SlideElement[] {
  if (cls === 'wide') return copyAt(t, { cls, seam: seam ?? 0.2, width: 1.2, subWidth: 0.95, head: { size: 0.068 }, sub: { size: 0.03 } });
  if (cls === 'tablet') return copyAt(t, { cls, seam: seam ?? 0.165, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } });
  return copyAt(t, { seam: seam ?? 0.152 });
}

/** A tilted device rising from the bottom edge in front of the sun. */
function tilted(sunAt: [number, number, number], rotation: number, x: number) {
  return (cls: Cls): SlideElement[] => {
    if (cls === 'wide') return [...sun(sunAt[0] * 0.6 + 0.2, 0.84, 0.9), ...copy(cls), laptop({ width: 0.98, top: 0.35, x: 0.5 })];
    if (cls === 'tablet') return [...sun(sunAt[0], 0.74, sunAt[2] * 0.85), ...copy(cls), pad({ width: 0.72, top: 0.3, x: 0.5 + (x - 0.5) / 2, rotation: rotation / 2 })];
    return [...sun(...sunAt), ...copy(cls), phone({ width: 0.78, top: 0.262, x, rotation })];
  };
}

function duo(cls: Cls): SlideElement[] {
  if (cls === 'wide') {
    return [...sun(0.5, 0.86, 0.8), ...copy(cls), laptop({ width: 0.86, top: 0.38, x: 0.42, slot: 'second' }), device({ cls, frame: 'none', width: 0.46, x: 0.74, y: 0.7, cornerRadius: 0.03, shadow: SHADOW })];
  }
  if (cls === 'tablet') return [...sun(0.5, 0.72, 0.6), ...copy(cls), pad({ width: 0.56, top: 0.36, x: 0.68, rotation: 5, slot: 'second' }), pad({ width: 0.58, top: 0.3, x: 0.34, rotation: -4 })];
  return [...sun(0.5, 0.5, 0.7), ...copy(cls), phone({ width: 0.6, top: 0.31, x: 0.71, rotation: 10, slot: 'second' }), phone({ width: 0.62, top: 0.262, x: 0.32, rotation: -8 })];
}

/** The sky turned upside down so copy at the bottom sits on dusk violet. */
const DUSK_UP = background(linear(0, ['#24104f', 0], ['#6b2a8c', 0.34], ['#d4567c', 0.68], ['#ffb27a', 1]), pattern('waves', '#ffffff', 0.07, 0.06));

function hanging(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...sun(0.5, 0.06, 0.7), laptop({ width: 0.9, top: 0.07 }), ...copyAt(t, { cls, seam: 0.83, width: 1.2, subWidth: 0.95, head: { size: 0.066 }, sub: { size: 0.03 } })];
  if (cls === 'tablet') return [...sun(0.5, 0.08, 0.7), pad({ width: 0.74, bottom: 0.66, rotation: -3 }), ...copyAt(t, { cls, seam: 0.83, width: 0.8, subWidth: 0.64, head: { size: 0.068 }, sub: { size: 0.032 } })];
  return [...sun(0.5, 0.1, 0.9), phone({ width: 0.8, bottom: 0.655, x: 0.53, rotation: -6 }), ...copyAt(t, { seam: 0.8 })];
}

const o = { classes: ALL_CLASSES };

export const sunsetBoulevard = template({
  id: 'sunset-boulevard',
  name: 'Sunset Boulevard',
  description: 'Dusk over the coast road: a violet-to-peach sky with faint waves, a setting sun behind tilted silver phones and bold headlines with butter-yellow marker highlights.',
  category: 'gradient',
  tags: ['sunset', 'warm', 'tilted', 'marker', 'travel'],
  apps: ['travel', 'calendar', 'music', 'tasks', 'social', 'chat', 'shop', 'finance'],
  theme: theme({
    background: background(linear(180, ['#24104f', 0], ['#6b2a8c', 0.36], ['#d4567c', 0.7], ['#ffb27a', 1]), pattern('waves', '#ffffff', 0.07, 0.06)),
    heading: F.bricolage,
    body: F.dmSans,
    palette: ['#ff6b8a', '#ffd166', '#8b5cf6', '#ffb27a', '#ffffff', '#24104f'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Plan the *perfect* road trip', subtitle: 'Routes, stops and stays, organized on one beautiful map.' },
        ar: { headline: 'خطّط لرحلتك *المثالية*', subtitle: 'المسارات والمحطات وأماكن الإقامة على خريطة واحدة أنيقة.' },
        de: { headline: 'Plane den *perfekten* Roadtrip', subtitle: 'Routen, Stopps und Unterkünfte übersichtlich auf einer Karte.' },
      },
      tilted([0.5, 0.55, 0.92], 8, 0.46),
      o,
    ),
    slide(
      {
        en: { headline: 'Travel with *friends*', subtitle: 'Share plans, split costs and vote on the next stop.' },
        ar: { headline: 'سافر مع *أصدقائك*', subtitle: 'شاركوا الخطط وقسّموا التكاليف واختاروا المحطة التالية معًا.' },
        de: { headline: 'Reise mit *Freunden*', subtitle: 'Teilt Pläne und Kosten und stimmt über den nächsten Halt ab.' },
      },
      duo,
      o,
    ),
    slide(
      {
        en: { headline: 'Every stop, *one* tap', subtitle: 'Save cafés, viewpoints and hidden gems along the way.' },
        ar: { headline: 'كل محطة *بلمسة* واحدة', subtitle: 'احفظ المقاهي والإطلالات والأماكن المميزة على طول الطريق.' },
        de: { headline: 'Jeder Stopp mit *einem* Tipp', subtitle: 'Speichere Cafés, Aussichtspunkte und Geheimtipps unterwegs.' },
      },
      hanging,
      { ...o, background: DUSK_UP },
    ),
    slide(
      {
        en: { headline: 'Golden hour, *guaranteed*', subtitle: 'Sunset times and scenic detours for every route.' },
        ar: { headline: 'لحظة الغروب *مضمونة*', subtitle: 'مواعيد الغروب وطرق بديلة خلابة لكل مسار.' },
        de: { headline: 'Goldene Stunde *garantiert*', subtitle: 'Sonnenuntergangszeiten und Panoramaumwege für jede Route.' },
      },
      tilted([0.22, 0.47, 0.62], -8, 0.55),
      o,
    ),
    slide(
      {
        en: { headline: 'Offline, *anywhere*', subtitle: 'Maps and tickets that keep working far beyond the signal.' },
        ar: { headline: 'خرائطك تعمل *دائمًا*', subtitle: 'خرائط وتذاكر متاحة حتى في أبعد الأماكن عن التغطية.' },
        de: { headline: 'Offline, *überall*', subtitle: 'Karten und Tickets, die auch ohne Empfang funktionieren.' },
      },
      tilted([0.5, 0.6, 1.16], 0, 0.5),
      o,
    ),
  ],
});

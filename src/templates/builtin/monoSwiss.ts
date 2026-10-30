/**
 * Mono Swiss: International Typographic Style. Warm paper white on a
 * six-column hairline grid, flush-left Inter set tight and large, a single
 * signal red, bare screenshots placed on the grid. Story: a notes app.
 */
import type { SlideElement } from '../../model/types';
import { ALL_CLASSES, F, background, canvas, copyAt, device, pattern, rect, r5, slide, solid, template, theme, typeset, type Cls, type DeviceOptions } from '../kit';

const RED = '#cc2a18';
const t = typeset({
  heading: F.inter,
  body: F.inter,
  ink: '#0e0e0e',
  soft: '#3a3a3a',
  accent: RED,
  align: 'start',
  head: { weight: 800, size: 0.108, lineHeight: 1.06, letterSpacing: -0.045, maxLines: 3 },
  sub: { weight: 450, size: 0.038, lineHeight: 1.4 },
  eyebrow: { color: '#0e0e0e', highlight: RED, size: 0.028, letterSpacing: 0.12, weight: 700 },
});

/** The grid: 0.168u modules with 0.084u margins (the background pattern draws the same lines). */
const M = 0.168;
const edge = (k: number) => 0.084 + M * k;

/** Element centre x (canvas fraction) of a box spanning grid lines a..b. */
const spanX = (cls: Cls, a: number, b: number) => r5((edge(a) + edge(b)) / 2 / canvas(cls).wu);
const spanW = (a: number, b: number) => r5(edge(b) - edge(a));
/** A grid line as a fraction of the canvas height. */
const row = (cls: Cls, k: number) => r5(edge(k) / canvas(cls).hu);

const SHADOW = { color: '#0000002e', blur: 0.035, x: 0, y: 0.018 };
const shot = (cls: Cls, a: number, b: number, topRow: number, o: DeviceOptions = {}) =>
  device({ cls, frame: 'none', cornerRadius: 0.07, shadow: SHADOW, x: spanX(cls, a, b), width: spanW(a, b), top: row(cls, topRow), ...o });

/** A solid red module, the one loud element on the page. */
const block = (cls: Cls, col: number, rowK: number, size = 1) =>
  rect({ name: 'Red block', x: spanX(cls, col, col + size), y: r5((edge(rowK) + (M * size) / 2) / canvas(cls).hu), size: M * size, radius: 0, color: RED });

/** Eyebrow on the top margin, headline + subtitle meeting at a grid line. */
function copy(cls: Cls, seamRow: number, o: { head?: number; subTo?: number } = {}): SlideElement[] {
  const wide = cls === 'wide';
  const to = wide ? 4 : 5;
  return [
    t.eyebrow({ x: spanX(cls, 0, to), width: spanW(0, to), y: row(cls, 0) }),
    ...copyAt(t, {
      cls,
      seam: row(cls, seamRow),
      x: spanX(cls, 0, to),
      width: spanW(0, to),
      head: { size: o.head ?? (cls === 'tall' ? 0.108 : 0.084) },
      sub: { x: spanX(cls, 0, o.subTo ?? (wide ? 4 : 4)), width: spanW(0, o.subTo ?? 4), size: cls === 'tall' ? 0.038 : 0.03 },
    }),
  ];
}

function think(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...copy(cls, 3, { head: 0.1 }), shot(cls, 5, 9, 1), block(cls, 0, 4.5)];
  if (cls === 'tablet') return [...copy(cls, 2.5, { head: 0.11 }), shot(cls, 2, 5, 3.6), block(cls, 0, 6)];
  return [...copy(cls, 3.5, { head: 0.135 }), shot(cls, 2, 5, 5.5), block(cls, 0, 11)];
}

function focus(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...copy(cls, 3), shot(cls, 4.5, 9, 0.8)];
  if (cls === 'tablet') return [...copy(cls, 2.5), shot(cls, 1, 5, 3.6)];
  return [...copy(cls, 3), shot(cls, 1, 5, 4.4)];
}

function organize(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...copy(cls, 3), shot(cls, 6, 9, 2, { slot: 'second' }), shot(cls, 4.5, 7.5, 0.8)];
  if (cls === 'tablet') return [...copy(cls, 2.5), shot(cls, 2.5, 5, 4.4, { slot: 'second' }), shot(cls, 0, 2.5, 3.6)];
  return [...copy(cls, 3), shot(cls, 2.5, 5, 5.4, { slot: 'second' }), shot(cls, 0, 2.5, 4.4)];
}

function search(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...copy(cls, 3), shot(cls, 4.5, 9, 0.8), block(cls, 0, 4.5)];
  if (cls === 'tablet') return [...copy(cls, 2.5), shot(cls, 0, 4, 3.6), block(cls, 4, 6)];
  return [...copy(cls, 3), shot(cls, 0, 4, 4.4), block(cls, 4, 11)];
}

function secure(cls: Cls): SlideElement[] {
  if (cls === 'wide') return [...copy(cls, 3), shot(cls, 4.5, 9, 0.8)];
  if (cls === 'tablet') return [...copy(cls, 2.5), shot(cls, 1, 5, 3.6)];
  return [...copy(cls, 3), shot(cls, 1, 5, 4.4)];
}

const o = { classes: ALL_CLASSES };

export const monoSwiss = template({
  id: 'mono-swiss',
  name: 'Mono Swiss',
  description: 'International Typographic Style: paper white on a hairline grid, flush-left Inter set tight and large, one signal red, and bare screenshots placed on the grid.',
  category: 'minimal',
  tags: ['swiss', 'grid', 'typography', 'monochrome', 'notes'],
  apps: ['tasks', 'calendar', 'chat', 'finance', 'meditation', 'social', 'shop'],
  theme: theme({
    background: background(solid('#f1f0eb'), pattern('grid', '#111111', 0.06, M)),
    heading: F.inter,
    body: F.inter,
    palette: [RED, '#111111', '#7a7a7a', '#d9d7d0', '#f1f0eb'],
  }),
  slides: [
    slide(
      {
        en: { eyebrow: '*01* — Capture', headline: 'Think *clearly.*', subtitle: 'Plain-text notes that stay out of your way.' },
        ar: { eyebrow: '*01* — التدوين', headline: 'فكّر *بوضوح.*', subtitle: 'ملاحظات نصية بسيطة لا تشتّت انتباهك.' },
        de: { eyebrow: '*01* — Notieren', headline: 'Denk *klar.*', subtitle: 'Schlichte Notizen, die dir nicht im Weg stehen.' },
      },
      think,
      o,
    ),
    slide(
      {
        en: { eyebrow: '*02* — Focus', headline: 'Write without *noise*', subtitle: 'A distraction-free editor with nothing but your words.' },
        ar: { eyebrow: '*02* — التركيز', headline: 'اكتب *بلا ضجيج*', subtitle: 'محرّر خالٍ من المشتّتات، لا شيء فيه سوى كلماتك.' },
        de: { eyebrow: '*02* — Fokus', headline: 'Schreiben ohne *Lärm*', subtitle: 'Ein ablenkungsfreier Editor, nur du und deine Worte.' },
      },
      focus,
      o,
    ),
    slide(
      {
        en: { eyebrow: '*03* — Organize', headline: 'Everything in its *place*', subtitle: 'Tags, folders and links that connect your ideas.' },
        ar: { eyebrow: '*03* — التنظيم', headline: 'كل شيء في *مكانه*', subtitle: 'وسوم ومجلدات وروابط تصل أفكارك ببعضها.' },
        de: { eyebrow: '*03* — Ordnen', headline: 'Alles an seinem *Platz*', subtitle: 'Tags, Ordner und Links, die deine Ideen verbinden.' },
      },
      organize,
      o,
    ),
    slide(
      {
        en: { eyebrow: '*04* — Search', headline: 'Find *anything* in seconds', subtitle: 'Instant search across every note you have ever written.' },
        ar: { eyebrow: '*04* — البحث', headline: 'اعثر على *أي شيء* في ثوانٍ', subtitle: 'بحث فوري في كل ملاحظة كتبتها يومًا.' },
        de: { eyebrow: '*04* — Suchen', headline: 'Finde *alles* in Sekunden', subtitle: 'Sofortsuche in jeder Notiz, die du je geschrieben hast.' },
      },
      search,
      o,
    ),
    slide(
      {
        en: { eyebrow: '*05* — Sync', headline: 'Private by *design*', subtitle: 'End-to-end encrypted and synced across your devices.' },
        ar: { eyebrow: '*05* — المزامنة', headline: 'الخصوصية *أولًا*', subtitle: 'تشفير تام بين الطرفين ومزامنة على جميع أجهزتك.' },
        de: { eyebrow: '*05* — Sync', headline: 'Privat aus *Prinzip*', subtitle: 'Ende-zu-Ende-verschlüsselt und auf allen Geräten synchron.' },
      },
      secure,
      o,
    ),
  ],
});

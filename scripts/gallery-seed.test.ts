/**
 * Writes the community gallery's seed templates (gallery/templates/<id>/
 * template.json) from the definitions below, authored with the same kit as
 * the built-in templates. Contributors do not need this: a gallery template
 * is just its template.json (design one in the app, "Save as template",
 * export it). Run it only to regenerate the seeds:
 *
 *   WAJHA_GALLERY_SEED=1 npx vitest run scripts/gallery-seed.test.ts
 *
 * Then render the previews and rebuild the index (see docs/TEMPLATES.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SlideElement, Template } from '../src/model/types';
import { validateTemplate } from '../src/model/validate';
import { BUILTIN_TEMPLATES } from '../src/templates';
import { BUILD_PROBLEMS, F, METAL, background, circle, copyAt, device, elementsOverlap, glow, mesh, pattern, radial, rect, ring, slide, solid, template, theme, typeset } from '../src/templates/kit';

const GALLERY = join(import.meta.dirname, '..', 'gallery', 'templates');
const AUTHOR = 'Wajha Community';

/* Lagoon -------------------------------------------------------------- */

const lagoonType = typeset({
  heading: F.outfit,
  body: F.inter,
  ink: '#ffffff',
  soft: '#e2fbff',
  accent: '#86f7e3',
  head: { weight: 700, size: 0.092, lineHeight: 1.1, letterSpacing: -0.025 },
  sub: { weight: 450, size: 0.041 },
});
const bubbles = (spots: [number, number, number][]): SlideElement[] => spots.map(([x, y, size]) => ring({ name: 'Bubble', x, y, size, stroke: Math.max(0.004, size * 0.06), color: '#ffffff', opacity: 0.35 }));
const lagoonPhone = (o: Parameters<typeof device>[0]) => device({ color: METAL.white, shadow: { color: '#01223a80', blur: 0.07, x: 0, y: 0.03 }, ...o });

const lagoon = template({
  id: 'lagoon',
  name: 'Lagoon',
  description: 'Clear tropical water: a deep teal to aqua mesh, drifting bubble rings, white phones and fresh mint highlights.',
  category: 'gradient',
  tags: ['teal', 'water', 'fresh', 'wellness', 'mesh'],
  apps: ['fitness', 'calendar', 'tasks', 'meditation', 'social', 'chat'],
  theme: theme({
    background: background(mesh('#023a55', [0.85, 0.12, '#0a6f8f', 0.5], [0.12, 0.62, '#008c9e', 0.5], [0.9, 0.86, '#00b3a4', 0.45], [0.2, 1.0, '#0b4fa0', 0.45]), pattern('noise', '#ffffff', 0.04, 0.05)),
    heading: F.outfit,
    body: F.inter,
    palette: ['#00b8c4', '#86f7e3', '#ffb86b', '#ffffff', '#023a55'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Stay *hydrated*, effortlessly', subtitle: 'Gentle reminders that fit your day.' },
        ar: { headline: 'اشرب الماء *بانتظام*', subtitle: 'تذكيرات لطيفة تناسب يومك.' },
      },
      () => [...bubbles([[0.1, 0.4, 0.12], [0.9, 0.5, 0.18], [0.84, 0.32, 0.06], [0.14, 0.82, 0.08]]), ...copyAt(lagoonType, { seam: 0.152 }), lagoonPhone({ width: 0.8, top: 0.255 })],
    ),
    slide(
      {
        en: { headline: 'Track every *sip*', subtitle: 'One tap logs a glass, a bottle or a cup of tea.' },
        ar: { headline: 'سجّل كل *رشفة*', subtitle: 'لمسة واحدة لتسجيل كوب أو قارورة أو فنجان شاي.' },
      },
      () => [...bubbles([[0.88, 0.42, 0.14], [0.08, 0.56, 0.1]]), glow({ x: 0.5, y: 0.7, size: 0.9, color: '#28e0d0', opacity: 0.3 }), ...copyAt(lagoonType, { seam: 0.152 }), lagoonPhone({ width: 0.78, top: 0.265, x: 0.53, rotation: -7 })],
    ),
    slide(
      {
        en: { headline: 'Goals that *flow*', subtitle: 'Daily targets that adapt to the weather and your workouts.' },
        ar: { headline: 'أهداف *تتدفّق* معك', subtitle: 'أهداف يومية تتكيّف مع الطقس وتمارينك.' },
      },
      () => [
        ...bubbles([[0.5, 0.36, 0.08], [0.92, 0.62, 0.12]]),
        ...copyAt(lagoonType, { seam: 0.152 }),
        lagoonPhone({ width: 0.6, top: 0.31, x: 0.7, rotation: 6, slot: 'second' }),
        lagoonPhone({ width: 0.62, top: 0.262, x: 0.33, rotation: -4 }),
      ],
    ),
    slide(
      {
        en: { headline: 'Feel the *difference*', subtitle: 'Better focus, deeper sleep, brighter skin.' },
        ar: { headline: 'اشعر *بالفرق*', subtitle: 'تركيز أفضل ونوم أعمق وبشرة أكثر نضارة.' },
      },
      () => [...bubbles([[0.12, 0.3, 0.1], [0.86, 0.22, 0.16], [0.5, 0.5, 0.05]]), lagoonPhone({ width: 0.8, bottom: 0.68 }), ...copyAt(lagoonType, { seam: 0.81 })],
    ),
  ],
});

/* Terminal ------------------------------------------------------------ */

const GREEN = '#39ff88';
const termType = typeset({
  heading: F.spaceGrotesk,
  body: F.inter,
  ink: '#eafff2',
  soft: '#a9c9b6',
  accent: GREEN,
  head: { weight: 600, size: 0.088, lineHeight: 1.12, letterSpacing: -0.03 },
  sub: { weight: 450, size: 0.04 },
  eyebrow: { font: F.spaceGrotesk, transform: 'none', letterSpacing: 0.02, size: 0.034, weight: 500, color: GREEN, highlight: '#eafff2' },
});
const termShot = (o: Parameters<typeof device>[0]) => device({ frame: 'none', cornerRadius: 0.06, shadow: { color: '#000000cc', blur: 0.07, x: 0, y: 0.03 }, ...o });
const termCopy = (seam = 0.2): SlideElement[] => [termType.eyebrow({ y: 0.05 }), ...copyAt(termType, { seam })];

const terminal = template({
  id: 'terminal',
  name: 'Terminal',
  description: 'A developer tool after midnight: near-black with a phosphor-green grid, prompt-style eyebrows, Space Grotesk headlines and bare screenshots glowing in the dark.',
  category: 'dark',
  tags: ['developer', 'green', 'grid', 'dark', 'code'],
  apps: ['finance', 'tasks', 'chat', 'calendar', 'music'],
  theme: theme({
    background: background(radial(0.5, 0.15, 0.95, ['#0d2216', 0], ['#07110b', 0.6], ['#040805', 1]), pattern('grid', GREEN, 0.07, 0.06)),
    heading: F.spaceGrotesk,
    body: F.inter,
    palette: ['#2bd97a', '#00c2ff', '#ffcc33', '#ff5c7a', '#eafff2', '#040805'],
    mockDark: true,
  }),
  slides: [
    slide(
      {
        en: { eyebrow: '$ ship --prod', headline: 'Deploy from *anywhere*', subtitle: 'Push, preview and roll back from your phone.' },
        ar: { eyebrow: '$ ship --prod', headline: 'انشر من *أي مكان*', subtitle: 'ادفع التحديثات وعاينها وتراجع عنها من هاتفك.' },
      },
      () => [glow({ x: 0.5, y: 0.66, size: 0.9, color: GREEN, opacity: 0.22 }), ...termCopy(), termShot({ width: 0.74, top: 0.3 })],
    ),
    slide(
      {
        en: { eyebrow: '$ logs --live', headline: 'Every log, *live*', subtitle: 'Stream logs and metrics in real time.' },
        ar: { eyebrow: '$ logs --live', headline: 'سجلاتك *مباشرة*', subtitle: 'بث مباشر للسجلات والمقاييس لحظة بلحظة.' },
      },
      () => [glow({ x: 0.3, y: 0.62, size: 0.8, color: '#00c2ff', opacity: 0.2 }), ...termCopy(), termShot({ width: 0.6, top: 0.36, x: 0.69, rotation: 5, slot: 'second' }), termShot({ width: 0.62, top: 0.31, x: 0.33, rotation: -4 })],
    ),
    slide(
      {
        en: { eyebrow: '$ alerts on', headline: 'Sleep through the *night*', subtitle: 'Smart alerts wake you only when it matters.' },
        ar: { eyebrow: '$ alerts on', headline: 'نَم *مطمئنًا*', subtitle: 'تنبيهات ذكية لا توقظك إلا عند الضرورة.' },
      },
      () => [glow({ x: 0.5, y: 0.66, size: 0.9, color: GREEN, opacity: 0.22 }), ...termCopy(), termShot({ width: 0.72, top: 0.31, x: 0.53, rotation: -6 })],
    ),
    slide(
      {
        en: { eyebrow: '$ team invite', headline: 'Ship *together*', subtitle: 'Reviews, approvals and rollbacks for the whole team.' },
        ar: { eyebrow: '$ team invite', headline: 'أطلقوا *معًا*', subtitle: 'مراجعات وموافقات وتراجع آمن للفريق بأكمله.' },
      },
      () => [glow({ x: 0.5, y: 0.66, size: 1.0, color: GREEN, opacity: 0.2 }), ...termCopy(), termShot({ width: 0.74, top: 0.3 })],
    ),
  ],
});

/* Peony --------------------------------------------------------------- */

const PLUM = '#4a1d3a';
const peonyType = typeset({
  heading: F.playfair,
  body: F.manrope,
  ink: PLUM,
  soft: '#6a4a5b',
  accent: '#b03a62',
  head: { weight: 600, size: 0.094, lineHeight: 1.14, letterSpacing: -0.01 },
  sub: { weight: 500, size: 0.04, lineHeight: 1.42 },
});
const peonyPhone = (o: Parameters<typeof device>[0]) => device({ color: '#e9c6b9', shadow: { color: '#6b2a4a33', blur: 0.07, x: 0, y: 0.03 }, ...o });
const petals = (x: number, y: number, s = 1): SlideElement[] => [
  circle({ name: 'Petal', x, y, size: 0.96 * s, color: '#f8dfe3' }),
  ring({ name: 'Rose-gold line', x, y, size: 1.14 * s, stroke: 0.0025, color: '#c98a8f', opacity: 0.45 }),
];

const peony = template({
  id: 'peony',
  name: 'Peony',
  description: 'Soft and romantic: blush paper, a petal-pink disc framed by a fine rose-gold line, Playfair Display in deep plum and rose-gold phones.',
  category: 'elegant',
  tags: ['romantic', 'blush', 'serif', 'wedding', 'rose gold'],
  apps: ['calendar', 'tasks', 'chat', 'social', 'shop'],
  theme: theme({
    background: background(radial(0.5, 0.28, 0.95, '#fdf4f3', '#f4dfe1')),
    heading: F.playfair,
    body: F.manrope,
    palette: ['#c2416b', '#d9a35f', '#7b5ea7', PLUM, '#fdf4f3'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Your day, *beautifully* planned', subtitle: 'Guests, vendors and budget in one elegant place.' },
        ar: { headline: 'يوم العمر *بتنظيم* أنيق', subtitle: 'الضيوف والموردون والميزانية في مكان واحد أنيق.' },
      },
      () => [...petals(0.5, 0.64), ...copyAt(peonyType, { seam: 0.155 }), peonyPhone({ width: 0.76, top: 0.27 })],
    ),
    slide(
      {
        en: { headline: 'Guest lists, *simplified*', subtitle: 'RSVPs, seating and dietary notes at a glance.' },
        ar: { headline: 'قائمة الضيوف *ببساطة*', subtitle: 'تأكيدات الحضور وترتيب المقاعد بنظرة واحدة.' },
      },
      () => [...petals(0.42, 0.62, 0.9), ...copyAt(peonyType, { seam: 0.155 }), peonyPhone({ width: 0.76, top: 0.275, x: 0.54, rotation: -5 })],
    ),
    slide(
      {
        en: { headline: 'Every detail, *together*', subtitle: 'Share the plan with your partner and your planner.' },
        ar: { headline: 'كل التفاصيل *معًا*', subtitle: 'شارك الخطة مع شريك حياتك ومنسّق الحفل.' },
      },
      () => [...petals(0.5, 0.68, 1.05), ...copyAt(peonyType, { seam: 0.155 }), peonyPhone({ width: 0.58, top: 0.32, x: 0.69, rotation: 4, slot: 'second' }), peonyPhone({ width: 0.62, top: 0.28, x: 0.33, rotation: -3 })],
    ),
    slide(
      {
        en: { headline: 'Countdown to *forever*', subtitle: 'Timelines and reminders, so nothing is missed.' },
        ar: { headline: 'العدّ التنازلي *للحظة* الكبرى', subtitle: 'جداول وتذكيرات حتى لا يفوتك أي تفصيل.' },
      },
      () => [...petals(0.5, 0.34, 1.0), peonyPhone({ width: 0.78, bottom: 0.665 }), ...copyAt(peonyType, { seam: 0.815 })],
    ),
  ],
});

/* Blueprint ----------------------------------------------------------- */

const blueType = typeset({
  heading: F.inter,
  body: F.inter,
  ink: '#ffffff',
  soft: '#e3ecff',
  accent: '#ffe08a',
  align: 'start',
  head: { weight: 700, size: 0.094, lineHeight: 1.08, letterSpacing: -0.035 },
  sub: { weight: 450, size: 0.04, lineHeight: 1.38 },
});
const blueShot = (o: Parameters<typeof device>[0]) => device({ frame: 'none', cornerRadius: 0.07, shadow: { color: '#06204d80', blur: 0.06, x: 0, y: 0.025 }, ...o });

/** Flush-left copy: both blocks start on the same left margin. */
const blueCopy = () => copyAt(blueType, { seam: 0.2, width: 0.86, sub: { x: 0.47, width: 0.8 } });

/** A dimension line beside a screenshot: a thin vertical rule with end ticks, like a technical drawing. */
function dimension(x: number, top: number, bottom: number): SlideElement[] {
  const hu = 2868 / 1320;
  const mid = (top + bottom) / 2;
  const tick = (y: number) => rect({ name: 'Tick', x, y, width: 0.04, height: 0.004, radius: 0, color: '#ffffff', opacity: 0.8 });
  return [rect({ name: 'Dimension line', x, y: mid, width: 0.004, height: (bottom - top) * hu, radius: 0, color: '#ffffff', opacity: 0.8 }), tick(top), tick(bottom)];
}

const blueprint = template({
  id: 'blueprint',
  name: 'Blueprint',
  description: 'A technical drawing come to life: blueprint blue with a white grid, flush-left Inter, highlighter-yellow words, bare screenshots and dimension lines.',
  category: 'minimal',
  tags: ['blueprint', 'grid', 'technical', 'blue', 'home'],
  apps: ['tasks', 'finance', 'calendar', 'shop', 'chat'],
  theme: theme({
    background: background(solid('#1f4fa3'), pattern('grid', '#ffffff', 0.13, 0.1)),
    heading: F.inter,
    body: F.inter,
    palette: ['#ffcf4d', '#4dd0e1', '#ff8a65', '#ffffff', '#1f4fa3'],
  }),
  slides: [
    slide(
      {
        en: { headline: 'Plan your *dream* space', subtitle: 'Measure rooms, sketch layouts and price every idea.' },
        ar: { headline: 'خطّط لمساحة *أحلامك*', subtitle: 'قِس الغرف وارسم المخططات واحسب تكلفة كل فكرة.' },
      },
      () => [...blueCopy(), blueShot({ width: 0.66, top: 0.33, x: 0.55 }), ...dimension(0.12, 0.33, 0.99)],
    ),
    slide(
      {
        en: { headline: 'Measure in *seconds*', subtitle: 'Point your camera and get exact room dimensions.' },
        ar: { headline: 'قياس في *ثوانٍ*', subtitle: 'وجّه الكاميرا لتحصل على أبعاد الغرفة بدقة.' },
      },
      () => [...blueCopy(), blueShot({ width: 0.66, top: 0.33, x: 0.45 }), ...dimension(0.88, 0.33, 0.99)],
    ),
    slide(
      {
        en: { headline: 'Budget every *detail*', subtitle: 'Materials, labor and timelines in one plan.' },
        ar: { headline: 'ميزانية لكل *تفصيل*', subtitle: 'المواد والعمالة والجداول الزمنية في خطة واحدة.' },
      },
      () => [ring({ name: 'Measure ring', x: 0.86, y: 0.34, size: 0.24, stroke: 0.004, color: '#ffffff', opacity: 0.7 }), ...blueCopy(), blueShot({ width: 0.5, top: 0.4, x: 0.7, slot: 'second' }), blueShot({ width: 0.5, top: 0.33, x: 0.32 })],
    ),
    slide(
      {
        en: { headline: 'Build with *confidence*', subtitle: 'Share plans with contractors and track progress.' },
        ar: { headline: 'ابنِ *بثقة*', subtitle: 'شارك المخططات مع المقاولين وتابع التقدّم.' },
      },
      () => [...blueCopy(), blueShot({ width: 0.66, top: 0.33, x: 0.55 }), ...dimension(0.12, 0.33, 0.99)],
    ),
  ],
});

export const GALLERY_SEEDS: Template[] = [lagoon, terminal, peony, blueprint].map((t) => ({ ...t, author: AUTHOR }));

describe.skipIf(process.env.WAJHA_GALLERY_SEED !== '1')('gallery seed templates', () => {
  it('builds valid, canonical templates distinct from the built-ins', () => {
    expect(BUILD_PROBLEMS).toEqual([]);
    const builtin = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
    for (const t of GALLERY_SEEDS) {
      expect(builtin.has(t.id), t.id).toBe(false);
      expect(validateTemplate(JSON.parse(JSON.stringify(t)))).toEqual(t);
    }
  });

  it('keeps every text box clear of every device', () => {
    const problems: string[] = [];
    for (const t of GALLERY_SEEDS) {
      t.slides.forEach((s, i) => {
        const els = s.layouts.tall.elements;
        for (const text of els.filter((e) => e.kind === 'text')) {
          for (const dev of els.filter((e) => e.kind === 'device')) {
            if (elementsOverlap(text, dev, 'tall', { effects: false, margin: 0.03 })) problems.push(`${t.id} slide ${i + 1}: ${text.id} touches ${dev.id}`);
          }
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('writes gallery/templates/<id>/template.json', () => {
    for (const t of GALLERY_SEEDS) {
      const dir = join(GALLERY, t.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'template.json'), `${JSON.stringify(t, null, 2)}\n`);
    }
  });
});

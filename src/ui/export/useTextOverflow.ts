/**
 * The export summary's text check (see textOverflow.ts), run in the browser:
 * once the fonts are ready, about 8 ms of layout per frame so a big project
 * never stalls the dialog, and only while the dialog shows its settings.
 * Results last for the dialog session: changing sizes or languages only
 * checks what is new.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ctx2D } from '../../engine';
import type { ExportJob } from '../../export/types';
import type { Project } from '../../model/types';
import { browserEnv, ensureFonts } from '../../runtime';
import { checkKey, overflowChecks, overflowingTexts, textOverflowRows, type OverflowCheck, type OverflowHits, type TextOverflowState } from './textOverflow';

/** Layout work per frame. */
const SLICE_MS = 8;

/** Results with the project content they were measured on (text layout depends on nothing else). */
interface Measured {
  slides: Project['slides'];
  families: Project['families'];
  languages: Project['languages'];
  hits: OverflowHits;
}

const NO_HITS: OverflowHits = new Map();

function hitsFor(measured: Measured | null, p: Project): OverflowHits {
  return measured && measured.slides === p.slides && measured.families === p.families && measured.languages === p.languages ? measured.hits : NO_HITS;
}

let measuring: Ctx2D | null = null;

/** Overflowing texts of one check; a check that cannot run counts as fitting (the summary only advises). */
function measure(project: Project, check: OverflowCheck): readonly string[] {
  try {
    measuring ??= browserEnv().createCanvas(1, 1).ctx;
    return overflowingTexts(measuring, project, check);
  } catch (err) {
    console.warn('[export] could not check the texts of a slide', err);
    return [];
  }
}

/** Texts of the plan's jobs that will not fit their line limit. Nothing runs until `enabled`. */
export function useTextOverflow(project: Project, jobs: readonly ExportJob[], enabled: boolean): TextOverflowState {
  const [measured, setMeasured] = useState<Measured | null>(null);
  const hits = hitsFor(measured, project);
  const checks = useMemo(() => overflowChecks(jobs), [jobs]);
  const missing = useMemo(() => checks.filter((c) => !hits.has(checkKey(c))), [checks, hits]);
  const rows = useMemo(() => textOverflowRows(project, checks, hits), [project, checks, hits]);
  const fonts = useRef<{ slides: Project['slides']; languages: Project['languages']; ready: Promise<unknown> } | null>(null);

  // One slice per run: its result re-renders, and the next run takes the next slice.
  useEffect(() => {
    if (!enabled || missing.length === 0) return;
    let cancelled = false;
    let f = fonts.current;
    if (!f || f.slides !== project.slides || f.languages !== project.languages) {
      // Measuring with a fallback font would report the wrong texts.
      f = { slides: project.slides, languages: project.languages, ready: ensureFonts(project).catch(() => undefined) };
      fonts.current = f;
    }
    const ready = f.ready;
    const slice = () => {
      if (cancelled) return;
      const next = new Map(hits);
      const start = performance.now();
      for (const check of missing) {
        next.set(checkKey(check), measure(project, check));
        if (performance.now() - start >= SLICE_MS) break;
      }
      setMeasured({ slides: project.slides, families: project.families, languages: project.languages, hits: next });
    };
    // Each slice starts after a paint: the dialog shows first (effects of a keyboard-opened
    // dialog run before its first frame), and back-to-back renders never starve the browser.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => void ready.then(slice), 0);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [enabled, project, missing, hits]);

  const pending = missing.length > 0;
  return useMemo(() => ({ rows, pending }), [rows, pending]);
}

import { memo, useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { AssetInfo, FamilyId, LangCode, Slide, Theme } from '../../../model/types';
import { isRtl } from '../../../model/catalog';
import { resolveLayout } from '../../../model/resolve';
import { renderToCanvas } from '../../../runtime';
import { useEditor } from '../../../store';
import { useRenderTick } from '../../shared/useRenderTick';
import { bitmapDpr, releaseBitmap } from './frame';
import { frames } from './frameScheduler';
import { emptyTextIds } from './hints';
import { registerPainter, setSnapshot } from './stageStore';

/** How far outside the stage viewport a slide still counts as visible (painted ahead of scrolling). */
const VISIBILITY_MARGIN = '0px 60% 0px 60%';

export interface SlideCanvasProps {
  slideId: string;
  /*
   * Repaint triggers. The painter reads the current project from the store
   * when it draws (so a drag can repaint synchronously); these props only
   * make React re-run it when something the picture depends on changed.
   */
  slide: Slide;
  slideIndex: number;
  slideCount: number;
  family: FamilyId;
  lang: LangCode;
  baseLang: LangCode;
  theme: Theme;
  familiesKey: string;
  assets: Record<string, AssetInfo>;
  /** Display size in CSS px. */
  width: number;
  height: number;
  dpr: number;
  /** Scroll container used as the visibility root. */
  root: Element | null;
  className?: string;
  style?: CSSProperties;
}

const sameInputs = (a: readonly unknown[] | null, b: readonly unknown[]) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * One slide of the stage: a canvas at display size x devicePixelRatio,
 * painted only while near the viewport and only when its inputs changed.
 * Each paint publishes a render snapshot (element boxes, missing
 * screenshots) for the overlay and hit-testing.
 */
export const SlideCanvas = memo(function SlideCanvas(props: SlideCanvasProps) {
  const { slideId, width, height, dpr, root } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useRenderTick();
  const latest = useRef({ width, height, dpr, tick });
  const visible = useRef(false);
  const last = useRef<unknown[] | null>(null);

  useLayoutEffect(() => {
    latest.current = { width, height, dpr, tick };
  });

  const paint = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || !visible.current) return;
    const state = useEditor.getState();
    const project = state.project;
    if (!project) return;
    const index = project.slides.findIndex((s) => s.id === slideId);
    if (index < 0) return;
    const slide = project.slides[index];
    const family = state.activeFamily;
    const lang = state.activeLang;
    const { width: w, height: h, dpr: ratio, tick: t } = latest.current;
    const k = bitmapDpr(w, h, ratio);
    const bw = Math.max(1, Math.round(w * k));
    const bh = Math.max(1, Math.round(h * k));
    const inputs = [slide, project.theme, lang, family, project.languages[0], project.families.join(','), project.assets, index, project.slides.length, bw, bh, t];
    if (sameInputs(last.current, inputs)) return;
    last.current = inputs;
    try {
      const result = renderToCanvas(canvas, { project, slideIndex: index, family, lang, width: bw, height: bh, placeholder: 'mock' });
      const layout = resolveLayout(project, slide, family);
      setSnapshot(slideId, {
        result,
        bitmapW: canvas.width,
        bitmapH: canvas.height,
        layout,
        family,
        emptyText: emptyTextIds(slide, layout, lang, project.languages[0] ?? lang),
        rtl: isRtl(lang),
      });
    } catch (err) {
      console.error(`[stage] slide ${index + 1} could not be drawn`, err);
    }
  }, [slideId]);

  useLayoutEffect(() => registerPainter(slideId, paint), [slideId, paint]);

  // Free the bitmap on unmount: WebKit keeps a detached canvas's pixels until a garbage collection.
  useLayoutEffect(() => {
    const canvas = ref.current;
    return () => {
      if (canvas) releaseBitmap(canvas);
      last.current = null;
    };
  }, []);

  // Visibility: paint once synchronously on mount when on screen (no blank first frame), then follow the observer.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (typeof IntersectionObserver === 'undefined') {
      visible.current = true;
      paint();
      return;
    }
    const rootRect = root?.getBoundingClientRect();
    const rect = canvas.getBoundingClientRect();
    if (!rootRect || (rect.right >= rootRect.left - rootRect.width * 0.6 && rect.left <= rootRect.right + rootRect.width * 0.6)) {
      visible.current = true;
      paint();
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        visible.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          frames.schedule(`paint:${slideId}`, paint);
        } else if (releaseBitmap(canvas)) {
          // Slides beyond the margin hold no pixels; the slide repaints when it comes back.
          last.current = null;
        }
      },
      { root, rootMargin: VISIBILITY_MARGIN },
    );
    io.observe(canvas);
    return () => io.disconnect();
  }, [root, slideId, paint]);

  const { slide, theme, lang, family, baseLang, familiesKey, assets, slideIndex, slideCount } = props;
  useLayoutEffect(() => {
    frames.schedule(`paint:${slideId}`, paint);
  }, [paint, slideId, slide, theme, lang, family, baseLang, familiesKey, assets, slideIndex, slideCount, width, height, dpr, tick]);

  useLayoutEffect(
    () => () => {
      frames.cancel(`paint:${slideId}`);
      setSnapshot(slideId, null);
      // A remount (StrictMode, a re-keyed frame) must paint again even with equal inputs.
      last.current = null;
    },
    [slideId],
  );

  return <canvas ref={ref} aria-hidden="true" className={props.className} style={{ width, height, ...props.style }} />;
});

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { FamilyId, LangCode, Project } from '../../model/types';
import type { RenderResult } from '../../engine/types';
import { renderToCanvas } from '../../runtime';
import { cx } from '../kit';
import { slideHeight } from './slideSize';
import { useRenderTick } from './useRenderTick';

export interface SlidePreviewProps {
  project: Project;
  slideIndex: number;
  family: FamilyId;
  lang: LangCode;
  /** CSS width in px; the height follows the family's canvas aspect. */
  width: number;
  placeholder?: 'mock' | 'empty';
  className?: string;
  style?: CSSProperties;
  /** Called after each paint with the engine's result (boxes, warnings). */
  onRendered?(result: RenderResult): void;
  /** Maximum device pixel ratio to render at (default 2). */
  maxDpr?: number;
}

/**
 * Read-only canvas preview of one slide. Paints only while on screen,
 * coalesces repaints into one animation frame, and repaints when images or
 * fonts finish loading.
 */
export function SlidePreview({ project, slideIndex, family, lang, width, placeholder = 'mock', className, style, onRendered, maxDpr = 2 }: SlidePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const tick = useRenderTick();
  const height = slideHeight(family, width);
  const onRenderedRef = useRef(onRendered);
  useLayoutEffect(() => {
    onRenderedRef.current = onRendered;
  });

  // Free the bitmap on unmount: WebKit keeps a detached canvas's pixels until a garbage collection.
  useEffect(() => {
    const canvas = ref.current;
    return () => {
      if (!canvas) return;
      canvas.width = 0;
      canvas.height = 0;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !visible || width <= 0) return;
    const frame = requestAnimationFrame(() => {
      const dpr = Math.min(maxDpr, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
      try {
        const result = renderToCanvas(canvas, {
          project,
          slideIndex,
          family,
          lang,
          width: Math.max(1, Math.round(width * dpr)),
          height: Math.max(1, Math.round(height * dpr)),
          placeholder,
        });
        onRenderedRef.current?.(result);
      } catch (err) {
        console.error('[SlidePreview] render failed', err);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [project, slideIndex, family, lang, width, height, placeholder, visible, tick, maxDpr]);

  return <canvas ref={ref} className={cx('block', className)} style={{ width, height, ...style }} aria-hidden="true" />;
}

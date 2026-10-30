import { memo, useEffect, useRef } from 'react';
import { FAMILIES } from '../../model/catalog';
import type { FamilyId, LangCode, Project } from '../../model/types';
import { cx } from '../kit';
import { SlidePreview } from '../shared/SlidePreview';
import { useElementWidth } from './hooks';
import { requestPreviewFonts } from './templates';

export interface SlideStripProps {
  project: Project;
  family: FamilyId;
  lang: LangCode;
  /** Slots in the row; slides beyond it are not shown, missing ones leave the row centred. */
  count?: number;
  /** Gap between slides in px. */
  gap?: number;
  className?: string;
  slideClassName?: string;
}

/**
 * A row of live slide previews that sizes itself to its container: each
 * slot keeps the family's aspect ratio in CSS (so nothing shifts before it
 * is measured) and the canvas renders at the measured width.
 */
export const SlideStrip = memo(function SlideStrip({ project, family, lang, count = 3, gap = 6, className, slideClassName }: SlideStripProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(slotRef);
  const design = FAMILIES[family].design;
  const shown = Math.max(1, Math.min(count, project.slides.length || 1));
  const slotWidth = `calc((100% - ${gap * (count - 1)}px) / ${count})`;
  // Corners in proportion to the slide, like the store listing renders them.
  const radius = Math.max(3, Math.round((width || 60) * 0.075));

  useEffect(() => requestPreviewFonts(project), [project]);

  return (
    <div className={cx('flex w-full justify-center', className)} style={{ gap }}>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          ref={i === 0 ? slotRef : undefined}
          className={cx('relative shrink-0 overflow-hidden bg-surface-3', slideClassName)}
          style={{ width: slotWidth, aspectRatio: `${design.width} / ${design.height}`, borderRadius: radius }}
        >
          {width > 0 && project.slides[i] && (
            <SlidePreview
              project={project}
              slideIndex={i}
              family={family}
              lang={lang}
              width={width}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      ))}
    </div>
  );
});

/**
 * Right-hand inspector: properties of the selected element, or the slide,
 * theme and project when nothing is selected. Every edit goes through store
 * actions; continuous controls are one undo step per interaction.
 */
import { memo, useCallback, useMemo } from 'react';
import { GalleryVerticalEnd, MousePointer2 } from 'lucide-react';
import type { FamilyId, SlideElement } from '../../../model/types';
import { selectActiveLayout, selectActiveSlideIndex, useEditor, type EditorState } from '../../../store';
import { EmptyState, ScrollArea } from '../../kit';
import { DevicePanel } from './DevicePanel';
import { ElementHeader } from './ElementHeader';
import { ImagePanel } from './ImagePanel';
import { ShapePanel } from './ShapePanel';
import { SlidePanel } from './SlidePanel';
import { useTargetElement, type Target } from './state';
import { TextPanel } from './TextPanel';

export function Inspector() {
  const hasProject = useEditor((s) => s.project !== null);
  const slideId = useEditor((s) => s.activeSlideId);
  const family = useEditor((s) => s.activeFamily);
  const selection = useEditor((s) => s.selection);
  const selectedExists = useEditor((s) => (s.selection ? (selectActiveLayout(s)?.elements.some((e) => e.id === s.selection) ?? false) : false));

  let body;
  if (!hasProject || !slideId) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState size="sm" icon={<MousePointer2 />} title="Nothing to inspect" description="Open a project to edit its slides." />
      </div>
    );
  } else if (selection && selectedExists) {
    // Keyed by element and family: switching remounts the panels, which also closes any running gesture.
    body = <ElementInspector key={`${slideId}:${family}:${selection}`} slideId={slideId} family={family} elementId={selection} />;
  } else {
    body = <SlideInspector key={`${slideId}:${family}`} slideId={slideId} family={family} />;
  }

  return (
    // The editor layout provides the landmark, width and border; this fills it.
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-panel text-text" data-qa="inspector">
      {body}
    </div>
  );
}

/* Element ------------------------------------------------------------------- */

const ElementInspector = memo(function ElementInspector({ slideId, family, elementId }: Target) {
  const target = useMemo<Target>(() => ({ slideId, family, elementId }), [slideId, family, elementId]);
  const el = useTargetElement(target);
  const order = useEditor(
    useCallback(
      (s: EditorState) => {
        const elements = selectActiveLayout(s)?.elements ?? [];
        return `${elements.findIndex((e) => e.id === elementId)}/${elements.length}`;
      },
      [elementId],
    ),
  );
  if (!el) return null;
  const [index, count] = order.split('/').map(Number);
  return (
    <>
      <ElementHeader el={el} target={target} index={index} count={count} />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-contain">
        <div className="flex flex-col pb-6">
          <ElementBody el={el} target={target} index={index} count={count} />
        </div>
      </ScrollArea>
    </>
  );
});

function ElementBody({ el, target, index, count }: { el: SlideElement; target: Target; index: number; count: number }) {
  switch (el.kind) {
    case 'text':
      return <TextPanel el={el} target={target} index={index} count={count} />;
    case 'device':
      return <DevicePanel el={el} target={target} index={index} count={count} />;
    case 'shape':
      return <ShapePanel el={el} target={target} index={index} count={count} />;
    case 'image':
      return <ImagePanel el={el} target={target} index={index} count={count} />;
  }
}

/* Slide --------------------------------------------------------------------- */

const SlideInspector = memo(function SlideInspector({ slideId, family }: { slideId: string; family: FamilyId }) {
  const position = useEditor((s) => selectActiveSlideIndex(s));
  const total = useEditor((s) => s.project?.slides.length ?? 0);
  return (
    <>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3">
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-text-2 [&_svg]:size-3.5">
          <GalleryVerticalEnd />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-ui font-semibold text-text">
          Slide {position + 1}
          <span className="ml-1.5 font-normal text-text-3 tabular-nums">of {total}</span>
        </h2>
      </header>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-contain">
        <div className="flex flex-col pb-6">
          <SlidePanel slideId={slideId} family={family} />
        </div>
      </ScrollArea>
    </>
  );
});

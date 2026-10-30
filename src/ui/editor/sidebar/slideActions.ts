/**
 * Slide commands shared by the slides list (buttons, context menu, keys).
 */
import { MAX_SLIDES, confirmDialog, useEditor } from '../../../store';
import { slideHasContent } from './labels';

/**
 * Deletes a slide, asking first when it holds texts or screenshots. The last
 * slide is never deleted. Resolves true when the slide was removed.
 */
export async function deleteSlideWithConfirm(slideId: string): Promise<boolean> {
  const p = useEditor.getState().project;
  if (!p || p.slides.length <= 1) return false;
  const index = p.slides.findIndex((s) => s.id === slideId);
  if (index < 0) return false;
  if (slideHasContent(p.slides[index])) {
    const ok = await confirmDialog({
      title: `Delete slide ${index + 1}?`,
      message: 'Its texts and screenshots go with it, in every language and device family. You can undo this.',
      confirmLabel: 'Delete slide',
      danger: true,
    });
    if (!ok) return false;
  }
  return useEditor.getState().deleteSlide(slideId);
}

/** Adds a slide right after `slideId` (with its design) and makes it active. */
export function addSlideAfter(slideId: string): string | null {
  const ed = useEditor.getState();
  if (!ed.project || ed.project.slides.length >= MAX_SLIDES) return null;
  ed.setActiveSlide(slideId);
  return useEditor.getState().addSlide();
}

/** Moves a slide one place up (-1) or down (+1). */
export function moveSlideBy(slideId: string, delta: -1 | 1): boolean {
  const p = useEditor.getState().project;
  if (!p) return false;
  const from = p.slides.findIndex((s) => s.id === slideId);
  if (from < 0) return false;
  return useEditor.getState().moveSlide(from, from + delta);
}

/**
 * Slide menus of the stage (header "…" and context menu) behave like the
 * slides list.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankProject } from '../../../model/defaults';
import { useApp, useEditor } from '../../../store';
import { slideEntries, type MenuAction } from './SlideMenus';

const ed = () => useEditor.getState();
const entry = (slideId: string, key: string) => slideEntries(slideId, 'iphone').find((e): e is MenuAction => e !== 'separator' && e.key === key)!;

beforeEach(() => {
  const p = blankProject('Menus', ['iphone'], ['en-US']);
  p.slides[1].texts['en-US'] = { headline: 'Breathe in calm', subtitle: '' };
  ed().openProject(p);
});

afterEach(() => {
  if (useApp.getState().confirmRequest) useApp.getState().resolveConfirm(false);
  ed().closeProject();
});

describe('Delete slide', () => {
  it('asks first when the slide has content, like the slides list', async () => {
    const slide = ed().project!.slides[1];
    entry(slide.id, 'delete-slide').run();
    expect(useApp.getState().confirmRequest?.title).toBe('Delete slide 2?');
    expect(ed().project!.slides).toHaveLength(3);
    useApp.getState().resolveConfirm(true);
    await Promise.resolve();
    expect(ed().project!.slides.map((s) => s.id)).not.toContain(slide.id);
  });

  it('keeps the slide when the user cancels', async () => {
    entry(ed().project!.slides[1].id, 'delete-slide').run();
    useApp.getState().resolveConfirm(false);
    await Promise.resolve();
    expect(ed().project!.slides).toHaveLength(3);
  });

  it('removes an empty slide at once', () => {
    const empty = ed().project!.slides[2];
    entry(empty.id, 'delete-slide').run();
    expect(useApp.getState().confirmRequest).toBeNull();
    expect(ed().project!.slides.map((s) => s.id)).not.toContain(empty.id);
  });
});

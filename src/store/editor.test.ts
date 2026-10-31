import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAMILIES } from '../model/catalog';
import { blankProject, defaultTheme } from '../model/defaults';
import { assetId, assetInfo, devices, texts } from '../model/fixtures.node';
import { projectFromTemplate } from '../model/instantiate';
import { resolveLayout } from '../model/resolve';
import type { DeviceElement, FamilyId, Project, SlideLayout, TextElement } from '../model/types';
import { validateProject } from '../model/validate';
import { builtinTemplate } from '../templates';
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  MAX_SLIDES,
  ZOOM_MAX,
  ZOOM_MIN,
  createEditorStore,
  selectActiveLayout,
  selectActiveSlide,
  selectActiveSlideIndex,
  selectSelectedElement,
  subscribeProject,
  type EditorStore,
} from './editor';

/** A project whose iPad layouts are derived (only iPhone is stored), with three assets. */
function fixtureProject(families: FamilyId[] = ['iphone', 'ipad']): Project {
  const p = blankProject('Test', families, ['en-US', 'ar-SA']);
  for (const s of p.slides) for (const f of families.slice(1)) delete s.layouts[f];
  p.assets = { [assetId(1)]: assetInfo(1), [assetId(2)]: assetInfo(2), [assetId(3)]: assetInfo(3, 1000, 500) };
  p.slides[0].texts['en-US'] = { headline: 'Hello', subtitle: 'World' };
  return p;
}

let store: EditorStore;
const s = () => store.getState();
const slide = (i = 0) => s().project!.slides[i];
const layoutOf = (i: number, f: FamilyId): SlideLayout => resolveLayout(s().project!, slide(i), f);
const deviceOf = (i: number, f: FamilyId = 'iphone') => devices(layoutOf(i, f))[0];
const headlineOf = (i: number, f: FamilyId = 'iphone') => texts(layoutOf(i, f)).find((t) => t.key === 'headline') as TextElement;

beforeEach(() => {
  store = createEditorStore();
  s().openProject(fixtureProject());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('opening and closing', () => {
  it('opens a frozen copy and resets the view', () => {
    const p = fixtureProject();
    const v = s().version;
    s().openProject(p);
    expect(s().project).toEqual(p);
    expect(s().project).not.toBe(p);
    expect(Object.isFrozen(s().project)).toBe(true);
    expect(Object.isFrozen(s().project!.slides[0].layouts.iphone!.elements[0])).toBe(true);
    expect(Object.isFrozen(p)).toBe(false);
    expect(s()).toMatchObject({ activeFamily: 'iphone', activeLang: 'en-US', activeSlideId: p.slides[0].id, selection: null, canUndo: false, canRedo: false, fit: true });
    expect(s().version).toBe(v + 1);
  });

  it('repairs a hand-made project', () => {
    s().openProject({ ...fixtureProject(), families: [], languages: ['bad code'], slides: [] });
    expect(s().project!.families).toEqual(['iphone']);
    expect(s().project!.languages).toEqual(['en-US']);
    expect(s().project!.slides).toHaveLength(1);
    s().openProject(null as unknown as Project);
    expect(s().project).not.toBeNull();
    s().openProject({ ...fixtureProject(), slides: [null, fixtureProject().slides[0]] as never });
    expect(s().project!.slides).toHaveLength(1);
  });

  it('closes and forgets history', () => {
    s().renameProject('Other');
    s().closeProject();
    expect(s()).toMatchObject({ project: null, activeSlideId: null, selection: null, canUndo: false });
    expect(s().undo()).toBe(false);
    expect(s().renameProject('x')).toBe(false);
  });
});

describe('project edits and history', () => {
  it('renames with validation, bumping updatedAt and version', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000_000_000);
    const before = s().project!;
    const v = s().version;
    expect(s().renameProject('  New name  ')).toBe(true);
    expect(s().project!.name).toBe('New name');
    expect(s().project!.updatedAt).toBe(2_000_000_000_000);
    expect(s().version).toBe(v + 1);
    expect(s().project!.slides).toBe(before.slides);
    expect(s().renameProject('   ')).toBe(false);
    expect(s().renameProject('New name')).toBe(false);
    expect(s().canUndo).toBe(true);
    expect(s().undo()).toBe(true);
    expect(s().project!.name).toBe('Test');
    expect(s().canRedo).toBe(true);
    expect(s().redo()).toBe(true);
    expect(s().project!.name).toBe('New name');
  });

  it('caps history at 200 steps', () => {
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) s().renameProject(`Name ${i}`);
    let undos = 0;
    while (s().undo()) undos++;
    expect(undos).toBe(HISTORY_LIMIT);
    expect(s().project!.name).toBe('Name 49');
  });

  it('drops the redo stack on a new change', () => {
    s().renameProject('A');
    s().undo();
    expect(s().canRedo).toBe(true);
    s().renameProject('B');
    expect(s().canRedo).toBe(false);
    expect(s().redo()).toBe(false);
  });

  it('makes a whole gesture one undo step, even nested', () => {
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().beginGesture();
    expect(s().inGesture).toBe(true);
    s().beginGesture();
    for (let i = 1; i <= 10; i++) s().updateElement(slide().id, 'iphone', id, { x: x0 + i / 100 });
    s().endGesture();
    expect(s().inGesture).toBe(true);
    s().endGesture();
    expect(s().inGesture).toBe(false);
    expect(deviceOf(0).x).toBeCloseTo(x0 + 0.1);
    expect(s().undo()).toBe(true);
    expect(deviceOf(0).x).toBeCloseTo(x0);
    expect(s().undo()).toBe(false);
  });

  it('records nothing for a gesture that changed nothing, and cancels cleanly', () => {
    s().beginGesture();
    s().endGesture();
    expect(s().canUndo).toBe(false);
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.1 });
    s().cancelGesture();
    expect(deviceOf(0).x).toBe(x0);
    expect(s().canUndo).toBe(false);
    expect(s().inGesture).toBe(false);
  });

  it('records no step for a gesture that ends where it began, and keeps the redo stack', () => {
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().renameProject('Renamed');
    s().undo();
    const before = s().project!;
    // A drag that comes back to its start, a fill scrub that returns to its value, an asset imported on the way.
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.2 });
    s().updateElement(slide().id, 'iphone', id, { x: x0 });
    s().setThemeBackground({ fill: { type: 'solid', color: '#123456' }, pattern: null });
    s().setThemeBackground(before.theme.background);
    s().addAssets([assetInfo(20)]);
    s().endGesture();
    expect(s()).toMatchObject({ inGesture: false, canUndo: false, canRedo: true });
    expect(s().project!.slides).toEqual(before.slides);
    expect(s().project!.theme).toEqual(before.theme);
    expect(s().project!.assets[assetId(20)]).toBeDefined();
    expect(s().undo()).toBe(false);
    expect(s().redo()).toBe(true);
    expect(s().project!.name).toBe('Renamed');
    expect(s().project!.assets[assetId(20)]).toBeDefined();
  });

  it('lets undo after a gesture that changed nothing undo the step before it', () => {
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().renameProject('Renamed');
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.2 });
    s().updateElement(slide().id, 'iphone', id, { x: x0 });
    s().endGesture();
    expect(s().undo()).toBe(true);
    expect(s().project!.name).toBe('Test');
    expect(s().canUndo).toBe(false);
    // Also when undo itself ends the gesture, mid-drag.
    s().renameProject('Again');
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.3 });
    s().updateElement(slide().id, 'iphone', id, { x: x0 });
    expect(s().undo()).toBe(true);
    expect(s()).toMatchObject({ inGesture: false, canUndo: false, canRedo: true });
    expect(s().project!.name).toBe('Test');
    expect(deviceOf(0).x).toBe(x0);
  });

  it('still records exactly one step for a gesture that changed something, and drops the redo stack', () => {
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().renameProject('Renamed');
    s().undo();
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.2 });
    s().updateElement(slide().id, 'iphone', id, { x: x0 });
    s().updateElement(slide().id, 'iphone', id, { x: 0.25 });
    s().addAssets([assetInfo(21)]);
    s().endGesture();
    expect(s()).toMatchObject({ canUndo: true, canRedo: false });
    expect(s().undo()).toBe(true);
    expect(deviceOf(0).x).toBe(x0);
    expect(s().project!.assets[assetId(21)]).toBeDefined();
    expect(s().undo()).toBe(false);
    expect(s().redo()).toBe(true);
    expect(deviceOf(0).x).toBe(0.25);
    expect(s().redo()).toBe(false);
  });

  it('counts a layout the gesture gave its family as a change, even when the element ends where it began', () => {
    const dev = devices(layoutOf(0, 'ipad'))[0];
    expect(slide().layouts.ipad).toBeUndefined();
    s().beginGesture();
    s().updateElement(slide().id, 'ipad', dev.id, { x: 0.4 });
    s().updateElement(slide().id, 'ipad', dev.id, { x: dev.x });
    s().endGesture();
    // iPad no longer follows the primary family: undo makes it follow again.
    expect(slide().layouts.ipad).toBeDefined();
    expect(s().canUndo).toBe(true);
    s().undo();
    expect(slide().layouts.ipad).toBeUndefined();
  });

  it('commits a running gesture when undo is pressed mid-drag', () => {
    const id = deviceOf(0).id;
    const x0 = deviceOf(0).x;
    s().beginGesture();
    s().updateElement(slide().id, 'iphone', id, { x: 0.2 });
    expect(s().undo()).toBe(true);
    expect(deviceOf(0).x).toBe(x0);
    expect(s().inGesture).toBe(false);
    expect(s().redo()).toBe(true);
    expect(deviceOf(0).x).toBe(0.2);
  });

  it('coalesces typing in one field within 800 ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const id = slide().id;
    s().setText(id, 'headline', 'en-US', 'H');
    vi.advanceTimersByTime(300);
    s().setText(id, 'headline', 'en-US', 'He');
    vi.advanceTimersByTime(700);
    s().setText(id, 'headline', 'en-US', 'Hel');
    // Another field starts a new step.
    s().setText(id, 'subtitle', 'en-US', 'S');
    vi.advanceTimersByTime(COALESCE_MS + 1);
    s().setText(id, 'subtitle', 'en-US', 'Su');
    expect(slide().texts['en-US']).toMatchObject({ headline: 'Hel', subtitle: 'Su' });
    s().undo();
    expect(slide().texts['en-US'].subtitle).toBe('S');
    s().undo();
    expect(slide().texts['en-US'].subtitle).toBe('World');
    s().undo();
    expect(slide().texts['en-US'].headline).toBe('Hello');
    expect(s().canUndo).toBe(false);
  });

  it('does not coalesce typing across an undo or another edit', () => {
    vi.useFakeTimers();
    const id = slide().id;
    s().setText(id, 'headline', 'en-US', 'A');
    s().renameProject('Between');
    s().setText(id, 'headline', 'en-US', 'AB');
    s().undo();
    expect(slide().texts['en-US'].headline).toBe('A');
    s().setText(id, 'headline', 'en-US', 'AC');
    s().undo();
    expect(slide().texts['en-US'].headline).toBe('A');
  });

  it('bumps the version on every change and notifies project subscribers only for project changes', () => {
    const calls: [Project | null, Project | null][] = [];
    const off = subscribeProject((p, prev) => calls.push([p, prev]), store);
    const v = s().version;
    s().setZoom(2);
    s().setLeftTab('layers');
    expect(calls).toHaveLength(0);
    s().renameProject('Z');
    s().undo();
    expect(calls).toHaveLength(2);
    expect(calls[0][0]!.name).toBe('Z');
    expect(s().version).toBe(v + 2);
    off();
    s().redo();
    expect(calls).toHaveLength(2);
  });
});

describe('view state', () => {
  it('switches family, language and slide only to valid values', () => {
    expect(s().setActiveFamily('mac')).toBe(false);
    expect(s().setActiveFamily('ipad')).toBe(true);
    expect(s().activeFamily).toBe('ipad');
    expect(s().setActiveLang('fr-FR')).toBe(false);
    expect(s().setActiveLang('ar-SA')).toBe(true);
    expect(s().setActiveSlide('nope')).toBe(false);
    expect(s().setActiveSlide(slide(2).id)).toBe(true);
    expect(selectActiveSlideIndex(s())).toBe(2);
  });

  it('keeps the selection across families (adapted layouts keep ids) and clears it on slide switch', () => {
    const id = headlineOf(0).id;
    expect(s().select(id)).toBe(true);
    s().setActiveFamily('ipad');
    expect(s().selection).toBe(id);
    expect(selectSelectedElement(s())?.id).toBe(id);
    s().setActiveSlide(slide(1).id);
    expect(s().selection).toBeNull();
  });

  it('clears the selection when the other family has no such element', () => {
    const sid = slide().id;
    // iPad gets its own stored layout first, so the new shape exists only on iPhone.
    s().updateElement(sid, 'ipad', devices(layoutOf(0, 'ipad'))[0].id, { x: 0.4 });
    const shape = s().addElement(sid, 'iphone', 'shape')!;
    expect(s().selection).toBe(shape);
    s().setActiveFamily('ipad');
    expect(s().selection).toBeNull();
  });

  it('selects in another slide, rejects unknown elements, tracks hover', () => {
    const other = headlineOf(1).id;
    expect(s().select(other, slide(1).id)).toBe(true);
    expect(s().activeSlideId).toBe(slide(1).id);
    expect(s().select('missing')).toBe(false);
    expect(s().selection).toBe(other);
    s().hover(other);
    expect(s().hoverId).toBe(other);
    s().hover('missing');
    expect(s().hoverId).toBe(other);
    s().hover(null);
    expect(s().hoverId).toBeNull();
    expect(s().select(null)).toBe(true);
    expect(s().selection).toBeNull();
  });

  it('clamps zoom and steps through levels', () => {
    s().setZoom(100);
    expect(s().zoom).toBe(ZOOM_MAX);
    expect(s().fit).toBe(false);
    s().setZoom(0.0001, true);
    expect(s().zoom).toBe(ZOOM_MIN);
    expect(s().fit).toBe(true);
    s().setZoom(NaN);
    expect(s().zoom).toBe(ZOOM_MIN);
    s().setZoom(1);
    s().zoomIn();
    expect(s().zoom).toBe(1.25);
    s().zoomOut();
    s().zoomOut();
    expect(s().zoom).toBe(0.75);
    s().setZoom(ZOOM_MAX);
    s().zoomIn();
    expect(s().zoom).toBe(ZOOM_MAX);
    s().setZoom(ZOOM_MIN);
    s().zoomOut();
    expect(s().zoom).toBe(ZOOM_MIN);
    s().setFit(true);
    expect(s().fit).toBe(true);
    s().setLeftTab('layers');
    expect(s().leftTab).toBe('layers');
    s().setLeftTab('nope' as never);
    expect(s().leftTab).toBe('layers');
  });
});

describe('slides', () => {
  it('adds a slide after the active one with its design, fresh ids and empty texts', () => {
    s().setActiveSlide(slide(0).id);
    const id = s().addSlide()!;
    expect(id).toBeTruthy();
    expect(s().project!.slides).toHaveLength(4);
    expect(slide(1).id).toBe(id);
    expect(s().activeSlideId).toBe(id);
    const src = slide(0).layouts.iphone!;
    const copy = slide(1).layouts.iphone!;
    expect(copy.elements.map(({ id: _i, ...r }) => r)).toEqual(src.elements.map(({ id: _i, ...r }) => r));
    expect(copy.elements.map((e) => e.id)).not.toEqual(src.elements.map((e) => e.id));
    // The derived family stays derived, and derives the same design.
    expect(slide(1).layouts.ipad).toBeUndefined();
    expect(layoutOf(1, 'ipad').elements.map((e) => e.id)).toEqual(copy.elements.map((e) => e.id));
    expect(slide(1).texts).toEqual({ 'en-US': { headline: '', subtitle: '' }, 'ar-SA': { headline: '', subtitle: '' } });
    expect(slide(1).shots).toEqual({});
  });

  it('stops at the slide cap', () => {
    for (let i = 0; i < 40; i++) s().addSlide();
    expect(s().project!.slides).toHaveLength(MAX_SLIDES);
    expect(s().addSlide()).toBeNull();
  });

  it('duplicates a slide with its texts and screenshots', () => {
    s().setShot(slide(0).id, 'iphone', 'main', 'en-US', assetId(1));
    const id = s().duplicateSlide(slide(0).id)!;
    expect(slide(1).id).toBe(id);
    expect(slide(1).texts).toEqual(slide(0).texts);
    expect(slide(1).shots).toEqual(slide(0).shots);
    expect(deviceOf(1).id).not.toBe(deviceOf(0).id);
    expect(s().duplicateSlide('nope')).toBeNull();
  });

  it('deletes slides but never the last one, moving the active slide to a neighbour', () => {
    s().setActiveSlide(slide(1).id);
    s().select(headlineOf(1).id);
    const third = slide(2).id;
    expect(s().deleteSlide(slide(1).id)).toBe(true);
    expect(s().activeSlideId).toBe(third);
    expect(s().selection).toBeNull();
    s().deleteSlide(slide(0).id);
    expect(s().deleteSlide(slide(0).id)).toBe(false);
    expect(s().project!.slides).toHaveLength(1);
    s().undo();
    expect(s().project!.slides).toHaveLength(2);
  });

  it('moves slides and ignores invalid moves', () => {
    const ids = s().project!.slides.map((x) => x.id);
    expect(s().moveSlide(0, 2)).toBe(true);
    expect(s().project!.slides.map((x) => x.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(s().moveSlide(1, 1)).toBe(false);
    expect(s().moveSlide(-1, 0)).toBe(false);
    expect(s().moveSlide(9, 0)).toBe(false);
    expect(s().moveSlide(0.5, 0)).toBe(false);
    expect(s().moveSlide(0, 99)).toBe(true);
    expect(s().project!.slides[2].id).toBe(ids[1]);
  });
});

describe('elements', () => {
  it('materialises a derived layout on first edit and leaves the primary alone', () => {
    const before = slide(0).layouts.iphone;
    expect(slide(0).layouts.ipad).toBeUndefined();
    const derived = layoutOf(0, 'ipad');
    const dev = devices(derived)[0];
    expect(s().updateElement(slide(0).id, 'ipad', dev.id, { x: 0.4 })).toBe(true);
    const stored = slide(0).layouts.ipad!;
    expect(stored).toBeDefined();
    expect(devices(stored)[0].x).toBe(0.4);
    expect(stored.elements.map((e) => e.id)).toEqual(derived.elements.map((e) => e.id));
    expect(slide(0).layouts.iphone).toBe(before);
    // Editing the primary no longer moves the stored iPad layout.
    s().updateElement(slide(0).id, 'iphone', deviceOf(0).id, { x: 0.3 });
    expect(devices(slide(0).layouts.ipad!)[0].x).toBe(0.4);
  });

  it('lets a template project follow the primary family until a family is edited', () => {
    // Glass Prism designs tall, tablet and wide canvases: Android phone shares the iPhone's shape.
    s().openProject(projectFromTemplate(builtinTemplate('glass-prism')!, { name: 'T', families: ['iphone', 'android-phone', 'ipad'], languages: ['en-US'] }));
    const sid = slide(0).id;
    expect(slide(0).layouts['android-phone']).toBeUndefined();
    const ipadBefore = slide(0).layouts.ipad!;
    s().updateElement(sid, 'iphone', deviceOf(0).id, { x: 0.3 });
    // Android follows the edit; the template's own iPad design stays as it was.
    expect(deviceOf(0, 'android-phone').x).toBe(0.3);
    expect(slide(0).layouts.ipad).toBe(ipadBefore);
    // Once Android is edited it keeps its own layout, and resetting makes it follow again.
    s().updateElement(sid, 'android-phone', deviceOf(0, 'android-phone').id, { x: 0.6 });
    s().updateElement(sid, 'iphone', deviceOf(0).id, { x: 0.35 });
    expect(deviceOf(0, 'android-phone').x).toBe(0.6);
    expect(s().resetLayout(sid, 'android-phone')).toBe(true);
    expect(deviceOf(0, 'android-phone').x).toBe(0.35);
  });

  it('keeps the primary as the source when a slide had no stored layout at all', () => {
    s().openProject({ ...fixtureProject(), slides: [{ id: 'bare', texts: {}, shots: {}, layouts: {} }] });
    const dev = devices(layoutOf(0, 'ipad'))[0];
    s().updateElement('bare', 'ipad', dev.id, { x: 0.45 });
    expect(slide(0).layouts.iphone).toBeDefined();
    expect(slide(0).layouts.ipad).toBeDefined();
  });

  it('merges style patches, validates and clamps, keeps id and kind', () => {
    const h = headlineOf(0);
    expect(s().updateElement(slide().id, 'iphone', h.id, { style: { color: '#FF0000', size: 9 } })).toBe(true);
    const after = headlineOf(0);
    expect(after.style.color).toBe('#ff0000');
    expect(after.style.size).toBe(1);
    expect(after.style.weight).toBe(h.style.weight);
    expect(s().updateElement(slide().id, 'iphone', h.id, { style: { color: 'blue' } })).toBe(false);
    expect(s().updateElement(slide().id, 'iphone', h.id, { valign: 'sideways' as never })).toBe(false);
    expect(s().updateElement(slide().id, 'iphone', h.id, { id: 'hack', kind: 'device' } as never)).toBe(false);
    expect(headlineOf(0).id).toBe(h.id);
    // Non-finite numbers are ignored, the rest applies.
    expect(s().updateElement(slide().id, 'iphone', h.id, { x: NaN, y: 0.2 })).toBe(true);
    expect(headlineOf(0)).toMatchObject({ x: h.x, y: 0.2 });
    expect(s().updateElement(slide().id, 'iphone', h.id, { x: 99 })).toBe(true);
    expect(headlineOf(0).x).toBe(3);
  });

  it('records no step for a patch that changes nothing', () => {
    const d = deviceOf(0);
    expect(s().updateElement(slide().id, 'iphone', d.id, { x: d.x })).toBe(false);
    expect(s().updateElement(slide().id, 'iphone', 'missing', { x: 0.1 })).toBe(false);
    expect(s().updateElement('missing', 'iphone', d.id, { x: 0.1 })).toBe(false);
    expect(s().updateElement(slide().id, 'toaster' as FamilyId, d.id, { x: 0.1 })).toBe(false);
    expect(s().canUndo).toBe(false);
    // No-op edits never materialise a derived layout either.
    s().updateElement(slide().id, 'ipad', devices(layoutOf(0, 'ipad'))[0].id, { x: devices(layoutOf(0, 'ipad'))[0].x });
    expect(slide().layouts.ipad).toBeUndefined();
  });

  it('adds every kind of element with unique keys and slots, and selects it', () => {
    const sid = slide().id;
    const t1 = s().addElement(sid, 'iphone', 'text')!;
    const t2 = s().addElement(sid, 'iphone', 'text', { text: 'Hi' })!;
    const keys = texts(layoutOf(0, 'iphone')).map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('caption');
    expect(keys).toContain('caption2');
    const t2el = layoutOf(0, 'iphone').elements.find((e) => e.id === t2) as TextElement;
    expect(slide().texts['en-US'][t2el.key]).toBe('Hi');
    expect(s().selection).toBe(t2);
    expect(t1).not.toBe(t2);

    const d2 = s().addElement(sid, 'iphone', 'device')!;
    const slots = devices(layoutOf(0, 'iphone')).map((d) => d.slot);
    expect(slots).toEqual(['main', 'device2']);
    expect(d2).toBeTruthy();

    expect(s().addElement(sid, 'iphone', 'shape', { shape: 'ring', patch: { x: 0.2, y: 0.3 } })).toBeTruthy();
    expect(layoutOf(0, 'iphone').elements.at(-1)).toMatchObject({ kind: 'shape', shape: 'ring', x: 0.2, y: 0.3 });
    expect(s().addElement(sid, 'iphone', 'image', { assetId: assetId(3) })).toBeTruthy();
    expect(layoutOf(0, 'iphone').elements.at(-1)).toMatchObject({ kind: 'image', assetId: assetId(3) });
    expect(s().addElement(sid, 'iphone', 'image', { assetId: assetId(99) })).toBeNull();
    expect(s().addElement(sid, 'iphone', 'video' as never)).toBeNull();
    // A headline added to another family reuses the shared headline text key.
    const h = s().addElement(slide(1).id, 'iphone', 'text', { role: 'headline' });
    expect(h).toBeTruthy();
  });

  it('deletes elements and clears the selection', () => {
    const id = headlineOf(0).id;
    s().select(id);
    expect(s().deleteElement(slide().id, 'iphone', id)).toBe(true);
    expect(layoutOf(0, 'iphone').elements.some((e) => e.id === id)).toBe(false);
    expect(s().selection).toBeNull();
    expect(s().deleteElement(slide().id, 'iphone', id)).toBe(false);
    s().undo();
    expect(layoutOf(0, 'iphone').elements.some((e) => e.id === id)).toBe(true);
    // Selection does not come back by itself after undo.
    expect(s().selection).toBeNull();
  });

  it('clears the selection when undo removes the selected element', () => {
    const id = s().addElement(slide().id, 'iphone', 'shape')!;
    expect(s().selection).toBe(id);
    s().undo();
    expect(s().selection).toBeNull();
  });

  it('duplicates with an offset, its own text key and its own screenshot slot', () => {
    const sid = slide().id;
    const h = headlineOf(0);
    const copyId = s().duplicateElement(sid, 'iphone', h.id)!;
    const copy = layoutOf(0, 'iphone').elements.find((e) => e.id === copyId) as TextElement;
    expect(copy.key).not.toBe('headline');
    expect(copy.x).toBeCloseTo(h.x + 0.02);
    expect(slide().texts['en-US'][copy.key]).toBe('Hello');
    expect(s().selection).toBe(copyId);
    const order = layoutOf(0, 'iphone').elements.map((e) => e.id);
    expect(order.indexOf(copyId)).toBe(order.indexOf(h.id) + 1);

    s().setShot(sid, 'iphone', 'main', 'en-US', assetId(1));
    const dcopy = s().duplicateElement(sid, 'iphone', deviceOf(0).id)!;
    const dev = layoutOf(0, 'iphone').elements.find((e) => e.id === dcopy) as DeviceElement;
    expect(dev.slot).not.toBe('main');
    expect(slide().shots.iphone![dev.slot]).toEqual({ 'en-US': assetId(1) });
  });

  it('reorders in painter order', () => {
    const sid = slide().id;
    const [a, b, c] = layoutOf(0, 'iphone').elements.map((e) => e.id);
    expect(s().bringToFront(sid, 'iphone', a)).toBe(true);
    expect(layoutOf(0, 'iphone').elements.map((e) => e.id)).toEqual([b, c, a]);
    expect(s().bringToFront(sid, 'iphone', a)).toBe(false);
    expect(s().sendToBack(sid, 'iphone', a)).toBe(true);
    expect(s().bringForward(sid, 'iphone', a)).toBe(true);
    expect(layoutOf(0, 'iphone').elements.map((e) => e.id)).toEqual([b, a, c]);
    expect(s().sendBackward(sid, 'iphone', a)).toBe(true);
    expect(s().sendBackward(sid, 'iphone', a)).toBe(false);
    expect(s().reorderElement(sid, 'iphone', a, 99)).toBe(true);
    expect(layoutOf(0, 'iphone').elements.map((e) => e.id)).toEqual([b, c, a]);
    expect(s().reorderElement(sid, 'iphone', a, NaN)).toBe(false);
  });

  it('toggles hidden and locked; nudging respects locks and coalesces', () => {
    vi.useFakeTimers();
    const sid = slide().id;
    const d = deviceOf(0);
    expect(s().toggleHidden(sid, 'iphone', d.id)).toBe(true);
    expect(deviceOf(0).hidden).toBe(true);
    expect(s().toggleHidden(sid, 'iphone', d.id)).toBe(true);
    expect(deviceOf(0).hidden).toBeUndefined();
    s().select(d.id);
    const w = FAMILIES.iphone.design.width;
    expect(s().nudge(10, 0)).toBe(true);
    expect(s().nudge(10, 0)).toBe(true);
    expect(deviceOf(0).x).toBeCloseTo(d.x + 20 / w);
    s().undo();
    expect(deviceOf(0).x).toBeCloseTo(d.x);
    expect(s().nudge(0, 0)).toBe(false);
    expect(s().nudge(NaN, 1)).toBe(false);
    s().toggleLocked(sid, 'iphone', d.id);
    expect(deviceOf(0).locked).toBe(true);
    expect(s().nudge(1, 1)).toBe(false);
    // Locked elements can still be edited from the inspector.
    expect(s().updateElement(sid, 'iphone', d.id, { opacity: 0.5 })).toBe(true);
  });

  it('resets a non-primary family layout so it derives again', () => {
    const sid = slide().id;
    s().updateElement(sid, 'ipad', devices(layoutOf(0, 'ipad'))[0].id, { x: 0.1 });
    expect(slide().layouts.ipad).toBeDefined();
    expect(s().resetLayout(sid, 'ipad')).toBe(true);
    expect(slide().layouts.ipad).toBeUndefined();
    expect(s().resetLayout(sid, 'iphone')).toBe(false);
    expect(s().resetLayout(sid, 'ipad')).toBe(false);
  });
});

describe('clipboard', () => {
  it('copies and pastes with a new id, an offset and the text', () => {
    const h = headlineOf(0);
    s().select(h.id);
    expect(s().copySelection()).toBe(true);
    expect(Object.isFrozen(s().clipboard)).toBe(true);
    const pasted = s().paste()!;
    const el = layoutOf(0, 'iphone').elements.find((e) => e.id === pasted) as TextElement;
    expect(el.id).not.toBe(h.id);
    expect(el.x).toBeCloseTo(h.x + 0.02);
    expect(el.key).not.toBe(h.key);
    expect(slide().texts['en-US'][el.key]).toBe('Hello');
    expect(s().selection).toBe(pasted);
  });

  it('pastes into another slide and family, and across projects only with the assets', () => {
    s().select(deviceOf(0).id);
    s().setShot(slide().id, 'iphone', 'main', 'ar-SA', assetId(2));
    s().copySelection();
    s().setActiveSlide(slide(2).id);
    s().setActiveFamily('ipad');
    const pasted = s().paste()!;
    const dev = layoutOf(2, 'ipad').elements.find((e) => e.id === pasted) as DeviceElement;
    expect(dev.kind).toBe('device');
    expect(slide(2).shots.ipad![dev.slot]).toEqual({ 'ar-SA': assetId(2) });

    const img = s().addElement(slide(2).id, 'ipad', 'image', { assetId: assetId(1) })!;
    s().select(img);
    s().copySelection();
    s().openProject({ ...fixtureProject(), assets: {} });
    expect(s().paste()).toBeNull();
    s().openProject(fixtureProject());
    expect(s().paste()).toBeTruthy();
  });

  it('cuts the selection', () => {
    const id = headlineOf(0).id;
    s().select(id);
    expect(s().cutSelection()).toBe(true);
    expect(layoutOf(0, 'iphone').elements.some((e) => e.id === id)).toBe(false);
    expect(s().clipboard?.element.id).toBe(id);
    expect(s().copySelection()).toBe(false);
  });
});

describe('texts and screenshots', () => {
  it('sets texts with validation', () => {
    const sid = slide().id;
    expect(s().setText(sid, 'headline', 'ar-SA', 'مرحبا')).toBe(true);
    expect(slide().texts['ar-SA'].headline).toBe('مرحبا');
    expect(s().setText(sid, 'headline', 'fr-FR', 'x')).toBe(false);
    expect(s().setText(sid, '__proto__', 'en-US', 'x')).toBe(false);
    // Inherited member names would shadow Object.prototype on the texts object (and dodge the key limit).
    expect(s().setText(sid, 'valueOf', 'en-US', 'x')).toBe(false);
    expect(s().setText(sid, 'toString', 'en-US', 'x')).toBe(false);
    expect(s().setShot(sid, 'iphone', 'hasOwnProperty', 'en-US', assetId(1))).toBe(false);
    expect(s().setText('missing', 'headline', 'en-US', 'x')).toBe(false);
    expect(s().setText(sid, 'headline', 'en-US', 'Hello')).toBe(false);
    expect(s().setText(sid, 'headline', 'en-US', 'x'.repeat(5000))).toBe(true);
    expect(slide().texts['en-US'].headline).toHaveLength(2000);
    expect(s().setText(sid, 'headline', 'en-US', '')).toBe(true);
    expect(slide().texts['en-US'].headline).toBe('');
  });

  it('replaces texts in bulk as one step, adding languages', () => {
    const [a, b] = [slide(0).id, slide(1).id];
    const n = s().replaceTexts({
      [a]: { 'en-US': { headline: 'A', subtitle: 'a' }, 'de-DE': { headline: 'Ä' } },
      [b]: { 'ar-SA': { headline: 'ب' } },
      missing: { 'en-US': { headline: 'x' } },
    });
    expect(n).toBe(2);
    expect(s().project!.languages).toEqual(['en-US', 'ar-SA', 'de-DE']);
    expect(slide(0).texts['de-DE']).toEqual({ headline: 'Ä' });
    expect(slide(0).texts['ar-SA']).toEqual({ headline: '', subtitle: '' });
    expect(slide(1).texts['ar-SA']).toEqual({ headline: 'ب' });
    s().undo();
    expect(s().project!.languages).toEqual(['en-US', 'ar-SA']);
    expect(slide(0).texts['en-US'].headline).toBe('Hello');
    expect(s().replaceTexts({ [a]: { 'fr-FR': { headline: 'F' } } }, { addLanguages: false })).toBe(0);
    expect(s().replaceTexts({ [a]: 'garbage' as never })).toBe(0);
  });

  it('assigns and clears screenshots', () => {
    const sid = slide().id;
    expect(s().setShot(sid, 'iphone', 'main', 'en-US', assetId(1))).toBe(true);
    expect(slide().shots).toEqual({ iphone: { main: { 'en-US': assetId(1) } } });
    expect(s().setShot(sid, 'iphone', 'main', 'en-US', assetId(1))).toBe(false);
    expect(s().setShot(sid, 'iphone', 'main', 'en-US', assetId(42))).toBe(false);
    expect(s().setShot(sid, 'iphone', 'main', 'xx-YY', assetId(1))).toBe(false);
    expect(s().setShot(sid, 'iphone', 'main', 'en-US', null)).toBe(true);
    expect(slide().shots).toEqual({});
    expect(s().setShot(sid, 'iphone', 'main', 'en-US', null)).toBe(false);
  });

  it('registers assets outside history so they survive undo', () => {
    s().renameProject('Before');
    expect(s().addAssets([assetInfo(10), assetInfo(10), { id: 'bad' } as never, { ...assetInfo(11), width: 'x' } as never])).toBe(1);
    expect(s().project!.assets[assetId(10)]).toBeDefined();
    expect(s().addAssets([assetInfo(10)])).toBe(0);
    s().setShot(slide().id, 'iphone', 'main', 'en-US', assetId(10));
    s().undo();
    s().undo();
    expect(s().project!.name).toBe('Test');
    expect(s().project!.assets[assetId(10)]).toBeDefined();
    s().redo();
    expect(slide().shots.iphone).toBeUndefined();
    s().redo();
    expect(slide().shots.iphone!.main['en-US']).toBe(assetId(10));
  });

  it('assigns screenshots in order, creating slides up to the store limit', () => {
    s().enableFamily('android-phone');
    const ids = Array.from({ length: 12 }, (_, i) => assetId(100 + i));
    s().addAssets(ids.map((_, i) => assetInfo(100 + i)));
    const n = s().assignShotsInOrder('android-phone', 'en-US', ids, 1);
    expect(n).toBe(FAMILIES['android-phone'].maxSlides - 1);
    expect(s().project!.slides).toHaveLength(FAMILIES['android-phone'].maxSlides);
    for (let i = 1; i < 8; i++) {
      const slot = devices(layoutOf(i, 'android-phone'))[0].slot;
      expect(slide(i).shots['android-phone']![slot]['en-US']).toBe(ids[i - 1]);
    }
    expect(slide(0).shots['android-phone']).toBeUndefined();
    expect(s().activeSlideId).toBe(slide(1).id);
    // One undo step for the whole drop.
    s().undo();
    expect(s().project!.slides).toHaveLength(3);
    expect(s().assignShotsInOrder('mac', 'en-US', ids, 0)).toBe(0);
    expect(s().assignShotsInOrder('iphone', 'en-US', [assetId(999)], 0)).toBe(0);
  });

  it('skips slides without a device when assigning in order', () => {
    const sid = slide(1).id;
    s().deleteElement(sid, 'iphone', deviceOf(1).id);
    s().addAssets([assetInfo(50), assetInfo(51)]);
    expect(s().assignShotsInOrder('iphone', 'en-US', [assetId(50), assetId(51)], 0)).toBe(2);
    expect(slide(0).shots.iphone!.main['en-US']).toBe(assetId(50));
    expect(slide(1).shots.iphone).toBeUndefined();
    expect(slide(2).shots.iphone!.main['en-US']).toBe(assetId(51));
  });
});

describe('theme and backgrounds', () => {
  const solid = (color: string) => ({ fill: { type: 'solid' as const, color }, pattern: null });

  it('sets per-slide backgrounds per family, materialising the layout', () => {
    const sid = slide().id;
    expect(s().setSlideBackground(sid, 'ipad', solid('#112233'))).toBe(true);
    expect(slide().layouts.ipad!.background).toEqual(solid('#112233'));
    expect(slide().layouts.iphone!.background).toBeNull();
    expect(s().setSlideBackground(sid, 'ipad', solid('#112233'))).toBe(false);
    expect(s().setSlideBackground(sid, 'ipad', solid('nope'))).toBe(false);
    const dangling = { fill: { type: 'image' as const, assetId: assetId(77), fit: 'cover' as const, opacity: 1, blur: 0, tint: null }, pattern: null };
    expect(s().setSlideBackground(sid, 'ipad', dangling)).toBe(false);
    expect(s().setSlideBackground(sid, 'ipad', null)).toBe(true);
    expect(slide().layouts.ipad!.background).toBeNull();
  });

  it('edits the theme', () => {
    expect(s().setThemeBackground(solid('#ABCDEF'))).toBe(true);
    expect(s().project!.theme.background).toEqual(solid('#abcdef'));
    expect(s().setThemeBackground(solid('#abcdef'))).toBe(false);
    expect(s().setPanorama(true)).toBe(true);
    expect(s().setPanorama(true)).toBe(false);
    expect(s().setMockDark(true)).toBe(true);
    expect(s().setPalette(['#FFF', '#000000', '#000000'])).toBe(true);
    expect(s().project!.theme.palette).toEqual(['#ffffff', '#000000']);
    expect(s().setPalette(['#fff', 'red'])).toBe(false);
    expect(s().project!.theme).toMatchObject({ panorama: true, mockDark: true });
  });

  it('applies fonts to every text element in every family', () => {
    s().updateElement(slide(1).id, 'ipad', headlineOf(1, 'ipad').id, { x: 0.45 });
    const sid = slide(0).id;
    s().addElement(sid, 'iphone', 'text');
    expect(s().applyFonts('Fraunces Variable', 'DM Sans Variable')).toBe(true);
    expect(s().project!.theme.fonts).toEqual({ heading: 'Fraunces Variable', body: 'DM Sans Variable' });
    for (let i = 0; i < 3; i++) {
      for (const f of ['iphone', 'ipad'] as const) {
        for (const t of texts(layoutOf(i, f))) expect(t.style.font).toBe(t.key === 'headline' ? 'Fraunces Variable' : 'DM Sans Variable');
      }
    }
    expect(s().applyFonts('Fraunces Variable', 'DM Sans Variable')).toBe(false);
    s().undo();
    expect(headlineOf(0).style.font).toBe('Inter Variable');
  });
});

describe('languages and families', () => {
  it('adds and removes languages with their texts and screenshots', () => {
    expect(s().addLanguage('de-DE')).toBe(true);
    expect(s().addLanguage('de-DE')).toBe(false);
    expect(s().addLanguage('Deutsch')).toBe(false);
    expect(slide().texts['de-DE']).toBeUndefined();
    s().setShot(slide().id, 'iphone', 'main', 'ar-SA', assetId(1));
    s().setText(slide().id, 'headline', 'ar-SA', 'مرحبا');
    s().setExportSettings({ languages: ['ar-SA', 'en-US'] });
    s().setActiveLang('ar-SA');
    expect(s().removeLanguage('ar-SA')).toBe(true);
    expect(s().project!.languages).toEqual(['en-US', 'de-DE']);
    for (const sl of s().project!.slides) expect(sl.texts['ar-SA']).toBeUndefined();
    expect(slide().shots).toEqual({});
    expect(s().project!.export.languages).toEqual(['en-US']);
    expect(s().activeLang).toBe('en-US');
    s().removeLanguage('de-DE');
    expect(s().removeLanguage('en-US')).toBe(false);
  });

  it('moves the base language first', () => {
    expect(s().setBaseLanguage('ar-SA')).toBe(true);
    expect(s().project!.languages).toEqual(['ar-SA', 'en-US']);
    expect(s().setBaseLanguage('ar-SA')).toBe(false);
    expect(s().setBaseLanguage('fr-FR')).toBe(false);
  });

  it('enables families lazily and disables them safely', () => {
    expect(s().enableFamily('mac')).toBe(true);
    expect(s().enableFamily('mac')).toBe(false);
    expect(s().enableFamily('toaster' as FamilyId)).toBe(false);
    expect(slide().layouts.mac).toBeUndefined();
    expect(devices(layoutOf(0, 'mac'))[0].frame).toBe('macbook');
    s().setExportSettings({ sizes: ['mac-2880', 'ios-6.9'] });
    s().setActiveFamily('mac');
    expect(s().disableFamily('mac')).toBe(true);
    expect(s().activeFamily).toBe('iphone');
    expect(s().project!.export.sizes).toEqual(['ios-6.9']);
    s().disableFamily('ipad');
    expect(s().disableFamily('iphone')).toBe(false);
    expect(s().project!.families).toEqual(['iphone']);
  });

  it('keeps a custom export selection in step with added languages and families', () => {
    s().addLanguage('de-DE');
    expect(s().project!.export.languages).toEqual([]);
    s().setExportSettings({ languages: ['en-US'], sizes: ['ios-6.9'] });
    s().addLanguage('fr-FR');
    expect(s().project!.export.languages).toEqual(['en-US', 'fr-FR']);
    s().enableFamily('android-tablet');
    expect(s().project!.export.sizes).toEqual(['ios-6.9', 'play-tablet-7', 'play-tablet-10']);
    s().replaceTexts({ [slide().id]: { 'ja': { headline: '見出し' } } });
    expect(s().project!.languages).toContain('ja');
    expect(s().project!.export.languages).toEqual(['en-US', 'fr-FR', 'ja']);
    s().undo();
    expect(s().project!.export.languages).toEqual(['en-US', 'fr-FR']);
  });

  it('merges export settings with validation', () => {
    expect(s().setExportSettings({ format: 'jpeg', jpegQuality: 3 })).toBe(true);
    expect(s().project!.export).toMatchObject({ format: 'jpeg', jpegQuality: 1 });
    expect(s().setExportSettings({ structure: 'zip' as never })).toBe(false);
    expect(s().setExportSettings({ format: 'jpeg' })).toBe(false);
  });
});

describe('integrity', () => {
  it('always leaves a project that validates to itself', () => {
    const sid = slide().id;
    s().addElement(sid, 'iphone', 'text', { text: 'x' });
    s().addElement(sid, 'ipad', 'shape', { shape: 'blob' });
    s().duplicateElement(sid, 'iphone', deviceOf(0).id);
    s().setShot(sid, 'iphone', 'main', 'en-US', assetId(1));
    s().addLanguage('ja');
    s().enableFamily('play-feature');
    s().applyFonts('Sora Variable', 'Sora Variable');
    s().addSlide();
    const p = s().project!;
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it('never mutates history snapshots', () => {
    const first = s().project!;
    const snapshot = JSON.stringify(first);
    s().updateElement(slide().id, 'iphone', deviceOf(0).id, { x: 0.1 });
    s().setText(slide().id, 'headline', 'en-US', 'Changed');
    s().addSlide();
    expect(JSON.stringify(first)).toBe(snapshot);
    while (s().undo());
    expect(s().project).toEqual(first);
  });

  it('shares unchanged slides between snapshots (structural sharing)', () => {
    const before = s().project!;
    s().setText(slide(0).id, 'headline', 'en-US', 'X');
    expect(s().project!.slides[1]).toBe(before.slides[1]);
    expect(s().project!.slides[0]).not.toBe(before.slides[0]);
  });

  it('exposes selectors for the active slide, layout and selection', () => {
    expect(selectActiveSlide(s())?.id).toBe(slide(0).id);
    expect(selectActiveLayout(s())).toBe(layoutOf(0, 'iphone'));
    expect(selectSelectedElement(s())).toBeNull();
    s().select(deviceOf(0).id);
    expect(selectSelectedElement(s())?.id).toBe(deviceOf(0).id);
    s().closeProject();
    expect(selectActiveSlide(s())).toBeNull();
    expect(selectActiveLayout(s())).toBeNull();
    expect(selectActiveSlideIndex(s())).toBe(-1);
  });

  it('works with the default theme for brand-new slides', () => {
    expect(defaultTheme().fonts.heading).toBe('Inter Variable');
    expect(s().addSlide()).toBeTruthy();
  });
});

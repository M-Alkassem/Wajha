/**
 * Server-rendered markup of the editor chrome against a real store: what
 * the top bar, sidebar panels and status bar show and how they are labelled.
 * Interaction is covered by scripts/qa/editor-chrome/interact.mjs (WebKit).
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// zustand hooks render the store's *initial* state on the server; these tests
// render the live state instead, so the components see the open project.
vi.mock('zustand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand')>();
  const React = await import('react');
  type Api = { getState(): unknown; subscribe(listener: () => void): () => void };
  const createStore = actual.createStore as unknown as (init: unknown) => Api;
  const build = (init: unknown) => {
    const api = createStore(init);
    const read = (selector?: (s: unknown) => unknown) => (selector ? selector(api.getState()) : api.getState());
    const useMockStore = (selector?: (s: unknown) => unknown) => React.useSyncExternalStore(api.subscribe, () => read(selector), () => read(selector));
    return Object.assign(useMockStore, api);
  };
  const create = (init?: unknown) => (init ? build(init) : build);
  return { ...actual, create };
});
import { blankProject } from '../../model/defaults';
import { assetInfo } from '../../model/fixtures.node';
import { useEditor } from '../../store';
import { useSaveStatus } from '../shell/saveStatus';
import { EditorScreen } from './EditorScreen';
import { LeftSidebar } from './sidebar/LeftSidebar';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { SaveIndicator } from './topbar/SaveIndicator';

function open(families: Parameters<typeof blankProject>[1] = ['iphone', 'android-phone'], languages = ['en-US', 'ar-SA']) {
  const p = blankProject('Habit Tracker', families, languages);
  p.slides[0].texts['en-US'] = { headline: 'Track *every* habit', subtitle: 'In seconds a day' };
  p.slides[0].texts['ar-SA'] = { headline: 'تتبع كل عادة' };
  useEditor.getState().openProject(p);
  return useEditor.getState().project!;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

afterEach(() => {
  useEditor.getState().closeProject();
  useSaveStatus.getState().reset();
});

describe('EditorScreen', () => {
  it('waits for the project with a spinner', () => {
    const html = renderToStaticMarkup(h(EditorScreen));
    expect(html).toContain('Opening project');
    expect(html).toContain('data-tauri-drag-region');
  });
});

describe('TopBar', () => {
  it('shows the name, the family tabs, the language and the actions', () => {
    open();
    const html = renderToStaticMarkup(h(TopBar));
    expect(html).toContain('Habit Tracker');
    expect(html).toContain('aria-label="Back to projects"');
    expect(html).toContain('aria-label="Device family"');
    expect(html).toContain('aria-label="iPhone"');
    expect(html).toContain('aria-label="Android phone"');
    expect(html).toContain('>en-US<');
    expect(html).toContain('aria-label="Undo"');
    expect(html).toContain('Export');
    // Nothing to undo yet.
    expect(html).toMatch(/aria-label="Undo"[^>]*disabled=""|disabled=""[^>]*aria-label="Undo"/);
  });
  it('marks empty areas as window drag regions and reserves the macOS inset', () => {
    open();
    const html = renderToStaticMarkup(h(TopBar));
    expect(count(html, 'data-tauri-drag-region')).toBeGreaterThanOrEqual(4);
    expect(html).toContain('var(--traffic-lights-w, 0px)');
  });
});

describe('SaveIndicator', () => {
  it('stays quiet until there is something to say', () => {
    open();
    expect(renderToStaticMarkup(h(SaveIndicator))).toContain('aria-hidden="true"');
  });
  it('offers a retry with the reason when saving failed', () => {
    open();
    useSaveStatus.getState().setStatus('error', new Error('Disk full'));
    const html = renderToStaticMarkup(h(SaveIndicator));
    expect(html).toContain('Not saved');
    expect(html).toContain('aria-label="Changes not saved. Try again"');
    expect(html).toContain('role="alert"');
  });
});

describe('LeftSidebar', () => {
  it('lists every slide with its number, headline and missing screenshot', () => {
    const p = open();
    const html = renderToStaticMarkup(h(LeftSidebar));
    expect(html).toContain('aria-label="Slides"');
    expect(count(html, 'role="option"')).toBe(p.slides.length);
    expect(html).toContain('Track every habit');
    expect(html).toContain('In seconds a day');
    expect(html).toContain('No headline');
    expect(html).toContain('No screenshot');
    expect(html).toContain('Add slide');
    // Only the active slide is a tab stop.
    expect(count(html, 'tabindex="0"')).toBeGreaterThanOrEqual(1);
    expect(html).toContain('aria-selected="true"');
  });
  it('shows the active language and marks the store limit', () => {
    const p = open(['play-feature', 'iphone']);
    useEditor.getState().setActiveLang('ar-SA');
    const html = renderToStaticMarkup(h(LeftSidebar));
    expect(html).toContain('تتبع كل عادة');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Only the first slide is exported');
    expect(count(html, 'Not exported')).toBe(p.slides.length - 1);
  });
  it('lists layers topmost first with readable names', () => {
    open();
    useEditor.getState().setLeftTab('layers');
    const html = renderToStaticMarkup(h(LeftSidebar));
    expect(html).toContain('aria-label="Layers of slide 1"');
    const iPhone = html.indexOf('>iPhone<');
    const headline = html.indexOf('Track every habit');
    const subtitle = html.indexOf('In seconds a day');
    expect(iPhone).toBeGreaterThan(-1);
    // The default layout draws the device first, so it is listed last.
    expect(headline).toBeLessThan(iPhone);
    expect(subtitle).toBeLessThan(headline);
  });
  it('explains where a secondary family takes its layout from', () => {
    open();
    useEditor.getState().setLeftTab('layers');
    useEditor.getState().setActiveFamily('android-phone');
    const html = renderToStaticMarkup(h(LeftSidebar));
    expect(html).toContain('Own Android layout');
    expect(html).toContain('Reset');
  });
  it('offers to add layers on an empty slide', () => {
    open();
    const s = useEditor.getState();
    for (const el of [...s.project!.slides[0].layouts.iphone!.elements]) useEditor.getState().deleteElement(s.activeSlideId!, 'iphone', el.id);
    useEditor.getState().setLeftTab('layers');
    const html = renderToStaticMarkup(h(LeftSidebar));
    expect(html).toContain('This slide is empty');
    expect(html).toContain('Add layer');
  });
});

describe('StatusBar', () => {
  it('shows the canvas, the slide count and missing screenshots', () => {
    const p = open();
    const html = renderToStaticMarkup(h(StatusBar));
    expect(html).toContain('iPhone');
    expect(html).toContain('1320 × 2868');
    expect(html).toContain(`${p.slides.length} slides`);
    expect(html).toContain(`${p.slides.length} missing screenshots`);
  });
  it('celebrates when every exported slide has its screenshot', () => {
    open(['play-feature']);
    const s = useEditor.getState();
    const info = assetInfo(7, 1080, 2400);
    s.addAssets([info]);
    const slide = s.project!.slides[0];
    const device = s.project!.slides[0].layouts['play-feature']!.elements.find((e) => e.kind === 'device');
    if (device?.kind === 'device') useEditor.getState().setShot(slide.id, 'play-feature', device.slot, 'en-US', info.id);
    const html = renderToStaticMarkup(h(StatusBar));
    expect(html).toContain('All screenshots added');
    expect(html).toContain('not exported');
  });
});

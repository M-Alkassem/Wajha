/**
 * Server-render tests for the home screen components: markup, labels and
 * states. Interaction is covered by the WebKit QA scripts.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleTemplate } from '../../model/fixtures.node';
import type { GalleryEntry, ProjectMeta } from '../../model/types';
import { TooltipProvider } from '../kit';
import { EmptyLibrary } from './EmptyLibrary';
import { FamilyGlyph } from './FamilyGlyph';
import { HomeScreen } from './HomeScreen';
import { useHomeUi } from './homeUi';
import { useLibrary } from './library';
import { ProjectCard } from './ProjectCard';
import { ThumbPlaceholder } from './ProjectThumb';
import { DevicePicker, LanguagePicker } from './SetupPanel';
import { BlankCard, GalleryCard, TemplateCard } from './TemplateCard';
import { HomeTopBar } from './TopBar';

const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(TooltipProvider, null, el));
const noop = () => undefined;

const meta: ProjectMeta = {
  id: 'p1',
  name: 'Habit Tracker',
  updatedAt: Date.now() - 5 * 60_000,
  createdAt: 1,
  slideCount: 3,
  families: ['iphone', 'android-phone'],
  languages: ['en-US', 'ar-SA'],
  templateId: null,
};

/** zustand renders its initial state on the server, so states under test are written to both. */
function setLibrary(patch: Partial<ReturnType<typeof useLibrary.getState>>): void {
  useLibrary.setState(patch);
  Object.assign(useLibrary.getInitialState(), patch);
}

beforeEach(() => {
  setLibrary({ status: 'ready', projects: [meta], busy: {}, openingId: null, renamingId: null, focusRequest: null, flashId: null, importing: false });
});

describe('FamilyGlyph', () => {
  it('draws a decorative icon for every family', () => {
    for (const f of ['iphone', 'ipad', 'android-phone', 'android-tablet', 'mac', 'play-feature'] as const) {
      const out = renderToStaticMarkup(h(FamilyGlyph, { family: f, size: 12 }));
      expect(out).toContain('aria-hidden="true"');
      expect(out).toContain('width="12"');
      expect(out).toMatch(/<(rect|path|circle)/);
    }
  });
});

describe('ProjectCard', () => {
  const card = (over: Partial<Parameters<typeof ProjectCard>[0]> = {}) =>
    html(h(ProjectCard, { meta, index: 1, tabbable: true, highlighted: false, registerButton: noop, onFocusIndex: noop, onNavigate: noop, ...over }));

  it('is one open button described by its meta', () => {
    const out = card();
    expect(out).toContain('aria-label="Open Habit Tracker"');
    expect(out).toContain('Edited 5 min ago');
    expect(out).toContain('iPhone and Android phone, 2 languages');
    expect(out).toContain('aria-label="Actions for Habit Tracker"');
    expect(out).toContain('tabindex="0"');
  });

  it('leaves the tab stop to the active card', () => {
    expect(card({ tabbable: false })).not.toContain('tabindex="0"');
  });

  it('shows the rename field and busy states', () => {
    setLibrary({ renamingId: 'p1' });
    expect(card()).toContain('aria-label="Project name"');
    setLibrary({ renamingId: null, busy: { p1: 'exporting' } });
    const busy = card();
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('aria-label="Exporting"');
    setLibrary({ busy: { p1: 'opening' } });
    const opening = card();
    expect(opening).not.toContain('aria-label="Exporting"');
    // Most projects open within a frame or two: the veil only shows when opening takes a while.
    expect(opening).not.toContain('Opening…');
  });

  it('keeps a menu-opened card lifted like a hovered one', () => {
    const out = card();
    expect(out).toContain('hover:-translate-y-0.5');
    expect(out).toContain('data-[state=open]:-translate-y-0.5');
  });

  it('renames in a field aligned like the name it replaces', () => {
    setLibrary({ renamingId: 'p1' });
    const field = card().match(/<input[^>]*aria-label="Project name"[^>]*>/)?.[0] ?? '';
    expect(field).toContain('dir="auto"');
    expect(field).toContain('text-start');
  });

  it('draws its picture in a themed well, not on a baked-in backdrop', () => {
    const out = card();
    expect(out).toContain('bg-surface-2');
    expect(out).toContain('aspect-ratio:1.6');
  });
});

describe('ThumbPlaceholder', () => {
  it('shows the initials', () => {
    expect(renderToStaticMarkup(h(ThumbPlaceholder, { id: 'x', name: 'Calm Sleep' }))).toContain('>CS<');
  });
});

describe('template tiles', () => {
  it('names the template and marks the selection', () => {
    const t = sampleTemplate();
    const out = html(h(TemplateCard, { template: t, selected: true, onSelect: noop }));
    expect(out).toContain('aria-pressed="true"');
    // Selection is the violet ring; keyboard focus is a neutral one further out, so the two never look alike.
    expect(out).toContain('ring-accent');
    const tile = out.match(/<button[^>]*data-tile[^>]*>/)?.[0] ?? '';
    expect(tile).toContain('focus-visible:outline-text');
    expect(tile).not.toContain('outline-focus');
    expect(out).toContain('aria-label="Sample Glow, Gradient template by Wajha"');
    expect(out).toContain('by Wajha');
    expect(out).toContain('Gradient');
    expect(html(h(TemplateCard, { template: t, onSelect: noop }))).toContain('aria-pressed="false"');
  });

  it('offers Blank', () => {
    const out = html(h(BlankCard, { selected: false, onSelect: noop }));
    expect(out).toContain('Start from scratch');
    expect(out).toContain('aria-label="Blank project, start from scratch"');
  });

  it('shows gallery entries with their install state', () => {
    const entry: GalleryEntry = {
      id: 'neon',
      name: 'Neon',
      author: 'Kit',
      description: '',
      category: 'dark',
      tags: [],
      version: 1,
      template: 'templates/neon/template.json',
      preview: 'templates/neon/preview.jpg',
      assets: [],
      bytes: 1,
    };
    const fresh = html(h(GalleryCard, { entry, installed: false, installing: false, selected: false, onUse: noop }));
    expect(fresh).toContain('Download and use Neon by Kit');
    expect(fresh).toContain('Use template');
    // The preview is downloaded and checked before anything decodes it: the CDN URL never reaches an <img>.
    expect(fresh).not.toContain('preview.jpg');
    expect(fresh).not.toContain('<img');
    expect(fresh).not.toContain('No preview');
    expect(html(h(GalleryCard, { entry: { ...entry, preview: '' }, installed: false, installing: false, selected: false, onUse: noop }))).toContain('No preview');
    const installed = html(h(GalleryCard, { entry, installed: true, installing: false, selected: false, onUse: noop }));
    expect(installed).toContain('Installed');
    expect(installed).not.toContain('Use template');
    expect(html(h(GalleryCard, { entry, installed: false, installing: true, selected: false, onUse: noop }))).toContain('Downloading');
  });
});

describe('setup controls', () => {
  it('toggles device families as pressed buttons grouped by store', () => {
    const out = html(h(DevicePicker, { value: ['iphone', 'android-phone'], onChange: noop }));
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(out.match(/aria-pressed="false"/g)).toHaveLength(10);
    for (const name of ['iPhone landscape', 'Apple Watch', 'Apple TV', 'Vision Pro', 'Android landscape']) expect(out).toContain(`aria-label="${name}"`);
    expect(out).toContain('App Store');
    expect(out).toContain('Google Play');
    expect(out).toContain('2 selected');
  });

  it('lists languages with the base first and RTL marked', () => {
    const out = html(h(LanguagePicker, { value: ['en-US', 'ar-SA'], onChange: noop }));
    expect(out).toContain('English (US)');
    expect(out).toContain('العربية');
    expect(out).toContain('lang="ar-SA"');
    expect(out).toContain('>Base<');
    expect(out).toContain('>RTL<');
    expect(out).toContain('aria-label="Make Arabic the base language"');
    expect(out).toContain('aria-label="Remove Arabic"');
    // The only language cannot be removed.
    expect(html(h(LanguagePicker, { value: ['en-US'], onChange: noop }))).not.toContain('aria-label="Remove');
  });

  it('cuts the English name short before the native one', () => {
    const out = html(h(LanguagePicker, { value: ['pt-BR', 'en-US'], onChange: noop }));
    expect(out).toMatch(/<span dir="auto" lang="pt-BR" class="[^"]*\bshrink-0\b[^"]*">Português/);
    expect(out).toMatch(/<span class="min-w-0 truncate[^"]*">Portuguese/);
  });
});

describe('screens', () => {
  it('top bar: drag regions, search only when asked', () => {
    const withSearch = html(h(HomeTopBar, { showSearch: true }));
    expect(withSearch).toContain('data-tauri-drag-region');
    expect(withSearch).toContain('aria-label="Search projects"');
    expect(withSearch).toContain('New project');
    expect(withSearch).toContain('Open file…');
    expect(withSearch).toContain('aria-label="Settings"');
    expect(html(h(HomeTopBar, { showSearch: false }))).not.toContain('Search projects');
    // The first-run page has its own primary "Create your first project".
    const firstRun = html(h(HomeTopBar, { showSearch: false, showNewProject: false }));
    expect(firstRun).not.toContain('New project');
    expect(firstRun).toContain('Open file…');
  });

  it('first run: hero with both ways in', () => {
    const out = html(h(EmptyLibrary));
    expect(out).toContain('Make your app store page');
    expect(out).toContain('Create your first project');
    expect(out).toContain('Open a .wajha file');
  });

  describe('library search', () => {
    const search = (query: string) => {
      useHomeUi.setState({ query });
      Object.assign(useHomeUi.getInitialState(), { query });
      return html(h(HomeScreen));
    };
    const announced = (out: string) => out.match(/<p class="([^"]*)" aria-live="polite">(.*?)<\/p>/);

    afterEach(() => {
      search('');
    });

    it('counts the matches under the heading', () => {
      const out = search('habit');
      expect(out).toContain('>Search results</h1>');
      const live = announced(out);
      expect(live?.[2]).toBe('1 project matching “<bdi>habit</bdi>”');
      expect(live?.[1]).not.toContain('sr-only');
      expect(out).not.toContain('No projects match');
    });

    it('says once that nothing matches, and still announces it', () => {
      setLibrary({ projects: [meta, { ...meta, id: 'p2', name: 'Plant Pal' }] });
      const out = search('  zebra  ');
      expect(out).toContain('>Search results</h1>');
      expect(out).not.toContain('0 projects');
      // On screen: the empty state alone.
      expect(out).toMatch(/<h3[^>]*>No projects match “<bdi>zebra<\/bdi>”<\/h3>/);
      expect(out).toContain('Check the spelling, or clear the search to see all 2 projects.');
      expect(out).toContain('>Clear search</span></button>');
      // To screen readers: the live region under the heading, hidden from view.
      const live = announced(out);
      expect(live?.[1]).toContain('sr-only');
      expect(live?.[2]).toBe('No projects match “<bdi>zebra</bdi>”');
      expect(out.match(/No projects match/g)).toHaveLength(2);
    });

    it('keeps a long or right-to-left query tidy', () => {
      const long = search('a very long search for something that is certainly not the name of any project');
      expect(long).toContain('No projects match “<bdi>a very long search for something that i…</bdi>”');
      expect(search('نور')).toContain('“<bdi>نور</bdi>”');
    });
  });
});

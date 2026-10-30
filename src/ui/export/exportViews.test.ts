/**
 * Server-rendered markup of the export dialog's views (no DOM): what each
 * state says, accessible names, and that warnings link to their slides.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { planExport } from '../../export/plan';
import type { ExportJob } from '../../export/types';
import { blankProject } from '../../model/defaults';
import { ExportDoneView, ExportErrorView } from './ExportDoneView';
import { ExportProgressView } from './ExportProgressView';
import { ExportSettingsPanel } from './ExportSettingsPanel';
import { ExportSummaryPanel } from './ExportSummaryPanel';
import { folderTreePreview, initialSizes, pathPrefix, planSettings } from './exportModel';
import type { ExportOutcome } from './runProjectExport';
import type { TextOverflowState } from './textOverflow';

const noop = () => undefined;
const project = blankProject('Sunny App', ['iphone', 'android-phone'], ['en-US', 'ar-SA', 'fa']);
const sizes = initialSizes(project);
const plan = planExport(project, planSettings(sizes, project.languages, 'png', 0.92, 'stores'));

describe('ExportSettingsPanel', () => {
  const html = renderToStaticMarkup(
    h(ExportSettingsPanel, {
      project,
      sizes,
      languages: project.languages,
      format: 'jpeg',
      quality: 0.85,
      structure: 'stores',
      tree: folderTreePreview(plan.jobs.map((j) => pathPrefix('stores', project.name) + j.path)),
      treeCaption: 'Inside the folder you choose',
      onSizeChange: noop,
      onLanguageChange: noop,
      onFormatChange: noop,
      onQualityChange: noop,
      onStructureChange: noop,
    }),
  );

  it('lists sizes per device with pixel sizes, required badges and device names for assistive tech', () => {
    expect(html).toContain('iPhone 6.9″');
    expect(html).toContain('1320 × 2868');
    expect(html).toContain('Required');
    expect(html).toContain('for iPhone 17 Pro Max, 16 Pro Max');
    expect(html).toContain('2 of 6');
    expect(html).toContain('aria-label="Why two iPhone sizes?"');
  });

  it('shows store locale codes and marks languages a store does not offer', () => {
    expect(html).toContain('ar-SA');
    expect(html).toContain('Not offered');
    expect(html).toContain('lang="ar-SA"');
  });

  it('shows the JPEG quality and the folder structure as a radio group with a preview', () => {
    expect(html).toContain('85%');
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(3 + 2);
    expect(html).toContain('Sunny App');
    expect(html).toContain('Inside the folder you choose');
  });
});

describe('ExportSummaryPanel', () => {
  const checked: TextOverflowState = { rows: [], pending: false };
  const summary = (over: Partial<Parameters<typeof ExportSummaryPanel>[0]> = {}) =>
    renderToStaticMarkup(h(ExportSummaryPanel, { project, plan, sizes, format: 'png', quality: 0.92, structure: 'stores', overflow: checked, onJump: noop, ...over }));
  const html = summary();

  it('counts files per device', () => {
    expect(html).toContain(`>${plan.jobs.length}<`);
    // Persian has no App Store locale, so the iPhone exports two of the three languages.
    expect(html).toContain('2 sizes · 2 languages · 3 slides');
    expect(html).toContain('1 size · 3 languages · 3 slides');
  });

  it('links every missing screenshot to its slide and lists store language gaps', () => {
    expect(html).toContain('Missing screenshots');
    expect(html).toContain('aria-label="Go to slide 3, iPhone, All languages"');
    expect(html).toContain('aria-label="Go to slide 1, Android phone, All languages"');
    expect(html).toContain('App Store has no Persian localization');
    expect(html).not.toContain('Text doesn');
  });

  it('lists texts that do not fit, per device and language, each linked to its text', () => {
    const overflow: TextOverflowState = {
      pending: false,
      rows: [
        { families: ['iphone', 'android-phone'], lang: 'ar-SA', slides: [{ slideIndex: 1, lang: 'ar-SA', elementId: 'h' }, { slideIndex: 2, lang: 'ar-SA', elementId: 's' }] },
        { families: ['android-phone'], lang: null, slides: [{ slideIndex: 2, lang: 'en-US', elementId: 's' }] },
      ],
    };
    const out = summary({ overflow });
    expect(out).toContain('Text doesn&#x27;t fit');
    expect(out).toContain('Text on 2 slides needs more lines than allowed, even at its smallest size.');
    expect(out).toContain('iPhone and Android phone · Arabic');
    expect(out).toContain('Android phone · All languages');
    // A shared row jumps to the first device.
    expect(out).toContain('aria-label="Go to the text on slide 2, iPhone, Arabic"');
    expect(out).toContain('aria-label="Go to the text on slide 3, Android phone, All languages"');
    // After the missing screenshots, before the slide limits and store languages.
    expect(out.indexOf('Missing screenshots')).toBeLessThan(out.indexOf('Text doesn'));
    expect(out.indexOf('Text doesn')).toBeLessThan(out.indexOf('Store languages'));
  });

  it('is only ready to export once every text has been checked', () => {
    const clean = { jobs: plan.jobs.slice(0, 1), warnings: [] };
    const checking = summary({ plan: clean, overflow: { rows: [], pending: true } });
    expect(checking).not.toContain('Ready to export');
    expect(checking).toContain('Checking that every text fits');
    const ready = summary({ plan: clean });
    expect(ready).toContain('Ready to export');
    expect(ready).toContain('Every device has a screenshot, every text fits and every language has a store locale.');
    expect(ready).not.toContain('Checking that every text fits');
  });

  it('says when nothing is selected', () => {
    const empty = summary({ plan: { jobs: [], warnings: [] }, sizes: [], structure: 'flat' });
    expect(empty).toContain('Nothing selected');
    expect(empty).toContain('Not exported: no size selected');
    expect(empty).not.toContain('Before you export');
  });
});

const job = (over: Partial<ExportJob> = {}): ExportJob => ({ family: 'iphone', sizeId: 'ios-6.9', width: 1320, height: 2868, lang: 'en-US', slideIndex: 0, path: 'P/App Store/en-US/iPhone 6.9/01.png', ...over });

function outcome(over: Partial<ExportOutcome['report']> = {}, extra: Partial<ExportOutcome> = {}): ExportOutcome {
  const target = { id: 't', label: 'Sunny App screenshots', path: '/Users/me/Desktop' };
  return {
    report: { written: 2, failed: [], cancelled: false, target, ms: 8240, ...over },
    target,
    bytes: 3 * 1024 * 1024,
    overflow: [],
    jobs: [job(), job({ family: 'android-phone', sizeId: 'play-phone', path: 'P/Google Play/en-US/Phone/01.png' })],
    ...extra,
  };
}

describe('ExportDoneView', () => {
  it('announces a successful export with time, size, destination and files per device', () => {
    const html = renderToStaticMarkup(h(ExportDoneView, { outcome: outcome(), total: 2, downloaded: false, onJump: noop }));
    expect(html).toContain('role="status"');
    expect(html).toContain('2 files exported');
    expect(html).toContain('in 8.2 s · 3.0 MB');
    expect(html).toContain('Saved to Sunny App screenshots');
    expect(html).toContain('Android phone');
  });

  it('lists failed files with their errors and texts that do not fit', () => {
    const html = renderToStaticMarkup(
      h(ExportDoneView, {
        outcome: outcome(
          { written: 1, failed: [{ job: job({ path: 'P/x/02.png' }), error: 'Disk full' }] },
          { overflow: [{ slideIndex: 2, elementId: 'e', label: 'Headline', family: 'iphone', lang: 'ar-SA', langs: ['ar-SA'], sizes: ['iPhone 6.9″'] }] },
        ),
        total: 2,
        downloaded: true,
        onJump: noop,
      }),
    );
    expect(html).toContain('1 of 2 files exported');
    expect(html).toContain('1 file failed');
    expect(html).toContain('Disk full');
    expect(html).toContain('Slide 3 · Headline');
    expect(html).toContain('Arabic · iPhone 6.9″');
    expect(html).toContain('Downloaded Sunny App screenshots.zip');
  });

  it('explains a stopped export', () => {
    const web = renderToStaticMarkup(h(ExportDoneView, { outcome: outcome({ cancelled: true, written: 1 }), total: 2, downloaded: true, onJump: noop }));
    expect(web).toContain('Export stopped');
    expect(web).toContain('Nothing was downloaded.');
    const desktop = renderToStaticMarkup(h(ExportDoneView, { outcome: outcome({ cancelled: true, written: 1 }), total: 2, downloaded: false, onJump: noop }));
    expect(desktop).toContain('1 file was written to Sunny App screenshots before you stopped.');
  });

  it('shows errors as an alert', () => {
    const html = renderToStaticMarkup(h(ExportErrorView, { message: 'This export is too large for a zip download' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('too large');
  });
});

describe('ExportProgressView', () => {
  it('says what renders now and how far along the run is', () => {
    const html = renderToStaticMarkup(
      h(ExportProgressView, {
        progress: { done: 11, total: 40, current: job({ lang: 'ar-SA', slideIndex: 2 }) },
        startedAt: 0,
        preview: null,
        format: 'png',
        stopping: false,
        targetLabel: 'Sunny App screenshots',
      }),
    );
    expect(html).toContain('Rendering 12 of 40');
    expect(html).toContain('iPhone 6.9″ · Arabic · slide 3');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="28"');
  });
});

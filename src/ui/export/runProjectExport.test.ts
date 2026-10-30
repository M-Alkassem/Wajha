import { describe, expect, it, vi } from 'vitest';
import { planExport } from '../../export/plan';
import type { ExportJob } from '../../export/types';
import { blankProject } from '../../model/defaults';
import { createMemoryPlatform } from '../../platform/memory';
import type { RenderedJob } from '../../runtime/renderer';
import { initialSizes, planSettings } from './exportModel';
import { runProjectExport, type ExportRunDeps } from './runProjectExport';

const project = blankProject('Sunny: App', ['iphone', 'android-phone'], ['en-US', 'ar-SA']);
const png = (n: number) => new Uint8Array([137, 80, 78, 71, n]);

function deps(over: Partial<ExportRunDeps> = {}) {
  const platform = createMemoryPlatform();
  const rendered: ExportJob[] = [];
  const base: ExportRunDeps = {
    platform,
    flush: vi.fn(async () => undefined),
    render: async (_p, job): Promise<RenderedJob> => {
      rendered.push(job);
      const headline = _p.slides[job.slideIndex].layouts[job.family]?.elements.find((e) => e.kind === 'text' && e.key === 'headline');
      const overflowingText = job.lang === 'ar-SA' && job.slideIndex === 0 && headline ? [headline.id] : [];
      return { bytes: png(rendered.length), result: { boxes: [], missingShots: [], overflowingText, pendingImages: [] } };
    },
  };
  return { platform, rendered, deps: { ...base, ...over } };
}

const settingsFor = (structure: 'stores' | 'fastlane' | 'flat') => planSettings(initialSizes(project), project.languages, 'png', 0.9, structure);

describe('runProjectExport', () => {
  it('writes every job into a project folder, finishes the target and reports overflow', async () => {
    const { platform, deps: d } = deps();
    const settings = settingsFor('stores');
    const plan = planExport(project, settings);
    const onStart = vi.fn();
    const onFile = vi.fn();
    const progress: number[] = [];
    const out = await runProjectExport(
      { project, settings, plan, signal: new AbortController().signal, onStart, onFile, onProgress: (p) => progress.push(p.done) },
      d,
    );
    expect(out).not.toBeNull();
    expect(out!.report.written).toBe(plan.jobs.length);
    expect(out!.report.failed).toEqual([]);
    expect(out!.bytes).toBe(plan.jobs.length * 5);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onFile).toHaveBeenCalledTimes(plan.jobs.length);
    expect(d.flush).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toBe(plan.jobs.length);

    const [exp] = platform.testing.exports();
    expect(exp.label).toBe('Sunny App screenshots');
    expect(exp.finished).toBe(true);
    const paths = [...exp.files.keys()];
    expect(paths.every((p) => p.startsWith('Sunny App/'))).toBe(true);
    expect(paths).toContain('Sunny App/App Store/ar-SA/iPhone 6.9/01.png');
    expect(paths).toContain('Sunny App/Google Play/ar/Phone/03.png');

    expect(out!.overflow).toHaveLength(1);
    expect(out!.overflow[0]).toMatchObject({ slideIndex: 0, label: 'Headline', langs: ['ar-SA'] });
    expect(out!.overflow[0].sizes).toEqual(['iPhone 6.9″', 'iPhone 6.3″', 'Phone 1080 × 1920']);
  });

  it('writes fastlane exports at the destination root', async () => {
    const { platform, deps: d } = deps();
    const settings = settingsFor('fastlane');
    await runProjectExport({ project, settings, plan: planExport(project, settings), signal: new AbortController().signal }, d);
    const paths = [...platform.testing.exports()[0].files.keys()];
    expect(paths.every((p) => p.startsWith('fastlane/'))).toBe(true);
  });

  it('resolves null and renders nothing when the picker is cancelled', async () => {
    const { platform, rendered, deps: d } = deps();
    platform.testing.setHandlers({ pickExportTarget: () => null });
    const settings = settingsFor('flat');
    const out = await runProjectExport({ project, settings, plan: planExport(project, settings), signal: new AbortController().signal }, d);
    expect(out).toBeNull();
    expect(rendered).toEqual([]);
    expect(d.flush).not.toHaveBeenCalled();
  });

  it('stops on abort and does not finish the target', async () => {
    const controller = new AbortController();
    const { platform, deps: d } = deps();
    const settings = settingsFor('stores');
    const plan = planExport(project, settings);
    const out = await runProjectExport(
      {
        project,
        settings,
        plan,
        signal: controller.signal,
        onFile: (_bytes, job) => {
          if (job.slideIndex === 1) controller.abort();
        },
      },
      d,
    );
    expect(out!.report.cancelled).toBe(true);
    expect(out!.report.written).toBe(1);
    expect(platform.testing.exports()[0].finished).toBe(false);
  });

  it('keeps going when a file fails and still saves when flushing fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let n = 0;
    const { platform, deps: d } = deps({
      flush: async () => {
        throw new Error('disk full');
      },
    });
    const render = d.render;
    d.render = async (p, job, f, q) => {
      if (++n === 2) throw new Error('Image could not be loaded');
      return render(p, job, f, q);
    };
    const settings = settingsFor('flat');
    const plan = planExport(project, settings);
    const out = await runProjectExport({ project, settings, plan, signal: new AbortController().signal }, d);
    expect(out!.report.failed).toHaveLength(1);
    expect(out!.report.failed[0].error).toBe('Image could not be loaded');
    expect(out!.report.written).toBe(plan.jobs.length - 1);
    expect(platform.testing.exports()[0].finished).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

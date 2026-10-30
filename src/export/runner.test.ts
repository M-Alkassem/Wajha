import { describe, expect, it, vi } from 'vitest';
import type { ExportTarget } from '../platform/types';
import { runExport } from './runner';
import type { ExportJob, ExportPlan, ExportProgress, RunExportOptions } from './types';

const target: ExportTarget = { id: 't1', label: 'Exports', path: '/tmp/exports' };

const jobs = (n: number): ExportJob[] =>
  Array.from({ length: n }, (_, i) => ({
    family: 'iphone',
    sizeId: 'ios-6.9',
    width: 1320,
    height: 2868,
    lang: 'en-US',
    slideIndex: i,
    path: `App Store/en-US/iPhone 6.9/${String(i + 1).padStart(2, '0')}.png`,
  }));

const plan = (n: number): ExportPlan => ({ jobs: jobs(n), warnings: [] });

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

function options(overrides: Partial<RunExportOptions> = {}): RunExportOptions & { writes: Map<string, Uint8Array> } {
  const writes = new Map<string, Uint8Array>();
  return {
    plan: plan(3),
    target,
    format: 'png',
    jpegQuality: 0.9,
    renderJob: async (job) => new Uint8Array([job.slideIndex + 1]),
    write: async (_t, path, data) => {
      writes.set(path, data);
    },
    ...overrides,
    writes,
  };
}

describe('runExport', () => {
  it('renders and writes every job in order', async () => {
    const opts = options();
    const report = await runExport(opts);
    expect(report.written).toBe(3);
    expect(report.failed).toEqual([]);
    expect(report.cancelled).toBe(false);
    expect(report.target).toBe(target);
    expect(report.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(report.ms)).toBe(true);
    expect([...opts.writes.keys()]).toEqual(opts.plan.jobs.map((j) => j.path));
    expect([...opts.writes.values()].map((d) => d[0])).toEqual([1, 2, 3]);
  });

  it('never has more than one job in flight and writes before rendering the next', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const opts = options({
      plan: plan(5),
      renderJob: async (job) => {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push(`render ${job.slideIndex}`);
        await tick();
        return new Uint8Array([1]);
      },
      write: async (_t, path) => {
        events.push(`write ${path.slice(-6, -4)}`);
        await tick();
        active--;
      },
    });
    await runExport(opts);
    expect(maxActive).toBe(1);
    expect(events).toEqual(['render 0', 'write 01', 'render 1', 'write 02', 'render 2', 'write 03', 'render 3', 'write 04', 'render 4', 'write 05']);
  });

  it('passes the format and a sane JPEG quality to the renderer', async () => {
    const renderJob = vi.fn(async () => new Uint8Array([1]));
    await runExport(options({ renderJob, format: 'jpeg', jpegQuality: 0.8, plan: plan(1) }));
    expect(renderJob).toHaveBeenCalledWith(expect.objectContaining({ slideIndex: 0 }), 'jpeg', 0.8);
    for (const [given, used] of [
      [2, 1],
      [0.1, 0.5],
      [Number.NaN, 0.92],
    ]) {
      renderJob.mockClear();
      await runExport(options({ renderJob, format: 'jpeg', jpegQuality: given, plan: plan(1) }));
      expect(renderJob.mock.calls[0]).toEqual([expect.anything(), 'jpeg', used]);
    }
  });

  it('reports progress at the start and after every job', async () => {
    const seen: ExportProgress[] = [];
    const opts = options({ onProgress: (p) => seen.push({ ...p }) });
    await runExport(opts);
    const [a, b, c] = opts.plan.jobs;
    expect(seen).toEqual([
      { done: 0, total: 3, current: a },
      { done: 1, total: 3, current: b },
      { done: 2, total: 3, current: c },
      { done: 3, total: 3, current: null },
    ]);
  });

  it('collects failures and keeps going', async () => {
    const opts = options({
      plan: plan(4),
      renderJob: async (job) => {
        if (job.slideIndex === 1) throw new Error('font failed to load');
        if (job.slideIndex === 2) throw 'plain string';
        return new Uint8Array([1]);
      },
      write: async (_t, path) => {
        if (path.endsWith('04.png')) throw new Error('disk full');
      },
    });
    const report = await runExport(opts);
    expect(report.written).toBe(1);
    expect(report.failed.map((f) => [f.job.slideIndex, f.error])).toEqual([
      [1, 'font failed to load'],
      [2, 'plain string'],
      [3, 'disk full'],
    ]);
    expect(report.cancelled).toBe(false);
  });

  it('treats empty renderer output as a failure instead of writing a broken file', async () => {
    const write = vi.fn(async () => {});
    const report = await runExport(options({ plan: plan(1), renderJob: async () => new Uint8Array(0), write }));
    expect(write).not.toHaveBeenCalled();
    expect(report.failed[0].error).toMatch(/no image data/);
  });

  it('describes odd thrown values', async () => {
    const thrown: unknown[] = [undefined, new Error(''), { message: 'not_found: projects/x/assets/a.png' }, 42, null];
    const report = await runExport(
      options({
        plan: plan(thrown.length),
        renderJob: async (job) => {
          throw thrown[job.slideIndex];
        },
      }),
    );
    expect(report.failed.map((f) => f.error)).toEqual(['Unknown error', 'Unknown error', 'not_found: projects/x/assets/a.png', '42', 'Unknown error']);
  });

  it('does nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const renderJob = vi.fn(async () => new Uint8Array([1]));
    const seen: ExportProgress[] = [];
    const report = await runExport(options({ renderJob, signal: controller.signal, onProgress: (p) => seen.push(p) }));
    expect(renderJob).not.toHaveBeenCalled();
    expect(report).toMatchObject({ written: 0, cancelled: true, failed: [] });
    expect(seen).toEqual([{ done: 0, total: 3, current: null }]);
  });

  it('stops between jobs when aborted', async () => {
    const controller = new AbortController();
    const seen: ExportProgress[] = [];
    const opts = options({
      plan: plan(5),
      signal: controller.signal,
      onProgress: (p) => {
        seen.push(p);
        if (p.done === 2) controller.abort();
      },
    });
    const report = await runExport(opts);
    expect(report).toMatchObject({ written: 2, cancelled: true });
    expect(opts.writes.size).toBe(2);
    expect(seen.at(-1)).toEqual({ done: 2, total: 5, current: null });
  });

  it('does not write a job whose render finished after the abort', async () => {
    const controller = new AbortController();
    const seen: ExportProgress[] = [];
    const opts = options({
      plan: plan(3),
      signal: controller.signal,
      onProgress: (p) => seen.push(p),
      renderJob: async (job) => {
        if (job.slideIndex === 1) controller.abort();
        return new Uint8Array([1]);
      },
    });
    const report = await runExport(opts);
    expect(report).toMatchObject({ written: 1, cancelled: true, failed: [] });
    expect([...opts.writes.keys()]).toEqual([opts.plan.jobs[0].path]);
    // The label of the job that was cut short is cleared.
    expect(seen.at(-1)).toEqual({ done: 1, total: 3, current: null });
  });

  it('survives a throwing progress callback', async () => {
    const opts = options({
      onProgress: () => {
        throw new Error('UI bug');
      },
    });
    const report = await runExport(opts);
    expect(report.written).toBe(3);
    expect(report.failed).toEqual([]);
  });

  it('handles an empty plan', async () => {
    const seen: ExportProgress[] = [];
    const report = await runExport(options({ plan: { jobs: [], warnings: [] }, onProgress: (p) => seen.push(p) }));
    expect(report).toMatchObject({ written: 0, failed: [], cancelled: false });
    expect(seen).toEqual([{ done: 0, total: 0, current: null }]);
  });

  it('measures elapsed time', async () => {
    const report = await runExport(
      options({
        plan: plan(2),
        renderJob: async () => {
          await new Promise((r) => setTimeout(r, 15));
          return new Uint8Array([1]);
        },
      }),
    );
    expect(report.ms).toBeGreaterThanOrEqual(20);
  });
});

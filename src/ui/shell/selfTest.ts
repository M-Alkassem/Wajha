/**
 * Desktop smoke test. When the app starts with WAJHA_SELF_TEST_DIR set, the
 * Rust shell reports that folder and this script drives the real stack end to
 * end inside the real webview: sit idle on the fresh home screen, create a
 * project from a template, import a generated screenshot, render and export
 * PNGs through the Rust commands, sit idle in the editor and on the home
 * screen again, then reopen the project and rename it, write report.json and
 * quit at once through the shell's exit hold, as Cmd+Q does: the before-exit
 * handler (session.ts) has to save the rename before the app ends.
 * scripts/desktop-smoke.sh checks the result, including that rename on disk,
 * and samples memory per phase (named in phase.txt).
 */
import { invoke } from '@tauri-apps/api/core';
import type { Project } from '../../model/types';
import { planExport, runExport, type ExportJob } from '../../export';
import { getPlatform, type ExportTarget } from '../../platform';
import { getImageCache, importImagesWithReport, renderJobWithResult } from '../../runtime';
import { BUILTIN_TEMPLATES } from '../../templates';
import { createAndOpenProject, flushProject, goHome, openProjectById, useEditor } from '../../store';
import { useSaveStatus } from './saveStatus';

interface SelfTestConfig {
  outDir: string;
}

interface Step {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

/** The edit the quit must save: the smoke script reads the project's name back from disk. */
interface QuitCheck {
  projectId: string;
  name: string;
}

let started = false;

/** How long each idle phase lasts, so the smoke script can sample settled memory. */
const IDLE_MS = 6000;

/** Runs the self-test when the desktop shell asks for it; otherwise does nothing. */
export async function maybeRunSelfTest(): Promise<void> {
  if (started || getPlatform().kind !== 'desktop') return;
  let config: SelfTestConfig | null = null;
  try {
    config = await invoke<SelfTestConfig | null>('self_test_config');
  } catch {
    return;
  }
  if (!config) return;
  started = true;
  const target: ExportTarget = { id: config.outDir, label: 'self-test', path: config.outDir };
  const steps: Step[] = [];
  const files: string[] = [];
  const t0 = performance.now();

  /** Names the phase the smoke script's memory samples belong to. */
  async function phase(name: string): Promise<void> {
    await getPlatform()
      .exportWrite(target, 'phase.txt', new TextEncoder().encode(name))
      .catch(() => undefined);
  }

  async function idle(name: string): Promise<void> {
    await phase(name);
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }

  async function step<T>(name: string, run: () => Promise<T>, detail?: (v: T) => string): Promise<T | null> {
    const start = performance.now();
    try {
      const value = await run();
      steps.push({ name, ok: true, ms: Math.round(performance.now() - start), detail: detail?.(value) });
      return value;
    } catch (err) {
      steps.push({ name, ok: false, ms: Math.round(performance.now() - start), detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      return null;
    }
  }

  // The home screen right after launch: the baseline memory.
  await idle('launch-idle');

  const project = await step(
    'create project from template',
    async () => {
      const template = BUILTIN_TEMPLATES[0] ?? null;
      const p = await createAndOpenProject(template, { name: 'Self-test', families: ['iphone', 'android-phone'], languages: ['en-US', 'ar-SA'] });
      if (!p) throw new Error('project did not open');
      return p;
    },
    (p) => `${p.slides.length} slides, template ${p.templateId ?? 'blank'}`,
  );

  if (project) {
    await step(
      'import generated screenshot',
      async () => {
        const png = await generateScreenshot(1206, 2622);
        const report = await importImagesWithReport(project.id, [{ name: 'self-test.png', data: png }]);
        if (!report.assets.length) throw new Error(report.skipped[0]?.message ?? 'not imported');
        const store = useEditor.getState();
        store.addAssets(report.assets);
        const placed = store.assignShotsInOrder('iphone', 'en-US', [report.assets[0].id], 0);
        if (placed !== 1) throw new Error(`placed ${placed} screenshots`);
        return report.assets[0];
      },
      (a) => `${a.width}x${a.height}, ${a.bytes} bytes`,
    );

    await step('save project', () => flushProject());

    await phase('export');
    await step(
      'export PNG and JPEG through the Rust commands',
      async () => {
        const current = useEditor.getState().project as Project;
        const plan = planExport(current, { ...current.export, sizes: ['ios-6.9', 'play-phone'], languages: ['en-US', 'ar-SA'], format: 'png', structure: 'stores' });
        const jobs = plan.jobs.filter((j: ExportJob) => j.slideIndex < 2);
        if (!jobs.length) throw new Error('nothing to export');
        const report = await runExport({
          plan: { jobs, warnings: plan.warnings },
          target,
          format: 'png',
          jpegQuality: 0.9,
          renderJob: async (job, format, quality) => (await renderJobWithResult(current, job, format, quality)).bytes,
          write: async (t, path, data) => {
            await getPlatform().exportWrite(t, path, data);
            files.push(path);
          },
        });
        if (report.failed.length) throw new Error(report.failed.map((f) => `${f.job.path}: ${f.error}`).join('; '));
        const jpeg = await renderJobWithResult(current, jobs[0], 'jpeg', 0.9);
        await getPlatform().exportWrite(target, 'jpeg-check.jpg', jpeg.bytes);
        files.push('jpeg-check.jpg');
        return report;
      },
      (r) => `${r.written} PNG files in ${r.ms} ms`,
    );

    await idle('editor-idle');
    await step('back to projects', () => goHome());
    await idle('home-idle');
  }

  const previewCacheBytes = getImageCache().memoryBytes();
  let quit: QuitCheck | null = null;
  if (project) {
    await phase('quit');
    quit = await step('reopen and rename right before quitting', () => renameBeforeQuitting(project.id), (q) => `renamed to "${q.name}"`);
  }

  const ok = steps.every((s) => s.ok);
  const report = {
    ok,
    totalMs: Math.round(performance.now() - t0),
    steps,
    files,
    quit,
    previewCacheBytes,
    userAgent: navigator.userAgent,
    devicePixelRatio,
  };
  try {
    await getPlatform().exportWrite(target, 'report.json', new TextEncoder().encode(JSON.stringify(report, null, 2)));
  } catch (err) {
    console.error('[self-test] could not write the report', err);
  }
  // The shell holds this quit as it holds Cmd+Q and sends wajha://before-exit;
  // the session saves and answers with confirm_exit, which ends the app.
  const held = quit !== null && (await invoke('self_test_quit').then(() => true, () => false));
  if (!held) await invoke('confirm_exit').catch(() => undefined);
}

/**
 * Reopens the project and renames it, leaving the save to autosave (due
 * 800 ms later), so only the save before quitting can write it in time.
 */
async function renameBeforeQuitting(projectId: string): Promise<QuitCheck> {
  if (!(await openProjectById(projectId))) throw new Error('project did not reopen');
  // The session starts autosaving the reopened project in a microtask: wait for it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const name = `Self-test ${Date.now().toString(36)}`;
  if (!useEditor.getState().renameProject(name)) throw new Error('rename refused');
  const status = useSaveStatus.getState().status;
  if (status !== 'pending') throw new Error(`autosave is "${status}" after the rename, not "pending"`);
  return { projectId, name };
}

/** A synthetic app screenshot (gradient, cards, big text) encoded as PNG. */
async function generateScreenshot(width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context');
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(1, '#312e81');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(width * 0.09)}px -apple-system, system-ui, sans-serif`;
  ctx.fillText('Self-test', width * 0.08, height * 0.12);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `hsl(${(i * 47) % 360} 80% 62%)`;
    ctx.beginPath();
    ctx.roundRect(width * 0.08, height * (0.18 + i * 0.12), width * 0.84, height * 0.09, width * 0.04);
    ctx.fill();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  // Free the 12 MB bitmap now, so it does not count in the memory the smoke script measures.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('could not encode the screenshot');
  return new Uint8Array(await blob.arrayBuffer());
}

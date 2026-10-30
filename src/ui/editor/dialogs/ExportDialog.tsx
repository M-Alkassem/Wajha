/**
 * Export screenshots: sizes, languages, format and folder structure on the
 * left, what will be written and what to check first on the right; then the
 * run (live preview, progress, cancel) and its result.
 *
 * Choices are saved to the project as they change, inside one history
 * gesture per dialog session, so they cost a single undo step.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { planExport } from '../../../export/plan';
import { sanitizeSegment } from '../../../export/paths';
import type { ExportJob, ExportProgress } from '../../../export/types';
import { disposePngWorker } from '../../../export/worker';
import type { ExportSettings, ExportStructure, LangCode, Project } from '../../../model/types';
import { getPlatform, type ExportTarget, type OsKind } from '../../../platform';
import { renderJobWithResult } from '../../../runtime';
import { confirmDialog, flushProject, toast, useEditor } from '../../../store';
import { Button, Dialog, DialogContent, Tooltip, matchShortcut, platformIsMac } from '../../kit';
import { ExportDoneView, ExportErrorView } from '../../export/ExportDoneView';
import { ExportProgressView, type ExportPreviewImage } from '../../export/ExportProgressView';
import { ExportSettingsPanel } from '../../export/ExportSettingsPanel';
import { ExportSummaryPanel } from '../../export/ExportSummaryPanel';
import {
  EMPTY_PLAN,
  exportTargetName,
  folderTreePreview,
  initialLanguages,
  initialSizes,
  languagesSetting,
  orderSizes,
  pathPrefix,
  planSettings,
  selectionProblem,
  sizesSetting,
  toggled,
} from '../../export/exportModel';
import { runProjectExport, type ExportOutcome } from '../../export/runProjectExport';
import { useTextOverflow } from '../../export/useTextOverflow';
import { jumpTo, useEditorWhileOpen, useOpenSession, type JumpTarget } from './dialogState';
import { plural } from './labels';
import type { EditorDialogProps } from './types';

type Phase =
  | { name: 'setup' }
  /** Waiting for the destination picker. */
  | { name: 'picking' }
  | { name: 'running'; target: ExportTarget; progress: ExportProgress; startedAt: number }
  | { name: 'done'; outcome: ExportOutcome; total: number }
  | { name: 'error'; message: string };

const BODY = 'h-[min(640px,calc(100vh-200px))] border-t border-line';

const DESCRIPTIONS: Record<Phase['name'], string> = {
  setup: 'Every slide at the exact pixel sizes the stores ask for.',
  picking: 'Every slide at the exact pixel sizes the stores ask for.',
  running: 'Rendering at full resolution. Keep this window open.',
  done: 'Every slide at the exact pixel sizes the stores ask for.',
  error: 'Every slide at the exact pixel sizes the stores ask for.',
};

function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong while exporting.';
}

/** Export dialog; each opening starts from the project's saved export settings. */
export function ExportDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <ExportSession key={session} open={open} onOpenChange={onOpenChange} />;
}

function ExportSession({ open, onOpenChange }: EditorDialogProps) {
  const project = useEditorWhileOpen((s) => s.project, open);
  // The PNG worker holds memory between exports: free it when the dialog closes. Not when it
  // mounts closed, which happens with every editor and would cut off an export running elsewhere.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) disposePngWorker();
    wasOpen.current = open;
  }, [open]);
  if (!project) return null;
  return <ExportBody project={project} open={open} onOpenChange={onOpenChange} />;
}

function ExportBody({ project, open, onOpenChange }: EditorDialogProps & { project: Project }) {
  const [sizes, setSizes] = useState(() => initialSizes(project));
  const [languages, setLanguages] = useState(() => initialLanguages(project));
  const [format, setFormat] = useState<ExportSettings['format']>(project.export.format);
  const [quality, setQuality] = useState(project.export.jpegQuality);
  const [structure, setStructure] = useState<ExportStructure>(project.export.structure);
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [stopping, setStopping] = useState(false);
  const [preview, pushPreview, resetPreview] = usePreviewThrottle();
  const contentRef = useRef<HTMLDivElement>(null);
  const os = usePlatformOs();
  const platform = getPlatform();
  const isWeb = platform.kind === 'web';

  const liveSizes = useMemo(() => orderSizes(sizes, project.families), [sizes, project.families]);
  const liveLangs = useMemo(() => project.languages.filter((l) => languages.includes(l)), [languages, project.languages]);
  // Quality only changes file sizes, not paths, so the plan ignores it.
  const plan = useMemo(
    () => (liveSizes.length > 0 && liveLangs.length > 0 ? planExport(project, planSettings(liveSizes, liveLangs, format, 0.92, structure)) : EMPTY_PLAN),
    [project, liveSizes, liveLangs, format, structure],
  );
  const tree = useMemo(() => {
    const prefix = pathPrefix(structure, project.name);
    return folderTreePreview(plan.jobs.map((j) => prefix + j.path));
  }, [plan, structure, project.name]);
  const files = plan.jobs.length;
  const problem = selectionProblem(liveSizes, liveLangs, files);
  // Checked while the settings show (not during a run, which needs the main thread).
  const overflow = useTextOverflow(project, plan.jobs, open && (phase.name === 'setup' || phase.name === 'picking'));

  /* Saving choices: one history gesture for the whole session. */
  const gesture = useRef(false);
  const persist = useCallback((patch: Partial<ExportSettings>) => {
    const editor = useEditor.getState();
    if (!gesture.current) {
      editor.beginGesture();
      gesture.current = true;
    }
    editor.setExportSettings(patch);
  }, []);
  const endGesture = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = false;
    useEditor.getState().endGesture();
  }, []);
  useEffect(() => {
    if (!open) endGesture();
  }, [open, endGesture]);
  useEffect(() => endGesture, [endGesture]);

  // Handlers read the latest selection through a ref, so memoised rows keep stable callbacks.
  const latest = useRef({ sizes: liveSizes, languages: liveLangs, families: project.families, projectLangs: project.languages });
  useLayoutEffect(() => {
    latest.current = { sizes: liveSizes, languages: liveLangs, families: project.families, projectLangs: project.languages };
  });

  const onSizeChange = useCallback(
    (id: string, on: boolean) => {
      const { sizes: current, families } = latest.current;
      const next = orderSizes(toggled(current, id, on), families);
      setSizes(next);
      // [] would mean "defaults": an empty selection stays local and blocks the export instead.
      if (next.length > 0) persist({ sizes: sizesSetting(next, families) });
    },
    [persist],
  );
  const onLanguageChange = useCallback(
    (code: LangCode, on: boolean) => {
      const { languages: current, projectLangs } = latest.current;
      const wanted = toggled(current, code, on);
      const next = projectLangs.filter((l) => wanted.includes(l));
      setLanguages(next);
      if (next.length > 0) persist({ languages: languagesSetting(next, projectLangs) });
    },
    [persist],
  );
  const onFormatChange = useCallback(
    (next: ExportSettings['format']) => {
      setFormat(next);
      persist({ format: next });
    },
    [persist],
  );
  const onQualityChange = useCallback(
    (next: number, done: boolean) => {
      setQuality(next);
      if (done) persist({ jpegQuality: next });
    },
    [persist],
  );
  const onStructureChange = useCallback(
    (next: ExportStructure) => {
      setStructure(next);
      persist({ structure: next });
    },
    [persist],
  );

  /* Running ------------------------------------------------------------ */

  const run = useRef<{ controller: AbortController } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      run.current?.controller.abort();
      run.current = null;
    };
  }, []);

  // Closed some other way than through requestClose (the editor closing its dialogs): stop the run.
  useEffect(() => {
    if (open || !run.current) return;
    run.current.controller.abort();
    run.current = null;
  }, [open]);

  const start = useCallback(async () => {
    if (run.current || plan.jobs.length === 0) return;
    const current = { controller: new AbortController() };
    run.current = current;
    const live = () => alive.current && run.current === current;
    const total = plan.jobs.length;
    setStopping(false);
    resetPreview();
    setPhase({ name: 'picking' });
    try {
      const outcome = await runProjectExport(
        {
          project,
          settings: { format, jpegQuality: quality, structure },
          plan,
          signal: current.controller.signal,
          onStart: (target) => {
            if (live()) setPhase({ name: 'running', target, startedAt: performance.now(), progress: { done: 0, total, current: plan.jobs[0] ?? null } });
          },
          onProgress: (progress) => {
            if (live()) setPhase((p) => (p.name === 'running' ? { ...p, progress } : p));
          },
          onFile: (bytes, job) => {
            if (live()) pushPreview(bytes, job);
          },
        },
        { platform: getPlatform(), render: renderJobWithResult, flush: flushProject },
      );
      if (!live()) return;
      run.current = null;
      setPhase(outcome ? { name: 'done', outcome, total } : { name: 'setup' });
    } catch (err) {
      if (!live()) return;
      run.current = null;
      setPhase({ name: 'error', message: errorMessage(err) });
    }
  }, [plan, project, format, quality, structure, pushPreview, resetPreview]);

  const stop = useCallback(() => {
    if (!run.current) return;
    setStopping(true);
    run.current.controller.abort();
  }, []);

  const requestClose = useCallback(async () => {
    if (phase.name === 'picking') return;
    if (phase.name === 'running') {
      const ok = await confirmDialog({
        title: 'Stop the export?',
        message: isWeb
          ? 'The files rendered so far are not downloaded. You can export again any time.'
          : `Files already written to ${phase.target.label} stay there. You can export again any time.`,
        confirmLabel: 'Stop export',
        cancelLabel: 'Keep exporting',
        danger: true,
      });
      if (!ok) return;
      run.current?.controller.abort();
      run.current = null;
    }
    onOpenChange(false);
  }, [phase, isWeb, onOpenChange]);

  const jump = useCallback(
    (target: JumpTarget) => {
      onOpenChange(false);
      jumpTo(target);
    },
    [onOpenChange],
  );

  const reveal = useCallback(async (target: ExportTarget) => {
    try {
      await getPlatform().revealTarget(target);
    } catch (err) {
      toast.error('Could not open the folder', errorMessage(err));
    }
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (phase.name === 'setup' && !problem && matchShortcut(e, 'mod+enter', platformIsMac())) {
      e.preventDefault();
      void start();
    }
  };

  /* Layout -------------------------------------------------------------- */

  const projectFolder = sanitizeSegment(project.name);
  const targetName = exportTargetName(project.name);
  const treeCaption = isWeb
    ? structure === 'fastlane'
      ? `Inside ${targetName}.zip (unzip it in your app repository)`
      : `Inside ${targetName}.zip`
    : structure === 'fastlane'
      ? 'Inside your app repository'
      : 'Inside the folder you choose';
  const hint = isWeb
    ? `Downloads as “${targetName}.zip”.`
    : structure === 'fastlane'
      ? 'Choose your app repository next. Files go into its fastlane folder.'
      : `Choose a folder next. Files go into “${projectFolder}” inside it.`;

  let body;
  let footer;
  let footerStart;
  if (phase.name === 'setup' || phase.name === 'picking') {
    const busy = phase.name === 'picking';
    body = (
      <div className={`${BODY} grid grid-cols-[minmax(0,1fr)_304px]`}>
        <div className="min-h-0 overflow-y-auto">
          <ExportSettingsPanel
            project={project}
            sizes={liveSizes}
            languages={liveLangs}
            format={format}
            quality={quality}
            structure={structure}
            tree={tree}
            treeCaption={treeCaption}
            disabled={busy}
            onSizeChange={onSizeChange}
            onLanguageChange={onLanguageChange}
            onFormatChange={onFormatChange}
            onQualityChange={onQualityChange}
            onStructureChange={onStructureChange}
          />
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-panel light:bg-surface" aria-label="Export summary">
          <ExportSummaryPanel
            project={project}
            plan={plan}
            sizes={liveSizes}
            format={format}
            quality={quality}
            structure={structure}
            overflow={overflow}
            onJump={jump}
          />
        </aside>
      </div>
    );
    footerStart = problem ? <span className="truncate text-warning">{problem}</span> : <span className="truncate">{busy && !isWeb ? 'Waiting for you to choose a folder…' : hint}</span>;
    footer = (
      <>
        <Button onClick={() => void requestClose()} disabled={busy}>
          Cancel
        </Button>
        <Tooltip content="" shortcut="mod+enter">
          <Button variant="brand" leadingIcon={<Download />} loading={busy} disabled={!!problem} onClick={() => void start()}>
            {files > 0 ? `Export ${plural(files, 'file')}` : 'Export'}
          </Button>
        </Tooltip>
      </>
    );
  } else if (phase.name === 'running') {
    body = (
      <div className={BODY}>
        <ExportProgressView progress={phase.progress} startedAt={phase.startedAt} preview={preview} format={format} stopping={stopping} targetLabel={phase.target.label} />
      </div>
    );
    footerStart = <span className="truncate">{isWeb ? `Downloads as “${phase.target.label}.zip” when done.` : `Writing to ${phase.target.path ?? phase.target.label}`}</span>;
    footer = (
      <Button onClick={stop} disabled={stopping}>
        {stopping ? 'Stopping…' : 'Cancel'}
      </Button>
    );
  } else if (phase.name === 'done') {
    const { outcome } = phase;
    const canReveal = !isWeb && outcome.target.path !== null && outcome.report.written > 0;
    body = (
      <div className={BODY}>
        <ExportDoneView outcome={outcome} total={phase.total} downloaded={isWeb} onJump={jump} />
      </div>
    );
    footer = (
      <>
        {canReveal && (
          <Button leadingIcon={<FolderOpen />} onClick={() => void reveal(outcome.target)}>
            {os === 'windows' ? 'Show in Explorer' : os === 'linux' ? 'Open folder' : 'Show in Finder'}
          </Button>
        )}
        <Button onClick={() => setPhase({ name: 'setup' })}>Export again</Button>
        <Button variant="primary" onClick={() => onOpenChange(false)} autoFocus>
          Done
        </Button>
      </>
    );
  } else {
    body = (
      <div className={BODY}>
        <ExportErrorView message={phase.message} />
      </div>
    );
    footer = (
      <>
        <Button onClick={() => setPhase({ name: 'setup' })}>Back to settings</Button>
        <Button variant="primary" onClick={() => void start()} autoFocus>
          Try again
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose();
      }}
    >
      <DialogContent
        size="xl"
        icon={<Download />}
        title="Export screenshots"
        description={DESCRIPTIONS[phase.name]}
        flush
        footer={footer}
        footerStart={footerStart}
        onKeyDown={onKeyDown}
        ref={contentRef}
        onOpenAutoFocus={(e) => {
          // The first choice, not the first tabbable (an info button whose tooltip would pop up).
          const first = contentRef.current?.querySelector<HTMLElement>('button[role="checkbox"]:not([disabled])');
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** The last finished file for the live preview, at most every `intervalMs` (decoding a full-size PNG is not free). */
function usePreviewThrottle(intervalMs = 450) {
  const [preview, setPreview] = useState<ExportPreviewImage | null>(null);
  const pending = useRef<ExportPreviewImage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAt = useRef(0);

  const flush = useCallback(() => {
    timer.current = null;
    lastAt.current = performance.now();
    if (pending.current) setPreview(pending.current);
    pending.current = null;
  }, []);
  const push = useCallback(
    (bytes: Uint8Array, job: ExportJob) => {
      pending.current = { bytes, job };
      if (timer.current !== null) return;
      timer.current = setTimeout(flush, Math.max(0, intervalMs - (performance.now() - lastAt.current)));
    },
    [flush, intervalMs],
  );
  const reset = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setPreview(null);
  }, []);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return [preview, push, reset] as const;
}

/** The desktop OS, for "Show in Finder / Explorer"; null until known. */
function usePlatformOs(): OsKind | null {
  const [os, setOs] = useState<OsKind | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPlatform()
      .info()
      .then(
        (info) => {
          if (!cancelled) setOs(info.os);
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, []);
  return os;
}

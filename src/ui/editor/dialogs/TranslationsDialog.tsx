/**
 * Translations: every text of every slide in every language, as one table,
 * with an "only missing" filter, search, and CSV export / import for
 * spreadsheets and translators.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, Download, Languages, Search, Type, Upload, X } from 'lucide-react';
import { csvToTexts, decodeCsvBytes, textsToCsv } from '../../../export/csv';
import { sanitizeSegment } from '../../../export/paths';
import type { Project } from '../../../model/types';
import { getPlatform } from '../../../platform';
import { toast, useEditor } from '../../../store';
import { Button, Dialog, DialogContent, Divider, EmptyState, IconButton, Input, Kbd, Switch } from '../../kit';
import { openDialogFrom, useEditorWhileOpen, useOpenSession, useSettled } from './dialogState';
import { languageName, plural } from './labels';
import { TranslationsGrid } from './TranslationsGrid';
import { importPayload, importSummary, legacyCsvEncoding, matchesQuery, regroup, rowIsMissing, translationRows, translationStats } from './translationsModel';
import type { EditorDialogProps } from './types';

function message(err: unknown): string {
  if (typeof err === 'string') return err;
  return err instanceof Error && err.message ? err.message : 'Unknown error';
}

export function TranslationsDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <TranslationsSession key={session} open={open} onOpenChange={onOpenChange} />;
}

function TranslationsSession({ open, onOpenChange }: EditorDialogProps) {
  const project = useEditorWhileOpen((s) => s.project, open);
  if (!project) return null;
  return <TranslationsBody project={project} open={open} onOpenChange={onOpenChange} />;
}

function TranslationsBody({ project, open, onOpenChange }: EditorDialogProps & { project: Project }) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  // Rows that needed work when the filter was turned on: a row stays while
  // its last gap is being filled instead of vanishing mid-typing.
  const [missingSnapshot, setMissingSnapshot] = useState<ReadonlySet<string> | null>(null);
  const [busy, setBusy] = useState<'import' | 'export' | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const previewProject = useSettled(project, 500);
  const allRows = useMemo(() => translationRows(project), [project]);
  const stats = useMemo(() => translationStats(project, allRows), [project, allRows]);
  const hasTargets = project.languages.length > 1;

  const takeSnapshot = useCallback(() => {
    const p = useEditor.getState().project;
    if (!p) return;
    setMissingSnapshot(new Set(translationRows(p).filter((r) => rowIsMissing(p, r)).map((r) => r.id)));
  }, []);

  const rows = useMemo(() => {
    let list = allRows;
    if (onlyMissing && missingSnapshot) list = list.filter((r) => missingSnapshot.has(r.id));
    if (query.trim()) list = list.filter((r) => matchesQuery(project, r, query));
    return regroup(list);
  }, [allRows, onlyMissing, missingSnapshot, query, project]);

  const toggleMissing = (on: boolean) => {
    setOnlyMissing(on);
    if (on) takeSnapshot();
    else setMissingSnapshot(null);
  };

  const exportCsv = async () => {
    const p = useEditor.getState().project;
    if (!p || busy) return;
    setBusy('export');
    try {
      const platform = getPlatform();
      const saved = await platform.saveFile(`${sanitizeSegment(p.name)} translations.csv`, new TextEncoder().encode(textsToCsv(p)));
      if (saved) toast.success('Translations exported', platform.kind === 'web' ? `Downloaded ${saved}.` : saved);
    } catch (err) {
      toast.error('Could not export the translations', message(err));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const importCsv = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const file = await getPlatform().openFile('csv');
      const p = useEditor.getState().project;
      if (!file || !p) return;
      const text = decodeCsvBytes(file.data, legacyCsvEncoding(p.languages));
      let result;
      try {
        result = csvToTexts(p, text);
      } catch (err) {
        toast.error(`Could not import ${file.name || 'the file'}`, message(err));
        return;
      }
      const payload = importPayload(p, result);
      if (Object.keys(payload).length > 0) useEditor.getState().replaceTexts(payload, { addLanguages: true });
      const summary = importSummary(result);
      toast.push({ kind: summary.kind, title: summary.title, description: summary.description });
      if (alive.current && onlyMissing) takeSnapshot();
    } catch (err) {
      toast.error('Could not open the file', message(err));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  // Languages comes back here when it closes, with the new columns.
  const manageLanguages = () => openDialogFrom('translations', 'languages');

  const counter = hasTargets ? (
    <div className="flex items-center gap-2.5" aria-live="polite">
      <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div
          className={stats.translated === stats.total && stats.total > 0 ? 'h-full rounded-full bg-success' : 'h-full rounded-full bg-accent'}
          style={{ width: `${stats.total ? Math.round((stats.translated / stats.total) * 100) : 0}%` }}
        />
      </div>
      <span className="text-xs whitespace-nowrap text-text-2 tabular-nums">
        <span className="font-medium text-text">{stats.translated.toLocaleString('en-US')}</span> of {plural(stats.total, 'text')} translated
      </span>
    </div>
  ) : (
    <span className="text-xs whitespace-nowrap text-text-2">{plural(stats.rows, 'text')}</span>
  );

  let content;
  if (allRows.length === 0) {
    content = (
      <EmptyState
        className="h-full"
        icon={<Type />}
        title="No texts yet"
        description="Add a headline, subtitle or caption to a slide and it shows up here in every language."
      />
    );
  } else if (rows.length === 0) {
    content = query.trim() ? (
      <EmptyState
        className="h-full"
        icon={<Search />}
        title={`No texts match “${query.trim()}”`}
        description="Search looks at text names, slide numbers and every translation."
        actions={
          <Button
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        className="h-full"
        icon={<CircleCheck />}
        title="Everything is translated"
        description={`Every text has a translation in ${hasTargets ? 'every language' : languageName(project.languages[0])}.`}
        actions={<Button onClick={() => toggleMissing(false)}>Show all texts</Button>}
      />
    );
  } else {
    content = <TranslationsGrid project={project} previewProject={previewProject} rows={rows} stats={stats} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        icon={<Languages />}
        title="Translations"
        description="Edit every text in every language. Empty translations show the base text in the store screenshots."
        headerAction={
          <Button variant="ghost" size="sm" leadingIcon={<Languages />} onClick={manageLanguages}>
            Manage languages
          </Button>
        }
        flush
        bodyClassName="flex flex-col"
        onOpenAutoFocus={(e) => {
          // The search field, not the first tabbable: "Manage languages" in the header, which Enter would trigger.
          e.preventDefault();
          searchRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          // Escape in a filled search box clears it first; the next one closes.
          if (query && document.activeElement === searchRef.current) {
            e.preventDefault();
            setQuery('');
          }
        }}
        footerStart={
          <span className="flex items-center gap-3 truncate">
            <span className="flex items-center gap-1.5">
              <Kbd keys="enter" /> Next row
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd keys="shift+enter" /> New line
            </span>
            <span className="truncate">
              <span className="font-mono text-text">*word*</span> highlights a word
            </span>
          </span>
        }
        footer={
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        }
      >
        <div className="flex h-12 shrink-0 items-center gap-4 border-y border-line px-5">
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search texts"
            placeholder="Search texts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leadingIcon={<Search />}
            suffix={query ? <IconButton size="sm" label="Clear search" tooltip={false} icon={<X />} onClick={() => setQuery('')} className="-mr-1" /> : undefined}
            containerClassName="w-64"
          />
          <Switch label="Only missing" checked={onlyMissing} onCheckedChange={toggleMissing} disabled={allRows.length === 0} />
          <div className="flex-1" />
          {counter}
          <Divider orientation="vertical" className="my-3" />
          <div className="flex items-center gap-2">
            <Button size="md" leadingIcon={<Upload />} loading={busy === 'import'} disabled={busy !== null && busy !== 'import'} onClick={() => void importCsv()}>
              Import CSV
            </Button>
            <Button size="md" leadingIcon={<Download />} loading={busy === 'export'} disabled={(busy !== null && busy !== 'export') || allRows.length === 0} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          </div>
        </div>
        {!hasTargets && allRows.length > 0 && (
          <div className="flex shrink-0 items-center gap-3 border-b border-line bg-accent-soft px-5 py-2.5">
            <Languages aria-hidden className="size-4 shrink-0 text-accent-fg" />
            <p className="min-w-0 flex-1 text-xs text-text">
              This project has one language. Add languages to translate your screenshots, or import a CSV with more language columns.
            </p>
            <Button size="sm" variant="primary" onClick={manageLanguages}>
              Add languages
            </Button>
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-auto">{content}</div>
      </DialogContent>
    </Dialog>
  );
}

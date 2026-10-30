/**
 * Save as template: name, description, category and tags for the design of
 * the open project, with a preview of its first slides. The saved template
 * appears under "My templates" and can be exported as a .wajha-template file.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import { sanitizeSegment } from '../../../export/paths';
import { cleanName, cleanText, LIMITS } from '../../../model/rules';
import type { Project, Template, TemplateCategory } from '../../../model/types';
import { getPlatform } from '../../../platform';
import { renderThumbnail } from '../../../runtime';
import { exportTemplateArchive, listUserTemplates } from '../../../storage';
import { confirmDialog, saveProjectAsTemplate, toast, useEditor } from '../../../store';
import { BUILTIN_TEMPLATES } from '../../../templates';
import { Button, Dialog, DialogContent, Field, FIELD_SHELL, Input, Select, Textarea, cx, useFieldControl } from '../../kit';
import { SlidePreview } from '../../shared/SlidePreview';
import { slideHeight } from '../../shared/slideSize';
import { useEditorWhileOpen, useOpenSession } from './dialogState';
import { languageName } from './labels';
import { CATEGORY_OPTIONS, addTags, isCategory, removeTag, resolveTemplateId } from './templateForm';
import type { EditorDialogProps } from './types';

const PREVIEW_COUNT = 3;
const PREVIEW_MAX_H = 168;
const PREVIEW_MAX_W = 132;

function message(err: unknown): string {
  if (typeof err === 'string') return err;
  return err instanceof Error && err.message ? err.message : 'Unknown error';
}

/** Saves a template as a .wajha-template file (save dialog on desktop, download on the web). */
async function exportTemplateFile(template: Template): Promise<void> {
  try {
    const bytes = await exportTemplateArchive(template.id);
    const platform = getPlatform();
    const saved = await platform.saveFile(`${sanitizeSegment(template.name)}.wajha-template`, bytes);
    if (saved) toast.success('Template exported', platform.kind === 'web' ? `Downloaded ${saved}.` : saved);
  } catch (err) {
    toast.error('Could not export the template', message(err));
  }
}

export function SaveTemplateDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <SaveTemplateSession key={session} open={open} onOpenChange={onOpenChange} />;
}

function SaveTemplateSession({ open, onOpenChange }: EditorDialogProps) {
  const project = useEditorWhileOpen((s) => s.project, open);
  if (!project) return null;
  return <SaveTemplateBody project={project} open={open} onOpenChange={onOpenChange} />;
}

function defaultCategory(project: Project): TemplateCategory {
  const from = BUILTIN_TEMPLATES.find((t) => t.id === project.templateId)?.category;
  return isCategory(from) ? from : 'minimal';
}

function SaveTemplateBody({ project, open, onOpenChange }: EditorDialogProps & { project: Project }) {
  const formId = useId();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>(() => defaultCategory(project));
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const family = project.families[0];
  const base = project.languages[0];
  const count = Math.min(PREVIEW_COUNT, project.slides.length);
  // Height / width of the family canvas; tall slides are limited by height, wide ones by width.
  const aspect = slideHeight(family, 1000) / 1000;
  const previewWidth = Math.round(Math.min(PREVIEW_MAX_W, PREVIEW_MAX_H / aspect));

  const save = async () => {
    if (saving) return;
    const clean = cleanName(name);
    if (!clean) {
      setError('Give your template a name.');
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const mine = await listUserTemplates().catch(() => [] as Template[]);
      const { id, replaces } = resolveTemplateId(
        clean,
        new Set(BUILTIN_TEMPLATES.map((t) => t.id)),
        new Set(mine.map((t) => t.id)),
      );
      if (replaces) {
        const existing = mine.find((t) => t.id === id);
        const ok = await confirmDialog({
          title: `Replace “${existing?.name ?? clean}”?`,
          message: 'You already have a template with this name. Saving replaces its design, description and tags.',
          confirmLabel: 'Replace',
        });
        if (!ok) return;
      }
      const current = useEditor.getState().project;
      if (!current) throw new Error('No project is open.');
      let preview: Uint8Array | null = null;
      try {
        preview = await renderThumbnail(current);
      } catch (err) {
        console.warn('[templates] preview could not be rendered', err);
      }
      const template = await saveProjectAsTemplate({ id, name: clean, author: 'You', description: cleanText(description.trim()), category, tags }, preview);
      toast.push({
        kind: 'success',
        title: 'Template saved',
        description: `“${template.name}” is in My templates on the home screen.`,
        action: { label: 'Export file…', run: () => void exportTemplateFile(template) },
        duration: 9000,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save the template', message(err));
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        size="md"
        icon={<BookmarkPlus />}
        title="Save as template"
        description="Reuse this design in new projects, or share it as a file."
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
          nameRef.current?.select();
        }}
        footer={
          <>
            <Button onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!cleanName(name)}>
              Save template
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <figure className="flex flex-col gap-2">
            <div
              className="flex items-center justify-center gap-3 overflow-hidden rounded-lg border border-line bg-stage px-4 py-4"
              style={{ backgroundImage: 'radial-gradient(var(--stage-dot) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
            >
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-[6px] shadow-[var(--shadow-md)]">
                  <SlidePreview project={project} slideIndex={i} family={family} lang={base} width={previewWidth} />
                </div>
              ))}
            </div>
            <figcaption className="text-xs leading-4 text-text-3">
              Keeps the theme, layouts and {languageName(base)} texts as sample copy. Screenshots stay in this project.
            </figcaption>
          </figure>

          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Name" layout="stacked" error={error ?? undefined}>
              <Input
                ref={nameRef}
                value={name}
                maxLength={LIMITS.name}
                disabled={saving}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Sunset glow"
              />
            </Field>
            <Field label="Description" layout="stacked" trailing={<span className="text-2xs text-text-3">Optional</span>}>
              <Textarea
                value={description}
                autoGrow
                minRows={2}
                maxRows={5}
                maxLength={500}
                disabled={saving}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes this design special, which apps it suits…"
              />
            </Field>
            <div className="grid grid-cols-[168px_minmax(0,1fr)] gap-3">
              <Field label="Category" layout="stacked">
                <Select
                  value={category}
                  disabled={saving}
                  onValueChange={(v) => isCategory(v) && setCategory(v)}
                  options={CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label, description: c.description }))}
                />
              </Field>
              <Field label="Tags" layout="stacked" hint="Separate with commas">
                <TagInput tags={tags} onChange={setTags} disabled={saving} />
              </Field>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tags as chips; a comma, Enter or leaving the field turns the typed text into chips, Backspace removes the last. */
function TagInput({ tags, onChange, disabled }: { tags: string[]; onChange(tags: string[]): void; disabled?: boolean }) {
  const field = useFieldControl();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = tags.length >= LIMITS.tags;

  const commit = (text: string) => {
    if (text.trim()) onChange(addTags(tags, text));
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
      className={cx('flex min-h-7 w-full flex-wrap items-center gap-1 rounded-sm px-1 py-[3px] text-xs', FIELD_SHELL, disabled && 'pointer-events-none opacity-50')}
    >
      {tags.map((tag) => (
        <span key={tag} className="inline-flex h-5 max-w-full items-center gap-0.5 rounded-[4px] bg-surface-3 pr-0.5 pl-1.5 text-2xs font-medium text-text light:bg-surface-2">
          <span dir="auto" className="truncate">
            {tag}
          </span>
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(removeTag(tags, tag))}
            className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-text-3 outline-none hover:bg-field-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={field.id}
        dir="auto"
        value={draft}
        disabled={disabled || full}
        aria-describedby={field['aria-describedby']}
        placeholder={tags.length ? '' : full ? '' : 'fitness, dark'}
        onChange={(e) => {
          const value = e.target.value;
          const cut = Math.max(value.lastIndexOf(','), value.lastIndexOf('،'));
          if (cut >= 0) {
            onChange(addTags(tags, value.slice(0, cut)));
            setDraft(value.slice(cut + 1));
          } else setDraft(value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        className="h-5 min-w-12 flex-1 bg-transparent px-1 text-xs text-text outline-none placeholder:text-text-3"
      />
    </div>
  );
}

/**
 * Devices & stores: which device families the project designs for. One
 * card per family with its stores, canvas and store limit; the first
 * enabled family is the primary one the others adapt from.
 */
import { useId } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { FAMILIES, FAMILY_ORDER } from '../../../model/catalog';
import type { FamilyId, Project } from '../../../model/types';
import { confirmDialog, useEditor } from '../../../store';
import { Badge, Button, Dialog, DialogContent, Switch, Tooltip, cx } from '../../kit';
import { useEditorWhileOpen, useOpenSession } from './dialogState';
import { disableConfirmation, slideLimitLabel } from './familiesModel';
import { listJoin, plural, storeName } from './labels';
import { FamilyIcon } from './parts';
import type { EditorDialogProps } from './types';

export function FamiliesDialog({ open, onOpenChange }: EditorDialogProps) {
  const session = useOpenSession(open);
  return <FamiliesSession key={session} open={open} onOpenChange={onOpenChange} />;
}

function FamiliesSession({ open, onOpenChange }: EditorDialogProps) {
  const project = useEditorWhileOpen((s) => s.project, open);
  if (!project) return null;
  return <FamiliesBody project={project} open={open} onOpenChange={onOpenChange} />;
}

function FamiliesBody({ project, open, onOpenChange }: EditorDialogProps & { project: Project }) {
  const enabled = project.families;
  const primary = enabled[0];

  const toggle = async (family: FamilyId, on: boolean) => {
    const editor = useEditor.getState();
    if (on) {
      editor.enableFamily(family);
      return;
    }
    const p = editor.project;
    if (!p || p.families.length <= 1) return;
    const confirmation = disableConfirmation(p, family);
    if (confirmation) {
      const ok = await confirmDialog({ ...confirmation, confirmLabel: 'Turn off' });
      if (!ok) return;
    }
    useEditor.getState().disableFamily(family);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        icon={<MonitorSmartphone />}
        title="Devices & stores"
        description="Design once and every device adapts. Turn on the devices your app ships on."
        footerStart={<span className="truncate">{`${plural(enabled.length, 'device')}: ${listJoin(enabled.map((f) => FAMILIES[f].label))}`}</span>}
        footer={
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        }
      >
        <ul className="flex flex-col gap-2">
          {FAMILY_ORDER.map((family) => (
            <FamilyCard
              key={family}
              family={family}
              on={enabled.includes(family)}
              primary={family === primary}
              primaryLabel={FAMILIES[primary].label}
              ownSlides={project.slides.filter((s) => s.layouts[family]).length}
              slideCount={project.slides.length}
              last={enabled.length <= 1 && enabled.includes(family)}
              onToggle={(on) => void toggle(family, on)}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

interface FamilyCardProps {
  family: FamilyId;
  on: boolean;
  primary: boolean;
  primaryLabel: string;
  /** Slides that store their own layout for this family (designed by the template, or edited). */
  ownSlides: number;
  slideCount: number;
  /** The project's only family: cannot be turned off. */
  last: boolean;
  onToggle(on: boolean): void;
}

/** How a family relates to the primary one: it adapts from it, except on slides with a layout of their own. */
function adaptNote(primaryLabel: string, own: number, total: number): string {
  if (own === 0) return `Adapts from ${primaryLabel} until you change its layouts`;
  if (own >= total) return `Own layouts on every slide, independent of ${primaryLabel}`;
  return `Own layouts on ${own} of ${plural(total, 'slide')}; the rest adapt from ${primaryLabel}`;
}

function FamilyCard({ family, on, primary, primaryLabel, ownSlides, slideCount, last, onToggle }: FamilyCardProps) {
  const info = FAMILIES[family];
  const id = useId();
  const switchControl = <Switch id={id} checked={on} disabled={last} onCheckedChange={onToggle} aria-label={`${info.label}`} />;
  return (
    <li
      className={cx(
        'relative flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-[background-color,border-color,box-shadow] duration-(--dur) ease-out',
        on ? 'border-line bg-field shadow-[var(--highlight)] light:bg-raised light:shadow-sm' : 'border-dashed border-line-strong bg-transparent',
        primary && 'border-accent-line shadow-[inset_0_0_0_1px_var(--accent-line)] light:shadow-[inset_0_0_0_1px_var(--accent-line)]',
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border [&_svg]:size-[18px]',
          primary ? 'border-transparent bg-accent text-accent-text' : on ? 'border-line bg-surface-2 text-text light:bg-surface' : 'border-line bg-transparent text-text-3',
        )}
      >
        <FamilyIcon family={family} />
      </span>
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-default flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx('truncate text-ui font-medium', on ? 'text-text' : 'text-text-2')}>{info.label}</span>
          {info.stores.map((store) => (
            <Badge key={store} size="sm" variant="neutral">
              {storeName(store)}
            </Badge>
          ))}
          {primary && (
            <Badge size="sm" variant="accent">
              Primary
            </Badge>
          )}
        </span>
        <span className="text-xs text-text-3 tabular-nums">
          {info.design.width} × {info.design.height} canvas · {slideLimitLabel(family)} · {plural(info.sizes.length, 'export size')}
        </span>
        {primary ? (
          <span className="text-xs text-accent-fg">Primary — other devices adapt from its layouts</span>
        ) : on ? (
          <span className="text-xs text-text-3">{adaptNote(primaryLabel, ownSlides, slideCount)}</span>
        ) : null}
      </label>
      <span className="mt-2 flex shrink-0">
        {last ? (
          <Tooltip content="A project needs at least one device">
            <span className="flex">{switchControl}</span>
          </Tooltip>
        ) : (
          switchControl
        )}
      </span>
    </li>
  );
}

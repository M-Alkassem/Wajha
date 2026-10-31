import { useRef, type ReactNode } from 'react';
import { CaseUpper, Circle, CircleDashed, Heading1, ImagePlus, Plus, Shapes, Square, Type } from 'lucide-react';
import type { TextRole } from '../../../model/defaults';
import type { ElementKind, ShapeKind } from '../../../model/types';
import { resolveLayout, resolveText } from '../../../model/resolve';
import { pickAndImportImagesWithReport, type ImportReport } from '../../../runtime';
import { toast, useEditor, type AddElementInit } from '../../../store';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
} from '../../kit';
import { useEditorUi } from '../editorUi';
import { FRAME_ICONS } from '../familyMeta';
import { FAMILIES } from '../../../model/catalog';

import { t } from '../../../i18n';
/** Copy a new text layer starts with, so it is visible on the slide right away. */
const SAMPLE_TEXT: Record<TextRole, string> = {
  headline: t('Your headline'),
  subtitle: t('A short line about this screen'),
  caption: t('New'),
};

/** Images added at once from the picker (each becomes a layer). */
const MAX_IMAGES_AT_ONCE = 8;
/** Offset between images added together, fraction of the canvas. */
const IMAGE_STEP = 0.03;

function reportSkipped(report: ImportReport): void {
  if (!report.skipped.length) return;
  const first = report.skipped[0];
  const more = report.skipped.length > 1 ? ` (+${report.skipped.length - 1} more)` : '';
  toast.warning(report.skipped.length === 1 ? t('Skipped {name}', { name: first.name }) : t('Skipped {length} files', { length: report.skipped.length }), `${first.message}${more}`);
}

/** Adds a layer to the active slide and family; returns its id (it is selected by the store). */
function addLayer(kind: ElementKind, init?: AddElementInit): string | null {
  const s = useEditor.getState();
  if (!s.project || !s.activeSlideId) return null;
  const id = s.addElement(s.activeSlideId, s.activeFamily, kind, init);
  if (!id) toast.warning(t('Could not add the layer'), t('This slide already has as many layers as it can hold.'));
  return id;
}

/**
 * Adds a text layer. It gets sample copy unless its key already has words
 * on this slide (a headline shares its text with the other families).
 */
function addText(role: TextRole): string | null {
  const s = useEditor.getState();
  const p = s.project;
  const slide = p?.slides.find((x) => x.id === s.activeSlideId);
  if (!p || !slide) return null;
  const inLayout = resolveLayout(p, slide, s.activeFamily).elements.some((e) => e.kind === 'text' && e.key === role);
  const keepsText = role !== 'caption' && !inLayout && resolveText(slide, role, s.activeLang, p.languages[0]) !== '';
  return addLayer('text', keepsText ? { role } : { role, text: SAMPLE_TEXT[role] });
}

/** Picks images and adds each one as an image layer, slightly staggered; the last is selected. */
async function addImages(): Promise<void> {
  const project = useEditor.getState().project;
  if (!project) return;
  let report: ImportReport;
  try {
    report = await pickAndImportImagesWithReport(project.id);
  } catch (err) {
    toast.error(t('Could not import images'), err instanceof Error ? err.message : String(err));
    return;
  }
  reportSkipped(report);
  const s = useEditor.getState();
  if (!report.assets.length || s.project?.id !== project.id) return;
  // Only images that become layers join the project; the other picked files go with the next prune.
  const assets = report.assets.slice(0, MAX_IMAGES_AT_ONCE);
  s.addAssets(assets);
  assets.forEach((asset, i) => {
    const offset = (i - (assets.length - 1) / 2) * IMAGE_STEP;
    addLayer('image', { assetId: asset.id, patch: offset ? { x: 0.5 + offset, y: 0.5 + offset } : undefined });
  });
  if (report.assets.length > MAX_IMAGES_AT_ONCE) {
    toast.info(t('Added the first {MAX_IMAGES_AT_ONCE} images', { MAX_IMAGES_AT_ONCE }), t('Up to {MAX_IMAGES_AT_ONCE} images can be added at a time.', { MAX_IMAGES_AT_ONCE }));
  }
}

const SHAPES: { shape: ShapeKind; label: string; icon: ReactNode }[] = [
  { shape: 'circle', label: t('Circle'), icon: <Circle /> },
  { shape: 'rect', label: t('Rounded rect'), icon: <Square /> },
  { shape: 'blob', label: t('Blob'), icon: <Shapes /> },
  { shape: 'ring', label: t('Ring'), icon: <CircleDashed /> },
];

export interface AddElementMenuProps {
  /** icon: a small "+" for the panel header; button: a labelled button for empty states. */
  variant?: 'icon' | 'button';
  align?: 'start' | 'end';
}

/** "Add layer" menu: text presets, a device, shapes and images, added to the active slide and selected. */
export function AddElementMenu({ variant = 'icon', align = 'end' }: AddElementMenuProps) {
  const family = useEditor((s) => s.activeFamily);
  // A new text layer asks the inspector for its text field once the menu has let go of focus.
  const focusText = useRef<string | null>(null);
  const DeviceIcon = FRAME_ICONS[FAMILIES[family].defaultFrame];

  const text = (role: TextRole) => {
    focusText.current = addText(role);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <IconButton label={t('Add layer')} icon={<Plus />} size="sm" className="aria-expanded:bg-surface-2 aria-expanded:text-text" />
        ) : (
          <Button size="sm" leadingIcon={<Plus />}>
            {t('Add layer')}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-[208px]"
        onCloseAutoFocus={(e) => {
          const id = focusText.current;
          focusText.current = null;
          if (!id) return;
          e.preventDefault();
          useEditorUi.getState().requestTextFocus(id);
        }}
      >
        <DropdownMenuItem icon={<Heading1 />} onSelect={() => text('headline')}>
          {t('Headline')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Type />} onSelect={() => text('subtitle')}>
          {t('Subtitle')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<CaseUpper />} onSelect={() => text('caption')}>
          {t('Caption')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<DeviceIcon />} onSelect={() => addLayer('device')}>
          {t('Device')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<Shapes />}>{t('Shape')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[176px]">
            {SHAPES.map((s) => (
              <DropdownMenuItem key={s.shape} icon={s.icon} onSelect={() => addLayer('shape', { shape: s.shape })}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem icon={<ImagePlus />} onSelect={() => void addImages()}>
          {t('Image…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

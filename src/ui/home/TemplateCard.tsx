import { memo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Check, Download, ImageOff, Plus } from 'lucide-react';
import type { GalleryEntry, Template } from '../../model/types';
import { Badge, cx, ProgressBar, Skeleton, Tooltip } from '../kit';
import { useGalleryPreview } from './galleryPreview';
import { useInView, useTruncationTooltip } from './hooks';
import { SlideStrip } from './SlideStrip';
import { categoryLabel, templatePreviewProject } from './templates';

/** Shell of every template tile; selection draws an accent ring over the border. */
const TILE =
  'group/tpl relative flex flex-col rounded-lg border border-line bg-surface p-1.5 shadow-[var(--highlight)] light:bg-raised light:shadow-sm ' +
  'transition-[border-color,box-shadow,translate] duration-(--dur) ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg motion-reduce:hover:translate-y-0';
const TILE_SELECTED = 'border-transparent ring-2 ring-accent hover:border-transparent';
/** The tile's button. Violet already means "selected" here, so the keyboard ring is neutral and further out. */
const HIT =
  'absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-text';
const WELL_BASE = 'relative overflow-hidden rounded-[6px] bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]';
const WELL = `${WELL_BASE} p-3`;

export const TEMPLATE_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-4';

type TextRef = RefObject<HTMLSpanElement | null>;

interface TileNames {
  title: string;
  subtitle: string;
  /** The footer's title and subtitle elements, measured to tell whether they are cut off. */
  titleRef?: TextRef;
  subtitleRef?: TextRef;
}

/** The tile's button with a tooltip that shows its names in full when the footer truncates them. */
function NamesTooltip({ title, subtitle, titleRef, subtitleRef, children }: Required<TileNames> & { children: ReactElement }) {
  const tip = useTruncationTooltip([titleRef, subtitleRef]);
  const content = (
    <span className="flex flex-col">
      <span dir="auto">{title}</span>
      <span dir="auto" className="font-normal opacity-75">
        {subtitle}
      </span>
    </span>
  );
  return (
    <Tooltip content={content} side="bottom" align="start" open={tip.open} onOpenChange={tip.onOpenChange}>
      {children}
    </Tooltip>
  );
}

function SelectedCheck() {
  return (
    <span className="absolute top-2.5 right-2.5 z-[2] flex size-5 items-center justify-center rounded-full bg-accent text-accent-text shadow-md">
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

export interface TemplateCardProps {
  template: Template;
  selected?: boolean;
  onSelect(): void;
  /** Double-click (or Enter on the selected tile): use it right away. */
  onActivate?(): void;
  /** Extra badge beside the category (e.g. "Yours"). */
  badge?: ReactNode;
  /** A "…" menu in the footer row, above the tile's hit area. */
  menu?: ReactNode;
  busy?: boolean;
  /** select (default): a choice in a picker; action: clicking starts something (no pressed state). */
  mode?: 'select' | 'action';
}

/** A template with a live strip of its first three slides (iPhone, English). */
export const TemplateCard = memo(function TemplateCard({ template, selected = false, onSelect, onActivate, badge, menu, busy = false, mode = 'select' }: TemplateCardProps) {
  const project = templatePreviewProject(template, 'iphone', 'en-US');
  const described = `${template.name}, ${categoryLabel(template.category)} template${template.author ? ` by ${template.author}` : ''}`;
  const titleRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const names = { title: template.name, subtitle: template.author ? `by ${template.author}` : 'Template', titleRef, subtitleRef };
  return (
    <div className={cx(TILE, selected && TILE_SELECTED, busy && 'opacity-60')}>
      <NamesTooltip {...names}>
        <button
          type="button"
          data-tile=""
          aria-pressed={mode === 'select' ? selected : undefined}
          aria-label={mode === 'select' ? described : `Start a project from ${described}`}
          onClick={() => (selected && onActivate ? undefined : onSelect())}
          onDoubleClick={() => onActivate?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && selected && onActivate) {
              e.preventDefault();
              onActivate();
            }
          }}
          className={HIT}
        />
      </NamesTooltip>
      <div aria-hidden className={WELL}>
        <SlideStrip project={project} family="iphone" lang="en-US" count={3} gap={6} slideClassName="shadow-md" />
      </div>
      {selected && <SelectedCheck />}
      <TileFooter {...names} badge={badge ?? <Badge size="sm">{categoryLabel(template.category)}</Badge>} menu={menu} />
    </div>
  );
});

function TileFooter({ title, subtitle, titleRef, subtitleRef, badge, menu }: TileNames & { badge?: ReactNode; menu?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2.5 pr-0.5 pb-1 pl-1.5">
      <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span ref={titleRef} dir="auto" className="truncate text-left text-ui leading-5 font-medium text-text">
          {title}
        </span>
        <span ref={subtitleRef} dir="auto" className="truncate text-left text-xs leading-4 text-text-3">
          {subtitle}
        </span>
      </div>
      {badge && <span className="flex shrink-0 items-center gap-1">{badge}</span>}
      {menu && <span className="relative z-[2] flex shrink-0">{menu}</span>}
    </div>
  );
}

/** "Blank": three empty slide outlines. */
export function BlankCard({ selected, onSelect, onActivate }: { selected: boolean; onSelect(): void; onActivate?(): void }) {
  return (
    <div className={cx(TILE, selected && TILE_SELECTED)}>
      <button
        type="button"
        data-tile=""
        aria-pressed={selected}
        aria-label="Blank project, start from scratch"
        onClick={() => (selected && onActivate ? undefined : onSelect())}
        onDoubleClick={() => onActivate?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && selected && onActivate) {
            e.preventDefault();
            onActivate();
          }
        }}
        className={HIT}
      />
      <div aria-hidden className={WELL}>
        <div className="flex w-full justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex aspect-[1320/2868] w-[calc((100%-12px)/3)] items-center justify-center rounded-[6px] border border-dashed border-line-strong bg-surface"
            >
              {i === 1 && (
                <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-text-2 transition-colors duration-(--dur) group-hover/tpl:text-text">
                  <Plus className="size-4" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {selected && <SelectedCheck />}
      <TileFooter title="Blank" subtitle="Start from scratch" />
    </div>
  );
}

export interface GalleryCardProps {
  entry: GalleryEntry;
  installed: boolean;
  installing: boolean;
  selected: boolean;
  onUse(): void;
}

/** A community template: its preview image, then "Use template" downloads it into My templates. */
export const GalleryCard = memo(function GalleryCard({ entry, installed, installing, selected, onUse }: GalleryCardProps) {
  const wellRef = useRef<HTMLDivElement>(null);
  const visible = useInView(wellRef);
  const preview = useGalleryPreview(entry, visible);
  // Checked bytes the webview still could not decode.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const src = preview.url !== brokenUrl ? preview.url : null;
  const titleRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const names = { title: entry.name, subtitle: entry.author ? `by ${entry.author}` : 'Community', titleRef, subtitleRef };
  return (
    <div className={cx(TILE, selected && TILE_SELECTED)}>
      <NamesTooltip {...names}>
        <button
          type="button"
          data-tile=""
          aria-pressed={selected}
          aria-busy={installing || undefined}
          aria-label={`${installed ? 'Use' : 'Download and use'} ${entry.name}${entry.author ? ` by ${entry.author}` : ''}`}
          onClick={onUse}
          className={HIT}
        />
      </NamesTooltip>
      <div ref={wellRef} aria-hidden className={cx(WELL_BASE, 'aspect-[16/10]')}>
        {src ? (
          <img src={src} alt="" decoding="async" draggable={false} onError={() => setBrokenUrl(src)} className="home-fade absolute inset-0 size-full object-cover" />
        ) : (
          preview.state !== 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[image:var(--brand-gradient-soft)] text-text-3">
              <ImageOff className="size-5" />
              <span className="text-2xs">No preview</span>
            </div>
          )
        )}
        {installing ? (
          <div className="absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-1.5 bg-[var(--glass)] px-3 py-2.5 backdrop-blur-md">
            <span className="text-2xs font-medium text-text">Downloading…</span>
            <ProgressBar value={null} size="sm" label={`Downloading ${entry.name}`} />
          </div>
        ) : (
          !installed && (
            <span className="absolute right-2 bottom-2 flex h-6 items-center gap-1 rounded-full bg-[var(--glass)] px-2.5 text-2xs font-medium text-text opacity-0 shadow-md backdrop-blur-md transition-opacity duration-(--dur-fast) group-focus-within/tpl:opacity-100 group-hover/tpl:opacity-100">
              <Download className="size-3" />
              Use template
            </span>
          )
        )}
      </div>
      {selected && <SelectedCheck />}
      <TileFooter
        {...names}
        badge={
          installed ? (
            <Badge size="sm" variant="success">
              Installed
            </Badge>
          ) : (
            <Badge size="sm">{categoryLabel(entry.category)}</Badge>
          )
        }
      />
    </div>
  );
});

/** Tiles while a source loads. */
export function TemplateGridSkeleton({ count = 6, image = false }: { count?: number; image?: boolean }) {
  return (
    <div aria-hidden className={TEMPLATE_GRID_CLASS}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col rounded-lg border border-line bg-surface p-1.5 light:bg-raised">
          {image ? (
            <Skeleton height="auto" radius="sm" className="aspect-[16/10] w-full" />
          ) : (
            <div className="flex gap-1.5 rounded-[6px] bg-surface-2 p-3">
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} height="auto" radius="sm" className="aspect-[1320/2868] flex-1 bg-surface-3" />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 px-1.5 pt-3 pb-2">
            <Skeleton width="55%" height={11} />
            <Skeleton width="35%" height={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

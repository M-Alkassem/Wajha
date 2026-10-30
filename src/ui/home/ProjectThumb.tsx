import { memo, useEffect, useRef, useState } from 'react';
import type { FamilyId } from '../../model/types';
import { thumbnailLayout, type ThumbnailLayout } from '../../runtime';
import { cx, Spinner } from '../kit';
import { hashVariant, projectInitials } from './format';
import { useInView } from './hooks';
import { requestThumbnail, slideBackgrounds, useProjectThumbnail } from './thumbs';

/** The picture's well, like a template tile's: 16:10, 12 px padding, slides 6 px apart. */
const WELL_ASPECT = 16 / 10;
const WELL_PAD = 12;
const WELL_GAP = 6;

export interface ProjectThumbProps {
  id: string;
  name: string;
  updatedAt: number;
  /** The project's families; the thumbnail shows the first. */
  families: readonly FamilyId[];
  /** Shows the "Opening…" veil. */
  opening?: boolean;
  className?: string;
}

interface Decoded {
  url: string;
  width: number;
  height: number;
}

/**
 * The card's picture: the first slides cut out of the saved thumbnail and
 * laid out on a themed well like the template tiles' strips (faded in once
 * decoded), or a soft brand-tinted placeholder with the project's initials
 * while there is no usable thumbnail.
 */
export const ProjectThumb = memo(function ProjectThumb({ id, name, updatedAt, families, opening = false, className }: ProjectThumbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const thumb = useProjectThumbnail(id, updatedAt, visible);
  // The last decoded thumbnail stays up while a newer one loads.
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const layout = thumb.url && decoded ? thumbnailLayout(decoded.width, decoded.height, families) : null;
  // Drawn in another layout (an older version, another first family), or unreadable: draw it again.
  const unusable = thumb.url !== null && decoded?.url === thumb.url && !layout;

  useEffect(() => {
    if (unusable && visible) requestThumbnail(id, updatedAt, true);
  }, [id, updatedAt, unusable, visible]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cx(
        'relative w-full overflow-hidden bg-surface-2',
        // A hairline on top of the picture keeps its edge crisp on any card colour.
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--line)]',
        className,
      )}
      style={{ aspectRatio: WELL_ASPECT }}
    >
      {(thumb.state === 'missing' || unusable) && <ThumbPlaceholder id={id} name={name} />}
      {/* Only read for its size; the slides below paint the same decoded image. */}
      {thumb.url && (
        <img
          src={thumb.url}
          alt=""
          hidden
          onLoad={(e) => setDecoded({ url: e.currentTarget.src, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          onError={(e) => setDecoded({ url: e.currentTarget.src, width: 0, height: 0 })}
        />
      )}
      {layout && decoded && <ThumbSlides url={decoded.url} width={decoded.width} layout={layout} />}
      {opening && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[var(--overlay)]">
          <span className="flex h-7 items-center gap-2 rounded-full border border-line bg-[var(--glass)] px-3 text-xs font-medium text-text shadow-md backdrop-blur-md">
            <Spinner size={13} label={null} />
            Opening…
          </span>
        </div>
      )}
    </div>
  );
});

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The thumbnail's slides side by side in the well, with the template strips' corners and shadow. */
function ThumbSlides({ url, width, layout }: { url: string; width: number; layout: ThumbnailLayout }) {
  const { slideWidth: w, slideHeight: h, lefts } = layout;
  const n = lefts.length;
  // As wide as the row allows, or as the well's height does (the well is 1 / WELL_ASPECT as tall as wide, both less the padding).
  const byHeight = `(${round4(100 / WELL_ASPECT)}% - ${round4(2 * WELL_PAD * (1 - 1 / WELL_ASPECT))}px) * ${round4(w / h)}`;
  const slotWidth = `min(calc((100% - ${(n - 1) * WELL_GAP}px) / ${n}), calc(${byHeight}))`;
  // Corners 7.5% of the shorter side, as on the store and in the template strips.
  const r = 0.075 * Math.min(w, h);
  const borderRadius = `${round4((r / w) * 100)}% / ${round4((r / h) * 100)}%`;
  const backgroundImage = `url("${url}")`;
  return (
    <div className="home-fade absolute inset-0 flex items-center justify-center" style={{ padding: WELL_PAD, gap: WELL_GAP }}>
      {slideBackgrounds(width, layout).map((background, i) => (
        <span
          key={i}
          data-thumb-slide=""
          className="shrink-0 bg-no-repeat shadow-md"
          style={{ width: slotWidth, aspectRatio: `${w} / ${h}`, borderRadius, backgroundImage, ...background }}
        />
      ))}
    </div>
  );
}

/** Blob positions and brand colours of the placeholder variants. */
const VARIANTS: ReadonlyArray<{ a: string; b: string; at: [string, string]; bt: [string, string] }> = [
  { a: 'var(--brand-violet)', b: 'var(--brand-pink)', at: ['-18%', '-38%'], bt: ['48%', '42%'] },
  { a: 'var(--brand-pink)', b: 'var(--brand-orange)', at: ['46%', '-40%'], bt: ['-20%', '40%'] },
  { a: 'var(--accent)', b: 'var(--brand-violet)', at: ['-24%', '30%'], bt: ['50%', '-36%'] },
  { a: 'var(--brand-orange)', b: 'var(--accent)', at: ['40%', '34%'], bt: ['-16%', '-42%'] },
];

/** Initials on two soft colour glows, varied per project. */
export function ThumbPlaceholder({ id, name, className }: { id: string; name: string; className?: string }) {
  const v = VARIANTS[hashVariant(id, VARIANTS.length)];
  const initials = projectInitials(name);
  return (
    <div aria-hidden className={cx('absolute inset-0 flex items-center justify-center overflow-hidden bg-surface-2', className)}>
      <div
        className="absolute h-[130%] w-[78%] opacity-55 light:opacity-45"
        style={{ left: v.at[0], top: v.at[1], background: `radial-gradient(closest-side, ${v.a}, transparent)` }}
      />
      <div
        className="absolute h-[120%] w-[70%] opacity-45 light:opacity-35"
        style={{ left: v.bt[0], top: v.bt[1], background: `radial-gradient(closest-side, ${v.b}, transparent)` }}
      />
      {initials && (
        <span dir="auto" className="relative font-display text-[30px] leading-none font-semibold tracking-[-0.03em] text-text opacity-90">
          {initials}
        </span>
      )}
    </div>
  );
}

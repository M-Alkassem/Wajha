import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ArrowLeftRight, ImageOff, ImagePlus, Plus, RotateCw, Trash2 } from 'lucide-react';
import type { Fill, GradientStop } from '../../model/types';
import { Button } from './Button';
import { ColorChip, ColorField } from './ColorField';
import { cx } from './cx';
import { IconButton } from './IconButton';
import { NumberField } from './NumberField';
import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { Switch } from './Switch';
import {
  FILL_TYPES,
  FILL_TYPE_LABEL,
  MAX_MESH_POINTS,
  MAX_STOPS,
  MIN_STOPS,
  addMeshPoint,
  addStop,
  convertFill,
  describeFill,
  fillToCss,
  moveStop,
  normalizeAngle,
  removeMeshPoint,
  removeStop,
  reverseStops,
  setStopColor,
  sortStopsKeepSelection,
  stopsToCss,
  updateMeshPoint,
  type FillType,
  type ImageFill,
} from './fill';

import { t } from '../../i18n';
export interface FillEditorProps {
  value: Fill;
  /** Live updates (drags call it on every move). */
  onChange: (fill: Fill) => void;
  /** Once per finished interaction, after the last onChange of it. */
  onCommit?: (fill: Fill) => void;
  /**
   * Escape while one of its number fields is scrubbing: the app puts back the
   * fill from before the scrub, without an undo step (see NumberField).
   * Without it, the field puts its start value back through onChange.
   */
  onScrubCancel?: () => void;
  /** Theme palette for the colour pickers and new stops/points. */
  palette?: readonly string[];
  /**
   * Lets the user choose an image; resolve with the new asset id (or null
   * when cancelled). Without it the Image tab is disabled.
   */
  onPickImage?: () => Promise<string | null | undefined> | string | null | undefined | void;
  /** Preview URL for an image asset (e.g. an object URL from the image cache). */
  getImageUrl?: (assetId: string) => string | null | undefined;
  /** Fill types offered (default: all five). */
  types?: readonly FillType[];
  /** Width / height of the preview box, clamped to 1.2..3 (default 2). */
  previewAspect?: number;
  disabled?: boolean;
  className?: string;
}

type FillOf<T extends FillType> = Extract<Fill, { type: T }>;

const pct = (v: number) => Math.round(v * 1000) / 10;

/**
 * Editor for the model's Fill: solid, linear and radial gradients with a
 * draggable stop bar, mesh gradients with draggable points, and image fills.
 * Switching types carries colours across and remembers what each type looked
 * like, so flipping back and forth is lossless within a session.
 */
export function FillEditor({
  value,
  onChange,
  onCommit,
  onScrubCancel,
  palette = [],
  onPickImage,
  getImageUrl,
  types = FILL_TYPES,
  previewAspect = 2,
  disabled = false,
  className,
}: FillEditorProps) {
  const latest = useRef<Fill>(value);
  const dirty = useRef(false);
  const handlers = useRef({ onChange, onCommit, onScrubCancel });
  useLayoutEffect(() => {
    handlers.current = { onChange, onCommit, onScrubCancel };
  });
  const cache = useRef<Partial<Record<FillType, Fill>>>({});
  const lastAsset = useRef<string | null>(value.type === 'image' ? value.assetId : null);
  useLayoutEffect(() => {
    // A value we did not emit came from elsewhere (undo, another selection):
    // the remembered per-type fills belong to the old one and must go.
    if (value !== latest.current) {
      cache.current = {};
      lastAsset.current = value.type === 'image' ? value.assetId : null;
    }
    latest.current = value;
  }, [value]);
  const [stopIndex, setStopIndex] = useState(0);
  const [pointIndex, setPointIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const change = useCallback((next: Fill) => {
    latest.current = next;
    dirty.current = true;
    handlers.current.onChange(next);
  }, []);

  const commit = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    handlers.current.onCommit?.(latest.current);
  }, []);

  // Unmounting mid-drag (the selection changed) still ends the interaction once.
  useEffect(() => () => commit(), [commit]);

  // Where a number field's scrub started, so Escape can leave things as they were.
  const scrubStart = useRef<{ fill: Fill; dirty: boolean } | null>(null);
  const startScrub = useCallback(() => {
    scrubStart.current = { fill: latest.current, dirty: dirty.current };
  }, []);
  const cancelScrub = useCallback(() => {
    const start = scrubStart.current;
    scrubStart.current = null;
    // The app puts the fill back; the scrub's changes are not ours to commit any more.
    if (start) {
      latest.current = start.fill;
      dirty.current = start.dirty;
    }
    handlers.current.onScrubCancel?.();
  }, []);
  // For the scrubbable fields. Without the app's cancel, NumberField reverts through onChange itself.
  const scrub = { onScrubStart: startScrub, onScrubCancel: onScrubCancel ? cancelScrub : undefined };

  const update = <T extends FillType>(type: T, fn: (f: FillOf<T>) => Fill) => {
    const f = latest.current;
    if (f.type !== type) return;
    change(fn(f as FillOf<T>));
  };

  const aspect = Math.min(3, Math.max(1.2, Number.isFinite(previewAspect) ? previewAspect : 2));

  /* Type switching ------------------------------------------------------- */

  // Each switch or replace takes a ticket; a slow image pick that resolves
  // after the user moved on (picked another type) must not override them.
  const ticket = useRef(0);

  const pickImage = async (): Promise<string | null> => {
    if (!onPickImage) return null;
    setPicking(true);
    try {
      const id = await onPickImage();
      return typeof id === 'string' && id ? id : null;
    } catch {
      // The app reports its own picker failures; here a failed pick is a cancelled one.
      return null;
    } finally {
      if (mounted.current) setPicking(false);
    }
  };

  const switchType = async (to: FillType) => {
    const from = latest.current;
    if (from.type === to) return;
    const mine = ++ticket.current;
    let next = cache.current[to] ?? null;
    if (!next) {
      if (to === 'image') {
        const asset = lastAsset.current ?? (await pickImage());
        if (!asset || !mounted.current || mine !== ticket.current) return;
        lastAsset.current = asset;
        next = convertFill(from, 'image', { assetId: asset, palette });
      } else {
        next = convertFill(from, to, { palette });
      }
    }
    if (!next) return;
    cache.current[from.type] = from;
    setStopIndex(0);
    setPointIndex(0);
    change(next);
    commit();
  };

  const replaceImage = async () => {
    const mine = ++ticket.current;
    const asset = await pickImage();
    if (!asset || !mounted.current || mine !== ticket.current) return;
    lastAsset.current = asset;
    const f = latest.current;
    change(f.type === 'image' ? { ...f, assetId: asset } : (convertFill(f, 'image', { assetId: asset, palette }) ?? f));
    commit();
  };

  /* Render ---------------------------------------------------------------- */

  const fill = value;
  const stops = fill.type === 'linear' || fill.type === 'radial' ? fill.stops : [];
  const sel = Math.min(Math.max(0, stopIndex), Math.max(0, stops.length - 1));
  const selectedStop: GradientStop | undefined = stops[sel];
  const points = fill.type === 'mesh' ? fill.points : [];
  const pointSel = Math.min(Math.max(0, pointIndex), Math.max(0, points.length - 1));
  const imageUrl = fill.type === 'image' ? (getImageUrl?.(fill.assetId) ?? null) : null;

  const handles: PreviewHandle[] =
    fill.type === 'radial'
      ? [{ x: fill.cx, y: fill.cy, label: t('Gradient centre'), selected: true }]
      : fill.type === 'mesh'
        ? fill.points.map((p, i) => ({ x: p.x, y: p.y, color: p.color, label: t('Point {v}', { v: i + 1 }), selected: i === pointSel }))
        : [];

  const onHandleMove = (index: number, x: number, y: number) => {
    if (fill.type === 'radial') update('radial', (f) => ({ ...f, cx: round3(x), cy: round3(y) }));
    else if (fill.type === 'mesh') update('mesh', (f) => ({ ...f, points: updateMeshPoint(f.points, index, { x, y }) }));
  };

  const typeOptions = types.map((t) => ({
    value: t,
    label: FILL_TYPE_LABEL[t],
    disabled: t === 'image' && !onPickImage && fill.type !== 'image',
  }));

  return (
    <div
      className={cx('flex min-w-0 flex-col gap-2.5', disabled && 'pointer-events-none opacity-50', className)}
      aria-disabled={disabled || undefined}
      // inert also takes the controls out of the tab order, which pointer-events alone does not.
      inert={disabled || undefined}
    >
      {types.length > 1 && (
        <SegmentedControl<FillType>
          aria-label={t('Fill type')}
          size="sm"
          fullWidth
          value={fill.type}
          options={typeOptions}
          onValueChange={(t) => void switchType(t)}
        />
      )}

      <FillPreview
        fill={fill}
        aspect={aspect}
        imageUrl={imageUrl}
        handles={handles}
        onHandleSelect={(i) => fill.type === 'mesh' && setPointIndex(i)}
        onHandleMove={onHandleMove}
        onHandleEnd={commit}
        picking={picking}
      />

      {fill.type === 'solid' && (
        <ColorField
          label={t('Fill colour')}
          value={fill.color}
          palette={palette}
          onChange={(color) => update('solid', (f) => ({ ...f, color }))}
          onCommit={commit}
        />
      )}

      {(fill.type === 'linear' || fill.type === 'radial') && (
        <>
          <GradientBar
            stops={stops}
            selected={sel}
            onSelect={setStopIndex}
            onStopsChange={(next, nextSel) => {
              setStopIndex(nextSel);
              const f = latest.current;
              if (f.type === 'linear' || f.type === 'radial') change({ ...f, stops: next });
            }}
            onCommit={commit}
          />
          {selectedStop && (
            <div className="flex items-center gap-1.5">
              <ColorField
                className="min-w-0 flex-1"
                label={t('Stop {v} colour', { v: sel + 1 })}
                value={selectedStop.color}
                palette={palette}
                onChange={(color) => {
                  const f = latest.current;
                  if (f.type === 'linear' || f.type === 'radial') change({ ...f, stops: setStopColor(f.stops, sel, color) });
                }}
                onCommit={commit}
              />
              <NumberField
                aria-label={t('Stop {v} position', { v: sel + 1 })}
                className="w-[68px] shrink-0"
                value={pct(selectedStop.offset)}
                min={0}
                max={100}
                step={1}
                precision={1}
                unit="%"
                onChange={(v) => {
                  const f = latest.current;
                  if (f.type === 'linear' || f.type === 'radial') change({ ...f, stops: moveStop(f.stops, sel, v / 100) });
                }}
                onCommit={() => {
                  const f = latest.current;
                  if (f.type === 'linear' || f.type === 'radial') {
                    const sorted = sortStopsKeepSelection(f.stops, sel);
                    setStopIndex(sorted.selected);
                    change({ ...f, stops: sorted.stops });
                  }
                  commit();
                }}
              />
              <IconButton
                label={t('Remove stop')}
                size="md"
                icon={<Trash2 />}
                disabled={stops.length <= MIN_STOPS}
                onClick={() => {
                  const f = latest.current;
                  if (f.type !== 'linear' && f.type !== 'radial') return;
                  setStopIndex(Math.max(0, sel - 1));
                  change({ ...f, stops: removeStop(f.stops, sel) });
                  commit();
                }}
              />
            </div>
          )}
        </>
      )}

      {fill.type === 'linear' && (
        <div className="flex items-center gap-1.5">
          <AngleDial
            value={fill.angle}
            onChange={(angle) => update('linear', (f) => ({ ...f, angle }))}
            onCommit={commit}
          />
          <NumberField
            aria-label={t('Angle')}
            className="min-w-0 flex-1"
            value={normalizeAngle(fill.angle)}
            min={0}
            max={360}
            wrap
            step={1}
            unit="°"
            onChange={(angle) => update('linear', (f) => ({ ...f, angle }))}
            onCommit={commit}
          />
          <IconButton
            label={t('Rotate 90°')}
            icon={<RotateCw />}
            onClick={() => {
              update('linear', (f) => ({ ...f, angle: normalizeAngle(f.angle + 90) }));
              commit();
            }}
          />
          <IconButton
            label={t('Reverse gradient')}
            icon={<ArrowLeftRight />}
            onClick={() => {
              const f = latest.current;
              if (f.type !== 'linear') return;
              setStopIndex(Math.max(0, f.stops.length - 1 - sel));
              change({ ...f, stops: reverseStops(f.stops) });
              commit();
            }}
          />
        </div>
      )}

      {fill.type === 'radial' && (
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField
            label={t('X')}
            labelTitle={t('Centre X')}
            aria-label={t('Centre X')}
            value={pct(fill.cx)}
            min={0}
            max={100}
            step={1}
            precision={1}
            unit="%"
            onChange={(v) => update('radial', (f) => ({ ...f, cx: round3(v / 100) }))}
            onCommit={commit}
            {...scrub}
          />
          <NumberField
            label={t('Y')}
            labelTitle={t('Centre Y')}
            aria-label={t('Centre Y')}
            value={pct(fill.cy)}
            min={0}
            max={100}
            step={1}
            precision={1}
            unit="%"
            onChange={(v) => update('radial', (f) => ({ ...f, cy: round3(v / 100) }))}
            onCommit={commit}
            {...scrub}
          />
          <NumberField
            label={t('R')}
            labelTitle={t('Radius')}
            aria-label={t('Radius')}
            value={pct(fill.radius)}
            min={1}
            max={200}
            step={1}
            precision={1}
            unit="%"
            onChange={(v) => update('radial', (f) => ({ ...f, radius: round3(v / 100) }))}
            onCommit={commit}
            {...scrub}
          />
        </div>
      )}

      {fill.type === 'mesh' && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs text-text-2">{t('Base')}</span>
            <ColorField
              className="min-w-0 flex-1"
              label={t('Base colour')}
              value={fill.base}
              alpha={false}
              palette={palette}
              onChange={(base) => update('mesh', (f) => ({ ...f, base }))}
              onCommit={commit}
            />
          </div>
          <div className="flex flex-col gap-1" role="list" aria-label={t('Mesh points')}>
            {fill.points.map((p, i) => (
              <div
                key={i}
                role="listitem"
                onPointerDownCapture={() => setPointIndex(i)}
                onFocusCapture={() => setPointIndex(i)}
                className={cx(
                  'flex items-center gap-1 rounded-sm p-0.5 transition-colors duration-(--dur-fast)',
                  i === pointSel ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <ColorField
                  showInput={false}
                  size="sm"
                  label={t('Point {v} colour', { v: i + 1 })}
                  value={p.color}
                  palette={palette}
                  onChange={(color) => update('mesh', (f) => ({ ...f, points: updateMeshPoint(f.points, i, { color }) }))}
                  onCommit={commit}
                />
                <NumberField
                  size="sm"
                  label={t('X')}
                  aria-label={t('Point {v} X', { v: i + 1 })}
                  className="min-w-0 flex-1"
                  value={pct(p.x)}
                  min={0}
                  max={100}
                  step={1}
                  precision={1}
                  onChange={(v) => update('mesh', (f) => ({ ...f, points: updateMeshPoint(f.points, i, { x: v / 100 }) }))}
                  onCommit={commit}
                  {...scrub}
                />
                <NumberField
                  size="sm"
                  label={t('Y')}
                  aria-label={t('Point {v} Y', { v: i + 1 })}
                  className="min-w-0 flex-1"
                  value={pct(p.y)}
                  min={0}
                  max={100}
                  step={1}
                  precision={1}
                  onChange={(v) => update('mesh', (f) => ({ ...f, points: updateMeshPoint(f.points, i, { y: v / 100 }) }))}
                  onCommit={commit}
                  {...scrub}
                />
                <NumberField
                  size="sm"
                  label={t('R')}
                  aria-label={t('Point {v} radius', { v: i + 1 })}
                  className="min-w-0 flex-1"
                  value={pct(p.radius)}
                  min={2}
                  max={150}
                  step={1}
                  precision={1}
                  onChange={(v) => update('mesh', (f) => ({ ...f, points: updateMeshPoint(f.points, i, { radius: v / 100 }) }))}
                  onCommit={commit}
                  {...scrub}
                />
                <IconButton
                  label={t('Remove point {v}', { v: i + 1 })}
                  size="sm"
                  icon={<Trash2 />}
                  onClick={() => {
                    setPointIndex(Math.max(0, i - 1));
                    update('mesh', (f) => ({ ...f, points: removeMeshPoint(f.points, i) }));
                    commit();
                  }}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Plus />}
            className="self-start"
            disabled={fill.points.length >= MAX_MESH_POINTS}
            onClick={() => {
              const f = latest.current;
              if (f.type !== 'mesh') return;
              setPointIndex(f.points.length);
              change({ ...f, points: addMeshPoint(f, palette) });
              commit();
            }}
          >
            {t('Add point')}
          </Button>
        </>
      )}

      {fill.type === 'image' && (
        <ImageControls
          fill={fill}
          palette={palette}
          picking={picking}
          canPick={!!onPickImage}
          onReplace={() => void replaceImage()}
          onUpdate={(fn) => update('image', fn)}
          onCommit={commit}
        />
      )}
    </div>
  );
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/* Image controls ------------------------------------------------------------ */

function ImageControls({
  fill,
  palette,
  picking,
  canPick,
  onReplace,
  onUpdate,
  onCommit,
}: {
  fill: ImageFill;
  palette: readonly string[];
  picking: boolean;
  canPick: boolean;
  onReplace: () => void;
  onUpdate: (fn: (f: ImageFill) => Fill) => void;
  onCommit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {canPick && (
        <Button size="sm" leadingIcon={<ImagePlus />} loading={picking} onClick={onReplace} className="self-start">
          {t('Replace image…')}
        </Button>
      )}
      <Row label={t('Fit')}>
        <SegmentedControl<ImageFill['fit']>
          aria-label={t('Image fit')}
          size="sm"
          fullWidth
          value={fill.fit}
          options={[
            { value: 'cover', label: t('Cover') },
            { value: 'contain', label: t('Contain') },
            { value: 'tile', label: t('Tile') },
          ]}
          onValueChange={(fit) => {
            onUpdate((f) => ({ ...f, fit }));
            onCommit();
          }}
        />
      </Row>
      <Row label={t('Opacity')}>
        <Slider
          aria-label={t('Image opacity')}
          value={Math.round(fill.opacity * 100)}
          min={0}
          max={100}
          bubble
          format={(v) => `${v}%`}
          onChange={(v) => onUpdate((f) => ({ ...f, opacity: v / 100 }))}
          onCommit={onCommit}
        />
      </Row>
      <Row label={t('Blur')}>
        <Slider
          aria-label={t('Image blur')}
          value={Math.round(fill.blur * 1000) / 10}
          min={0}
          max={10}
          step={0.1}
          bubble
          format={(v) => v.toFixed(1)}
          onChange={(v) => onUpdate((f) => ({ ...f, blur: Math.round(v * 10) / 1000 }))}
          onCommit={onCommit}
        />
      </Row>
      <Row label={t('Tint')}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Switch
            aria-label={t('Tint')}
            size="sm"
            checked={fill.tint !== null}
            onCheckedChange={(on) => {
              onUpdate((f) => ({ ...f, tint: on ? (f.tint ?? '#0E0B1C66') : null }));
              onCommit();
            }}
          />
          <ColorField
            className="min-w-0 flex-1"
            label={t('Tint colour')}
            value={fill.tint ?? '#0E0B1C66'}
            disabled={fill.tint === null}
            palette={palette}
            onChange={(tint) => onUpdate((f) => ({ ...f, tint }))}
            onCommit={onCommit}
          />
        </div>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-text-2">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

/* Preview ----------------------------------------------------------------------- */

interface PreviewHandle {
  x: number;
  y: number;
  label: string;
  color?: string;
  selected?: boolean;
}

interface FillPreviewProps {
  fill: Fill;
  aspect: number;
  imageUrl: string | null;
  handles: PreviewHandle[];
  onHandleSelect: (index: number) => void;
  onHandleMove: (index: number, x: number, y: number) => void;
  onHandleEnd: () => void;
  picking: boolean;
}

/** CSS rendering of the fill with draggable handles for the radial centre and mesh points. */
function FillPreview({ fill, aspect, imageUrl, handles, onHandleSelect, onHandleMove, onHandleEnd, picking }: FillPreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(120);
  const drag = useRef<{ index: number; pointerId: number } | null>(null);
  useEffect(
    () => () => {
      if (drag.current) document.documentElement.classList.remove('kit-dragging');
    },
    [],
  );

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setUnit(Math.max(1, Math.min(el.clientWidth, el.clientHeight))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toFraction = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    document.documentElement.classList.remove('kit-dragging');
    onHandleEnd();
  };

  const paint: CSSProperties = { ...fillToCss(fill, aspect) };

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={describeFill(fill)}
      className="kit-checker relative w-full overflow-hidden rounded-md"
      style={{ aspectRatio: `${aspect}` }}
    >
      <div className="absolute inset-0" style={paint} />
      {fill.type === 'image' && (
        <>
          {imageUrl ? (
            fill.fit === 'tile' ? (
              <div
                className="absolute inset-0"
                style={{ backgroundImage: `url("${imageUrl}")`, backgroundSize: '30% auto', opacity: fill.opacity, filter: fill.blur > 0 ? `blur(${fill.blur * unit}px)` : undefined }}
              />
            ) : (
              <img
                alt=""
                src={imageUrl}
                draggable={false}
                className="absolute inset-0 size-full"
                style={{
                  objectFit: fill.fit === 'contain' ? 'contain' : 'cover',
                  opacity: fill.opacity,
                  filter: fill.blur > 0 ? `blur(${fill.blur * unit}px)` : undefined,
                  transform: fill.blur > 0 ? 'scale(1.06)' : undefined,
                }}
              />
            )
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-2 text-text-3">
              <ImageOff className="size-5" />
              <span className="text-2xs">{picking ? t('Choosing…') : t('No preview')}</span>
            </div>
          )}
          {fill.tint && <div className="absolute inset-0" style={{ background: fill.tint }} />}
        </>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" />
      {handles.map((h, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${h.label}: ${Math.round(h.x * 100)}%, ${Math.round(h.y * 100)}%`}
          title={h.label}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus();
            onHandleSelect(i);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Capture can fail for synthetic pointers; dragging still works while over the box.
            }
            drag.current = { index: i, pointerId: e.pointerId };
            document.documentElement.classList.add('kit-dragging');
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.pointerId !== e.pointerId) return;
            const p = toFraction(e.clientX, e.clientY);
            if (p) onHandleMove(d.index, p.x, p.y);
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
            const step = e.shiftKey ? 0.1 : 0.01;
            const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
            const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
            if (!dx && !dy) return;
            e.preventDefault();
            onHandleSelect(i);
            onHandleMove(i, Math.min(1, Math.max(0, h.x + dx)), Math.min(1, Math.max(0, h.y + dy)));
            onHandleEnd();
          }}
          className={cx(
            'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full outline-none active:cursor-grabbing',
            'border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_2px_6px_rgba(0,0,0,0.4)] transition-[width,height,box-shadow] duration-(--dur-fast)',
            'focus-visible:shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_0_4px_var(--focus-soft),0_2px_6px_rgba(0,0,0,0.4)]',
            h.selected ? 'size-4' : 'size-3',
          )}
          style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, background: h.color ?? 'rgba(255,255,255,0.35)' }}
        />
      ))}
    </div>
  );
}

/* Gradient stop bar ----------------------------------------------------------------- */

interface GradientBarProps {
  stops: readonly GradientStop[];
  selected: number;
  onSelect: (index: number) => void;
  /** Live: new stops plus the index of the stop that should be selected. */
  onStopsChange: (stops: GradientStop[], selected: number) => void;
  onCommit: () => void;
}

/** Pull a handle this far (px) above or below the bar to remove its stop. */
const REMOVE_DISTANCE = 28;

/**
 * Horizontal gradient preview with one handle per stop. Click the bar to add
 * a stop (with the colour already there), drag handles to move them, drag a
 * handle off the bar or press Delete to remove it.
 */
function GradientBar({ stops, selected, onSelect, onStopsChange, onCommit }: GradientBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; pointerId: number; stops: GradientStop[]; removing: boolean; target: Element } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  useEffect(
    () => () => {
      if (drag.current) document.documentElement.classList.remove('kit-dragging');
    },
    [],
  );

  const offsetAt = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const startDrag = (index: number, list: GradientStop[], e: PointerEvent<HTMLElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // See FillPreview: capture is a nicety, not a requirement.
    }
    drag.current = { index, pointerId: e.pointerId, stops: list, removing: false, target: e.currentTarget };
    document.documentElement.classList.add('kit-dragging');
  };

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const r = barRef.current?.getBoundingClientRect();
    const off = r ? Math.abs(e.clientY - (r.top + r.height / 2)) > REMOVE_DISTANCE : false;
    const canRemove = d.stops.length > MIN_STOPS;
    const nowRemoving = off && canRemove;
    if (nowRemoving !== d.removing) {
      d.removing = nowRemoving;
      setRemoving(nowRemoving ? d.index : null);
    }
    d.stops = moveStop(d.stops, d.index, offsetAt(e.clientX));
    onStopsChange(d.stops, d.index);
  };

  const onUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    finish(d);
  };

  const finish = (d: NonNullable<typeof drag.current>) => {
    drag.current = null;
    document.documentElement.classList.remove('kit-dragging');
    try {
      if (d.target.hasPointerCapture(d.pointerId)) d.target.releasePointerCapture(d.pointerId);
    } catch {
      // Already released.
    }
    setRemoving(null);
    if (d.removing) {
      onStopsChange(removeStop(d.stops, d.index), Math.max(0, d.index - 1));
    } else {
      const sorted = sortStopsKeepSelection(d.stops, d.index);
      onStopsChange(sorted.stops, sorted.selected);
    }
    onCommit();
  };

  const onBarPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget || stops.length >= MAX_STOPS) return;
    e.preventDefault();
    const { stops: next, index } = addStop(stops, offsetAt(e.clientX));
    if (index < 0) return;
    onStopsChange(next, index);
    startDrag(index, next, e);
  };

  const onHandleKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    let next: GradientStop[] | null = null;
    let nextSel = index;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = moveStop(stops, index, stops[index].offset - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = moveStop(stops, index, stops[index].offset + step);
    else if (e.key === 'Home') next = moveStop(stops, index, 0);
    else if (e.key === 'End') next = moveStop(stops, index, 1);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && stops.length > MIN_STOPS) {
      next = removeStop(stops, index);
      nextSel = Math.max(0, index - 1);
    }
    if (!next) return;
    e.preventDefault();
    if (next.length === stops.length) {
      const sorted = sortStopsKeepSelection(next, index);
      next = sorted.stops;
      nextSel = sorted.selected;
    }
    onStopsChange(next, nextSel);
    onCommit();
  };

  const visible = removing === null ? stops : stops.filter((_, i) => i !== removing);

  return (
    <div className="relative h-7 px-[9px]">
      <div
        ref={barRef}
        onPointerDown={onBarPointerDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={() => {
          const d = drag.current;
          if (d && d.target === barRef.current) finish(d);
        }}
        title={t('Click to add a stop')}
        className="kit-checker relative top-1.5 h-4 cursor-copy rounded-[5px]"
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
          style={{ backgroundImage: `linear-gradient(90deg, ${stopsToCss(visible)})` }}
        />
      </div>
      <div className="pointer-events-none absolute inset-y-0 end-[9px] start-[9px]">
        {stops.map((s, i) => {
          const isSel = i === selected;
          const isRemoving = i === removing;
          return (
            <button
              key={i}
              type="button"
              role="slider"
              aria-label={t('Stop {v}', { v: i + 1 })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.offset * 100)}
              aria-valuetext={`${Math.round(s.offset * 100)}%, ${s.color}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.focus();
                onSelect(i);
                startDrag(i, [...stops], e);
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onLostPointerCapture={() => {
                const d = drag.current;
                if (d && d.index === i) finish(d);
              }}
              onFocus={() => onSelect(i)}
              onKeyDown={(e) => onHandleKeyDown(i, e)}
              className={cx(
                'pointer-events-auto absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[5px] p-0 outline-none active:cursor-grabbing',
                'border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.22),0_2px_5px_rgba(0,0,0,0.35)]',
                'transition-[opacity,translate,scale,outline-color] duration-(--dur-fast) ease-out',
                // Selection and focus use the outline so they never fight the handle's shadow.
                isSel ? 'z-10 outline-2 outline-offset-1 outline-accent' : 'outline-0 outline-transparent',
                'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
                isRemoving && 'translate-y-1 scale-90 opacity-35',
              )}
              style={{ left: `${s.offset * 100}%` }}
            >
              <ColorChip color={s.color} className="size-full rounded-[3px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Angle dial ------------------------------------------------------------------------- */

/** Round knob for gradient angles: drag around it (Shift snaps to 15°) or use the arrow keys. */
function AngleDial({ value, onChange, onCommit }: { value: number; onChange: (angle: number) => void; onCommit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (active.current !== null) document.documentElement.classList.remove('kit-dragging');
    },
    [],
  );
  const angle = normalizeAngle(value);

  const angleAt = (clientX: number, clientY: number, snap: boolean) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return angle;
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    if (dx === 0 && dy === 0) return angle;
    // CSS gradient angles: 0° points up, increasing clockwise.
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return normalizeAngle(snap ? Math.round(deg / 15) * 15 : Math.round(deg));
  };

  const finish = () => {
    if (active.current === null) return;
    active.current = null;
    document.documentElement.classList.remove('kit-dragging');
    onCommit();
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('Gradient angle')}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(angle)}
      aria-valuetext={`${Math.round(angle)}°`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Optional, see FillPreview.
        }
        active.current = e.pointerId;
        document.documentElement.classList.add('kit-dragging');
        onChange(angleAt(e.clientX, e.clientY, e.shiftKey));
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        onChange(angleAt(e.clientX, e.clientY, e.shiftKey));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 15 : 1;
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
        if (!d) return;
        e.preventDefault();
        onChange(normalizeAngle(angle + d));
        onCommit();
      }}
      className={cx(
        'relative size-7 shrink-0 cursor-grab rounded-full border border-line bg-surface outline-none active:cursor-grabbing light:bg-raised',
        'shadow-[var(--highlight)] transition-colors duration-(--dur-fast) hover:border-line-strong',
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
      )}
    >
      <span className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
        <span className="absolute top-[3px] left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-text" />
      </span>
      <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-3" />
    </div>
  );
}

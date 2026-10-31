/**
 * Device element panel: the screenshot shown in the active language, the
 * frame (drawn by the real device painter, in the element's own colours),
 * body style, size and shadow.
 */
import { memo, useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ImagePlus, ImageUp, Languages, Trash2 } from 'lucide-react';
import { deviceGeometry, drawDevice } from '../../../engine';
import { backgroundTone, mixColors, prefersLightText } from '../../../model/colorMath';
import { resolveLayout } from '../../../model/resolve';
import type { DeviceElement, DeviceFrameId, FamilyId, FrameStyle, Shadow } from '../../../model/types';
import { browserEnv } from '../../../runtime';
import { useEditor } from '../../../store';
import { Button, ColorField, SegmentedControl, Tooltip, cx } from '../../kit';
import { hasFiles, importScreenshots, pickScreenshotsForSlot } from '../importShots';
import { AssetThumb, MissingThumb } from './AssetThumb';
import { InspectorSection, Row, SliderRow, StatusDot } from './controls';
import { FRAME_LABEL, formatBytes, frameAspect, fromPct, languageLabel, toPct, widthForFrame } from './format';
import { LayoutSection } from './LayoutSection';
import { useLive } from './live';
import { ShadowSection } from './ShadowSection';
import { patchTarget, patchTargetWith, slideById, usePalette, type Target } from './state';

import { t } from '../../../i18n';
import { tx } from '../../../i18n/react';
export interface DevicePanelProps {
  el: DeviceElement;
  target: Target;
  index: number;
  count: number;
}

export const DevicePanel = memo(function DevicePanel({ el, target, index, count }: DevicePanelProps) {
  const palette = usePalette();
  const defaultShadow = useDefaultDeviceShadow(target);
  const applyWidth = useCallback((v: number) => patchTarget(target, { width: fromPct(v) }), [target]);
  const applyCorners = useCallback((v: number) => patchTarget(target, { cornerRadius: fromPct(v) }), [target]);
  // A new frame takes the old one's place: same spot, fitted inside its outline.
  const setFrame = useCallback(
    (frame: DeviceFrameId) => patchTargetWith<DeviceElement>(target, 'device', (d) => ({ frame, width: widthForFrame(d.width, d.frame, frame, target.family) })),
    [target],
  );
  return (
    <>
      <InspectorSection id="device.shot" title={t('Screenshot')}>
        <ScreenshotCard slot={el.slot} frame={el.frame} target={target} />
      </InspectorSection>
      <InspectorSection id="device.frame" title={t('Frame')}>
        <FramePicker value={el.frame} style={el.style} family={target.family} onChange={setFrame} />
      </InspectorSection>
      <StyleSection style={el.style} target={target} palette={palette} />
      <InspectorSection id="device.size" title={t('Size')}>
        <SliderRow label={t('Width')} value={toPct(el.width)} apply={applyWidth} min={10} max={150} inputMin={2} inputMax={400} step={0.5} precision={2} unit="%" />
        {el.frame === 'none' && (
          <SliderRow label={t('Corners')} value={toPct(el.cornerRadius)} apply={applyCorners} min={0} max={50} step={0.5} precision={1} unit="%" />
        )}
      </InspectorSection>
      <ShadowSection id="device.shadow" el={el} target={target} defaultShadow={defaultShadow} palette={palette} />
      <LayoutSection el={el} target={target} index={index} count={count} />
    </>
  );
});

/** A shadow that suits the slide's background: deeper on dark ones, soft and tinted on light ones. */
function useDefaultDeviceShadow(target: Target): Shadow {
  const light = useEditor((s) => {
    const slide = slideById(s.project, target.slideId);
    if (!slide || !s.project) return false;
    const bg = resolveLayout(s.project, slide, target.family).background ?? s.project.theme.background;
    return !prefersLightText(backgroundTone(bg));
  });
  return useMemo(() => (light ? { color: '#1a103340', blur: 0.06, x: 0, y: 0.025 } : { color: '#00000073', blur: 0.07, x: 0, y: 0.03 }), [light]);
}

/* Screenshot ------------------------------------------------------------------ */

const THUMB_MAX = 96;

function thumbSize(aspect: number): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 2;
  if (a >= 1) return { width: Math.max(40, Math.round(THUMB_MAX / a)), height: THUMB_MAX };
  return { width: THUMB_MAX, height: Math.max(40, Math.round(THUMB_MAX * a)) };
}

const ScreenshotCard = memo(function ScreenshotCard({ slot, frame, target }: { slot: string; frame: DeviceFrameId; target: Target }) {
  const { slideId, family } = target;
  const lang = useEditor((s) => s.activeLang);
  const base = useEditor((s) => s.project?.languages[0] ?? s.activeLang);
  const projectId = useEditor((s) => s.project?.id ?? '');
  const languageCount = useEditor((s) => s.project?.languages.length ?? 1);
  const ownId = useEditor((s) => slideById(s.project, slideId)?.shots[family]?.[slot]?.[lang] ?? null);
  const baseId = useEditor((s) => (lang === base ? null : (slideById(s.project, slideId)?.shots[family]?.[slot]?.[base] ?? null)));
  const shownId = ownId ?? baseId;
  const info = useEditor((s) => (shownId ? s.project?.assets[shownId] : undefined));
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const status = ownId ? 'own' : baseId ? 'base' : 'missing';
  const langName = languageLabel(lang);
  const baseName = languageLabel(base);
  // The button stays short ("Add Portuguese…"); the note under the card names the variant.
  const langShort = langName.replace(/\s*\(.*\)$/, '') || langName;

  const pick = async () => {
    setBusy(true);
    try {
      await pickScreenshotsForSlot(slideId, slot);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    setBusy(true);
    try {
      await importScreenshots(files, { slideId, slot });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const dropProps = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => void onDrop(e),
  };

  const size = thumbSize(info ? info.height / info.width : frameAspect(frame, family));
  const card = cx(
    'flex min-w-0 gap-3 rounded-md border p-2 transition-[background-color,border-color,box-shadow] duration-(--dur-fast)',
    dropping ? 'border-accent-line bg-accent-soft ring-3 ring-focus-soft' : 'border-line bg-surface light:bg-raised',
  );

  if (status === 'missing' || !shownId) {
    return (
      <div className={card} {...dropProps}>
        <MissingThumb width={size.width} height={size.height} className="rounded-[6px]" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-0.5">
          <div className="flex flex-col gap-0.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-text">
              <StatusDot tone="warning" />
              {t('No screenshot')}
            </p>
            <p className="text-xs leading-4 text-text-3">{dropping ? t('Drop to add it.') : t('Drop an image here or choose one. A mock screen shows until then.')}</p>
          </div>
          <Button size="sm" variant="primary" leadingIcon={<ImagePlus />} loading={busy} onClick={() => void pick()} className="self-start">
            {t('Choose…')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={card} {...dropProps}>
        {info ? (
          <AssetThumb projectId={projectId} assetId={shownId} width={size.width} height={size.height} className="rounded-[6px] shadow-[0_0_0_1px_var(--line)]" />
        ) : (
          <MissingThumb width={size.width} height={size.height} className="rounded-[6px]" />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-xs font-medium text-text" title={info?.name} dir="auto">
              {info?.name ?? t('Missing image')}
            </p>
            {info && (
              <p className="truncate text-2xs text-text-3 tabular-nums">
                {info.width} × {info.height}
                {info.bytes > 0 ? ` · ${formatBytes(info.bytes)}` : ''}
              </p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-2xs text-text-2">
              <StatusDot tone={status === 'own' ? 'success' : 'muted'} />
              {status === 'own' ? (lang === base && languageCount > 1 ? t('{langName} · default', { langName }) : langName) : t('{baseName} · fallback', { baseName })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" leadingIcon={status === 'base' ? <ImagePlus /> : <ImageUp />} loading={busy} onClick={() => void pick()}>
              {status === 'base' ? t('Add {langShort}…', { langShort }) : t('Replace…')}
            </Button>
            {status === 'own' && (
              <Tooltip content={lang === base ? t('Remove the screenshot') : t('Remove the {langName} screenshot (falls back to {baseName})', { langName, baseName })}>
                <Button size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => useEditor.getState().setShot(slideId, family, slot, lang, null)}>
                  {t('Remove')}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {status === 'base' && (
        <p className="flex items-start gap-1.5 text-xs leading-4 text-text-3">
          <Languages aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            {tx('Using {baseName} screenshot — add one for {langName}', { baseName, langName })}
          </span>
        </p>
      )}
    </div>
  );
});

/* Frame ------------------------------------------------------------------------ */

const FRAMES: { id: DeviceFrameId; label: string }[] = [
  { id: 'iphone', label: t('iPhone') },
  { id: 'ipad', label: t('iPad') },
  { id: 'android-phone', label: t('Android') },
  { id: 'android-tablet', label: t('Tablet') },
  { id: 'macbook', label: t('MacBook') },
  { id: 'watch', label: t('Watch') },
  { id: 'tv', label: t('TV') },
  { id: 'vision', label: t('Vision Pro') },
  { id: 'browser', label: t('Browser') },
  { id: 'none', label: t('None') },
];

interface FramePickerProps {
  value: DeviceFrameId;
  style: FrameStyle;
  family: FamilyId;
  onChange: (frame: DeviceFrameId) => void;
}

/** Four-column grid of frames, each drawn as a small device in the element's colours. */
export const FramePicker = memo(function FramePicker({ value, style: liveStyle, family, onChange }: FramePickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // While a colour is being dragged the tiles may trail a frame behind the canvas.
  const style = useDeferredValue(liveStyle);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = FRAMES.findIndex((f) => f.id === value);
    const cols = 4;
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(FRAMES.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') next = Math.min(FRAMES.length - 1, i + cols);
    else if (e.key === 'ArrowUp') next = i - cols >= 0 ? i - cols : i;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = FRAMES.length - 1;
    if (next < 0 || next === i) return;
    e.preventDefault();
    onChange(FRAMES[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t('Device frame')} className="grid grid-cols-4 gap-1.5" onKeyDown={onKeyDown}>
      {FRAMES.map((f, i) => {
        const selected = f.id === value;
        return (
          <button
            key={f.id}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={FRAME_LABEL[f.id] === 'Screenshot' ? t('No frame') : FRAME_LABEL[f.id]}
            tabIndex={selected ? 0 : -1}
            onClick={() => !selected && onChange(f.id)}
            className={cx(
              'group/frame flex h-[68px] min-w-0 flex-col items-center justify-between rounded-md border px-1 pt-1.5 pb-1 outline-none',
              'transition-[background-color,border-color,color] duration-(--dur-fast) ease-out',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              selected ? 'border-accent-line bg-accent-soft text-accent-fg' : 'border-transparent bg-field text-text-2 hover:bg-field-hover hover:text-text',
            )}
          >
            <FrameArt frame={f.id} style={style} family={family} />
            <span className="max-w-full truncate text-2xs leading-[14px] font-medium">{f.label}</span>
          </button>
        );
      })}
    </div>
  );
});

const ART_W = 52;
const ART_H = 38;

/** The frame painted by the engine at thumbnail size (no shadow, neutral screen). */
const FrameArt = memo(function FrameArt({ frame, style, family }: { frame: DeviceFrameId; style: FrameStyle; family: FamilyId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    const w = Math.round(ART_W * dpr);
    const h = Math.round(ART_H * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const aspect = frameAspect(frame, family);
    const probe = deviceGeometry(frame, 100, aspect);
    const ratio = probe.height / probe.width;
    // Leave a pixel of air so anti-aliased edges are never clipped.
    const widthPx = Math.max(4, Math.min(w - 2 * dpr, (h - 2 * dpr) / ratio));
    const el: DeviceElement = {
      id: 'frame-art',
      kind: 'device',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      opacity: 1,
      frame,
      style,
      width: 1,
      slot: 'main',
      cornerRadius: 0.08,
      shadow: null,
    };
    try {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const g = drawDevice(ctx, {
        el,
        widthPx,
        unit: Math.min(w, h),
        screenAspect: aspect,
        screen: null,
        placeholder: 'empty',
        // A light screen makes every silhouette read, whatever the body colour and the UI theme.
        mock: { seed: 0, palette: [], dark: false },
        env: browserEnv(),
      });
      if (frame === 'none' || frame === 'browser') {
        // These have no dark bezel, so a light tile would swallow their edge: draw a hairline.
        const r = frame === 'none' ? g.screen.radius : 2.5 * dpr;
        ctx.beginPath();
        const box = [-g.width / 2 + 0.5 * dpr, -g.height / 2 + 0.5 * dpr, g.width - dpr, g.height - dpr] as const;
        // Older WKWebView builds have no roundRect; a square hairline is fine there.
        if (typeof ctx.roundRect === 'function') ctx.roundRect(...box, r);
        else ctx.rect(...box);
        ctx.lineWidth = dpr;
        ctx.strokeStyle = 'rgba(128, 128, 144, 0.55)';
        ctx.stroke();
      }
      ctx.restore();
    } catch (err) {
      ctx.restore();
      console.warn('[inspector] could not draw the frame preview', err);
    }
  }, [frame, style, family]);
  return <canvas ref={ref} aria-hidden className="block shrink-0" style={{ width: ART_W, height: ART_H }} />;
});

/* Style ------------------------------------------------------------------------ */

interface Preset {
  color: string;
  name: string;
  clay?: boolean;
}

const METALS: Preset[] = [
  { color: '#2b2b30', name: t('Graphite') },
  { color: '#d9d9de', name: t('Silver') },
  { color: '#b7aea3', name: t('Natural titanium') },
  { color: '#2f4b6e', name: t('Deep blue') },
  { color: '#c8a27a', name: t('Desert gold') },
  { color: '#f5f5f7', name: t('White') },
  { color: '#111114', name: t('Black') },
];

const CLAYS: Preset[] = [
  { color: '#cdbdf7', name: t('Lilac clay'), clay: true },
  { color: '#b5e3cf', name: t('Mint clay'), clay: true },
  { color: '#f6c1a6', name: t('Peach clay'), clay: true },
  { color: '#b9d4f5', name: t('Sky clay'), clay: true },
];

/** Sum of channel differences; templates use near-identical shades (#2b2c31 for graphite). */
function colorDistance(a: string, b: string): number {
  const rgb = (h: string) => {
    const m = /^#([0-9a-f]{6})/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return Infinity;
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}

/** The preset the colour is (nearly) equal to, if any. */
function presetOf(color: string): Preset | null {
  let best: Preset | null = null;
  let bestDistance = Infinity;
  for (const p of [...METALS, ...CLAYS]) {
    const d = colorDistance(color, p.color);
    if (d <= 12 && d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

const StyleSection = memo(function StyleSection({ style, target, palette }: { style: FrameStyle; target: Target; palette: readonly string[] }) {
  const color = useLive<string>((c) => patchTarget(target, { style: { color: c } }));
  const current = presetOf(style.color);

  const choose = (p: Preset) => {
    // Clay pastels come with the clay look; picking a metal colour leaves it.
    const look: Partial<FrameStyle> = p.clay ? { finish: 'clay', bezel: 'match' } : style.finish === 'clay' ? { finish: 'metal', bezel: 'black' } : {};
    patchTarget(target, { style: { color: p.color, ...look } });
  };

  const swatch = (p: Preset) => {
    const selected = current === p;
    return (
      <Tooltip key={p.color} content={p.name}>
        <button
          type="button"
          aria-label={p.name}
          aria-pressed={selected}
          onClick={() => choose(p)}
          className={cx(
            'relative size-5 shrink-0 rounded-full outline-none transition-transform duration-(--dur-fast) ease-out hover:scale-110',
            'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            selected && 'ring-2 ring-accent ring-offset-2 ring-offset-panel',
          )}
          style={{ background: p.clay ? p.color : `linear-gradient(145deg, ${mixColors(p.color, '#ffffff', 0.22)} 0%, ${p.color} 48%, ${mixColors(p.color, '#000000', 0.18)} 100%)` }}
        />
      </Tooltip>
    );
  };

  return (
    <InspectorSection id="device.style" title={t('Style')}>
      <div className="flex items-center gap-1 px-px py-0.5" role="group" aria-label={t('Colour presets')}>
        {METALS.map(swatch)}
        <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
        {CLAYS.map(swatch)}
      </div>
      <Row label={t('Colour')}>
        <ColorField label={t('Body colour')} value={style.color} alpha={false} palette={palette} {...color} />
      </Row>
      <Row label={t('Finish')}>
        <SegmentedControl<FrameStyle['finish']>
          fullWidth
          value={style.finish}
          options={[
            { value: 'metal', label: t('Metal'), tooltip: t('Polished metal with a soft sheen') },
            { value: 'matte', label: t('Matte') },
            { value: 'clay', label: t('Clay'), tooltip: t('Solid, soft mockup look') },
          ]}
          onValueChange={(finish) => patchTarget(target, { style: { finish } })}
        />
      </Row>
      <Row label={t('Bezel')}>
        <SegmentedControl<FrameStyle['bezel']>
          fullWidth
          value={style.bezel}
          options={[
            { value: 'black', label: t('Black') },
            { value: 'match', label: t('Match body') },
          ]}
          onValueChange={(bezel) => patchTarget(target, { style: { bezel } })}
        />
      </Row>
    </InspectorSection>
  );
});

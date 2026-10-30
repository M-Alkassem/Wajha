/**
 * Image element panel: the picture (with Replace…), size, corners, shadow.
 */
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';
import type { ImageElement } from '../../../model/types';
import { useEditor } from '../../../store';
import { Button } from '../../kit';
import { pickImageAsset } from './assetData';
import { AssetThumb, MissingThumb } from './AssetThumb';
import { InspectorSection, SliderRow } from './controls';
import { formatBytes, fromPct, toPct } from './format';
import { LayoutSection } from './LayoutSection';
import { ShadowSection } from './ShadowSection';
import { patchTarget, usePalette, type Target } from './state';

const IMAGE_SHADOW = { color: '#00000059', blur: 0.05, x: 0, y: 0.02 };
/** Thumbnail box inside the 8 px padded preview well (content width 276 minus padding and border). */
const PREVIEW_W = 258;
const PREVIEW_MAX_H = 132;

export interface ImagePanelProps {
  el: ImageElement;
  target: Target;
  index: number;
  count: number;
}

export const ImagePanel = memo(function ImagePanel({ el, target, index, count }: ImagePanelProps) {
  const palette = usePalette();
  const applyWidth = useCallback((v: number) => patchTarget(target, { width: fromPct(v) }), [target]);
  const applyCorners = useCallback((v: number) => patchTarget(target, { cornerRadius: fromPct(v) }), [target]);
  return (
    <>
      <InspectorSection id="image.source" title="Image">
        <ImageSource assetId={el.assetId} target={target} />
      </InspectorSection>
      <InspectorSection id="image.size" title="Size">
        <SliderRow label="Width" value={toPct(el.width)} apply={applyWidth} min={5} max={150} inputMin={1} inputMax={800} step={0.5} precision={2} unit="%" />
        <SliderRow label="Corners" value={toPct(el.cornerRadius)} apply={applyCorners} min={0} max={50} step={0.5} precision={1} unit="%" />
      </InspectorSection>
      <ShadowSection id="image.shadow" el={el} target={target} defaultShadow={IMAGE_SHADOW} palette={palette} />
      <LayoutSection el={el} target={target} index={index} count={count} />
    </>
  );
});

const ImageSource = memo(function ImageSource({ assetId, target }: { assetId: string; target: Target }) {
  const projectId = useEditor((s) => s.project?.id ?? '');
  const info = useEditor((s) => s.project?.assets[assetId]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const aspect = info && info.width > 0 ? info.height / info.width : 1;
  const height = Math.max(48, Math.min(PREVIEW_MAX_H, Math.round(PREVIEW_W * aspect)));

  const replace = async () => {
    setBusy(true);
    try {
      const id = await pickImageAsset();
      if (id) patchTarget(target, { assetId: id });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="kit-checker flex items-center justify-center overflow-hidden rounded-md border border-line p-2">
        {info ? (
          <AssetThumb projectId={projectId} assetId={assetId} width={PREVIEW_W} height={height} fit="contain" />
        ) : (
          <MissingThumb width={PREVIEW_W} height={height} className="border-0" />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xs font-medium text-text" dir="auto" title={info?.name}>
            {info?.name ?? 'Missing image'}
          </p>
          {info && (
            <p className="truncate text-2xs text-text-3 tabular-nums">
              {info.width} × {info.height}
              {info.bytes > 0 ? ` · ${formatBytes(info.bytes)}` : ''}
            </p>
          )}
        </div>
        <Button size="sm" leadingIcon={<ImageUp />} loading={busy} onClick={() => void replace()}>
          Replace…
        </Button>
      </div>
    </div>
  );
});

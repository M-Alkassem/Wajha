/**
 * The kit FillEditor wired to the store: live edits as one undo step,
 * images picked from disk become project assets, previews come from the
 * image cache.
 */
import { memo, useCallback } from 'react';
import type { Fill } from '../../../model/types';
import { useEditor } from '../../../store';
import { FillEditor } from '../../kit';
import { pickImageAsset, useImageUrlGetter } from './assetData';
import { fillsMatch } from './format';
import { useLive } from './live';

/**
 * Stored fill -> the object the editor sent for it. The store keeps a
 * normalised copy (lower-case colours, validated numbers), so what comes
 * back is never the object the editor emitted. Handing that object back
 * keeps the editor's per-type memory (solid -> linear -> solid restores the
 * colour) and stops it from treating our own echo as an outside change.
 */
const echoes = new WeakMap<Fill, Fill>();

export interface FillFieldProps {
  value: Fill;
  /** Writes a fill; called at most once per frame while dragging. */
  apply: (fill: Fill) => void;
  /** The fill as the store has it now (after `apply`). */
  read: () => Fill | null;
  palette: readonly string[];
  previewAspect?: number;
}

export const FillField = memo(function FillField({ value, apply, read, palette, previewAspect }: FillFieldProps) {
  const projectId = useEditor((s) => s.project?.id ?? null);
  const getImageUrl = useImageUrlGetter(projectId);
  const write = useCallback(
    (fill: Fill) => {
      apply(fill);
      const stored = read();
      if (stored && stored !== fill && fillsMatch(stored, fill)) echoes.set(stored, fill);
    },
    [apply, read],
  );
  const live = useLive<Fill>(write);
  return (
    <FillEditor
      value={echoes.get(value) ?? value}
      palette={palette}
      previewAspect={previewAspect}
      onChange={live.onChange}
      onCommit={live.onCommit}
      onScrubCancel={live.onScrubCancel}
      onPickImage={pickImageAsset}
      getImageUrl={getImageUrl}
    />
  );
});

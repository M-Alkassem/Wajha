/**
 * Background editing shared by the slide and the theme: the fill (kit
 * FillEditor) and the pattern drawn over it.
 */
import { memo, useCallback } from 'react';
import { backgroundTone, prefersLightText } from '../../../model/colorMath';
import type { Background, Fill, Pattern, PatternKind } from '../../../model/types';
import { ColorField, Select } from '../../kit';
import { Row, SliderRow } from './controls';
import { FillField } from './FillField';
import { fromPct, toPct } from './format';
import { useLive } from './live';

import { t } from '../../../i18n';
const KINDS: { value: PatternKind; label: string }[] = [
  { value: 'dots', label: t('Dots') },
  { value: 'grid', label: t('Grid') },
  { value: 'diagonal', label: t('Diagonal lines') },
  { value: 'noise', label: t('Noise') },
  { value: 'waves', label: t('Waves') },
  { value: 'rings', label: t('Rings') },
];

/** Spacing that looks right for each kind on a phone canvas, fraction of u. */
const DEFAULT_SCALE: Record<PatternKind, number> = { dots: 0.045, grid: 0.08, diagonal: 0.035, noise: 0.04, waves: 0.06, rings: 0.08 };

/** The last pattern of each background while it is switched to "None", for this session. */
const remembered = new Map<string, Pattern>();

export interface BackgroundFieldsProps {
  /** Remembers the pattern per background ("theme", a slide id...). */
  scope: string;
  value: Background;
  /** Writes the fill (the caller merges it into the store's current background). */
  applyFill: (fill: Fill) => void;
  /** The background as the store has it now. */
  read: () => Background | null;
  /** Rewrites the pattern from the store's current one, so live edits never start from a stale copy. */
  updatePattern: (fn: (current: Pattern | null) => Pattern | null) => void;
  palette: readonly string[];
}

export const BackgroundFields = memo(function BackgroundFields({ scope, value, applyFill, read, updatePattern, palette }: BackgroundFieldsProps) {
  const readFill = useCallback(() => read()?.fill ?? null, [read]);
  return (
    <>
      <FillField value={value.fill} apply={applyFill} read={readFill} palette={palette} />
      <PatternFields scope={scope} pattern={value.pattern} fill={value.fill} update={updatePattern} palette={palette} />
    </>
  );
});

interface PatternFieldsProps {
  scope: string;
  pattern: Pattern | null;
  fill: Fill;
  update: (fn: (current: Pattern | null) => Pattern | null) => void;
  palette: readonly string[];
}

const PatternFields = memo(function PatternFields({ scope, pattern, fill, update, palette }: PatternFieldsProps) {
  const color = useLive<string>((c) => update((p) => (p ? { ...p, color: c } : p)));
  const applyOpacity = useCallback((v: number) => update((p) => (p ? { ...p, opacity: fromPct(v) } : p)), [update]);
  const applyScale = useCallback((v: number) => update((p) => (p ? { ...p, scale: fromPct(v) } : p)), [update]);

  const choose = (kind: string) => {
    if (kind === 'none') {
      if (pattern) remembered.set(scope, pattern);
      update(() => null);
      return;
    }
    const k = kind as PatternKind;
    const base = pattern ?? remembered.get(scope);
    if (base) {
      update(() => ({ ...base, kind: k, scale: base.kind === k ? base.scale : DEFAULT_SCALE[k] }));
      return;
    }
    // Light lines on dark backgrounds, dark ones on light backgrounds.
    const light = prefersLightText(backgroundTone({ fill, pattern: null }));
    update(() => ({ kind: k, color: light ? '#ffffff' : '#14121f', opacity: 0.12, scale: DEFAULT_SCALE[k] }));
  };

  return (
    <>
      <Row label={t('Pattern')}>
        <Select value={pattern?.kind ?? 'none'} onValueChange={choose} options={[{ value: 'none', label: t('None') }, ...KINDS]} />
      </Row>
      {pattern && (
        <>
          <Row label={t('Colour')}>
            <ColorField label={t('Pattern colour')} value={pattern.color} alpha={false} palette={palette} {...color} />
          </Row>
          <SliderRow label={t('Opacity')} value={toPct(pattern.opacity)} apply={applyOpacity} min={0} max={100} step={1} precision={0} unit="%" />
          <SliderRow label={t('Scale')} value={toPct(pattern.scale)} apply={applyScale} min={0.5} max={25} inputMin={0.2} inputMax={200} step={0.1} precision={1} unit="%" />
        </>
      )}
    </>
  );
});

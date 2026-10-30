/**
 * Shape element panel: kind, fill, size (with an aspect lock), corners,
 * ring stroke and glow.
 */
import { memo, useCallback, useState } from 'react';
import { Dices, Link2, Unlink2 } from 'lucide-react';
import type { ShapeElement, ShapeKind } from '../../../model/types';
import { IconButton, NumberField, SegmentedControl, type SegmentedOption } from '../../kit';
import { InspectorSection, Pair, Row, SliderRow } from './controls';
import { FillField } from './FillField';
import { SHAPE_LABEL, fromPct, toPct } from './format';
import { ShapeGlyph } from './icons';
import { LayoutSection } from './LayoutSection';
import { useLive } from './live';
import { patchTarget, patchTargetWith, readElement, usePalette, type Target } from './state';

const KINDS: SegmentedOption<ShapeKind>[] = (['circle', 'rect', 'blob', 'ring'] as const).map((k) => ({
  value: k,
  icon: <ShapeGlyph shape={k} />,
  tooltip: SHAPE_LABEL[k],
}));

export interface ShapePanelProps {
  el: ShapeElement;
  target: Target;
  index: number;
  count: number;
}

export const ShapePanel = memo(function ShapePanel({ el, target, index, count }: ShapePanelProps) {
  const palette = usePalette();
  const applyFill = useCallback((fill: ShapeElement['fill']) => patchTarget(target, { fill }), [target]);
  const readFill = useCallback(() => {
    const cur = readElement(target);
    return cur?.kind === 'shape' ? cur.fill : null;
  }, [target]);
  const applyRadius = useCallback((v: number) => patchTarget(target, { radius: fromPct(v) }), [target]);
  const applyStroke = useCallback((v: number) => patchTarget(target, { stroke: fromPct(v) }), [target]);
  const applyBlur = useCallback((v: number) => patchTarget(target, { blur: fromPct(v) }), [target]);

  return (
    <>
      <InspectorSection id="shape.kind" title="Shape">
        <div className="flex items-center gap-2">
          <SegmentedControl<ShapeKind> aria-label="Shape" fullWidth value={el.shape} options={KINDS} onValueChange={(shape) => patchTarget(target, { shape })} className="flex-1" />
          {el.shape === 'blob' && (
            <IconButton
              variant="solid"
              label="New random outline"
              icon={<Dices />}
              onClick={() => patchTarget(target, { seed: Math.floor(Math.random() * 2147483647) })}
            />
          )}
        </div>
        <SizeRow el={el} target={target} />
        {el.shape === 'rect' && (
          <SliderRow label="Corners" value={toPct(el.radius)} apply={applyRadius} min={0} max={50} inputMax={100} step={0.5} precision={1} unit="%" />
        )}
        {el.shape === 'ring' && (
          <SliderRow label="Stroke" value={toPct(el.stroke)} apply={applyStroke} min={0.1} max={20} inputMin={0} inputMax={200} step={0.1} precision={2} unit="%" />
        )}
      </InspectorSection>
      <InspectorSection id="shape.fill" title="Fill">
        <FillField value={el.fill} apply={applyFill} read={readFill} palette={palette} previewAspect={3} />
      </InspectorSection>
      <InspectorSection id="shape.effects" title="Effects">
        <SliderRow
          label="Glow"
          value={toPct(el.blur)}
          apply={applyBlur}
          min={0}
          max={30}
          inputMax={200}
          step={0.1}
          precision={2}
          unit="%"
          hint={el.blur > 0 ? undefined : 'Blur the shape into a soft light.'}
        />
      </InspectorSection>
      <LayoutSection el={el} target={target} index={index} count={count} />
    </>
  );
});

const SizeRow = memo(function SizeRow({ el, target }: { el: ShapeElement; target: Target }) {
  const [locked, setLocked] = useState(el.width === el.height && (el.shape === 'circle' || el.shape === 'ring'));
  const width = useLive<number>((v) =>
    patchTargetWith<ShapeElement>(target, 'shape', (cur) => {
      const w = fromPct(v);
      return locked && cur.width > 0 ? { width: w, height: (cur.height / cur.width) * w } : { width: w };
    }),
  );
  const height = useLive<number>((v) =>
    patchTargetWith<ShapeElement>(target, 'shape', (cur) => {
      const h = fromPct(v);
      return locked && cur.height > 0 ? { height: h, width: (cur.width / cur.height) * h } : { height: h };
    }),
  );
  return (
    <Row
      label="Size"
      trailing={
        <IconButton
          label={locked ? 'Unlock the aspect ratio' : 'Lock the aspect ratio'}
          icon={locked ? <Link2 /> : <Unlink2 />}
          active={locked}
          onClick={() => setLocked((v) => !v)}
        />
      }
    >
      <Pair>
        <NumberField label="W" labelTitle="Width, % of the shorter canvas side" value={toPct(el.width)} min={0.1} max={800} step={0.5} precision={1} unit="%" {...width} />
        <NumberField label="H" labelTitle="Height, % of the shorter canvas side" value={toPct(el.height)} min={0.1} max={800} step={0.5} precision={1} unit="%" {...height} />
      </Pair>
    </Row>
  );
});

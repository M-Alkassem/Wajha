/**
 * The "Layout" section every element shares: position, rotation, opacity,
 * stacking order and the lock / hide toggles.
 */
import { memo, useCallback, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BringToFront, Eye, EyeOff, Lock, LockOpen, RotateCw, SendToBack } from 'lucide-react';
import type { SlideElement } from '../../../model/types';
import { useEditor } from '../../../store';
import { Divider, IconButton, NumberField } from '../../kit';
import { InspectorSection, Pair, RotationDial, Row, SliderRow } from './controls';
import { fromPct, normalizeRotation, toPct } from './format';
import { useLive } from './live';
import { patchTarget, type Target } from './state';

import { t } from '../../../i18n';
export interface LayoutSectionProps {
  el: SlideElement;
  target: Target;
  index: number;
  count: number;
  /** Extra rows after the position (the text box width and anchor). */
  children?: ReactNode;
}

export const LayoutSection = memo(function LayoutSection({ el, target, index, count, children }: LayoutSectionProps) {
  const x = useLive<number>((v) => patchTarget(target, { x: fromPct(v) }));
  const y = useLive<number>((v) => patchTarget(target, { y: fromPct(v) }));
  const rotation = useLive<number>((v) => patchTarget(target, { rotation: normalizeRotation(v) }));
  const applyOpacity = useCallback((v: number) => patchTarget(target, { opacity: fromPct(v) }), [target]);
  const { slideId, family, elementId } = target;
  const store = useEditor.getState;

  return (
    <InspectorSection id="layout" title={t('Layout')} borderless>
      <Row label={t('Position')}>
        <Pair>
          <NumberField
            label={t('X')}
            labelTitle={t('Horizontal position, % of the canvas width')}
            value={toPct(el.x)}
            min={-200}
            max={300}
            step={0.1}
            precision={2}
            unit="%"
            {...x}
          />
          <NumberField
            label={t('Y')}
            labelTitle={t('Vertical position, % of the canvas height')}
            value={toPct(el.y)}
            min={-200}
            max={300}
            step={0.1}
            precision={2}
            unit="%"
            {...y}
          />
        </Pair>
      </Row>
      {children}
      <Row label={t('Rotation')}>
        <div className="flex items-center gap-2">
          <NumberField
            label={<RotateCw />}
            labelTitle={t('Rotation, degrees clockwise')}
            value={normalizeRotation(el.rotation)}
            min={-180}
            max={180}
            wrap
            step={1}
            precision={1}
            unit="°"
            className="min-w-0 flex-1"
            {...rotation}
          />
          <RotationDial value={el.rotation} onChange={rotation.onChange} onCommit={rotation.onCommit} />
        </div>
      </Row>
      <SliderRow label={t('Opacity')} value={toPct(el.opacity)} apply={applyOpacity} min={0} max={100} step={1} precision={0} unit="%" />
      <Row label={t('Arrange')}>
        <div className="flex items-center gap-0.5">
          <IconButton size="md" label={t('Bring to front')} icon={<BringToFront />} disabled={index >= count - 1} onClick={() => store().bringToFront(slideId, family, elementId)} />
          <IconButton size="md" label={t('Bring forward')} icon={<ArrowUp />} disabled={index >= count - 1} onClick={() => store().bringForward(slideId, family, elementId)} />
          <IconButton size="md" label={t('Send backward')} icon={<ArrowDown />} disabled={index <= 0} onClick={() => store().sendBackward(slideId, family, elementId)} />
          <IconButton size="md" label={t('Send to back')} icon={<SendToBack />} disabled={index <= 0} onClick={() => store().sendToBack(slideId, family, elementId)} />
          <Divider orientation="vertical" className="mx-1 my-1.5" />
          <IconButton
            size="md"
            label={el.locked ? t('Unlock') : t('Lock on canvas')}
            icon={el.locked ? <Lock /> : <LockOpen />}
            active={!!el.locked}
            onClick={() => store().toggleLocked(slideId, family, elementId)}
          />
          <IconButton
            size="md"
            label={el.hidden ? t('Show') : t('Hide')}
            icon={el.hidden ? <EyeOff /> : <Eye />}
            active={!!el.hidden}
            onClick={() => store().toggleHidden(slideId, family, elementId)}
          />
        </div>
      </Row>
    </InspectorSection>
  );
});

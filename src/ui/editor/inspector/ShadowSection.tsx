/**
 * Drop shadow editor shared by text (style.shadow), devices and images
 * (shadow): an on/off switch in the section header, then colour, blur and
 * offset. Turning a shadow off and on again brings back the one it had.
 */
import { memo, useCallback } from 'react';
import type { Shadow, SlideElement } from '../../../model/types';
import type { ElementPatch } from '../../../store';
import { ColorField, NumberField, Switch } from '../../kit';
import { InspectorSection, Pair, Row, SliderRow } from './controls';
import { fromPct, toPct } from './format';
import { useLive } from './live';
import { patchTarget, readElement, type Target } from './state';

import { t } from '../../../i18n';
/** Last shadow of each element while it is switched off, for this session. */
const remembered = new Map<string, Shadow>();

function shadowOf(el: SlideElement | null): Shadow | null {
  if (!el) return null;
  if (el.kind === 'text') return el.style.shadow;
  if (el.kind === 'device' || el.kind === 'image') return el.shadow;
  return null;
}

function shadowPatch(el: SlideElement, shadow: Shadow | null): ElementPatch | null {
  if (el.kind === 'text') return { style: { shadow } };
  if (el.kind === 'device' || el.kind === 'image') return { shadow };
  return null;
}

export interface ShadowSectionProps {
  id: string;
  el: SlideElement;
  target: Target;
  /** Shadow used the first time the switch is turned on. */
  defaultShadow: Shadow;
  palette: readonly string[];
}

export const ShadowSection = memo(function ShadowSection({ id, el, target, defaultShadow, palette }: ShadowSectionProps) {
  const shadow = shadowOf(el);
  const memoryKey = `${target.slideId}:${target.family}:${target.elementId}`;

  /** Patches the shadow as the store has it now, so concurrent fields never overwrite each other. */
  const update = useCallback(
    (fn: (s: Shadow) => Shadow) => {
      const cur = readElement(target);
      const s = shadowOf(cur);
      if (!cur || !s) return;
      const patch = shadowPatch(cur, fn(s));
      if (patch) patchTarget(target, patch);
    },
    [target],
  );

  const color = useLive<string>((c) => update((s) => ({ ...s, color: c })));
  const x = useLive<number>((v) => update((s) => ({ ...s, x: fromPct(v) })));
  const y = useLive<number>((v) => update((s) => ({ ...s, y: fromPct(v) })));
  const applyBlur = useCallback((v: number) => update((s) => ({ ...s, blur: fromPct(v) })), [update]);

  const toggle = (on: boolean) => {
    const cur = readElement(target);
    if (!cur) return;
    const current = shadowOf(cur);
    if (!on && current) remembered.set(memoryKey, current);
    const patch = shadowPatch(cur, on ? (remembered.get(memoryKey) ?? defaultShadow) : null);
    if (patch) patchTarget(target, patch);
  };

  return (
    <InspectorSection id={id} title={t('Shadow')} action={<Switch size="sm" aria-label={t('Shadow')} checked={!!shadow} onCheckedChange={toggle} />}>
      {shadow ? (
        <>
          <Row label={t('Colour')}>
            <ColorField label={t('Shadow colour')} value={shadow.color} palette={palette} {...color} />
          </Row>
          <SliderRow label={t('Blur')} value={toPct(shadow.blur)} apply={applyBlur} min={0} max={20} inputMax={200} step={0.1} precision={2} unit="%" />
          <Row label={t('Offset')}>
            <Pair>
              <NumberField label={t('X')} labelTitle={t('Horizontal offset, % of the shorter canvas side')} value={toPct(shadow.x)} min={-200} max={200} step={0.1} precision={2} unit="%" {...x} />
              <NumberField label={t('Y')} labelTitle={t('Vertical offset, % of the shorter canvas side')} value={toPct(shadow.y)} min={-200} max={200} step={0.1} precision={2} unit="%" {...y} />
            </Pair>
          </Row>
        </>
      ) : (
        <p className="text-xs leading-4 text-text-3">
          {el.kind === 'text' ? t('Lifts the text off the background.') : el.kind === 'device' ? t('Lifts the device off the background.') : t('Lifts the image off the background.')}
        </p>
      )}
    </InspectorSection>
  );
});

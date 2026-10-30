import { FAMILIES } from '../../model/catalog';
import type { FamilyId } from '../../model/types';

/** CSS height of a slide preview of `width` for `family`. */
export function slideHeight(family: FamilyId, width: number): number {
  const d = FAMILIES[family].design;
  return Math.round((width * d.height) / d.width);
}

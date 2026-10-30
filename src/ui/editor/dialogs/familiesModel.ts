/**
 * Pure helpers behind the "Devices & stores" dialog.
 */
import { FAMILIES } from '../../../model/catalog';
import type { FamilyId, Project } from '../../../model/types';
import { plural } from './labels';

/** Screenshots placed for a family (every slide, slot and language). */
export function familyShotCount(project: Project, family: FamilyId): number {
  let n = 0;
  for (const slide of project.slides) {
    for (const byLang of Object.values(slide.shots[family] ?? {})) n += Object.keys(byLang ?? {}).length;
  }
  return n;
}

/** "Up to 10 screenshots" / "One banner image". */
export function slideLimitLabel(family: FamilyId): string {
  const max = FAMILIES[family].maxSlides;
  return max === 1 ? 'One banner image' : `Up to ${max} screenshots`;
}

/**
 * What turning a family off means, or null when nothing worth confirming
 * happens (no screenshots, not the primary family).
 */
export function disableConfirmation(project: Project, family: FamilyId): { title: string; message: string } | null {
  if (!project.families.includes(family) || project.families.length <= 1) return null;
  const label = FAMILIES[family].label;
  const shots = familyShotCount(project, family);
  const primary = project.families[0] === family;
  if (shots === 0 && !primary) return null;
  const parts: string[] = [];
  if (shots > 0) parts.push(`${label} has ${plural(shots, 'screenshot')}. They stay in the project and come back when you turn ${label} on again, but nothing is exported for it.`);
  else parts.push(`Nothing is exported for ${label} while it is off; its layouts stay in the project.`);
  if (primary) parts.push(`${FAMILIES[project.families[1]].label} becomes the primary device, and devices without their own layouts adapt from it.`);
  return { title: `Turn off ${label}?`, message: parts.join(' ') };
}

/**
 * "?demo" opens a ready-made project straight away (used for visual QA,
 * end-to-end tests and screen recordings):
 *   ?demo                      first built-in template, iPhone + Android, English + Arabic
 *   ?demo=<templateId>         a specific template
 *   &families=iphone,ipad      device families
 *   &langs=en-US,de-DE         languages (first = base)
 */
import type { FamilyId } from '../../model/types';
import { FAMILY_ORDER, LANGUAGES } from '../../model/catalog';
import { BUILTIN_TEMPLATES } from '../../templates';
import { createAndOpenProject, toast } from '../../store';

let started = false;

export async function maybeStartDemo(): Promise<void> {
  if (started || typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (!params.has('demo')) return;
  started = true;
  const wanted = params.get('demo') ?? '';
  const template = BUILTIN_TEMPLATES.find((t) => t.id === wanted) ?? BUILTIN_TEMPLATES[0] ?? null;
  const families = (params.get('families') ?? 'iphone,android-phone')
    .split(',')
    .filter((f): f is FamilyId => (FAMILY_ORDER as string[]).includes(f));
  const languages = (params.get('langs') ?? 'en-US,ar-SA').split(',').filter((l) => LANGUAGES.some((x) => x.code === l));
  try {
    await createAndOpenProject(template, {
      name: template ? `${template.name} demo` : 'Demo project',
      families: families.length ? families : ['iphone'],
      languages: languages.length ? languages : ['en-US'],
    });
  } catch (err) {
    toast.error('Could not open the demo project', err instanceof Error ? err.message : String(err));
  }
}

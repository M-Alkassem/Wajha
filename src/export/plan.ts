/**
 * planExport: turns a project and the export dialog's settings into the
 * exact list of files to render, plus the warnings to show before anything
 * runs. Pure and deterministic: same input, same jobs in the same order.
 */
import { FAMILIES, languageInfo, sizeById } from '../model/catalog';
import { resolveLayout, resolveShot } from '../model/resolve';
import type { DeviceElement, ExportSettings, ExportSize, FamilyId, LangCode, Project, SlideElement, StoreId } from '../model/types';
import { deliverScreenshotSet, exportPath, storeLabel, storeLocale } from './paths';
import type { ExportJob, ExportPlan, ExportWarning } from './types';

/** Warnings the user must see first come first; within a kind the traversal order is kept. */
const KIND_ORDER: Record<ExportWarning['kind'], number> = {
  'no-locale-code': 0,
  'too-many-slides': 1,
  'missing-screenshot': 2,
  'text-overflow': 3,
};

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

const isFamily = (f: string): f is FamilyId => Object.prototype.hasOwnProperty.call(FAMILIES, f);

const isVisibleDevice = (el: SlideElement): el is DeviceElement => el.kind === 'device' && el.hidden !== true && el.opacity > 0;

/** Key for "same file" on case-insensitive, normalisation-insensitive file systems (APFS, NTFS). */
const pathKey = (path: string) => path.normalize('NFC').toLowerCase();

const slideRange = (from: number, to: number) => (from === to ? `slide ${from} is` : `slides ${from}–${to} are`);

function tooManySlidesWarning(family: FamilyId, slideCount: number): ExportWarning {
  const info = FAMILIES[family];
  const max = info.maxSlides;
  const message =
    max === 1
      ? `The ${info.label} uses slide 1 only; ${slideRange(2, slideCount)} not exported for it.`
      : `${storeLabel(info.stores[0])} accepts up to ${max} ${info.label} screenshots per language; ${slideRange(max + 1, slideCount)} not exported for ${info.label}.`;
  return { kind: 'too-many-slides', message, family };
}

function noLocaleWarning(lang: LangCode, store: StoreId): ExportWarning {
  const name = languageInfo(lang).name;
  const label = storeLabel(store);
  return { kind: 'no-locale-code', message: `${label} has no ${name} localization, so ${name} is skipped for ${label} sizes.`, lang };
}

function sharedFolderWarning(lang: LangCode, owner: LangCode, store: StoreId): ExportWarning {
  const name = languageInfo(lang).name;
  const label = storeLabel(store);
  return {
    kind: 'no-locale-code',
    message: `${name} would be written to the same ${label} folder as ${languageInfo(owner).name}, so ${name} is skipped for ${label} sizes.`,
    lang,
  };
}

function sharedSizeWarning(size: ExportSize, owner: ExportSize): ExportWarning {
  return {
    kind: 'too-many-slides',
    message: `${size.label} would overwrite the ${owner.label} files in this folder structure, so it is skipped. Export it with the "stores" or "flat" structure instead.`,
    family: size.family,
  };
}

function sharedDeliverSetWarning(size: ExportSize, owner: ExportSize): ExportWarning {
  return {
    kind: 'too-many-slides',
    message: `${size.label} goes into the same App Store Connect screenshot set as ${owner.label} when fastlane uploads it, so it is skipped. Export it with the "stores" or "flat" structure instead.`,
    family: size.family,
  };
}

function missingShotWarning(slideIndex: number, family: FamilyId, lang: LangCode, baseLang: LangCode, devices: number): ExportWarning {
  const name = languageInfo(lang).name;
  const fallback = lang !== baseLang && baseLang !== '' ? ` or in the base language (${languageInfo(baseLang).name})` : '';
  const who = devices > 1 ? `${devices} devices show` : 'The device shows';
  return {
    kind: 'missing-screenshot',
    message: `Slide ${slideIndex + 1} has no ${FAMILIES[family].label} screenshot in ${name}${fallback}. ${who} a placeholder screen until you drop a screenshot onto ${devices > 1 ? 'them' : 'it'}.`,
    slideIndex,
    family,
    lang,
  };
}

/**
 * Builds the export plan.
 *
 * Sizes: `settings.sizes` limited to enabled families (unknown ids ignored);
 * when that leaves nothing, every enabled family's default sizes. Languages:
 * `settings.languages` that the project has, else all project languages.
 * One job per size x language x slide, slides capped at the family's store
 * limit. Jobs are ordered by family (project order), size (catalog order),
 * language (project order) and slide.
 *
 * Warnings: one "too-many-slides" per family over its limit; one
 * "no-locale-code" per store x language the store does not offer (those jobs
 * are skipped); one "missing-screenshot" per slide x family x language whose
 * resolved layout has a visible device without a screenshot after the base
 * language fallback. A language or size whose files would land on paths
 * already taken (two codes sharing a store locale, two sizes sharing a
 * fastlane supply folder) is skipped with a warning instead of overwriting
 * files, and so is a second size for one App Store Connect screenshot set
 * in the fastlane structure (deliver would upload every slide twice).
 */
export function planExport(project: Project, settings: ExportSettings): ExportPlan {
  const families = unique(project.families).filter(isFamily);
  const enabled = new Set<FamilyId>(families);
  const requested = new Set(
    unique(settings.sizes ?? [])
      .map((id) => sizeById(id))
      .filter((s): s is ExportSize => s !== undefined && enabled.has(s.family))
      .map((s) => s.id),
  );
  const projectLangs = unique(project.languages);
  const wanted = new Set(settings.languages ?? []);
  const selected = projectLangs.filter((l) => wanted.has(l));
  const langs = selected.length > 0 ? selected : projectLangs;
  const baseLang = project.languages[0] ?? '';
  const ext = settings.format === 'jpeg' ? 'jpg' : 'png';
  const slideCount = project.slides.length;

  const jobs: ExportJob[] = [];
  const warnings: ExportWarning[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, make: () => ExportWarning) => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(make());
  };
  /** pathKey -> who wrote it first */
  const taken = new Map<string, { lang: LangCode; size: ExportSize }>();
  /** fastlane deliver screenshot set + locale -> the size that fills it */
  const deliverSets = new Map<string, ExportSize>();

  for (const family of families) {
    const info = FAMILIES[family];
    const sizes = info.sizes.filter((s) => (requested.size > 0 ? requested.has(s.id) : s.default));
    const count = Math.min(slideCount, info.maxSlides);
    const exportedLangs = new Set<LangCode>();
    const jobsBefore = jobs.length;

    for (const size of sizes) {
      for (const lang of langs) {
        const locale = storeLocale(lang, size.store);
        if (locale === null) {
          warnOnce(`locale\n${size.store}\n${lang}`, () => noLocaleWarning(lang, size.store));
          continue;
        }
        const setKey = settings.structure === 'fastlane' && size.store === 'app-store' ? `${deliverScreenshotSet(size)}\n${locale}` : null;
        const setOwner = setKey === null ? undefined : deliverSets.get(setKey);
        if (setOwner && setOwner !== size) {
          warnOnce(`deliver-set\n${size.id}`, () => sharedDeliverSetWarning(size, setOwner));
          continue;
        }
        const group: ExportJob[] = [];
        const groupKeys = new Set<string>();
        let clash: { lang: LangCode; size: ExportSize } | undefined;
        for (let slideIndex = 0; slideIndex < count && !clash; slideIndex++) {
          const job = { family, sizeId: size.id, width: size.width, height: size.height, lang, slideIndex };
          const path = exportPath(settings.structure, job, ext, project.name);
          const key = pathKey(path);
          // A file name without a slide number (the feature graphic) only ever holds the first slide.
          if (groupKeys.has(key)) break;
          groupKeys.add(key);
          clash = taken.get(key);
          group.push({ ...job, path });
        }
        if (clash) {
          const owner = clash;
          if (owner.lang !== lang) warnOnce(`shared-locale\n${size.store}\n${lang}`, () => sharedFolderWarning(lang, owner.lang, size.store));
          else warnOnce(`shared-size\n${size.id}`, () => sharedSizeWarning(size, owner.size));
          continue;
        }
        for (const job of group) {
          taken.set(pathKey(job.path), { lang, size });
          jobs.push(job);
        }
        if (setKey !== null) deliverSets.set(setKey, size);
        if (group.length > 0) exportedLangs.add(lang);
      }
    }

    if (jobs.length > jobsBefore && slideCount > info.maxSlides) warnings.push(tooManySlidesWarning(family, slideCount));

    // Screenshots are per family and language, not per size: check each exported language once.
    const checkLangs = langs.filter((l) => exportedLangs.has(l));
    if (checkLangs.length === 0) continue;
    const devicesBySlide = project.slides.slice(0, count).map((slide) => resolveLayout(project, slide, family).elements.filter(isVisibleDevice));
    for (const lang of checkLangs) {
      devicesBySlide.forEach((devices, slideIndex) => {
        const slide = project.slides[slideIndex];
        const missing = devices.filter((d) => resolveShot(slide, family, d.slot, lang, baseLang) === null).length;
        if (missing > 0) warnings.push(missingShotWarning(slideIndex, family, lang, baseLang, missing));
      });
    }
  }

  warnings.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return { jobs, warnings };
}

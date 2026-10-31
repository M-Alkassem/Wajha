/**
 * The editor: the open project, view state (active family, language and
 * slide, selection, zoom, panels), the clipboard and undo history.
 *
 * Every project change is a named action. Actions validate their input
 * (rejected input changes nothing and returns false/null), apply the change
 * through immer, bump `project.updatedAt` and `version`, and record one undo
 * step, except:
 *  - inside beginGesture()/endGesture() (a whole drag is one step, and a
 *    drag or scrub that ends where it began is none);
 *  - consecutive setText calls for the same slide/key/language, and
 *    consecutive nudges of one element, within 800 ms (one step per burst);
 *  - addAssets, which is not a design change: imported files survive undo.
 *
 * History holds immer snapshots of the project, so unchanged slides are
 * shared between entries and 200 steps cost little memory.
 *
 * Layouts that a family only derives (see resolveLayout) are materialised,
 * i.e. stored on the slide, the first time an element in them is edited.
 */
import { castDraft, freeze, produce, type Draft } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { FAMILIES, sizeById } from '../model/catalog';
import { deepClone, jsonEqual } from '../model/clone';
import { DEFAULT_FAMILY, DEFAULT_FONT, DEFAULT_LANGUAGE, newDeviceElement, newImageElement, newShapeElement, newSlide, newTextElement, type TextRole } from '../model/defaults';
import { newId } from '../model/ids';
import { layoutSource, resolveLayout } from '../model/resolve';
import { LIMITS, cleanFontName, cleanName, cleanText, isAssetId, isFamilyId, isLangCode, isSafeKey, normalizeColor, uniqueFamilies, uniqueLanguages } from '../model/rules';
import type {
  AssetInfo,
  ProjectFont,
  Background,
  DeviceElement,
  ElementKind,
  ExportSettings,
  FamilyId,
  FrameStyle,
  ImageElement,
  LangCode,
  Project,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  SlideLayout,
  TextElement,
  TextStyle,
} from '../model/types';
import {
  SHAPE_KINDS,
  ValidationError,
  cleanAssetInfo,
  cleanFonts,
  cleanBackground,
  cleanElement,
  cleanExportSettings,
  cleanTexts,
  contextFor,
  type ValidationContext,
} from '../model/validate';

export const HISTORY_LIMIT = 200;
/** Typing (and nudging) bursts closer together than this are one undo step. */
export const COALESCE_MS = 800;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** Zoom levels zoomIn/zoomOut step through. */
export const ZOOM_STEPS: readonly number[] = [0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Practical cap on slides per project (the stores show at most 10). */
export const MAX_SLIDES = 30;
/** Offset applied to duplicated and pasted elements, fraction of the canvas. */
export const DUPLICATE_OFFSET = 0.02;

export type LeftTab = 'slides' | 'layers';

type Patch<T> = Partial<Omit<T, 'id' | 'kind'>>;

/** Fields to change on an element; `style` is merged into the existing style. */
export type ElementPatch =
  | (Patch<Omit<DeviceElement, 'style'>> & { style?: Partial<FrameStyle> })
  | (Patch<Omit<TextElement, 'style'>> & { style?: Partial<TextStyle> })
  | Patch<ShapeElement>
  | Patch<ImageElement>;

export interface AddElementInit {
  /** Text preset (default "caption"). */
  role?: TextRole;
  /** Shape kind (default "circle"). */
  shape?: ShapeKind;
  /** Required for images: an asset of the project. */
  assetId?: string;
  /** Initial text of a text element, in the active language. */
  text?: string;
  /** Fields overriding the preset (validated), e.g. a drop position. */
  patch?: ElementPatch;
}

export interface ClipboardItem {
  element: SlideElement;
  /** Copied text element: its text per language. */
  texts: Record<LangCode, string> | null;
  /** Copied device: its screenshot per language (in the family it was copied from). */
  shots: Record<LangCode, string> | null;
}

export interface EditorState {
  project: Project | null;
  /** Bumped on every project change (cheap dependency for canvases). */
  version: number;
  activeFamily: FamilyId;
  activeLang: LangCode;
  activeSlideId: string | null;
  /** Selected element id in the active slide and family. */
  selection: string | null;
  hoverId: string | null;
  zoom: number;
  /** Zoom follows the stage size. */
  fit: boolean;
  leftTab: LeftTab;
  clipboard: ClipboardItem | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Between beginGesture() and endGesture(). */
  inGesture: boolean;

  openProject(project: Project): void;
  closeProject(): void;
  renameProject(name: string): boolean;

  setActiveFamily(id: FamilyId): boolean;
  setActiveLang(code: LangCode): boolean;
  /** Switches slides and clears the selection. */
  setActiveSlide(id: string): boolean;
  /** Selects an element of the active slide, or of `slideId` (which becomes active). */
  select(elementId: string | null, slideId?: string): boolean;
  hover(elementId: string | null): void;
  /** Sets the zoom (clamped to 0.1..4); `fit` stays on only when passed true (the stage reporting its fit zoom). */
  setZoom(zoom: number, fit?: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  setFit(fit: boolean): void;
  setLeftTab(tab: LeftTab): void;

  /** New slide after the active one with its design (fresh ids, empty texts). Returns its id. */
  addSlide(): string | null;
  duplicateSlide(slideId: string): string | null;
  /** Never deletes the last slide. */
  deleteSlide(slideId: string): boolean;
  moveSlide(from: number, to: number): boolean;

  updateElement(slideId: string, family: FamilyId, elementId: string, patch: ElementPatch): boolean;
  addElement(slideId: string, family: FamilyId, kind: ElementKind, init?: AddElementInit): string | null;
  deleteElement(slideId: string, family: FamilyId, elementId: string): boolean;
  duplicateElement(slideId: string, family: FamilyId, elementId: string): string | null;
  /** Moves the element to `toIndex` in painter's order (0 = bottom). */
  reorderElement(slideId: string, family: FamilyId, elementId: string, toIndex: number): boolean;
  bringForward(slideId: string, family: FamilyId, elementId: string): boolean;
  sendBackward(slideId: string, family: FamilyId, elementId: string): boolean;
  bringToFront(slideId: string, family: FamilyId, elementId: string): boolean;
  sendToBack(slideId: string, family: FamilyId, elementId: string): boolean;
  toggleHidden(slideId: string, family: FamilyId, elementId: string): boolean;
  toggleLocked(slideId: string, family: FamilyId, elementId: string): boolean;
  /** Moves the selection by (dx, dy) design-canvas pixels of the active family. Locked elements stay. */
  nudge(dx: number, dy: number): boolean;
  /** Forgets a non-primary family's own layout so it derives from the primary family again. */
  resetLayout(slideId: string, family: FamilyId): boolean;

  copySelection(): boolean;
  cutSelection(): boolean;
  /** Pastes the clipboard into the active slide and family; returns the new element id. */
  paste(): string | null;

  setText(slideId: string, key: string, lang: LangCode, value: string): boolean;
  /**
   * Bulk text edit (translations table, CSV import): for each listed slide,
   * each listed language's texts are replaced. Unknown valid languages are
   * added to the project unless `addLanguages` is false. One undo step;
   * returns how many slides changed.
   */
  replaceTexts(textsBySlideId: Record<string, Record<LangCode, Record<string, string>>>, options?: { addLanguages?: boolean }): number;
  setShot(slideId: string, family: FamilyId, slot: string, lang: LangCode, assetId: string | null): boolean;
  /** Registers imported images; returns how many were new. */
  addAssets(assets: AssetInfo[]): number;
  /** Registers font files stored with the project (storage putProjectFont); returns how many were new. */
  addFonts(fonts: ProjectFont[]): number;
  /**
   * Puts the screenshots into the first device of consecutive slides starting
   * at `startSlideIndex`, adding slides (up to the family's store limit) as
   * needed. Returns how many were assigned.
   */
  assignShotsInOrder(family: FamilyId, lang: LangCode, assetIds: string[], startSlideIndex: number): number;

  setSlideBackground(slideId: string, family: FamilyId, bg: Background | null): boolean;
  setThemeBackground(bg: Background): boolean;
  setPanorama(on: boolean): boolean;
  setPalette(colors: string[]): boolean;
  setMockDark(on: boolean): boolean;
  /** Sets the theme fonts and restyles every text element: "headline" keys get `heading`, the rest `body`. */
  applyFonts(heading: string, body: string): boolean;

  /** Appends a language; its texts fall back to the base language until translated. */
  addLanguage(code: LangCode): boolean;
  /** Removes a language with its texts and screenshots; never the last one. */
  removeLanguage(code: LangCode): boolean;
  /** Makes `code` the base (fallback) language by moving it first. */
  setBaseLanguage(code: LangCode): boolean;
  /** Appends a family; its layouts derive from the primary family until edited. */
  enableFamily(id: FamilyId): boolean;
  /** Removes a family from the project (its layouts are kept); never the last one. */
  disableFamily(id: FamilyId): boolean;
  setExportSettings(patch: Partial<ExportSettings>): boolean;

  beginGesture(): void;
  endGesture(): void;
  /** Ends the gesture and reverts everything it changed. */
  cancelGesture(): void;
  undo(): boolean;
  redo(): boolean;
}

type ViewFields = Pick<EditorState, 'activeFamily' | 'activeLang' | 'activeSlideId' | 'selection' | 'hoverId'>;

/** Thrown inside a commit recipe to abandon the change. */
class Rejected extends Error {}
const reject = (): never => {
  throw new Rejected('rejected');
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* Pure helpers --------------------------------------------------------- */

/** View state that is valid for `p`: unknown family/language/slide fall back, a vanished selection clears. */
function viewFor(s: ViewFields, p: Project | null, prev: Project | null): ViewFields {
  if (!p) return { activeFamily: s.activeFamily, activeLang: s.activeLang, activeSlideId: null, selection: null, hoverId: null };
  const activeFamily = p.families.includes(s.activeFamily) ? s.activeFamily : p.families[0];
  const activeLang = p.languages.includes(s.activeLang) ? s.activeLang : p.languages[0];
  let activeSlideId = s.activeSlideId;
  if (activeSlideId === null || !p.slides.some((x) => x.id === activeSlideId)) {
    // Stay near where the user was: the slide that took the removed one's place.
    const old = prev && s.activeSlideId ? prev.slides.findIndex((x) => x.id === s.activeSlideId) : -1;
    activeSlideId = p.slides[old >= 0 ? Math.min(old, p.slides.length - 1) : 0]?.id ?? null;
  }
  const slide = activeSlideId === null ? undefined : p.slides.find((x) => x.id === activeSlideId);
  const layout = slide ? resolveLayout(p, slide, activeFamily) : null;
  const sameSlide = activeSlideId === s.activeSlideId;
  const exists = (id: string | null) => id !== null && sameSlide && !!layout && layout.elements.some((e) => e.id === id);
  return {
    activeFamily,
    activeLang,
    activeSlideId,
    selection: exists(s.selection) ? s.selection : null,
    hoverId: exists(s.hoverId) ? s.hoverId : null,
  };
}

/** `base`, else `base2`, `base3`, ... not in `used`. */
function uniqueName(base: string, used: ReadonlySet<string>, firstSuffix = 2): string {
  if (!used.has(base)) return base;
  const stem = base.replace(/\d+$/, '') || base;
  for (let n = firstSuffix; n < firstSuffix + used.size + 2; n++) {
    const candidate = `${stem}${n}`.slice(0, 40);
    if (!used.has(candidate)) return candidate;
  }
  return newId('k');
}

function uniqueElementId(layouts: Iterable<SlideLayout>): string {
  const used = new Set<string>();
  for (const l of layouts) for (const e of l.elements) used.add(e.id);
  let id = newId('e');
  while (used.has(id)) id = newId('e');
  return id;
}

/** Text keys an element could collide with: every text element's key and every key with text, in any language. */
function textKeysOf(slide: Slide, extra: SlideLayout): Set<string> {
  const used = new Set<string>();
  for (const l of [...Object.values(slide.layouts), extra]) {
    if (!l) continue;
    for (const e of l.elements) if (e.kind === 'text') used.add(e.key);
  }
  for (const byKey of Object.values(slide.texts)) for (const k of Object.keys(byKey)) used.add(k);
  return used;
}

/** A screenshot slot not used by any device in the layout ("main" first). */
function freeSlot(layout: SlideLayout, slide: Slide, family: FamilyId): string {
  const used = new Set<string>(Object.keys(slide.shots[family] ?? {}));
  for (const e of layout.elements) if (e.kind === 'device') used.add(e.slot);
  if (!used.has('main')) return 'main';
  for (let n = 2; n < used.size + 3; n++) {
    const slot = `device${n}`;
    if (!used.has(slot)) return slot;
  }
  return newId('d');
}

/** Drops ids, kinds, undefined values and non-finite numbers from a patch. */
function cleanPatch(patch: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || k === 'kind' || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) continue;
    out[k] = v;
  }
  return out;
}

// Asset maps are frozen and keep their identity across unrelated edits, so one
// lookup set per map serves every drag update.
const contexts = new WeakMap<Record<string, AssetInfo>, ValidationContext>();
function assetContext(project: Project): ValidationContext {
  let ctx = contexts.get(project.assets);
  if (!ctx) {
    ctx = contextFor(project.assets);
    contexts.set(project.assets, ctx);
  }
  return ctx;
}

/** `current` with `patch` applied and validated, or null when the result is invalid. The id never changes. */
function mergeElement(current: SlideElement, patch: unknown, project: Project, layout: SlideLayout): SlideElement | null {
  const p = cleanPatch(patch);
  const base = deepClone(current) as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...p, id: current.id, kind: current.kind };
  if ('style' in p && typeof base.style === 'object' && base.style !== null) {
    merged.style = { ...(base.style as Record<string, unknown>), ...cleanPatch(p.style) };
  }
  if (merged.name === '') delete merged.name;
  const ids = new Set(layout.elements.filter((e) => e.id !== current.id).map((e) => e.id));
  try {
    const el = cleanElement(merged, 'element', assetContext(project), ids);
    if (!el) return null;
    el.id = current.id;
    return el;
  } catch (e) {
    if (e instanceof ValidationError) return null;
    throw e;
  }
}

/**
 * A new slide with `slide`'s design: stored layouts copied with fresh element
 * ids (the same new id in every family), no screenshots, empty texts for the
 * text keys its layouts use.
 */
function copyDesign(project: Project, slide: Slide): Slide {
  const ids = new Map<string, string>();
  const mapId = (old: string, used: Set<string>) => {
    let id = ids.get(old);
    if (!id || used.has(id)) {
      id = newId('e');
      if (!ids.has(old)) ids.set(old, id);
    }
    used.add(id);
    return id;
  };
  const layouts: Slide['layouts'] = {};
  for (const f of Object.keys(slide.layouts) as FamilyId[]) {
    const l = slide.layouts[f];
    if (!l) continue;
    const used = new Set<string>();
    layouts[f] = {
      background: l.background ? deepClone(l.background) : null,
      elements: l.elements.map((e) => ({ ...deepClone(e), id: mapId(e.id, used) })),
    };
  }
  const keys = new Set<string>();
  for (const f of project.families) {
    for (const e of resolveLayout(project, slide, f).elements) if (e.kind === 'text') keys.add(e.key);
  }
  const texts: Slide['texts'] = {};
  for (const lang of project.languages) {
    const t: Record<string, string> = {};
    for (const k of keys) t[k] = '';
    texts[lang] = t;
  }
  return { id: newId('s'), texts, shots: {}, layouts };
}

/** Light repair so a hand-built project cannot break the editor; files from disk are validated by storage. */
function prepareProject(project: Project): Project {
  const p = deepClone(project);
  p.families = uniqueFamilies(p.families);
  if (!p.families.length) p.families = [DEFAULT_FAMILY];
  p.languages = uniqueLanguages(p.languages);
  if (!p.languages.length) p.languages = [DEFAULT_LANGUAGE];
  if (!p.assets || typeof p.assets !== 'object') p.assets = {};
  p.slides = Array.isArray(p.slides) ? p.slides.filter((s) => typeof s === 'object' && s !== null) : [];
  for (const s of p.slides) {
    if (!s.texts || typeof s.texts !== 'object') s.texts = {};
    if (!s.shots || typeof s.shots !== 'object') s.shots = {};
    if (!s.layouts || typeof s.layouts !== 'object') s.layouts = {};
  }
  if (!p.slides.length) p.slides = [newSlide(p.families, p.theme, p.languages)];
  return freeze(p, true);
}

/** `target` carrying every asset of `current`: imported images survive undo and redo. */
function withAssets(target: Project, current: Project): Project {
  const missing = Object.keys(current.assets).some((id) => !target.assets[id]);
  if (!missing) return target;
  return freeze({ ...target, assets: freeze({ ...current.assets, ...target.assets }) });
}

/**
 * True when `a` holds the same design as `b`: they differ at most in the edit
 * time and in registered assets, which are not undo steps (see withAssets).
 * Immer shares every subtree an edit did not touch, so this only walks the
 * edited paths, however large the project.
 */
function sameDesign(a: Project, b: Project): boolean {
  return jsonEqual({ ...a, updatedAt: b.updatedAt, assets: b.assets }, b);
}

function deleteEmpty(record: Record<string, unknown>, key: string): void {
  const v = record[key];
  if (v && typeof v === 'object' && Object.keys(v).length === 0) delete record[key];
}

/* Store ---------------------------------------------------------------- */

interface History {
  past: Project[];
  future: Project[];
  depth: number;
  base: Project | null;
  coalesce: { tag: string; at: number } | null;
}

interface CommitOptions {
  /** Consecutive commits with the same tag inside COALESCE_MS share one undo step. */
  tag?: string;
  /** false: not an undo step (asset registration). */
  history?: boolean;
  /** View state to apply with the change (validated against the new project). */
  view?: Partial<ViewFields>;
}

/** Creates an isolated editor store (the app uses the `useEditor` singleton; tests make their own). */
export function createEditorStore() {
  const h: History = { past: [], future: [], depth: 0, base: null, coalesce: null };

  return create<EditorState>()(
    immer((set, get) => {
      const resetHistory = () => {
        h.past = [];
        h.future = [];
        h.depth = 0;
        h.base = null;
        h.coalesce = null;
      };

      const pushPast = (p: Project) => {
        h.past.push(p);
        if (h.past.length > HISTORY_LIMIT) h.past.splice(0, h.past.length - HISTORY_LIMIT);
      };

      const record = (prev: Project, tag?: string) => {
        if (h.depth > 0) return;
        const now = Date.now();
        if (tag && h.coalesce && h.coalesce.tag === tag && now - h.coalesce.at <= COALESCE_MS && h.past.length > 0) {
          h.coalesce.at = now;
          h.future = [];
          return;
        }
        pushPast(prev);
        h.future = [];
        h.coalesce = tag ? { tag, at: now } : null;
      };

      /** Installs `next` and repairs the view state around it. */
      const install = (next: Project | null, prev: Project | null, view: Partial<ViewFields> = {}, extra: Partial<EditorState> = {}) => {
        const s = get();
        set({
          project: next,
          version: s.version + 1,
          ...viewFor({ ...s, ...view }, next, prev),
          canUndo: h.past.length > 0,
          canRedo: h.future.length > 0,
          ...extra,
        });
      };

      const commit = (recipe: (draft: Draft<Project>, base: Project) => void, opts: CommitOptions = {}): boolean => {
        const prev = get().project;
        if (!prev) return false;
        let changed: Project;
        try {
          changed = produce(prev, (draft) => {
            recipe(draft, prev);
          });
        } catch (e) {
          if (e instanceof Rejected || e instanceof ValidationError) return false;
          throw e;
        }
        if (changed === prev) return false;
        const next = freeze({ ...changed, updatedAt: Date.now() });
        if (opts.history !== false) record(prev, opts.tag);
        install(next, prev, opts.view);
        return true;
      };

      /**
       * Commits the running gesture as one undo step, whatever its nesting
       * depth. A gesture that ends with the design it began with (a scrub
       * back to its start value) records none and keeps the redo stack.
       */
      const finishGesture = () => {
        if (h.depth === 0) return;
        h.depth = 0;
        const base = h.base;
        h.base = null;
        const cur = get().project;
        if (base && cur && cur !== base && !sameDesign(cur, base)) {
          pushPast(base);
          h.future = [];
          h.coalesce = null;
        }
        set({ inGesture: false, canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
      };

      interface Located {
        project: Project;
        slide: Slide;
        index: number;
        layout: SlideLayout;
      }

      const locate = (slideId: string, family: FamilyId): Located | null => {
        const project = get().project;
        if (!project || !isFamilyId(family) || typeof slideId !== 'string') return null;
        const index = project.slides.findIndex((s) => s.id === slideId);
        if (index < 0) return null;
        const slide = project.slides[index];
        return { project, slide, index, layout: resolveLayout(project, slide, family) };
      };

      /** The family's layout in the draft, materialising the derived one first. */
      const ensureLayout = (d: Draft<Project>, base: Project, index: number, family: FamilyId): Draft<SlideLayout> => {
        const ds = d.slides[index];
        const existing = ds.layouts[family];
        if (existing) return existing;
        const bs = base.slides[index];
        const primary = base.families[0];
        // Keep the primary family the adaptation source: if nothing is stored yet,
        // store its (default) layout too, or every other family would start
        // deriving from this one.
        if (primary && primary !== family && layoutSource(base, bs, primary) === null) {
          ds.layouts[primary] = castDraft(deepClone(resolveLayout(base, bs, primary)));
        }
        const layout = castDraft(deepClone(resolveLayout(base, bs, family)));
        ds.layouts[family] = layout;
        return layout;
      };

      const elementIndex = (layout: { elements: { id: string }[] }, id: string) => {
        const i = layout.elements.findIndex((e) => e.id === id);
        if (i < 0) reject();
        return i;
      };

      const patchElement = (slideId: string, family: FamilyId, elementId: string, patch: unknown, tag?: string): boolean => {
        const loc = locate(slideId, family);
        if (!loc) return false;
        const current = loc.layout.elements.find((e) => e.id === elementId);
        if (!current) return false;
        const next = mergeElement(current, patch, loc.project, loc.layout);
        if (!next || jsonEqual(next, current)) return false;
        return commit(
          (d, base) => {
            const layout = ensureLayout(d, base, loc.index, family);
            layout.elements[elementIndex(layout, elementId)] = castDraft(next);
          },
          { tag },
        );
      };

      const moveElement = (slideId: string, family: FamilyId, elementId: string, target: (from: number, count: number) => number): boolean => {
        const loc = locate(slideId, family);
        if (!loc) return false;
        const from = loc.layout.elements.findIndex((e) => e.id === elementId);
        if (from < 0) return false;
        const count = loc.layout.elements.length;
        const raw = target(from, count);
        if (!Number.isFinite(raw)) return false;
        const to = clamp(Math.round(raw), 0, count - 1);
        if (to === from) return false;
        return commit((d, base) => {
          const layout = ensureLayout(d, base, loc.index, family);
          const [moved] = layout.elements.splice(elementIndex(layout, elementId), 1);
          layout.elements.splice(to, 0, moved);
        });
      };

      const slideIndex = (p: Project, slideId: string) => (typeof slideId === 'string' ? p.slides.findIndex((s) => s.id === slideId) : -1);

      return {
        project: null,
        version: 0,
        activeFamily: DEFAULT_FAMILY,
        activeLang: DEFAULT_LANGUAGE,
        activeSlideId: null,
        selection: null,
        hoverId: null,
        zoom: 1,
        fit: true,
        leftTab: 'slides',
        clipboard: null,
        canUndo: false,
        canRedo: false,
        inGesture: false,

        /* Project ---------------------------------------------------- */

        openProject(project) {
          if (typeof project !== 'object' || project === null) return;
          const p = prepareProject(project);
          resetHistory();
          set({
            project: p,
            version: get().version + 1,
            activeFamily: p.families[0],
            activeLang: p.languages[0],
            activeSlideId: p.slides[0].id,
            selection: null,
            hoverId: null,
            fit: true,
            leftTab: 'slides',
            canUndo: false,
            canRedo: false,
            inGesture: false,
          });
        },

        closeProject() {
          const had = get().project !== null;
          resetHistory();
          set({
            project: null,
            version: had ? get().version + 1 : get().version,
            activeSlideId: null,
            selection: null,
            hoverId: null,
            canUndo: false,
            canRedo: false,
            inGesture: false,
          });
        },

        renameProject(name) {
          const p = get().project;
          if (!p || typeof name !== 'string') return false;
          const clean = cleanName(name);
          if (!clean || clean === p.name) return false;
          return commit((d) => {
            d.name = clean;
          });
        },

        /* View ------------------------------------------------------- */

        setActiveFamily(id) {
          const s = get();
          if (!s.project || !s.project.families.includes(id)) return false;
          if (s.activeFamily === id) return true;
          // Adapted layouts keep element ids, so the selection usually survives.
          set(viewFor({ ...s, activeFamily: id }, s.project, s.project));
          return true;
        },

        setActiveLang(code) {
          const s = get();
          if (!s.project || !s.project.languages.includes(code)) return false;
          set({ activeLang: code });
          return true;
        },

        setActiveSlide(id) {
          const s = get();
          if (!s.project || !s.project.slides.some((x) => x.id === id)) return false;
          if (s.activeSlideId === id) return true;
          set({ activeSlideId: id, selection: null, hoverId: null });
          return true;
        },

        select(elementId, slideId) {
          const s = get();
          const p = s.project;
          if (!p) return false;
          const target = slideId ?? s.activeSlideId;
          const slide = target === null ? undefined : p.slides.find((x) => x.id === target);
          if (!slide) return false;
          if (elementId === null) {
            set({ selection: null, activeSlideId: slide.id });
            return true;
          }
          if (!resolveLayout(p, slide, s.activeFamily).elements.some((e) => e.id === elementId)) return false;
          set({ selection: elementId, activeSlideId: slide.id, hoverId: slide.id === s.activeSlideId ? s.hoverId : null });
          return true;
        },

        hover(elementId) {
          const s = get();
          if (elementId === s.hoverId) return;
          if (elementId === null) {
            set({ hoverId: null });
            return;
          }
          const slide = s.project?.slides.find((x) => x.id === s.activeSlideId);
          if (!s.project || !slide) return;
          if (resolveLayout(s.project, slide, s.activeFamily).elements.some((e) => e.id === elementId)) set({ hoverId: elementId });
        },

        setZoom(zoom, fit = false) {
          if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return;
          set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX), fit: fit === true });
        },

        zoomIn() {
          const z = get().zoom;
          set({ zoom: ZOOM_STEPS.find((v) => v > z * 1.001) ?? ZOOM_MAX, fit: false });
        },

        zoomOut() {
          const z = get().zoom;
          let next = ZOOM_MIN;
          for (const v of ZOOM_STEPS) if (v < z / 1.001) next = v;
          set({ zoom: next, fit: false });
        },

        setFit(fit) {
          set({ fit: fit === true });
        },

        setLeftTab(tab) {
          if (tab === 'slides' || tab === 'layers') set({ leftTab: tab });
        },

        /* Slides ----------------------------------------------------- */

        addSlide() {
          const s = get();
          const p = s.project;
          if (!p || p.slides.length >= MAX_SLIDES) return null;
          // After the active slide, else at the end; the design comes from the slide before it.
          const found = p.slides.findIndex((x) => x.id === s.activeSlideId);
          const index = found >= 0 ? found : p.slides.length - 1;
          const model = p.slides[index];
          const slide = model ? copyDesign(p, model) : newSlide(p.families, p.theme, p.languages);
          const ok = commit(
            (d) => {
              d.slides.splice(index + 1, 0, castDraft(slide));
            },
            { view: { activeSlideId: slide.id, selection: null } },
          );
          return ok ? slide.id : null;
        },

        duplicateSlide(slideId) {
          const p = get().project;
          if (!p || p.slides.length >= MAX_SLIDES) return null;
          const i = slideIndex(p, slideId);
          if (i < 0) return null;
          const src = p.slides[i];
          const copy: Slide = { ...copyDesign(p, src), texts: deepClone(src.texts), shots: deepClone(src.shots) };
          const ok = commit(
            (d) => {
              d.slides.splice(i + 1, 0, castDraft(copy));
            },
            { view: { activeSlideId: copy.id, selection: null } },
          );
          return ok ? copy.id : null;
        },

        deleteSlide(slideId) {
          const p = get().project;
          if (!p || p.slides.length <= 1) return false;
          const i = slideIndex(p, slideId);
          if (i < 0) return false;
          return commit((d) => {
            d.slides.splice(i, 1);
          });
        },

        moveSlide(from, to) {
          const p = get().project;
          if (!p || !Number.isInteger(from) || !Number.isFinite(to)) return false;
          if (from < 0 || from >= p.slides.length) return false;
          const target = clamp(Math.round(to), 0, p.slides.length - 1);
          if (target === from) return false;
          return commit((d) => {
            const [moved] = d.slides.splice(from, 1);
            d.slides.splice(target, 0, moved);
          });
        },

        /* Elements --------------------------------------------------- */

        updateElement(slideId, family, elementId, patch) {
          return patchElement(slideId, family, elementId, patch);
        },

        addElement(slideId, family, kind, init = {}) {
          const loc = locate(slideId, family);
          if (!loc || loc.layout.elements.length >= LIMITS.elements) return null;
          const { project, slide, layout } = loc;
          let el: SlideElement;
          switch (kind) {
            case 'text': {
              const role: TextRole = init.role === 'headline' || init.role === 'subtitle' ? init.role : 'caption';
              const text = newTextElement(role, family, project.theme);
              const inLayout = new Set(layout.elements.flatMap((e) => (e.kind === 'text' ? [e.key] : [])));
              // A headline or subtitle shares its text with the same role in other families.
              text.key = role !== 'caption' && !inLayout.has(role) ? role : uniqueName(role, textKeysOf(slide, layout));
              el = text;
              break;
            }
            case 'device': {
              const device = newDeviceElement(family, project.theme);
              device.slot = freeSlot(layout, slide, family);
              el = device;
              break;
            }
            case 'shape':
              el = newShapeElement(init.shape && SHAPE_KINDS.includes(init.shape) ? init.shape : 'circle', project.theme);
              break;
            case 'image': {
              const asset = typeof init.assetId === 'string' && isAssetId(init.assetId) ? project.assets[init.assetId] : undefined;
              if (!asset) return null;
              el = newImageElement(asset.id, asset.height / asset.width);
              break;
            }
            default:
              return null;
          }
          el.id = uniqueElementId([layout, ...Object.values(slide.layouts).filter((l): l is SlideLayout => !!l)]);
          if (init.patch) el = mergeElement(el, init.patch, project, layout) ?? el;
          const created = el;
          const lang = get().activeLang;
          const text = created.kind === 'text' && typeof init.text === 'string' ? cleanText(init.text) : null;
          const ok = commit(
            (d, base) => {
              const target = ensureLayout(d, base, loc.index, family);
              target.elements.push(castDraft(created));
              if (text !== null && created.kind === 'text' && base.languages.includes(lang)) {
                const texts = d.slides[loc.index].texts;
                (texts[lang] ??= {})[created.key] = text;
              }
            },
            { view: { activeSlideId: slideId, selection: created.id } },
          );
          return ok ? created.id : null;
        },

        deleteElement(slideId, family, elementId) {
          const loc = locate(slideId, family);
          if (!loc || !loc.layout.elements.some((e) => e.id === elementId)) return false;
          return commit((d, base) => {
            const layout = ensureLayout(d, base, loc.index, family);
            layout.elements.splice(elementIndex(layout, elementId), 1);
          });
        },

        duplicateElement(slideId, family, elementId) {
          const loc = locate(slideId, family);
          if (!loc || loc.layout.elements.length >= LIMITS.elements) return null;
          const { slide, layout } = loc;
          const source = layout.elements.find((e) => e.id === elementId);
          if (!source) return null;
          const copy = deepClone(source);
          copy.id = uniqueElementId([layout, ...Object.values(slide.layouts).filter((l): l is SlideLayout => !!l)]);
          copy.x = clamp(source.x + DUPLICATE_OFFSET, -2, 3);
          copy.y = clamp(source.y + DUPLICATE_OFFSET, -2, 3);
          let oldKey: string | null = null;
          let oldSlot: string | null = null;
          if (copy.kind === 'text' && source.kind === 'text') {
            // Its own text key, so editing the copy never edits the original.
            oldKey = source.key;
            copy.key = uniqueName(source.key, textKeysOf(slide, layout));
          } else if (copy.kind === 'device' && source.kind === 'device') {
            oldSlot = source.slot;
            copy.slot = freeSlot(layout, slide, family);
          }
          const ok = commit(
            (d, base) => {
              const target = ensureLayout(d, base, loc.index, family);
              target.elements.splice(elementIndex(target, elementId) + 1, 0, castDraft(copy));
              const ds = d.slides[loc.index];
              if (oldKey !== null && copy.kind === 'text') {
                for (const lang of Object.keys(ds.texts)) {
                  const t = ds.texts[lang];
                  if (t[oldKey] !== undefined) t[copy.key] = t[oldKey];
                }
              }
              if (oldSlot !== null && copy.kind === 'device') {
                const bySlot = ds.shots[family]?.[oldSlot];
                if (bySlot) (ds.shots[family] ??= {})[copy.slot] = { ...bySlot };
              }
            },
            { view: { activeSlideId: slideId, selection: copy.id } },
          );
          return ok ? copy.id : null;
        },

        reorderElement(slideId, family, elementId, toIndex) {
          return moveElement(slideId, family, elementId, () => toIndex);
        },
        bringForward(slideId, family, elementId) {
          return moveElement(slideId, family, elementId, (from) => from + 1);
        },
        sendBackward(slideId, family, elementId) {
          return moveElement(slideId, family, elementId, (from) => from - 1);
        },
        bringToFront(slideId, family, elementId) {
          return moveElement(slideId, family, elementId, (_from, count) => count - 1);
        },
        sendToBack(slideId, family, elementId) {
          return moveElement(slideId, family, elementId, () => 0);
        },

        toggleHidden(slideId, family, elementId) {
          const el = locate(slideId, family)?.layout.elements.find((e) => e.id === elementId);
          return el ? patchElement(slideId, family, elementId, { hidden: !el.hidden }) : false;
        },

        toggleLocked(slideId, family, elementId) {
          const el = locate(slideId, family)?.layout.elements.find((e) => e.id === elementId);
          return el ? patchElement(slideId, family, elementId, { locked: !el.locked }) : false;
        },

        nudge(dx, dy) {
          const s = get();
          if (!s.selection || !s.activeSlideId) return false;
          if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
          const el = locate(s.activeSlideId, s.activeFamily)?.layout.elements.find((e) => e.id === s.selection);
          if (!el || el.locked) return false;
          const design = FAMILIES[s.activeFamily].design;
          return patchElement(
            s.activeSlideId,
            s.activeFamily,
            el.id,
            { x: el.x + dx / design.width, y: el.y + dy / design.height },
            `nudge:${s.activeSlideId}:${s.activeFamily}:${el.id}`,
          );
        },

        resetLayout(slideId, family) {
          const p = get().project;
          if (!p || !isFamilyId(family) || family === p.families[0]) return false;
          const i = slideIndex(p, slideId);
          if (i < 0 || !p.slides[i].layouts[family]) return false;
          return commit((d) => {
            delete d.slides[i].layouts[family];
          });
        },

        /* Clipboard -------------------------------------------------- */

        copySelection() {
          const s = get();
          const p = s.project;
          if (!p || !s.selection || !s.activeSlideId) return false;
          const slide = p.slides.find((x) => x.id === s.activeSlideId);
          const el = slide ? resolveLayout(p, slide, s.activeFamily).elements.find((e) => e.id === s.selection) : undefined;
          if (!slide || !el) return false;
          const item: ClipboardItem = { element: deepClone(el), texts: null, shots: null };
          if (el.kind === 'text') {
            const texts: Record<LangCode, string> = {};
            for (const lang of p.languages) {
              const t = slide.texts[lang]?.[el.key];
              if (t !== undefined) texts[lang] = t;
            }
            item.texts = texts;
          } else if (el.kind === 'device') {
            const shots = slide.shots[s.activeFamily]?.[el.slot];
            item.shots = shots ? { ...shots } : {};
          }
          set({ clipboard: freeze(item, true) });
          return true;
        },

        cutSelection() {
          const s = get();
          if (!s.selection || !s.activeSlideId || !get().copySelection()) return false;
          return get().deleteElement(s.activeSlideId, s.activeFamily, s.selection);
        },

        paste() {
          const s = get();
          const clip = s.clipboard;
          if (!clip || !s.activeSlideId) return null;
          const loc = locate(s.activeSlideId, s.activeFamily);
          if (!loc || loc.layout.elements.length >= LIMITS.elements) return null;
          const { project, slide, layout, index } = loc;
          const family = s.activeFamily;
          const ids = new Set(layout.elements.map((e) => e.id));
          let el: SlideElement | null;
          try {
            // The clipboard may come from another project: validate against this one.
            el = cleanElement(deepClone(clip.element), 'clipboard', assetContext(project), ids);
          } catch {
            el = null;
          }
          if (!el) return null;
          el.id = uniqueElementId([layout, ...Object.values(slide.layouts).filter((l): l is SlideLayout => !!l)]);
          if (layout.elements.some((e) => Math.abs(e.x - el.x) < 1e-6 && Math.abs(e.y - el.y) < 1e-6)) {
            el.x = clamp(el.x + DUPLICATE_OFFSET, -2, 3);
            el.y = clamp(el.y + DUPLICATE_OFFSET, -2, 3);
          }
          const texts: Record<LangCode, string> = {};
          if (el.kind === 'text') {
            el.key = uniqueName(el.key, textKeysOf(slide, layout));
            for (const lang of project.languages) {
              const t = clip.texts?.[lang];
              if (typeof t === 'string') texts[lang] = cleanText(t);
            }
          }
          const shots: Record<LangCode, string> = {};
          if (el.kind === 'device') {
            el.slot = freeSlot(layout, slide, family);
            for (const [lang, id] of Object.entries(clip.shots ?? {})) if (project.languages.includes(lang) && project.assets[id]) shots[lang] = id;
          }
          const pasted = el;
          const ok = commit(
            (d, base) => {
              const target = ensureLayout(d, base, index, family);
              target.elements.push(castDraft(pasted));
              const ds = d.slides[index];
              if (pasted.kind === 'text') {
                for (const [lang, t] of Object.entries(texts)) (ds.texts[lang] ??= {})[pasted.key] = t;
              }
              if (pasted.kind === 'device' && Object.keys(shots).length) {
                (ds.shots[family] ??= {})[pasted.slot] = shots;
              }
            },
            { view: { selection: pasted.id } },
          );
          return ok ? pasted.id : null;
        },

        /* Texts and screenshots -------------------------------------- */

        setText(slideId, key, lang, value) {
          const p = get().project;
          if (!p || !isSafeKey(key) || !p.languages.includes(lang) || typeof value !== 'string') return false;
          const i = slideIndex(p, slideId);
          if (i < 0) return false;
          const text = cleanText(value);
          const byKey = p.slides[i].texts[lang];
          if (byKey?.[key] === text) return false;
          if (byKey && byKey[key] === undefined && Object.keys(byKey).length >= LIMITS.textKeys) return false;
          return commit(
            (d) => {
              (d.slides[i].texts[lang] ??= {})[key] = text;
            },
            { tag: `text:${slideId}:${key}:${lang}` },
          );
        },

        replaceTexts(textsBySlideId, options) {
          const p = get().project;
          if (!p || typeof textsBySlideId !== 'object' || textsBySlideId === null) return 0;
          const addLanguages = options?.addLanguages !== false;
          const added: LangCode[] = [];
          const updates = new Map<number, Record<LangCode, Record<string, string>>>();
          for (const [slideId, raw] of Object.entries(textsBySlideId)) {
            const i = slideIndex(p, slideId);
            if (i < 0) continue;
            let clean: Record<LangCode, Record<string, string>>;
            try {
              clean = cleanTexts(raw, 'texts');
            } catch {
              continue;
            }
            for (const lang of Object.keys(clean)) {
              if (p.languages.includes(lang) || added.includes(lang)) continue;
              if (addLanguages && p.languages.length + added.length < LIMITS.languages) added.push(lang);
              else delete clean[lang];
            }
            const merged = { ...p.slides[i].texts, ...clean };
            if (!jsonEqual(merged, p.slides[i].texts)) updates.set(i, merged);
          }
          if (!updates.size && !added.length) return 0;
          const ok = commit((d) => {
            for (const lang of added) d.languages.push(lang);
            if (d.export.languages.length) d.export.languages.push(...added);
            for (const [i, texts] of updates) d.slides[i].texts = castDraft(texts);
          });
          return ok ? updates.size : 0;
        },

        setShot(slideId, family, slot, lang, assetId) {
          const p = get().project;
          if (!p || !isFamilyId(family) || !isSafeKey(slot) || !p.languages.includes(lang)) return false;
          if (assetId !== null && (typeof assetId !== 'string' || !p.assets[assetId])) return false;
          const i = slideIndex(p, slideId);
          if (i < 0) return false;
          const bySlot = p.slides[i].shots[family];
          if ((bySlot?.[slot]?.[lang] ?? null) === assetId) return false;
          if (assetId !== null && !bySlot?.[slot] && Object.keys(bySlot ?? {}).length >= LIMITS.slots) return false;
          return commit((d) => {
            const shots = d.slides[i].shots;
            if (assetId === null) {
              const fam = shots[family];
              if (!fam?.[slot]) return;
              delete fam[slot][lang];
              deleteEmpty(fam, slot);
              deleteEmpty(shots, family);
            } else {
              ((shots[family] ??= {})[slot] ??= {})[lang] = assetId;
            }
          });
        },

        addFonts(fonts) {
          const p = get().project;
          if (!p || !Array.isArray(fonts)) return 0;
          const have = p.fonts ?? [];
          // Validation drops duplicates and bad entries, so the list stays what a reload would give.
          const next = cleanFonts([...have, ...fonts], 'fonts');
          const n = next.length - have.length;
          if (n <= 0) return 0;
          return commit(
            (d) => {
              d.fonts = next;
            },
            { history: false },
          )
            ? n
            : 0;
        },

        addAssets(assets) {
          const p = get().project;
          if (!p || !Array.isArray(assets)) return 0;
          const add: Record<string, AssetInfo> = {};
          let count = Object.keys(p.assets).length;
          for (const info of assets) {
            if (count >= LIMITS.assets) break;
            if (!info || typeof info !== 'object' || !isAssetId(info.id) || p.assets[info.id] || add[info.id]) continue;
            try {
              add[info.id] = cleanAssetInfo(info, 'asset', info.id);
              count++;
            } catch {
              // An unusable entry is skipped; the rest still import.
            }
          }
          const n = Object.keys(add).length;
          if (!n) return 0;
          return commit(
            (d) => {
              for (const [id, info] of Object.entries(add)) d.assets[id] = info;
            },
            { history: false },
          )
            ? n
            : 0;
        },

        assignShotsInOrder(family, lang, assetIds, startSlideIndex) {
          const p = get().project;
          if (!p || !p.families.includes(family) || !p.languages.includes(lang) || !Array.isArray(assetIds)) return 0;
          const ids = assetIds.filter((id): id is string => typeof id === 'string' && !!p.assets[id]);
          if (!ids.length) return 0;
          const limit = Math.min(FAMILIES[family].maxSlides, MAX_SLIDES);
          const start = typeof startSlideIndex === 'number' && Number.isFinite(startSlideIndex) ? clamp(Math.floor(startSlideIndex), 0, p.slides.length) : 0;
          const slides = p.slides.slice();
          const created: Slide[] = [];
          const plan: { index: number; slot: string; assetId: string }[] = [];
          const deviceOf = (slide: Slide) => resolveLayout(p, slide, family).elements.find((e): e is DeviceElement => e.kind === 'device');
          let i = start;
          for (const assetId of ids) {
            let placed = false;
            while (!placed && i < limit) {
              if (i >= slides.length) {
                // New slides copy the design of the last slide that shows a device.
                let model: Slide | undefined;
                for (let k = slides.length - 1; k >= 0 && !model; k--) if (deviceOf(slides[k])) model = slides[k];
                const fresh = model ? copyDesign(p, model) : newSlide(p.families, p.theme, p.languages);
                slides.push(fresh);
                created.push(fresh);
              }
              const device = deviceOf(slides[i]);
              if (device) {
                plan.push({ index: i, slot: device.slot, assetId });
                placed = true;
              }
              i++;
            }
            if (!placed) break;
          }
          if (!plan.length) return 0;
          const ok = commit(
            (d) => {
              for (const slide of created) d.slides.push(castDraft(deepClone(slide)));
              for (const step of plan) {
                const shots = d.slides[step.index].shots;
                ((shots[family] ??= {})[step.slot] ??= {})[lang] = step.assetId;
              }
            },
            { view: { activeSlideId: slides[plan[0].index].id, selection: null } },
          );
          return ok ? plan.length : 0;
        },

        /* Backgrounds and theme -------------------------------------- */

        setSlideBackground(slideId, family, bg) {
          const loc = locate(slideId, family);
          if (!loc) return false;
          let clean: Background | null = null;
          if (bg !== null) {
            try {
              clean = cleanBackground(bg, 'background', assetContext(loc.project));
            } catch {
              return false;
            }
            if (!clean) return false;
          }
          if (jsonEqual(loc.layout.background, clean)) return false;
          return commit((d, base) => {
            ensureLayout(d, base, loc.index, family).background = castDraft(clean);
          });
        },

        setThemeBackground(bg) {
          const p = get().project;
          if (!p) return false;
          let clean: Background | null;
          try {
            clean = cleanBackground(bg, 'background', assetContext(p));
          } catch {
            return false;
          }
          if (!clean || jsonEqual(clean, p.theme.background)) return false;
          const value = clean;
          return commit((d) => {
            d.theme.background = castDraft(value);
          });
        },

        setPanorama(on) {
          const p = get().project;
          if (!p || typeof on !== 'boolean' || p.theme.panorama === on) return false;
          return commit((d) => {
            d.theme.panorama = on;
          });
        },

        setPalette(colors) {
          const p = get().project;
          if (!p || !Array.isArray(colors)) return false;
          const palette: string[] = [];
          for (const c of colors) {
            if (palette.length >= LIMITS.palette) break;
            const n = normalizeColor(c);
            if (!n) return false;
            if (!palette.includes(n)) palette.push(n);
          }
          if (jsonEqual(palette, p.theme.palette)) return false;
          return commit((d) => {
            d.theme.palette = palette;
          });
        },

        setMockDark(on) {
          const p = get().project;
          if (!p || typeof on !== 'boolean' || p.theme.mockDark === on) return false;
          return commit((d) => {
            d.theme.mockDark = on;
          });
        },

        applyFonts(heading, body) {
          const p = get().project;
          if (!p || typeof heading !== 'string' || typeof body !== 'string') return false;
          const h1 = cleanFontName(heading, DEFAULT_FONT);
          const b1 = cleanFontName(body, DEFAULT_FONT);
          return commit((d) => {
            if (d.theme.fonts.heading !== h1 || d.theme.fonts.body !== b1) d.theme.fonts = { heading: h1, body: b1 };
            // Stored layouts only: derived ones follow them (or the theme fonts) automatically.
            for (const slide of d.slides) {
              for (const layout of Object.values(slide.layouts)) {
                if (!layout) continue;
                for (const el of layout.elements) {
                  if (el.kind !== 'text') continue;
                  const font = el.key === 'headline' ? h1 : b1;
                  if (el.style.font !== font) el.style.font = font;
                }
              }
            }
          });
        },

        /* Languages and families ------------------------------------- */

        addLanguage(code) {
          const p = get().project;
          if (!p || !isLangCode(code) || p.languages.includes(code) || p.languages.length >= LIMITS.languages) return false;
          return commit((d) => {
            d.languages.push(code);
            // A custom export selection keeps including every language the user adds.
            if (d.export.languages.length) d.export.languages.push(code);
          });
        },

        removeLanguage(code) {
          const p = get().project;
          if (!p || !p.languages.includes(code) || p.languages.length <= 1) return false;
          return commit((d) => {
            d.languages = d.languages.filter((l) => l !== code);
            for (const slide of d.slides) {
              if (slide.texts[code] !== undefined) delete slide.texts[code];
              for (const family of Object.keys(slide.shots) as FamilyId[]) {
                const bySlot = slide.shots[family];
                if (!bySlot) continue;
                for (const slot of Object.keys(bySlot)) {
                  if (bySlot[slot][code] === undefined) continue;
                  delete bySlot[slot][code];
                  deleteEmpty(bySlot, slot);
                }
                deleteEmpty(slide.shots, family);
              }
            }
            if (d.export.languages.includes(code)) d.export.languages = d.export.languages.filter((l) => l !== code);
          });
        },

        setBaseLanguage(code) {
          const p = get().project;
          if (!p || p.languages.indexOf(code) <= 0) return false;
          return commit((d) => {
            d.languages = [code, ...d.languages.filter((l) => l !== code)];
          });
        },

        enableFamily(id) {
          const p = get().project;
          if (!p || !isFamilyId(id) || p.families.includes(id)) return false;
          return commit((d) => {
            d.families.push(id);
            // A custom size selection gets the new family's default sizes, so it is exported too.
            if (d.export.sizes.length) {
              for (const size of FAMILIES[id].sizes) if (size.default && !d.export.sizes.includes(size.id)) d.export.sizes.push(size.id);
            }
          });
        },

        disableFamily(id) {
          const p = get().project;
          if (!p || !p.families.includes(id) || p.families.length <= 1) return false;
          return commit((d) => {
            d.families = d.families.filter((f) => f !== id);
            const sizes = d.export.sizes.filter((sid) => sizeById(sid)?.family !== id);
            if (sizes.length !== d.export.sizes.length) d.export.sizes = sizes;
          });
        },

        setExportSettings(patch) {
          const p = get().project;
          if (!p || typeof patch !== 'object' || patch === null) return false;
          let clean: ExportSettings;
          try {
            clean = cleanExportSettings({ ...p.export, ...cleanPatch(patch) }, 'export', p.languages);
          } catch {
            return false;
          }
          if (jsonEqual(clean, p.export)) return false;
          return commit((d) => {
            d.export = clean;
          });
        },

        /* History ---------------------------------------------------- */

        beginGesture() {
          const p = get().project;
          if (!p) return;
          if (h.depth === 0) {
            h.base = p;
            h.coalesce = null;
            set({ inGesture: true });
          }
          h.depth++;
        },

        endGesture() {
          if (h.depth === 0) return;
          if (h.depth > 1) {
            h.depth--;
            return;
          }
          finishGesture();
        },

        cancelGesture() {
          if (h.depth === 0) return;
          const base = h.base;
          h.depth = 0;
          h.base = null;
          const cur = get().project;
          if (base && cur && cur !== base) install(withAssets(base, cur), cur, {}, { inGesture: false });
          else set({ inGesture: false });
        },

        undo() {
          finishGesture();
          const cur = get().project;
          const prev = h.past.pop();
          if (!cur || !prev) return false;
          h.future.push(cur);
          h.coalesce = null;
          install(withAssets(prev, cur), cur);
          return true;
        },

        redo() {
          finishGesture();
          const cur = get().project;
          const next = h.future.pop();
          if (!cur || !next) return false;
          pushPast(cur);
          h.coalesce = null;
          install(withAssets(next, cur), cur);
          return true;
        },
      };
    }),
  );
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export const useEditor: EditorStore = createEditorStore();

/**
 * Calls `listener` whenever the open project object changes (edits, undo,
 * open, close), for autosave. Returns the unsubscribe function.
 */
export function subscribeProject(listener: (project: Project | null, previous: Project | null) => void, store: EditorStore = useEditor): () => void {
  return store.subscribe((state, prev) => {
    if (state.project !== prev.project) listener(state.project, prev.project);
  });
}

/* Selectors -------------------------------------------------------------- */

/** The active slide, or null when no project is open. */
export function selectActiveSlide(s: EditorState): Slide | null {
  return s.project?.slides.find((x) => x.id === s.activeSlideId) ?? null;
}

/** Index of the active slide, -1 when none. */
export function selectActiveSlideIndex(s: EditorState): number {
  return s.project ? s.project.slides.findIndex((x) => x.id === s.activeSlideId) : -1;
}

/** The active slide's layout for the active family (stored or derived; read-only). */
export function selectActiveLayout(s: EditorState): SlideLayout | null {
  const slide = selectActiveSlide(s);
  return slide && s.project ? resolveLayout(s.project, slide, s.activeFamily) : null;
}

/** The selected element as resolved for the active family. */
export function selectSelectedElement(s: EditorState): SlideElement | null {
  if (!s.selection) return null;
  return selectActiveLayout(s)?.elements.find((e) => e.id === s.selection) ?? null;
}

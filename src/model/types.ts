/**
 * Wajha data model. This file is the single source of truth for every
 * persisted shape (projects, templates, gallery index) and is shared by the
 * engine, the store, storage, export and the UI.
 *
 * Units used everywhere in layouts:
 *  - Positions (`x`, `y`) are fractions of the canvas width / height (0..1).
 *    They mark the element's anchor (its center, except text which can be
 *    anchored at its top or bottom edge, see `TextElement.valign`).
 *  - Lengths (widths, font sizes, blur, shadow offsets, radii) are fractions
 *    of `u = min(canvasWidth, canvasHeight)`, so a layout scales cleanly
 *    between export sizes and orientations.
 *  - Angles are degrees, clockwise.
 *  - Colors are hex strings: "#RRGGBB" or "#RRGGBBAA".
 */

export type LangCode = string;
export type Color = string;

/* ------------------------------------------------------------------ */
/* Device families and export sizes                                    */
/* ------------------------------------------------------------------ */

export type FamilyId =
  | 'iphone'
  | 'iphone-landscape'
  | 'ipad'
  | 'ipad-landscape'
  | 'android-phone'
  | 'android-landscape'
  | 'android-tablet'
  | 'mac'
  | 'watch'
  | 'apple-tv'
  | 'vision'
  | 'play-feature';

export type StoreId = 'app-store' | 'google-play';

/** Rough canvas shape. Templates author one layout per class. */
export type AspectClass = 'tall' | 'tablet' | 'wide';

export type DeviceFrameId =
  | 'iphone'
  | 'ipad'
  | 'android-phone'
  | 'android-tablet'
  | 'macbook'
  | 'watch'
  | 'tv'
  | 'vision'
  | 'browser'
  | 'none';

export interface ExportSize {
  /** Stable id, e.g. "ios-6.9". */
  id: string;
  family: FamilyId;
  store: StoreId;
  /** Human label, e.g. "iPhone 6.9″". */
  label: string;
  /** Devices this size covers, e.g. "iPhone 17 Pro Max, 16 Pro Max". */
  devices: string;
  width: number;
  height: number;
  /** The store requires this size (or one of its group) for the family. */
  required: boolean;
  /** Selected by default in the export dialog. */
  default: boolean;
  /** Folder segment used by export structures, e.g. "iPhone 6.9". */
  folder: string;
  /** fastlane folder for Google Play (supply); undefined for App Store. */
  supplyFolder?: 'phoneScreenshots' | 'sevenInchScreenshots' | 'tenInchScreenshots' | 'featureGraphic';
}

export interface FamilyInfo {
  id: FamilyId;
  label: string;
  shortLabel: string;
  stores: StoreId[];
  /** The master canvas the user designs on (pixels). */
  design: { width: number; height: number };
  aspectClass: AspectClass;
  defaultFrame: DeviceFrameId;
  /** Default screen aspect (height / width) when a slot has no screenshot. */
  screenAspect: number;
  /** Store limit of screenshots per locale. */
  maxSlides: number;
  /** Phones and tablets lie on their side on these canvases. */
  landscape?: boolean;
  sizes: ExportSize[];
}

/* ------------------------------------------------------------------ */
/* Paint                                                               */
/* ------------------------------------------------------------------ */

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: Color;
}

export type Fill =
  | { type: 'solid'; color: Color }
  /** CSS semantics: angle 0 = towards top, 90 = towards right. */
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  /** cx/cy: fractions of canvas width/height. radius: fraction of max(w, h). */
  | { type: 'radial'; cx: number; cy: number; radius: number; stops: GradientStop[] }
  /** Soft colour blobs over a base colour ("mesh gradient" look). */
  | { type: 'mesh'; base: Color; points: MeshPoint[] }
  | {
      type: 'image';
      assetId: string;
      fit: 'cover' | 'contain' | 'tile';
      /** 0..1 */
      opacity: number;
      /** Blur radius as a fraction of u. 0 = sharp. */
      blur: number;
      /** Optional colour wash drawn on top (use alpha in the hex). */
      tint: Color | null;
    };

export interface MeshPoint {
  /** fractions of canvas width / height */
  x: number;
  y: number;
  color: Color;
  /** fraction of max(w, h) */
  radius: number;
}

export type PatternKind = 'dots' | 'grid' | 'diagonal' | 'noise' | 'waves' | 'rings';

export interface Pattern {
  kind: PatternKind;
  color: Color;
  /** 0..1 */
  opacity: number;
  /** Spacing / feature size as a fraction of u. */
  scale: number;
}

export interface Background {
  fill: Fill;
  pattern: Pattern | null;
}

export interface Shadow {
  color: Color;
  /** fraction of u */
  blur: number;
  /** offsets, fraction of u */
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Slide elements                                                      */
/* ------------------------------------------------------------------ */

export interface ElementBase {
  id: string;
  /** Optional user-facing name shown in the layers list. */
  name?: string;
  /** Anchor position, fractions of canvas width / height. */
  x: number;
  y: number;
  /** degrees clockwise */
  rotation: number;
  /** 0..1 */
  opacity: number;
  hidden?: boolean;
  locked?: boolean;
}

export type FrameFinish = 'metal' | 'matte' | 'clay';

export interface FrameStyle {
  /** Body colour of the device. */
  color: Color;
  finish: FrameFinish;
  /** Inner bezel: realistic black, or same colour as the body (clay look). */
  bezel: 'black' | 'match';
}

export interface DeviceElement extends ElementBase {
  kind: 'device';
  frame: DeviceFrameId;
  style: FrameStyle;
  /** Outer device width, fraction of u. Height follows the screen aspect. */
  width: number;
  /** Screenshot slot key in `Slide.shots[family]`. Usually "main". */
  slot: string;
  /** Screen corner radius for frame "none", fraction of device width. */
  cornerRadius: number;
  shadow: Shadow | null;
}

export interface TextStyle {
  /** CSS font family name, e.g. "Inter Variable". */
  font: string;
  /** 100..900 */
  weight: number;
  /** Font size, fraction of u. */
  size: number;
  /** Line height multiplier, e.g. 1.1 */
  lineHeight: number;
  /** em, e.g. -0.02 */
  letterSpacing: number;
  color: Color;
  /** Colour used for *highlighted* words. */
  highlight: Color;
  /** "color" recolours the words; "marker" paints a rounded pill behind them. */
  highlightMode: 'color' | 'marker';
  /** Logical alignment; start/end flip for right-to-left languages. */
  align: 'start' | 'center' | 'end';
  transform: 'none' | 'uppercase';
  /**
   * Maximum number of lines. Text that would need more lines shrinks (down
   * to 60 % of `size`) until it fits. 0 = unlimited.
   */
  maxLines: number;
  shadow: Shadow | null;
}

export interface TextElement extends ElementBase {
  kind: 'text';
  /** Key into `Slide.texts[lang]`, e.g. "headline" or "subtitle". */
  key: string;
  /** Text box width, fraction of u. Lines wrap inside it. */
  width: number;
  /** Which edge of the text block `y` refers to. */
  valign: 'top' | 'middle' | 'bottom';
  style: TextStyle;
}

export type ShapeKind = 'circle' | 'rect' | 'blob' | 'ring';

export interface ShapeElement extends ElementBase {
  kind: 'shape';
  shape: ShapeKind;
  /** fractions of u */
  width: number;
  height: number;
  fill: Fill;
  /** Corner radius for rect, fraction of min(width, height). */
  radius: number;
  /** Ring stroke width, fraction of u. */
  stroke: number;
  /** Soft blur (glow), fraction of u. 0 = sharp. */
  blur: number;
  /** Seed for the blob outline. */
  seed: number;
}

export interface ImageElement extends ElementBase {
  kind: 'image';
  assetId: string;
  /** fraction of u; height follows the image aspect */
  width: number;
  /** fraction of the image width */
  cornerRadius: number;
  shadow: Shadow | null;
}

export type SlideElement = DeviceElement | TextElement | ShapeElement | ImageElement;
export type ElementKind = SlideElement['kind'];

/* ------------------------------------------------------------------ */
/* Slides, theme, project                                              */
/* ------------------------------------------------------------------ */

export interface SlideLayout {
  /** null = use the project theme background. */
  background: Background | null;
  /** Painter's order: first element is drawn first (bottom). */
  elements: SlideElement[];
}

/** slot -> lang -> assetId */
export type ShotMap = Record<string, Record<LangCode, string>>;

export interface Slide {
  id: string;
  /**
   * lang -> text key -> text. Shared by every device family.
   * Markup: "*word*" = highlighted, "\n" = line break, "\*" = literal asterisk.
   */
  texts: Record<LangCode, Record<string, string>>;
  /** family -> slot -> lang -> assetId */
  shots: Partial<Record<FamilyId, ShotMap>>;
  /**
   * family -> layout, for the primary family and for families with a layout
   * of their own (designed by the template, or edited). Any other family
   * follows the primary: its layout is derived with `adaptLayout` whenever
   * it is read, and stored on its first edit.
   */
  layouts: Partial<Record<FamilyId, SlideLayout>>;
}

export interface Theme {
  background: Background;
  /** Draw the background as one continuous canvas across all slides. */
  panorama: boolean;
  /** Suggested fonts; "Apply fonts" restyles every text element. */
  fonts: { heading: string; body: string };
  /** Swatches offered first in colour pickers. */
  palette: Color[];
  /** Appearance of generated mock screens used as placeholders. */
  mockDark: boolean;
}

export interface AssetInfo {
  /** "<sha256 hex>.<ext>" */
  id: string;
  /** Original file name. */
  name: string;
  width: number;
  height: number;
  bytes: number;
  addedAt: number;
}

export type ExportStructure = 'stores' | 'fastlane' | 'flat';

export interface ExportSettings {
  /** ExportSize ids. Empty = use each family's defaults. */
  sizes: string[];
  /** Empty = all project languages. */
  languages: LangCode[];
  format: 'png' | 'jpeg';
  /** 0.5..1, JPEG only */
  jpegQuality: number;
  structure: ExportStructure;
}

export interface Project {
  format: 'wajha.project';
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  templateId: string | null;
  theme: Theme;
  /** Enabled families in display order. The first is the primary family. */
  families: FamilyId[];
  /** Project languages. The first is the base (fallback) language. */
  languages: LangCode[];
  slides: Slide[];
  assets: Record<string, AssetInfo>;
  export: ExportSettings;
}

/** Small summary written next to project.json for the home screen. */
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  slideCount: number;
  families: FamilyId[];
  languages: LangCode[];
  templateId: string | null;
}

/* ------------------------------------------------------------------ */
/* Templates and the community gallery                                 */
/* ------------------------------------------------------------------ */

export type TemplateCategory = 'minimal' | 'bold' | 'gradient' | 'dark' | 'playful' | 'panorama' | 'elegant';

export interface TemplateSlide {
  /** Sample copy; must contain at least "en-US". */
  texts: Record<LangCode, Record<string, string>>;
  /** One layout per aspect class; "tall" is required, others are adapted. */
  layouts: { tall: SlideLayout; tablet?: SlideLayout; wide?: SlideLayout };
}

export interface Template {
  format: 'wajha.template';
  version: 1;
  /** kebab-case, globally unique, e.g. "sunset-glow" */
  id: string;
  name: string;
  author: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  theme: Theme;
  /** 1..10 slides. New projects start with these. */
  slides: TemplateSlide[];
  /** Image assets referenced by the template (gallery templates only). */
  assets: Record<string, AssetInfo>;
}

export interface GalleryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** Bumped by the gallery when the template changes. */
  version: number;
  /** Paths relative to the gallery base URL. */
  template: string;
  preview: string;
  assets: string[];
  bytes: number;
}

export interface GalleryIndex {
  format: 'wajha.gallery';
  version: 1;
  updatedAt: string;
  templates: GalleryEntry[];
}

/* ------------------------------------------------------------------ */
/* App settings                                                        */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  theme: 'system' | 'dark' | 'light';
  /** Show the onboarding hints in the editor. */
  hints: boolean;
}

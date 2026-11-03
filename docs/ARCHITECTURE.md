# Wajha architecture

Wajha (واجهة: Arabic for both "storefront" and "interface") is a free,
open-source, offline desktop app for designing App Store and Google Play
screenshots. Users drop in raw screenshots, pick a template, edit visually,
add languages, and export every required size in one click.

This document is the contract between all parts of the code base. Read it
fully before changing anything.

---

## 1. Product in one minute

1. **Home**: grid of projects (thumbnail, name, last edited). "New project"
   opens the template picker (built-in, community gallery, my templates) plus
   project setup (name, device families, languages).
2. **Editor**: top bar (project name, device family tabs, language switcher,
   undo/redo, zoom, Export). Left sidebar: slides list and layers. Center
   stage: every slide of the active family side by side, like a store
   listing; click to select elements, drag to move, handles to resize and
   rotate, drop screenshot files onto slides. Right inspector: properties of
   the selection, or slide + theme settings when nothing is selected.
3. **Languages**: texts are per language and shared by every device family;
   screenshots are per family and per language with fallback to the base
   language. Arabic, Hebrew, Persian and Urdu render right-to-left with
   mirrored alignment, and their slides are drawn mirrored (unless the
   project turns it off). A translations table edits all texts at once and
   round-trips through CSV.
4. **Export**: pick sizes, languages, PNG/JPEG and a folder structure
   (stores / fastlane / flat). Renders every slide x language x size at exact
   store pixel sizes, as 24-bit PNG without alpha (Google Play rejects
   alpha), into a folder the user picks. Shows warnings first (missing
   screenshots, overflowing text, too many slides).
5. **Templates**: a template is design only (theme + slide layouts + sample
   copy). Built-ins ship inside the app; the community gallery is a folder of
   the GitHub repo served by jsDelivr; users save their own designs as
   templates and share them as `.wajha-template` files.

## 2. Principles

- **Offline first.** Everything except browsing the community gallery works
  with no network. No accounts, no telemetry, no analytics.
- **Light.** Tauri (system webview), no Electron. Target: installer under
  15 MB, idle memory under 200 MB including the webview, smooth editing with
  20 slides x 3 languages. Decoded images are memory-bounded (see runtime).
- **Beautiful by default.** Every template must look professionally designed
  out of the box with mock screens, before the user adds anything.
- **RTL is first class**, not a patch: layout, text, CSV, UI direction of
  text fields.
- **Small, sharp dependencies.** Do not add packages. If something seems to
  need one, implement it or report it.
- **Accessible UI**: keyboard reachable, visible focus, labels on icon
  buttons (`aria-label` + tooltip), contrast >= 4.5:1 for text.

## 3. Stack and folder ownership

| Folder | What | Notes |
|---|---|---|
| `src/model/` | Types, catalogs, pure helpers (ids, defaults, resolve, adapt, instantiate, validate) | No DOM, no canvas, no I/O |
| `src/engine/` | Canvas 2D renderer: backgrounds, patterns, shapes, devices, text, mock screens | Pure; runs in browser and in Node tests via @napi-rs/canvas |
| `src/platform/` | `Platform` interface + `tauri.ts`, `web.ts`, `memory.ts` | Only place that talks to Tauri or browser storage |
| `src/storage/` | Library, templates, archives, gallery, settings on top of Platform | No DOM except `fetch` for the gallery |
| `src/export/` | Export planning, paths, PNG encoder (+ worker), runner, CSV | Pure where possible |
| `src/runtime/` | Browser services: image cache, fonts, render env, importer, renderer, autosave | Glue between engine, storage and UI |
| `src/store/` | zustand stores: app (routing, settings, toasts), editor (project, history, selection, view) | |
| `src/templates/` | Built-in templates (`builtin/*.ts`) | Data only |
| `src/ui/kit/` | Design-system components | No app state |
| `src/ui/home/`, `src/ui/editor/`, `src/ui/export/` | Screens and dialogs | |
| `src-tauri/` | Rust shell: file access scoped to the app data dir, dialogs, export writing, system fonts | |
| `gallery/` | Community templates (`templates/<id>/template.json`, `preview.jpg`) + `index.json` | Built by `scripts/build-gallery-index.mjs` |
| `e2e/` | Playwright tests against the browser build (web platform) | |

Stack: React 19, TypeScript 7 (strict), Vite 8, Tailwind CSS 4, zustand 5 +
immer, radix-ui (Dialog, Popover, DropdownMenu, ContextMenu, Tooltip, Tabs,
Slider, Switch, ScrollArea, Toggle Group), react-colorful, @dnd-kit, fflate,
lucide-react, @fontsource-variable fonts. Rust: tauri 2, tauri-plugin-dialog,
tauri-plugin-opener, serde, sha2, fontdb. Tests: vitest, @napi-rs/canvas,
Playwright (WebKit), cargo test.

## 4. Conventions

- TypeScript strict, no `any` (use `unknown` + narrowing). `verbatimModuleSyntax`
  is on: use `import type` for types. `erasableSyntaxOnly` is on: no enums,
  no parameter properties, no namespaces.
- Unit tests live next to the code as `*.test.ts` and run with `npx vitest run <path>`.
  Node-only test helpers are named `*.node.ts`. Tests may import `node:*`
  and `@napi-rs/canvas`; app code may not.
- Type-check with `npx tsc -b` (the root config references app, node and
  test configs). Filter its output to your folder when others are working in
  parallel: `npx tsc -b 2>&1 | grep '^src/engine'`.
- Comments: explain why, not what. Match the existing tone (short JSDoc on
  exported functions).
- File names: `camelCase.ts` for modules, `PascalCase.tsx` for components.
- Never import from `src/ui` inside model/engine/platform/storage/export/runtime.
- Never call `notImplemented` from code you own; replace the stubs.

## 5. Units and coordinates

Defined in `src/model/types.ts`, repeated here because everything depends on it:

- `x`, `y`: fractions of canvas width / height, the element anchor (center;
  text may anchor at top/middle/bottom via `valign`).
- Lengths: fractions of `u = min(canvasWidth, canvasHeight)`.
- Angles: degrees clockwise. Font size: fraction of u. Letter spacing: em.
- Painter's order: `layout.elements[0]` is drawn first.

## 6. Module contracts

### 6.1 Model helpers (`src/model`)

- `catalog.ts`: `FAMILIES`, `FAMILY_ORDER`, `ALL_SIZES`, `sizeById`,
  `LANGUAGES`, `languageInfo`, `isRtl`, `BUNDLED_FONTS`, `FONT_FALLBACK_STACK`.
  Families: iPhone, iPad and Android phone in portrait and landscape
  (`landscape: true`, sizes derived from the portrait ones), Android tablet,
  Mac, Apple Watch, Apple TV, Vision Pro and the Play feature graphic. On a
  landscape family phones and tablets lie on their side; `deviceScreenAspect`
  (engine) is the one rule for a device's screen shape: the frame's own, turned
  for landscape families or a screenshot taken the other way round.
- `defaults.ts`: element/theme/project factories. New elements get sensible
  sizes for the family canvas (a device ~ 0.78u wide on tall canvases,
  headline ~ 0.072u bold, subtitle ~ 0.04u regular).
- `resolve.ts`: `resolveLayout` (stored layout, else `adaptLayout` from the
  primary family's layout, else a default layout), `resolveText`,
  `resolveShot` (lang -> base lang -> null; own properties only, so a key
  can never read an inherited member).
- **Which layouts a slide stores.** `slide.layouts[f]` exists only for a
  layout the editor cannot derive: the primary family's (`families[0]`), and
  any other family whose layout is its own, because the template designed it
  or the user edited it. Every other family *follows* the primary: it
  resolves through `adaptLayout` on each read, so edits to the primary show
  up there, until that family is edited (the store materialises the layout
  on the first edit; `resetLayout` deletes it so the family follows again).
  The UI calls a stored non-primary layout "own" and a derived one "follows",
  without claiming where an own layout came from.
- `adapt.ts`: `adaptLayout(layout, fromShape, toShape, toFamily)` converts a
  layout between canvas shapes: switches device frames to the target family's
  default frame (when the source frame is the source family default),
  rescales device width so the device fits the target canvas height (keep
  ~6% margins), keeps relative positions, keeps text widths within the
  canvas. Wide targets (Mac, feature graphic) place text on one side and the
  device on the other. Must be deterministic and never produce NaN.
  Decorations (shapes, images) keep their relative position and u size,
  except: those centred on the device group (a ring, disc or glow behind a
  phone) move with it, keeping their place in its box and scaling like the
  devices, in the side-by-side, stacked and portrait-to-portrait
  arrangements; when a drawn one would then reach the copy, they all shrink
  towards the devices (to half at most; soft glows never force it, and in
  portrait-to-portrait a decoration that already touched the copy in the
  source is left alone). Decorations around a copy group (a rule under an
  eyebrow, an emblem above a headline) move with that group. Backdrops wider
  or taller than 1.5 canvases and pieces on the slide edges (panorama seams)
  stay put, and the side-by-side copy column keeps clear of drawn shapes that
  rise from the bottom or hang from the top edge. Panorama templates design
  every canvas shape themselves: adaptation cannot keep seams and copy apart.
- `instantiate.ts`: `projectFromTemplate` stores, per slide, the primary
  family's layout (its class layout, adapted from the class's reference
  canvas, or from `tall` when the template has none for that class) plus the
  template's own layout for every other aspect class it designs; families of
  the primary's class (Android phone next to iPhone) and classes the template
  does not design follow the primary. Fresh ids, one per template element
  across all layouts. Sample texts: the base language gets the template's
  copy in that language (same language or a regional variant, never another
  script: `zh-Hant` does not take `zh-Hans`), else its "en-US" copy; every
  other language gets the template's copy in that language only, else no
  entry at all, so it falls back to the base text and counts as untranslated.
  `templateFromProject`.
- `mirror.ts`: right-to-left mirroring. `mirrorsLayout(project, lang)` is
  true for right-to-left languages unless `project.mirrorRtl === false`
  (stored only when off). `mirrorElement` / `mirrorLayout` move elements to
  the other side (`x -> 1 - x`), negate rotation and shadow x offsets;
  `mirrorPatch` maps an edit made on a mirrored slide back to the stored
  layout. Layouts are never stored mirrored.
- `typography.ts`: per-language type. `project.typography[lang]` may set
  `font` (every text in that language uses it, keeping its own weight) and
  `lineSpacing` (a factor on every text's line height, 0.8..2); stored only
  for project languages that set either. `styleForLanguage` is the one rule
  the renderer, the export text check and font loading share.
- `rules.ts`: identifier rules shared by validators and the store. Text keys
  and slots (`isSafeKey`) never take a name plain objects inherit
  (`toString`, `__proto__`...). Template ids name their folder, so they are
  kebab-case and never a Windows device name (`con`, `aux`, `nul`, `com1`...).
  `cleanName`, `cleanText` and `cleanFontName` replace unpaired surrogates
  with U+FFFD, so no stored string breaks a file name or a URI.
- `validate.ts`: hand-written validators (no schema library). Unknown keys
  are dropped, missing optional values get defaults, wrong types throw
  `ValidationError(path)`. Numbers are clamped to sane ranges. Strings are
  length-limited (texts 2 000 chars, names 200). Asset ids must match
  `^[0-9a-f]{64}\.(png|jpg|webp)$`. Colors must match
  `^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`.

### 6.2 Engine (`src/engine`)

Public API in `src/engine/types.ts` and `src/engine/index.ts`:
`renderSlide`, `layoutText`, `deviceGeometry`, `drawDevice`, `drawMockScreen`.

Render order for a slide: background fill -> pattern -> elements in order.
With `input.mirror` (right-to-left listings) elements are drawn through
`mirrorElement` and the background is painted flipped, except a picture
fill that is not a panorama; shapes flip their outline and fill (unless it
is a picture). Devices, text and images are never flipped, only moved.
Mirroring each slide keeps panorama seams joined, because the stores show
right-to-left screenshots from the right.
Each element is drawn translated to its anchor and rotated around its
center, with its opacity. `renderSlide` returns an `ElementBox` for every
visible element in output pixels.

- **Backgrounds**: solid, linear (CSS angle semantics), radial, mesh (soft
  colour blobs over a base, the trendy "aurora" look), image (cover /
  contain / tile, opacity, blur, tint). With `theme.panorama`, the theme
  background is drawn as one virtual canvas `slideCount * width` wide and
  each slide shows its own window of it (slide-level background overrides
  are not panoramic).
- **Patterns**: dots, grid, diagonal lines, noise (deterministic), waves,
  concentric rings, at `opacity`, spacing `scale * u`. Patterns are
  continuous across slides in panorama mode.
- **Shapes**: circle, rect (corner radius), blob (smooth closed curve from
  `seed`), ring (stroke). `blur > 0` gives a soft glow using shadowBlur
  (draw far off-canvas and offset the shadow into view); never `ctx.filter`.
- **Images**: drawn at `width * u` with the asset aspect, rounded corners,
  optional shadow.
- **Devices** (`devices/`): procedural vector artwork, no image files,
  sharp at any size. Frames: `iphone` (Dynamic Island, thin uniform bezel,
  rounded corners, side buttons), `ipad` (uniform bezel, front camera),
  `android-phone` (punch-hole camera, slim bezel), `android-tablet`,
  `macbook` (screen with notch + aluminium base), `browser` (window chrome
  with traffic lights and URL bar), `none` (screenshot with rounded corners).
  Finishes: `metal` (subtle gradient sheen + edge highlight), `matte`,
  `clay` (solid pastel body, `bezel: 'match'`). The screen aspect comes from
  the screenshot (`getAssetAspect`) or the family default; the screenshot is
  drawn `cover`-fit inside the screen rect, clipped to the screen radius.
  Device shadows use `el.shadow`. Missing screenshot -> `drawMockScreen`
  (placeholder "mock") or a neutral gradient ("empty").
- **Mock screens** (`mock.ts`, internals in `devices/mock/`): deterministic fake app UIs (status bar,
  header, cards, lists, charts, tab bar) in the theme palette, light or dark
  (`theme.mockDark`), varied by seed. They must look like a real, polished
  app at a glance; they are what users see in every template preview.
- **Text** (`text.ts`): markup `*word*` = highlighted run, `\n` = hard break,
  `\*` = literal asterisk. Wrapping by words (`Intl.Segmenter` when
  available, spaces otherwise; `char` languages break between characters).
  `transform: uppercase` uses `toLocaleUpperCase(lang)`. Auto-fit: if lines >
  `maxLines`, shrink the font in steps down to 60% of `size`; still too long
  -> `overflow: true` and the text is drawn anyway. Alignment `start`/`end`
  are logical (flip for RTL). RTL: `ctx.direction = 'rtl'`, runs placed
  right-to-left. A line that mixes directions is cut at direction changes
  (`bidi.ts`) and drawn one direction per `fillText` call: WebKit shifts
  the later direction runs of one call off the baseline.
  `highlightMode: marker` paints a rounded pill behind highlighted runs;
  layout reserves the pill's side padding (except at line ends) so a full
  word space stays between the pill and its neighbours. Letter spacing via
  `ctx.letterSpacing` when supported (skip for RTL scripts, it breaks
  joining). Font string:
  `${weight} ${px}px "${font}", ${FONT_FALLBACK_STACK}`.
- **Browser compatibility**: WKWebView (macOS 11+), WebView2, WebKitGTK.
  No `ctx.filter`; feature-detect `roundRect` and `letterSpacing`.

### 6.3 Platform (`src/platform`) and the Rust commands

`Platform` (in `types.ts`) is implemented by:

- `tauri.ts`: calls the Rust commands below with `invoke` from
  `@tauri-apps/api/core`. Binary payloads go as the raw request body
  (`invoke(cmd, bytes, { headers })`) and come back as `ArrayBuffer`.
- `web.ts`: IndexedDB (one object store, key = path) for library storage,
  `crypto.subtle` SHA-256 (with a small pure-JS fallback), `<input type=file>`
  pickers, exports streamed into a zip Blob with fflate's `Zip`
  (pass-through for PNG/JPEG/WebP) so only one file sits on the heap.
- `memory.ts`: in-memory Map, for unit tests (same semantics, including path
  validation and magic-byte checks).
- `index.ts`: `getPlatform()` returns the Tauri platform when
  `'__TAURI_INTERNALS__' in window`, else web; `setPlatform()` overrides
  (tests).
- `limits.ts`: every size limit for what the app reads from outside, in one
  place (the Rust dialogs mirror the byte limits): images 100 MB and
  16 384 px per side / 8 192 x 8 192 px in all; thumbnails and template
  previews 4 MB, 4 096 px / 2 048 x 2 048 px; `.wajha` 500 MB; `.wajha-template`
  100 MB; `project.json` / `template.json` 16 MB; CSV 10 MB.
  `imageWithinLimits` reads the size from the PNG / JPEG / WebP header; an
  image whose header does not state its size is never decoded. `openFile`
  and `pickImages` check file sizes before reading (the web `list()` reports
  sizes as 0: IndexedDB cannot read them without loading the files).

Rust commands (all `async`, errors are strings prefixed with a
`PlatformErrorCode`, e.g. `"not_found: projects/x/project.json"`):

| Command | Args | Returns |
|---|---|---|
| `app_info` | | `{ version, os, dataDir }` |
| `store_read` | `{ path }` | raw bytes (`tauri::ipc::Response`), `not_found` error when missing |
| `store_write` | raw body, header `x-path` (URI-encoded) | `()`; atomic temp+rename, creates parents |
| `store_list` | `{ dir }` | `DirEntry[]` (`{ name, isDir, size, modifiedMs }`), `[]` when missing |
| `store_remove` | `{ path }` | `()`, recursive, no-op when missing |
| `asset_put` | raw body, headers `x-project`, `x-ext` | asset id `"<sha256>.<ext>"`; checks magic bytes, skips existing |
| `pick_images` | `{ projectId }` | `PickedImage[]`; native multi-file dialog (png/jpg/jpeg/webp), stores assets |
| `pick_export_dir` | `{ suggestedName }` | absolute path or null; the path is remembered as an allowed export root |
| `export_write` | raw body, headers `x-root`, `x-path` (URI-encoded) | `()`; root must be an allowed export root, path relative and safe |
| `reveal_path` | `{ path }` | `()`; allowed export roots only |
| `open_file_pick` | `{ kind: 'project' | 'template' | 'csv' }` | `{ token, name }` or null |
| `open_file_read` | `{ token }` | raw bytes (token is single use) |
| `save_file` | raw body, header `x-name` (URI-encoded) | saved absolute path or null (save dialog) |
| `system_fonts` | | sorted unique family names (fontdb), cached after first call |
| `open_url` | `{ url }` | `()`; https only |
| `confirm_exit` | | `()`; quits after the frontend saved (see below) |
| `self_test_config` | | `{ outDir }` when `WAJHA_SELF_TEST_DIR` is set in a `self-test` build, else null |
| `self_test_quit` | | `()`; `self-test` builds only: quits through the same hold as Cmd+Q (see below) |

All library paths are relative to the app data directory and validated in
Rust (no absolute paths, no `..`, no backslashes, no empty segments, no NUL).
`open_file_pick` refuses a file over its kind's limit before anything reads
it (project 500 MB, template 100 MB, csv 10 MB, as `OPEN_FILE_MAX_BYTES` in
`src/platform/limits.ts`), and `open_file_read` checks again; picked and
stored images stop at `MAX_IMAGE_BYTES` (100 MB).
Our commands need no capability entry. The capability grants only the core
calls the frontend makes: `core:event:allow-listen` / `allow-unlisten` (the
close guard and `wajha://before-exit`), `core:window:allow-start-dragging` and
`allow-internal-toggle-maximize` (the `data-tauri-drag-region` top bar),
`core:window:allow-destroy` (the close handler destroys the window after
saving) and `core:webview:allow-internal-toggle-devtools` (debug builds only);
Rust tests check that the rest of the core API is refused and that remote
pages get nothing. The frontend never gets fs, dialog or opener
permissions. `pick_export_dir` ignores `suggestedName` (native folder pickers
cannot pre-fill one), so the export dialog prefixes paths with a project folder
for the "stores" and "flat" structures. Header values (`x-path`, `x-root`,
`x-project`, `x-name`) are always URI-encoded by the frontend and decoded
strictly in Rust. Project ids follow `ID_RE` (`[A-Za-z0-9_-]{1,64}`) on both
sides.

Quitting: closing the window runs the JS `onCloseRequested` handler, which
flushes autosave before the window goes; Windows and Linux have no app menu
and quit that way. On macOS, Quit in the app menu (Cmd+Q) is an item of
Wajha's own in an otherwise unchanged copy of Tauri's default menu
(`lifecycle::app_menu`), because the standard item sends `terminate:`, which
tao reports only once the app is already ending. That item, and any
`RunEvent::ExitRequested` raised while the main window exists, are held
back: the shell emits `wajha://before-exit`, the frontend flushes autosave
and calls `confirm_exit`, and the app quits then, or after a 4 s grace
period. A second Cmd+Q meanwhile changes nothing. Not held: Quit in the Dock
menu, logging out, shutting down and AppleScript `quit` still end in
`terminate:`, which tao lets through without asking the app (it implements
no `applicationShouldTerminate:`), so those quit at once and lose edits made
within the last ~0.8 s (the autosave delay). Cancelling `terminate:` would
abort the user's logout as well, so the shell does not.

Builds with the `self-test` cargo feature (never shipped;
`scripts/desktop-smoke.sh` makes one) read `WAJHA_SELF_TEST_DIR`: with it
set, the app uses `<dir>/data` as its library, registers `<dir>` as an
export root and runs `src/ui/shell/selfTest.ts`, which ends by renaming the
project and quitting at once through `self_test_quit` (the hold above, with
a grace period longer than the script waits). The script checks the report,
that the app ended by itself and that the rename reached the disk. The
window has `dragDropEnabled: false` so HTML5 drag-and-drop delivers `File`
objects to the webview on every platform.


Fonts and brand kit (`storage/fonts.ts`, `storage/brand.ts`): font files
people add are content-addressed like images (`<sha-256>.<ttf|otf|woff|woff2>`)
and stored in `projects/<id>/fonts/`; `project.fonts` lists them with the
family text styles use (read from the file's name table, else its file name).
`.wajha` files carry them under `fonts/`, verified by signature and hash on
import. `runtime/fonts.ts` registers them as FontFaces before any drawing.
The brand kit is `brand/kit.json` (colours, fonts, logo) with its files in
`brand/files/`; applying it copies files into the project.

### 6.4 Storage (`src/storage`)

Layout in `src/storage/index.ts`. Rules:

- `saveProject` writes `project.json` (pretty JSON is not needed) then
  `meta.json`. Loading validates with `validateProject`.
- Archives (`.wajha`, `.wajha-template`) are zip files (fflate):
  `project.json` | `template.json`, `assets/<assetId>`, optional
  `thumb.jpg` | `preview.jpg`. Imports validate everything, re-check asset
  ids against their bytes' SHA-256 and their headers against the image
  limits, assign a fresh project id, and cap file and inflated size (500 MB,
  100 MB for templates), entry count (2 000) and each entry (manifest,
  image, thumbnail) from the zip directory before inflating. The manifest
  is validated against the images that passed, so a dropped image takes its
  references with it. Exports carry only the images the document uses and
  always fit what the importer accepts.
- Assets: the `assets` registry describes files, it does not use them (an
  entry stays while undo could bring a replaced image back). `pruneAssets`
  deletes the files a project no longer uses and their registry entries, at
  close and when it is opened (`loadProject(id, { pruneAssets: true })`),
  the moments no undo step exists; imports write through `putProjectAsset`,
  queued with saves and prunes.
- Errors carry a `StorageError` code (`not_found`, `corrupt`, `invalid_file`,
  `too_large`, `network`); folder names always satisfy the model's id rules.
- Gallery: `fetchGallery()` GETs `${GALLERY_BASE_URL}index.json` with a
  6 s timeout, validates, caches to `cache/gallery-index.json`; offline
  returns the cache with `offline: true`. `installGalleryTemplate` downloads
  the template + preview + assets, validates, and writes `templates/<id>/`.
  `fetchGalleryPreview` downloads an entry's preview within the thumbnail
  limits (null otherwise); the template picker shows previews only from
  these bytes, through object URLs, never from the CDN URL.

### 6.5 Export (`src/export`)

- `planExport`: for each selected size (default: sizes with `default: true`
  for enabled families) x language x slide (up to the family's `maxSlides`,
  warn beyond) -> one job. Warnings: missing screenshots (after fallback),
  text overflow is reported by the renderer at run time, languages without
  a store locale code for a store (skipped for that store).
- Safeguards: a language that would share a store locale folder with another
  is skipped (`no-locale-code`); a second size for the same fastlane supply
  folder or App Store Connect screenshot set is skipped (`too-many-slides`).
  Apple currently requires two iPhone sizes (6.9″ and 6.3″), so both are
  defaults.
- Paths (`ext` = png | jpg, `NN` = 2-digit slide number; user-provided
  segments go through `sanitizeSegment`):
  - `stores`: `"App Store/<appStore locale>/<size.folder>/NN.<ext>"` and
    `"Google Play/<play locale>/<size.folder>/NN.<ext>"` (feature graphic:
    `"Google Play/<locale>/Feature graphic.<ext>"`).
  - `fastlane`: App Store -> `"fastlane/screenshots/<appStore locale>/NN_<size.id>.<ext>"`;
    Google Play -> `"fastlane/metadata/android/<play locale>/images/<supplyFolder>/NN.<ext>"`
    (feature graphic -> `".../images/featureGraphic.<ext>"`).
  - `flat`: `"<size.id>/<lang>/NN.<ext>"`.
- `encodePng`: 8-bit RGB (colour type 2), alpha composited over white,
  per-row filter chosen by minimum sum of absolute differences, zlib via
  fflate. Verified by decoding in tests.
- `encodePngAsync`: Web Worker (`new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' })`),
  transfers the buffer, falls back to `encodePng` on the main thread.
- `runExport`: sequential (bounded memory), honours `AbortSignal`, reports
  progress, collects per-job failures instead of stopping.
- CSV: header `slide,key,<lang1>,<lang2>...`; one row per slide x text key;
  RFC 4180 quoting; UTF-8 with BOM; import tolerates CRLF/LF, missing
  columns, unknown languages (added when they are valid catalog codes),
  reordered rows (matched by slide number + key). Cells a spreadsheet would
  run as a formula (`=`, `+`, `-`, `@`, tab, CR first) get a leading
  apostrophe on export, one more when they already start with apostrophes
  before such a character; import strips exactly one, so round trips stay
  exact. Rows whose key the model refuses (`isSafeKey`) are skipped, not
  counted as updates.

### 6.6 Runtime (`src/runtime`)

- Image cache: decode with `createImageBitmap(blob)` (fallback
  `HTMLImageElement`; `decodeImage` refuses anything over the image limits
  first), downscale previews to longest side <= 1400 px on a
  canvas and release the full decode. LRU with a 192 MB budget
  (width x height x 4). `loadFull` decodes on demand for export only.
  Dedupe concurrent loads. Notify subscribers when an image is ready.
- Fonts: `ensureFonts(project)` calls `document.fonts.load()` for each
  (family, weight) used, with each language's text as the sample string so
  the right unicode-range subsets load.
- Renderer: `renderToCanvas` sizes the canvas, resolves layout/shots/aspects
  and calls `renderSlide`; `renderJobBytes` renders at full size with
  full-resolution images (loaded per job, released after), PNG through
  `encodePngAsync`, JPEG through `canvas.toBlob`.
- Thumbnail (`thumb.jpg`): `renderThumbnail` draws only the first slides
  of the primary family (as many as fill a library card: three phones,
  two iPads, one Mac), side by side, each in its own 16 px-aligned cell
  with its edge columns repeated around it, and no backdrop. The home card
  cuts them apart with `thumbnailLayout` and lays them out on its own
  themed well; a thumbnail in any other layout is drawn again.
  `writeThumbnail(id, jpeg, updatedAt)` records the project version the
  picture shows in a JPEG comment segment (`thumbnailVersion` reads it), so
  the card also redraws a thumbnail of another version than the listing's
  `updatedAt` (one still due when the page unloaded or the app was killed),
  keeping the old picture up meanwhile. The home queue draws one project at
  a time, at most once per version and session, only once the closing
  editor has released that project (`projectReleased` in
  `ui/shell/session.ts`), and only when the thumbnail on disk is still not
  current then; never while a project is open in the editor.
- Autosave: debounced (800 ms) `saveProject` when the project changes, plus
  thumbnail refresh (debounced 4 s), status callbacks for the UI. Leaving
  the page (`beforeunload`, `pagehide`) saves at once and draws nothing:
  from then on WebKit refuses to read canvases back, so `canvasToBytes`
  rejects with `PageUnloadingError`, which is expected and never reported;
  the home screen redraws that thumbnail (see above).

### 6.7 Store (`src/store`)

- `useApp`: route (`{ name: 'home' } | { name: 'editor', projectId }`),
  settings (+ theme application on `<html data-theme>`), toasts.
- `useEditor`: the open project, active family, active language, active
  slide id, selection (element id), zoom, panel tabs, history (undo/redo,
  max 200, gesture coalescing: `beginGesture()` / `endGesture()` so a drag
  is one undo step), and every mutation as a named action (add / duplicate /
  delete / move slides, add / update / delete / reorder elements, set text,
  set screenshot, add / remove languages and families, theme edits, apply
  fonts, rename project). Mutations go through immer and bump `updatedAt`.

### 6.8 UI (`src/ui`)

Design language: calm, premium, dense like a pro design tool (Figma, Linear,
Raycast). Dark default, full light theme. System UI font at 13 px. Panels
`bg-panel` with `border-line` hairlines; inputs `bg-surface`; hover
`bg-surface-2`; accent violet for primary actions and selection; brand
sunset gradient only on the logo, the Export button glow and empty states.
8 px spacing grid, radii 6/8/12. Motion 120-320 ms with `--ease-out`,
respects reduced motion. Every icon button has a tooltip. Window dragging
via `data-tauri-drag-region` on empty top-bar areas; leave
`var(--traffic-lights-w)` free on macOS.

Kit components (`src/ui/kit`, all exported from `src/ui/kit/index.ts`):
Button (primary / secondary / ghost / danger, sizes sm/md/lg, loading),
IconButton, Tooltip, Kbd, Input, Textarea, NumberField (drag-to-scrub
label, arrow keys, units), Slider (with value), Select, SegmentedControl,
Switch, Checkbox, ColorField (swatch + popover with react-colorful, hex
input, palette swatches, alpha), FillEditor (solid / linear / radial / mesh
/ image), Tabs, Dialog (header, body, footer), Popover, DropdownMenu,
ContextMenu, Toast region, EmptyState, Badge, Spinner, ProgressBar,
Section (collapsible inspector section), Field (label + control row),
ScrollArea.

Kit behaviour screens rely on:

- Focus rings follow the keyboard: `trackInputModality()` (`kit/modality.ts`,
  started in `main.tsx`) keeps `<html data-modality="pointer|keyboard">`;
  while it is `pointer`, the `focus-visible` variant in `index.css` matches
  text fields only and tooltips do not open for focus (WebKit matches
  `:focus-visible` when script moves focus after a click).
- Closing a kit Dialog focuses whatever opened it (`kit/focusReturn.ts`): the
  focused control, the control just clicked (WebKit focuses no clicked
  button) or the trigger of the menu whose item opened it. Screens add no
  focus-return code and may open dialogs straight from menu items.
- The app store holds the toasts; the kit Toaster runs their timers, paused
  while a toast is hovered or focused, and moves the stack clear of an open
  dialog's footer buttons.
- ScrollArea scrollbars lie over the content on a 10 px track that takes
  clicks while shown: keep controls 10 px clear of that edge.
- `src/ui/kit/contrast.test.ts` measures the contrast promises in the header
  of `src/styles/tokens.css`, badges included.

## 7. Testing

- Unit (vitest): model helpers, validators, adapt, CSV, PNG encoder,
  export plan/paths, storage on the memory platform, engine geometry and
  pixel assertions with @napi-rs/canvas.
- Rust (`cargo test`, and `cargo test --features self-test`): path
  validation, atomic writes, asset hashing and magic bytes, export root
  scoping, file size limits, and IPC through the app's compiled capability.
- End-to-end (Playwright, WebKit): the browser build with the web platform:
  create from template, import screenshots, edit text, add Arabic, export
  (zip download contents and PNG dimensions), translations CSV round trip,
  undo/redo, project archive round trip.
- Desktop smoke test (`scripts/desktop-smoke.sh`): a `self-test` build
  started with `WAJHA_SELF_TEST_DIR` runs a scripted create -> render ->
  export flow through the real Rust commands and writes a report.

## 8. Budgets

- Installer (dmg) < 15 MB; JS bundle (gzip) < 600 KB excluding fonts.
- Idle memory < 200 MB total; decoded preview images <= 192 MB.
- Preview render of one slide < 16 ms on a modern laptop at 2x DPR for a
  360 px wide slide; full-size export of one 1320 x 2868 PNG < 1.5 s.

## Interface language

`src/i18n` holds the interface language (English or Arabic). English text is
the message key: `t('Export')`, `tx()` for messages holding elements and
`tn()` for counts, with Arabic plural forms chosen by Intl.PluralRules. The
language is read before any interface module runs (the saved choice, else the
system language); changing it reloads the window. The document gets `lang` and
`dir`, the interface uses logical Tailwind classes (`ms-`, `pe-`, `start-`,
`text-end`) so it mirrors, and the slide canvas stays `dir="ltr"`. Slide
content never follows the interface language. `i18n.test.ts` fails on any
message without Arabic or with mismatched placeholders.

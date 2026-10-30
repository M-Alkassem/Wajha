# Templates

A Wajha template is a **design without content**: a theme, one layout per
slide and per canvas shape, and a little sample copy. Pick one when you
create a project, drop your screenshots onto it, rewrite the copy, and every
device family and language is laid out for you.

This guide covers:

1. [Where templates come from](#1-where-templates-come-from)
2. [Designing a template in the app](#2-designing-a-template-in-the-app)
3. [Sharing a `.wajha-template` file](#3-sharing-a-wajha-template-file)
4. [The template format](#4-the-template-format)
5. [Contributing to the community gallery](#5-contributing-to-the-community-gallery)
6. [Design checklist](#6-design-checklist)
7. [For maintainers: the built-in templates](#7-for-maintainers-the-built-in-templates)

---

## 1. Where templates come from

| Source | Where it lives | Notes |
|---|---|---|
| **Built-in** | Inside the app (`src/templates/builtin/*.ts`) | 20 designs in seven categories, English, Arabic and (for five of them) German sample copy. Always available, offline. |
| **Community gallery** | The `gallery/` folder of the GitHub repository, served by jsDelivr | Browsed in the template picker when you are online; installed templates are kept for offline use. |
| **My templates** | Your own library | Made with *Save as template*, or imported from a `.wajha-template` file. |

## 2. Designing a template in the app

The easiest way to make a template is to design a project the way you like
it and save its design.

1. Create a project (blank, or from any template) and enable the device
   families you care about. A template stores one layout per **canvas
   shape**: tall (phones), tablet and wide (Mac). If your project has an
   iPhone, an iPad and a Mac family, all three layouts are saved; anything
   missing is adapted automatically when someone uses the template.
2. Design every slide: background, decorations, devices, text styles. Write
   short sample copy that shows how the design is meant to be used (see the
   [design checklist](#6-design-checklist)).
3. In the editor, open the overflow menu (**•••**) and choose
   **Save as template…**. Give it a name, an optional description, a
   category and a few tags.

What is kept and what is not:

| Kept | Dropped |
|---|---|
| Theme (background, pattern, panorama, fonts, palette, mock screen appearance) | Your screenshots (devices fall back to mock screens) |
| Every slide's layouts, with element styles and positions | Project name, languages and export settings |
| Sample copy in the project's base language | Copy in other languages |
| Images used by the design (background images, image elements) | Images used only as screenshots |

## 3. Sharing a `.wajha-template` file

A `.wajha-template` file is a zip archive:

```
template.json        the design (format below)
assets/<sha256>.png  images the design uses (if any), named by their SHA-256
preview.jpg          optional preview picture
```

- **Export:** right after *Save as template*, choose **Export file…** in the
  confirmation, or export any of your templates later from the template
  picker.
- **Import:** in the template picker choose **Import template file** and pick
  the `.wajha-template`. Everything inside is validated first: unknown keys
  are dropped, numbers are clamped to sane ranges, images are re-hashed, and
  broken files are refused with a clear message.

## 4. The template format

Templates are JSON. The authoritative definition is `Template` in
[`src/model/types.ts`](../src/model/types.ts), and `validateTemplate` in
[`src/model/validate.ts`](../src/model/validate.ts) is what the app runs on
every file it reads.

### A complete example

This one-slide template is valid as it is (a test checks it):

```json
{
  "format": "wajha.template",
  "version": 1,
  "id": "night-glow",
  "name": "Night Glow",
  "author": "Your Name",
  "description": "A midnight gradient with one soft light behind a graphite phone.",
  "category": "dark",
  "tags": ["dark", "glow", "minimal"],
  "theme": {
    "background": {
      "fill": {
        "type": "mesh",
        "base": "#0a0820",
        "points": [
          { "x": 0.15, "y": 0.1, "color": "#4b23d6", "radius": 0.55 },
          { "x": 0.9, "y": 0.95, "color": "#1f3bd6", "radius": 0.45 }
        ]
      },
      "pattern": { "kind": "noise", "color": "#ffffff", "opacity": 0.06, "scale": 0.05 }
    },
    "panorama": false,
    "fonts": { "heading": "Sora Variable", "body": "Inter Variable" },
    "palette": ["#7c5cff", "#2ee6c5", "#ffffff", "#0a0820"],
    "mockDark": true
  },
  "slides": [
    {
      "texts": {
        "en-US": { "headline": "Sleep *deeper* tonight", "subtitle": "Soundscapes that help you drift off." },
        "ar-SA": { "headline": "نومٌ *أعمق* كل ليلة", "subtitle": "أصوات هادئة تساعدك على النوم." }
      },
      "layouts": {
        "tall": {
          "background": null,
          "elements": [
            {
              "id": "light", "kind": "shape", "shape": "circle",
              "x": 0.5, "y": 0.6, "rotation": 0, "opacity": 0.6,
              "width": 0.8, "height": 0.8, "radius": 0, "stroke": 0, "blur": 0.14, "seed": 0,
              "fill": { "type": "solid", "color": "#7c4dff" }
            },
            {
              "id": "headline", "kind": "text", "key": "headline",
              "x": 0.5, "y": 0.143, "rotation": 0, "opacity": 1, "width": 0.86, "valign": "bottom",
              "style": {
                "font": "Sora Variable", "weight": 700, "size": 0.09, "lineHeight": 1.12, "letterSpacing": -0.03,
                "color": "#ffffff", "highlight": "#7cf5d6", "highlightMode": "color",
                "align": "center", "transform": "none", "maxLines": 2, "shadow": null
              }
            },
            {
              "id": "subtitle", "kind": "text", "key": "subtitle",
              "x": 0.5, "y": 0.157, "rotation": 0, "opacity": 1, "width": 0.8, "valign": "top",
              "style": {
                "font": "Inter Variable", "weight": 450, "size": 0.041, "lineHeight": 1.32, "letterSpacing": 0,
                "color": "#ebe8ff", "highlight": "#7cf5d6", "highlightMode": "color",
                "align": "center", "transform": "none", "maxLines": 2, "shadow": null
              }
            },
            {
              "id": "device", "kind": "device", "frame": "iphone",
              "x": 0.5, "y": 0.638, "rotation": 0, "opacity": 1, "width": 0.84, "slot": "main", "cornerRadius": 0.06,
              "style": { "color": "#2b2c31", "finish": "metal", "bezel": "black" },
              "shadow": { "color": "#05031aa6", "blur": 0.08, "x": 0, "y": 0.035 }
            }
          ]
        }
      }
    }
  ],
  "assets": {}
}
```

### Top-level fields

| Field | Meaning |
|---|---|
| `format`, `version` | Always `"wajha.template"` and `1`. |
| `id` | kebab-case (`a-z`, `0-9`, `-`), at most 64 characters, unique in the gallery. |
| `name`, `author`, `description` | Shown in the template picker. Names up to 200 characters, descriptions up to 2 000. |
| `category` | One of `minimal`, `bold`, `gradient`, `dark`, `playful`, `panorama`, `elegant`. |
| `tags` | Up to 20 short tags (40 characters each) used by search. |
| `theme` | Background, panorama flag, suggested fonts, palette, mock screen appearance. |
| `slides` | 1 to 10 slides; new projects start with these. |
| `assets` | Images the design uses, keyed by asset id (`<sha256>.png\|jpg\|webp`). Empty for most templates. |

### Units and coordinates

Layouts never use pixels, so one design fits every export size:

- **`x`, `y`** are fractions of the canvas width and height (`0.5, 0.5` is
  the centre). They mark the element's **anchor**: its centre, except for
  text, whose `valign` says whether `y` is the top, middle or bottom of the
  text block.
- **Lengths** (widths, font sizes, blur, shadow offsets, stroke) are fractions
  of **u = the shorter side of the canvas**. On an iPhone canvas (1320 × 2868)
  u is the width; on a Mac canvas (2880 × 1800) it is the height.
- **Angles** are degrees, clockwise. **Letter spacing** is in em
  (`-0.02` is a little tighter).
- **Painter's order:** `elements[0]` is drawn first, at the bottom.
- **Colours** are `#RRGGBB` or `#RRGGBBAA` (the last pair is alpha).

### One layout per canvas shape

Each slide has `layouts.tall` (required), and optionally `layouts.tablet` and
`layouts.wide`. Each is authored on a reference canvas:

| Class | Reference canvas | Used by |
|---|---|---|
| `tall` | iPhone 1320 × 2868 | iPhone, Android phone |
| `tablet` | iPad 2064 × 2752 | iPad, Android tablet |
| `wide` | Mac 2880 × 1800 | Mac, Google Play feature graphic |

A family whose class layout is missing gets the tall layout **adapted**:
copy and devices are re-flowed (side by side on wide canvases), shapes keep
their relative position and size. Adaptation is good, but large decorations
can end up behind the copy; designing `tablet` and `wide` yourself always
gives the best result. Device frames that are a family default (`iphone`,
`ipad`, `android-phone`, `android-tablet`, `macbook`) are swapped for the
target family's own frame; `browser` and `none` are kept.

### Theme

```json
"theme": {
  "background": { "fill": { ... }, "pattern": null },
  "panorama": false,
  "fonts": { "heading": "Sora Variable", "body": "Inter Variable" },
  "palette": ["#7c5cff", "#2ee6c5", "#ffffff", "#0a0820"],
  "mockDark": true
}
```

- **`background`** is the slide background unless a layout sets its own
  `background` (then that slide uses it, and it is never panoramic).
- **`fonts`** are suggestions: *Apply fonts* restyles every text element with
  them. Use the bundled fonts (they work offline in every language):
  Inter, Plus Jakarta Sans, Manrope, DM Sans, Outfit, Sora, Space Grotesk,
  Bricolage Grotesque, Fraunces, Playfair Display, Rubik, Cairo, Readex Pro,
  Noto Sans Arabic (written with the `Variable` suffix, e.g. `"Sora Variable"`).
  Arabic text in a Latin-only font falls back to Noto Sans Arabic.
- **`palette`** is offered first in colour pickers. Its **first colourful
  entry is the accent of the mock screens** shown in empty devices, so put
  your brand colour first.
- **`mockDark`** draws those mock screens in dark mode.

### Fills

Used by backgrounds and shapes.

| `type` | Fields |
|---|---|
| `solid` | `color` |
| `linear` | `angle` (CSS semantics: 0 = towards the top, 90 = towards the right), `stops: [{ offset 0..1, color }]` |
| `radial` | `cx`, `cy` (fractions of the box), `radius` (fraction of its longer side), `stops` |
| `mesh` | `base` colour and `points: [{ x, y, color, radius }]`: soft colour blobs, the "aurora" look |
| `image` | `assetId`, `fit` (`cover`, `contain`, `tile`), `opacity`, `blur` (fraction of u), `tint` (colour drawn on top, use alpha) |

### Patterns

`"pattern": { "kind": "dots", "color": "#ffffff", "opacity": 0.12, "scale": 0.05 }`
draws over the background fill. `scale` is the spacing in u.

| `kind` | Looks like |
|---|---|
| `dots` | a dot grid |
| `grid` | hairline squares (a Swiss grid, a blueprint) |
| `diagonal` | 45° lines |
| `noise` | film grain (`scale` sets the grain size) |
| `waves` | horizontal sine lines |
| `rings` | concentric circles around the centre |

### Elements

Every element has `id` (unique in its layout), `kind`, `x`, `y`,
`rotation`, `opacity` and optionally `name`, `hidden`, `locked`.

**Device** (`"kind": "device"`) shows a screenshot in a device frame.

| Field | Meaning |
|---|---|
| `frame` | `iphone`, `ipad`, `android-phone`, `android-tablet`, `macbook`, `browser` (a window with a toolbar, for web apps), `none` (the bare screenshot with rounded corners) |
| `style` | `color` of the body; `finish`: `metal` (sheen and edge highlight), `matte`, `clay` (solid pastel); `bezel`: `black` or `match` (body coloured, the clay mockup look) |
| `width` | Outer width in u; the height follows the screen shape |
| `slot` | Which screenshot it shows: `"main"`, or another key such as `"second"` for a second device on the same slide |
| `cornerRadius` | Screen corner radius for `none`, fraction of the width |
| `shadow` | `{ color, blur, x, y }` or `null` |

Popular frame colours: graphite `#2b2c31`, black `#151518`, silver
`#e4e4e7`, white `#f4f3f0`, natural titanium `#b9b2a6`, desert titanium
`#c4a688`, blue titanium `#3b4b66`, gold `#d9bf8c`; for clay, any pastel.

**Text** (`"kind": "text"`) shows one of the slide's texts.

| Field | Meaning |
|---|---|
| `key` | Which text: `"headline"`, `"subtitle"`, or any key you invent (`"eyebrow"`, `"badge"`); the sample copy needs the same keys |
| `width` | Box width in u; lines wrap inside it |
| `valign` | `top`, `middle` or `bottom`: which edge of the block `y` is |
| `style.font`, `weight`, `size` | Font family, weight 100..900, size in u |
| `style.lineHeight`, `letterSpacing` | Line height multiplier; spacing in em (ignored for Arabic, which joins letters) |
| `style.color`, `highlight`, `highlightMode` | Text colour; colour of `*highlighted*` words; `color` recolours them, `marker` paints a rounded pill behind them |
| `style.align` | `start`, `center`, `end`; start and end flip for right-to-left languages |
| `style.transform` | `none` or `uppercase` |
| `style.maxLines` | Text that needs more lines shrinks (down to 60 %) until it fits; 0 = no limit |
| `style.shadow` | `{ color, blur, x, y }` or `null` |

Markup in the copy: `*word*` highlights, `\n` breaks the line, `\*` is a
literal asterisk.

Tip: anchor the headline at its **bottom** and the subtitle at its **top**
on the same line (`valign: "bottom"` and `"top"`). One-line and two-line
headlines then both sit tight against their subtitle.

**Shape** (`"kind": "shape"`) is decoration.

| Field | Meaning |
|---|---|
| `shape` | `circle` (an ellipse filling width × height), `rect`, `blob` (a smooth organic outline from `seed`), `ring` (an outline `stroke` u thick) |
| `width`, `height` | Size in u |
| `fill` | Any fill above (gradients are laid out over the shape's own box) |
| `radius` | Rect corner radius, fraction of the shorter side |
| `blur` | Soft glow in u; `0` is sharp |
| `seed` | Picks the blob outline |

A turned square (`rect` with `rotation: 45`) mostly below the bottom edge
makes a mountain peak; two squares, one turned 45°, make an eight-point star.

**Image** (`"kind": "image"`) places an image from `assets` (`assetId`,
`width` in u, `cornerRadius`, `shadow`).

### Sample copy

`texts` maps language codes to texts by key:

```json
"texts": {
  "en-US": { "headline": "Plan the *perfect* trip", "subtitle": "Every stop on one map." },
  "ar-SA": { "headline": "خطّط لرحلتك *المثالية*", "subtitle": "كل محطاتك على خريطة واحدة." }
}
```

`en-US` is expected; a project in another language uses that language's
copy when the template has it (`ar-SA` also serves `ar-EG`), else English.

### Panoramas

With `"panorama": true` the theme background is painted as one canvas as
wide as all slides together, and each slide shows its own part, so
gradients, mesh lights and patterns run on from one screenshot into the
next in the store listing. To make a decoration cross a seam, put the same
shape on both slides: at `x: 1.0` on the left slide and at `x: 0.0` on the
right one, same `y` and size. Each slide shows its half.

## 5. Contributing to the community gallery

The gallery is the `gallery/` folder of the repository:

```
gallery/
  index.json                 generated: what the app downloads
  .hashes.json               generated: template hashes, for versioning
  templates/
    <id>/
      template.json          your template (pretty-printed JSON)
      preview.jpg            generated: the first three slides, 1200 × 860
      assets/<sha256>.png    images the design uses (only if any)
```

### Steps

1. **Design and export** your template in the app (see sections 2 and 3).
2. **Add the folder.** Fork the repository and create
   `gallery/templates/<id>/`, where `<id>` is your template's `id`. Unzip
   your `.wajha-template` and copy `template.json` (pretty-print it so
   reviews are readable) and `assets/` if there is one. Set `author` to the
   name you want credited and write a one-sentence `description`.
3. **Render the preview:**

   ```sh
   WAJHA_GALLERY=1 WAJHA_GALLERY_ONLY=<id> npx vitest run scripts/gallery-previews.test.ts
   ```

4. **Rebuild the index:**

   ```sh
   npm run gallery:index
   ```

   This writes `gallery/index.json` and `gallery/.hashes.json`. Each entry's
   `version` goes up by one whenever its `template.json` changes, which is
   how the app notices updates; rebuilding an unchanged gallery changes
   nothing. `node scripts/build-gallery-index.mjs --check` only reports
   whether the committed index is current (the gallery tests in CI check
   the same).
5. **Run the gallery tests:**

   ```sh
   npx vitest run scripts/gallery.test.ts
   ```

   They validate every template with the app's own validator, check that
   ids match folder names, that the index matches the folder, that previews
   exist and stay under 400 KB, and that the sample copy fits its text boxes.
6. **Open a pull request** with the new folder, `index.json` and
   `.hashes.json`.

### Pull request checklist

- [ ] The folder name equals the template `id` (kebab-case, not used by a
      built-in or another gallery template).
- [ ] `name`, `author`, `description`, `category` and 3+ `tags` are set.
- [ ] Sample copy in English (and, ideally, Arabic or other languages you
      know well) for every text the layouts show.
- [ ] Uses the bundled fonts only.
- [ ] Contrast: headlines at least 3:1 against what is behind them, smaller
      text at least 4.5:1.
- [ ] Images are your own or freely licensed for redistribution under the
      project's licence; no logos or trademarks of other companies.
- [ ] `preview.jpg` rendered by the script, `index.json` and `.hashes.json`
      regenerated, `npx vitest run scripts/gallery.test.ts` passes.

## 6. Design checklist

What makes the built-in templates look professional, in one list:

- **Copy:** headlines of 2 to 5 words with **one** highlighted word; a
  subtitle of one short sentence. Write sample copy for a real kind of app,
  it shows how the design is meant to be used.
- **Contrast:** check the copy against the actual background behind it,
  including lights, shapes and gradients (3:1 for headlines, 4.5:1 for
  everything else).
- **Room to grow:** set `maxLines` on every text (2 for headlines and
  subtitles) so long translations shrink instead of spilling; German
  compounds and Arabic both need it. Keep headline `lineHeight` at 1.1 or
  more and Arabic-first designs at 1.2 or more.
- **Devices:** leave a gap between the subtitle and the device; let phones
  bleed off the bottom edge by 5 to 10 %; keep tilts between 4° and 12°.
- **One idea per slide,** and vary the composition across the five slides
  (centred, tilted, two devices, copy at the bottom, a hero with rings).
- **Panoramas:** keep devices a bit smaller (about 0.7 u wide) so the
  continuous background has room to show.
- **Tablet and wide:** design them, or at least look at the adapted result
  on an iPad and a Mac project before publishing.

## 7. For maintainers: the built-in templates

Built-ins are TypeScript modules in `src/templates/builtin/`, listed in
`src/templates/index.ts` (the first one is the default, also used by
`?demo`). They are written with the builders in `src/templates/kit.ts`:

- `typeset()` defines a template's type system (fonts, colours, headline /
  subtitle / eyebrow presets); `copyAt()` places a headline and subtitle on
  a seam.
- `device()` places a device by its `top` or `bottom` edge on a given canvas
  class; `circle`, `rect`, `ring`, `blob` and `glow` make decorations.
- `slide(copy, build, { classes })` builds a slide from one function per
  canvas class; `onStrip()` places panorama decorations on the continuous
  strip.
- `template()` assembles everything, gives decorations ids, and orders each
  device among the elements it does not overlap so its mock screen shows an
  app from the template's `apps` list (a fitness template previews a fitness
  app), never the same screen on two consecutive slides.

Tests (always on):

```sh
npx vitest run src/templates
```

They check that every template validates unchanged, has five slides,
English and Arabic copy for every text key, unique ids and bundled fonts
only; that no text overflows at the iPhone, iPad and Mac design sizes in
English, German and Arabic; and that every text meets the contrast rules
against the pixels actually rendered behind it.

Visual QA (contact sheets of every slide per family and language, an
overview of all first slides, and the adapted layouts) is opt-in:

```sh
WAJHA_TEMPLATES_QA=1 npx vitest run src/templates/qa
WAJHA_TEMPLATES_QA=1 WAJHA_TEMPLATES_QA_ONLY=aurora,noor npx vitest run src/templates/qa
```

The sheets land in `.qa/templates/` (git-ignored). The gallery seed
templates are generated from `scripts/gallery-seed.test.ts`
(`WAJHA_GALLERY_SEED=1`).

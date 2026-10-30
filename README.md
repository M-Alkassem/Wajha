<p align="center">
  <img src="docs/media/icon.png" width="104" height="104" alt="Wajha app icon" />
</p>

<h1 align="center">Wajha · واجهة</h1>

<p align="center">
  <b>Beautiful App Store and Google Play screenshots in minutes.</b><br />
  Free, open source and offline. For macOS, Windows and Linux.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-7c5cff" /></a>
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-1f1f2a" />
  <img alt="Download about 6 MB" src="https://img.shields.io/badge/download-~6%20MB-1f1f2a" />
</p>

<p align="center">
  <img src="docs/media/editor.jpg" alt="The Wajha editor: slides with device frames, headlines and an inspector" />
</p>

Store screenshots are the first thing people see of your app, and making
them is tedious: every store wants its own sizes, every language needs its
own copy, and the usual tools are paid, online-only or both. **Wajha**
(واجهة, Arabic for *façade* or *storefront*) turns it into a few minutes of work: pick a
template, drop in your screenshots, write your headlines, and export every
size both stores ask for, in every language, in one click.

## Features

- **20 designed templates** in seven styles, from minimal to bold panoramas,
  plus a community gallery and your own saved templates.
- **Real device frames** for iPhone, iPad, Android phones and tablets and
  MacBook, drawn as vectors (metal, matte or clay finish) so they stay sharp at
  any size. Until you add screenshots, templates show generated app screens.
- **Exact store sizes.** iPhone 6.9″ and 6.3″, iPad 13″, Android phone and
  tablets, Mac and the Google Play feature graphic. PNGs are exported without
  an alpha channel, which Google Play requires.
- **51 languages with right-to-left support.** Arabic, Hebrew, Persian and
  Urdu are shaped and aligned correctly. Translate side by side in a grid, or
  round-trip a CSV with your translators.
- **One click exports everything**: a folder per store, size and language,
  or a fastlane-ready layout (`deliver` and `supply`).
- **A proper editor**: drag, resize and rotate with snapping guides, layers,
  undo and redo, keyboard shortcuts, `*highlighted*` words, auto-fitting
  headlines, panorama backgrounds that flow across slides, and a light and a
  dark theme.
- **Private and light**: no account, no telemetry, works offline. The app is
  about 6 MB and uses your system's web view instead of shipping a browser.

<table>
  <tr>
    <td><img src="docs/media/home.jpg" alt="Project library" /></td>
    <td><img src="docs/media/new-project.jpg" alt="New project: templates, devices and languages" /></td>
  </tr>
  <tr>
    <td><img src="docs/media/arabic.jpg" alt="Editing the Arabic version of a slide" /></td>
    <td><img src="docs/media/export.jpg" alt="Export dialog with every store size" /></td>
  </tr>
</table>

## Download

Get the installer for your system from the
[Releases](../../releases/latest) page:

| System | File |
|---|---|
| macOS 11 or later, Apple silicon | `Wajha_x.y.z_aarch64.dmg` |
| macOS 11 or later, Intel | `Wajha_x.y.z_x64.dmg` |
| Windows 10 or later | `Wajha_x.y.z_x64-setup.exe` |
| Linux | `.AppImage`, `.deb` or `.rpm` |

> [!NOTE]
> Builds are not code-signed yet. On macOS, right-click the app and choose
> **Open** the first time (or allow it under **System Settings → Privacy &
> Security**). On Windows, choose **More info → Run anyway**.

## How it works

1. **New project.** Choose a template, the devices you ship on and your
   languages. The first language is the base: every other language falls back
   to its text and screenshots.
2. **Add screenshots.** Drop images onto the slides (or onto the stage to fill
   slides in order). A screenshot added while another language is active
   becomes that language's localized version.
3. **Write the copy.** Click a headline and type. Wrap words in `*asterisks*`
   to highlight them. Use **Translations** to fill in other languages, or
   export a CSV, translate it anywhere and import it back.
4. **Export.** Wajha renders every slide at every selected size and language:

```
Aurora screenshots/
├── App Store/
│   ├── en-US/iPhone 6.9/01.png … 05.png
│   └── ar-SA/iPhone 6.9/01.png …
└── Google Play/
    ├── en-US/Phone/01.png …
    └── ar/Phone/01.png …
```

Choose the *fastlane* structure to get `fastlane/screenshots/<locale>/` and
`fastlane/metadata/android/<locale>/images/` instead.

## Templates

| Source | Where it comes from |
|---|---|
| Built-in | 20 templates inside the app, always available offline. |
| Community gallery | The [`gallery/`](gallery/) folder of this repository, browsed in the template picker when you are online. Installed templates stay available offline. |
| Your own | **Save as template** in the editor, or open a `.wajha-template` file someone shared. |

Want your design in the gallery? Design it in Wajha, save it as a template
and open a pull request. [docs/TEMPLATES.md](docs/TEMPLATES.md) explains the
format and the checklist.

## Your data

Projects are plain folders, so they are easy to back up or sync:

| System | Location |
|---|---|
| macOS | `~/Library/Application Support/studio.wajha.app/` |
| Windows | `%APPDATA%\studio.wajha.app\` |
| Linux | `~/.local/share/studio.wajha.app/` |

Each project keeps its `project.json`, a small thumbnail and its images,
stored once each and named by content hash. Images you stop using are deleted
when you close the project, or the next time you open it. Use **Export as file** on a project card to
share a whole project as a single `.wajha` file.

The only network request Wajha makes is the community gallery listing, and
only while you browse it.

## Build from source

You need [Node.js](https://nodejs.org) 22.18 or later, the
[Rust toolchain](https://rustup.rs) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your
system.

```bash
git clone https://github.com/M-Alkassem/Wajha.git
cd Wajha
npm install
npm run desktop          # run the desktop app in development mode
npm run desktop:build    # build an installer into src-tauri/target/release/bundle
```

The same interface also runs in a browser (projects are kept in the browser's
storage, and exports download as a zip), which is handy for quick UI work:

```bash
npm run dev              # http://localhost:1420
```

## Development

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest): engine, model, storage, export, UI logic |
| `npm run e2e` | End-to-end tests in WebKit (Playwright) |
| `npm run typecheck` | TypeScript in strict mode |
| `npm run lint` | oxlint |
| `cd src-tauri && cargo test` | Rust tests for the file-system commands |
| `bash scripts/desktop-smoke.sh` | Builds the desktop app with its self-test (a cargo feature shipped builds leave out), runs it end to end and reports memory |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes how the pieces fit
together: the canvas rendering engine, the data model, storage, export and the
interface. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Built with

[Tauri](https://tauri.app), [React](https://react.dev),
[TypeScript](https://www.typescriptlang.org), [Vite](https://vite.dev),
[Tailwind CSS](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com),
[Zustand](https://zustand.docs.pmnd.rs), [Lucide](https://lucide.dev) icons and
[Fontsource](https://fontsource.org) fonts. Rendering is plain Canvas 2D, with
no rendering library.

## License

[MIT](LICENSE). Bundled fonts are under the SIL Open Font License.

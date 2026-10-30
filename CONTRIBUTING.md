# Contributing to Wajha

Thanks for helping! There are three easy ways in:

- **Share a template.** Design it in Wajha, save it as a template and add it
  to the community gallery with a pull request. The steps and the checklist
  are in [docs/TEMPLATES.md](docs/TEMPLATES.md#5-contributing-to-the-community-gallery).
- **Report a bug.** Open an issue with what you did, what you expected, what
  happened, your system, and a `.wajha` file or screenshot if you can.
- **Send a fix or a feature.** For anything larger than a small fix, open an
  issue first so we can agree on the approach.

## Setup

You need Node.js 22.18 or later, the Rust toolchain and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run dev        # the interface in a browser at http://localhost:1420
npm run desktop    # the desktop app
```

Useful URLs while developing in the browser: `?demo` opens a ready-made
project, `?demo=<templateId>&families=iphone,ipad&langs=en-US,ar-SA` picks the
template, devices and languages, and `?kit` shows every UI component.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run e2e                        # WebKit end-to-end tests
cd src-tauri && cargo test         # if you touched Rust
```

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. It describes
  each module's contract, the data model's units and the design language.
- Keep changes focused, and add or update tests with them.
- Match the surrounding code: strict TypeScript, no `any`, small modules,
  comments that explain why rather than what.
- Check the interface in both the dark and the light theme, and with a
  right-to-left language such as Arabic.
- Please talk to us before adding a dependency: a small download and low
  memory use are features.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).

# Ogmios

[![CI](https://img.shields.io/github/actions/workflow/status/thejackshelton/ogmios/ci.yml?branch=main&label=CI)](https://github.com/thejackshelton/ogmios/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ogmios?color=CB3837&logo=npm)](https://www.npmjs.com/package/ogmios)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2014%20%7C%2015%20%7C%2026-lightgrey?logo=apple)](docs/background/platform-risk.md)

> Run real screen readers — VoiceOver, NVDA, and more — in any test framework and any CI environment.

**Status:** 🚧 Early development. v1 targets macOS + VoiceOver + Vitest browser mode. Not ready for production use.

## What is Ogmios?

**Ogmios** — the Gaulish god of eloquence.

The Greek satirist Lucian of Samosata described a statue of Ogmios in 2nd-century
Gaul: an old man with chains of gold and amber running from his tongue to the ears
of his followers, who trailed behind him willingly, pulled by his words. Lucian's
Gaulish host explained that in Celtic tradition, wisdom and persuasion are greater
in age than in youth — so the god of speech is painted as an elder.

The library is that chain. It captures the speech traveling from the screen reader
— the tongue — to the test — the ear — so you can assert on every word.

Ogmios lets you start a **real** screen reader from your existing test framework, capture everything it would have announced, and assert on that log. No simulators, no static checkers — the actual VoiceOver (and later NVDA, Orca) speaking through a test.

Think of it as a more ambitious [Guidepup](https://github.com/guidepup/guidepup) with first-class CI support and dramatically better DX.

## Install

Ogmios is a library + CLI. The canonical path is **local install in your test project**:

> **v0.1.1 ships arm64 only** (Apple Silicon Macs). Intel Mac support arrives in v0.2. Most active Mac dev machines are Apple Silicon (Apple stopped selling Intel in 2023).

```bash
npm install ogmios
npx ogmios setup
```

Why local: your test files will `import { voiceOver } from 'ogmios'`, which only resolves when `ogmios` is in your project's `package.json`. The `ogmios setup` CLI works via `npx` from a local install — no global install needed.

For Vitest users:

```bash
npm install -D ogmios vitest @vitest/browser playwright
```

`ogmios setup` downloads `OgmiosRunner.app` + `OgmiosSetup.app` from GitHub Releases to `~/Applications/`, strips the macOS quarantine attribute, and walks you through Accessibility + Automation permission prompts. It runs once per machine — TCC grants persist across projects because the trust anchor is `~/Applications/OgmiosRunner.app`, independent of your `node_modules/`.

### Alternative: global install

If you just want to grant TCC on your Mac without a project yet (evaluating ogmios, pre-provisioning a dev box), global install works:

```bash
npm install -g ogmios
ogmios setup
```

You'll still need a local install (`npm install ogmios` inside the project) to `import` ogmios in test code.

See [`docs/getting-started/install.md`](docs/getting-started/install.md) for details.

### Why?

Most accessibility tests today use static rule checkers (axe-core, ESLint-jsx-a11y). They catch structural problems but miss how the experience *actually sounds* to a screen reader user. Running real screen readers in automated tests has historically been hard because:

- Screen readers need OS-level permissions.
- They announce through speakers.
- macOS CI runners are expensive and fiddly.
- NVDA is Windows-only.

Ogmios solves those piece by piece.

## Core value

**A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.**

## Architecture (brief)

```
┌──────────────────────┐
│   Your test          │   (Vitest, Playwright, XCUITest — whatever)
│   voiceOver.listen() │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   ogmios (TS)        │   Public API + `ogmios` CLI + matcher fns + vitest plugin
└──────────┬───────────┘
           │ N-API
┌──────────▼───────────┐
│   ogmios.node (Zig)  │   Native core — 50ms VO poll loop, ring buffer, wire format
└──────────┬───────────┘
           │ XPC (libOgmiosXPCClient.dylib)
┌──────────▼───────────┐
│   OgmiosRunner.app   │   Signed Zig-compiled helper — holds the stable TCC trust anchor
│   OgmiosSetup.app    │   Zig-compiled GUI — one-click TCC prompt on first run
└──────────┬───────────┘
           │ AppleScript + AX notifications
┌──────────▼───────────┐
│   VoiceOver          │
└──────────────────────┘
```

Ogmios ships **3 npm packages**:

- `ogmios` — TypeScript API, `ogmios` CLI (`bin`), matcher functions at `ogmios/matchers`, and Vitest plugin at `ogmios/vitest`, `ogmios/vitest/setup`, `ogmios/vitest/browser`.
- `@ogmios/binding-darwin-arm64` — platform binary (Zig `.node`), auto-installed via `optionalDependencies`. Never installed by hand.
- `@ogmios/binding-darwin-x64` — same, for Intel Macs. Auto-installed via `optionalDependencies`. Never installed by hand.

The helper apps (`OgmiosRunner.app` + `OgmiosSetup.app`) are **not** in the npm tarballs. `npx ogmios setup` downloads them from GitHub Releases on first run (~10MB), verifies SHA256, installs them into `~/Applications/`, and triggers the macOS TCC permission flow. The helper bundles are **single-language Zig** — no Swift, no Objective-C sources. See [`docs/background/architecture.md`](docs/background/architecture.md) for the full story (signed-wrapper-app rationale, wire format spec, driver extensibility).

## Not yet

Ogmios is pre-alpha. The v1 roadmap:

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundations | In progress |
| 2 | Permission Setup & Doctor CLI | Not started |
| 3 | VoiceOver Capture Core | Not started |
| 4 | Vitest Browser-Mode Integration | Not started |
| 5 | CI Story | Not started |
| 6 | Docs & v1 Release Polish | Not started |

See `.planning/ROADMAP.md` for specifics.

## CI / Running in automation

Ogmios supports four CI topologies. Each has a reference workflow under
[`.github/workflows/examples/`](.github/workflows/examples/):

| Topology | When to use | Cost | Reference |
|----------|-------------|------|-----------|
| Self-hosted tart | Heavy/continuous use; you own a Mac mini | Amortized ~$0 after hardware | [`ogmios-tart-selfhosted.yml`](.github/workflows/examples/ogmios-tart-selfhosted.yml) |
| Cirrus Runners | Recommended managed option (tart under the hood) | ~$40/month | [`ogmios-cirrus-runners.yml`](.github/workflows/examples/ogmios-cirrus-runners.yml) |
| GetMac | Drop-in managed macOS with ~40% cost savings | Variable | [`ogmios-getmac.yml`](.github/workflows/examples/ogmios-getmac.yml) |
| GitHub-hosted `macos-latest` | Occasional CI, smallest setup | Most expensive (10x Linux minute multiplier) | [`ogmios-github-hosted.yml`](.github/workflows/examples/ogmios-github-hosted.yml) |

All four use the reusable [`ogmios/setup-action`](.github/actions/setup/action.yml) composite
action which auto-detects the topology and applies the right setup. The pre-baked tart image
pipeline lives in [`infra/tart/`](infra/tart/).

See [`docs/background/release-setup.md`](docs/background/release-setup.md) § 6 for publishing the pre-baked tart images, and
[`infra/tart/README.md`](infra/tart/README.md) for building them locally.

## Getting involved

Ogmios is MIT-licensed and we welcome contributors. If you want to help add a new screen reader driver, see [`docs/background/adding-a-driver.md`](docs/background/adding-a-driver.md).

For questions and design discussions, open an issue. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for dev setup and [`.github/CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md) for community standards.

## Documentation

Full docs live at the [Ogmios docs site](https://thejackshelton.github.io/ogmios/) (built from [`docs/`](docs/) via VitePress). Key pages:

- [Getting Started → Install](https://thejackshelton.github.io/ogmios/getting-started/install)
- [Getting Started → Vitest quickstart](https://thejackshelton.github.io/ogmios/getting-started/vitest-quickstart)
- [Guides → Matchers](https://thejackshelton.github.io/ogmios/guides/matchers)
- [Guides → Migration from Guidepup](https://thejackshelton.github.io/ogmios/guides/migration-from-guidepup)
- [Background → Platform risk](https://thejackshelton.github.io/ogmios/background/platform-risk)

## License

[MIT](LICENSE)

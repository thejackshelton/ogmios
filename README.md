# Shoki

[![CI](https://img.shields.io/github/actions/workflow/status/shoki/shoki/ci.yml?branch=main&label=CI)](https://github.com/shoki/shoki/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/shoki?color=CB3837&logo=npm)](https://www.npmjs.com/package/shoki)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2014%20%7C%2015%20%7C%2026-lightgrey?logo=apple)](docs/background/platform-risk.md)

> Run real screen readers — VoiceOver, NVDA, and more — in any test framework and any CI environment.

**Status:** 🚧 Early development. v1 targets macOS + VoiceOver + Vitest browser mode. Not ready for production use.

## What is this?

Shoki lets you start a **real** screen reader from your existing test framework, capture everything it would have announced, and assert on that log. No simulators, no static checkers — the actual VoiceOver (and later NVDA, Orca) speaking through a test.

Think of it as a more ambitious [Guidepup](https://github.com/guidepup/guidepup) with first-class CI support and dramatically better DX.

## Install

Shoki is a library + CLI. The canonical path is **local install in your test project**:

```bash
npm install shoki
npx shoki setup
```

Why local: your test files will `import { voiceOver } from 'shoki'`, which only resolves when shoki is in your project's `package.json`. The `shoki setup` CLI works via `npx` from a local install — no global install needed.

For Vitest users:

```bash
npm install -D shoki vitest @vitest/browser playwright
```

`shoki setup` downloads `Shoki.app` from GitHub Releases to `~/Applications/`, strips the macOS quarantine attribute, and walks you through Accessibility + Automation permission prompts. It runs once per machine — TCC grants persist across projects because the trust anchor is `~/Applications/Shoki.app`, independent of your `node_modules/`.

### Alternative: global install

If you just want to grant TCC on your Mac without a project yet (evaluating shoki, pre-provisioning a dev box), global install works:

```bash
npm install -g shoki
shoki setup
```

You'll still need a local install (`npm install shoki` inside the project) to `import` shoki in test code.

See [`docs/getting-started/install.md`](docs/getting-started/install.md) for details.

### Why?

Most accessibility tests today use static rule checkers (axe-core, ESLint-jsx-a11y). They catch structural problems but miss how the experience *actually sounds* to a screen reader user. Running real screen readers in automated tests has historically been hard because:

- Screen readers need OS-level permissions.
- They announce through speakers.
- macOS CI runners are expensive and fiddly.
- NVDA is Windows-only.

Shoki solves those piece by piece.

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
│   shoki (TS)        │   Public API + `shoki` CLI + matcher fns + vitest plugin
└──────────┬───────────┘
           │ N-API
┌──────────▼───────────┐
│   shoki.node (Zig)   │   Native core — 50ms VO poll loop, ring buffer, wire format
└──────────┬───────────┘
           │ XPC (libShokiXPCClient.dylib)
┌──────────▼───────────┐
│   ShokiRunner.app    │   Signed Zig-compiled helper — holds the stable TCC trust anchor
│   ShokiSetup.app     │   Zig-compiled GUI — one-click TCC prompt on first run
└──────────┬───────────┘
           │ AppleScript + AX notifications
┌──────────▼───────────┐
│   VoiceOver          │
└──────────────────────┘
```

Shoki ships **3 npm packages**:

- `shoki` — TypeScript API, `shoki` CLI (`bin`), matcher functions at `shoki/matchers`, and Vitest plugin at `shoki/vitest`, `shoki/vitest/setup`, `shoki/vitest/browser`.
- `@shoki/binding-darwin-arm64` — platform binary (Zig `.node`), auto-installed via `optionalDependencies`. Never installed by hand.
- `@shoki/binding-darwin-x64` — same, for Intel Macs. Auto-installed via `optionalDependencies`. Never installed by hand.

The helper apps (`Shoki.app` + `Shoki Setup.app`) are **not** in the npm tarballs. `npx shoki setup` downloads them from GitHub Releases on first run (~10MB), verifies SHA256, installs them into `~/Applications/`, and triggers the macOS TCC permission flow. The helper bundles are **single-language Zig** — no Swift, no Objective-C sources. See [`docs/background/architecture.md`](docs/background/architecture.md) for the full story (signed-wrapper-app rationale, wire format spec, driver extensibility).

## Not yet

Shoki is pre-alpha. The v1 roadmap:

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

Shoki supports four CI topologies. Each has a reference workflow under
[`.github/workflows/examples/`](.github/workflows/examples/):

| Topology | When to use | Cost | Reference |
|----------|-------------|------|-----------|
| Self-hosted tart | Heavy/continuous use; you own a Mac mini | Amortized ~$0 after hardware | [`shoki-tart-selfhosted.yml`](.github/workflows/examples/shoki-tart-selfhosted.yml) |
| Cirrus Runners | Recommended managed option (tart under the hood) | ~$40/month | [`shoki-cirrus-runners.yml`](.github/workflows/examples/shoki-cirrus-runners.yml) |
| GetMac | Drop-in managed macOS with ~40% cost savings | Variable | [`shoki-getmac.yml`](.github/workflows/examples/shoki-getmac.yml) |
| GitHub-hosted `macos-latest` | Occasional CI, smallest setup | Most expensive (10x Linux minute multiplier) | [`shoki-github-hosted.yml`](.github/workflows/examples/shoki-github-hosted.yml) |

All four use the reusable [`shoki/setup-action`](.github/actions/setup/action.yml) composite
action which auto-detects the topology and applies the right setup. The pre-baked tart image
pipeline lives in [`infra/tart/`](infra/tart/).

See [`docs/background/release-setup.md`](docs/background/release-setup.md) § 6 for publishing the pre-baked tart images, and
[`infra/tart/README.md`](infra/tart/README.md) for building them locally.

## Getting involved

Shoki is MIT-licensed and we welcome contributors. If you want to help add a new screen reader driver, see [`docs/background/adding-a-driver.md`](docs/background/adding-a-driver.md).

For questions and design discussions, open an issue. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for dev setup and [`.github/CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md) for community standards.

## Documentation

Full docs live at the [Shoki docs site](https://shoki.github.io/shoki/) (built from [`docs/`](docs/) via VitePress). Key pages:

- [Getting Started → Install](https://shoki.github.io/shoki/getting-started/install)
- [Getting Started → Vitest quickstart](https://shoki.github.io/shoki/getting-started/vitest-quickstart)
- [Guides → Matchers](https://shoki.github.io/shoki/guides/matchers)
- [Guides → Migration from Guidepup](https://shoki.github.io/shoki/guides/migration-from-guidepup)
- [Background → Platform risk](https://shoki.github.io/shoki/background/platform-risk)

## License

[MIT](LICENSE)

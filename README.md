# Shoki

> Run real screen readers — VoiceOver, NVDA, and more — in any test framework and any CI environment.

**Status:** 🚧 Early development. v1 targets macOS + VoiceOver + Vitest browser mode. Not ready for production use.

## What is this?

Shoki lets you start a **real** screen reader from your existing test framework, capture everything it would have announced, and assert on that log. No simulators, no static checkers — the actual VoiceOver (and later NVDA, Orca) speaking through a test.

Think of it as a more ambitious [Guidepup](https://github.com/guidepup/guidepup) with first-class CI support and dramatically better DX.

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
│   @shoki/sdk (TS)    │   Public API surface
└──────────┬───────────┘
           │ N-API
┌──────────▼───────────┐
│   shoki.node (Zig)   │   Native core — 50ms VO poll loop, ring buffer, wire format
└──────────┬───────────┘
           │ XPC
┌──────────▼───────────┐
│   ShokiRunner.app    │   Signed helper — holds the stable TCC trust anchor
│   (Swift)            │
└──────────┬───────────┘
           │ AppleScript + AX notifications
┌──────────▼───────────┐
│   VoiceOver          │
└──────────────────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for the full story (signed-wrapper-app rationale, wire format spec, driver extensibility).

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

See `docs/release-setup.md` § 6 for publishing the pre-baked tart images, and
[`infra/tart/README.md`](infra/tart/README.md) for building them locally.

## Getting involved

Shoki is MIT-licensed and we welcome contributors. If you want to help add a new screen reader driver, see [`docs/adding-a-driver.md`](docs/adding-a-driver.md).

For questions and design discussions, open an issue.

## License

[MIT](LICENSE)

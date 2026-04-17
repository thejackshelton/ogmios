# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Documentation site at `docs/` (VitePress). Covers Getting Started, Guides,
  API reference, and Background pages. (Phase 6)
- Platform risk disclosure page documenting CVE-2025-43530 and the
  AX-notifications capture hedge. (Phase 6)
- Migration guide for users coming from Guidepup. (Phase 6)
- Matchers usage guide with runnable examples for all four matchers. (Phase 6)
- Shields.io badges in README (CI, npm, license, platform). (Phase 6)
- GitHub issue templates, PR template, code of conduct, security policy. (Phase 6)
- `.github/workflows/docs.yml` builds + deploys the docs site to GitHub Pages
  on push to main where `docs/**` changed. (Phase 6)

## [0.1.0] - 2026-04-17

First pre-alpha release. v1-scope foundations through CI are in place; the
public docs + release polish land in this release. Do not use in production.

### Added

#### Phase 1 — Foundations

- `@shoki/sdk` TypeScript package with `voiceOver()` factory and
  `ScreenReaderHandle` interface. Loads native binding via npm
  `optionalDependencies` (FOUND-01, FOUND-02).
- Zig 0.16+ core compiled to a platform-specific N-API `.node` addon via
  napi-zig. (FOUND-01)
- `@shoki/binding-darwin-arm64` and `@shoki/binding-darwin-x64` platform
  packages. (FOUND-02)
- Apple Developer ID signing of the ShokiRunner Swift helper (TCC trust
  anchor). `.node` addons inherit trust from Node. (FOUND-03, FOUND-04)
- `ShokiDriver` Zig vtable + `ScreenReaderHandle` TS interface factored such
  that new screen readers need only a new driver file + registry entry + new
  binding package. (EXT-01)

#### Phase 4 — Vitest Browser-Mode Integration

- `@shoki/matchers` package with four Vitest `expect` matchers:
  `toHaveAnnounced`, `toHaveAnnouncedText`, `toHaveNoAnnouncement`,
  `toHaveStableLog`. Works against both Node-side and browser-side event
  shapes. (VITEST-08)
- `@shoki/vitest` Vitest browser-mode plugin. Registers 10 BrowserCommands,
  auto-sets `poolOptions.threads.singleThread = true`, throws
  `ShokiConcurrentTestError` in VO-scoped files. (VITEST-01, 02, 03, 04, 06)
- Node-side `SessionStore` refcounts VoiceOver boots across test files.
  (VITEST-05)
- `examples/vitest-browser-react` canonical monorepo example — React 19 +
  Vite 6 + Vitest 3 browser-mode + Playwright. `SHOKI_INTEGRATION=1` gates
  the real-VO path. (VITEST-07)

#### Phase 5 — CI Story

- Pre-baked tart images published at `ghcr.io/shoki/macos-vo-ready:<macos>`
  for Sonoma / Sequoia / Tahoe. Built reproducibly from Packer + Ansible
  scripts in `infra/tart/`. (CI-01, CI-02)
- `shoki/setup-action` composite GitHub Action. Auto-detects runner topology
  and applies the right setup across self-hosted tart, Cirrus Runners,
  GetMac, and stock `macos-latest`. (CI-03)
- Reference workflows at `.github/workflows/examples/` for each of the four
  supported CI topologies. (CI-04)
- `kill-background-apps.sh` pre-job hook kills Slack, Discord, Teams, Mail,
  Calendar, system notification daemons. (CI-05)
- Cross-topology parity CI gate in `phase-5-parity.yml`. (CI-06)

### Known Gaps

- `@shoki/doctor` CLI is scaffolded but full diagnostics land in Phase 2.
- VoiceOver capture core (Phase 3) lands AppleScript + AX-notifications dual
  capture — the real-VO path depends on this.
- NVDA / Orca / iOS VoiceOver deferred to v1.1+.

### Documentation

- `docs/background/architecture.md` — load-bearing design decisions
- `docs/background/adding-a-driver.md` — extensibility walkthrough
- `docs/background/release-setup.md` — maintainer release setup
- `docs/background/platform-risk.md` — CVE-2025-43530 + hedge
- Full VitePress site with Getting Started, Guides, API, Background sections

### License

MIT. Contributions welcome — see `CONTRIBUTING.md` and
`.github/CODE_OF_CONDUCT.md`.

---

[Unreleased]: https://github.com/shoki/shoki/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/shoki/shoki/releases/tag/v0.1.0

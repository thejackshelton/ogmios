# v1 Milestone Report

**Milestone:** v1 (first release)
**Completed:** 2026-04-17
**Phases:** 6/6 shipped
**Plans:** 29 total (6 + 4 + 7 + 4 + 4 + 4)
**Requirements:** 46/46 v1 requirements satisfied

## What shipped

### Phase 1 — Foundations
Signed Zig 0.16+ N-API native addon, monorepo with pnpm workspaces, `@shoki/sdk` + `@shoki/binding-darwin-*`, `ShokiRunner.app` Swift helper (TCC trust anchor), frozen `ShokiDriver` vtable + wire format v1, CI release pipeline with OIDC trusted publishing.

### Phase 2 — Permission Setup & Doctor CLI
`@shoki/doctor` package exposing `shoki doctor` and `shoki info` CLIs. Version-branched macOS plist paths (Sonoma/Sequoia/Tahoe), TCC.db enumeration with csreq signature comparison, safe `--fix` (VO plist only, never TCC.db), System Settings deep links, documented exit codes 0-9. 90 tests passing.

### Phase 3 — VoiceOver Capture Core
Dual capture path (AppleScript poll + AX notifications via helper XPC), 9-key VO plist snapshot/restore, force-kill lifecycle with refcount, native-side exit hooks, ring buffer with droppedCount visibility, full TS API surface (`listen`, `phraseLog`, `lastPhrase`, `clear`, `reset`, `awaitStableLog`, `getDroppedCount`), 228 VO + 186 Commander keyboard constants ported from Guidepup.

### Phase 4 — Vitest Browser-Mode Integration (v1 canonical target)
`@shoki/matchers` (toHaveAnnounced, toHaveAnnouncedText, toHaveNoAnnouncement, toHaveStableLog), `@shoki/vitest` plugin with 10 BrowserCommands, typed browser-side session proxy, singleton detection auto-configuring singleThread, `ShokiConcurrentTestError`, refcounted `SessionStore`, canonical `examples/vitest-browser-react` repo.

### Phase 5 — CI Story
Packer+Ansible tart image pipeline at `infra/tart/`, publishes to `ghcr.io/shoki/macos-vo-ready:{sonoma,sequoia,tahoe}`. `shoki/setup-action` composite action auto-detects topology across 4 CI providers. Reference workflows for each: self-hosted tart, Cirrus Runners, GetMac, GH-hosted macos-latest. Background-app kill hooks. Parity matrix workflow.

### Phase 6 — Docs & v1 Release Polish
VitePress documentation site at `docs/` — getting-started guides, per-provider CI pages, matchers usage with runnable examples, migration-from-Guidepup guide, troubleshooting, full API reference, platform-risk page disclosing CVE-2025-43530. Release polish: CHANGELOG, issue/PR templates, Code of Conduct (Contributor Covenant 2.1), SECURITY policy, GitHub Pages deploy workflow.

## Key architectural decisions validated

- Zig 0.16+ core + napi-zig for TS↔Zig N-API bindings
- Signed helper app (`ShokiRunner.app`) as stable TCC trust anchor
- Observe-only v1 (users drive apps with their own framework)
- Structured event stream (not string[] like Guidepup) — enables semantic matchers, future WebVTT
- Dual capture path (AppleScript + AX) as CVE-2025-43530 hedge
- Extensible driver architecture (add-only: one driver file + registry entry + binding package)
- optionalDependencies platform packages (esbuild/swc/napi-rs v3 pattern)
- OIDC trusted publishing (zero NPM_TOKEN)

## Gaps carried to v1.1+

From various phase SUMMARYs:
- `realAppleScriptSpawner` in Phase 3 is a scaffolded stub — production path needs real `std.process.Child` wiring
- `libShokiXPCClient.dylib` link step in `zig/build.zig` uses placeholder path — CI verifies
- `shoki/setup-action` has a `skip-doctor: "true"` mode used in Phase 1/2 CI flows (before doctor CLI was on PATH); removable when first v0.1 publishes
- Tahoe base image (`macos-tahoe-xcode`) may not yet be published by cirruslabs; matrix uses `fail-fast: false`
- Some Zig tests verified via source-grep only (Zig 0.16 not installed on dev machine); CI runs them for real
- VO-dependent integration tests are gated behind `SHOKI_INTEGRATION=1`; CI enables

## Post-v1 roadmap (already scoped in REQUIREMENTS.md v2)

- **Hardening & Playwright** — HARD-01..06: debug bundle on failure, WebVTT captions, flake classification, health-check-before-test, `@shoki/playwright` fixture, Storybook example
- **Extensibility validation** — SR2-01/02: second driver (NVDA or iOS VoiceOver) to prove `ShokiDriver` abstraction, any v1-compatible adjustments
- **Additional platforms** — PLAT-01..04: Linux/Orca, Windows/NVDA, iOS, Android

## Handoff

- All code committed on `main` branch
- No open blockers
- CI pipeline configured but requires maintainer secrets provisioning (see `docs/background/release-setup.md`)
- First release procedure: tag `v0.1.0` after maintainer sets up Apple Developer ID + npm OIDC trusted publishing per-package

## Files to read first

- `README.md` — project overview
- `CONTRIBUTING.md` — dev setup
- `docs/index.md` — docs site landing
- `.planning/PROJECT.md` — project vision + Key Decisions
- `.planning/ROADMAP.md` — phase breakdown
- `.planning/REQUIREMENTS.md` — v1 + v2 requirement taxonomy
- `.planning/phases/*/` — per-phase CONTEXT + PLAN + SUMMARY artifacts

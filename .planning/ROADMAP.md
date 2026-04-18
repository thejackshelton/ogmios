# Roadmap: Shoki

## Overview

Shoki ships a Zig-core + TypeScript-SDK library that lets any test framework start a real screen reader (VoiceOver in v1), capture announcements as structured events, and assert on them — locally on a developer's Mac and in CI on multiple macOS runner topologies. The path to v1 is forced by hard dependencies: a signed Zig binary is the trust anchor for everything (Phase 1); a `shoki doctor` CLI must exist before any developer can run captures locally without becoming a sysadmin (Phase 2); the VoiceOver capture core with dual AppleScript + AX-notifications paths is the technical heart (Phase 3); the Vitest browser-mode integration is the canonical v1 success target (Phase 4); the CI story unlocks broad adoption across self-hosted tart, Cirrus, GetMac, and stock GH-hosted runners (Phase 5); and a documentation site with platform-risk disclosure ships v1 to its users (Phase 6). Hardening (debug bundles, Playwright adapter, WebVTT, flake taxonomy) and extensibility validation (a second screen reader to prove the driver abstraction) are explicitly post-v1 work — the v1 driver *interface* (EXT-01) is factored in Phase 1, but the second-driver implementation that proves it lives in v1.1+.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Signed Zig + napi-zig skeleton, OIDC publishing pipeline, driver interface factored
- [ ] **Phase 2: Permission Setup & Doctor CLI** - `shoki doctor` diagnoses and (where SIP permits) fixes VO/TCC state across macOS 14/15/26
- [ ] **Phase 3: VoiceOver Capture Core** - Zig driver with dual AppleScript + AX-notifications capture, lifecycle discipline, ring buffer, frozen wire format
- [ ] **Phase 4: Vitest Browser-Mode Integration** - `@shoki/vitest` plugin + matchers; v1 canonical success target ("if everything else fails, this must work")
- [ ] **Phase 5: CI Story** - Pre-baked tart image, `shoki/setup-action`, reference workflows for self-hosted/Cirrus/GetMac/GH-hosted
- [ ] **Phase 6: Docs & v1 Release Polish** - Documentation site, platform-risk page (CVE-2025-43530), migration-from-Guidepup, semantic matchers usage guide

## Phase Details

### Phase 1: Foundations
**Goal**: A signed, cross-compiled Zig native addon with a stable trust anchor and a frozen driver interface that downstream phases can build against
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, EXT-01
**Success Criteria** (what must be TRUE):
  1. A `@shoki/sdk` install on a fresh Mac loads a signed `@shoki/binding-darwin-arm64` (or `darwin-x64`) addon and a `binding.ping()` round-trip succeeds
  2. Every release binary published to npm is Apple Developer ID-signed (`codesign -dvvv` shows the cert) — no unsigned binaries ever ship
  3. Pushing a tag to the shoki repo triggers a GitHub Actions workflow that cross-compiles Zig 0.16+ for darwin-arm64 + darwin-x64 and publishes platform packages via OIDC trusted publishing (no `NPM_TOKEN` secret)
  4. The signed-wrapper-app architecture (which process holds the stable TCC trust anchor — Node vs `shoki-runner.app` vs the user's terminal) is decided, documented in PROJECT.md Key Decisions, and reflected in the binary layout
  5. The `ShokiDriver` Zig vtable + `ScreenReaderHandle` TS interface are factored such that a future `src/drivers/<name>/driver.zig` + one registry entry + one new platform binding package is the entire surface for adding a screen reader (no core/SDK/wire-format edits required)
**Plans**: 6 plans

Plans:
- [x] 01-01-PLAN.md — Repo scaffolding + pnpm workspaces (FOUND-02)
- [x] 01-02-PLAN.md — Zig core skeleton + napi-zig + ShokiDriver vtable + noop driver (FOUND-01, EXT-01)
- [ ] 01-03-PLAN.md — TypeScript SDK + binding loader + voiceOver stub + wire decoder (FOUND-01, FOUND-02, EXT-01)
- [x] 01-04-PLAN.md — ShokiRunner.app Swift helper + XPC scaffold + sign/notarize scripts (FOUND-03, FOUND-04)
- [ ] 01-05-PLAN.md — CI release pipeline + OIDC trusted publishing (FOUND-01, FOUND-03, FOUND-05)
- [ ] 01-06-PLAN.md — README + CONTRIBUTING + architecture.md + PROJECT.md decision log (FOUND-04)

### Phase 2: Permission Setup & Doctor CLI
**Goal**: A developer on any supported macOS can run `npx shoki doctor` and either pass cleanly or get a precise, actionable list of what's missing — without becoming a sysadmin
**Depends on**: Phase 1
**Requirements**: PERM-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06
**Success Criteria** (what must be TRUE):
  1. `shoki doctor` correctly reports VoiceOver-AppleScript-enabled state on macOS 14 (Sonoma), 15 (Sequoia, with Group Container plist path change), and 26 (Tahoe, with CVE-2025-43530 tightened access)
  2. `shoki doctor` enumerates current Accessibility + Automation TCC grants for the shoki trust anchor and flags stale/orphaned entries from prior signatures or renamed binaries
  3. `shoki doctor --fix` writes the VO AppleScript-enabled plist when SIP permits, and when SIP blocks the write, prints exact instructions plus a deep link to the correct System Settings pane
  4. `shoki doctor` exits with a documented non-zero exit code per failure class (missing-grant, signature-mismatch, OS-unsupported, SIP-required) so CI scripts can branch on the cause
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — @shoki/doctor package scaffolding + frozen DoctorReport/ExitCode contract + commander CLI wiring (no PERM reqs — scaffolding)
- [ ] 02-02-PLAN.md — macOS version + VO plist (14/15/26 version-branched) + helper discovery/signature + SIP status checks (PERM-01)
- [ ] 02-03-PLAN.md — TCC.db enumeration (user+system, read-only) + csreq compare + Accessibility/Automation/stale-entries checks (PERM-02, PERM-03)
- [ ] 02-04-PLAN.md — runDoctor orchestrator + fix-executor (plist write only, never TCC.db) + human/json/quiet reporters + info subcommand + integration test (PERM-04, PERM-05, PERM-06)

### Phase 3: VoiceOver Capture Core
**Goal**: A standalone Node script can boot VoiceOver, capture every announcement as a structured event via two independent paths, and stop cleanly without ever leaving the developer's Mac in a broken state
**Depends on**: Phase 1, Phase 2
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05, CAP-06, CAP-07, CAP-08, CAP-09, CAP-10, CAP-11, CAP-12, CAP-13, CAP-14, CAP-15, CAP-16
**Success Criteria** (what must be TRUE):
  1. A standalone Node script calls `voiceOver.start({ mute: true, speechRate: 90 })`, triggers a known announcement (e.g. via `say`), and `voiceOver.listen()` yields a structured event `{ phrase, ts, source, ... }` from both the AppleScript and AX-notifications capture paths
  2. After `voiceOver.stop()` (or any crash signal: `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection`), `pgrep -x VoiceOver` returns empty AND every one of the 9 snapshotted plist keys is restored to its pre-test value
  3. A test that emits 10,000+ announcements observes `droppedCount > 0` from the ring buffer rather than silent loss or OOM, and `voiceOver.lastPhrase()`, `voiceOver.phraseLog()`, `voiceOver.clear()`, `voiceOver.reset()`, and `voiceOver.awaitStableLog({ quietMs })` all behave per their documented contracts
  4. The Zig↔TS binary wire format is documented (versioned, length-prefixed, source-tagged) and frozen with a regression test that fails if any field width or ordering changes
  5. The VO keyboard command catalog (226 VO gestures + 129 Commander commands) is exported as TS constants that users can dispatch via their own framework's keyboard driver
**Plans**: 7 plans

Plans:
- [ ] 03-01-PLAN.md — VoiceOver plist snapshot/configure/restore (9 keys, Sonoma vs Sequoia+ path-branched) (CAP-02)
- [ ] 03-02-PLAN.md — AppleScript long-lived osascript shell + 50ms PollLoop + stall detection (CAP-04)
- [ ] 03-03-PLAN.md — VO lifecycle: boot/verify/stop/force-kill + refcount + native exit hooks (CAP-01, CAP-03, CAP-14)
- [ ] 03-04-PLAN.md — AX-notifications capture via ShokiRunner helper XPC + Zig XPC client (CAP-05, CAP-06)
- [ ] 03-05-PLAN.md — VoiceOverDriver vtable + registry entry + TS factory flip to 'voiceover' (CAP-01, CAP-07, CAP-15)
- [ ] 03-06-PLAN.md — TS SDK full surface: listen/phraseLog/lastPhrase/clear/reset/awaitStableLog + keyboard command catalog (CAP-08..13, CAP-16)
- [ ] 03-07-PLAN.md — Integration + stress + crash-recovery + wire-regression tests (CAP-15, ROADMAP SC-1..5)

### Phase 4: Vitest Browser-Mode Integration
**Goal**: The PROJECT.md canonical v1 success target — a Vitest browser-mode test calls `voiceOver.listen()`, drives a real web app via Playwright, and asserts on a structured VO event log with semantic matchers
**Depends on**: Phase 3
**Requirements**: VITEST-01, VITEST-02, VITEST-03, VITEST-04, VITEST-05, VITEST-06, VITEST-07, VITEST-08
**Success Criteria** (what must be TRUE):
  1. A user installs `@shoki/sdk`, `@shoki/vitest`, and `@shoki/matchers`, adds the plugin to `vitest.config.ts`, and writes a browser-mode test that drives a button click and asserts `expect(log).toHaveAnnounced({ role: 'button', name: 'Submit' })` — and it passes locally on a fresh Mac
  2. The plugin auto-configures `poolOptions.threads.singleThread = true` whenever a `voiceOver.*` import is in scope, and `test.concurrent` in a VO-scoped test fails fast with a precise error message rather than producing chaotic cross-test capture pollution
  3. Concurrent `voiceOver.start()` calls across multiple test files refcount cleanly: the first booted, the last killed, and per-test `voiceOver.reset()` keeps state clean between tests without a full VO restart
  4. Every Vitest `BrowserCommand` return payload (`shokiListen`, `shokiDrain`, `shokiStop`, `shokiClear`, `shokiReset`) is structured-clone-safe — plain objects, numeric timestamps, no Dates or Functions — and passes through tinyRPC without serialization errors
  5. A canonical example repo (`examples/vitest-browser-react`) lives in the shoki monorepo, runs green on `npm test` against a real React component, and ships as the documented quickstart
**UI hint**: yes
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — @shoki/matchers package: 4 Vitest expect matchers (toHaveAnnounced, toHaveAnnouncedText, toHaveNoAnnouncement, toHaveStableLog) (VITEST-08)
- [x] 04-02-PLAN.md — @shoki/vitest plugin: 10 BrowserCommands + browser-side voiceOver session proxy + singleton detection + structured-clone safety (VITEST-01, VITEST-02, VITEST-03, VITEST-04, VITEST-06)
- [x] 04-03-PLAN.md — Refcounted SessionStore bridging BrowserCommands to @shoki/sdk; per-test reset (VITEST-05)
- [x] 04-04-PLAN.md — examples/vitest-browser-react canonical repo with React 19 + Vite 6 + Vitest 3 browser-mode + Playwright; SHOKI_INTEGRATION=1 gates the real-VO path (VITEST-07)

### Phase 5: CI Story
**Goal**: A user copies one of four reference workflows, points it at their own repo, and shoki tests run identically green across self-hosted tart, Cirrus Runners, GetMac, and stock GH-hosted `macos-latest` — without per-provider hand-tweaking
**Depends on**: Phase 4
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05, CI-06
**Success Criteria** (what must be TRUE):
  1. A pre-baked tart image is published at `ghcr.io/shoki/macos-vo-ready:<macos>` with VO-AppleScript-enabled, Accessibility + Automation TCC grants pre-applied, and SIP off — and is reproducibly built from Packer + Ansible scripts that live in the shoki repo
  2. The `shoki/setup-action` GitHub Action prepares a runner for shoki tests across all four supported topologies (self-hosted tart, Cirrus Runners, GetMac, stock `macos-latest`) and reference `.github/workflows/` examples exist for each
  3. Pre/post-job hooks force-kill background announcement-emitting apps (Slack, Discord, Teams, Mail, Calendar, system notification daemons) so their output never leaks into shoki captures
  4. The Phase 4 `examples/vitest-browser-react` repo runs identically green on a developer's Mac, on stock GH-hosted `macos-latest`, and on a self-hosted tart-VM runner — same `npm test` command, same passing assertions
**Plans**: TBD

### Phase 6: Docs & v1 Release Polish
**Goal**: Public-facing v1 release with a documentation site that takes a new user from `npm install` to a passing CI test, with honest disclosure of the macOS-platform-risk surface shoki depends on
**Depends on**: Phase 5
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. A documentation site is live and covers: install, permission setup, Vitest quickstart, CI setup per provider (self-hosted tart, Cirrus, GetMac, GH-hosted), full API reference, and a troubleshooting guide that maps known errors (`AXError -25204`, ghost VO process, etc.) to fixes
  2. A platform-risk page openly documents CVE-2025-43530, Apple's macOS-26-tightening trajectory, and shoki's AX-notifications fallback as the long-term hedge
  3. The `@shoki/matchers` usage section shows a developer how to assert on structured event logs semantically (`toHaveAnnounced({ role, name })`, `toHaveAnnouncedText(pattern)`) with at least three runnable examples
  4. A migration-from-Guidepup page describes API differences (observe-only, structured events vs `string[]`, Vitest-first vs Playwright-first) with a concrete side-by-side test example
**UI hint**: yes
**Plans**: TBD

## Post-v1 (v1.1+) — Tracked, Not in v1 Roadmap

These map to v2 requirements in REQUIREMENTS.md and become roadmap phases after v1 ships. They are listed here so the post-v1 trajectory is visible from the v1 roadmap.

- **Hardening & Playwright** — `@shoki/playwright` fixture, debug bundle on failure (`.shoki/<test>/events.json` + WebVTT + screenshot), flake classification, health-check-before-test (HARD-01..06)
- **Extensibility Validation** — Implement a second driver (NVDA on Windows or iOS VoiceOver via XCUITest) to prove the `ShokiDriver` abstraction; any v1 API adjustments forced by the second driver land here without breaking the v1 contract (SR2-01, SR2-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 6/6 | ✅ Complete | 2026-04-17 |
| 2. Permission Setup & Doctor CLI | 4/4 | ✅ Complete | 2026-04-17 |
| 3. VoiceOver Capture Core | 7/7 | ✅ Complete | 2026-04-17 |
| 4. Vitest Browser-Mode Integration | 4/4 | ✅ Complete | 2026-04-17 |
| 5. CI Story | 4/4 | ✅ Complete | 2026-04-17 |
| 6. Docs & v1 Release Polish | 4/4 | ✅ Complete | 2026-04-17 |

### Phase 7: v1 integration verification and QA — real VoiceOver announcements in Vitest browser mode

**Goal:** Claude acts as a manual QA engineer. Autonomously prove the v1 stack works end-to-end: install Zig, build helper + Zig binding, run a Vitest browser-mode test that asserts on REAL VoiceOver announcements from actual DOM content (not Chrome URL bar), and guarantee VO settings restore on the developer's Mac. Produce a QA-REPORT.md that is copy-paste-able into a GitHub issue.
**Requirements**: N/A — verification phase, not new v1 requirement implementation. Verifies Phase 3 CAP-01..16, Phase 4 VITEST-01..08, Phase 6 DOCS-01..04, plus CONTEXT.md's 15-item verification checklist.
**Depends on:** Phase 6
**Plans:** 6 plans

Plans:
- [x] 07-01-PLAN.md — Toolchain + build verification (install Zig 0.16, zig build + test, swift build + test, helper .app, libShokiXPCClient.dylib, .node, playwright chromium, docs build) [Wave 1]
- [x] 07-02-PLAN.md — Close known stubs: realAppleScriptSpawner via std.process.Child + libShokiXPCClient.dylib link path in zig/build.zig [Wave 2]
- [x] 07-03-PLAN.md — API reshape: end() alias + top-level voiceOver.start/end singleton + cheap-reset test + docs update [Wave 2]
- [x] 07-04-PLAN.md — DOM-content-vs-URL-bar test: scope AX observer to Chromium renderer pid + paired positive/negative magic-marker tests [Wave 3]
- [x] 07-05-PLAN.md — Settings restore SIGKILL verification + shoki restore-vo-settings CLI escape hatch + permission-setup docs [Wave 2]
- [x] 07-06-PLAN.md — End-to-end verification + QA-REPORT.md with all 15 CONTEXT.md checklist items + human-verify checkpoint [Wave 4]

### Phase 8: Zig helper port + ShokiSetup.app GUI + package consolidation

**Goal:** Swift helper deleted end-to-end and replaced by a Zig-only `helper/` (build.zig, hand-written XPC + AX externs, main entry on CFRunLoopRun); new `ShokiSetup.app` Zig-compiled GUI bundle that triggers macOS Accessibility + Automation TCC prompts cleanly on first launch; packages consolidated from 7 to 4 (doctor + matchers merged into `@shoki/sdk`; docs out of the pnpm workspace). Every deliverable verified by running the tool (zig build, ./ShokiRunner --version, ./ShokiSetup --self-test, pnpm -r test, cd docs && pnpm build) — no source-grep-as-verification.
**Requirements**: N/A — refactor/port/consolidation phase; verifies CONTEXT.md's Verification Mandate and inherits Phase 7's YELLOW gate.
**Depends on:** Phase 7
**Plans:** 6 plans

Plans:
- [x] 08-01-PLAN.md — Helper Zig port Wave 1: build.zig skeleton + hand-written XPC externs + dispatcher with ping handler + unit tests (no Swift deletion yet; Swift coexists) [Wave 1]
- [x] 08-02-PLAN.md — Helper Zig port Wave 2: AX observer + CFRunLoop + main entry + Zig-built libShokiXPCClient.dylib + build-app-bundle.sh rewrite + DELETE all Swift (Package.swift, Sources/, Tests/) [Wave 2]
- [x] 08-03-PLAN.md — ShokiSetup.app: Zig + AppKit/Obj-C runtime externs + second executable target in helper/build.zig + --version/--self-test/--bogus flags + interactive flow that triggers AX + Automation TCC prompts + human-verify checkpoint [Wave 3]
- [x] 08-04-PLAN.md — CI integration: action.yml + ci.yml + release.yml updated to Zig-native, remove helper-test Swift job, add helper-smoke job that LAUNCHES both bundles, sign+notarize BOTH apps per architecture [Wave 4]
- [x] 08-05-PLAN.md — Package consolidation: doctor + matchers merged into @shoki/sdk (bin + exports['./cli'] + exports['./matchers']); @shoki/vitest owns expect.extend at /setup subpath; delete packages/doctor, packages/matchers; rewrite all imports across packages + examples [Wave 1 — orthogonal to helper work]
- [x] 08-06-PLAN.md — Docs out of pnpm workspace + standalone docs CI + 4-package-world doc sweep (install snippets, quickstarts, matcher/CLI pages) + CHANGELOG entry + final end-to-end verify + 08-SUMMARY.md [Wave 5]

### Phase 9: Qwik example + docs switch from React

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 9 to break down)

### Phase 10: CLI-driven Shoki.app distribution — shoki setup downloads from GitHub Releases, strips quarantine, installs to ~/Applications

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 9
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 10 to break down)

---
*Roadmap created: 2026-04-17*
*Granularity: standard (target 5-8 phases) — 6 phases derived from natural delivery boundaries; Phase 3 is requirement-dense (16 reqs) but cohesive and will be split into 3-4 plans during /gsd-plan-phase.*
*Phase 7 added 2026-04-17 as a post-Phase-6 verification phase (not in the original 6-phase v1 plan).*
*Phase 8 plans added 2026-04-17: Zig helper port + ShokiSetup.app + package consolidation (7→4) + docs out of workspace. Wave 1 parallelism: 08-01 and 08-05 are orthogonal and run in parallel; 08-05 does not depend on helper work at all.*

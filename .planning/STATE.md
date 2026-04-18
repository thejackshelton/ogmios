---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: verifying
stopped_at: Completed Phase 10 (CLI-driven Shoki.app distribution + 4→3 package consolidation)
last_updated: "2026-04-18T14:39:27.242Z"
last_activity: 2026-04-18
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 42
  completed_plans: 33
  percent: 79
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.
**Current focus:** Phase 1 (Foundations)

## Current Position

Phase: 1 of 6 (Foundations)
Plan: 6 of 6 in current phase
Status: Phase complete — ready for verification
Last activity: 2026-04-18 - Completed quick task 260418-lfz: Rename npm package @shoki/core -> dicta + CLI bin shoki -> dicta

Progress: [█░░░░░░░░░] 17%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: — (no data yet)

*Updated after each plan completion*
| Phase 01 P01 | 6 minutes | 2 tasks | 19 files |
| Phase 01-foundations P02 | 3.5 minutes | 3 tasks | 14 files |
| Phase 01-foundations P04 | ~4 minutes | 2 tasks | 11 files |
| Phase 04-vitest-browser-mode-integration P01 | 10m | 2 tasks | 14 files |
| Phase 04-vitest-browser-mode-integration P02 | 15m | 2 tasks | 27 files |
| Phase 04-vitest-browser-mode-integration P03 | 10m | 2 tasks | 17 files |
| Phase 04-vitest-browser-mode-integration P04 | 10m | 2 tasks | 17 files |
| Phase 07-v1-integration-verification-and-qa-real-voiceover-announceme P03 | 6 | 2 tasks | 9 files |
| Phase 07-v1-integration-verification-and-qa-real-voiceover-announceme P05 | 10m | 3 tasks | 9 files |
| Phase 07 P04 | 9 | 3 tasks | 10 files |
| Phase 07 P06 | 55m | 4 tasks | 2 files |
| Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation P05 | 8m | 2 tasks | 65 files |
| Phase 08 P02 | 35 minutes | 3 tasks | 13 files |
| Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation P04 | 9m | 7 tasks | 22 files |
| Phase 08 P06 | 13m | 4 tasks | 16 files |
| Phase 09 Pall | ~19min | 4 tasks | 27 files |
| Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from P01 | 10m | 2 tasks | 48 files |
| Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from P04 | 8m | 2 tasks | 5 files |
| Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from P02 | 7m | 2 tasks | 13 files |
| Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from P03 | 30m | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Init: Zig 0.16+ as the core language (single-language OS-integration story)
- Init: napi-zig (yuku-toolchain) for TS↔Zig N-API bindings
- Init: Dual capture path (AppleScript primary, AX notifications fallback) as a CVE-2025-43530 hedge
- Init: macOS + VoiceOver first, observe-only v1, Vitest browser mode as the canonical success target
- Init: Extensible driver architecture factored in v1 (EXT-01); second driver to prove it lives in v1.1+
- [Phase 01]: Biome config migrated from 2.0 to 2.4.12 schema (files.ignore -> files.includes with negation)
- [Phase 01-foundations]: napi-zig pinned to commit 4f05eea (main HEAD 2026-04-17); .hash placeholder in build.zig.zon resolved on first zig fetch
- [Phase 01-foundations]: ShokiDriver vtable frozen (EXT-01): 8 fields in exact CONTEXT.md D-10 order; Phase 3 drivers add-only via comptime registry
- [Phase 01-foundations]: WIRE_VERSION=1 frozen for Phase 1; regression test in wire_test.zig fails if field widths or ordering change
- [Phase 01-foundations]: ShokiRunner Swift package scaffolded with 3-module split (Protocol/Service/Runner); hardened-runtime entitlements gate only apple-events; Phase 1 XPC surface frozen to ping()
- [Phase 01-foundations]: Developer ID signing env-var contract established (APPLE_DEVELOPER_ID_APP/APPLE_ID/APPLE_TEAM_ID/APPLE_APP_SPECIFIC_PASSWORD); Plan 05 picks the keychain-import action
- [Phase 07-v1-integration-verification-and-qa-real-voiceover-announceme]: voiceOver is both a factory AND a namespace: Object.assign(voiceOverFactory, { start: startSingleton, end: endSingleton }) with explicit VoiceOverFn interface. Process-singleton refcounted — start() boots on first call, end() tears down on last call, end()-without-start is a no-op.
- [Phase 07-v1-integration-verification-and-qa-real-voiceover-announceme]: handle.stop() and handle.end() share one doStop closure in createDriverHandle so mock-call counts are symmetric across both names and there is no 'this'-binding footgun for destructured callers.
- [Phase 07-v1-integration-verification-and-qa-real-voiceover-announceme]: Plan 07-05: Snapshot file format is shoki-owned plist XML with _shoki_snapshot_{version,pid,ts_unix,domain} magic keys; 7-day TTL with --force override; file-I/O via libc to bypass Zig 0.16 std.Io.Dir churn
- [Phase 07]: Used AXUIElementCreateApplication(renderer_pid) + SHOKI_AX_TARGET_PID env var (zero wire-format impact) to scope AX observer to the Chromium renderer — filters URL-bar noise from the capture log
- [Phase 07]: Paired positive+negative DOM-vs-URL tests (gated on SHOKI_INTEGRATION=1 darwin) + Zig regression test pin the env-var wiring and the pgrep-last-line selection rule
- [Phase 07]: Phase 7 gate is YELLOW — 12/15 PASS, 2 BLOCKED on one-time macOS Automation TCC grant for terminal toward VoiceOver (no dialog fires in CLI-parent context)
- [Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation]: Plan 08-05: @shoki/sdk absorbs cli (bin.shoki -> dist/cli/main.js) + matchers (pure fns at /matchers subpath); @shoki/vitest absorbs expect.extend wiring at /setup subpath; CLI entry split from library entry to avoid parseAsync side-effects on library import; peerDep vitest (optional) + 'import type {} from vitest' anchor required for  under TS NodeNext + composite
- [Phase 08]: Defer XPC listener-mode block-ABI shim to Plan 04: libxpc dereferences handler via ObjC block ABI, crashes with plain C fn ptr. Plan 02 ships --version + dispatch_main parking as promised.
- [Phase 08]: Use named shared xpc_bindings module in helper/build.zig to cross Zig 0.16 module-subtree boundaries (mirrors zig/build.zig napi_zig pattern).
- [Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation]: Plan 08-04: launch-setup-app FixAction carries optional appPath=null; resolution happens at fix time in the executor, not at check time — keeps DoctorReport serializable and decouples check evaluation from filesystem I/O.
- [Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation]: Plan 08-04: Block-ABI shim written in C (xpc_block_shim.c, ~60 lines) + clang -fblocks rather than hand-rolling _NSConcreteStackBlock in Zig — clang owns the block ABI layout; Zig shim would break every Xcode bump. Both runner exe AND test module compile the C file.
- [Phase 08-zig-helper-port-shokisetup-app-gui-package-consolidation]: Plan 08-04: CI smoke runs both direct exe invocation AND open -W -n <.app> --args — the second form forces LaunchServices registration so malformed Info.plist fails CI the way a user double-click would.
- [Phase 08]: Plan 08-06: --ignore-workspace required for docs standalone install because docs/ is a sibling of the repo-root pnpm-workspace.yaml (pnpm walks up from cwd and treats docs as 'inside workspace but not a member')
- [Phase 09]: Hard-replaced examples/vitest-browser-react with vitest-browser-qwik to gain pre-hydration SSR a11y testing via renderSSR()
- [Phase 09]: Widened @shoki/vitest peer range to vitest ^3 || ^4; Qwik example runs Vitest 4, rest of monorepo stays on Vitest 3
- [Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from]: Plan 10-01: Renamed @shoki/sdk → shoki (unscoped), merged @shoki/vitest into shoki/vitest* subpaths; plugin detection needle + plugin.name updated to 'shoki/vitest(/browser)'; 3-package monorepo baseline (shoki + 2 platform bindings) for downstream Phase 10 plans
- [Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from]: Plan 10-04: Binding tarballs now ship only shoki.node + README + LICENSE; build-helper-app action removed from release.yml entirely (build-zig-binding installs Zig itself); CI assertion step guards against .app bundles ever leaking back into packages/binding-darwin-*
- [Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from]: Plan 10-02: runSetup is dependency-free at boundary (Node 24 fetch + crypto + fs/promises); execa dynamic-imported only in launch branch. xattr exit code 1 is a success (no quarantine xattr on fresh extract). compatibleAppVersion flat at package.json top level for jq-friendly CI reads. 25 new tests, 3 new source files, zero new runtime deps.
- [Phase 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from]: Plan 10-03: app-release.yml publishes shoki-darwin-{arm64,x64}.zip+.sha256 to GitHub Releases on app-v* tags; package-app-zip.sh uses staged-dir ditto (ditto -c rejects multi-source) to keep Shoki.app + Shoki Setup.app at archive root; build-app-bundle.sh gained --target for x64 cross-compile; secret gating via job-level env (step if: cannot reference secrets context)
- [Phase 10]: Renamed @shoki/sdk → shoki; collapsed @shoki/vitest into shoki/vitest subpaths; .apps moved out of npm tarballs onto GitHub Releases; new app-v* tag cadence independent from v* SDK cadence

### Roadmap Evolution

- Phase 11 added: Full rebrand Shoki/Dicta to Munadi — binaries, npm packages, CLI bin, state dir, env vars, plist keys, Zig source, infra, error class names, repo URL, all docs and prose, homepage Arabic etymology

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 has a research flag: signed-wrapper-app design spike (which process holds the stable TCC trust anchor — Node vs `shoki-runner.app` vs terminal). Resolve in `/gsd-plan-phase 1`.
- Phase 3 has a research flag: AX-notification event coverage on macOS 14/15/26 + wire-format freeze. Resolve in `/gsd-plan-phase 3`.
- Phase 5 has a research flag: per-provider tart YAML + slim-image target (<15 GB). Resolve in `/gsd-plan-phase 5`.
- Coverage discrepancy: REQUIREMENTS.md header says "42 total v1 requirements" but the actual count is 46 (5 FOUND + 6 PERM + 16 CAP + 8 VITEST + 6 CI + 4 DOCS + 1 EXT). Header should be corrected on next REQUIREMENTS.md edit.
- Wave 2 parallel-agent git contamination: Plan 02's agent used git add -A and swept Plan 04's Task 2 files into commit 40c4463. Net content correct, attribution wrong. Suggest enforcing no-git-add-A rule or using worktrees in future parallel waves.
- Items 13/14 of CONTEXT.md checklist BLOCKED on Automation TCC grant (terminal to VoiceOver); see QA-REPORT.md § Unblockers Step 1

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260417-wl1 | Style VitePress docs with ear-image palette (#092036/#fc8277) + hero swap | 2026-04-18 | 740d3de | [260417-wl1-style-vitepress-docs-with-ear-image-pale](./quick/260417-wl1-style-vitepress-docs-with-ear-image-pale/) |
| 260418-f0a | Rename npm package shoki -> @shoki/core (npm anti-typosquatting workaround) | 2026-04-18 | a229e8a | [260418-f0a-rename-to-shoki-core](./quick/260418-f0a-rename-to-shoki-core/) |
| 260418-lfz | Rename npm package @shoki/core -> dicta + CLI bin shoki -> dicta (third pivot; @shoki org creation denied) | 2026-04-18 | c162962 | [260418-lfz-rename-to-dicta](./quick/260418-lfz-rename-to-dicta/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-04-18T14:39:27.205Z
Stopped at: Completed Phase 10 (CLI-driven Shoki.app distribution + 4→3 package consolidation)
Resume file: None

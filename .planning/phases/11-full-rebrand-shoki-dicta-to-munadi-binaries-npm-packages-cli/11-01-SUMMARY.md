---
phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
plan: 01
subsystem: testing
tags: [rename, rebrand, typescript, vitest, cli, commander, npm-package]

# Dependency graph
requires:
  - phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
    provides: shoki/dicta SDK surface that this plan renames to munadi
  - phase: 11-P02
    provides: "@munadi/binding-darwin-arm64 workspace package (landed before Plan 01's install step)"
provides:
  - SDK npm package renamed dicta -> munadi (packages/sdk/package.json)
  - CLI bin command dicta -> munadi (bin.munadi = dist/cli/main.js)
  - TS error taxonomy: Shoki*Error classes -> Munadi*Error (5 classes: Error, ConcurrentTestError, PlatformUnsupportedError, BindingNotAvailableError, SessionNotFoundError)
  - TS data/type taxonomy: ShokiEvent, ShokiEventSource, ShokiDriver, ShokiSdkDriver, ShokiCommands, ShokiRpc, ShokiBrowserSession, ShokiVitestPluginOptions, ShokiExpectMatchers, ShokiAsymmetricMatchers, ShokiSessionRef, WireShokiEvent, Shoki*Args/Result/Deps/Handler (10 commands × 4 = 40 identifiers) -> Munadi* equivalents
  - Factory: shokiVitest() -> munadiVitest(); plugin name/needle/warning dicta/vitest(/browser) -> munadi/vitest(/browser)
  - Env vars (JS side): SHOKI_HELPER_PATH, SHOKI_AX_TARGET_PID, SHOKI_INTEGRATION, SHOKI_SNAPSHOT_PATH, SHOKI_NATIVE_BUILT, SHOKI_SETUP_APP_PATH -> MUNADI_* (Zig side lands in Plan 03)
  - Snapshot plist keys: _shoki_snapshot_{version,domain,ts_unix,pid} -> _munadi_snapshot_*; __SHOKI_MISSING__ -> __MUNADI_MISSING__
  - State dir default: ~/.shoki/ -> ~/.munadi/ in DEFAULT_SNAPSHOT_PATH
  - Helper app filename references: ShokiRunner.app/ShokiSetup.app/Shoki.app/Shoki Setup.app -> MunadiRunner.app/MunadiSetup.app/Munadi.app/Munadi Setup.app
  - Bundle IDs: com.shoki.runner/org.shoki.runner -> org.munadi.runner; app.shoki.setup/org.shoki.setup -> org.munadi.setup
  - GitHub URLs: github.com/shoki/shoki -> github.com/thejackshelton/munadi
  - Artifact filenames: shoki-darwin-*.zip -> munadi-darwin-*.zip
  - Command-handler file names: packages/sdk/src/vitest/commands/shoki-*.ts -> munadi-*.ts (10 files via git mv)
affects:
  - "Plan 03 (Zig core): must flip process.getenv('MUNADI_AX_TARGET_PID') side + plist snapshot writer to match"
  - "Plan 04 (helper): bundle IDs org.munadi.runner/setup + MunadiRunner/MunadiSetup executable names"
  - "Plan 05 (infra): tart TCC grants target org.munadi.runner/setup"
  - "Plan 06 (docs+examples): examples/vitest-browser-qwik imports munadi; docs prose/snippets flip dicta -> munadi"
  - "Plan 07 (publish): npm publish targets munadi; deprecate dicta@0.1.0 pointer"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mechanical rename via batched sed across packages/sdk/{src,test}/**/*.ts with per-identifier substitution tables"
    - "git mv for file renames to preserve history (10 command files + 3 fixture zip/sha files)"
    - "Snapshot regeneration path: delete .snap file -> vitest writes it back with new identifiers (avoids sed-based .snap edits that can desync from source strings)"
    - "Sentinel string __MUNADI_MISSING__ in plist snapshot format (TS side written here; Zig writer flipped in Plan 03 — both must land in Wave 1)"

key-files:
  created:
    - packages/sdk/src/vitest/commands/munadi-start.ts (renamed from shoki-start.ts)
    - packages/sdk/src/vitest/commands/munadi-stop.ts
    - packages/sdk/src/vitest/commands/munadi-listen.ts
    - packages/sdk/src/vitest/commands/munadi-drain.ts
    - packages/sdk/src/vitest/commands/munadi-phrase-log.ts
    - packages/sdk/src/vitest/commands/munadi-last-phrase.ts
    - packages/sdk/src/vitest/commands/munadi-clear.ts
    - packages/sdk/src/vitest/commands/munadi-reset.ts
    - packages/sdk/src/vitest/commands/munadi-await-stable.ts
    - packages/sdk/src/vitest/commands/munadi-get-dropped-count.ts
    - packages/sdk/test/fixtures/setup/munadi-darwin-arm64.zip (renamed)
    - packages/sdk/test/fixtures/setup/munadi-darwin-arm64.tampered.zip (renamed)
    - packages/sdk/test/fixtures/setup/munadi-darwin-arm64.zip.sha256 (renamed)
  modified:
    - packages/sdk/package.json (name, bin, description, repository.url, optionalDependencies)
    - packages/sdk/src/errors.ts (MunadiError base)
    - packages/sdk/src/vitest/errors.ts (all 4 Munadi*Error subclasses)
    - packages/sdk/src/vitest/plugin.ts (IMPORT_NEEDLE, plugin name, factory, warning prefix)
    - packages/sdk/src/vitest/session-store.ts (MUNADI_AX_TARGET_PID env var)
    - packages/sdk/src/vitest/browser.ts (MunadiRpc proxy, MunadiBrowserSession interface)
    - packages/sdk/src/vitest/commands/index.ts (handler names shokiStart -> munadiStart + imports repointed to munadi-*.js)
    - packages/sdk/src/vitest/command-types.ts (all Munadi*Args/Result types)
    - packages/sdk/src/cli/main.ts (.name('munadi'), help text, reporter flag help)
    - packages/sdk/src/cli/reporters/human.ts + quiet.ts (munadi doctor / munadi-doctor prefixes)
    - packages/sdk/src/cli/errors.ts + checks/tcc-grants.ts + checks/helper-discovery.ts + checks/helper-signature.ts + setup-app-path.ts + setup-command.ts + setup-download.ts + setup-install.ts + fix-executor.ts + restore-vo-settings.ts (full CLI sweep)
    - examples/vitest-browser-qwik/package.json (workspace fix: "dicta" -> "munadi" dep name; Plan 06 owns the rest of examples/)
    - packages/sdk/test/**/*.ts (37 test files + fixtures + 1 regenerated snapshot)

key-decisions:
  - "Normalized helper bundle IDs to org.munadi.{runner,setup} — CONTEXT.md proposed app.munadi.setup + com.munadi.runner mixing namespaces; existing Info.plist convention is org.shoki.* so org.munadi.* keeps the pattern. Plan 04 must match."
  - "Kept command-handler file names flipped to munadi-*.ts this plan (not deferred). Plan file rename via git mv + commands/index.ts import repointing landed in a single commit so history is preserved and downstream branches cannot miss the rename."
  - "Snapshot-regen strategy: delete human.test.ts.snap and let vitest rewrite it. Prevents sed-desync between source strings and snapshot expectations. The regenerated file contains only munadi identifiers — verified by grep."
  - "Workspace-resolution fix (examples/vitest-browser-qwik/package.json 'dicta' -> 'munadi' dep name) applied here as a Rule 3 deviation. Plan 06 owns the rest of examples/ (imports, ambient module names, READMEs, vitest.config). Without this minimal fix, pnpm install fails in Wave 1 parallel execution because workspace dep resolution validates across all workspace members regardless of --filter."

patterns-established:
  - "Batched sed substitution tables for mechanical renames across a TS package — 58 src files + 37 test files rewritten in deterministic order (error-class names -> type names -> per-command types -> camelCase identifiers -> env vars + error codes -> plist keys -> app filenames -> bundle IDs -> state-dir paths -> URLs -> dicta string literals -> prose sweep)"
  - "Stub tracking N/A this plan — pure rename, zero new wiring/data sources"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-04-18
---

# Phase 11 Plan 01: SDK Rename dicta -> munadi Summary

**Full rebrand of packages/sdk TypeScript surface, CLI bin, error taxonomy, Vitest plugin, env vars, and helper references from dicta/Shoki to munadi; 95 files touched across 2 atomic commits; `pnpm --filter munadi test` green (242 passed, 13 integration-skipped).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-18T15:02:00Z (approximate)
- **Completed:** 2026-04-18T15:22:00Z (approximate)
- **Tasks:** 2
- **Files modified:** 99 (61 SDK src + 37 SDK test + 1 examples workspace-fix)

## Accomplishments

- SDK package name is now `munadi` and CLI bin is now `munadi` (users type `munadi doctor`, `npx munadi setup`)
- All 5 user-visible error classes renamed (MunadiError, MunadiConcurrentTestError, MunadiPlatformUnsupportedError, MunadiBindingNotAvailableError, MunadiSessionNotFoundError) with matching `code` constants `ERR_MUNADI_*`
- All Vitest BrowserCommand handler names flipped (shokiStart -> munadiStart ×10) + browser-side RPC proxy mirrors them + 10 command source files renamed via git mv so history is preserved
- Plugin auto-detection needle is `munadi/vitest/browser` — consumer imports still trigger `poolOptions.threads.singleThread = true`
- Env-var JS side flipped (MUNADI_AX_TARGET_PID, MUNADI_HELPER_PATH, MUNADI_INTEGRATION, MUNADI_SNAPSHOT_PATH, MUNADI_NATIVE_BUILT, MUNADI_SETUP_APP_PATH) — Plan 03 must flip the Zig side for the integration harness to keep working
- Plist snapshot keys _munadi_snapshot_{version,domain,ts_unix,pid} — TS reader ready for Plan 03's renamed writer
- 242 unit tests pass end-to-end; the 1 regenerated snapshot (human.test.ts.snap) is clean (munadi-only)

## Task Commits

1. **Task 1: Rename TS surface, plugin, CLI, error classes, env vars across packages/sdk/src/\*\*** — `316d428` (refactor)
2. **Task 2: Update SDK tests + fixtures to match new identifiers, run full test suite** — `8f90a16` (test)

## Files Created/Modified

### packages/sdk/package.json
- `"name"`: dicta -> munadi
- `"bin"`: { "dicta": "dist/cli/main.js" } -> { "munadi": "dist/cli/main.js" }
- `"description"`: sweep Shoki -> Munadi
- `"repository.url"`: git+https://github.com/shoki/shoki.git -> git+https://github.com/thejackshelton/munadi.git
- `"optionalDependencies"`: @shoki/binding-darwin-arm64 -> @munadi/binding-darwin-arm64

### packages/sdk/src/ (61 files)
- errors.ts, voice-over.ts — MunadiError base + VoiceOverUnsupportedPlatformError kept (no-prefix)
- vitest/errors.ts — 4 Munadi*Error subclasses (ConcurrentTest, PlatformUnsupported, SessionNotFound, BindingNotAvailable) with ERR_MUNADI_* codes
- vitest/plugin.ts — IMPORT_NEEDLE='munadi/vitest/browser', plugin name='munadi/vitest', warning '[munadi/vitest]', factory munadiVitest(), interface MunadiVitestPluginOptions
- vitest/session-store.ts — process.env.MUNADI_AX_TARGET_PID set before handle boot; sessionId template `munadi-${counter}`
- vitest/browser.ts — MunadiRpc + MunadiBrowserSession types; handler RPC names shokiStart -> munadiStart
- vitest/commands/index.ts — imports repointed to `./munadi-*.js`; registration names `munadiStart`/`munadiDrain`/etc
- vitest/commands/munadi-*.ts (10 files) — renamed via git mv from shoki-*.ts
- vitest/command-types.ts — Munadi*Args/Result/SessionRef + WireMunadiEvent
- cli/main.ts — `.name('munadi')`; `info` prints `munadi v${pkg.version}`; help text sweep; option `--helper-path` description mentions MUNADI_HELPER_PATH + MunadiRunner.app; `restore-vo-settings` description says "written by munadi"
- cli/errors.ts — DoctorError prose: `munadi/cli` / `munadi doctor` / "munadi" / "Install munadi ..."
- cli/reporters/human.ts + quiet.ts — `munadi doctor` heading, `munadi-doctor` quiet prefix, "munadi is ready on this machine"
- cli/checks/tcc-grants.ts — TCC client allowlist entry `org.munadi.runner`; stale-entry error strings reference MunadiRunner
- cli/checks/helper-discovery.ts + helper-signature.ts — MunadiRunner.app path resolution + signature summary strings
- cli/setup-app-path.ts + setup-command.ts + setup-download.ts + setup-install.ts + fix-executor.ts — MunadiSetup.app/MunadiRunner.app paths, munadi-darwin-*.zip artifact URLs, github.com/thejackshelton/munadi release base URL, MUNADI_SETUP_APP_PATH env var
- cli/restore-vo-settings.ts — DEFAULT_SNAPSHOT_PATH = ~/.munadi/vo-snapshot.plist; MUNADI_KEYS constant; __MUNADI_MISSING__ sentinel; _munadi_snapshot_{version,domain,ts_unix} regex extraction
- matchers/types.ts + matchers.ts + fixtures.ts — MunadiExpectMatchers, MunadiAsymmetricMatchers, MunadiEvent throughout; _munadiAssertionT/_munadiMatchersT augmentation markers
- native-types.ts — supported-platform table @munadi/binding-{darwin-arm64,darwin-x64}
- binding-loader.ts + index.ts + screen-reader.ts + driver-handle.ts + handle-internals.ts + listen.ts + wire.ts + commander-commands.ts + voice-over.ts — MunadiEvent/MunadiError exports + prose sweep

### packages/sdk/test/ (37 files)
- test/vitest/plugin.test.ts — plugin name assertion munadi/vitest
- test/vitest/singleton-detection.test.ts — needle + warning-prefix assertions
- test/vitest/commands.test.ts — munadiStart returns sessionId: "munadi-1"; munadiDrain/Stop/Listen/etc
- test/vitest/session-store.test.ts — id1="munadi-1"/id2="munadi-2"; MUNADI_AX_TARGET_PID assertions
- test/vitest/structured-clone-safety.test.ts — MunadiConcurrentTestError assertions; ERR_MUNADI_*
- test/vitest/fixtures/has-import/test.ts + opt-out/test.ts — imports from 'munadi/vitest/browser'
- test/cli/integration/cli-smoke.test.ts — /munadi v/ pattern; /^munadi-doctor/ prefix
- test/cli/reporters/human.test.ts + __snapshots__/human.test.ts.snap — snapshot regenerated cleanly (2 written)
- test/cli/helper-discovery.test.ts + helper-signature.test.ts + tcc-grants.test.ts — MunadiRunner.app/MunadiSetup.app paths; org.munadi.runner/setup bundle IDs
- test/cli/setup-download.test.ts + setup-install.test.ts + setup-command.test.ts + setup.test.ts — munadi-darwin-arm64.zip expected paths; github.com/thejackshelton/munadi URLs; MUNADI_SETUP_APP_PATH; mkdtemp prefixes `munadi-*-`
- test/cli/restore-vo-settings.test.ts — MUNADI_SNAPSHOT_PATH env + `munadi-restore-test-` tmp prefix + `munadi restore-vo-settings` prose
- test/cli/fixtures/tcc-rows.ts + codesign-output.ts — bundle IDs org.munadi.runner / org.munadi.setup
- test/matchers/to-have-announced.test.ts + text/no-announcement/stable-log — MunadiEvent array type assertions
- test/integration/voice-over.integration.test.ts + restore-on-sigkill.integration.test.ts + stress.test.ts + crash-recovery.test.ts — MUNADI_INTEGRATION/MUNADI_NATIVE_BUILT/MUNADI_SNAPSHOT_PATH gating
- test/fixtures/sigkill-child.ts — MUNADI_SNAPSHOT_PATH + ~/.munadi/ prose
- test/fixtures/setup/Info.plist — bundle ID org.munadi.fixture; CFBundleName "Munadi Fixture"
- test/fixtures/setup/build-fixtures.sh — _staging/Munadi.app/Contents/MacOS/Munadi binary path; org.munadi.fixture Info.plist builder
- test/fixtures/setup/munadi-darwin-arm64.zip + .tampered.zip + .zip.sha256 — git mv from shoki-* (binary content unchanged; sha256 still valid because fixture archive bytes are identical)
- test/ping.test.ts + binding-loader.test.ts + noop-roundtrip.test.ts + listen.test.ts + phrase-log.test.ts + await-stable-log.test.ts + stress.test.ts + crash-recovery.test.ts + keyboard-commands.test.ts + voice-over.test.ts + wire.test.ts + wire-regression.test.ts — MunadiEvent/MunadiError references

### examples/vitest-browser-qwik/package.json
- `dependencies.dicta: "workspace:*"` -> `dependencies.munadi: "workspace:*"` (Rule 3 deviation — minimal workspace unblock; Plan 06 owns the rest of examples/)

### pnpm-lock.yaml
- Regenerated against new package name `munadi` and workspace dep fix

## Decisions Made

- **Normalized helper bundle IDs to org.munadi.{runner,setup}.** CONTEXT.md proposed mixing `app.munadi.setup` + `com.munadi.runner`; existing Info.plist convention is `org.shoki.*` so `org.munadi.*` keeps the pattern consistent. Plan 04 must match these exact bundle IDs.
- **Committed command-handler file renames in Task 1 (not deferred).** Plan's STEP K said file rename is deferred to Plan 06 then corrected itself to "no deferral, rename via git mv". Executed inline so `commands/index.ts` imports stay in sync and history is preserved. Both file rename + import flip in commit 316d428.
- **Delete + regenerate snapshot over sed-editing snapshot files.** `human.test.ts.snap` contained 10+ `shoki`/`dicta` identifiers that mirrored source strings. Delete + vitest write regenerates with zero risk of desync. Json snapshot had no shoki/dicta refs, left alone.
- **Kept `VoiceOverUnsupportedPlatformError` unprefixed** (matches plan's "already non-prefixed — keep" directive).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed examples/vitest-browser-qwik workspace dependency name**
- **Found during:** Task 1 (pnpm install from repo root)
- **Issue:** `pnpm install` failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` because `examples/vitest-browser-qwik/package.json` still references `"dicta": "workspace:*"` but this plan renames the workspace package to `munadi`. Plan 06 owns the rest of examples/, but pnpm's workspace validator scans ALL workspace members — `--filter munadi` does not bypass the cross-package dep check.
- **Fix:** Minimal edit: `dependencies.dicta` -> `dependencies.munadi` in examples/vitest-browser-qwik/package.json. No other examples/* files touched. Plan 06 owns imports, ambient module names, and prose.
- **Files modified:** examples/vitest-browser-qwik/package.json
- **Verification:** `pnpm install --no-frozen-lockfile` now succeeds; workspace resolution finds `munadi` package at packages/sdk.
- **Committed in:** 316d428 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Included plist snapshot key renames in Task 1 sweep**
- **Found during:** Task 1 (restore-vo-settings.ts rewrite)
- **Issue:** Plan's explicit substitution table covered env vars but not plist keys. CONTEXT.md Decisions locks `_shoki_snapshot_*` -> `_munadi_snapshot_*` and `__SHOKI_MISSING__` -> `__MUNADI_MISSING__`. Without flipping these on the TS reader side, the Plan 03 Zig writer (which WILL write `_munadi_snapshot_*` this wave) will produce files that the TS restore-vo-settings logic rejects as "SNAPSHOT_UNRECOGNIZED".
- **Fix:** Applied the rename to every plist key regex + sentinel constant in restore-vo-settings.ts and matching test fixtures/assertions.
- **Files modified:** packages/sdk/src/cli/restore-vo-settings.ts + packages/sdk/src/cli/main.ts (dry-run regex) + test files that assert snapshot-file contents.
- **Verification:** `pnpm --filter munadi test` all green including restore-vo-settings unit tests (7/7).
- **Committed in:** 316d428 + 8f90a16.

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 2 missing critical)
**Impact on plan:** Both deviations necessary to ship a working Wave 1 merge. No scope creep — the examples/ edit is a single line dep-name fix; plist-key flip is explicit CONTEXT.md-locked work that the plan's table forgot to enumerate.

## Issues Encountered

- `pnpm install` workspace validation blocked initial test runs — resolved via the Rule 3 deviation above.
- macOS sed does not support `\b` word boundaries. Worked around by listing explicit substitutions for borderline cases (e.g., `Shoki session` vs `Shoki itself`) rather than using boundary anchors.

## User Setup Required

None — pure rename, no new services or env vars to configure on the user's machine.

## Next Phase Readiness

- **Ready:** Plans 03, 04, 05, 06, 07 can now reference `munadi` identifiers in their own scopes without conflicting with the SDK.
- **Blocker for Plan 03:** Must flip `getenv("SHOKI_AX_TARGET_PID")` -> `getenv("MUNADI_AX_TARGET_PID")` in Zig, and write `_munadi_snapshot_*` keys + `__MUNADI_MISSING__` sentinel in the plist snapshot writer. Integration tests that gate on `MUNADI_INTEGRATION=1` will fail until both sides agree.
- **Blocker for Plan 04:** Helper Info.plist files must ship bundle IDs `org.munadi.runner` / `org.munadi.setup`, and the built .app bundles must be named `MunadiRunner.app` / `MunadiSetup.app` to match the TS side's path expectations.
- **Blocker for Plan 06:** Full examples/vitest-browser-qwik rewrite (imports, ambient module names, READMEs, vitest.config) — Plan 01 only did the workspace dep-name fix.

## Self-Check: PASSED

Verified commits exist and plan artifacts are present:
- Task 1 commit `316d428` found in git log
- Task 2 commit `8f90a16` found in git log
- packages/sdk/package.json → "munadi" (verified via jq)
- packages/sdk/src/vitest/plugin.ts → contains `munadi/vitest/browser` and `munadiVitest`
- packages/sdk/src/errors.ts → contains `MunadiError`
- packages/sdk/src/vitest/errors.ts → contains `MunadiConcurrentTestError`
- packages/sdk/src/vitest/session-store.ts → contains `MUNADI_AX_TARGET_PID`
- packages/sdk/test/fixtures/setup/munadi-darwin-arm64.zip.sha256 exists; shoki-darwin-arm64.zip.sha256 does not
- 10 command files renamed: packages/sdk/src/vitest/commands/munadi-{start,stop,listen,drain,phrase-log,last-phrase,clear,reset,await-stable,get-dropped-count}.ts
- pnpm --filter munadi build|typecheck|test all exit 0 (242 tests passed, 13 skipped integration)

---
*Phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli*
*Completed: 2026-04-18*

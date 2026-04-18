---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 01
subsystem: sdk
tags: [rename, rebrand, typescript, vitest, cli, commander, npm-package]

# Dependency graph
requires:
  - phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
    provides: "Munadi SDK surface that this plan flips to Ogmios"
provides:
  - "SDK npm package renamed munadi -> ogmios (packages/sdk/package.json)"
  - "CLI bin command munadi -> ogmios (bin.ogmios = dist/cli/main.js)"
  - "TS error taxonomy: Munadi*Error classes -> Ogmios*Error (5 classes: Error, ConcurrentTestError, PlatformUnsupportedError, BindingNotAvailableError, SessionNotFoundError)"
  - "TS data/type taxonomy: MunadiEvent -> OgmiosEvent, MunadiDriver -> OgmiosDriver, MunadiSdkDriver, MunadiCommands, MunadiRpc, MunadiBrowserSession, MunadiVitestPluginOptions, MunadiExpectMatchers, MunadiAsymmetricMatchers, MunadiSessionRef, WireMunadiEvent, Munadi*Args/Result/Deps/Handler (10 commands x 4 = 40 identifiers) -> Ogmios* equivalents"
  - "Factory: munadiVitest() -> ogmiosVitest(); plugin name/needle/warning munadi/vitest(/browser) -> ogmios/vitest(/browser)"
  - "Env vars (JS side): MUNADI_HELPER_PATH, MUNADI_AX_TARGET_PID, MUNADI_INTEGRATION, MUNADI_SNAPSHOT_PATH, MUNADI_NATIVE_BUILT, MUNADI_SETUP_APP_PATH -> OGMIOS_* (Zig side still on Munadi until Plan 12-04)"
  - "Snapshot plist keys: _munadi_snapshot_{version,domain,ts_unix,pid} -> _ogmios_snapshot_*; __MUNADI_MISSING__ -> __OGMIOS_MISSING__"
  - "State dir default: ~/.munadi/ -> ~/.ogmios/ in DEFAULT_SNAPSHOT_PATH"
  - "Helper app filename references: MunadiRunner.app/MunadiSetup.app -> OgmiosRunner.app/OgmiosSetup.app"
  - "Bundle IDs: org.munadi.runner/setup -> org.ogmios.runner/setup"
  - "GitHub URLs: github.com/thejackshelton/munadi -> github.com/thejackshelton/ogmios"
  - "Artifact filenames: munadi-darwin-*.zip -> ogmios-darwin-*.zip"
  - "Command-handler file names: packages/sdk/src/vitest/commands/munadi-*.ts -> ogmios-*.ts (10 files via git mv)"
  - "Binding package names flipped (Rule 3 unblock): @munadi/binding-{darwin-arm64,darwin-x64} -> @ogmios/binding-* (name + description + repo URL only; .node filename stays munadi.node until Plan 12-04)"
affects:
  - "Plan 12-02 (binding packages): .node filename + README/LICENSE + publish config"
  - "Plan 12-03 (helper): Info.plist + Zig sources + scripts + bundle IDs + executable names"
  - "Plan 12-04 (Zig core): build.zig + build.zig.zon + sources + .node filename + binding-package main field"
  - "Plan 12-05 (infra): tart image names + Ansible vars + scripts"
  - "Plan 12-06 (CLI Shoki residual cleanup): helper-*.ts / setup-*.ts Shoki*.app / org.shoki.* / ~/.shoki/ tokens"
  - "Plan 12-07 (CI): .github/workflows + actions references to libshoki.dylib / shoki.node / munadi-darwin-*.zip"
  - "Plan 12-08 (examples): examples/vitest-browser-qwik imports + ambient types + README + vitest.config"
  - "Plan 12-09 (docs/prose): README + CHANGELOG + CLAUDE.md + docs/**"
  - "Plan 12-10 (release): npm publish ogmios + deprecate dicta/munadi"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batched sed substitution tables for mechanical renames across a TS package (ordered: longer/more-specific patterns first to avoid partial overwrites). Applied to 51 src/**/*.ts + 35 test/**/*.ts in two commits."
    - "git mv for file renames preserves history (10 command files + 3 fixture zip/sha files)"
    - "Snapshot regeneration path: delete .snap file -> vitest writes it back with new identifiers (avoids sed-based .snap edits that can desync from source strings)"

key-files:
  created:
    - packages/sdk/src/vitest/commands/ogmios-start.ts (renamed from munadi-start.ts)
    - packages/sdk/src/vitest/commands/ogmios-stop.ts
    - packages/sdk/src/vitest/commands/ogmios-listen.ts
    - packages/sdk/src/vitest/commands/ogmios-drain.ts
    - packages/sdk/src/vitest/commands/ogmios-phrase-log.ts
    - packages/sdk/src/vitest/commands/ogmios-last-phrase.ts
    - packages/sdk/src/vitest/commands/ogmios-clear.ts
    - packages/sdk/src/vitest/commands/ogmios-reset.ts
    - packages/sdk/src/vitest/commands/ogmios-await-stable.ts
    - packages/sdk/src/vitest/commands/ogmios-get-dropped-count.ts
    - packages/sdk/test/fixtures/setup/ogmios-darwin-arm64.zip (renamed)
    - packages/sdk/test/fixtures/setup/ogmios-darwin-arm64.tampered.zip (renamed)
    - packages/sdk/test/fixtures/setup/ogmios-darwin-arm64.zip.sha256 (renamed)
  modified:
    - packages/sdk/package.json (name, bin, description, repository.url, optionalDependencies)
    - packages/sdk/src/errors.ts (OgmiosError base)
    - packages/sdk/src/vitest/errors.ts (all 4 Ogmios*Error subclasses)
    - packages/sdk/src/vitest/plugin.ts (IMPORT_NEEDLE, plugin name, factory, warning prefix)
    - packages/sdk/src/vitest/session-store.ts (OGMIOS_AX_TARGET_PID env var)
    - packages/sdk/src/vitest/browser.ts (OgmiosRpc proxy, OgmiosBrowserSession interface)
    - packages/sdk/src/vitest/commands/index.ts (handler names + imports repointed to ogmios-*.js)
    - packages/sdk/src/vitest/command-types.ts (all Ogmios*Args/Result types)
    - packages/sdk/src/cli/main.ts + errors.ts + reporters/{human,quiet}.ts
    - packages/sdk/src/cli/checks/{tcc-grants,helper-discovery,helper-signature,vo-plist,sip-status,macos-version}.ts
    - packages/sdk/src/cli/{setup-app-path,setup-command,setup-download,setup-install,fix-executor,restore-vo-settings,run-doctor,report-types}.ts
    - packages/sdk/src/matchers/{types,matchers,fixtures,index}.ts
    - packages/sdk/src/{native-types,binding-loader,index,screen-reader,driver-handle,handle-internals,listen,wire,commander-commands,voice-over}.ts
    - packages/binding-darwin-arm64/package.json (Rule 3 unblock — @ogmios scope + ogmios repo URL)
    - packages/binding-darwin-x64/package.json (Rule 3 unblock)
    - examples/vitest-browser-qwik/package.json (Rule 3 unblock — ogmios workspace dep)
    - pnpm-lock.yaml (regenerated against new package names)
    - packages/sdk/test/**/*.ts (35 files)
    - packages/sdk/test/fixtures/setup/{Info.plist,build-fixtures.sh}
    - packages/sdk/test/cli/reporters/__snapshots__/human.test.ts.snap (regenerated)

key-decisions:
  - "Extended Rule 3 deviation to flip @munadi/binding-{arm64,x64} package names to @ogmios/binding-* in addition to Phase 11's examples workspace dep. pnpm install validates workspace dep references across ALL members regardless of --filter, so without this extension, --no-frozen-lockfile install would fail. Strictly minimal: only name + description + repository.url fields; main field stays munadi.node for Plan 12-04 to own."
  - "Applied same snapshot regeneration pattern (delete + vitest writes back) that Phase 11 Plan 01 established. Safer than sed-editing snapshots that can desync from source strings."
  - "Preserved plan's scope guard: helper-*.ts and setup-*.ts Shoki residuals (Shoki*.app / org.shoki.* / ~/.shoki/) untouched; Plan 12-06 owns that cleanup."

patterns-established:
  - "Two-commit per-wave pattern: Task 1 ships src/** rewrite + unblock deps in one commit; Task 2 ships tests/fixtures/build scripts + snapshot regen in second commit. Atomic, reversible, bisect-friendly."

requirements-completed: []

# Metrics
duration: ~4 minutes
completed: 2026-04-18
---

# Phase 12 Plan 01: SDK Rename Munadi -> Ogmios Summary

**Full rebrand of packages/sdk TypeScript surface from Munadi to Ogmios; 89 files touched across 2 atomic commits; `pnpm --filter ogmios test` green (242 passed, 13 integration-skipped).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-18T21:56:45Z
- **Completed:** 2026-04-18T22:00:40Z
- **Tasks:** 2
- **Files modified:** 89 (51 SDK src + 35 SDK test + 2 binding-package + 1 examples workspace-fix)

## Accomplishments

- SDK package name is now `ogmios` and CLI bin is now `ogmios` (users type `ogmios doctor`, `npx ogmios setup`)
- All 5 user-visible error classes renamed (OgmiosError, OgmiosConcurrentTestError, OgmiosPlatformUnsupportedError, OgmiosBindingNotAvailableError, OgmiosSessionNotFoundError) with matching `code` constants `ERR_OGMIOS_*`
- All Vitest BrowserCommand handler names flipped (munadiStart -> ogmiosStart x10) + browser-side RPC proxy mirrors them + 10 command source files renamed via git mv so history is preserved
- Plugin auto-detection needle is `ogmios/vitest/browser` — consumer imports still trigger `poolOptions.threads.singleThread = true`
- Env-var JS side flipped (OGMIOS_AX_TARGET_PID, OGMIOS_HELPER_PATH, OGMIOS_INTEGRATION, OGMIOS_SNAPSHOT_PATH, OGMIOS_NATIVE_BUILT, OGMIOS_SETUP_APP_PATH) — Plan 12-04 must flip the Zig side for integration harness
- Plist snapshot keys `_ogmios_snapshot_{version,domain,ts_unix,pid}` and sentinel `__OGMIOS_MISSING__` — TS reader ready for Plan 12-04's renamed writer
- `DEFAULT_SNAPSHOT_PATH = ~/.ogmios/vo-snapshot.plist`
- 242 unit tests pass end-to-end; the 1 regenerated snapshot (human.test.ts.snap) is clean (ogmios-only)
- Binding-package names (`@ogmios/binding-{darwin-arm64,darwin-x64}`) flipped as a Rule 3 unblock (required for pnpm install to resolve SDK's optionalDependencies reference)

## Task Commits

1. **Task 1: Rename TS surface, plugin, CLI, error classes, env vars across packages/sdk/src/*** — `871740a` (refactor)
2. **Task 2: Update SDK tests + fixtures to match new identifiers, run full test suite** — `53b99c2` (test)

## Files Created/Modified

### packages/sdk/package.json
- `"name"`: munadi -> ogmios
- `"bin"`: `{ "munadi": "dist/cli/main.js" }` -> `{ "ogmios": "dist/cli/main.js" }`
- `"description"`: Munadi -> Ogmios
- `"repository.url"`: git+https://github.com/thejackshelton/munadi.git -> git+https://github.com/thejackshelton/ogmios.git
- `"optionalDependencies"`: `@munadi/binding-darwin-arm64` -> `@ogmios/binding-darwin-arm64`

### packages/sdk/src/ (51 files)
- errors.ts — `OgmiosError` base
- vitest/errors.ts — 4 Ogmios*Error subclasses with `ERR_OGMIOS_*` codes
- vitest/plugin.ts — `IMPORT_NEEDLE='ogmios/vitest/browser'`, plugin name `'ogmios/vitest'`, warning `'[ogmios/vitest]'`, factory `ogmiosVitest()`, interface `OgmiosVitestPluginOptions`
- vitest/session-store.ts — `process.env.OGMIOS_AX_TARGET_PID`; sessionId template `ogmios-${counter}`
- vitest/browser.ts — `OgmiosRpc` + `OgmiosBrowserSession`; handler RPC names `ogmiosStart`/etc.
- vitest/commands/index.ts — imports repointed to `./ogmios-*.js`; registration names `ogmiosStart`/`ogmiosDrain`/etc.
- vitest/commands/ogmios-*.ts (10 files) — renamed via git mv from munadi-*.ts
- vitest/command-types.ts — `Ogmios*Args/Result/SessionRef` + `WireOgmiosEvent`
- cli/main.ts — `.name('ogmios')`; `info` prints `ogmios v${pkg.version}`; help text; option `--helper-path` description mentions `OGMIOS_HELPER_PATH` + `OgmiosRunner.app`
- cli/errors.ts + reporters/{human,quiet}.ts — `ogmios doctor` / `ogmios-doctor` / "ogmios is ready on this machine"
- cli/checks/{tcc-grants,helper-discovery,helper-signature,vo-plist,sip-status,macos-version}.ts — OgmiosRunner path/CSREQ/bundle IDs
- cli/setup-{app-path,command,download,install}.ts + fix-executor.ts — OgmiosSetup.app/OgmiosRunner.app paths, ogmios-darwin-*.zip URLs, github.com/thejackshelton/ogmios base URL
- cli/restore-vo-settings.ts — `DEFAULT_SNAPSHOT_PATH = ~/.ogmios/vo-snapshot.plist`; `OGMIOS_KEYS` constant; `__OGMIOS_MISSING__` sentinel; `_ogmios_snapshot_{version,domain,ts_unix}` regex extraction
- matchers/{types,matchers,fixtures,index}.ts — `OgmiosExpectMatchers`, `OgmiosAsymmetricMatchers`, `OgmiosEvent` throughout; `_ogmiosAssertionT`/`_ogmiosMatchersT` markers
- native-types.ts — supported-platform table `@ogmios/binding-{darwin-arm64,darwin-x64}`
- binding-loader.ts + index.ts + screen-reader.ts + driver-handle.ts + handle-internals.ts + listen.ts + wire.ts + commander-commands.ts + voice-over.ts — `OgmiosEvent`/`OgmiosError` exports + prose

### packages/sdk/test/ (35 files)
- test/vitest/plugin.test.ts — plugin name assertion `ogmios/vitest`
- test/vitest/singleton-detection.test.ts — needle + warning-prefix assertions
- test/vitest/commands.test.ts — `ogmiosStart` returns sessionId `ogmios-1`; ogmiosDrain/Stop/Listen/etc.
- test/vitest/session-store.test.ts — id1=`ogmios-1`/id2=`ogmios-2`; `OGMIOS_AX_TARGET_PID` assertions
- test/vitest/structured-clone-safety.test.ts — `OgmiosConcurrentTestError` assertions; `ERR_OGMIOS_*`
- test/vitest/fixtures/has-import/test.ts + opt-out/test.ts — imports from `'ogmios/vitest/browser'`
- test/cli/integration/cli-smoke.test.ts — `/ogmios v/` pattern; `/^ogmios-doctor/` prefix
- test/cli/reporters/human.test.ts + `__snapshots__/human.test.ts.snap` — snapshot regenerated cleanly (2 written)
- test/cli/helper-discovery.test.ts + helper-signature.test.ts + tcc-grants.test.ts — `OgmiosRunner.app`/`OgmiosSetup.app` paths; `org.ogmios.runner/setup` bundle IDs
- test/cli/setup-download.test.ts + setup-install.test.ts + setup-command.test.ts + setup.test.ts — `ogmios-darwin-arm64.zip`; `github.com/thejackshelton/ogmios` URLs; `OGMIOS_SETUP_APP_PATH`; mkdtemp prefixes `ogmios-*-`
- test/cli/restore-vo-settings.test.ts — `OGMIOS_SNAPSHOT_PATH` env + `ogmios-restore-test-` tmp prefix + `ogmios restore-vo-settings` prose
- test/cli/fixtures/tcc-rows.ts + codesign-output.ts — bundle IDs `org.ogmios.runner`/`org.ogmios.setup`
- test/matchers/to-have-announced.test.ts + text/no-announcement/stable-log — `OgmiosEvent` array type assertions
- test/integration/* — `OGMIOS_INTEGRATION`/`OGMIOS_NATIVE_BUILT`/`OGMIOS_SNAPSHOT_PATH` gating
- test/fixtures/sigkill-child.ts — `OGMIOS_SNAPSHOT_PATH` + `~/.ogmios/` prose
- test/fixtures/setup/Info.plist — bundle ID `org.ogmios.fixture`; CFBundleName "Ogmios Fixture"
- test/fixtures/setup/build-fixtures.sh — `_staging/Ogmios.app/Contents/MacOS/Ogmios` binary path; `org.ogmios.fixture`; `ogmios-darwin-arm64.*` output names
- test/fixtures/setup/ogmios-darwin-arm64.zip + .tampered.zip + .zip.sha256 — git mv from munadi-* (bytes identical; SHA256 still valid)
- 20+ additional unit test files — `OgmiosEvent`/`OgmiosError` references

### packages/binding-darwin-{arm64,x64}/package.json (Rule 3 unblock)
- `"name"`: `@munadi/binding-*` -> `@ogmios/binding-*`
- `"description"`: Munadi -> Ogmios
- `"repository.url"`: github.com/thejackshelton/munadi -> github.com/thejackshelton/ogmios
- `"main"`: **kept as `munadi.node`** — Plan 12-04 owns the Zig-core .node filename

### examples/vitest-browser-qwik/package.json (Rule 3 unblock)
- `dependencies.munadi: "workspace:*"` -> `dependencies.ogmios: "workspace:*"`

### pnpm-lock.yaml
- Regenerated against new package names (`ogmios` + `@ogmios/binding-{arm64,x64}` + examples workspace dep flip)

## Decisions Made

- **Extended Rule 3 deviation to binding-package names.** Phase 11 Plan 01's workspace unblock only touched `examples/vitest-browser-qwik/package.json`. This plan also had to flip `@munadi/binding-{arm64,x64}` -> `@ogmios/binding-*` because SDK's `optionalDependencies` now references `@ogmios/*` and pnpm's workspace validator would reject install otherwise. Minimal scope: name + description + repository.url only. The `.node` filename stays `munadi.node` for Plan 12-04 to own along with Zig core rename.
- **Delete + regenerate snapshot.** `human.test.ts.snap` contained 2+ munadi identifiers mirroring source strings. Delete + vitest write regenerates with zero desync risk. Json snapshot had no refs, left alone.
- **Preserved plan scope guards.** `helper-*.ts` and `setup-*.ts` still carry Shoki residuals (`Shoki*.app` / `org.shoki.*` / `~/.shoki/`) — Plan 12-06 owns that cleanup. The Munadi layer in those files (which Phase 11 added) is fully flipped here.
- **Kept `VoiceOverUnsupportedPlatformError` unprefixed** (Phase 11 convention — no prefix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Flipped binding-package names @munadi/* -> @ogmios/* (outside stated file list)**
- **Found during:** Task 1 (post-sed pnpm install)
- **Issue:** Plan's scope guard said "packages/binding-*/package.json main stays munadi.node until Plan 12-04" — implied the whole package.json was out of scope. But SDK's `optionalDependencies` references `@ogmios/binding-darwin-arm64`, and pnpm's workspace validator scans ALL workspace-package names regardless of --filter. Without flipping the binding-package `name` field to `@ogmios/*`, `pnpm install --no-frozen-lockfile` would fail with ERR_PNPM_WORKSPACE_PKG_NOT_FOUND — blocking typecheck + build + test.
- **Fix:** Flipped `"name"`, `"description"`, and `"repository.url"` in both `packages/binding-darwin-arm64/package.json` and `packages/binding-darwin-x64/package.json`. Left `"main": "munadi.node"` and `"files": ["munadi.node", ...]` untouched — Plan 12-04 owns the Zig core + .node filename.
- **Files modified:** packages/binding-darwin-arm64/package.json, packages/binding-darwin-x64/package.json
- **Verification:** `pnpm install --no-frozen-lockfile` now succeeds; workspace resolution finds `@ogmios/binding-*` packages; typecheck + build + test all green.
- **Committed in:** 871740a (Task 1 commit)

**2. [Rule 3 - Blocking] Flipped examples/vitest-browser-qwik workspace dep munadi -> ogmios**
- **Found during:** Task 1 (pnpm install from repo root)
- **Issue:** Same pattern as Phase 11 Plan 01 Rule 3. `examples/vitest-browser-qwik/package.json` carried `"munadi": "workspace:*"`; SDK is now named `ogmios` so pnpm workspace resolution failed. Plan 12-08 owns the rest of examples/ (imports, ambient module names, README, vitest.config) but the dep-name fix has to land here.
- **Fix:** Single-line: `dependencies.munadi` -> `dependencies.ogmios` in examples/vitest-browser-qwik/package.json. Nothing else under examples/* touched.
- **Files modified:** examples/vitest-browser-qwik/package.json
- **Verification:** `pnpm install --no-frozen-lockfile` succeeds; workspace dep resolves to packages/sdk.
- **Committed in:** 871740a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking on pnpm install)
**Impact on plan:** Both deviations necessary to land a working install + test flow. Strictly minimal scope — binding package `main` field, examples imports/ambient types, and the rest of examples/ all still belong to downstream plans.

## Issues Encountered

- `pnpm install` workspace validation blocked initial test runs — resolved via the Rule 3 deviations above.
- macOS sed lacks `\b` word boundaries. Mitigated by ordered substitution table (longer/more-specific patterns first) so that e.g. `_munadi_snapshot_` is replaced before the generic `munadi` catch-all.

## User Setup Required

None — pure rename, no new services or env vars to configure.

## Next Phase Readiness

- **Ready:** Plans 12-02, 12-03, 12-04, 12-05, 12-06, 12-07, 12-08, 12-09, 12-10 can now reference `ogmios` identifiers without SDK-side conflicts.
- **Blocker for Plan 12-02:** Binding-package tarballs ship `munadi.node` + README/LICENSE. This plan flipped package `name` to `@ogmios/binding-*` but left `main` as `munadi.node`. Plan 12-02 must either flip `main` to `ogmios.node` and ship a renamed artifact, OR Plan 12-04 must produce `ogmios.node` and Plan 12-02 must update `main` + `files` afterward.
- **Blocker for Plan 12-04:** Must flip `getenv("MUNADI_AX_TARGET_PID")` -> `getenv("OGMIOS_AX_TARGET_PID")` in Zig; write `_ogmios_snapshot_*` plist keys + `__OGMIOS_MISSING__` sentinel; rename `libmunadi.dylib` -> `libogmios.dylib` and compiled `munadi.node` -> `ogmios.node`. Integration tests gated on `OGMIOS_INTEGRATION=1` will fail until both sides agree.
- **Blocker for Plan 12-03:** Helper Info.plists + Zig sources must ship bundle IDs `org.ogmios.runner` / `org.ogmios.setup`; built .app bundles `OgmiosRunner.app` / `OgmiosSetup.app` to match TS path expectations.
- **Blocker for Plan 12-06:** Hard-guarded Shoki residuals in `src/cli/checks/helper-*.ts` + `src/cli/setup-*.ts` (Shoki*.app / org.shoki.* / ~/.shoki/) still present — not in this plan's scope.
- **Blocker for Plan 12-08:** Full examples/vitest-browser-qwik rewrite (imports, ambient module names, README, vitest.config) — this plan only did the workspace dep-name fix.

## Self-Check: PASSED

Verified commits exist and plan artifacts are present:
- Task 1 commit `871740a` found in git log
- Task 2 commit `53b99c2` found in git log
- packages/sdk/package.json -> "ogmios" (verified via jq: name=ogmios, bin.ogmios=dist/cli/main.js, optionalDependencies["@ogmios/binding-darwin-arm64"]=workspace:*)
- packages/sdk/src/vitest/plugin.ts -> contains `ogmios/vitest/browser` and `ogmiosVitest`
- packages/sdk/src/errors.ts -> contains `OgmiosError`
- packages/sdk/src/vitest/errors.ts -> contains Ogmios*Error classes
- packages/sdk/src/vitest/session-store.ts -> contains `OGMIOS_AX_TARGET_PID`
- packages/sdk/src/cli/restore-vo-settings.ts -> contains `_ogmios_snapshot_`, `~/.ogmios/`, `__OGMIOS_MISSING__`, `OGMIOS_KEYS`
- packages/sdk/test/fixtures/setup/ogmios-darwin-arm64.zip.sha256 exists; munadi-darwin-arm64.zip.sha256 does not
- 10 command files renamed: packages/sdk/src/vitest/commands/ogmios-{start,stop,listen,drain,phrase-log,last-phrase,clear,reset,await-stable,get-dropped-count}.ts
- packages/binding-darwin-arm64/package.json -> @ogmios/binding-darwin-arm64
- packages/binding-darwin-x64/package.json -> @ogmios/binding-darwin-x64
- examples/vitest-browser-qwik/package.json -> `"ogmios": "workspace:*"`
- pnpm --filter ogmios test exits 0 (242 tests passed, 13 skipped integration)
- Zero munadi/Munadi/MUNADI_/@munadi/_munadi_/org.munadi./.munadi/ tokens across packages/sdk/src/** and packages/sdk/test/**

---
*Phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi*
*Completed: 2026-04-18*

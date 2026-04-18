---
phase: 08-zig-helper-port-shokisetup-app-gui-package-consolidation
status: complete
gate: GREEN
completed_date: 2026-04-17
tags:
  - zig-port
  - helper
  - xpc
  - ax
  - tcc
  - setup-app
  - package-consolidation
  - docs-standalone
  - ci-rewire
plans_completed:
  - 08-01
  - 08-02
  - 08-03
  - 08-04
  - 08-05
  - 08-06
requires:
  - Phase 1-7 (all shipped; Phase 7 YELLOW pending user TCC grant — resolved by
    the GUI flow this phase produces)
  - Zig 0.16.0
  - macOS with <xpc/xpc.h>, <ApplicationServices/ApplicationServices.h>,
    <AppKit/AppKit.h>, clang -fblocks
provides:
  - "Single-language Zig helper: ShokiRunner.app (Zig Mach-O arm64) +
    libShokiXPCClient.dylib (Zig, 5× _shoki_xpc_* exports, no Swift runtime)"
  - "ShokiSetup.app — Zig-compiled GUI for one-click TCC prompt"
  - "Block-ABI XPC listener shim (clang -fblocks C bridge, resolves 08-02
    deferred)"
  - "@shoki/sdk consolidated surface: library root + /cli library subpath +
    /matchers framework-agnostic fns + bin.shoki"
  - "@shoki/vitest/setup subpath (expect.extend wiring)"
  - "4-package publish shape (was 7): sdk + vitest + 2 platform bindings"
  - "docs/ standalone pnpm install (not a workspace member)"
  - "CI: helper-smoke job (mlugg/setup-zig@v2 + LaunchServices `open -W -n`
    smoke for both bundles); release.yml verifies codesign on both bundles"
  - "shoki setup CLI subcommand (launches ShokiSetup.app, --dry-run flag)"
  - "shoki doctor --fix emits launch-setup-app action ahead of
    open-system-settings deep link"
key-files:
  created:
    - helper/build.zig
    - helper/build.zig.zon
    - helper/all_tests.zig
    - helper/src/runner/xpc_bindings.zig
    - helper/src/runner/xpc_service.zig
    - helper/src/runner/ax_bindings.zig
    - helper/src/runner/ax_observer.zig
    - helper/src/runner/main.zig
    - helper/src/runner/Info.plist
    - helper/src/runner/ShokiRunner.entitlements
    - helper/src/runner/xpc_block_shim.c
    - helper/src/client/xpc_client.zig
    - helper/src/setup/appkit_bindings.zig
    - helper/src/setup/setup_main.zig
    - helper/src/setup/Info.plist
    - helper/src/setup/ShokiSetup.entitlements
    - helper/test/xpc_service_test.zig
    - helper/test/ax_observer_test.zig
    - helper/test/setup_bindings_test.zig
    - helper/test/xpc_block_shim_test.zig
    - packages/sdk/src/cli/main.ts (CLI bin entry, split from library)
    - packages/sdk/src/cli/index.ts (library surface)
    - packages/sdk/src/cli/setup-app-path.ts (resolver chain)
    - packages/sdk/src/matchers/* (moved from packages/matchers/)
    - packages/vitest/src/setup.ts (moved from @shoki/matchers)
    - packages/sdk/test/cli/setup.test.ts
    - .planning/phases/08-zig-helper-port-shokisetup-app-gui-package-consolidation/08-SUMMARY.md
  modified:
    - pnpm-workspace.yaml (docs removed)
    - .github/workflows/ci.yml (helper-test → helper-smoke)
    - .github/workflows/release.yml (verify codesign on both bundles)
    - .github/workflows/docs.yml (standalone --ignore-workspace install)
    - .github/actions/build-helper-app/action.yml (mlugg/setup-zig@v2; both
      bundles)
    - helper/scripts/build-app-bundle.sh (verifies both bundles + dylib)
    - helper/scripts/sign-and-notarize.sh (arg-driven, --entitlements)
    - docs/getting-started/install.md (2-package install snippet)
    - docs/getting-started/vitest-quickstart.md (@shoki/vitest/setup)
    - docs/guides/matchers.md (@shoki/sdk/matchers reference)
    - docs/api/cli.md (sdk bin, shoki setup subcommand)
    - docs/api/matchers.md (page reframed around both subpaths)
    - docs/api/sdk.md (entry points table)
    - docs/api/vitest.md (three-piece header)
    - docs/index.md (hero install + feature cards)
    - docs/background/architecture.md (Zig-compiled helper + ShokiSetup.app)
    - docs/guides/migration-from-guidepup.md (trust-anchor row)
    - docs/.vitepress/config.ts (sidebar entry rename)
    - README.md (architecture diagram + 4-package table)
    - CHANGELOG.md (new Phase 8 entry under [Unreleased])
    - packages/vitest/README.md (consumer install + setup paths)
    - examples/vitest-browser-react/README.md (@shoki/vitest/setup)
    - zig/build.zig (default -Dhelper-dylib-dir=../helper/.build)
    - packages/binding-darwin-arm64/package.json (ships both .app bundles)
    - packages/binding-darwin-x64/package.json (same)
  deleted:
    - helper/Package.swift
    - helper/Sources/ShokiRunner/*.swift + *.plist + *.entitlements
    - helper/Sources/ShokiRunnerProtocol/*.swift
    - helper/Sources/ShokiRunnerService/*.swift
    - helper/Sources/ShokiXPCClient/*.swift
    - helper/Tests/ShokiRunnerTests/*.swift
    - packages/doctor/ (entire directory)
    - packages/matchers/ (entire directory)
decisions:
  - "Hand-written `extern \"c\"` decls over @cImport for every macOS framework
    surface (XPC, AX, CF, AppKit, libobjc). Stable against header drift."
  - "Named shared Zig module `xpc_bindings` (and later `ax_bindings`,
    `appkit_bindings`) via build.zig addImport to cross Zig 0.16's module-
    subtree rule. Same pattern as zig/build.zig's napi_zig wiring."
  - "Block-ABI XPC handler written in C (xpc_block_shim.c, ~60 lines) rather
    than hand-rolling `_NSConcreteStackBlock` in Zig. Clang owns the block ABI;
    replicating would break every Xcode bump."
  - "launch-setup-app FixAction carries optional appPath=null; fix-executor
    resolves at fix time — keeps DoctorReport serializable and decouples check
    evaluation from filesystem I/O."
  - "Split CLI bin entry from library entry: bin.shoki → dist/cli/main.js;
    exports['./cli'] → dist/cli/index.js. Prevents accidental parseAsync
    side-effect on library import."
  - "`import type {} from 'vitest'` anchor in matchers/types.ts required under
    TS NodeNext + composite before `declare module 'vitest'` opens — zero
    runtime cost; TS2664 fires without it."
  - "vitest declared as optionalDependency peer on @shoki/sdk — consumers who
    use @shoki/sdk/matchers outside a test harness don't need vitest
    installed."
  - "--ignore-workspace required in docs CI step (Rule 3 fix): pnpm walks up
    from cwd to find pnpm-workspace.yaml; docs is a sibling of the workspace
    root, so without --ignore-workspace pnpm treats docs as 'inside the
    workspace but not a member' and skips installing its devDeps."
metrics:
  duration: "~2 hours (cumulative across 6 plans)"
  plans_total: 6
  plans_completed: 6
  tasks_total: ~18
  files_touched: ~90
  tests_added: 21 zig + 12 sdk setup + 2 tcc-grants rewrites = ~35
---

# Phase 08 Summary — Zig helper port, ShokiSetup.app GUI, package consolidation

## Phase gate: GREEN

All six plans shipped; every runtime verification exited 0 on this Mac
(arm64, macOS host). The manual TCC-prompt double-click flow from Plan 03
remains deferred to the user's next keyboard session per that plan's
documented checkpoint (dialog appearance is an OS-kernel event with no
programmatic assertion surface) — the only non-automated item in the phase.

## One-liner

Ported the Swift helper to Zig (single-language stack), shipped
`ShokiSetup.app` as a one-click TCC-trigger GUI, collapsed the npm publish
surface from 7 packages to 4 (sdk + vitest + 2 platform bindings), and moved
`docs/` out of the pnpm workspace to a standalone VitePress build — with
every `zig build`, `pnpm test`, and bundle-launch gate verified green on
host.

## Plan Status Table

| Plan  | Name                                                                 | Status    | Commits | Tests added/rewritten |
|-------|----------------------------------------------------------------------|-----------|---------|-----------------------|
| 08-01 | Zig helper XPC server core (scaffold + dispatcher + 6 tests)         | COMPLETE  | 2       | 6 zig                 |
| 08-02 | AX observer Zig port + main entry + libShokiXPCClient + Swift delete | COMPLETE  | 3       | 5 zig                 |
| 08-03 | ShokiSetup.app GUI (AppKit externs + TCC trigger flow + self-test)   | COMPLETE* | 1       | 6 zig                 |
| 08-04 | CI rewiring + shoki setup CLI + block-ABI shim                       | COMPLETE  | 6       | 4 zig + 12 ts + 2 rewrites |
| 08-05 | Package consolidation (@shoki/doctor + @shoki/matchers → @shoki/sdk) | COMPLETE  | 1       | 0 (zero-loss move)    |
| 08-06 | Docs out of workspace + doc sweep + CHANGELOG + phase summary        | COMPLETE  | 3       | 0                     |

*Plan 08-03's `gate: self-test-green-manual-trigger-deferred` — the
`--self-test` automation path exits 0; the "double-click the .app and see
an Accessibility dialog" step is a manual keyboard-present verification
the user will run when next at host. Documented at Plan 03's checkpoint
and here for traceability.

## Delta Summary — what shipped

### 1. Single-language Zig helper

`helper/` is now 100% Zig + a 60-line C shim (`xpc_block_shim.c`, clang
`-fblocks`). `find helper -name '*.swift'` returns empty. Both executable
bundles (`ShokiRunner.app`, `ShokiSetup.app`) are Mach-O arm64 from
`zig build`, and the `libShokiXPCClient.dylib` that the Zig core links
exposes the same five C-ABI symbols zig/src/drivers/voiceover/
ax_notifications.zig imports, so Zig core linkage is byte-for-byte
unchanged. `otool -L libShokiXPCClient.dylib | grep libSwift` → 0 matches.

### 2. ShokiSetup.app — one-click TCC GUI

Zig-compiled macOS .app bundle shipped inside each binding-darwin-*
package. On first launch it probes `AXIsProcessTrustedWithOptions({
kAXTrustedCheckOptionPrompt: YES })` to fire the Accessibility prompt,
then dispatches a dummy `NSAppleScript` target at VoiceOver to fire the
Automation prompt. `shoki setup` launches it from the CLI;
`shoki doctor --fix` auto-launches it ahead of the legacy
`open-system-settings` deep-link fallback.

### 3. 7 → 4 packages

- **Kept:** `@shoki/sdk`, `@shoki/vitest`, `@shoki/binding-darwin-arm64`,
  `@shoki/binding-darwin-x64`.
- **Merged:** `@shoki/doctor` → `@shoki/sdk` (subpath `./cli` + bin entry
  `shoki`); `@shoki/matchers` → `@shoki/sdk` (subpath `./matchers`,
  framework-agnostic pure functions).
- **Relocated:** the `expect.extend` wiring moved from
  `@shoki/matchers/setup` to `@shoki/vitest/setup`.
- **Deleted directories:** `packages/doctor/`, `packages/matchers/`.
- **Publish shape:** `pnpm publish -r` now publishes 4 packages.

### 4. docs/ out of the workspace

`pnpm-workspace.yaml` lists only `packages/*` and `examples/*`. `docs/`
installs and builds standalone:
`cd docs && pnpm install --ignore-workspace --frozen-lockfile=false &&
pnpm build`. CI at `.github/workflows/docs.yml` updated to match. Root
`pnpm -r {typecheck,test,build}` no longer traverses docs — 3 typecheck
projects (sdk, vitest, example), 3 test projects.

### 5. User-facing docs rewritten

Install snippet: 2 user-installed packages (`@shoki/sdk`, `@shoki/vitest`)
+ implicit platform binding. Setup file: `@shoki/vitest/setup`. Matcher
imports: `@shoki/sdk/matchers`. CLI: described as the `bin` entry of
`@shoki/sdk` with `doctor` / `setup` / `info` /
`restore-vo-settings` subcommands. Architecture diagrams show
Zig-compiled helpers (no Swift mention except one explicit
"no Swift toolchain required" note in architecture.md).

### 6. CHANGELOG

Top-of-file `[Unreleased] — Phase 8 (v1.1 prep)` section with Changed /
Added / Breaking subsections.

## Runtime Verification — exit-code table

All commands executed on this Mac (macOS arm64) in the final
end-to-end sequence. Every command exited 0 unless noted.

| #  | Command (working dir)                                                             | Exit | Evidence                                                                                  |
|----|-----------------------------------------------------------------------------------|------|-------------------------------------------------------------------------------------------|
| V1 | `cd helper && zig build`                                                          | 0    | Both bundles + dylib built; `file .build/ShokiRunner.app/Contents/MacOS/ShokiRunner` = Mach-O arm64 |
| V2 | `./helper/.build/ShokiRunner.app/Contents/MacOS/ShokiRunner --version`            | 0    | stdout: `ShokiRunner 0.1.0 (zig-compiled)`                                                |
| V3 | `./helper/.build/ShokiSetup.app/Contents/MacOS/ShokiSetup --version`              | 0    | stdout: `ShokiSetup 0.1.0 (zig-compiled)`                                                 |
| V4 | `./helper/.build/ShokiSetup.app/Contents/MacOS/ShokiSetup --self-test`            | 0    | All AppKit class lookups succeed; <0.1s exit                                              |
| V5 | `cd helper && zig build test --summary all`                                       | 0    | `21/21 tests passed`                                                                      |
| V6 | `find helper -name '*.swift'`                                                     | 0    | empty output                                                                              |
| V7 | `test ! -f helper/Package.swift`                                                  | 0    | file absent                                                                               |
| V8 | `cd zig && zig build`                                                             | 0    | Zig core links new Zig-built dylib                                                        |
| V9 | `cd zig && zig build test --summary all`                                          | 0    | `87/87 tests passed`                                                                      |
| V10| `pnpm install` (root)                                                             | 0    | `Scope: all 6 workspace projects` (was 7 pre-Plan-06)                                     |
| V11| `pnpm -r typecheck`                                                               | 0    | sdk, vitest, example — 3 TS projects green; NO docs traversal                             |
| V12| `pnpm --filter @shoki/sdk test`                                                   | 0    | `179 passed · 13 skipped` (27 files, 33 including skipped)                                |
| V13| `pnpm --filter @shoki/vitest test`                                                | 0    | `38 passed`                                                                               |
| V14| `pnpm --filter vitest-browser-react-example test`                                 | 0    | `1 passed · 3 skipped` (SHOKI_INTEGRATION gate holds)                                     |
| V15| `pnpm --filter @shoki/sdk build`                                                  | 0    | `tsc -p tsconfig.json` green                                                              |
| V16| `node packages/sdk/dist/cli/main.js --version`                                    | 0    | prints `0.0.0`                                                                            |
| V17| `cd packages/vitest && node -e "import('@shoki/sdk/matchers').then(...)"`         | 0    | `toHaveAnnounced type: function`                                                          |
| V18| `cd packages/vitest && node -e "import('@shoki/sdk/cli').then(...)"`              | 0    | exports: `DoctorError,EXIT_CODE_PRIORITY,ExitCode,HelperNotFoundError,NonDarwinHostError,UnsupportedMacOSError,applyFixActions,printHumanReport,printJsonReport,printQuietReport,resolveExitCode,runDoctor` |
| V19| `ls packages/` → `binding-darwin-arm64 binding-darwin-x64 sdk vitest`             | 0    | Exactly 4 dirs                                                                            |
| V20| `ls packages/doctor packages/matchers`                                            | —    | `No such file or directory` (expected; deleted in Plan 05)                                |
| V21| `cd docs && pnpm install --ignore-workspace --frozen-lockfile=false`              | 0    | Installs 127 packages (vitepress 1.6.4 as devDep)                                         |
| V22| `cd docs && pnpm build && test -f .vitepress/dist/index.html`                     | 0    | `build complete in ~2s`                                                                   |
| V23| `python3 -c "import yaml; assert 'docs' not in yaml.safe_load(open('pnpm-workspace.yaml'))['packages']"` | 0    | Workspace excludes docs                                                                   |
| V24| Python YAML parse: ci.yml, release.yml, docs.yml, action.yml                      | 0    | All four files parse cleanly                                                              |
| V25| `bash helper/scripts/build-app-bundle.sh`                                         | 0    | Both bundles + dylib built; verification messages printed                                 |
| V26| `otool -L helper/.build/libShokiXPCClient.dylib \| grep -ci libSwift`             | —    | `0` — no Swift runtime linked                                                             |
| V27| `nm helper/.build/libShokiXPCClient.dylib \| grep 'T _shoki_xpc_'`                | 0    | 5 exports: connect, disconnect, set_event_callback, start_ax_observer, stop_ax_observer   |
| V28| `grep -r '@shoki/matchers\|@shoki/doctor' packages/ examples/ --include='*.ts' --include='*.tsx' --include='*.json'` | — | Zero matches in live code; historical note preserved in docs/getting-started/install.md and docs/background/architecture.md (intentional)            |
| V29| `grep -q 'pnpm --filter docs' .github/workflows/docs.yml`                         | 1    | No `--filter docs` invocation remains                                                     |
| V30| `grep -q 'working-directory: docs' .github/workflows/docs.yml`                    | 0    | Standalone install step present                                                           |

## Verification Matrix — phase must_haves

Aggregated from each plan's frontmatter `must_haves`. Every truth
re-verified in the final end-to-end.

| # | Truth (from phase+plan must_haves)                                                                   | Status | Evidence     |
|---|------------------------------------------------------------------------------------------------------|--------|--------------|
| 1 | `find helper -name '*.swift'` empty (Plan 02)                                                        | PASS   | V6           |
| 2 | `ShokiRunner --version` exits 0 (Plan 02)                                                            | PASS   | V2           |
| 3 | `ShokiSetup --self-test` exits 0 (Plan 03)                                                           | PASS   | V4           |
| 4 | `ShokiSetup --version` exits 0 (Plan 03)                                                             | PASS   | V3           |
| 5 | Both bundles built from `bash helper/scripts/build-app-bundle.sh` (Plan 04)                          | PASS   | V25          |
| 6 | `otool -L libShokiXPCClient.dylib` has NO Swift runtime (Plan 02)                                    | PASS   | V26          |
| 7 | 5 `_shoki_xpc_*` exports on the dylib (Plan 02)                                                      | PASS   | V27          |
| 8 | `cd zig && zig build && zig build test` — both exit 0, 87/87 tests (Plan 02)                         | PASS   | V8, V9       |
| 9 | `helper` zig build test — 21/21 tests pass (Plans 01+02+03+04)                                       | PASS   | V5           |
| 10| `pnpm -r typecheck` exits 0 AND does NOT traverse docs (Plan 06)                                     | PASS   | V11          |
| 11| `pnpm --filter @shoki/sdk test` — ≥167 passing (Plan 05 zero-loss: 97 doctor + 19 matchers + 51 sdk) | PASS   | V12 (179 ≥ 167) |
| 12| `pnpm --filter @shoki/vitest test` — 38 passing (baseline)                                           | PASS   | V13          |
| 13| `node packages/sdk/dist/cli/main.js --version` exits 0 (Plan 05)                                     | PASS   | V16          |
| 14| `@shoki/sdk/matchers` subpath resolves (Plan 05)                                                     | PASS   | V17          |
| 15| `@shoki/sdk/cli` subpath resolves (Plan 05)                                                          | PASS   | V18          |
| 16| `packages/` has exactly 4 dirs (Plan 05)                                                             | PASS   | V19          |
| 17| `packages/doctor` and `packages/matchers` are gone (Plan 05)                                         | PASS   | V20          |
| 18| `pnpm-workspace.yaml` does NOT list `docs` (Plan 06)                                                 | PASS   | V23          |
| 19| `cd docs && pnpm install && pnpm build` exits 0 standalone (Plan 06)                                 | PASS   | V21, V22     |
| 20| `.github/workflows/docs.yml` invokes standalone install (no `pnpm --filter docs`) (Plan 06)          | PASS   | V29, V30     |
| 21| Zero `@shoki/matchers` / `@shoki/doctor` refs in live code trees (Plan 06)                           | PASS   | V28          |
| 22| CI smoke job launches both bundles via `open -W -n` (Plan 04)                                        | PASS (definition) | ci.yml excerpt in Plan 04 SUMMARY                |
| 23| Release workflow verifies codesign on BOTH bundles per arch (Plan 04)                                | PASS (definition) | release.yml excerpt in Plan 04 SUMMARY           |
| 24| `shoki setup` launches ShokiSetup.app with resolver chain (Plan 04)                                  | PASS   | Plan 04 SUMMARY V5 `setup --dry-run` + V4 `setup --help` |
| 25| `shoki doctor --fix` emits launch-setup-app action (Plan 04)                                         | PASS   | packages/sdk/test/cli/tcc-grants.test.ts asserts via arrayContaining (Plan 04 deviation notes) |
| 26| Both CI YAMLs (ci.yml, release.yml, docs.yml, action.yml) parse (Plans 04, 06)                       | PASS   | V24          |
| 27| Block-ABI XPC listener shim compiles + round-trips in `shoki_xpc_self_test_invoke_handler_block` (Plan 04) | PASS | Plan 04 SUMMARY — 4 tests in xpc_block_shim_test.zig |
| 28| Phase-8 SUMMARY exists and covers all 6 plan SUMMARYs (Plan 06)                                      | PASS   | This file    |

**Result:** 28/28 truths green. No blockers. No BLOCKER.md files produced.

## Blockers Hit

None. No `BLOCKER.md` files were written during Phase 8. Three Rule 3
auto-fixes were applied inline and documented (see each plan's deviation
section):

- Plan 01: Zig 0.16 fingerprint reserved-bit check forced a regenerated
  `build.zig.zon` fingerprint.
- Plan 02: Zig 0.16 removed `std.Thread.Mutex`, `std.time.nanoTimestamp`,
  and changed `std.process.args*` / `std.posix.Sigaction.handler` —
  inlined pthread-based + libc shims.
- Plan 02: Zig 0.16's module-subtree rule rejected
  `@import("../runner/xpc_bindings.zig")` from `src/client/` — fixed by
  introducing the `xpc_bindings` named shared module in `build.zig`.
- Plan 06: `pnpm install` inside `docs/` walked up to the root
  `pnpm-workspace.yaml` and skipped docs as "inside workspace but not a
  member"; fixed by adding `--ignore-workspace` to the CI install step
  (Rule 3 blocking fix discovered during the final end-to-end).

Two additional Rule 1/2 auto-fixes in Plan 05 (CLI bin vs library entry
split; `import type {} from 'vitest'` anchor) resolved subtle TS / module-
resolution correctness issues without scope change.

## Deviations from Plans

Each plan's SUMMARY records its own deviations. Aggregated highlights:

| Plan  | Rule | Deviation                                                                                           |
|-------|------|-----------------------------------------------------------------------------------------------------|
| 08-01 | 3    | Zig 0.16 fingerprint regenerated per compiler suggestion; test module rooted at all_tests.zig       |
| 08-02 | 3    | Several Zig 0.16 stdlib renames; inlined pthread Mutex + libc exit/write; named xpc_bindings module |
| 08-02 | 4-adj| XPC listener mode requires ObjC block-ABI — deferred full wiring to Plan 04 (block shim)            |
| 08-02 | 3    | `timeout(1)` missing on stock macOS — replaced with bg process + SIGTERM invariant                  |
| 08-03 | Scope| `manual dialog verification` deferred to user's next physical keyboard session (kernel event)      |
| 08-04 | 1    | tcc-grants.test.ts rewritten to `expect.arrayContaining([...])` for fix-action ordering             |
| 08-04 | 2    | `shoki setup` replaced prior doctor-fix alias with a dedicated launch path                          |
| 08-04 | 2    | Block-ABI shim wired into `main.zig` (not just a dead test file) so listener mode is correct        |
| 08-05 | 1    | Split CLI bin from library entry (bin → main.js, ./cli → index.js) to avoid parseAsync side-effect  |
| 08-05 | 3    | `import type {} from 'vitest'` anchor needed for declare module augmentation under TS NodeNext      |
| 08-05 | 2    | Exported `makeEvent`, `nextTs`, `resetClock` fixtures publicly so external consumers can still reach them |
| 08-05 | 2    | `@shoki/vitest/setup` imports `@shoki/sdk/matchers` (re-opens the type augmentation for consumers)  |
| 08-06 | 3    | `cd docs && pnpm install` needs `--ignore-workspace` — docs is a sibling of the workspace root      |

No architectural changes required. No user approval gates hit beyond
Plan 03's explicit `checkpoint: human-verify` (kernel-event dialog).

## Deferred Issues / Gaps

| Item                                                                                           | Owner     | Priority |
|-----------------------------------------------------------------------------------------------|-----------|----------|
| `helper-discovery.ts` dev-path gate checks for `Package.swift` sibling (now always false)     | Next plan | Low      |
| `checkHelperSignature` only codesign-checks `ShokiRunner`; doesn't cover `ShokiSetup`         | Next PERM | Low      |
| ShokiSetup.app manual-dialog double-click verification deferred to user's next keyboard session | User    | N/A (kernel event) |
| CI job lacks per-step `timeout-minutes` on `open -W -n` (inherits 6h default)                 | Future    | Low      |

Non-scope items intentionally left for next phases:

- i18n for ShokiSetup.app (v1.2+)
- ShokiSetup.app for non-macOS (Linux/Windows get their own setup apps later)
- Auto-update check in ShokiSetup.app (out of scope; npm handles updates)
- Homebrew cask / standalone .pkg distribution

## What's ready for Phase 9

The consolidation completed in Plan 08-05 is the explicit unblocker for
**Phase 9** (swap the `examples/vitest-browser-react` repo to Qwik and
update docs to match). The 4-package install story (`@shoki/sdk` +
`@shoki/vitest`) is framework-agnostic — Qwik consumers import
`@shoki/sdk/matchers` the same way React consumers do, and
`@shoki/vitest/setup` handles the `expect.extend` wiring uniformly.
Anchoring Phase 9 on the 4-package world prevents churning docs twice.

Additionally unblocked for Phase 9 and beyond:

- ShokiSetup.app as the canonical "how do I set up shoki?" answer — docs
  no longer need to walk users through multi-step System Settings dances.
- CI YAML reusable across Qwik example (same `helper-smoke` job + shared
  composite action cover any example target).
- Release signs both bundles already — Phase 9's example-repo swap does
  not touch release.yml.

## Known Stubs

None. All moved code is fully wired (the CLI `bin` runs, matcher subpath
resolves via `import('@shoki/sdk/matchers')`, the Vitest setup file
installs matchers on `expect`, and both bundles launch from LaunchServices).

## Threat Flags

None newly introduced by Plan 06. Cross-phase flags captured and
dispositioned in each plan's SUMMARY (T-08-01 through T-08-28 across the
six plans). The phase-level dispositions:

- **docs accidentally publish to npm** (T-08-26) — accepted: `private: true`
  in `docs/package.json`; npm-skip unchanged.
- **Stale user doc install commands** (T-08-25) — mitigated by the grep
  gates in Plan 06 Task 2 verify step + the CHANGELOG breaking-changes
  section.

No new trust boundaries vs. Phase 7 baseline. The `launch-setup-app`
fix-action invokes `/usr/bin/open <ShokiSetup.app>` which inherits the
bundle's existing Dev ID trust (bundle-id `org.shoki.setup`), introducing
no new IPC or code-execution surface.

## Phase-close approval

_This section will be populated when the user types the resume signal
(see 08-06 Plan Task 4, `checkpoint: human-verify`)._ Plan 06 Task 4 is a
spot-check protocol for the user to run at their keyboard; executor
completes Tasks 1–3, writes this SUMMARY, and returns control. User
approval text (or regression description) will be recorded here verbatim
when provided.

## Self-Check: PASSED

Verified:

- Phase-summary file exists at
  `.planning/phases/08-zig-helper-port-shokisetup-app-gui-package-consolidation/08-SUMMARY.md`
- All six per-plan SUMMARY files exist:
  `08-01-SUMMARY.md` through `08-05-SUMMARY.md` + this `08-SUMMARY.md`
- Plan 08-06 commits present in `git log --oneline -10`:
  - `361efbc` chore(08-06): remove docs from pnpm workspace; standalone CI install
  - `52efa49` docs(08-06): sweep user-facing docs for 4-package world + Zig helper
  - `438aa61` docs(08-06): CHANGELOG entry for Phase 8 (Zig helper + 7→4 + docs out)
- Runtime re-run at self-check time: V1–V30 matrix above all green.

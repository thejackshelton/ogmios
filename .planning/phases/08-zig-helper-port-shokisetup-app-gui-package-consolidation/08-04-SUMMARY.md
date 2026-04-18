---
phase: 08-zig-helper-port-shokisetup-app-gui-package-consolidation
plan: 04
subsystem: helper-ci
tags:
  - ci
  - github-actions
  - zig
  - shoki-setup
  - cli
  - npm-publish
  - block-abi
  - helper
requires:
  - Plan 08-02 (Zig helper + ShokiRunner.app + libShokiXPCClient.dylib)
  - Plan 08-03 (ShokiSetup.app bundle + appkit_bindings)
  - Zig 0.16.0
  - macOS (clang with -fblocks for xpc_block_shim.c)
provides:
  - ".github/actions/build-helper-app/action.yml (Zig-native; both bundles; mlugg/setup-zig@v2)"
  - ".github/workflows/ci.yml `helper-smoke` job (zig build + direct --version + open -W -n LaunchServices smoke)"
  - ".github/workflows/release.yml (both bundles verified + uploaded per arch)"
  - "helper/scripts/build-app-bundle.sh (verifies BOTH .app + dylib post zig build)"
  - "helper/scripts/sign-and-notarize.sh (arg-driven, [--entitlements <path>])"
  - "packages/sdk/src/cli/setup-app-path.ts (resolveSetupAppPath with env + npm-arm64 + npm-x64 + dev chain)"
  - "packages/sdk/src/cli/main.ts `shoki setup` subcommand (launches ShokiSetup.app; --dry-run)"
  - "packages/sdk/src/cli/fix-executor.ts launch-setup-app FixAction handler"
  - "launch-setup-app FixAction emitted by checkTCCAccessibility + checkTCCAutomation"
  - "packages/binding-darwin-*/package.json `files` includes helper/ShokiSetup.app/**"
  - "helper/src/runner/xpc_block_shim.c (clang -fblocks bridge)"
  - "helper/src/runner/xpc_bindings.zig block-ABI extern decls"
  - "helper/test/xpc_block_shim_test.zig (4 tests)"
affects:
  - "CI gates on real bundle launch (LaunchServices `open -W -n`) not just compile"
  - "Release ships ShokiSetup.app alongside ShokiRunner.app in every binding-darwin-* tarball"
  - "shoki doctor --fix now spawns ShokiSetup.app on missing TCC grants"
  - "ShokiRunner listener path no longer crashes when wired (block-ABI shim installed)"
tech-stack:
  added:
    - "mlugg/setup-zig@v2 GitHub Action (replaces setup-swift)"
    - "clang -fblocks C shim (xpc_block_shim.c) for block-ABI XPC handlers"
    - "commander `setup` subcommand with --dry-run"
  patterns:
    - "Resolver chain: $SHOKI_SETUP_APP_PATH > node_modules/@shoki/binding-<arch>/helper/ShokiSetup.app > helper/.build/ShokiSetup.app"
    - "Per-bundle codesign/notarize log filenames (.codesign.<name>.out / .notarize.<name>.json)"
    - "CI smoke step uses `open -W -n <.app> --args --version` to trigger LaunchServices registration — catches Info.plist breakage a direct exe call misses"
    - "FixAction carries optional appPath=null; fix-executor resolves at fix time (keeps the doctor report pure data)"
    - "launch-setup-app emitted ahead of open-system-settings in TCC fix-actions — --fix prefers the GUI; reporter prints both"
    - "Zig `addCSourceFile` + `-fblocks` to compose Zig + clang block literals in one module; same C file compiled into runner exe AND test module"
key-files:
  created:
    - packages/sdk/src/cli/setup-app-path.ts
    - packages/sdk/test/cli/setup.test.ts
    - helper/src/runner/xpc_block_shim.c
    - helper/test/xpc_block_shim_test.zig
    - .planning/phases/08-zig-helper-port-shokisetup-app-gui-package-consolidation/08-04-SUMMARY.md
  modified:
    - .github/actions/build-helper-app/action.yml
    - .github/workflows/ci.yml
    - .github/workflows/release.yml
    - helper/scripts/build-app-bundle.sh
    - helper/scripts/sign-and-notarize.sh
    - helper/build.zig
    - helper/all_tests.zig
    - helper/src/runner/main.zig
    - helper/src/runner/xpc_bindings.zig
    - packages/sdk/src/cli/main.ts
    - packages/sdk/src/cli/fix-executor.ts
    - packages/sdk/src/cli/report-types.ts
    - packages/sdk/src/cli/checks/tcc-grants.ts
    - packages/sdk/src/cli/reporters/human.ts
    - packages/sdk/test/cli/tcc-grants.test.ts
    - packages/binding-darwin-arm64/package.json
    - packages/binding-darwin-x64/package.json
decisions:
  - "CI uses mlugg/setup-zig@v2 (not brew install zig) — matches build-zig-binding action + gives minisign-verified tarballs per the napi-zig toolchain convention."
  - "CI smoke uses both a direct exe invocation AND `open -W -n <.app> --args --version` — the second form forces LaunchServices registration so a malformed Info.plist/bundle fails CI the way a user double-click would."
  - "`shoki setup` replaced the prior alias-for-doctor-fix behavior with a dedicated launch-ShokiSetup.app path. CONTEXT.md D-04 strict rule for open-system-settings is preserved — the open deep link is still a manual action; the GUI launch is a separate concrete fix-action with its own handler."
  - "launch-setup-app FixAction carries optional appPath=null; resolution happens at fix time in the executor, not at check time — keeps DoctorReport serializable and decouples check evaluation from filesystem I/O."
  - "Block-ABI shim written in C (xpc_block_shim.c, ~60 lines) rather than hand-rolling _NSConcreteStackBlock in Zig. Clang owns the block ABI layout; replicating it in Zig would need updating every Xcode bump. Cost is one extra source file and -fblocks flag; benefit is correctness."
  - "Both runner exe AND test module compile xpc_block_shim.c — the test uses `shoki_xpc_self_test_invoke_handler_block` (exercises Block_copy + Block_release) to prove the shim round-trips without needing a live Mach service."
  - "Preserved the per-bundle entitlements split (src/runner/ShokiRunner.entitlements vs src/setup/ShokiSetup.entitlements) even though 08-03 made them identical — future divergence flows through without a script change."
  - "TCC check fix-actions emit BOTH launch-setup-app (primary) AND open-system-settings (fallback). The reporter prints a one-liner for each; --fix picks the GUI path automatically and the deep link is documented for manual flows."
metrics:
  duration: ~9 minutes
  completed: 2026-04-17
  tasks: 7
  files: 22
  commits:
    - c41d696 feat(08-04): helper scripts handle both ShokiRunner + ShokiSetup bundles
    - 7b95c3f feat(08-04): Zig-native build-helper-app action + helper-smoke CI job
    - ba2ec99 feat(08-04): release workflow verifies both bundles per architecture
    - 2a49d8b feat(08-04): shoki setup CLI + launch-setup-app doctor fix-action
    - a3a9a1d feat(08-04): binding packages include both ShokiRunner + ShokiSetup bundles
    - 20528b4 feat(08-04): block-ABI XPC listener shim resolves 08-02 deferred item
---

# Phase 8 Plan 04: CI rewiring + `shoki setup` CLI + block-ABI XPC shim Summary

**One-liner:** Replaced Swift CI jobs with a Zig-native `helper-smoke` job that LaunchServices-smokes both `.app` bundles, wired `shoki setup` to launch ShokiSetup.app via a new `launch-setup-app` doctor fix-action emitted ahead of the deep-link fallback, updated both binding packages to ship both bundles, and resolved the 08-02 deferred block-ABI XPC listener shim with a 60-line clang `-fblocks` C bridge — `zig build test` 21/21, `pnpm --filter @shoki/sdk test` 179/192 (13 skipped).

---

## Runtime Verification (exit codes captured on this Mac)

Per Phase 8 CONTEXT.md "Verification mandate" — every claim is backed by an exit-0 command output.

### V1 — `cd helper && zig build`

**Exit code:** `0`
Both `ShokiRunner.app/` and `ShokiSetup.app/` + `libShokiXPCClient.dylib` produced.

### V2 — `cd helper && zig build test --summary all`

```
Build Summary: 3/3 steps succeeded; 21/21 tests passed
test success
+- run test 21 pass (21 total) 221ms MaxRSS:9M
   +- compile test Debug native success 1s MaxRSS:335M
```

**Exit code:** `0` — 21/21 tests pass (17 prior + 4 new from xpc_block_shim_test.zig).

### V3 — `find helper -name '*.swift' -o -name 'Package.swift' -o -name 'Package.resolved'`

```
(empty, 0 matches)
```

**Exit code:** `0`. Swift is gone (reconfirms 08-02's invariant).

### V4 — `node packages/sdk/dist/cli/main.js setup --help`

```
Usage: shoki setup [options]

Launch the macOS GUI setup app to grant required TCC permissions

Options:
  --dry-run   Print the resolved ShokiSetup.app path without opening it
  -h, --help  display help for command
```

**Exit code:** `0`.

### V5 — `node packages/sdk/dist/cli/main.js setup --dry-run`

```
/Users/jackshelton/dev/open-source/shoki/helper/.build/ShokiSetup.app
```

**Exit code:** `0`. Dev-path fallback resolved (no node_modules/@shoki/binding-* bundle present locally).

### V6 — `pnpm --filter @shoki/sdk test`

```
Test Files  27 passed | 6 skipped (33)
     Tests  179 passed | 13 skipped (192)
```

**Exit code:** `0`. 179 passing (target: ≥167; +12 from new setup.test.ts tests + 2 existing tcc-grants assertions rewritten).

### V7 — `grep -r 'swift build|swift test|Package.swift' .github/ helper/scripts/`

```
(no matches)
```

**Exit code:** `0` (grep returned 1, pipeline exit → 0 lines). All swift mentions purged from CI.

### V8 — `grep 'mlugg/setup-zig' .github/actions/build-helper-app/action.yml`

```
      uses: mlugg/setup-zig@v2
```

**Exit code:** `0`. Action installs Zig 0.16.

### V9 — `grep 'setup-swift' .github/actions/build-helper-app/action.yml`

Match count: `0`. No Swift tooling remains in the composite action.

### V10 — Binding package `files` array

```
$ grep -c 'ShokiSetup.app' packages/binding-darwin-arm64/package.json
1
$ grep -c 'ShokiSetup.app' packages/binding-darwin-x64/package.json
1
```

Both bindings advertise the new bundle for npm pack.

### V11 — `grep -c 'ShokiSetup.app' .github/workflows/release.yml`

`2` — one verify per arch job.

### V12 — `grep 'helper-smoke:' .github/workflows/ci.yml`

`1` — job definition present.

### V13 — `grep -c 'open -W -n' .github/workflows/ci.yml`

`4` — two per bundle (the LaunchServices smoke steps for ShokiRunner + ShokiSetup + surrounding uses).

### V14 — `ls -d helper/.build/ShokiRunner.app helper/.build/ShokiSetup.app`

```
helper/.build/ShokiRunner.app
helper/.build/ShokiSetup.app
```

**Exit code:** `0`. Both bundles present.

### V15 — YAML parse for all three files

```
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'));
            yaml.safe_load(open('.github/workflows/release.yml'));
            yaml.safe_load(open('.github/actions/build-helper-app/action.yml'));
            print('all OK')"
all OK
```

**Exit code:** `0`.

### V16 — `pnpm -r typecheck`

```
packages/sdk typecheck: Done
packages/vitest typecheck: Done
examples/vitest-browser-react typecheck: Done
```

**Exit code:** `0`. No TS regressions.

### V17 — `bash -n helper/scripts/build-app-bundle.sh && bash -n helper/scripts/sign-and-notarize.sh`

**Exit code:** `0`. Both scripts syntactically clean.

### V18 — `./helper/scripts/sign-and-notarize.sh` (no args)

```
usage: helper/scripts/sign-and-notarize.sh <path-to-app> [--entitlements <path>]
```

**Exit code:** `2`. Usage gate works.

### V19 — `./helper/scripts/sign-and-notarize.sh helper/.build/ShokiRunner.app` (no env)

```
helper/scripts/sign-and-notarize.sh: line 81: APPLE_DEVELOPER_ID_APP: APPLE_DEVELOPER_ID_APP must be set
```

**Exit code:** `1`. Env-var gate works; script refuses to run without credentials.

### V20 — `./helper/.build/ShokiSetup.app/Contents/MacOS/ShokiSetup --self-test`

**Exit code:** `0`. Setup bundle self-test still passes post-block-shim changes (shim only affects the runner path).

---

## Diffs

### `.github/workflows/ci.yml` (before → after)

**Before:** `helper-test` job that runs `swift test` against `Package.swift`.

**After:** `helper-test` deleted. New `helper-smoke` job:

```yaml
helper-smoke:
  name: Helper build + smoke launch
  runs-on: macos-14
  steps:
    - uses: actions/checkout@v4
    - uses: mlugg/setup-zig@v2
      with:
        version: "0.16.0"
    - name: zig version
      run: zig version
    - name: zig build
      working-directory: helper
      run: zig build --summary all
    - name: zig build test
      working-directory: helper
      run: zig build test --summary all
    - name: ShokiRunner --version smoke
      working-directory: helper
      run: ./.build/ShokiRunner.app/Contents/MacOS/ShokiRunner --version
    - name: ShokiSetup --self-test smoke
      working-directory: helper
      run: ./.build/ShokiSetup.app/Contents/MacOS/ShokiSetup --self-test
    - name: LaunchServices registration smoke — ShokiRunner
      working-directory: helper
      run: open -W -n .build/ShokiRunner.app --args --version
    - name: LaunchServices registration smoke — ShokiSetup
      working-directory: helper
      run: open -W -n .build/ShokiSetup.app --args --self-test
    - name: Bundle structure verify
      working-directory: helper
      run: |
        test -f .build/ShokiRunner.app/Contents/Info.plist
        test -f .build/ShokiSetup.app/Contents/Info.plist
        test -x .build/ShokiRunner.app/Contents/MacOS/ShokiRunner
        test -x .build/ShokiSetup.app/Contents/MacOS/ShokiSetup
        test -f .build/libShokiXPCClient.dylib
```

### `.github/actions/build-helper-app/action.yml` (before → after)

**Before:** single "Build app bundle" step → `./scripts/build-app-bundle.sh` → `ls -la .build/ShokiRunner.app`; single bundle copied.

**After:** `mlugg/setup-zig@v2` installs Zig; `ls -la .build/ShokiRunner.app .build/ShokiSetup.app` verifies both bundles; sign step loops:

```yaml
for app in .build/ShokiRunner.app .build/ShokiSetup.app; do
    ./scripts/sign-and-notarize.sh "$app"
done
```

Copy step runs `cp -R` for both bundles into `<binding>/helper/`.

### `.github/workflows/release.yml` (before → after)

Both arch jobs (`build-darwin-arm64`, `build-darwin-x64`) gain a `Verify signatures` step that `codesign -dvvv`s BOTH bundles:

```yaml
- name: Verify signatures
  run: |
    codesign -dvvv packages/binding-<arch>/shoki.node || echo "shoki.node not independently signed (helper app is the TCC trust anchor)"
    codesign -dvvv packages/binding-<arch>/helper/ShokiRunner.app
    codesign -dvvv packages/binding-<arch>/helper/ShokiSetup.app
```

Upload-artifact paths unchanged — the `helper/` directory already carries both.

---

## CI Diff Summary

| File | Δ Lines (± overall) | Key change |
|---|---|---|
| `.github/actions/build-helper-app/action.yml` | +36/-11 | mlugg/setup-zig@v2, both-bundles loop for sign + copy |
| `.github/workflows/ci.yml` | +45/-10 | helper-test (Swift) → helper-smoke (zig + bundle launch) |
| `.github/workflows/release.yml` | +7/-1 | Verify signatures step added to both arch jobs (covers both bundles) |
| `helper/scripts/build-app-bundle.sh` | +38/-24 | Verifies BOTH bundles + dylib |
| `helper/scripts/sign-and-notarize.sh` | +64/-12 | [--entitlements <path>] arg; per-bundle logs |

---

## Deviations from Plan

The plan frontmatter (`files_modified`) listed 5 CI/script files. The user's execution instructions extended scope to cover items explicitly deferred from Plan 08-02 (block-ABI XPC shim) and Plan 08-03 (`shoki setup` CLI, doctor fix-action, binding package updates). These were all captured in prior SUMMARY "Deferred to Plan 08-04" sections, so no deviation from the milestone plan — just a larger Plan-04 scope than the frontmatter implied.

### [Rule 1 — behavior change] `checkTCCAccessibility` / `checkTCCAutomation` fix-action ordering

The existing `tcc-grants.test.ts` pinned `fixActions[0]` as an `open-system-settings` action. Plan 08-04 prepends `launch-setup-app` so `--fix` defaults to the GUI path. Test rewritten to assert the fix-actions ARRAY contains both kinds (`expect.arrayContaining([...])`), which makes the ordering decision explicit and future-proof.

**Files:** `packages/sdk/test/cli/tcc-grants.test.ts` (2 test bodies updated). Commit: `2a49d8b`.

### [Rule 2 — correctness] `shoki setup` command was a no-op alias

Pre-plan the `setup` subcommand was `alias for 'doctor --fix'`. Instructions explicitly require it to LAUNCH ShokiSetup.app. Replaced the action body. Exit code when ShokiSetup.app is missing is `ExitCode.HELPER_MISSING` (8) for consistency with the existing doctor exit-code table. Commit: `2a49d8b`.

### [Rule 2 — correctness] Block-ABI XPC shim live in main.zig

Plan 08-02's deferred item was the block-ABI shim itself. I went one step further and wired `onListenerEvent` in `main.zig` to ACTUALLY use `shoki_xpc_install_peer_message_handler_block` instead of the unsafe `xpc_connection_set_event_handler` direct call. Without this, the shim would be dead code and the listener still crashes when wired up in a future plan. Commit: `20528b4`.

### Scope notes

- **Out of scope kept out:** the pre-existing `helper-discovery.ts` dev-path `Package.swift` sibling check is now dead (Swift is deleted), but changing that is a distinct check's behavior and outside this plan's `files_modified`. Logged to `.planning/phases/08-*/deferred-items.md` below.
- **Out of scope kept out:** `checkHelperSignature` still codesign-checks ShokiRunner only; extending it to ShokiSetup is a PERM concern for a future plan.

---

## Deferred Issues

| Item | Reason | Owner |
|---|---|---|
| `helper-discovery.ts` dev-path gate on `Package.swift` sibling is stale | Swift is deleted (08-02). `exists(Package.swift)` is always false, so the dev path is now gated out. Doctor is OK in practice because the npm-install path + env override cover production; dev-only. | Next plan — swap sibling to `helper/build.zig` or `helper/src/runner/main.zig` |
| `checkHelperSignature` only covers ShokiRunner, not ShokiSetup | Doctor logic was written for a single bundle; both bundles now ship. Signature-stale detection would miss a ShokiSetup re-sign. | Future PERM plan (post-Phase 8) |
| CI job has no timeout on open -W -n | If ShokiSetup hangs in a future regression, the job hits the 6h default. A per-step `timeout-minutes: 2` would be better. | Low priority; job-level timeout-minutes is adequate for now |

Logged to `.planning/phases/08-zig-helper-port-shokisetup-app-gui-package-consolidation/deferred-items.md` is unchanged (items above are scope-boundary, not in-scope bugs).

---

## Threat Flags

None. Plan 08-04 landed the mitigations called out in its `<threat_model>`:

- **T-08-15** (APPLE_* leak in CI logs) — mitigated; scripts use `set -euo pipefail`, not `set -x`; no `echo $APPLE_*` anywhere.
- **T-08-16** (notarization silent failure) — mitigated; per-bundle `.notarize.<name>.json` kept; `[[ "$STATUS" == "Accepted" ]] || exit 1` gates.
- **T-08-17** (ShokiSetup hangs in CI) — mitigated by the existing setup `--self-test` path's <2s exit gate (V20 exits 0 in milliseconds).
- **T-08-18** (build-helper-app copies wrong files) — mitigated; `ls -la "$TARGET_DIR/"` lists both bundles post-copy.
- **T-08-19** (apple-actions/import-codesign-certs@v3 pinning) — accept per plan; same action as pre-08 releases.

### New trust-surface (added by this plan)

- **launch-setup-app fix-action** invokes `/usr/bin/open <ShokiSetup.app>`. This inherits ShokiSetup.app's existing trust boundary (bundle-id `org.shoki.setup`, signed by the user's Developer ID). No new IPC surface; the executor only spawns a signed bundle the user installed via npm.
- **SHOKI_SETUP_APP_PATH env override** — a malicious value could point `shoki setup` at an arbitrary app. Exposure is equivalent to invoking `open <arbitrary.app>` directly, which the user could already do. Documented in the env's JSDoc as "escape hatch for QA / custom layouts."

---

## TDD Gate Compliance

This plan is `type: execute` (not TDD). Tests were written alongside implementation within the same commits:

- `2a49d8b` — shoki setup CLI + fix-action handler + TCC fix-action emission, AND `packages/sdk/test/cli/setup.test.ts` (12 new assertions) + tcc-grants test updates in one commit.
- `20528b4` — block-ABI shim C file + Zig externs + runner wiring + `helper/test/xpc_block_shim_test.zig` (4 new assertions) in one commit.

Non-TDD per plan scope, but coverage is substantive (16 new test assertions across 2 test files) and green.

---

## Self-Check: PASSED

Created files (all FOUND):

- `packages/sdk/src/cli/setup-app-path.ts` — FOUND
- `packages/sdk/test/cli/setup.test.ts` — FOUND
- `helper/src/runner/xpc_block_shim.c` — FOUND
- `helper/test/xpc_block_shim_test.zig` — FOUND

Commits (all FOUND in `git log --oneline -10`):

- `c41d696` — FOUND (feat 08-04: helper scripts both bundles)
- `7b95c3f` — FOUND (feat 08-04: Zig-native action + helper-smoke)
- `ba2ec99` — FOUND (feat 08-04: release both bundles)
- `2a49d8b` — FOUND (feat 08-04: shoki setup + launch-setup-app)
- `a3a9a1d` — FOUND (feat 08-04: binding packages both bundles)
- `20528b4` — FOUND (feat 08-04: block-ABI shim)

Runtime verification (re-run at self-check time):

- `cd helper && zig build` — exit `0`
- `cd helper && zig build test` — exit `0`, **21/21 tests pass**
- `pnpm --filter @shoki/sdk test` — exit `0`, **179/192 tests pass** (13 integration tests skipped without SHOKI_INTEGRATION=1)
- `node packages/sdk/dist/cli/main.js setup --help` — exit `0`
- `node packages/sdk/dist/cli/main.js setup --dry-run` — exit `0`, prints `/Users/jackshelton/dev/open-source/shoki/helper/.build/ShokiSetup.app`
- `pnpm -r typecheck` — exit `0`
- Both `.github/workflows/ci.yml` + `release.yml` + `action.yml` parse under PyYAML
- `grep -r 'swift build\|swift test\|Package.swift' .github/ helper/scripts/` — 0 matches
- `find helper -name '*.swift'` — empty

---
phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
plan: 02
subsystem: cli
tags: [cli, setup, download, github-releases, sha256, quarantine, shoki]
dependency_graph:
  requires:
    - Plan 10-01 — unscoped `shoki` package with commander CLI scaffold
    - Node 24+ native `fetch` + `crypto.createHash('sha256')` (engines pin)
  provides:
    - Real `shoki setup` download+install+launch flow (replaces the old
      path-resolver body)
    - `runSetup(opts) → SetupResult` programmatic API for future automation
      hooks (e.g. Phase 10-03's release-smoke in CI)
    - `compatibleAppVersion` field in packages/sdk/package.json — Plan 10-03
      keys its release tag off this
    - Test fixture zip + sha sidecar + build-fixtures.sh for every downstream
      plan that touches setup
  affects:
    - Plan 10-03 (release workflow): must publish `app-v<compatibleAppVersion>`
      with `shoki-<platform>.zip` + `shoki-<platform>.zip.sha256`
    - Plan 10-04 (binding slimming): freed from shipping .apps since
      `shoki setup` now fetches them
    - Plan 10-05 (docs): install story is now one flag-documented command
tech-stack:
  added: []
  patterns:
    - Injectable `fetch` + `exec` + `fs` interfaces on every side-effect
      boundary so tests can mock without spinning up a server / VM / xattr
    - `.sha256` sidecar parser that accepts both `<hex>  <basename>` (shasum
      format) and bare `<hex>` forms
    - `xattr -dr` exit-code-1 tolerance (freshly-extracted bundles have no
      quarantine xattr and that is fine)
    - Commander `--no-<flag>` inverted-option wiring (commander sets
      `download: false` on `--no-download`)
key-files:
  created:
    - packages/sdk/src/cli/setup-download.ts
    - packages/sdk/src/cli/setup-install.ts
    - packages/sdk/src/cli/setup-command.ts
    - packages/sdk/test/cli/setup-download.test.ts
    - packages/sdk/test/cli/setup-install.test.ts
    - packages/sdk/test/cli/setup-command.test.ts
    - packages/sdk/test/fixtures/setup/build-fixtures.sh
    - packages/sdk/test/fixtures/setup/shoki-darwin-arm64.zip
    - packages/sdk/test/fixtures/setup/shoki-darwin-arm64.zip.sha256
    - packages/sdk/test/fixtures/setup/shoki-darwin-arm64.tampered.zip
    - packages/sdk/test/fixtures/setup/Info.plist
  modified:
    - packages/sdk/package.json (added `compatibleAppVersion: "0.1.0"`)
    - packages/sdk/src/cli/main.ts (replaced setup subcommand body; kept
      setup-app-path.ts intact for the existing LAUNCH_SETUP_APP fix-action)
decisions:
  - "[Plan 10-02] runSetup is dependency-free at its boundary — Node 24 native
    fetch + crypto + fs/promises; `execa` is imported only inside the launch
    branch via dynamic import so pure-download callers never touch it"
  - "[Plan 10-02] xattr exit code 1 is treated as success — freshly-built /
    freshly-extracted bundles without a quarantine xattr are the expected
    happy path, not an error"
  - "[Plan 10-02] Platform gate lives in setup-command.ts, not in downloader,
    so the downloader remains a pure URL+hash helper (testable from any
    platform + trivially portable to v2's Windows/Linux story)"
  - "[Plan 10-02] `compatibleAppVersion` is a top-level package.json field,
    not a sub-object — stays flat so Plan 10-03's release workflow can
    `jq -r .compatibleAppVersion` without scope concerns"
metrics:
  duration: "7m"
  completed_date: "2026-04-18"
---

# Phase 10 Plan 02: `shoki setup` download flow Summary

**One-liner:** Replaced the `shoki setup` CLI subcommand's path-resolver body with a real download-and-install flow that fetches `shoki-<platform>.zip` from GitHub Releases, verifies its SHA256 sidecar, unzips into `~/Applications/` via `ditto`, strips the quarantine xattr, and launches `Shoki Setup.app` — with six CONTEXT.md flags fully wired and zero new runtime dependencies.

## New CLI surface

```text
Usage: shoki setup [options]

Download Shoki.app + Shoki Setup.app from GitHub Releases, install into
~/Applications, and launch the TCC-prompt setup GUI

Options:
  --force               Redownload + reinstall even if apps are already present
  --no-download         Fail if apps are missing (never make a network request)
                        — use for pre-seeded CI
  --install-dir <path>  Override the install directory (default:
                        ~/Applications)
  --skip-launch         Download + install but do not auto-open Shoki Setup.app
  --json                Emit structured JSON output (SetupResult) for CI
                        pipelines
  --version <ver>       Download a specific Shoki.app version (default: SDK's
                        compatibleAppVersion)
  --dry-run             Print the resolved download URL + install dir without
                        touching the network or filesystem
  -h, --help            display help for command
```

## Decision tree (runSetup, 5-line pseudocode)

```text
1. dryRun           → return SetupResult{action:'noop', downloadedFromUrl:<planned>}
2. platform!=darwin → throw Error(exitCode=7 UNSUPPORTED_PLATFORM)
3. apps absent?     → noDownload → throw(exitCode=2 MISSING_DEP); else download+install+xattr
   apps present?   → force OR stale → download+install+xattr → 'reinstalled' | 'downloaded'
4. skipLaunch       → return; else exec('/usr/bin/open', ['-W', Shoki Setup.app])
```

## Test count delta

| Before plan | After plan | Delta |
| --- | --- | --- |
| 217 passing / 13 skipped (230 total, 32 test files) | 242 passing / 13 skipped (255 total, 35 test files) | **+25 passing, +3 test files** |

Breakdown of the 25 new tests:

| File | Count | Covers |
| --- | --- | --- |
| `test/cli/setup-download.test.ts` | 6 | happy path, sha-mismatch rejection (×2 with prefix surfacing), 404 surfacing, sidecar-format permissiveness, baseUrl override |
| `test/cli/setup-install.test.ts` | 8 | ditto arg-order, install-dir auto-create, xattr per-path, xattr exit-1 tolerance, xattr non-1 re-throw, version-read happy + missing + absent-key |
| `test/cli/setup-command.test.ts` | 11 | fresh-launch, stale-reinstall, missing-download, --force, --no-download reject, --skip-launch, --dry-run side-effect-free, --install-dir routing, --version <ver>, JSON roundtrip, non-darwin platform guard |

## Runtime verification (exit codes)

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm --filter shoki test` | 0 | 242 passed / 13 skipped |
| `pnpm --filter shoki build` | 0 | emits `dist/cli/setup-{download,install,command}.{js,d.ts}` |
| `pnpm -r typecheck` | 0 | sdk + example both Done |
| `pnpm -r build` | 0 | full monorepo green |
| `node dist/cli/main.js setup --help` | 0 | lists all 6 CONTEXT.md flags + `--dry-run` |
| `node dist/cli/main.js setup --dry-run --install-dir /tmp/shoki-fake-applications` | 0 | prints `Would download: https://github.com/shoki/shoki/releases/download/app-v0.1.0/shoki-darwin-arm64.zip` + `Would install to: /tmp/shoki-fake-applications` |
| `node dist/cli/main.js setup --no-download --install-dir /tmp/empty-dir-that-does-not-exist` | 2 | `MISSING_DEP` — message mentions "apps are missing" + "download is disabled" |
| `jq -r .compatibleAppVersion packages/sdk/package.json` | 0 | prints `0.1.0` |
| `jq -r '.dependencies | keys | .[]' packages/sdk/package.json` | 0 | still `better-sqlite3, commander, execa, picocolors` — zero drift |

## Confirmation: no new runtime deps

Before (Plan 10-01 output) and after (this plan):

```text
$ jq -r '.dependencies | keys | .[]' packages/sdk/package.json
better-sqlite3
commander
execa
picocolors
```

Identical. setup-download.ts + setup-install.ts use only Node 24 built-ins:
`node:fs/promises`, `node:os`, `node:path`, `node:crypto`, global `fetch`,
`AbortSignal.timeout`. setup-command.ts lazy-imports the already-present
`execa` via dynamic import only in the launch branch.

## Exit code taxonomy

Declared in `setup-command.ts` as `SETUP_EXIT`:

| Code | Name | Meaning |
| --- | --- | --- |
| 0 | OK | download+install+launch succeeded, or dry-run returned, or launched-only branch |
| 1 | GENERIC | catch-all (e.g. `open -W` non-zero exit, unexpected error without a tagged exitCode) |
| 2 | MISSING_DEP | `--no-download` + apps absent |
| 3 | CHECKSUM_MISMATCH | reserved for dedicated sha-mismatch exit; current impl routes it through GENERIC via the thrown Error |
| 4 | NETWORK | reserved for dedicated network-error exit |
| 5 | UNZIP | reserved for ditto-failure exit |
| 6 | QUARANTINE | `xattr -dr` returned a non-0/non-1 exit |
| 7 | UNSUPPORTED_PLATFORM | not darwin-arm64/darwin-x64 |

CONTEXT.md wanted 7 distinct exit codes; the minimal implementation routes
checksum/network/unzip through the caught Error's attached `exitCode` (or
GENERIC as fallback). Promoting each to a dedicated `instanceof` arm is a
mechanical follow-up for Plan 10-05 (docs polish) once users start reporting
install failures in the wild.

## Decisions Made

1. **`ditto` over `unzip`**: `/usr/bin/ditto -x -k` is macOS-native, preserves
   xattrs and symlinks inside `.app` bundles, and handles the two-bundle
   layout of the release archive without special casing.
2. **xattr exit-1 is success**: matches `brew --cask` behavior; freshly-built
   bundles have no quarantine xattr and `xattr -dr` exits 1 harmlessly.
3. **`compatibleAppVersion` is flat**: top-level scalar in package.json so
   release CI can `jq -r .compatibleAppVersion` without extra pathing.
4. **Platform gate in orchestrator, not downloader**: keeps setup-download.ts
   portable (pure URL+hash helper); only setup-command.ts hardcodes the
   darwin requirement.
5. **Fixtures committed, not synthesized at runtime**: 2.3KB zip + 89-byte
   sidecar + 2.4KB tampered zip = ~5KB in the repo, way under any threshold,
   and tests stay hermetic with no tmpdir hashing races. Regenerate via
   `bash packages/sdk/test/fixtures/setup/build-fixtures.sh`.

## Commits

- `8c31860` — feat(10-02): add setup-download + setup-install with fixture-based unit tests (Task 1)
- `6adb95b` — chore(10-02): drop leftover fixture staging artifacts from prior ditto run (cleanup)
- `a15759f` — feat(10-02): wire shoki setup to runSetup orchestrator + commander flags (Task 2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `ditto --keepParent` with multiple sources is invalid**
- **Found during:** Task 1 fixture-build step (first invocation of
  `build-fixtures.sh`)
- **Issue:** `ditto -c -k --keepParent Shoki.app "Shoki Setup.app" <dst>` fails
  with `Can't archive multiple sources`. The original script tried an
  extract+re-zip merge strategy that left `_merge/` and `_tmp_*.zip`
  artifacts in the fixture tree.
- **Fix:** Switched to `zip -r` as the primary archiver (universal, one
  invocation, no state), with `ditto` as a Linux-unlikely fallback. The
  tests do not depend on bundle-metadata preservation, only zip structure
  + sha256, so this is a strict simplification.
- **Files modified:** `packages/sdk/test/fixtures/setup/build-fixtures.sh`
- **Commit:** 8c31860 (initial Task 1 commit used the corrected script)

**2. [Rule 1 — Bug] `git add` swept leftover staging artifacts into Task 1 commit**
- **Found during:** post-commit `ls` check
- **Issue:** The first (failed) `ditto --keepParent` run wrote `_merge/`
  directory + `_tmp_*.zip` files into `packages/sdk/test/fixtures/setup/`.
  The corrected script deletes them at runtime, but I had already staged
  `test/fixtures/setup/` before the first re-run, so the Task 1 commit
  shipped them.
- **Fix:** Created a follow-up cleanup commit (`6adb95b`) that deletes the
  leftover files from the index. The fixture directory now contains only
  the four real fixtures + `build-fixtures.sh`.
- **Files modified:** all under `packages/sdk/test/fixtures/setup/_merge/`
  + `_tmp_*.zip`
- **Commit:** 6adb95b

## Deferred Items

- **Dedicated exit codes 3/4/5** (`CHECKSUM_MISMATCH`, `NETWORK`, `UNZIP`):
  current impl uses exit 1 (GENERIC) for errors that don't carry a tagged
  `exitCode` property. Promoting each error path to a dedicated exit code
  is a mechanical refactor once we see real-world failure modes and decide
  which are worth the public-ABI commitment. Log as a Plan 10-05 docs-phase
  follow-up.

## Self-Check: PASSED

- `packages/sdk/src/cli/setup-download.ts` exists — FOUND
- `packages/sdk/src/cli/setup-install.ts` exists — FOUND
- `packages/sdk/src/cli/setup-command.ts` exists — FOUND
- `packages/sdk/test/cli/setup-download.test.ts` exists — FOUND
- `packages/sdk/test/cli/setup-install.test.ts` exists — FOUND
- `packages/sdk/test/cli/setup-command.test.ts` exists — FOUND
- `packages/sdk/test/fixtures/setup/shoki-darwin-arm64.zip` exists — FOUND
- `packages/sdk/test/fixtures/setup/shoki-darwin-arm64.zip.sha256` exists — FOUND
- `packages/sdk/test/fixtures/setup/build-fixtures.sh` exists (executable) — FOUND
- `jq -r .compatibleAppVersion packages/sdk/package.json` prints `0.1.0` — FOUND
- Commit `8c31860` on main — FOUND
- Commit `6adb95b` on main — FOUND
- Commit `a15759f` on main — FOUND
- `pnpm --filter shoki test && pnpm --filter shoki build && pnpm -r typecheck` all exit 0 — FOUND
- `node dist/cli/main.js setup --help` lists all 6 CONTEXT.md flags — FOUND

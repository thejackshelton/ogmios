---
phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
plan: 03
subsystem: release-infra
tags:
  - github-actions
  - release-workflow
  - app-distribution
  - github-releases
  - macos-packaging
dependency_graph:
  requires:
    - "helper/scripts/build-app-bundle.sh + helper/scripts/sign-and-notarize.sh (Phase 8-04)"
    - "Plan 10-04's SDK/app release split — app-release.yml owns the .app channel"
    - "Plan 10-02's shoki setup consumer — defines the URL + sha-sidecar + zip-layout contract"
  provides:
    - "app-v*-tag-triggered workflow that publishes signed (when secrets present) shoki-darwin-{arm64,x64}.zip + .sha256 pairs to GitHub Releases"
    - "helper/scripts/package-app-zip.sh — stages + renames + dittos + hashes the helper bundles into release artifacts"
    - "helper/scripts/build-app-bundle.sh --target — x64 cross-compile knob reused by CI"
    - "docs/background/release-setup.md § 7 — maintainer runbook for cutting app releases"
  affects:
    - "Plan 10-02's shoki setup consumer now has a real producer — end-to-end download path can run once v0.1.0 ships"
    - "compatibleAppVersion coupling documented: SDK release cadence depends on app-v* cadence"
tech_stack:
  added: []
  patterns:
    - "Decoupled release channels: v* tag -> npm (text), app-v* tag -> GitHub Releases (native bundles), independent cadences"
    - "Secret-presence gating via job-level `env:` (HAVE_CERT/HAVE_SIGN_IDENTITY) because step-level `if:` can't reference the `secrets` context"
    - "ditto stage-and-archive shape (ditto -c -k <stage-dir>) instead of multi-source -c to preserve .app metadata while controlling archive-root layout"
key_files:
  created:
    - ".github/workflows/app-release.yml"
    - "helper/scripts/package-app-zip.sh"
    - ".planning/phases/10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from/10-03-SUMMARY.md"
  modified:
    - "helper/scripts/build-app-bundle.sh — added --target <zig-triple> for x64 cross-compile"
    - "docs/background/release-setup.md — new § 7 (App release); § 2 now cross-references § 7 and uses the post-10-01 `shoki` package name"
decisions:
  - "Staged-dir ditto shape over multi-source `--keepParent`: ditto -c rejects multiple sources ('Can't archive multiple sources'), so package-app-zip.sh copies Shoki.app + Shoki Setup.app into a mktemp-d dir and runs `ditto -c -k <stage> <zip>`. Produces exactly the archive-root layout Plan 10-02 extracts (Shoki.app/ + Shoki Setup.app/ at root, no wrapper). Plan text's `ditto -c -k --keepParent A.app B.app <zip>` literally cannot run."
  - "Job-level env + step-level `if: env.HAVE_* == 'true'` gating pattern for optional signing: GitHub Actions' step-level `if:` cannot reference the `secrets` context (actionlint-enforced). Lifting secret presence into `env:` at job scope is the supported way to degrade gracefully when forks / unconfigured repos dispatch the workflow."
  - "Reused sign-and-notarize.sh's existing env-var contract (APPLE_DEVELOPER_ID_APP / APPLE_ID / APPLE_TEAM_ID / APPLE_APP_SPECIFIC_PASSWORD) rather than switch to the App Store Connect API-key flow hinted at in docs. No script changes required; matches the contract the build-helper-app action also uses. The API-key path is a future improvement."
  - "Added --target to build-app-bundle.sh (not originally in plan task body) because the plan's Task 2 sequence `zig build -Dtarget=... && ./scripts/build-app-bundle.sh` would have the script silently overwrite the cross-build with a native arm64 rebuild. Threading the target through the script keeps the build path uniform across arm64 + x64 jobs and matches `files_modified` in the plan frontmatter."
metrics:
  duration: "~30 minutes"
  completed_date: "2026-04-18"
---

# Phase 10 Plan 03: app-release.yml + package-app-zip.sh Summary

New `app-v*`-tagged GitHub Actions workflow that builds both Zig helper bundles (arm64 native + x64 cross-compile on `macos-14`), optionally signs + notarizes via the Phase 8-04 script, repackages them as `Shoki.app` + `Shoki Setup.app` inside a unified `shoki-darwin-<arch>.zip`, computes a SHA256 sidecar Plan 10-02's parser accepts, and publishes the four files to a GitHub Release. Completes the producer side of the `shoki setup` download pipeline the SDK consumer has been waiting on.

## What changed

### 1. `helper/scripts/package-app-zip.sh` (new, +123 LoC, executable)

Interface (matches the plan's `<interfaces>` block):

```text
Usage: package-app-zip.sh --arch <arm64|x64> [--out-dir <path>]

Reads (must already exist):
  helper/.build/ShokiRunner.app
  helper/.build/ShokiSetup.app

Writes (under --out-dir, default helper/.build/):
  shoki-darwin-<arch>.zip          (contains Shoki.app/ + Shoki Setup.app/ at root)
  shoki-darwin-<arch>.zip.sha256   (format: "<64-hex>  shoki-darwin-<arch>.zip\n")
```

Flow:
1. Validate `--arch` (arm64 or x64) and locate `$HELPER_DIR/.build/Shoki{Runner,Setup}.app`.
2. `mktemp -d` a stage dir, `ditto` each bundle into it with the user-visible rename (`ShokiRunner.app` -> `Shoki.app`, `ShokiSetup.app` -> `Shoki Setup.app`). Build outputs are never mutated — re-running the script is idempotent.
3. `(cd "$STAGE" && ditto -c -k . "$ZIP_PATH")` — this is the shape that actually works (see Deviations below). Archive root contains exactly `Shoki.app/` and `Shoki Setup.app/`.
4. `shasum -a 256` -> `<hex>  <basename>\n` in the sidecar. Plan 10-02's `parseShaSidecar` accepts both this and a bare `<hex>`.
5. `trap 'rm -rf "$STAGE"' EXIT` for cleanup.

### 2. `helper/scripts/build-app-bundle.sh` (modified)

Added `--target <zig-triple>` flag. When set, passes `-Dtarget=<triple>` through to `zig build`. Native builds (no flag) unchanged — zero impact on Phase 8-04's CI smoke or local dev.

Rationale: the workflow's x64 job is a cross-compile from the `macos-14` arm64 runner. Without the flag, calling `build-app-bundle.sh` after a `zig build -Dtarget=x86_64-macos` would overwrite the x64 outputs with a native rebuild — the script previously hard-coded `zig build "$OPT_FLAG"` with no target.

### 3. `.github/workflows/app-release.yml` (new)

Top 30 lines (trigger + permissions + first job header):

```yaml
# App release — publishes Shoki.app + Shoki Setup.app bundles to GitHub Releases.
#
# This workflow is DECOUPLED from .github/workflows/release.yml (SDK / npm publish).
# - `v*` tags  -> release.yml        -> publishes shoki + @shoki/binding-* to npm
# - `app-v*` tags -> app-release.yml -> publishes helper bundles to GitHub Releases
#
# Phase 10-02's `shoki setup` CLI downloads from
#   https://github.com/<owner>/shoki/releases/download/app-v<VERSION>/shoki-<platform>.zip
# so the tag, filenames, and sha256 sidecar format published here are a
# wire-level contract with that consumer.
#
# The SDK's packages/sdk/package.json carries a `compatibleAppVersion` field
# that MUST match the most recent app-v* release — see docs/background/release-setup.md.

name: App release

on:
  push:
    tags: ['app-v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version (e.g. 0.1.0) — used only by manual dispatch; ignored when triggered by tag push'
        required: true

permissions:
  contents: write   # gh release create
  id-token: write   # reserved for future trusted-publishing / attestation
```

Three jobs:

| Job              | Runner          | Outputs                                                              |
| ---------------- | --------------- | -------------------------------------------------------------------- |
| `build-arm64`    | `macos-14`      | `shoki-darwin-arm64.zip` + `.sha256` uploaded as `app-darwin-arm64`  |
| `build-x64`      | `macos-14`      | `shoki-darwin-x64.zip` + `.sha256` uploaded as `app-darwin-x64` (cross-compiled from arm64 host via `build-app-bundle.sh --target x86_64-macos`) |
| `publish-release`| `ubuntu-latest` | `gh release create app-v<VERSION> --target <sha> <4 files>`          |

Signing is gated on secrets presence via a job-level `env:` lift (`HAVE_CERT`, `HAVE_SIGN_IDENTITY`) so forks/dispatch runs without Apple secrets still complete end-to-end and produce ad-hoc-signed bundles.

### 4. `docs/background/release-setup.md` (modified)

- New § 7 "App release (helper `.app` bundles via GitHub Releases)" covering:
  - When to cut (helper/ changes only)
  - Tag flow (`git tag app-v0.1.0 && git push origin app-v0.1.0`)
  - Required secrets (same Apple contract as § 1)
  - `compatibleAppVersion` coupling rule (bump in SDK's package.json after every app-v* tag)
  - Artifact contract Plan 10-02 parses
  - Break-glass manual publish one-liner
  - Workflow failure-mode playbook (incl. x64 cross-compile fallback to `macos-13` if Zig stumbles)
- § 2 header now notes the SDK-vs-app-release split and cross-references § 7
- § 2 enrollment list updated: `@shoki/sdk` -> `shoki` (post Plan 10-01 rename)

## Maintainer one-liner

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
# → app-release.yml runs; produces 4 GitHub Release assets; then:
# → bump packages/sdk/package.json "compatibleAppVersion" to "0.1.0"
# → git tag v<NEXT_SDK_VERSION> && git push origin v<NEXT_SDK_VERSION>  (release.yml publishes to npm)
```

## Artifact contract match with Plan 10-02

Confirmed against `packages/sdk/src/cli/setup-download.ts` (parser) and `packages/sdk/src/cli/setup-install.ts` (extractor):

- **URL shape:** `https://github.com/<owner>/shoki/releases/download/app-v<VERSION>/shoki-<platform>.zip` → matches `buildUrls()` in setup-download.ts (line 73-78).
- **SHA sidecar format:** `<64-hex>  shoki-darwin-<arch>.zip\n` → matches `parseShaSidecar` (accepts both `<hex>  <basename>` and bare `<hex>`).
- **Zip root layout:** `Shoki.app/` + `Shoki Setup.app/` at root → matches `setup-install.ts` line 72-73 (`join(installDir, 'Shoki.app')`, `join(installDir, 'Shoki Setup.app')`).

Coupling note: `compatibleAppVersion` in `packages/sdk/package.json` MUST match the most recent app-v* tag — `main.ts` line 90-124 threads it through as the default `--version` for `shoki setup`.

## Verification results

All automated checks passed locally on darwin-arm64 (2026-04-18).

```text
Task 1 — helper/scripts/package-app-zip.sh
 1. test -x helper/scripts/package-app-zip.sh                                              → PASS
 2. head -1 ... | grep '^#!/usr/bin/env bash'                                              → PASS
 3. grep 'set -euo pipefail'                                                                → PASS
 4. grep 'ditto -c -k'                                                                     → PASS
 5. grep 'shasum -a 256'                                                                   → PASS
 6. bash -n helper/scripts/package-app-zip.sh                                              → PASS
 7. shellcheck helper/scripts/package-app-zip.sh                                           → PASS
 8. End-to-end: ./scripts/package-app-zip.sh --arch arm64 → shoki-darwin-arm64.zip (298244 bytes) + .sha256 (first 64 chars match [0-9a-f]{64}) → PASS
 9. Round-trip: ditto -x -k <zip> <dest>; test -x Shoki.app/Contents/MacOS/ShokiRunner + Shoki Setup.app/Contents/MacOS/ShokiSetup → PASS

Task 2 — .github/workflows/app-release.yml + docs
10. test -f .github/workflows/app-release.yml                                              → PASS
11. grep "tags: \\['app-v\\*'\\]"                                                          → PASS
12. grep "build-arm64" / "build-x64" / "publish-release" (all three job ids)               → PASS
13. grep "package-app-zip.sh" (called from both build jobs)                                → PASS
14. grep "gh release create" (in publish-release)                                          → PASS
15. grep "needs:" (publish-release depends on both builds)                                  → PASS
16. python3 -c "import yaml; yaml.safe_load(...)"                                          → PASS
17. actionlint .github/workflows/app-release.yml                                            → PASS (clean; shellcheck backend also clean)
18. grep "app-release" docs/background/release-setup.md                                    → PASS (2 hits)
19. grep "app-v" docs/background/release-setup.md                                          → PASS (12 hits)
20. grep "compatibleAppVersion" docs/background/release-setup.md                           → PASS (6 hits)
```

`actionlint` was installed via Homebrew mid-run (1.7.12) since the plan allowed "actionlint exits 0 or no hits; skip if not installed." All unrelated pre-existing actionlint findings in `phase-5-parity.yml` + `tart-publish.yml` are out of scope per the executor SCOPE BOUNDARY rule.

## Deviations from Plan

### 1. [Rule 1 - Bug] ditto multi-source invocation is impossible — switched to stage-and-archive

- **Found during:** Task 1 end-to-end run
- **Issue:** The plan's Task 1 action step 5 specified `(cd "$STAGE" && ditto -c -k --keepParent "Shoki.app" "Shoki Setup.app" "$OUT_DIR/shoki-darwin-$ARCH.zip")`. `ditto -c` accepts exactly one source — running that multi-source form errored with `ditto: Can't archive multiple sources`.
- **Fix:** Stage renamed bundles into `mktemp -d`, then `(cd "$STAGE" && ditto -c -k . "$ZIP_PATH")`. Archive root contains `Shoki.app/` and `Shoki Setup.app/` at the top — verified both via `unzip -l` listing (no wrapper directory) and via round-trip extraction (`ditto -x -k`) reproducing the expected structure. Matches the archive-root layout Plan 10-02's `setup-install.ts` expects (it calls `join(installDir, 'Shoki.app')`).
- **Files modified:** `helper/scripts/package-app-zip.sh` (the whole packaging step)
- **Commit:** `f92ffa4`

### 2. [Rule 1 - Bug] `secrets` context not available to step-level `if:` — lifted to job-level env

- **Found during:** actionlint run on draft workflow
- **Issue:** First-pass YAML used `if: ${{ secrets.DEVELOPER_ID_IDENTITY != '' }}` directly on sign+notarize steps and on the cert-import step (mirroring patterns from the executor prompt sample). actionlint rejected it: `context "secrets" is not allowed here`. Step-level `if:` sees `env / github / inputs / job / matrix / needs / runner / steps / strategy / vars` — not `secrets`.
- **Fix:** Added job-level `env: HAVE_CERT / HAVE_SIGN_IDENTITY` that expands `secrets.* != ''` into `'true'` / `'false'` strings, then gate each step on `if: env.HAVE_* == 'true'`. actionlint now passes clean. Functionally equivalent to the original intent — forks without Apple secrets get ad-hoc-signed bundles that still install.
- **Files modified:** `.github/workflows/app-release.yml`
- **Commit:** `f92ffa4`

### 3. [Rule 2 - Missing critical functionality] `build-app-bundle.sh` needed `--target` to support x64 cross-compile

- **Found during:** Task 2 workflow design
- **Issue:** Plan Task 2's build-x64 step sequence was `zig build -Dtarget=x86_64-macos` followed by `./scripts/build-app-bundle.sh` (for verification). But `build-app-bundle.sh` internally runs `zig build "$OPT_FLAG"` with no target — it would silently overwrite the x64 output with a native arm64 rebuild on the `macos-14` runner. The plan's `files_modified` frontmatter already listed `helper/scripts/build-app-bundle.sh`, suggesting this change was anticipated.
- **Fix:** Added `--target <zig-triple>` flag that threads through to `zig build -Dtarget=$TARGET`. Zero-impact when omitted (native build). Workflow now calls `./scripts/build-app-bundle.sh --target x86_64-macos` (and `--target aarch64-macos` for symmetry on arm64) in a single step instead of the plan's two-step sequence.
- **Files modified:** `helper/scripts/build-app-bundle.sh`
- **Commit:** `f92ffa4`

### None out-of-scope

No unrelated files touched. All pre-existing actionlint findings in other workflows remain deferred (not this plan's scope).

## Commits

| # | Hash      | Message                                                                                    |
| - | --------- | ------------------------------------------------------------------------------------------ |
| 1 | `f92ffa4` | feat(10-03): add app-release.yml + package-app-zip.sh for GitHub-Releases app distribution |

## Success criteria (from plan)

- [x] Tagging `app-v<version>` triggers a workflow that publishes 4 GitHub Release artifacts: 2 zips + 2 .sha256 files
- [x] The zip layout matches what `shoki setup` (Plan 02) expects: `Shoki.app/` and `Shoki Setup.app/` at the archive root (verified via local round-trip)
- [x] The SHA256 file format (`<64-hex>  <basename>\n`) matches the Plan 02 parser (`parseShaSidecar` accepts this format)
- [x] Workflow runs cleanly even without Apple Dev ID secrets (ad-hoc sign fallback — steps gate on `env.HAVE_SIGN_IDENTITY`)
- [x] Release procedure documented in `docs/background/release-setup.md` (§ 7)

## Self-Check: PASSED

Files created:
- FOUND: .github/workflows/app-release.yml
- FOUND: helper/scripts/package-app-zip.sh
- FOUND: .planning/phases/10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from/10-03-SUMMARY.md

Files modified:
- FOUND: helper/scripts/build-app-bundle.sh (--target added)
- FOUND: docs/background/release-setup.md (§ 7 + § 2 cross-reference)

Commits:
- FOUND: f92ffa4 — feat(10-03): add app-release.yml + package-app-zip.sh for GitHub-Releases app distribution

---
phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
plan: 04
subsystem: release-infra
tags:
  - npm-packaging
  - github-actions
  - release-workflow
  - distribution-split
dependency_graph:
  requires:
    - "@shoki/binding-darwin-arm64 + @shoki/binding-darwin-x64 exist (Phase 8 / Plan 10-01)"
    - ".github/actions/build-zig-binding is the canonical Zig installer (sets up zig 0.16.0 itself)"
    - "Helper .apps are built via helper/scripts/build-app-bundle.sh (Phase 8-04 — unchanged)"
  provides:
    - "Slim binding tarballs (only shoki.node + README + LICENSE in `files`)"
    - "SDK release workflow freed of helper/ coupling — npm channel is shoki.node only"
    - "build-helper-app action repurposed to helper-smoke CI + future app-release.yml (Plan 10-03)"
    - "CI assertion that .app bundles never land inside packages/binding-darwin-*"
  affects:
    - "Plan 10-03 (app-release.yml) will inherit build-helper-app in its new shape"
    - "Plan 10-02 (shoki setup downloader) — the distribution split this plan makes cleans the npm side so 10-02's download path is the only way to get .apps"
tech_stack:
  added: []
  patterns:
    - "Dual distribution channels: npm for .node native addon (cheap), GitHub Releases for .app bundles (signed, verified, fetched on demand)"
    - "CI guard step asserting an anti-pattern (no .app under binding pkgs) rather than only documenting it"
key_files:
  created: []
  modified:
    - "packages/binding-darwin-arm64/package.json — `files` array reduced to [shoki.node, README.md, LICENSE]"
    - "packages/binding-darwin-x64/package.json — same reduction"
    - ".github/actions/build-helper-app/action.yml — removed copy-into-binding step; removed binding-package-dir input; added binding-dir .app assertion; updated description"
    - ".github/workflows/release.yml — removed build-helper-app invocation (Zig setup already handled by build-zig-binding); shrunk verify-signatures + upload-artifact to shoki.node; added top-of-file SDK-vs-app-release comment"
    - ".github/workflows/ci.yml — sdk-test-native: dropped the removed `binding-package-dir` input from its build-helper-app call; helper-smoke untouched"
decisions:
  - "Chose the OPTIONAL cleanup path from Plan 10-04 Task 2: removed build-helper-app from release.yml entirely rather than keeping it in a no-op state. Rationale: build-zig-binding already installs Zig 0.16 (confirmed in build-zig-binding/action.yml), release.yml no longer needs helper .apps (they don't ship via npm), and leaving a call that does nothing useful is technical debt. Simpler release pipeline wins."
  - "Added an explicit CI assertion step inside build-helper-app that fails the action if ANY .app lands under packages/binding-darwin-*. Prevents regression if someone re-introduces a copy step in a future refactor. Costs ~3 lines, catches a real correctness invariant."
  - "Kept ci.yml's helper-smoke job unchanged — it already does `zig build` directly, not via the action, and still smoke-launches both .apps end-to-end per Phase 8-04's verification mandate."
  - "Kept binding-package-dir input removed rather than deprecated-with-note. Dead inputs accumulate faster than anyone removes them; fewer knobs = clearer contract."
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-18"
---

# Phase 10 Plan 04: Remove .app bundles from npm binding tarballs + rewire SDK release Summary

Strips `helper/ShokiRunner.app/**` and `helper/ShokiSetup.app/**` globs from both darwin binding `package.json` `files` arrays, deletes the copy-into-binding step from the `build-helper-app` composite action, and shrinks `release.yml` down to a pure shoki.node pipeline — completing the npm/GitHub-Releases distribution split that Plan 10-03 finishes on the app-release side.

## What changed

### 1. Binding package.json slimdown

Before (both files, identical shape):
```json
"files": [
  "shoki.node",
  "helper/ShokiRunner.app/**",
  "helper/ShokiSetup.app/**",
  "README.md",
  "LICENSE"
]
```

After:
```json
"files": [
  "shoki.node",
  "README.md",
  "LICENSE"
]
```

### 2. `.github/actions/build-helper-app/action.yml`

- Removed: "Copy signed bundles into binding package" step (ran `cp -R helper/.build/Shoki*.app $TARGET_DIR/`)
- Removed: `binding-package-dir` input (no longer needed — action never touches the binding dir)
- Added: "Assert no .app leaks into binding packages" step using `find packages/binding-darwin-* -name '*.app' -type d` as a guard
- Updated: top-level `description:` to: "Builds ShokiRunner.app + ShokiSetup.app... Used by the `helper-smoke` CI job and by .github/workflows/app-release.yml (Plan 10-03). Does NOT bundle the .apps into npm binding packages..."

### 3. `.github/workflows/release.yml`

- Added a top-of-file header comment declaring the SDK vs app-release channel split
- `build-darwin-arm64` and `build-darwin-x64` jobs:
  - Removed the entire `- uses: ./.github/actions/build-helper-app` step (plus its env block with APPLE_* secrets — those are needed only for signing the helper .apps, which now belong to `app-release.yml`)
  - "Verify signatures" step shrunk from 3 codesign lines to 1 (shoki.node only)
  - `upload-artifact` `path:` shrunk from a multi-line list to a single `packages/binding-darwin-*/shoki.node` entry
- `publish` job untouched — it just downloads the (now smaller) artifacts and runs `pnpm publish -r`

### 4. `.github/workflows/ci.yml`

- `sdk-test-native` job: removed the `binding-package-dir: packages/binding-darwin-arm64` input from its `build-helper-app` invocation (the action no longer accepts that input). `sign: "false"` preserved.
- `helper-smoke` job untouched (it invokes `zig build` directly, not the action).

## Tarball size delta

Captured via `npm pack --dry-run --json` on both packages.

| Package                         | Before size / entries | After size / entries | Files                                 |
| ------------------------------- | --------------------- | -------------------- | ------------------------------------- |
| `@shoki/binding-darwin-arm64`   | 745345 B / 3          | 745344 B / 3         | README.md, package.json, shoki.node   |
| `@shoki/binding-darwin-x64`     | 682 B / 2             | 665 B / 2            | README.md, package.json               |

Note on interpretation: locally, the `helper/**` globs in `files` matched zero files because the built `.app` bundles don't exist in the working tree (CI builds them). So the `before` and `after` numbers look nearly identical in this sandbox. The material tarball-size savings manifest in CI — where the previous pipeline copied the two `.app` bundles (a signed ShokiRunner.app is typically ~6–10 MB; ShokiSetup.app is smaller but non-trivial) into `packages/binding-darwin-*/helper/` before `npm pack`. After this plan, that copy no longer happens, so the published tarball can never grow past roughly `shoki.node + README + LICENSE + package.json` (~750 KB for arm64). That's the enforced ceiling the `npm pack` file list now defines.

The `find` assertion inside `build-helper-app` is the runtime proof: if a future refactor re-introduces a copy step, CI will fail with `ERROR: .app bundle found inside a binding package directory.`

## Verification results

All checks passed.

```text
1. jq -e '.files == ["shoki.node", "README.md", "LICENSE"]' packages/binding-darwin-arm64/package.json  →  true
2. jq -e '.files == ["shoki.node", "README.md", "LICENSE"]' packages/binding-darwin-x64/package.json    →  true
3. npm pack --dry-run packages/binding-darwin-arm64 | grep -c 'helper/'                                  →  0
4. npm pack --dry-run packages/binding-darwin-x64  | grep -c 'helper/'                                  →  0
5. python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"                       →  ok
6. python3 -c "import yaml; yaml.safe_load(open('.github/actions/build-helper-app/action.yml'))"         →  ok
7. python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"                            →  ok
8. grep -n 'helper/.*\.app\|ShokiRunner.app\|ShokiSetup.app' packages/binding-darwin-*/package.json       →  zero hits
9. ! grep -q "Copy signed bundles into binding package" .github/actions/build-helper-app/action.yml       →  ok
10. ! grep -q "binding-package-dir" .github/actions/build-helper-app/action.yml                           →  ok
11. ! grep -qE "packages/binding-darwin-(arm64|x64)/helper/" .github/workflows/release.yml                →  ok
12. ! grep -q "build-helper-app" .github/workflows/release.yml                                            →  ok (removed entirely)
13. pnpm -r typecheck                                                                                    →  exit 0
```

`actionlint` was not installed locally; skipped per plan allowance.

## Deviations from Plan

### None in scope — plan executed exactly as written, plus the explicitly-invited optional cleanup

- Task 2 offered "OPTIONAL but recommended cleanup: since build-helper-app is no longer needed in release.yml AT ALL... delete the `- uses: ./.github/actions/build-helper-app` step entirely from both jobs in release.yml." — I verified `build-zig-binding` installs Zig 0.16 itself, then took that branch. No deviation; the plan author pre-authorized it.
- The assertion step (`find packages/binding-darwin-* -name '*.app' -type d`) was also called out explicitly in the executor instructions and implemented as written.

### Out-of-scope finding (for awareness, not action)

Wave 2's concurrent Plan 10-02 is currently writing `packages/sdk/test/cli/setup-download.test.ts` and `packages/sdk/test/cli/setup-install.test.ts` (untracked in git). Running `pnpm -r test` during my sanity check picked them up and they fail to resolve `src/cli/setup-download.js` / `src/cli/setup-install.js` (source files not yet written by 10-02). This is entirely 10-02's domain — my plan does not touch `packages/sdk/` at all, and all my own file-scope verifications passed. Logging here so the orchestrator knows the test-suite redness is the peer wave's work-in-progress, not a Plan 10-04 regression.

## Commits

| # | Hash      | Message                                                                                    |
| - | --------- | ------------------------------------------------------------------------------------------ |
| 1 | `4e18f8a` | chore(10-04): strip helper/**.app entries from binding package files[]                     |
| 2 | `a4566ba` | chore(10-04): rewire SDK release + build-helper-app action for npm/GH-Releases split       |

## Success criteria (from plan)

- [x] Binding tarballs contain only .node binary + metadata (no .app bundles)
- [x] SDK release workflow no longer copies, signs-verifies, or uploads any `helper/` paths
- [x] Helper bundles still built in CI (`helper-smoke` job unchanged; `build-helper-app` action lives on for Plan 10-03)
- [x] Tarball shape bounded — `npm pack` file list contains no `helper/` entry, period

## Self-Check: PASSED

Files created:
- FOUND: .planning/phases/10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from/10-04-SUMMARY.md

Files modified:
- FOUND: packages/binding-darwin-arm64/package.json
- FOUND: packages/binding-darwin-x64/package.json
- FOUND: .github/actions/build-helper-app/action.yml
- FOUND: .github/workflows/release.yml
- FOUND: .github/workflows/ci.yml

Commits:
- FOUND: 4e18f8a
- FOUND: a4566ba

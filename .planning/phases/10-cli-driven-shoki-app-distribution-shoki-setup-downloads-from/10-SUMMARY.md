---
phase: 10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from
plan: phase
subsystem: packaging+cli+release-infra+docs
tags:
  - packaging
  - cli
  - download
  - github-releases
  - npm
  - release-workflow
  - distribution-split
  - vitest
  - docs
dependency_graph:
  requires:
    - Phase 8 (v1.1 prep — 7→4 package consolidation, Zig helper port, ShokiSetup.app)
    - Phase 9 (Qwik canonical example)
  provides:
    - Unscoped `shoki` npm package with vitest subpath exports
    - `shoki setup` as a GitHub-Releases download + SHA256-verify + TCC-launch flow
    - Decoupled release cadences: `v*` tags → npm, `app-v*` tags → GitHub Releases
    - Slim binding tarballs (shoki.node + README + LICENSE only)
    - User-facing docs reflecting 3-package + one-command install
  affects:
    - Every downstream consumer — imports change across the board
    - Release operators — now cut SDK + app releases independently
    - CI image authors — `.apps` no longer inside npm tarballs; fetch on first run
tech-stack:
  added: []
  patterns:
    - Subpath exports with optional peer deps (msw/node-style)
    - Dual distribution channels (npm for .node, GitHub Releases for .app)
    - Decoupled release cadences coupled via `compatibleAppVersion`
    - Stage-and-archive `ditto` packaging (multi-source `--keepParent` is invalid)
    - Secret-presence gating via job-level `env:` (step-level `if:` can't read `secrets`)
    - Platform gate in orchestrator, not downloader (downloader stays portable)
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
    - .github/workflows/app-release.yml
    - helper/scripts/package-app-zip.sh
  modified:
    - packages/sdk/package.json (name: shoki; vitest subpath exports; compatibleAppVersion; optional peer deps)
    - packages/sdk/src/cli/main.ts (setup subcommand wired to runSetup)
    - packages/sdk/src/vitest/** (moved from packages/vitest/src/**)
    - packages/sdk/test/vitest/** (moved from packages/vitest/test/**)
    - packages/binding-darwin-arm64/package.json (files[] = [shoki.node, README.md, LICENSE])
    - packages/binding-darwin-x64/package.json (same)
    - .github/workflows/release.yml (removed build-helper-app from SDK release pipeline)
    - .github/workflows/ci.yml (dropped binding-package-dir input)
    - .github/actions/build-helper-app/action.yml (removed copy-to-binding step; added .app-leak assertion)
    - helper/scripts/build-app-bundle.sh (added --target for x64 cross-compile)
    - README.md, CHANGELOG.md, CONTRIBUTING.md
    - docs/**/*.md (15 markdown files swept)
    - examples/vitest-browser-qwik/** (swept; now shoki: workspace:*)
  deleted:
    - packages/vitest/** (entire directory)
decisions:
  - "Collapsed `@shoki/vitest` into `shoki/vitest`/`shoki/vitest/setup`/`shoki/vitest/browser` subpaths with optional peer deps (vitest + @vitest/browser). 4→3 packages; one install covers every consumer."
  - "Renamed `@shoki/sdk` → unscoped `shoki`. npm slot confirmed free + claimed."
  - "`.app` bundles no longer ship inside `@shoki/binding-darwin-*` npm tarballs. Moved to `app-v*`-tagged GitHub Releases; fetched on demand by `npx shoki setup`."
  - "`shoki setup` is now a real download flow (Node 24 native fetch + crypto.createHash + ditto + xattr). No new runtime deps."
  - "Decoupled release cadences: `v*` tags publish shoki + bindings to npm via OIDC; `app-v*` tags publish helper bundles to GitHub Releases. `compatibleAppVersion` in packages/sdk/package.json couples them."
  - "Stage-and-archive `ditto -c -k <stage>` replaces the invalid `ditto -c -k --keepParent A.app B.app` multi-source form across both package-app-zip.sh and the Plan 02 fixture builder."
  - "Job-level `env: HAVE_CERT/HAVE_SIGN_IDENTITY` gating pattern in app-release.yml because step-level `if:` can't reference the `secrets` context."
metrics:
  duration: "~55 minutes across 4 execution waves"
  completed_date: "2026-04-18"
---

# Phase 10 Summary: CLI-driven Shoki.app distribution + 4→3 package consolidation

**One-liner:** Renamed `@shoki/sdk` → unscoped `shoki`, collapsed `@shoki/vitest` into `shoki/vitest` subpath exports, replaced the `shoki setup` path-resolver with a real GitHub-Releases download+SHA256-verify+xattr-strip+TCC-launch flow, published helper bundles via an `app-v*`-tagged workflow, stripped `.app` bundles from npm binding tarballs, and swept 15 docs pages to the new 3-package world. End-to-end first-run DX is now **`npm install shoki && npx shoki setup`**.

## Phase outcome

A first-time consumer's entire installation is now:

```bash
npm install shoki
npx shoki setup
```

That's it. One package on npm. One command to download `Shoki.app` + `Shoki Setup.app` from GitHub Releases, verify SHA256 against a sidecar, install into `~/Applications/`, strip quarantine, and walk through the Accessibility + Automation TCC prompts. The old "install 2 packages, hope the right binding resolves, find `ShokiSetup.app` inside `node_modules`, manually System-Settings-dance your way through TCC" flow is gone.

Three npm packages total (down from four): `shoki` + `@shoki/binding-darwin-arm64` + `@shoki/binding-darwin-x64`. The two bindings stay scoped because the napi platform-package pattern requires it; both are auto-installed via `optionalDependencies` and never touched by hand.

## Plan-by-plan recap

### Plan 10-01 — Package rename + vitest collapse (Wave 1)

Renamed `@shoki/sdk` → unscoped `shoki`. Merged `@shoki/vitest` into `packages/sdk/src/vitest/` behind three subpath exports (`shoki/vitest`, `shoki/vitest/setup`, `shoki/vitest/browser`). Made `vitest` + `@vitest/browser` optional peer deps. Updated the plugin's detection needle (`'shoki/vitest/browser'`) and Vitest plugin `name` for observability. 18 source files + 5 test files + 3 fixture dirs moved via `git mv`; 48 files changed total across 2 commits. Test conservation: 217 passing across two packages (pre) → 217 passing in one package (post). Commits: `2cc2ae5`, `08c1fa6`.

### Plan 10-02 — `shoki setup` download flow (Wave 2)

Replaced the `shoki setup` path-resolver body with a real download-and-install orchestrator: (1) detect apps in `~/Applications/`, (2) `fetch` `shoki-darwin-<arch>.zip` from GitHub Releases, (3) verify SHA256 against the published `.sha256` sidecar (tolerates both `<hex>  <basename>` and bare `<hex>` forms), (4) `ditto -x -k` extract, (5) `xattr -dr com.apple.quarantine` (exit-1 is happy-path tolerance), (6) `open -W Shoki Setup.app`. Six flags wired: `--force`, `--no-download`, `--install-dir`, `--skip-launch`, `--json`, `--version`, plus `--dry-run`. Added `compatibleAppVersion: "0.1.0"` to `packages/sdk/package.json`. Added 25 new tests (3 test files, 230→255 total). Zero new runtime dependencies — Node 24 native `fetch` + `crypto.createHash('sha256')` + `fs/promises` + dynamic-imported existing `execa`. Commits: `8c31860`, `6adb95b`, `a15759f`.

### Plan 10-03 — `app-release.yml` + `package-app-zip.sh` (Wave 3)

Tag-triggered (`app-v*`) workflow that builds both Zig helper bundles (arm64 native + x64 cross-compile from `macos-14`), optionally signs + notarizes via the Phase 8-04 script, repackages them as `Shoki.app` + `Shoki Setup.app` inside a unified `shoki-darwin-<arch>.zip`, computes a SHA256 sidecar matching the Plan 02 parser, and publishes the four files to a GitHub Release. Added `--target <zig-triple>` to `build-app-bundle.sh` for cross-compile support. Signing degrades gracefully via job-level `env: HAVE_CERT/HAVE_SIGN_IDENTITY` gating (step-level `if:` can't reference `secrets`). Docs updated: `release-setup.md` § 7 covers the new cadence + `compatibleAppVersion` coupling rule. Commit: `f92ffa4`.

### Plan 10-04 — Strip `.apps` from npm tarballs + rewire SDK release (Wave 3 parallel)

Binding `files` arrays cut from `[shoki.node, helper/ShokiRunner.app/**, helper/ShokiSetup.app/**, README.md, LICENSE]` → `[shoki.node, README.md, LICENSE]`. Removed the `build-helper-app` invocation from `release.yml` entirely (the action is reserved for `app-release.yml` + CI smoke). Added an anti-regression assertion step inside `build-helper-app` that fails if any `.app` lands under `packages/binding-darwin-*`. Tarball shape is now bounded — `npm pack --dry-run` file list contains zero `helper/` entries. Commits: `4e18f8a`, `a4566ba`.

### Plan 10-05 — Docs sweep + CHANGELOG + phase SUMMARY (Wave 4, this plan)

Mechanical sed sweep across every consumer-facing markdown file: `@shoki/sdk` → `shoki`, `@shoki/vitest*` → `shoki/vitest*`, `pnpm add -D @shoki/sdk @shoki/vitest` → `pnpm add -D shoki`, etc. Substantive rewrites: README install section (top of readme, canonical snippet), `docs/getting-started/install.md` (one-package install + full `shoki setup` flag table), `docs/api/cli.md` (`shoki setup` flags + SetupResult shape + URL pattern + exit codes), `docs/getting-started/permission-setup.md` (new first-run section), `docs/guides/troubleshooting.md` (new entries for ENOENT / quarantine / checksum / `--no-download`). CHANGELOG `[Unreleased] — Phase 10` entries added BEFORE the existing Phase 8/9 block. 15 markdown files swept; 2 commits. Commits: `9d0bbd1`, `ffdecf6`.

## Final package shape

```
packages/
├── binding-darwin-arm64/   @shoki/binding-darwin-arm64 — shoki.node only
├── binding-darwin-x64/     @shoki/binding-darwin-x64 — shoki.node only
└── sdk/                    shoki — SDK + CLI + matchers + vitest subpaths
```

`packages/sdk/package.json` (relevant slice):

```json
{
  "name": "shoki",
  "compatibleAppVersion": "0.1.0",
  "bin": { "shoki": "./dist/cli/main.js" },
  "exports": {
    ".":                { "types": "./dist/index.d.ts",          "import": "./dist/index.js" },
    "./matchers":       { "types": "./dist/matchers/index.d.ts", "import": "./dist/matchers/index.js" },
    "./cli":            { "types": "./dist/cli/index.d.ts",      "import": "./dist/cli/index.js" },
    "./vitest":         { "types": "./dist/vitest/index.d.ts",   "import": "./dist/vitest/index.js" },
    "./vitest/browser": { "types": "./dist/vitest/browser.d.ts", "import": "./dist/vitest/browser.js" },
    "./vitest/setup":   { "types": "./dist/vitest/setup.d.ts",   "import": "./dist/vitest/setup.js" }
  },
  "optionalDependencies": {
    "@shoki/binding-darwin-arm64": "workspace:*",
    "@shoki/binding-darwin-x64":   "workspace:*"
  },
  "peerDependencies": {
    "vitest":          "^3.0.0 || ^4.0.0",
    "@vitest/browser": "^3.0.0 || ^4.0.0"
  },
  "peerDependenciesMeta": {
    "vitest":          { "optional": true },
    "@vitest/browser": { "optional": true }
  }
}
```

Binding `files` arrays (both darwin packages):

```json
{ "files": ["shoki.node", "README.md", "LICENSE"] }
```

## Final release cadence

- **`v*` tags** → `.github/workflows/release.yml` → publishes `shoki` + `@shoki/binding-darwin-arm64` + `@shoki/binding-darwin-x64` to npm via OIDC. No helper apps.
- **`app-v*` tags** → `.github/workflows/app-release.yml` → publishes `shoki-darwin-arm64.zip`, `shoki-darwin-x64.zip`, and matching `.sha256` files to GitHub Releases.
- **Coupling:** `compatibleAppVersion` in `packages/sdk/package.json`. Release procedure: cut `app-v<x.y.z>` first, confirm the 4 GitHub Release assets land, bump `compatibleAppVersion` in the SDK, then cut `v<next>` to publish the SDK that points at the new helper.

## Verification evidence (from Plan 10-02 / 10-03 / 10-04 + this plan's gate)

```
Plan 10-01:
  pnpm -r typecheck            → 0
  pnpm -r build                → 0
  pnpm -r test                 → 0 (217 passed / 13 skipped)
  ls packages/                 → binding-darwin-arm64 binding-darwin-x64 sdk
  ls packages/vitest           → 1 (No such file or directory)
  jq -r .name packages/sdk/package.json  → shoki
  jq -e .exports."./vitest" && .exports."./vitest/browser" && .exports."./vitest/setup"  → 0

Plan 10-02:
  pnpm --filter shoki test     → 0 (242 passed / 13 skipped, 35 test files)
  node dist/cli/main.js setup --help  → lists --force, --no-download, --install-dir, --skip-launch, --json, --version, --dry-run
  node dist/cli/main.js setup --dry-run --install-dir /tmp/fake  → 0 (prints URL + path, no fs/network)
  node dist/cli/main.js setup --no-download --install-dir /tmp/empty  → 2 (MISSING_DEP)
  jq -r .compatibleAppVersion packages/sdk/package.json  → 0.1.0

Plan 10-03:
  test -f .github/workflows/app-release.yml  → 0
  grep "tags: \['app-v\*'\]" .github/workflows/app-release.yml  → 0
  grep "package-app-zip.sh" .github/workflows/app-release.yml  → 0
  grep "gh release create" .github/workflows/app-release.yml  → 0
  test -x helper/scripts/package-app-zip.sh  → 0
  actionlint .github/workflows/app-release.yml  → 0 (clean)
  Round-trip: ./scripts/package-app-zip.sh --arch arm64 + ditto -x -k <zip> <dest> → Shoki.app/ + Shoki Setup.app/ at root, sha256 = [0-9a-f]{64}

Plan 10-04:
  jq -e '.files == ["shoki.node","README.md","LICENSE"]' packages/binding-darwin-arm64/package.json  → true
  jq -e '.files == ["shoki.node","README.md","LICENSE"]' packages/binding-darwin-x64/package.json   → true
  npm pack --dry-run packages/binding-darwin-arm64 | grep -c helper/  → 0
  npm pack --dry-run packages/binding-darwin-x64  | grep -c helper/  → 0
  ! grep "build-helper-app" .github/workflows/release.yml  → 0 (removed)

Plan 10-05 (this plan):
  grep -c 'npm install shoki' README.md  → 1
  grep -c 'npx shoki setup' README.md  → 2
  grep -c '3 npm packages' README.md  → 1
  grep -c 'shoki/vitest/setup' docs/getting-started/vitest-quickstart.md  → 2
  grep -c 'shoki/vitest/browser' docs/getting-started/vitest-quickstart.md  → 2
  grep -c 'Phase 10' CHANGELOG.md  → 11
  grep -c 'shoki-darwin-' docs/api/cli.md  → 2
  grep -c -- '--no-download' docs/api/cli.md  → 2
  grep -c -- '--install-dir' docs/api/cli.md  → 2
  grep -rnE '@shoki/(sdk|vitest)' docs/ README.md CONTRIBUTING.md --include='*.md' (excluding CHANGELOG historical refs)  → only expected residue in CHANGELOG historical block
```

## First-time consumer DX flow

```bash
# 1. Install (one package, one command)
npm install shoki

# 2. First-run setup (once per machine)
npx shoki setup
#    → downloads shoki-darwin-<arch>.zip from GitHub Releases
#    → verifies SHA256 against the .sha256 sidecar
#    → unzips into ~/Applications/ via ditto
#    → strips com.apple.quarantine via xattr
#    → launches Shoki Setup.app (click through TCC prompts)

# 3. Verify
npx shoki doctor
```

For Vitest users additionally:

```bash
npm install -D shoki vitest @vitest/browser playwright
```

Then import from subpaths:

```ts
// vitest.config.ts
import { shokiVitest } from "shoki/vitest";

// src/vitest.setup.ts
import "shoki/vitest/setup";

// tests/*.test.ts
import { voiceOver } from "shoki/vitest/browser";
```

## Carry-forward (deferred to v1.1+)

From Phase 10 CONTEXT.md and execution deviations:

- **Dedicated exit codes 3/4/5** for `shoki setup` (`CHECKSUM_MISMATCH`, `NETWORK`, `UNZIP`). Currently routed through exit 1 (GENERIC) with attached error messages. Promoting each to a dedicated `instanceof`-gated exit is a mechanical refactor once we see real-world failure modes.
- **Homebrew cask** — `brew install --cask shoki` as a third distribution channel for folks who prefer brew over npm.
- **`shoki update-app`** — a focused subcommand to re-fetch the helper bundles without re-running the TCC prompt. Today `shoki setup --force --skip-launch` does the same job; a dedicated command would be more discoverable.
- **Telemetry** — opt-in anonymous usage/failure reporting for `shoki setup` + `shoki doctor` so we can see which error modes are actually hitting users.
- **Windows/Linux support** — `setup-download.ts` is platform-portable by design (pure URL+hash helper, platform gate lives in the orchestrator). Adding a Linux/Windows driver + bindings unblocks expanding the download flow to those hosts.
- **App Store Connect API-key signing** — `app-release.yml` currently uses the same env-var contract as the pre-Phase-10 release workflow (`APPLE_DEVELOPER_ID_APP` / `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_SPECIFIC_PASSWORD`). Docs suggest the API-key flow as a future improvement.

## Done checklist

- [x] Plan 10-01 SUMMARY committed (`2cc2ae5`, `08c1fa6`)
- [x] Plan 10-02 SUMMARY committed (`8c31860`, `6adb95b`, `a15759f`)
- [x] Plan 10-03 SUMMARY committed (`f92ffa4`)
- [x] Plan 10-04 SUMMARY committed (`4e18f8a`, `a4566ba`)
- [x] Plan 10-05 docs sweep committed (`9d0bbd1`)
- [x] Plan 10-05 README + CHANGELOG committed (`ffdecf6`)
- [x] 10-SUMMARY.md written (this file)
- [x] Zero `@shoki/sdk` / `@shoki/vitest` references remain in current docs/README/CONTRIBUTING (only historical Phase 8/9 CHANGELOG entries retained, as intended)

## Self-Check: PASSED

- `.planning/phases/10-cli-driven-shoki-app-distribution-shoki-setup-downloads-from/10-SUMMARY.md` — FOUND (this file, being written)
- Commit `9d0bbd1` — FOUND (docs sweep)
- Commit `ffdecf6` — FOUND (README + CHANGELOG)
- Plan 01-04 SUMMARYs all present on disk — FOUND
- `grep -c 'npm install shoki' README.md` = 1 — FOUND
- `grep -c 'npx shoki setup' README.md` = 2 — FOUND
- `grep -c '3 npm packages' README.md` = 1 — FOUND
- `grep -c 'Phase 10' CHANGELOG.md` = 11 — FOUND
- `grep -c 'shoki/vitest/setup' docs/getting-started/vitest-quickstart.md` = 2 — FOUND
- `grep -c 'shoki-darwin-' docs/api/cli.md` = 2 — FOUND
- `grep -c -- '--no-download' docs/api/cli.md` = 2 — FOUND
- `grep -c -- '--install-dir' docs/api/cli.md` = 2 — FOUND

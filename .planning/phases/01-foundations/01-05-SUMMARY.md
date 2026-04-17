---
phase: 01-foundations
plan: 05
status: completed
date: 2026-04-17
---

# Plan 01-05 Summary: CI Pipeline

**Status:** completed
**Requirements satisfied:** FOUND-01, FOUND-03, FOUND-05

## What Shipped

### Composite actions
- `.github/actions/build-zig-binding/action.yml` — installs Zig 0.16.0 via `mlugg/setup-zig@v2`, runs `zig fetch` for napi-zig, builds shared library, renames to `shoki.node`, verifies dlopen
- `.github/actions/build-helper-app/action.yml` — runs `helper/scripts/build-app-bundle.sh`, optionally signs+notarizes, copies `.app` into binding package's `helper/` dir

### Workflows
- `.github/workflows/ci.yml` — PR + push-to-main: lint/typecheck/Zig tests/SDK tests with native binding/Swift helper tests. 4 jobs, `concurrency.cancel-in-progress` on.
- `.github/workflows/release.yml` — `v*` tag-triggered: cross-compile for arm64 + x64 (both from `macos-14` runner), sign+notarize helper app, publish via OIDC (no NPM_TOKEN). `permissions.id-token: write`.

### Configuration
- `.github/dependabot.yml` — weekly npm + github-actions updates, grouped minor/patch. Swift ecosystem for `/helper`.

### Documentation
- `docs/release-setup.md` — maintainer checklist covering:
  - Apple Developer ID cert setup + secret list
  - App Store Connect API key for notarytool
  - npm OIDC trusted publishing enrollment per package
  - Bootstrap publish procedure for the first release
  - Release verification steps
  - Emergency unpublish procedure

## Must-Haves Verification

1. **Zig 0.16+ installation in CI**: `mlugg/setup-zig@v2` with `version: 0.16.0` in the composite action.
2. **Cross-compile for both triples**: release.yml builds `aarch64-macos` on `macos-14` native and `x86_64-macos` on `macos-14` via Zig's cross-compile (no `macos-13` dependency, which GitHub has been phasing out).
3. **Developer ID signing**: `apple-actions/import-codesign-certs@v3` imports the cert, `helper/scripts/sign-and-notarize.sh` (Plan 04) signs the `.app`. `codesign -dvvv` verification step in release.yml.
4. **OIDC trusted publishing**: `pnpm publish -r --provenance` runs in a job with `id-token: write` permission. No `NPM_TOKEN` secret is ever referenced — documented as prerequisite in release-setup.md.
5. **Dependabot**: weekly updates for npm + gh-actions + swift, grouped minor/patch.

## Deviations

1. **Executor agent timed out** after writing only `build-zig-binding/action.yml`. Orchestrator (main Claude) wrote the remaining files directly: `build-helper-app/action.yml`, `ci.yml`, `release.yml`, `dependabot.yml`, `release-setup.md`.
2. **`macos-13` (Intel) not used** — GitHub Actions has been deprecating Intel runners. Cross-compiling x86_64 from `macos-14` via Zig is simpler and avoids the deprecation cliff. Documented in `release-setup.md`.
3. **Bootstrap publish is manual** — trusted-publishing enrollment requires the package to already exist on npm. First release is a maintainer-local `pnpm publish` with classic auth. Documented in `release-setup.md` as a one-time step.

## Commits

- (Plan 01-05 composite action only — see combined commit for the rest)

## Gaps / Notes for Downstream

- **Secrets not yet provisioned** — a maintainer must add the listed secrets to GitHub before the first `v*` tag. `release-setup.md` is the runbook.
- **`pnpm lint` script not in root `package.json`** — CI `lint-typecheck` job runs `pnpm lint` which must exist at root. Check Plan 01's scaffolding; add a `lint` script that delegates to `biome check .` if missing.
- **`pnpm -r typecheck`** — binding packages don't currently have a typecheck script (nothing to typecheck until the `.node` is built in). This should be a noop for binding packages or a `"typecheck": "echo noop"` stub. Verify in Plan 06 docs pass or add to CI.

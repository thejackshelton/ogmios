---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 07
subsystem: ci
tags: [ci, workflows, actions, rebrand, ogmios]
requires:
  - "zig/build.zig emitting libogmios.dylib (Plan 12-04)"
  - "helper/scripts/package-app-zip.sh emitting ogmios-darwin-<arch>.zip (Plan 12-03)"
provides:
  - ".github/actions/build-zig-binding/action.yml building ogmios.node"
  - ".github/workflows/release.yml publishing ogmios + @ogmios/binding-darwin-*"
  - ".github/workflows/app-release.yml producing ogmios-darwin-<arch>.{zip,sha256}"
  - ".github/workflows/tart-publish.yml pushing ghcr.io/thejackshelton/ogmios/macos-vo-ready:*"
affects:
  - ".github/actions/build-zig-binding/action.yml"
  - ".github/actions/build-helper-app/action.yml"
  - ".github/actions/setup/action.yml"
  - ".github/actions/setup/kill-background-apps.sh"
  - ".github/workflows/release.yml"
  - ".github/workflows/app-release.yml"
  - ".github/workflows/ci.yml"
  - ".github/workflows/phase-5-parity.yml"
  - ".github/workflows/tart-publish.yml"
  - ".github/workflows/examples/ogmios-*.yml (renamed from shoki-*.yml)"
tech_stack:
  added: []
  patterns:
    - "Composite GitHub Actions: build-zig-binding produces ogmios.node per target"
    - "Split publish channels: v* tags -> npm, app-v* tags -> GH Releases"
key_files:
  created:
    - ".github/workflows/examples/ogmios-cirrus-runners.yml"
    - ".github/workflows/examples/ogmios-getmac.yml"
    - ".github/workflows/examples/ogmios-github-hosted.yml"
    - ".github/workflows/examples/ogmios-tart-selfhosted.yml"
  modified:
    - ".github/actions/build-zig-binding/action.yml"
    - ".github/actions/build-helper-app/action.yml"
    - ".github/actions/setup/action.yml"
    - ".github/actions/setup/kill-background-apps.sh"
    - ".github/workflows/release.yml"
    - ".github/workflows/app-release.yml"
    - ".github/workflows/ci.yml"
    - ".github/workflows/phase-5-parity.yml"
    - ".github/workflows/tart-publish.yml"
  deleted:
    - ".github/workflows/examples/shoki-cirrus-runners.yml"
    - ".github/workflows/examples/shoki-getmac.yml"
    - ".github/workflows/examples/shoki-github-hosted.yml"
    - ".github/workflows/examples/shoki-tart-selfhosted.yml"
decisions:
  - "Kept scope to .github/actions/** + .github/workflows/** per objective; did NOT touch .github/SECURITY.md, PR template, or ISSUE_TEMPLATE (those belong to docs/prose sweep plans)."
  - "Renamed workflows/examples/shoki-*.yml to ogmios-*.yml (git-rename) to match the rebrand end-to-end."
  - "tart-publish.yml registry path: ghcr.io/shoki/macos-vo-ready -> ghcr.io/thejackshelton/ogmios/macos-vo-ready, aligning with the owner/repo path in CONTEXT.md."
metrics:
  duration: "~10 min"
  completed_date: "2026-04-18"
---

# Phase 12 Plan 07: CI Workflows + Composite Actions Rebrand to Ogmios Summary

Sweep of every `.github/actions/**` and `.github/workflows/**` YAML replacing residual Shoki/Munadi/Dicta tokens with Ogmios — zero residuals across the full CI/release pipeline.

## What shipped

- `build-zig-binding/action.yml` now locates `libogmios.dylib` and copies it to `<binding-pkg>/ogmios.node` (Phase 11 deferral resolved).
- `release.yml` publishes `ogmios` + `@ogmios/binding-darwin-arm64` + `@ogmios/binding-darwin-x64` via OIDC trusted publishing. Signature-verify steps reference `packages/binding-darwin-*/ogmios.node`. Upload/download artifacts carry `ogmios.node`.
- `app-release.yml` packages and releases `ogmios-darwin-<arch>.zip` + `.sha256` sidecars, with `gh release create --title "Ogmios.app ..."` and notes referencing `npx ogmios setup`.
- `ci.yml` `helper-smoke` job launches `OgmiosRunner.app` / `OgmiosSetup.app` and validates `libOgmiosXPCClient.dylib`; `sdk-test-native` uses `OGMIOS_NATIVE_BUILT=1` + `pnpm --filter ogmios test`.
- `phase-5-parity.yml` tart cell sets `OGMIOS_TART=1`; prose rebranded.
- `tart-publish.yml` pushes `ghcr.io/thejackshelton/ogmios/macos-vo-ready:<ver>` (and `-full` variant); VM names `ogmios-vo-ready-*`; image marker `/etc/ogmios-image`.
- `setup/action.yml`: `ogmios/setup-action` name, `OGMIOS_TART` env detection, `/etc/ogmios-image` marker, installs `/Applications/OgmiosRunner.app`, `ogmios doctor` gate, `@ogmios/cli` reference.
- `setup/kill-background-apps.sh` prose rebranded to ogmios.
- `build-helper-app/action.yml` builds `OgmiosRunner.app` + `OgmiosSetup.app`.
- `workflows/examples/*` renamed from `shoki-*.yml` to `ogmios-*.yml` with prose, job names, and registry URLs flipped.

## Deviations from Plan

### [Rule 1 - Workflow] Plan 12-07 work was incorporated into Plan 12-04's commit

**Found during:** Task 1 commit step (post-write)

**Issue:** Parallel-wave executor for Plan 12-04 (Zig core rebrand, commit `e0db4c2`) included a broader sweep that flipped every `.github/actions/**` and `.github/workflows/**` file to Ogmios as part of its unified refactor, landing Plan 12-07's exact deliverables before this plan's executor could commit them. The on-disk edits this plan produced matched the already-committed state byte-for-byte, so `git add` produced an empty stage.

**Fix:** Created an empty marker commit (`857d627 refactor(12-07): confirm CI workflows + composite actions already rebranded to Ogmios`) to preserve plan-level traceability. The content-bearing commit remains `e0db4c2` in the history; the verification and SUMMARY formally close out Plan 12-07.

**Files modified:** None (all target files already at desired state)

**Commit:** `857d627` (empty marker) — content merged in `e0db4c2`

### Scope decision

The plan's `<verify>` block contains `rg -rn ... .github/`, which would also scan `.github/SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODE_OF_CONDUCT.md`, and `.github/ISSUE_TEMPLATE/**` — none of which are in the plan's `<files>` list (which explicitly enumerates `.github/actions/**` and `.github/workflows/**` YAML). Those prose/docs files carry Shoki tokens that belong to a separate docs sweep plan in this phase. Interpreted the verification per the `<objective>` wording ("Sweep all `.github/actions/**` and `.github/workflows/**`") rather than the overly-broad `rg` command. Documented here so the downstream prose-sweep plan picks up SECURITY.md, templates, and issue forms.

## Verification

```bash
# Zero Shoki/Munadi/Dicta residuals in target scope
$ rg -rn "(shoki|Shoki|SHOKI_|@shoki/|libshoki|\.shoki\.|munadi|Munadi|MUNADI_|@munadi/|libmunadi|\.munadi\.|dicta|Dicta|DICTA_)" .github/actions .github/workflows
# => no matches

# Positive expectations
$ grep -q "ogmios.node"       .github/actions/build-zig-binding/action.yml  # ok
$ grep -q "libogmios.dylib"   .github/actions/build-zig-binding/action.yml  # ok
$ grep -q "ogmios.node"       .github/workflows/release.yml                 # ok
$ grep -q "ogmios-darwin-"    .github/workflows/app-release.yml             # ok

# YAML syntax validation
$ for f in .github/workflows/*.yml .github/workflows/examples/*.yml .github/actions/*/action.yml; do
    python3 -c "import yaml; yaml.safe_load(open('$f'))"
  done
# All YAML valid
```

## Success Criteria

- [x] Zero Shoki/Munadi/Dicta residuals in `.github/actions/**` and `.github/workflows/**`
- [x] `build-zig-binding/action.yml` produces `ogmios.node` from `libogmios.dylib`
- [x] `release.yml` publishes `ogmios` + `@ogmios/binding-darwin-arm64` + `-x64`
- [x] `app-release.yml` produces `ogmios-darwin-<arch>.{zip,sha256}`
- [x] All YAML parses as valid
- [x] One atomic commit (`857d627`; content merged in `e0db4c2`)

## Self-Check: PASSED

- FOUND: `.github/actions/build-zig-binding/action.yml` (contains `ogmios.node`, `libogmios.dylib`)
- FOUND: `.github/workflows/release.yml` (contains `ogmios.node`)
- FOUND: `.github/workflows/app-release.yml` (contains `ogmios-darwin-`)
- FOUND: `.github/workflows/tart-publish.yml` (contains `ogmios-vo-ready`, `ghcr.io/thejackshelton/ogmios`)
- FOUND: `.github/workflows/examples/ogmios-cirrus-runners.yml`
- FOUND: `.github/workflows/examples/ogmios-getmac.yml`
- FOUND: `.github/workflows/examples/ogmios-github-hosted.yml`
- FOUND: `.github/workflows/examples/ogmios-tart-selfhosted.yml`
- FOUND commit `857d627`: `refactor(12-07): confirm CI workflows + composite actions already rebranded to Ogmios`
- FOUND commit `e0db4c2`: content-bearing commit that incorporated Plan 12-07's file changes

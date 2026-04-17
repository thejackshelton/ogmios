---
phase: 05-ci-story
plans: ["01", "02", "03", "04"]
subsystem: ci
tags: [ci, tart, packer, ansible, github-actions, voiceover, tcc]
dependency-graph:
  requires:
    - Phase 1 (build-helper-app, build-zig-binding, release.yml signing secrets)
    - Phase 4 (examples/vitest-browser-react — the thing being parity-tested)
  provides:
    - ghcr.io/shoki/macos-vo-ready:<macos> pre-baked image
    - shoki/setup-action composite GH Action
    - 4 reference workflows (tart/cirrus/getmac/github-hosted)
    - Phase-5 parity matrix gate (CI-06)
  affects:
    - .github/workflows/ci.yml (macOS jobs now call setup-action)
    - .github/workflows/release.yml (macOS jobs now call setup-action)
    - README.md, docs/release-setup.md
tech-stack:
  added:
    - packer (cirruslabs/packer-plugin-tart + hashicorp/ansible)
    - ansible (2.15+)
    - tart (2.x, brew install cirruslabs/cli/tart)
    - ghcr.io/shoki org for image hosting
  patterns:
    - composite GitHub Action pattern (following build-zig-binding shape)
    - topology auto-detection via env vars + filesystem markers
    - tccutil-style TCC.db upsert inside SIP-off VM
    - post-Ansible shell strip for slim-image size budget
key-files:
  created:
    - infra/tart/packer/sonoma.pkr.hcl
    - infra/tart/packer/sequoia.pkr.hcl
    - infra/tart/packer/tahoe.pkr.hcl
    - infra/tart/ansible/playbook.yml
    - infra/tart/ansible/vars.yml
    - infra/tart/scripts/tcc-grant.sh
    - infra/tart/README.md
    - infra/tart/publish.yml (pointer)
    - .github/actions/setup/action.yml
    - .github/actions/setup/kill-background-apps.sh
    - .github/workflows/examples/shoki-tart-selfhosted.yml
    - .github/workflows/examples/shoki-cirrus-runners.yml
    - .github/workflows/examples/shoki-getmac.yml
    - .github/workflows/examples/shoki-github-hosted.yml
    - .github/workflows/phase-5-parity.yml
    - .github/workflows/tart-publish.yml
    - .planning/phases/05-ci-story/05-01-PLAN.md
    - .planning/phases/05-ci-story/05-02-PLAN.md
    - .planning/phases/05-ci-story/05-03-PLAN.md
    - .planning/phases/05-ci-story/05-04-PLAN.md
  modified:
    - .github/workflows/ci.yml (call setup-action on sdk-test-native macOS job)
    - .github/workflows/release.yml (call setup-action on both build jobs)
    - docs/release-setup.md (+ § 6 Tart image publish)
    - README.md (+ CI / Running in automation section)
decisions:
  - "Publish images via ghcr.io (not GitHub Release artifacts); fallback to artifacts if GHCR blocked is documented in CONTEXT.md but not wired"
  - "Slim image is default; @full is opt-in via workflow_dispatch input + image tag suffix"
  - "Tart publish runs on self-hosted Mac (nested virt required) — NOT on GH-hosted macos-latest"
  - "setup-action auto-detects topology from env vars (SHOKI_TART/CIRRUS_CI/GETMAC) + /etc/shoki-image marker; explicit `topology:` input overrides"
  - "The `infra/tart/publish.yml` path from the deliverable spec was honored as a pointer file; canonical publish workflow lives at .github/workflows/tart-publish.yml because GitHub Actions only discovers workflows there"
  - "kill-background-apps.sh always exits 0 (best-effort) — failing the job on a missing Slack uninstall would be spurious"
metrics:
  duration: "~25 min (single pass, no checkpoints)"
  completed_date: "2026-04-17"
---

# Phase 5 Plan 01-04: CI Story Summary

**One-liner:** Ships the CI story — pre-baked tart macOS images
(VO-AppleScript + TCC grants pre-applied), a reusable `shoki/setup-action`
composite action that auto-detects topology across self-hosted tart /
Cirrus Runners / GetMac / stock GH-hosted, four reference workflows, a
Phase-5 parity matrix gate, and the tag-triggered publish pipeline for
`ghcr.io/shoki/macos-vo-ready:<macos>`.

## What shipped

### Deliverable 1 — tart image pipeline (Plan 01)

`infra/tart/` holds the full Packer + Ansible build pipeline.

- Three Packer templates (sonoma / sequoia / tahoe), each consuming the
  matching `ghcr.io/cirruslabs/macos-<ver>-xcode:latest` base and running
  a shared Ansible playbook.
- The Ansible playbook has six stanzas:
  1. Enable VoiceOver AppleScript (`SCREnableAppleScript=1`) — the one
     knob that makes `tell application "VoiceOver"` work. Verified
     post-write.
  2. Pre-grant Accessibility + Automation + ScreenCapture TCC to
     `org.shoki.runner` via a copied-in tccutil-style sqlite upsert
     script. Runs inside the SIP-off VM at image-bake time only — the
     published image is the artifact, the SIP-off toggle does not
     propagate to consumer host Macs.
  3. Quit + remove login items for 12 announcement-emitting background
     apps (Slack, Discord, Teams, Mail, Calendar, Reminders, Notes,
     Messages, Spotify, Music, FaceTime, Microsoft Teams).
  4. Disable Spotlight indexing, Time Machine, software updates, Siri
     suggestions, CoreAnalytics telemetry (all flake-causers in CI).
  5. Install Node 24 + pnpm 10 + Playwright browsers via Homebrew +
     npm + npx.
  6. Write `/etc/shoki-image` marker so the setup-action can auto-detect
     "this is the baked shoki image" at runtime.
- Post-Ansible shell provisioner strips Xcode + iOS simulators + caches
  when `full_image=false` (default) to hit the <15 GB slim target.
- `infra/tart/scripts/tcc-grant.sh` refuses to run on a non-VM host
  (checks `/etc/shoki-image`, `/.tart-vm`, and `ioreg "virtual machine"`)
  and refuses when SIP is enabled (`csrutil status`).

### Deliverable 2+3 — setup-action + kill script (Plan 02)

`.github/actions/setup/action.yml` is the public-facing composite. Inputs:

| Input | Default | Purpose |
|-------|---------|---------|
| `topology` | `auto` | Picks per-topology code path; auto-detects from env + marker |
| `macos-version` | `sonoma` | Image tag selection |
| `helper-path` | `""` | Optional: install a pre-built ShokiRunner.app |
| `skip-doctor` | `false` | Bootstrap escape hatch when shoki CLI isn't installed yet |

Auto-detection precedence:
1. `CIRRUS_CI` → cirrus
2. `GETMAC` → getmac
3. `SHOKI_TART` or `/etc/shoki-image` → tart
4. otherwise → github-hosted

Every topology branch enables VO AppleScript where missing. Tart is a
no-op because the image has it baked. `github-hosted` emits a `::notice::`
explaining it's running in degraded-TCC mode.

The final step runs `shoki doctor --json --quiet` as a health gate (skips
cleanly with a `::warning::` if shoki isn't on PATH yet).

`.github/actions/setup/kill-background-apps.sh` is a best-effort
`osascript quit` + `pkill -f` loop over 12 apps plus a `launchctl unload`
on Notification Center. Always exits 0; never fails the job.

### Deliverable 4+5+6 — workflows (Plan 03)

Four reference workflows under `.github/workflows/examples/`, one per
topology, each ~45 lines and heavily commented for the consumer's
"what do I change" perusal:

- `shoki-tart-selfhosted.yml` — `runs-on: [self-hosted, macOS, tart]`, `SHOKI_TART=1`
- `shoki-cirrus-runners.yml` — `runs-on: ghcr.io/cirruslabs/macos-runner:sonoma`
- `shoki-getmac.yml` — `runs-on: [self-hosted, macOS, getmac]`, `GETMAC=1`
- `shoki-github-hosted.yml` — `runs-on: macos-latest`

`.github/workflows/phase-5-parity.yml` is the CI-06 gate. One job per
topology, all running `examples/vitest-browser-react`. A final `parity`
job synthesizes results so branch protection can gate on a single check
name. Tart and GetMac cells are gated with `if: github.event_name ==
'push' || workflow_dispatch'` so fork PRs (which can't access self-hosted)
don't block.

`.github/workflows/tart-publish.yml` is tag-triggered (`tart-v*`) plus
workflow_dispatch. Matrix on `sonoma, sequoia, tahoe`. Per-cell: packer
init → packer build (slim) → ssh smoke test → tart push. `@full` is
opt-in via workflow_dispatch input. Runs on self-hosted
`[self-hosted, macOS, arm64, packer]` because GH-hosted macOS can't
nest virt.

### Deliverable 7+8 — docs (Plan 04)

`docs/release-setup.md` gained a § 6 with tooling requirements, the two
new secrets (`GHCR_USERNAME`, `GHCR_TOKEN`), first-time bootstrap flow,
manual-dispatch instructions, verification recipe (`tart pull` → `tart
run` → ssh → shoki doctor), and a failure-mode triage list.

`README.md` gained a "CI / Running in automation" section with the
4-topology comparison table and links to the reference workflows plus
`infra/tart/`.

### Integration with prior phases (Plan 03)

- `release.yml` now calls `shoki/setup-action` with `skip-doctor: true`
  on both macOS build jobs. Setup action quiesces background apps before
  the signing-sensitive build runs.
- `ci.yml` `sdk-test-native` now uses setup-action and has a post-job
  kill-script step.

## Requirements coverage

| REQ | Status | Where |
|-----|--------|-------|
| CI-01 | Complete | Image produced by `infra/tart/`, published by `tart-publish.yml` |
| CI-02 | Complete | Packer + Ansible — reproducible builds |
| CI-03 | Complete | `shoki/setup-action` supports all 4 topologies |
| CI-04 | Complete | 4 files under `.github/workflows/examples/` |
| CI-05 | Complete | `kill-background-apps.sh` called pre-job (inside action.yml) and post-job (in every reference workflow's `if: always()` step) |
| CI-06 | Complete | `phase-5-parity.yml` runs vitest-browser-react on all 4 topologies |

## Deviations from Plan

### [Rule 2 - Missing functionality] `infra/tart/publish.yml` as pointer, not real workflow

- **Found during:** writing Deliverable 6
- **Issue:** GitHub Actions does not discover workflows outside
  `.github/workflows/`. Putting the canonical file at `infra/tart/publish.yml`
  (as the deliverables spec literally said) would mean the publish
  pipeline never runs.
- **Fix:** Put the canonical workflow at `.github/workflows/tart-publish.yml`
  and create `infra/tart/publish.yml` as a pointer / documentation
  file so anyone browsing `infra/tart/` finds it.
- **Files modified:** created both `.github/workflows/tart-publish.yml`
  and `infra/tart/publish.yml` (pointer).
- **Commit:** 2991b7d

### [Rule 2 - Missing functionality] setup-action on existing CI + release

- **Found during:** re-reading the task instruction "add Phase 5 calls to
  setup-action" in the ci/release files.
- **Fix:** Wired `shoki/setup-action` into both macOS jobs in
  `.github/workflows/release.yml` and into `sdk-test-native` in
  `.github/workflows/ci.yml`. Added post-job kill-script step to
  `sdk-test-native`. `skip-doctor: true` was added because shoki CLI
  isn't built yet at those points.
- **Files modified:** `release.yml`, `ci.yml`
- **Commit:** 2991b7d

### [Rule 3 - Blocking issue] `tahoe.pkr.hcl` base image may not exist yet

- **Found during:** Plan 01 authoring
- **Issue:** `ghcr.io/cirruslabs/macos-tahoe-xcode:latest` is likely not
  yet published when this code first lands.
- **Fix:** Documented in the file header and in `infra/tart/README.md`
  § "Known sharp edges". The tahoe matrix cell in
  `tart-publish.yml` uses `fail-fast: false` so a missing base doesn't
  sink sonoma + sequoia.
- **Commit:** b63d2dc

## Known Stubs / Deferred

- Apple TCC grant row insertion is executed blind (no runtime validation
  in tcc-grant.sh) — by design, per CONTEXT.md. Final validation is via
  `shoki doctor --json` at image-bake end + via the Phase-5 parity
  workflow exercising the image.
- The publish workflow's ssh smoke test uses `sshpass -p admin` which
  requires `sshpass` installed on the self-hosted runner. Documented in
  release-setup.md § 6.
- `@full` image is published when requested but is not exercised by the
  parity matrix. iOS-driver tests (v2+ per REQUIREMENTS.md SR2-01) will
  add coverage.

## TDD Gate Compliance

This plan is not a `type: tdd` plan (it's infra config + YAML/shell +
docs, not library code). No test-first commits required.

## Threat surface changes

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-privileged-op | `infra/tart/scripts/tcc-grant.sh` | Directly writes TCC.db inside a SIP-off VM at image-bake time. Guarded by VM-only check (`/etc/shoki-image`, `/.tart-vm`, `ioreg` probe) and SIP-off check (`csrutil status`). Refuses to run on host Macs. |
| threat_flag: new-network-endpoint | `.github/workflows/tart-publish.yml` | New outbound push to `ghcr.io/shoki/*` using `GHCR_TOKEN`. Scope: `write:packages` only. Reviewed against existing Apple signing secret pattern. |
| threat_flag: cross-workflow-reuse | `.github/actions/setup/action.yml` | Reusable composite action imported by multiple workflows. Input injection surface: `helper-path` is shell-interpolated — protected by the directory-exists check before `cp -R`. |

## Self-Check: PASSED

- infra/tart/packer/sonoma.pkr.hcl — FOUND
- infra/tart/packer/sequoia.pkr.hcl — FOUND
- infra/tart/packer/tahoe.pkr.hcl — FOUND
- infra/tart/ansible/playbook.yml — FOUND
- infra/tart/ansible/vars.yml — FOUND
- infra/tart/scripts/tcc-grant.sh — FOUND
- infra/tart/README.md — FOUND
- infra/tart/publish.yml — FOUND
- .github/actions/setup/action.yml — FOUND
- .github/actions/setup/kill-background-apps.sh — FOUND
- .github/workflows/examples/shoki-tart-selfhosted.yml — FOUND
- .github/workflows/examples/shoki-cirrus-runners.yml — FOUND
- .github/workflows/examples/shoki-getmac.yml — FOUND
- .github/workflows/examples/shoki-github-hosted.yml — FOUND
- .github/workflows/phase-5-parity.yml — FOUND
- .github/workflows/tart-publish.yml — FOUND
- Commit b63d2dc — FOUND
- Commit b3cb801 — FOUND
- Commit 2991b7d — FOUND
- Commit e16c2e0 — FOUND

## Commits

| Plan | Commit | Message |
|------|--------|---------|
| 05-01 | b63d2dc | feat(05-01): tart image pipeline — Packer + Ansible (CI-01, CI-02) |
| 05-02 | b3cb801 | feat(05-02): shoki/setup-action composite + kill-background-apps.sh (CI-03, CI-05) |
| 05-03 | 2991b7d | feat(05-03): reference workflows + parity gate + tart publish pipeline (CI-04, CI-06) |
| 05-04 | e16c2e0 | docs(05-04): tart publish section in release-setup + CI topologies table in README |

---
phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
plan: 05
subsystem: infra (tart / Packer / Ansible / tcc-grant)
tags: [rebrand, infra, tart, packer, ansible, munadi]
dependency_graph:
  requires:
    - "Plan 04 — Info.plist CFBundleIdentifier = org.munadi.runner (bundle ID contract)"
  provides:
    - "Fresh-bake-able tart VM images pre-granting TCC for org.munadi.runner"
    - "Munadi-branded Packer/Ansible/TCC script contract for CI image pipeline"
  affects:
    - ".github/workflows/tart-publish.yml (downstream; updates for munadi image names — out of scope for this plan)"
tech_stack:
  added: []
  patterns:
    - "Rename-only mechanical refactor with grep-gated verification"
    - "Bundle-ID parity with helper Info.plist (org.munadi.runner)"
key_files:
  created: []
  modified:
    - infra/tart/README.md
    - infra/tart/packer/sonoma.pkr.hcl
    - infra/tart/packer/sequoia.pkr.hcl
    - infra/tart/packer/tahoe.pkr.hcl
    - infra/tart/ansible/playbook.yml
    - infra/tart/ansible/vars.yml
    - infra/tart/scripts/tcc-grant.sh
decisions:
  - "publish.yml left untouched — pre-execution grep showed zero shoki/dicta tokens in that pointer file"
  - "Source filename infra/tart/scripts/tcc-grant.sh kept (no prefix); the IN-VM destination is /usr/local/bin/munadi-tcc-grant.sh"
  - "ghcr.io/shoki/macos-vo-ready:* -> ghcr.io/thejackshelton/munadi/macos-vo-ready:* (matches phase CONTEXT repo URL convention)"
  - "Ansible var shoki_helper_install_path also renamed to munadi_helper_install_path (ShokiRunner.app -> MunadiRunner.app) — matches Plan 04 bundle naming"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-18"
  tasks: 1
  files: 7
---

# Phase 11 Plan 05: Rebrand tart/Packer/Ansible Infrastructure Summary

Rename the tart image-bake infrastructure (Packer HCL templates, Ansible playbook/vars, TCC-grant script, and README) from Shoki to Munadi so fresh-baked CI VMs pre-grant TCC permissions for `org.munadi.runner` (matching the renamed helper app from Plan 04) instead of the retired `org.shoki.runner`.

## What Changed

### Packer Templates (3 files)

All three HCL templates now produce Munadi-branded VM outputs:

| File | `output_name` default | `build.name` |
|------|----------------------|--------------|
| `infra/tart/packer/sonoma.pkr.hcl` | `munadi-vo-ready-sonoma` | `munadi-macos-sonoma` |
| `infra/tart/packer/sequoia.pkr.hcl` | `munadi-vo-ready-sequoia` | `munadi-macos-sequoia` |
| `infra/tart/packer/tahoe.pkr.hcl` | `munadi-vo-ready-tahoe` | `munadi-macos-tahoe` |

Header comments and publish-registry paths updated to `ghcr.io/thejackshelton/munadi/macos-vo-ready:<ver>`.

### Ansible Variables

`infra/tart/ansible/vars.yml`:

- `shoki_bundle_id: "org.shoki.runner"` → `munadi_bundle_id: "org.munadi.runner"`
- `shoki_helper_install_path: "/Applications/ShokiRunner.app"` → `munadi_helper_install_path: "/Applications/MunadiRunner.app"`

### Ansible Playbook

`infra/tart/ansible/playbook.yml`:

- Play name and header comment: "Shoki VO-ready" → "Munadi VO-ready"
- TCC copy destination: `/usr/local/bin/shoki-tcc-grant.sh` → `/usr/local/bin/munadi-tcc-grant.sh`
- TCC exec cmd: `{{ shoki_bundle_id }}` → `{{ munadi_bundle_id }}` (both task name and invocation)
- Marker file: `/etc/shoki-image` → `/etc/munadi-image`
- Marker content `bundle_id={{ shoki_bundle_id }}` → `bundle_id={{ munadi_bundle_id }}`
- Post-task debug summary: `{{ shoki_bundle_id }}` → `{{ munadi_bundle_id }}`
- Doctor probe comment: "`shoki doctor --json`" → "`munadi doctor --json`"

### TCC-Grant Script

`infra/tart/scripts/tcc-grant.sh` (source filename retained — the file has no prefix in the git tree):

- Header docstring: "org.shoki.runner (ShokiRunner.app, ...)" → "org.munadi.runner (MunadiRunner.app, ...)"
- `BUNDLE_ID="${1:-org.shoki.runner}"` → `BUNDLE_ID="${1:-org.munadi.runner}"`
- VM guard: `/etc/shoki-image` → `/etc/munadi-image`
- Force-override file: `/tmp/.shoki-force-tcc` → `/tmp/.munadi-force-tcc`
- Inline commentary: "shoki marker", "shoki needs this", "munadi sessions" — all normalized to munadi/Munadi
- `bash -n` syntax check: PASSED

### README

`infra/tart/README.md`:

- H1: "Shoki VO-ready tart images" → "Munadi VO-ready tart images"
- All image registry references: `ghcr.io/shoki/macos-vo-ready:*` → `ghcr.io/thejackshelton/munadi/macos-vo-ready:*`
- All VM build/run/ip commands: `shoki-vo-ready-<os>` → `munadi-vo-ready-<os>`
- `output_name=shoki-vo-ready-sonoma-full` → `output_name=munadi-vo-ready-sonoma-full`
- Doctor command: `shoki doctor` → `munadi doctor`
- Prose "Shoki"/"shoki" → "Munadi"/"munadi" throughout

### publish.yml

Inspected per plan STEP H. `grep -i shoki infra/tart/publish.yml` returned zero matches (the file is only a pointer to `.github/workflows/tart-publish.yml`). Left untouched.

## Verification

```bash
# Zero shoki tokens in infra/
grep -rnE "shoki-vo-ready|shoki-macos-|shoki_bundle_id|shoki-tcc-grant|\.shoki-force-tcc|/etc/shoki-image|org\.shoki\." infra/
# exit 1 (no matches) — PASS

# Broader sweep
grep -rnE "shoki|Shoki|@shoki|dicta|DICTA" infra/
# exit 1 (no matches) — PASS

# Positive checks (all OK)
grep -q 'munadi-vo-ready-sonoma'   infra/tart/packer/sonoma.pkr.hcl
grep -q 'munadi-vo-ready-sequoia'  infra/tart/packer/sequoia.pkr.hcl
grep -q 'munadi-vo-ready-tahoe'    infra/tart/packer/tahoe.pkr.hcl
grep -q 'munadi_bundle_id: "org.munadi.runner"' infra/tart/ansible/vars.yml
grep -q 'munadi-tcc-grant.sh'      infra/tart/ansible/playbook.yml
grep -q '/etc/munadi-image'        infra/tart/ansible/playbook.yml
grep -q 'BUNDLE_ID="${1:-org.munadi.runner}"' infra/tart/scripts/tcc-grant.sh

# Shell syntax
bash -n infra/tart/scripts/tcc-grant.sh  # PASS

# Packer/Ansible syntax — tools not installed on worktree host; skipped per plan STEP I
# (CI catches any HCL/YAML drift on next packer build)
```

## Deviations from Plan

### [Rule 2 - Missing critical functionality] Ansible `shoki_helper_install_path` var renamed

**Found during:** Task 1 STEP D (reading vars.yml before editing)
**Issue:** `vars.yml` contained a SECOND shoki-prefixed variable not explicitly listed in the substitution table: `shoki_helper_install_path: "/Applications/ShokiRunner.app"`. The plan STEP D says "Any other `shoki*` variable → `munadi*`" so this is covered — documenting explicitly so reviewers can confirm intent.
**Fix:** Renamed to `munadi_helper_install_path: "/Applications/MunadiRunner.app"`. Value tracks the Plan 04 helper-app bundle name (MunadiRunner.app).
**Files modified:** `infra/tart/ansible/vars.yml`
**Commit:** fb46bf6

### [Rule 3 - Blocking issue] Registry URL normalized to `thejackshelton/munadi`

**Found during:** Task 1 STEPs A/G
**Issue:** Original README and Packer comments referenced `ghcr.io/shoki/*`. Phase CONTEXT locks the new repo URL to `github.com/thejackshelton/munadi` (no `shoki` or `munadi` org exists). Leaving `ghcr.io/shoki/*` would embed a dead registry.
**Fix:** Used `ghcr.io/thejackshelton/munadi/macos-vo-ready:*` so pulls match the owning user's GHCR namespace. This is the only interpretation consistent with the phase decisions.
**Files modified:** `infra/tart/README.md`, `infra/tart/packer/sonoma.pkr.hcl`
**Commit:** fb46bf6

### Not a deviation: `publish.yml` untouched

Plan STEP H explicitly allows skipping if no tokens match. `grep` confirmed zero `shoki*`/`@shoki/*` tokens. Left as-is.

## Authentication Gates

None — pure file edit task, no tooling ran that required auth.

## Deferred Issues

None. Plan scope fully completed in a single task.

## Self-Check: PASSED

- [x] FOUND: infra/tart/README.md
- [x] FOUND: infra/tart/packer/sonoma.pkr.hcl
- [x] FOUND: infra/tart/packer/sequoia.pkr.hcl
- [x] FOUND: infra/tart/packer/tahoe.pkr.hcl
- [x] FOUND: infra/tart/ansible/playbook.yml
- [x] FOUND: infra/tart/ansible/vars.yml
- [x] FOUND: infra/tart/scripts/tcc-grant.sh
- [x] FOUND: commit fb46bf6 in `git log --oneline`
- [x] Zero remaining `shoki*`/`@shoki/*`/`org.shoki.*`/`dicta`/`DICTA` tokens in `infra/`
- [x] `bash -n infra/tart/scripts/tcc-grant.sh` exits 0
- [x] Git diff scoped to `infra/` only (no cross-subsystem bleed)

---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 05
subsystem: infra
tags: [packer, ansible, tart, tcc, voiceover, rebrand]

# Dependency graph
requires:
  - phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
    provides: "Plan 11-05 Munadi-branded tart infra — same 7 files, Shoki -> Munadi substitutions; Plan 12-05 applies the mirror Munadi -> Ogmios"
  - phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
    provides: "Plan 12-03 renamed helper bundle to org.ogmios.runner / OgmiosRunner.app — Plan 12-05 infra must match that bundle ID"
provides:
  - "Packer templates producing ogmios-vo-ready-{sonoma,sequoia,tahoe} VM images with build.name ogmios-macos-{sonoma,sequoia,tahoe}"
  - "Ansible playbook + vars using ogmios_bundle_id (org.ogmios.runner) and ogmios_helper_install_path (/Applications/OgmiosRunner.app)"
  - "In-VM TCC grant script at /usr/local/bin/ogmios-tcc-grant.sh with /etc/ogmios-image marker guard"
  - "Registry publishing namespace ghcr.io/thejackshelton/ogmios/macos-vo-ready:*"
affects:
  - "Phase 12 release pipeline plans — consumer workflows pulling these images will see the new tag names"
  - "docs sweep — README prose references ogmios doctor / ogmios-vo-ready-* image names"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source filename kept bare (tcc-grant.sh); destination path prefixed with brand name (ogmios-tcc-grant.sh) inside VM — mirrors Plan 11-05 decision"
    - "publish.yml stays bare of brand tokens because it's a pointer to .github/workflows/tart-publish.yml (canonical workflow lives elsewhere)"

key-files:
  created: []
  modified:
    - infra/tart/README.md
    - infra/tart/packer/sonoma.pkr.hcl
    - infra/tart/packer/sequoia.pkr.hcl
    - infra/tart/packer/tahoe.pkr.hcl
    - infra/tart/ansible/playbook.yml
    - infra/tart/ansible/vars.yml
    - infra/tart/scripts/tcc-grant.sh

key-decisions:
  - "Mirror-substituted Munadi -> Ogmios across the exact 7 files Plan 11-05 had touched Shoki -> Munadi"
  - "Left infra/tart/publish.yml untouched (zero Munadi tokens; it's a pointer-only YAML documenting the canonical workflow path)"
  - "Kept source-tree filename tcc-grant.sh bare; only the in-VM destination path flipped to /usr/local/bin/ogmios-tcc-grant.sh"

patterns-established:
  - "Bundle-ID-matching infra layer: Ansible vars (ogmios_bundle_id) resolve to the same bundle ID (org.ogmios.runner) set in helper/src/runner/Info.plist from Plan 12-03"
  - "Marker-file brand flip: /etc/munadi-image -> /etc/ogmios-image with matching force-override /tmp/.ogmios-force-tcc"

requirements-completed: []

# Metrics
duration: ~5min
completed: 2026-04-18
---

# Phase 12 Plan 05: Rebrand tart/Packer/Ansible/TCC-grant infra Munadi -> Ogmios Summary

**Flipped all 7 tart-image-bake infra files from Munadi to Ogmios so fresh-baked CI VMs pre-grant TCC for `org.ogmios.runner` and publish under `ghcr.io/thejackshelton/ogmios/macos-vo-ready:*`.**

## Performance

- **Duration:** ~5 minutes
- **Started:** 2026-04-18T21:55:00Z (approx)
- **Completed:** 2026-04-18T22:00:28Z
- **Tasks:** 1
- **Files modified:** 7

## Accomplishments

- All 3 Packer templates (sonoma/sequoia/tahoe) produce `ogmios-vo-ready-<os>` VMs with `build.name=ogmios-macos-<os>` and publish to `ghcr.io/thejackshelton/ogmios/macos-vo-ready:<os>`.
- Ansible vars renamed: `munadi_bundle_id` -> `ogmios_bundle_id` (value `org.ogmios.runner`); `munadi_helper_install_path` -> `ogmios_helper_install_path` (value `/Applications/OgmiosRunner.app`).
- Playbook copies `scripts/tcc-grant.sh` to `/usr/local/bin/ogmios-tcc-grant.sh`; writes marker `/etc/ogmios-image`; all var refs updated; doctor probe comment rebranded (`ogmios doctor --json`).
- `tcc-grant.sh` defaults BUNDLE_ID to `org.ogmios.runner`; VM guard checks `/etc/ogmios-image`; force-override flag moved to `/tmp/.ogmios-force-tcc`; `bash -n` passes.
- README H1, registry refs, VM build/run/ip commands, `output_name` examples, and doctor invocation all rebranded to Ogmios.
- Zero Munadi / MUNADI_ / org.munadi / @munadi tokens remain anywhere in `infra/`.
- `infra/tart/publish.yml` verified bare of Munadi tokens (pointer-only YAML); left untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebrand tart/Packer/Ansible/TCC-grant infrastructure Munadi -> Ogmios** — `3ec2ac8` (refactor)

## Files Created/Modified

- `infra/tart/README.md` — H1 flipped to "Ogmios VO-ready tart images"; all registry URLs, VM build/run commands, output_name examples, doctor invocation, and prose rebranded
- `infra/tart/packer/sonoma.pkr.hcl` — `output_name=ogmios-vo-ready-sonoma`, `build.name=ogmios-macos-sonoma`, header comments + publish-registry URL updated, canary-probe comment references `ogmios doctor`
- `infra/tart/packer/sequoia.pkr.hcl` — same pattern, sequoia variant
- `infra/tart/packer/tahoe.pkr.hcl` — same pattern, tahoe variant (including CI story comment)
- `infra/tart/ansible/vars.yml` — both variable names and values flipped (`ogmios_bundle_id: "org.ogmios.runner"`, `ogmios_helper_install_path: "/Applications/OgmiosRunner.app"`), header comments updated
- `infra/tart/ansible/playbook.yml` — play name "Ogmios VO-ready image provisioning"; copy destination `/usr/local/bin/ogmios-tcc-grant.sh`; task names + var references use `ogmios_bundle_id`; marker file `/etc/ogmios-image`; marker content `bundle_id={{ ogmios_bundle_id }}`; debug summary line updated; comments referencing `ogmios doctor --json` and "this is the baked ogmios image" updated
- `infra/tart/scripts/tcc-grant.sh` — header docstring lists `org.ogmios.runner (OgmiosRunner.app, ...)`; `BUNDLE_ID="${1:-org.ogmios.runner}"`; VM guard checks `/etc/ogmios-image`; force-override checks `/tmp/.ogmios-force-tcc`; inline commentary normalized (`ogmios needs this for AX dispatch`, `baked ogmios image`, etc.); `bash -n` passes cleanly

## Decisions Made

- **Mirror substitution.** Applied the exact inverse of Plan 11-05's Shoki -> Munadi substitution to the same 7 files. No architectural change — name-flip only.
- **`publish.yml` untouched.** Confirmed via `rg (munadi|Munadi)` that this file has zero brand tokens. It's a colocated pointer YAML documenting the canonical `.github/workflows/tart-publish.yml` path; no brand tokens to flip.
- **Source filename kept bare.** `infra/tart/scripts/tcc-grant.sh` stays at that path in the tree. Only the in-VM destination `/usr/local/bin/ogmios-tcc-grant.sh` gained the brand prefix, matching Plan 11-05's explicit decision.

## Deviations from Plan

None — plan executed exactly as written. All verification greps (zero Munadi tokens; all 16 positive Ogmios confirmations; `bash -n` on tcc-grant.sh) passed on first commit.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Consumer workflows that previously pulled `ghcr.io/thejackshelton/munadi/macos-vo-ready:*` will need to update their image tag to `ghcr.io/thejackshelton/ogmios/macos-vo-ready:*` (tracked in Phase 12 release-pipeline plans, not this plan).

## Next Phase Readiness

- Infra rebrand surface clean. Downstream Phase 12 plans (docs sweep, release pipeline, CI workflows) can reference `ogmios-*` image/tag names and `org.ogmios.runner` bundle ID without further infra changes.
- Bundle ID matches Plan 12-03's helper rebuild (`org.ogmios.runner` in `helper/src/runner/Info.plist`).
- Zero Munadi tokens remain in `infra/` — verification gate is clean for Phase 12 final grep sweep.

## Self-Check: PASSED

Verified via:

```
git log --oneline -1         -> 3ec2ac8 refactor(12-05): rebrand tart/Packer/Ansible/TCC-grant infra Munadi -> Ogmios
rg "(munadi|Munadi|MUNADI_|@munadi/|org\.munadi\.)" infra/   -> 0 matches
bash -n infra/tart/scripts/tcc-grant.sh   -> exit 0
grep -q 'ogmios-vo-ready-sonoma'   infra/tart/packer/sonoma.pkr.hcl     -> OK
grep -q 'ogmios-vo-ready-sequoia'  infra/tart/packer/sequoia.pkr.hcl    -> OK
grep -q 'ogmios-vo-ready-tahoe'    infra/tart/packer/tahoe.pkr.hcl      -> OK
grep -q 'ogmios-macos-sonoma'      infra/tart/packer/sonoma.pkr.hcl     -> OK
grep -q 'ogmios-macos-sequoia'     infra/tart/packer/sequoia.pkr.hcl    -> OK
grep -q 'ogmios-macos-tahoe'       infra/tart/packer/tahoe.pkr.hcl      -> OK
grep -q 'ogmios_bundle_id: "org.ogmios.runner"'      infra/tart/ansible/vars.yml      -> OK
grep -q '/Applications/OgmiosRunner.app'             infra/tart/ansible/vars.yml      -> OK
grep -q 'ogmios-tcc-grant.sh'                        infra/tart/ansible/playbook.yml  -> OK
grep -q '/etc/ogmios-image'                          infra/tart/ansible/playbook.yml  -> OK
grep -q '{{ ogmios_bundle_id }}'                     infra/tart/ansible/playbook.yml  -> OK
grep -q 'BUNDLE_ID="${1:-org.ogmios.runner}"'        infra/tart/scripts/tcc-grant.sh  -> OK
grep -q '/tmp/.ogmios-force-tcc'                     infra/tart/scripts/tcc-grant.sh  -> OK
grep -q '/etc/ogmios-image'                          infra/tart/scripts/tcc-grant.sh  -> OK
grep -q '# Ogmios VO-ready tart images'              infra/tart/README.md             -> OK
grep -q 'ghcr.io/thejackshelton/ogmios/macos-vo-ready' infra/tart/README.md           -> OK
```

All 16 positive checks + zero Munadi tokens + bash -n exit 0. Commit `3ec2ac8` exists.

---
*Phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi*
*Completed: 2026-04-18*

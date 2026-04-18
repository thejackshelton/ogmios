---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 09
subsystem: docs-and-prose
tags: [rebrand, docs, changelog, license, runbook, celtic-etymology]
dependency_graph:
  requires:
    - 12-01
    - 12-02
    - 12-03
    - 12-04
    - 12-05
    - 12-06
    - 12-07
    - 12-08
  provides:
    - "Ogmios-branded public surface: README, VitePress site, LICENSEs, CHANGELOG v0.1.1, release runbook"
    - "Celtic etymology anchor (Lucian's chains of gold, tongue-to-ear imagery) on both README and docs/index.md"
    - "CHANGELOG v0.1.1 entry explaining the final pivot with historical entries preserved"
    - "All LICENSE files re-attributed to 'Ogmios contributors'"
  affects:
    - "None in-tree code — prose only. Consumers land on ogmios/@ogmios branding."
tech_stack:
  added: []
  patterns:
    - "Preserve CHANGELOG history as immutable record; add new versioned entry on top for the pivot."
    - "Etymology duplicated between README and docs/index.md as shared source of truth (one-paragraph Lucian citation + tongue-to-ear imagery)."
    - "Documentation cross-references use absolute GitHub URLs pointing at github.com/thejackshelton/ogmios."
key_files:
  created: []
  modified:
    - README.md
    - CHANGELOG.md
    - CLAUDE.md
    - CONTRIBUTING.md
    - LICENSE
    - packages/sdk/README.md
    - packages/binding-darwin-arm64/LICENSE
    - packages/binding-darwin-x64/LICENSE
    - docs/index.md
    - docs/package.json
    - docs/.vitepress/config.ts
    - docs/public/logo.svg
    - docs/getting-started/install.md
    - docs/getting-started/vitest-quickstart.md
    - docs/getting-started/ci-quickstart.md
    - docs/getting-started/permission-setup.md
    - docs/api/sdk.md
    - docs/api/vitest.md
    - docs/api/matchers.md
    - docs/api/cli.md
    - docs/guides/matchers.md
    - docs/guides/migration-from-guidepup.md
    - docs/guides/troubleshooting.md
    - docs/guides/ci/getmac.md
    - docs/guides/ci/cirrus-runners.md
    - docs/guides/ci/tart-selfhosted.md
    - docs/guides/ci/gh-hosted.md
    - docs/background/architecture.md
    - docs/background/platform-risk.md
    - docs/background/adding-a-driver.md
    - docs/background/release-setup.md
    - .planning/RELEASE-v0.1.0-RUNBOOK.md
decisions:
  - "Kept the RELEASE-RUNBOOK file name RELEASE-v0.1.0-RUNBOOK.md (file-level rename deferred to a future cleanup pass) but rewrote the contents for v0.1.1 Ogmios release. The file acts as the runbook regardless of filename."
  - "Retained prior-name references in the v0.1.1 CHANGELOG entry and RELEASE-RUNBOOK's naming-saga + npm deprecate commands — these are required historical context per the plan's <interfaces> and decisions sections."
  - "Collapsed install.md's embedded migration token table into a single pointer at the CHANGELOG to reduce cross-prose name duplication."
metrics:
  duration_min: 18
  completed_at: "2026-04-18"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 32
  files_created: 0
---

# Phase 12 Plan 09: Full Prose + Docs Rebrand to Ogmios Summary

Sweep every remaining Shoki / Munadi / Dicta token out of user-facing prose, LICENSEs, and the release runbook; anchor the new brand with Lucian's Gaulish-god-of-eloquence imagery on both the repo README and the VitePress homepage; and land a v0.1.1 CHANGELOG entry that explains the final pivot while leaving prior history untouched.

## Deviations from Plan

### Deferred Issues

**[Out of scope — Rule scope boundary] Pre-existing VitePress build failure in `docs/background/release-setup.md`**
- **Found during:** Verification step (`cd docs && pnpm build`)
- **Failure:** `TypeError: Cannot read properties of undefined (reading 'sha')` from server-renderer when rendering `release-setup.md.js` line 23.
- **Verification:** `git stash` → clean-tree `pnpm build` produces the identical failure. Not introduced by this plan.
- **Likely cause:** VitePress 1.6.4 `lastUpdated: true` hook tripping on a missing git-history entry for a recently-touched file, or a markdown token (`${{ github.sha }}` inside a fenced code block) interacting badly with the latest Vue server renderer.
- **Action:** Documented as deferred; build will be fixed in a follow-up (not a 12-09 deliverable per the scope-boundary rule — the plan exists to rebrand prose, not to fix VitePress infra).

### Auto-fixed Issues

None required. The plan was a pure prose sweep; no runtime or build behavior depends on the changes.

## Decisions Made

- **RELEASE-RUNBOOK filename kept, contents rewritten.** The plan spec authorized updating `RELEASE-v0.1.0-RUNBOOK.md` in place (item 13 of `<action>`). Renaming the file itself to `RELEASE-v0.1.1-RUNBOOK.md` is a later-plan concern; a filename rename now would complicate cross-references in the CHANGELOG and docs. Contents now target v0.1.1 Ogmios.
- **Install.md migration table collapsed.** Instead of re-embedding the full migration token map (`@shoki/sdk` → ... → `ogmios`) inline in `docs/getting-started/install.md`, the page now points at the CHANGELOG which holds the definitive migration record. This reduces token repetition in live docs while preserving discoverability for migrating users.
- **Historical prior-name references retained in CHANGELOG / RELEASE-RUNBOOK only.** The plan's `<interfaces>` explicitly required the CHANGELOG v0.1.1 entry to mention the rename chain and required the npm deprecate commands in the runbook. Those are the only two places where prior names still appear in shipped prose; every other user-facing surface is fully Ogmios.
- **Docs/public/logo.svg `aria-label` flipped.** The SVG itself had `aria-label="Shoki"` — a hidden a11y residual that a token grep catches. Updated to `aria-label="Ogmios"`.

## Verification Evidence

```bash
# Zero residuals across the main prose surfaces (CHANGELOG + RELEASE-RUNBOOK
# residuals are intentional history per plan spec)
rg -n "(shoki|Shoki|SHOKI_|munadi|Munadi|MUNADI_|dicta|Dicta|DICTA_)" \
  README.md CLAUDE.md CONTRIBUTING.md LICENSE \
  docs/ packages/sdk/README.md \
  packages/binding-darwin-arm64/LICENSE packages/binding-darwin-x64/LICENSE \
  | grep -v "^\.planning/RELEASE"
# → empty

# CHANGELOG has v0.1.1 on top; historical entries preserved
head -15 CHANGELOG.md
# → "## [0.1.1] - 2026-04-18" follows "## [Unreleased]"

grep -c "^## \[0\." CHANGELOG.md
# → 4 (0.1.1 + 0.1.0 + 0.1.0-prev-phase-8 + 0.1.0-pre-alpha)

# Etymology present on README + docs/index.md
grep -c "Gaulish" README.md docs/index.md
# README.md:2  docs/index.md:3
grep -c "Lucian" README.md docs/index.md
# README.md:2  docs/index.md:2

# LICENSE contributors attribution flipped everywhere
grep "Copyright" LICENSE packages/binding-darwin-arm64/LICENSE packages/binding-darwin-x64/LICENSE
# All three: "Copyright (c) 2026 Ogmios contributors"
```

## Commits

- `14f114e` — `docs(12-09): rebrand all prose + docs + LICENSEs to Ogmios + Celtic etymology + v0.1.1 CHANGELOG`
  - 32 files changed, 773 insertions(+), 670 deletions(-)

## Known Stubs

None. All referenced files exist; cross-links and code snippets point at real SDK identifiers (`voiceOver`, `OgmiosEvent`, `ogmiosVitest`, matcher names, CLI subcommands).

## Self-Check: PASSED

- `README.md`: exists, H1 is `# Ogmios`, Celtic etymology section present before install. **FOUND**
- `CHANGELOG.md`: v0.1.1 entry on top, history preserved (4 total versioned entries). **FOUND**
- `CLAUDE.md`: project section is `**Ogmios**`, no Shoki/Dicta/Munadi tokens remain. **FOUND**
- `LICENSE` × 3 (root + both bindings): "Copyright (c) 2026 Ogmios contributors". **FOUND**
- `docs/index.md`: VitePress hero name `Ogmios`, tagline leads with Celtic imagery, "What is Ogmios?" block cites Lucian. **FOUND**
- `docs/.vitepress/config.ts`: `title: "Ogmios"`, GitHub URLs updated, sidebar labels updated, `@ogmios/*` references, base path `/ogmios/`. **FOUND**
- `docs/public/logo.svg`: `aria-label="Ogmios"`. **FOUND**
- `.planning/RELEASE-v0.1.0-RUNBOOK.md`: retitled to v0.1.1 Ogmios runbook, publish commands reference `ogmios` + `@ogmios/binding-*`, deprecate commands cover prior-name packages. **FOUND**
- Commit `14f114e` present in `git log`. **FOUND**

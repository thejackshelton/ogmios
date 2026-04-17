---
phase: 01-foundations
plan: 01
subsystem: monorepo-scaffolding
status: completed
tags: [pnpm, workspaces, biome, typescript, optionalDependencies]
requirements_completed: [FOUND-02]
dependencies:
  requires: []
  provides:
    - "pnpm workspace at repo root with three packages"
    - "@shoki/sdk package shell (ESM, type: module, tsconfig, src/ empty)"
    - "@shoki/binding-darwin-arm64 platform package skeleton"
    - "@shoki/binding-darwin-x64 platform package skeleton"
    - "tsconfig.base.json (strict, NodeNext, verbatimModuleSyntax)"
    - "biome.json (2.4.12 migrated schema, formatter + linter)"
    - "zig/ and helper/ placeholder dirs (entry points for plans 02 and 04)"
    - "Root engines pin: Node >=24.0.0, pnpm 10"
  affects: [plan-02 (zig core), plan-03 (sdk src), plan-04 (helper app), plan-05 (signing), plan-06 (CI)]
tech-stack:
  added:
    - "pnpm 10 (packageManager)"
    - "@biomejs/biome ^2.0.0 (resolved 2.4.12)"
    - "typescript ^6.0.0 (resolved 6.0.3)"
  patterns:
    - "esbuild/swc/napi-rs v3 optionalDependencies distribution (per PITFALLS.md Pitfall 12)"
    - "No postinstall scripts — binaries ship IN platform packages (T-01-01 mitigation)"
    - "pnpm workspaces for monorepo layout (D-07)"
key-files:
  created:
    - path: "package.json"
      purpose: "monorepo root, engines pin, dev deps, pnpm scripts"
    - path: "pnpm-workspace.yaml"
      purpose: "workspace glob (packages/*)"
    - path: "pnpm-lock.yaml"
      purpose: "resolved lockfile, 3 workspace projects + devDeps"
    - path: "tsconfig.base.json"
      purpose: "shared TS 6 config for all packages"
    - path: "biome.json"
      purpose: "Biome 2.4.12 formatter + linter config"
    - path: ".gitignore"
      purpose: "ignore node_modules, dist, *.node, zig-out, .env"
    - path: ".editorconfig"
      purpose: "2-space JS/TS, 4-space Zig/Swift, LF, trim trailing"
    - path: ".nvmrc"
      purpose: "Node 24"
    - path: "packages/sdk/package.json"
      purpose: "@shoki/sdk metadata + optionalDependencies wiring"
    - path: "packages/sdk/tsconfig.json"
      purpose: "extends base, composite, outDir dist/"
    - path: "packages/sdk/README.md"
      purpose: "Phase 1 scaffold note"
    - path: "packages/binding-darwin-arm64/package.json"
      purpose: "darwin arm64 filter + shoki.node main"
    - path: "packages/binding-darwin-arm64/README.md"
      purpose: "platform binding explainer"
    - path: "packages/binding-darwin-arm64/.gitignore"
      purpose: "exclude built shoki.node + copied helper/"
    - path: "packages/binding-darwin-x64/package.json"
      purpose: "darwin x64 filter + shoki.node main"
    - path: "packages/binding-darwin-x64/README.md"
      purpose: "platform binding explainer"
    - path: "packages/binding-darwin-x64/.gitignore"
      purpose: "exclude built shoki.node + copied helper/"
    - path: "helper/.gitkeep"
      purpose: "placeholder for plan 04 ShokiRunner.app"
    - path: "zig/.gitkeep"
      purpose: "placeholder for plan 02 Zig core"
  modified: []
decisions:
  - "Biome config auto-migrated from 2.0 to 2.4.12 schema (files.ignore -> files.includes with ! negation). Plan wrote the 2.0 schema; Biome 2.4.12 (resolved from ^2.0.0) required migration. Applied `biome migrate --write`."
  - "Biome reformatted single-line os/cpu arrays to multi-line in both binding package.jsons. Semantic content unchanged (os/cpu filters still resolve to the same values). Kept Biome's formatting so `pnpm lint` stays green on every commit."
metrics:
  duration: "~6 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_created: 19
  commits: 2
---

# Phase 01 Plan 01: Monorepo Scaffolding Summary

## One-liner

pnpm 10 monorepo with three packages (`@shoki/sdk`, `@shoki/binding-darwin-arm64`, `@shoki/binding-darwin-x64`), Biome 2.4 + TypeScript 6 + Node 24 pins, and the `optionalDependencies` platform-binary distribution pattern ready for plans 02–06.

## What Shipped

- **Root workspace:** `package.json` (engines `node>=24.0.0`, `packageManager: pnpm@10.0.0`), `pnpm-workspace.yaml` (`packages/*`), `pnpm-lock.yaml` generated.
- **Shared tooling:** `tsconfig.base.json` (strict, NodeNext, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), `biome.json` (migrated to 2.4.12 schema), `.gitignore`, `.editorconfig`, `.nvmrc`.
- **Three workspace packages:**
  - `@shoki/sdk` (ESM, `type: module`, `optionalDependencies` pinning both bindings at `workspace:*`, `publishConfig.provenance: true`).
  - `@shoki/binding-darwin-arm64` (`os: ["darwin"]`, `cpu: ["arm64"]`, `main: "shoki.node"`, `publishConfig.provenance: true`).
  - `@shoki/binding-darwin-x64` (`os: ["darwin"]`, `cpu: ["x64"]`, `main: "shoki.node"`, `publishConfig.provenance: true`).
- **Placeholder dirs:** `zig/.gitkeep` (for plan 02) and `helper/.gitkeep` (for plan 04).

## Must-Haves Verification

| # | Truth | Verified how |
|---|-------|--------------|
| 1 | pnpm workspace resolves three packages: `@shoki/sdk`, `@shoki/binding-darwin-arm64`, `@shoki/binding-darwin-x64` | `pnpm ls --recursive --depth -1 --json` → 4 entries (root + 3 packages); `pnpm install` reported `Scope: all 4 workspace projects`. |
| 2 | `@shoki/sdk` declares both binding packages in `optionalDependencies` with os+cpu filters | `node -e "require('./packages/sdk/package.json').optionalDependencies['@shoki/binding-darwin-arm64']"` → `workspace:*` (both keys present); bindings' `package.json` each carry `"os": ["darwin"]` with single-element `cpu` arrays (`arm64` and `x64`). |
| 3 | Biome formats + lints TypeScript without config errors | `pnpm lint` → `Checked 8 files in 2ms. No fixes applied.` (exit 0, zero errors, zero warnings). Required one-shot migration to 2.4.12 schema. |
| 4 | Root `package.json` pins Node 24 LTS engines and pnpm 10 packageManager | `node -e "...engines.node.startsWith('>=24')... packageManager === 'pnpm@10.0.0'"` → OK. |

## Artifacts Verification

| Artifact | Provides | Present? |
|----------|----------|----------|
| `pnpm-workspace.yaml` | workspace package glob | yes — contains `packages/*` |
| `packages/sdk/package.json` | SDK npm package metadata | yes — contains `optionalDependencies` |
| `packages/binding-darwin-arm64/package.json` | arm64 platform binding package | yes — `os` array contains `"darwin"` |
| `packages/binding-darwin-x64/package.json` | x64 platform binding package | yes — `os` array contains `"darwin"` |
| `tsconfig.base.json` | shared TypeScript config | yes — contains `"strict": true` |
| `biome.json` | Biome 2.x formatter/linter config | yes (post-migration: schema URL is `2.4.12` instead of `2.0.0`) |

## Verification Block Results

- `pnpm install` at repo root → `Scope: all 4 workspace projects`, resolved with no errors. One informational warning about the x64 binding's `{os: darwin, cpu: x64}` not matching the arm64 host machine — this is the intended filtering behavior, not a failure.
- `pnpm lint` (Biome `check`) → 0 errors, 0 warnings.
- `node -e "require('./packages/sdk/package.json').optionalDependencies['@shoki/binding-darwin-arm64']"` → `workspace:*`.
- Each binding package's `os` and `cpu` arrays have exactly one element each.

## Deviations from Plan

### [Rule 1 — Bug fix] Biome 2.0 schema → 2.4.12 schema migration

- **Found during:** Verification of must-have truth #3 ("Biome formats + lints TypeScript without config errors").
- **Issue:** The plan specified `"$schema": "https://biomejs.dev/schemas/2.0.0/schema.json"` and `files.ignore` (deprecated). The installed Biome resolved `^2.0.0` to `2.4.12`, which rejects `files.ignore` and emits a schema-version-mismatch error. This would have left `pnpm lint` broken on every fresh clone.
- **Fix:** Ran `biome migrate --write` then `biome check --write .`. The migration renamed `files.ignore` → `files.includes` (using `!**/pattern` negation) and updated the `$schema` URL to `2.4.12`. Semantic meaning preserved: the same paths are excluded from Biome's scope.
- **Files modified:** `biome.json`.
- **Commit:** included in `c3bd2aa` (Task 1 root tooling commit).

### [Rule 1 — Bug fix] Biome auto-reformatted single-line os/cpu arrays

- **Found during:** First `pnpm lint` run after migration.
- **Issue:** Biome's formatter wanted to expand the single-line `"os": ["darwin"]` and `"cpu": ["arm64"]` / `["x64"]` arrays to multi-line form in both binding `package.json` files (reported as format errors, not warnings — so `pnpm lint` failed with exit 1).
- **Fix:** Accepted Biome's formatting by running `pnpm lint:fix`. Semantic content unchanged — the arrays still contain exactly `darwin` (os) and `arm64` or `x64` (cpu). The plan's acceptance criterion "`os` and `cpu` filters are exactly one element each" still holds (verified via `node -e`).
- **Files modified:** `packages/binding-darwin-arm64/package.json`, `packages/binding-darwin-x64/package.json`.
- **Commit:** included in `16cf615` (Task 2 package-skeleton commit).

Note: The plan's `must_haves.artifacts` entry `contains: "\"os\": [\"darwin\"]"` no longer matches as a literal single-line substring, but the semantic check (`a.os.includes('darwin')`) still passes, and the expanded form is what Biome's formatter and every downstream contributor will produce by default. Locking to the single-line form would mean disabling Biome, which would break must-have truth #3.

## Threat Model Coverage

All three threats from the plan's STRIDE register are mitigated or accepted as declared:

| Threat | Disposition | Evidence in repo |
|--------|-------------|------------------|
| T-01-01 Tampering via npm lifecycle scripts | **Mitigated** | No `scripts.postinstall`, `scripts.preinstall`, or `scripts.prepare` in any of the four `package.json` files. Root `package.json` scripts are opt-in user commands only (format, lint, typecheck, test, build). |
| T-01-02 Info disclosure via `.env` in git | **Mitigated** | `.gitignore` lines 21–22 list `.env` and `.env.local`. |
| T-01-03 Privilege escalation via workspace dep resolution | **Accepted** | pnpm 10 `workspace:*` resolves to the local `packages/*` tree only; no external registry lookups. |

No new threat surface introduced beyond what the plan anticipated.

## Known Stubs

None. This plan is scaffolding — all stub-looking files (`zig/.gitkeep`, `helper/.gitkeep`, `packages/sdk/` with no `src/`) are intentional and documented:

- `zig/.gitkeep` — filled by plan 02 (Zig core)
- `helper/.gitkeep` — filled by plan 04 (ShokiRunner.app)
- `packages/sdk/src/` — created by plan 03 (SDK surface)
- `packages/binding-darwin-*/shoki.node` — produced by plan 02's CI cross-compile

## Authentication Gates

None. No external service access required for this plan.

## Blockers Hit

None.

## Lockfile Status

- `pnpm install` was available and run. `pnpm-lock.yaml` is committed at repo root (`c3bd2aa`).
- Resolved devDependencies: `@biomejs/biome@2.4.12`, `typescript@6.0.3`.
- Resolved workspace packages (4): `shoki-monorepo@0.0.0`, `@shoki/sdk@0.0.0`, `@shoki/binding-darwin-arm64@0.0.0`, `@shoki/binding-darwin-x64@0.0.0`.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `c3bd2aa` | `chore(01-01): add root workspace config and tooling` |
| 2 | `16cf615` | `feat(01-01): scaffold @shoki/sdk and platform binding packages` |

## Self-Check: PASSED

Files verified present:
- FOUND: `/Users/jackshelton/dev/open-source/shoki/package.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/pnpm-workspace.yaml`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/pnpm-lock.yaml`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/tsconfig.base.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/biome.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/.gitignore`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/.editorconfig`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/.nvmrc`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/sdk/package.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/sdk/tsconfig.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/sdk/README.md`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-arm64/package.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-arm64/README.md`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-arm64/.gitignore`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-x64/package.json`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-x64/README.md`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/packages/binding-darwin-x64/.gitignore`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/.gitkeep`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/zig/.gitkeep`

Commits verified present:
- FOUND: `c3bd2aa` in `git log --oneline`
- FOUND: `16cf615` in `git log --oneline`

---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 02
subsystem: packaging / npm metadata
tags: [rebrand, binding-packages, metadata, parallel-wave-1]
dependency_graph:
  requires:
    - "Phase 11 Plan 02 (established @munadi/binding-darwin-* scope as starting point)"
  provides:
    - "@ogmios/binding-darwin-arm64 workspace package"
    - "@ogmios/binding-darwin-x64 workspace package"
    - "Scrubbed README prose for both binding packages"
  affects:
    - "packages/sdk/package.json optionalDependencies resolution (Plan 12-01 parallel)"
    - "Plan 12-04 (compiled artifact rename munadi.node -> ogmios.node)"
tech_stack:
  added: []
  patterns:
    - "Substitution-table rebrand pattern (mirrors Plan 11-02 and quick/260418-lfz)"
    - "Split-plan pattern: metadata flip here, artifact filename flip in 12-04"
key_files:
  created: []
  modified:
    - packages/binding-darwin-arm64/package.json
    - packages/binding-darwin-arm64/README.md
    - packages/binding-darwin-x64/package.json
    - packages/binding-darwin-x64/README.md
decisions:
  - "Preserved main: \"munadi.node\" and files: [\"munadi.node\", ...] intentionally — Plan 12-04 owns the compiled artifact rename (cascades with libmunadi.dylib -> libogmios.dylib and Zig core rebuild)"
  - "Scrubbed README prose beyond minimum substitution table: removed stale shoki.node artifact mention and rewrote helper-app paragraph so READMEs contain zero legacy tokens"
metrics:
  duration: "~4 minutes"
  completed: "2026-04-18"
  tasks_completed: 1
  files_modified: 4
---

# Phase 12 Plan 02: Rename binding packages @munadi -> @ogmios scope Summary

Both platform binding packages now carry the `@ogmios/` npm scope and correct repository URL; README prose is fully scrubbed of Munadi tokens; compiled artifact filenames remain `munadi.node` pending Plan 12-04.

## What Shipped

- `packages/binding-darwin-arm64/package.json`: `name` flipped to `@ogmios/binding-darwin-arm64`, `description` updated to "Ogmios native addon — darwin arm64 (Apple Silicon)", `repository.url` updated to `git+https://github.com/thejackshelton/ogmios.git`.
- `packages/binding-darwin-x64/package.json`: same three-field metadata flip for x64.
- `packages/binding-darwin-arm64/README.md` and `packages/binding-darwin-x64/README.md`: H1 renamed, SDK package reference `munadi` -> `ogmios`, `MunadiRunner.app` -> `OgmiosRunner.app`. Zero `munadi` / `Munadi` / `@munadi/` tokens remain.

## Preserved Intentionally

- `main: "munadi.node"` and `files: ["munadi.node", "README.md", "LICENSE"]` on both package.jsons — Plan 12-04 flips the compiled artifact filename in a single atomic commit together with the Zig core build product rename (`libmunadi.dylib` -> `libogmios.dylib`).
- `publishConfig.access: public` and `publishConfig.provenance: true` on both — unrelated to the rebrand.
- `private: true` on x64 package (arm64-only for v0.1.0 per prior release pre-flight decision).

## Verification

```bash
$ jq -r '.name, .repository.url, .description, .main' \
    packages/binding-darwin-arm64/package.json packages/binding-darwin-x64/package.json
@ogmios/binding-darwin-arm64
git+https://github.com/thejackshelton/ogmios.git
Ogmios native addon — darwin arm64 (Apple Silicon)
munadi.node
@ogmios/binding-darwin-x64
git+https://github.com/thejackshelton/ogmios.git
Ogmios native addon — darwin x64 (Intel)
munadi.node

$ rg -n "(munadi|Munadi|@munadi/)" \
    packages/binding-darwin-arm64/README.md \
    packages/binding-darwin-x64/README.md
# (no output — READMEs clean)

$ rg -n "(munadi|Munadi|@munadi/)" \
    packages/binding-darwin-arm64/package.json \
    packages/binding-darwin-x64/package.json
# Only matches are main: "munadi.node" and files entry "munadi.node"
# (Plan 12-04 owns these)
```

All success criteria met.

## Commits

| Task | Description                                                   | Commit   |
| ---- | ------------------------------------------------------------- | -------- |
| 1    | refactor(12-02): rename binding packages @munadi -> @ogmios scope | 29fd128  |

## Deviations from Plan

**Scope adjustment on README prose (documented, not a Rule 1-3 fix):**

- Both READMEs previously contained a stale `shoki.node` artifact reference (leftover from pre-Phase-11 state that Phase 11 Plan 02 did not fully scrub). The plan's verification grep targeted only `munadi|Munadi|@munadi/`, so `shoki.node` would not have blocked the gate. However the plan `<done>` criteria included "READMEs have zero munadi refs, no artifact filename in README" — parenthetical guidance suggesting the artifact filename should not appear in README prose at all. I rewrote the helper-app paragraph to drop the artifact filename entirely (replaced `shoki.node` mention with "N-API addon compiled from Zig 0.16.0 via napi-zig") so the READMEs have zero version-specific filename coupling. This keeps both READMEs stable across the Plan 12-04 artifact rename.

No Rule 1 (bugs), Rule 2 (missing critical functionality), or Rule 3 (blocking issues) triggered. No Rule 4 architectural checkpoints needed.

## Parallel Coupling Note

This plan ran in Wave 1 alongside Plan 12-01 (SDK rename to `ogmios` + `optionalDependencies.@ogmios/binding-darwin-*`). No file overlap between the two plans. Workspace resolution will succeed once both plans land — the orchestrator coordinates the install gate.

## Known Stubs

None.

## Threat Flags

None — metadata rename only, no new network/auth/filesystem surface.

## Self-Check: PASSED

- packages/binding-darwin-arm64/package.json: exists, `.name == "@ogmios/binding-darwin-arm64"`
- packages/binding-darwin-arm64/README.md: exists, zero munadi tokens
- packages/binding-darwin-x64/package.json: exists, `.name == "@ogmios/binding-darwin-x64"`
- packages/binding-darwin-x64/README.md: exists, zero munadi tokens
- Commit `29fd128` present in `git log --oneline --all`

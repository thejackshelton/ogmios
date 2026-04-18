# Phase 11: Full Rebrand Shoki/Dicta → Munadi — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** User directive — autonomous migration

<domain>
## Phase Boundary

Complete fourth-and-final name pivot of the project. Previous renames (`shoki` → `@shoki/core` → `dicta`) were incremental because they deferred helper-app bundle, scoped bindings, internal namespaces, repo URL, and prose. This phase leaves NOTHING behind — every Shoki and Dicta token becomes Munadi.

**Etymology:** "Munadi" (Arabic: مُنادي, "herald" / "one who announces/calls out"). Thematically perfect for a screen-reader announcement-capture library. Homepage tagline must mention this.

**Out of scope:** Content logic, feature work, new functionality. This is a pure mechanical rename + rebuild + republish phase.
</domain>

<decisions>
## Implementation Decisions

### Package Names (locked)
- npm SDK package: `dicta` → `munadi` (unscoped)
- npm binding packages: `@shoki/binding-darwin-arm64` → `@munadi/binding-darwin-arm64`; `@shoki/binding-darwin-x64` → `@munadi/binding-darwin-x64` (new scope `@munadi`)
- CLI bin command: `dicta` → `munadi` (users type `munadi doctor`, `npx munadi setup`)

### npm Deprecation Strategy (locked)
- After publishing `munadi@0.1.1`, run `npm deprecate dicta@0.1.0 "Renamed to munadi (Arabic: herald). Install with: npm install munadi"`
- Deprecate `@shoki/binding-darwin-arm64` with pointer to `@munadi/binding-darwin-arm64`
- Do NOT unpublish — deprecation is reversible, unpublish is not

### Helper Application (locked)
- File names: `Shoki.app` → `Munadi.app`; `Shoki Setup.app` → `Munadi Setup.app`
- Bundle identifiers: `app.shoki.setup` → `app.munadi.setup`; `com.shoki.runner` → `com.munadi.runner`
- Full rebuild: new signed `.app` bundles, new CSREQ trust anchors, new `app-v*` GitHub Release artifacts (`munadi-darwin-arm64.zip`, `munadi-darwin-x64.zip`)
- All helper Zig source gets updated strings

### On-Disk State Migration (locked — clean break)
- State directory: `~/.shoki/` and `~/.dicta/` → `~/.munadi/`
- Migration strategy: CLEAN BREAK — project is pre-alpha v0.1 with no production users who would lose work. `munadi doctor` on first run detects legacy `~/.shoki/` or `~/.dicta/` and prints a one-line notice: "Detected legacy state dir — delete it safely with: rm -rf ~/.shoki ~/.dicta". No auto-migrate code (unnecessary complexity for pre-alpha).
- Plist snapshot keys: `_shoki_snapshot_*` → `_munadi_snapshot_*`

### Environment Variables (locked)
- `SHOKI_HELPER_PATH` → `MUNADI_HELPER_PATH`
- `SHOKI_AX_TARGET_PID` → `MUNADI_AX_TARGET_PID`
- `SHOKI_INTEGRATION` → `MUNADI_INTEGRATION`
- `SHOKI_SNAPSHOT_PATH` → `MUNADI_SNAPSHOT_PATH`
- Any other `SHOKI_*` or `DICTA_*` → `MUNADI_*`

### Error Classes (locked — breaking TS API)
- Rename every exported `ShokiX` error class to `MunadiX` (e.g., `ShokiConcurrentTestError` → `MunadiConcurrentTestError`, `ShokiError`, `ShokiPlatformUnsupportedError`, etc.)
- Rename factory function `shokiVitest()` → `munadiVitest()`
- This is breaking for the TS API. Acceptable because v0.1 pre-alpha has no production consumers.

### Repository URL (locked)
- Old: `github.com/shoki/shoki` (no org existed — 404 placeholder)
- New: `github.com/thejackshelton/munadi` (personal account owner; can be transferred later if an org is created)
- Update every `git+https://github.com/shoki/shoki.git` reference in package.json, READMEs, docs
- Homepage "View on GitHub" link updates

### Homepage Etymology (locked)
- `docs/index.md` VitePress hero: keep name "Munadi", update tagline to lead with the Arabic meaning
- Example tagline: "Real screen readers in your tests. _Munadi_ — Arabic for 'herald', the one who announces."
- Add a short etymology paragraph in "What is Munadi?" section

### Parent Folder Rename (locked — LAST step)
- `/Users/jackshelton/dev/open-source/shoki` → `/Users/jackshelton/dev/open-source/munadi`
- Must happen AFTER all commits land (otherwise the running shell state breaks mid-commit)
- Command: `mv /Users/jackshelton/dev/open-source/shoki /Users/jackshelton/dev/open-source/munadi` from outside the directory
- Known consequence: terminates the running Claude Code session (the pwd no longer exists). User must `cd` into the new path and restart.

### Scope — DO NOT DEFER THIS TIME
Unlike the 260418-lfz quick task which deferred helper-app, bindings, state dir, env vars, error classes, and prose to "v0.2", this phase does EVERYTHING. Zero residuals.

### Exceptions (intentional residuals — locked)
- Historical planning artifacts: `.planning/phases/**/*-SUMMARY.md`, `.planning/phases/**/*-PLAN.md` (completed phases), `.planning/phases/**/*-CONTEXT.md`, `.planning/research/**`, `.planning/quick/260418-f0a-rename-to-shoki-core/**`, `.planning/quick/260418-lfz-rename-to-dicta/**` — these accurately describe past events and MUST stay unmodified
- Historical CHANGELOG entries describing prior renames — stay (add NEW v0.1.1 entry on top)
- Zig `build.zig.zon` dependency hash for `napi-zig` — unchanged (dep name in the zon file stays as upstream defines it)

### Claude's Discretion
- Exact wording of the Arabic etymology on the homepage (guidance: lead with meaning, keep it tasteful, connect it to the library's purpose)
- Exact CHANGELOG entry wording
- Commit message wording (follow existing convention: `refactor(11-XX): ...`, `docs(11-XX): ...`)
- Order of file modifications within a plan (planner's call)
- Whether to split by surface area (code / binaries / docs / infra) or by rename direction (Shoki→Munadi first, then Dicta→Munadi, or interleaved) — planner decides

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Prior rename artifacts (reference the approach, do not modify)
- `.planning/quick/260418-lfz-rename-to-dicta/260418-lfz-PLAN.md` — substitution table patterns, scope guards, verification grep patterns
- `.planning/quick/260418-lfz-rename-to-dicta/260418-lfz-SUMMARY.md` — list of files touched, intentional residuals (which become this phase's targets), discovery notes
- `.planning/quick/260418-f0a-rename-to-shoki-core/260418-f0a-SUMMARY.md` — earlier rename lessons

### Release runbook
- `.planning/RELEASE-v0.1.0-RUNBOOK.md` — current publish steps; this phase rewrites smoke-test commands, adds npm deprecation steps, updates all `dicta` references

### Project state
- `.planning/STATE.md` — phase progress, current position
- `.planning/ROADMAP.md` — Phase 11 entry
- `CLAUDE.md` — project instructions (also a rename target)

### Helper-app subsystem (will be heavily modified this phase)
- `helper/build-app-bundle.sh`, `helper/scripts/package-app-zip.sh` — bundle build scripts
- `.github/workflows/app-release.yml` — release pipeline, artifact names
- `helper/src/setup/Info.plist`, `helper/src/runner/Info.plist` — bundle identifiers
- `packages/sdk/src/cli/checks/helper-discovery.ts`, `helper-signature.ts`, `csreq-compare.ts`, `setup-download.ts`, `setup-install.ts`, `setup-app-path.ts`, `setup-command.ts` — all reference helper bundle ID + paths
- `helper/**/*.zig` — every Zig source file with `shoki` strings

### Zig core
- `zig/src/root.zig`, `zig/src/core/*.zig`, `zig/src/drivers/voiceover/*.zig`, `helper/src/**/*.zig` — all have shoki references

### Infra
- `infra/tart/packer/*.pkr.hcl`, `infra/tart/ansible/*.yml`, `infra/tart/scripts/*.sh`, `infra/tart/README.md`

</canonical_refs>

<specifics>
## Specific Targets

### Code surface (packages/sdk)
- `packages/sdk/package.json` — name, bin, optionalDependencies scope, repository.url, description
- `packages/sdk/src/**/*.ts` — all imports, error class names, factory function name
- `packages/sdk/src/cli/**` — commander `.name('munadi')`, help text, reporter prefixes
- `packages/sdk/src/cli/checks/**` — helper bundle ID strings (`app.shoki.setup` → `app.munadi.setup`)
- `packages/sdk/src/cli/setup-*.ts` — app paths, artifact URLs, env vars
- `packages/sdk/src/vitest/plugin.ts` — IMPORT_NEEDLE → `munadi/vitest/browser`; plugin name
- `packages/sdk/test/**/*.ts` — assertions, fixtures, error class references

### Code surface (packages/binding-darwin-*)
- `packages/binding-darwin-arm64/package.json` — name to `@munadi/binding-darwin-arm64`, repository URL, prose
- `packages/binding-darwin-x64/package.json` — same, for x64
- `packages/binding-darwin-*/README.md` — all references

### Code surface (examples)
- `examples/vitest-browser-qwik/package.json` — dep from `dicta` → `munadi`, repo URL
- `examples/vitest-browser-qwik/**/*.ts`, `*.tsx`, `*.d.ts` — imports and ambient module names (file `shoki-matchers.d.ts` → `munadi-matchers.d.ts` rename)
- `examples/vitest-browser-qwik/README.md`, `vitest.config.ts`

### Binaries / helper app
- `helper/src/setup/Info.plist` — CFBundleIdentifier `app.shoki.setup` → `app.munadi.setup`; CFBundleName, CFBundleDisplayName
- `helper/src/runner/Info.plist` — similarly (`com.shoki.runner` → `com.munadi.runner`)
- `helper/build-app-bundle.sh` — output .app filename, signing identity references
- `helper/scripts/package-app-zip.sh` — staged dir paths, zip filename (`shoki-darwin-*.zip` → `munadi-darwin-*.zip`)
- `helper/src/**/*.zig` — every string literal
- `helper/src/setup/appkit_bindings.zig`, `helper/src/setup/setup_main.zig`, `helper/src/runner/ax_bindings.zig`, `helper/src/runner/xpc_bindings.zig`, `helper/src/client/xpc_client.zig`

### Zig core
- `zig/src/root.zig` — module header comment, any string literals
- `zig/src/core/sync.zig`, `napi.zig`, `registry.zig`, `driver.zig` — all strings
- `zig/src/drivers/voiceover/lifecycle.zig` — strings
- `build.zig`, `build.zig.zon` — dep name for the project itself (not napi-zig upstream)

### Infra
- `infra/tart/packer/sonoma.pkr.hcl`, `tahoe.pkr.hcl`, `sequoia.pkr.hcl` — image labels, tags
- `infra/tart/ansible/playbook.yml`, `vars.yml` — all shoki vars
- `infra/tart/scripts/tcc-grant.sh` — bundle ID grants (app.shoki.setup → app.munadi.setup)
- `infra/tart/README.md` — full sweep

### GitHub Actions workflows
- `.github/workflows/app-release.yml` — artifact names, tag patterns, references to helper app
- Any other workflow referencing shoki/dicta

### Documentation
- `README.md` — H1, hero, install/import/CLI snippets, architecture diagram, 3-package list
- `CHANGELOG.md` — new v0.1.1 entry explaining rename + deprecation; historical entries stay
- `CLAUDE.md` — project H2, description, all references
- `docs/index.md` — VitePress hero with Arabic etymology tagline
- `docs/**/*.md` — sweep all prose, install commands, imports, CLI invocations, error class names
- `packages/sdk/README.md`, `packages/binding-darwin-*/README.md`, `examples/vitest-browser-qwik/README.md`
- `CONTRIBUTING.md`, `LICENSE` (ensure the project name reference updates if any)
- `.planning/RELEASE-v0.1.0-RUNBOOK.md` — retitle, update all commands

### Release pipeline
- GitHub repo rename via GitHub API (`gh api repos/shoki/shoki --method PATCH -f name=munadi`) or GitHub UI — needs new URL `github.com/thejackshelton/munadi`
- New tag scheme: continue v0.1.x semver; first munadi release is v0.1.1
- `npm publish` for `munadi`, `@munadi/binding-darwin-arm64`, `@munadi/binding-darwin-x64`
- `npm deprecate dicta@* "Renamed to munadi..."`, same for `@shoki/binding-*`

### Parent folder rename (LAST)
- `/Users/jackshelton/dev/open-source/shoki` → `/Users/jackshelton/dev/open-source/munadi`
- Must be executed from OUTSIDE the directory (from `/Users/jackshelton/dev/open-source/`)
- This terminates the running Claude Code session

</specifics>

<deferred>
## Deferred Ideas

None — this phase intentionally leaves nothing behind. See Exceptions under decisions for intentional historical residuals.

</deferred>

---

*Phase: 11-full-rebrand-shoki-dicta-to-munadi*
*Context gathered: 2026-04-18 via autonomous directive*

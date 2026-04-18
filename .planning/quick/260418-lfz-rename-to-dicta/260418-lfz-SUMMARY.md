---
quick_id: 260418-lfz
type: execute
completed_at: 2026-04-18
commits:
  - 53fb2fe  # Task 1: code rename
  - c162962  # Task 2: docs sweep
tags:
  - rename
  - npm
  - publishing
  - cli
  - docs
files_touched:
  code: 29
  docs: 24
  total: 53
---

# Quick Task 260418-lfz: Rename npm package `@shoki/core` -> `dicta`

**One-liner:** Third name pivot for v0.1.0 GA — from `@shoki/core` (scoped, blocked by `@shoki` org-creation denial) to `dicta` (unscoped, Latin "things said"). CLI bin command also renamed `shoki` -> `dicta`. Helper-app file names and `@shoki/binding-darwin-*` scoped bindings intentionally retain "Shoki" branding for v0.1 — full helper rebrand follows in v0.2.

## Result

- `packages/sdk/package.json` `"name"` is `"dicta"` (was `"@shoki/core"`)
- `packages/sdk/package.json` `"bin"` key is `dicta -> dist/cli/main.js` (was `shoki`)
- Dry-run publish from `packages/sdk/` emits `name: dicta` with no E403 (see below)
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all exit 0
- Every TS import of the SDK uses `dicta` / `dicta/matchers` / `dicta/cli` / `dicta/vitest` / `dicta/vitest/browser` / `dicta/vitest/setup` (zero matches for `@shoki/core` imports)
- Every user-facing doc tells users to run `npm install dicta` and `npx dicta setup`
- Plugin auto-detection needle updated to `dicta/vitest/browser` so consumer imports still trigger `singleThread=true`
- Plugin `name` is `'dicta/vitest'`, warning prefix is `[dicta/vitest]`
- CLI commander `.name('dicta')`, quiet-reporter prefix `dicta-doctor`, `info` subcommand prints `dicta v<ver>`
- Helper-app guard (`helper-discovery.ts`, `helper-signature.ts`, `csreq-compare.ts`, `setup-download.ts`, `setup-install.ts`, `setup-app-path.ts`, `setup-command.ts`, `helper/`, `app-release.yml`) remained untouched (empty diff) — signed bundles + CSREQ trust anchors safe for separate v0.2 work

## Files touched

**Code (29 files, commit `53fb2fe`):**

- `packages/sdk/package.json` — `"name": "@shoki/core"` -> `"name": "dicta"`; `"bin": { "shoki": ... }` -> `"bin": { "dicta": ... }`
- `packages/sdk/src/vitest/plugin.ts` — `IMPORT_NEEDLE = 'dicta/vitest/browser'`; plugin `name: 'dicta/vitest'`; warning prefix `[dicta/vitest]`; doc comments
- `packages/sdk/src/vitest/setup.ts` — doc comment import-string fix
- `packages/sdk/src/vitest/errors.ts` — `ShokiPlatformUnsupportedError` + `ShokiBindingNotAvailableError` messages (`npx shoki doctor` -> `npx dicta doctor`); class-docstring references to `@shoki/core`
- `packages/sdk/src/vitest/command-types.ts` — doc comment header
- `packages/sdk/src/matchers/index.ts` — doc comment import strings
- `packages/sdk/src/binding-loader.ts` — ABI-drift error message token
- `packages/sdk/src/wire.ts` — wire-version mismatch error message
- `packages/sdk/src/voice-over.ts` — SessionStore refcount comment
- `packages/sdk/src/cli/main.ts` — commander `.name('dicta')`, program description, `info` subcommand prints `dicta v<ver>`, `restore-vo-settings` description + error messages
- `packages/sdk/src/cli/errors.ts` — header comment `@shoki/core/cli` -> `dicta/cli`; `UnsupportedMacOSError`, `HelperNotFoundError`, `NonDarwinHostError` message strings (shoki -> dicta)
- `packages/sdk/src/cli/fix-executor.ts` — doctor re-check comment
- `packages/sdk/src/cli/restore-vo-settings.ts` — header docstring
- `packages/sdk/src/cli/report-types.ts` — `mode` docstring
- `packages/sdk/src/cli/run-doctor.ts` — OS-unsupported summary string
- `packages/sdk/src/cli/checks/vo-plist.ts` — fix-hint detail string
- `packages/sdk/src/cli/checks/macos-version.ts` — unsupported-major detail string
- `packages/sdk/src/cli/reporters/quiet.ts` — `shoki-doctor` -> `dicta-doctor` prefix
- `packages/sdk/test/vitest/plugin.test.ts` — plugin-name assertion `dicta/vitest`
- `packages/sdk/test/vitest/singleton-detection.test.ts` — detector + warning-prefix assertions
- `packages/sdk/test/vitest/fixtures/has-import/test.ts` + `opt-out/test.ts` — fixture imports use `dicta/vitest/browser`
- `packages/sdk/test/cli/integration/cli-smoke.test.ts` — `/shoki v/` -> `/dicta v/`, `/^shoki-doctor/` -> `/^dicta-doctor/`
- `examples/vitest-browser-qwik/package.json` — dep `"dicta": "workspace:*"` (was `"@shoki/core"`)
- `examples/vitest-browser-qwik/vitest.config.ts` — `from 'dicta/vitest'`
- `examples/vitest-browser-qwik/src/vitest.setup.ts` — `import 'dicta/vitest/setup'` + header comment
- `examples/vitest-browser-qwik/tests/app.test.tsx` + `dom-vs-chrome-url.test.tsx` — `from 'dicta/vitest/browser'`
- `pnpm-lock.yaml` — regenerated against the unscoped name

**Docs (24 files, commit `c162962`):**

- `README.md` — H1 "Shoki" -> "Dicta", tagline, helper-app v0.1 callout, install/import/CLI snippets, architecture diagram SDK label, "3 npm packages" list
- `CHANGELOG.md` — v0.1.0 lead-in rewritten to explain the third pivot + v0.1 helper-app deferral; migration table extended with `dicta` step and CLI rename (`npx shoki ...` -> `npx dicta ...`); historical entries (Phase 10 Plan 01, Phase 8 Plan 05, 260418-f0a) preserved verbatim
- `CLAUDE.md` — project H2 suffixed with `(npm: dicta, CLI: dicta; helper retains "Shoki" for v0.1)`; "npm package name" row updated; quickstart import + CLI examples + `dicta doctor` invocation
- `.planning/RELEASE-v0.1.0-RUNBOOK.md` — top-of-file callout rewritten for the third pivot; **REMOVED** the old "Step 2: Claim the @shoki npm scope" (dicta is unscoped, no org-creation needed); all smoke-test commands updated (`npm view dicta@0.1.0`, `npm install dicta`, `npx dicta setup`); steps renumbered (2-6)
- `docs/index.md` — VitePress hero name "Shoki" -> "Dicta" + alt-text; quick-install uses `dicta`; helper-app v0.1 callout
- `docs/getting-started/install.md` — install/import/CLI snippets; migration callout expanded to document all three name changes (shoki -> @shoki/core -> dicta); "Why one package?" paragraph updated; helper-app v0.1 note
- `docs/getting-started/vitest-quickstart.md` — install commands, config imports, setup file, needle reference, CLI bin reference, troubleshooting
- `docs/getting-started/permission-setup.md` — every `shoki doctor|setup|restore-vo-settings` CLI invocation updated to `dicta ...` (global replace_all)
- `docs/getting-started/ci-quickstart.md` — setup-action description updated
- `docs/api/sdk.md` — H1 `@shoki/core` -> `dicta`; entry-points table; import examples; keyboard-catalog import; errors section; "see also" links
- `docs/api/cli.md` — H1 `shoki CLI` -> `dicta CLI`; bin description; every subcommand reference (doctor/setup/info/restore-vo-settings) + docs examples; human + JSON output examples; troubleshooting
- `docs/api/vitest.md` — H1 + all subpath references + see-also
- `docs/api/matchers.md` — H1 + setup-files path + matcher-package path + "see also" + "live-reference" callout + type-augmentation docstring
- `docs/guides/matchers.md` — setup snippet + code examples + chrome-noise callout + "working against raw logs" direct-call example
- `docs/guides/migration-from-guidepup.md` — table header column rename "Shoki" -> "Dicta"; import in example; API map header; "Switch to Shoki if" / "Limits to be honest about" prose
- `docs/guides/troubleshooting.md` — every `dicta doctor|setup|info` CLI invocation; `ShokiConcurrentTestError` cause description (references `dicta/vitest/browser`); prose mentions updated (class names stay)
- `docs/guides/ci/gh-hosted.md` + `docs/guides/ci/getmac.md` — CLI invocation references (`shoki doctor` -> `dicta doctor`)
- `docs/background/architecture.md` — SDK-layer label + matcher subpath; helper-app v0.1 note in three-layer model; "build dicta from source" in wrapper-app rationale; platform-risk lead-in; "Things NOT in this architecture" prose
- `docs/background/release-setup.md` — § 1 `.node` binding sentence (Dicta); § 2 OIDC per-package list (`dicta` line); § 3 verify-release smoke commands; § 5 unpublish commands; § 6 tart-image prose; § 7 app-release cross-reference in runbook text; `compatibleAppVersion` coupling prose
- `packages/sdk/README.md` — H1 `# @shoki/core` -> `# dicta`; install/import/CLI snippets
- `packages/binding-darwin-arm64/README.md` + `packages/binding-darwin-x64/README.md` — "installed automatically by `@shoki/core`" -> "installed automatically by `dicta`" (bindings keep their own `@shoki/binding-darwin-*` package names)
- `examples/vitest-browser-qwik/README.md` — setup-file import path + `npx dicta doctor` invocations

## Verification

### Automated checks (from plan)

```
$ jq -r '.name' packages/sdk/package.json
dicta

$ jq -r '.bin.dicta' packages/sdk/package.json
dist/cli/main.js

$ jq -e '.bin | has("shoki") | not' packages/sdk/package.json
true
```

- `grep -rnE "from ['\"]@shoki/core(/[^'\"]+)?['\"]" packages/ examples/ --include='*.ts' --include='*.tsx' --include='*.d.ts'` returns **ZERO matches**
- `grep -rnE "(npm|pnpm|yarn)\s+(install|add|view)\s+@shoki/core"` across tracked user-facing docs returns **ZERO matches**
- `grep -rnE "(npx\s+)?shoki\s+(doctor|setup|info|restore-vo-settings)"` across tracked user-facing docs returns **ZERO matches** (the matches in `docs/.vitepress/dist/` are gitignored compiled HTML that will rebuild on next `pnpm docs:build`; CHANGELOG retains `npx shoki ...` in the migration table *as old-value examples*)

### Helper-app guard

```
$ git diff --name-only HEAD -- \
    packages/sdk/src/cli/checks/helper-discovery.ts \
    packages/sdk/src/cli/checks/helper-signature.ts \
    packages/sdk/src/cli/checks/csreq-compare.ts \
    packages/sdk/src/cli/setup-download.ts \
    packages/sdk/src/cli/setup-install.ts \
    packages/sdk/src/cli/setup-app-path.ts \
    packages/sdk/src/cli/setup-command.ts \
    helper/ \
    .github/workflows/app-release.yml

# (empty output — guard passes)
```

### Planning artifacts guard

```
$ git diff --name-only HEAD~2 -- \
    .planning/phases/ \
    .planning/research/ \
    .planning/quick/260418-f0a-rename-to-shoki-core/

# (empty output — guard passes)
```

### Build / typecheck / test

```
$ pnpm install --no-frozen-lockfile
Done in 537ms

$ pnpm --filter dicta build
Done (tsc exits 0)

$ pnpm -r typecheck
packages/sdk typecheck: Done
examples/vitest-browser-qwik typecheck: Done

$ pnpm -r test
packages/sdk test:  Test Files  35 passed | 6 skipped (41)
packages/sdk test:       Tests  242 passed | 13 skipped (255)
examples/vitest-browser-qwik test:  Test Files  2 passed | 1 skipped (3)
examples/vitest-browser-qwik test:       Tests  3 passed | 3 skipped (6)

All green.
```

### Dry-run publish

```
$ cd packages/sdk && npm publish --dry-run --access public
npm notice name: dicta
npm notice version: 0.1.0
npm notice filename: dicta-0.1.0.tgz
npm notice package size: 82.1 kB
npm notice unpacked size: 310.7 kB
npm notice total files: 177
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
+ dicta@0.1.0
```

No E403 anti-typosquatting block — `dicta` is unrelated to any existing npm package, so the previous rename saga (E403 vs `shiki` for unscoped `shoki`, then `@shoki` org denial) is fully unblocked.

## Intentional residuals

These tokens were deliberately left in place (per plan constraints):

- **Helper app file names** (`Shoki.app`, `Shoki Setup.app`, `ShokiRunner.app`, `ShokiSetup.app`) — v0.2 rebrand with signed-bundle regen + CSREQ refresh
- **Helper bundle identifier** (`app.shoki.setup`, `com.shoki.runner`) — helper code-signing identity, tied to signed binaries
- **`@shoki/binding-darwin-*`** scoped binding package names — napi platform-package pattern; regen deferred with helper rebrand
- **Internal identifiers**: `~/.shoki/` state dir, `SHOKI_*` env vars (including `SHOKI_HELPER_PATH`, `SHOKI_AX_TARGET_PID`, `SHOKI_INTEGRATION`, `SHOKI_SNAPSHOT_PATH`), `_shoki_snapshot_*` plist keys, `shoki-darwin-<arch>.zip` GitHub Release artifact names — on-disk state + ABI + signed-binary tied
- **Repo URL** (`github.com/shoki/shoki`) — separate concern; GitHub org TBD
- **Project-name prose** ("Shoki" in mid-doc paragraphs, e.g., "the Shoki helper app", "Shoki's wire format", "Shoki is built on Zig...") — these remain consistent with the helper bundle's "Shoki" naming for v0.1 and will be swept in v0.2 when the helper rebrand lands
- **Helper-app-discovery CLI source** (`helper-discovery.ts`, `helper-signature.ts`, `csreq-compare.ts`, `setup-download.ts`, `setup-install.ts`, `setup-app-path.ts`, `setup-command.ts`, `helper/**`, `.github/workflows/app-release.yml`) — hard-guarded by plan (references the deferred helper bundle ID and paths)
- **Error class names** (`ShokiError`, `ShokiConcurrentTestError`, `ShokiPlatformUnsupportedError`, `ShokiSessionNotFoundError`, `ShokiBindingNotAvailableError`, `ShokiTimeoutError`, `ShokiCapturePathFailedError`, `ShokiVoiceOverUnavailableError`, `ShokiPlatformUnsupportedError`, `VoiceOverUnsupportedPlatformError`) — renaming TS exports is breaking; deferred to v0.2 prose pass
- **`compatibleAppVersion`** field in `packages/sdk/package.json` — app-version contract, orthogonal to the package name
- **Historical CHANGELOG entries** describing past renames (Phase 10 Plan 01 `@shoki/sdk` -> `shoki`, Phase 8 Plan 05 package consolidation, quick task 260418-f0a `shoki` -> `@shoki/core`) — accurate record of past events
- **Commander `shokiVitest()` factory function name** — TS export name; rename would be breaking at the TS API level (separate from package-name rename)
- **Shoki brand in CLAUDE.md "Project" section** — the `# Project` header still reads "**Shoki**" (augmented with `(npm: dicta, CLI: dicta; helper retains "Shoki" branding for v0.1)`) so the brand-name prose stays consistent with the help-app and internal namespaces for v0.1

## Unexpected discoveries / tweaks vs plan

1. **`cli-smoke.test.ts` fail after Task 1 STEP J** — the `info` subcommand test asserted `/shoki v/` and the `--quiet` test asserted `/^shoki-doctor/`. Both are coupled to CLI user-facing strings, so once `main.ts` and `reporters/quiet.ts` emitted `dicta v<ver>` and `dicta-doctor`, the test needed updating alongside production (Rule 1 bug: the CLI emitted the correctly-renamed strings; the tests were out of sync). Fixed in the Task 1 commit.
2. **`packages/sdk/src/cli/reporters/quiet.ts` was not in the plan's explicit file list** — but it emits a user-visible `shoki-doctor` prefix, which falls under the plan's STEP D CLI-invocation rename ("internal CLI source that hard-codes the program name"). Updated to `dicta-doctor`.
3. **`docs/getting-started/permission-setup.md`, `docs/getting-started/ci-quickstart.md`, `docs/guides/ci/gh-hosted.md`, `docs/guides/ci/getmac.md` were not in the plan's explicit file list** — but they contain user-facing CLI invocations (`shoki doctor`, `shoki setup`, `shoki restore-vo-settings`). The plan's verify step requires ZERO matches for those CLI invocations across user-facing docs, so these files were swept per Rule 2 (auto-add missing critical functionality: docs would contradict the bin-rename claim otherwise).
4. **`docs/.vitepress/dist/` regex matches** — fully gitignored compiled HTML from a prior VitePress build; regenerated on next `pnpm docs:build`. Not committed, not touched.
5. **CLI source that was intentionally NOT touched:** `setup-command.ts`, `setup-app-path.ts`, `setup-download.ts`, `setup-install.ts`, `checks/helper-*.ts`. These are in the plan's hard-guard list (they reference the deferred helper bundle ID + paths). Confirmed untouched via the guard grep.
6. **`pnpm-lock.yaml` had a pre-existing 1-line modification** (`bin` path from `./dist/cli/main.js` → `dist/cli/main.js`) when the executor started. This was included in the `package.json` staging along with the `dicta` rename — it's consistent with the final bin-path form.

## Constraints honored

- [x] CLAUDE.md directive: all work went through the GSD workflow (spawned from `/gsd-quick execute`)
- [x] `.planning/phases/**` untouched — `git diff HEAD~2 -- .planning/phases/` is empty
- [x] `.planning/research/**` untouched
- [x] `.planning/quick/260418-f0a-rename-to-shoki-core/**` (prior rename's record) untouched
- [x] Helper-app deferred file list — empty in `git diff --name-only HEAD --`
- [x] Repo URL `git+https://github.com/shoki/shoki.git` preserved
- [x] `compatibleAppVersion` field preserved
- [x] `@shoki/binding-darwin-*` scoped binding names preserved
- [x] Helper app file names preserved (`Shoki.app`, `Shoki Setup.app`)
- [x] Internal namespaces preserved (`~/.shoki/`, `SHOKI_*`, `_shoki_snapshot_*`, `com.shoki.runner`, `app.shoki.setup`, `shoki-darwin-*.zip`)
- [x] Historical CHANGELOG entries preserved

## Self-Check: PASSED

**Files created/touched exist:**
- packages/sdk/package.json — FOUND (name=dicta, bin.dicta=dist/cli/main.js)
- examples/vitest-browser-qwik/package.json — FOUND (dep=dicta workspace:*)
- packages/sdk/src/vitest/plugin.ts — FOUND (needle=dicta/vitest/browser)
- packages/sdk/src/cli/main.ts — FOUND (commander .name('dicta'))
- packages/sdk/src/cli/reporters/quiet.ts — FOUND (prefix=dicta-doctor)
- README.md / CHANGELOG.md / docs/** / CLAUDE.md / RELEASE-v0.1.0-RUNBOOK.md — FOUND (Dicta H1s)

**Commits exist:**
- 53fb2fe — FOUND (`refactor(260418-lfz): rename npm package @shoki/core -> dicta in code`)
- c162962 — FOUND (`docs(260418-lfz): sweep user-facing docs for @shoki/core -> dicta`)

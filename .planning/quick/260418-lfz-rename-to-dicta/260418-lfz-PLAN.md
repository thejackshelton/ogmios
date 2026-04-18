---
quick_id: 260418-lfz
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/sdk/package.json
  - packages/sdk/src/**/*.ts
  - packages/sdk/test/**/*.ts
  - packages/binding-darwin-arm64/package.json
  - packages/binding-darwin-arm64/README.md
  - packages/binding-darwin-x64/package.json
  - packages/binding-darwin-x64/README.md
  - packages/sdk/README.md
  - examples/vitest-browser-qwik/package.json
  - examples/vitest-browser-qwik/src/**/*.ts
  - examples/vitest-browser-qwik/src/**/*.tsx
  - examples/vitest-browser-qwik/src/**/*.d.ts
  - examples/vitest-browser-qwik/tests/**/*.ts
  - examples/vitest-browser-qwik/tests/**/*.tsx
  - examples/vitest-browser-qwik/vitest.config.ts
  - examples/vitest-browser-qwik/README.md
  - README.md
  - CHANGELOG.md
  - docs/index.md
  - docs/getting-started/install.md
  - docs/getting-started/vitest-quickstart.md
  - docs/api/sdk.md
  - docs/api/cli.md
  - docs/api/vitest.md
  - docs/api/matchers.md
  - docs/guides/matchers.md
  - docs/guides/migration-from-guidepup.md
  - docs/guides/troubleshooting.md
  - docs/background/architecture.md
  - docs/background/release-setup.md
  - .planning/RELEASE-v0.1.0-RUNBOOK.md
  - CLAUDE.md
  - pnpm-lock.yaml
autonomous: true
requirements: []

must_haves:
  truths:
    - "The npm package name is `dicta` (unscoped). No `\"name\": \"@shoki/core\"` appears in any package.json."
    - "The CLI bin command is `dicta`. Users type `npx dicta setup`, `dicta doctor` — `bin.shoki` no longer exists; `bin.dicta` is the only entry."
    - "`npm publish --dry-run --access public` from `packages/sdk/` reports `name: dicta` and produces a clean tarball, no E403 (the `@shoki` org issue and `shoki` similarity issue both vanish since `dicta` is unrelated to `shiki`)."
    - "Every TS import of the SDK uses `dicta` (or `dicta/matchers`, `dicta/cli`, `dicta/vitest`, `dicta/vitest/browser`, `dicta/vitest/setup`). No `from '@shoki/core'` or `from '@shoki/core/...'` imports remain in `packages/` or `examples/`."
    - "Plugin auto-detection needle in `packages/sdk/src/vitest/plugin.ts` is `dicta/vitest/browser` so consumer imports still trigger `singleThread=true` — the most common silent-break risk."
    - "`pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test` all exit 0."
    - "User-facing docs (README, CHANGELOG, docs/**, runbook) instruct users to install `dicta` and import `from 'dicta'`. README and CHANGELOG titles/taglines say 'Dicta', not 'Shoki'."
    - "The helper-app rebrand is explicitly deferred: `Shoki.app`, `Shoki Setup.app`, `app.shoki.setup` bundle ID, and all files referencing them stay untouched (will follow in v0.2 with signed-bundle regen + CSREQ refresh). CHANGELOG documents this temporary v0.1 inconsistency."
  artifacts:
    - path: "packages/sdk/package.json"
      provides: "Unscoped, distinctive npm name + bin command"
      contains: '"name": "dicta"'
    - path: "examples/vitest-browser-qwik/package.json"
      provides: "Example dependency on `dicta` (not `@shoki/core`)"
      contains: '"dicta": "workspace:*"'
    - path: "packages/sdk/src/vitest/plugin.ts"
      provides: "Auto-singleThread needle for the new package name"
      contains: "dicta/vitest/browser"
    - path: "CHANGELOG.md"
      provides: "Public explanation of the third name pivot + v0.2 helper-app deferral note"
      contains: "dicta"
  key_links:
    - from: "examples/vitest-browser-qwik/vitest.config.ts"
      to: "dicta/vitest"
      via: "import { ... } from 'dicta/vitest'"
      pattern: "from ['\"]dicta/vitest['\"]"
    - from: "packages/sdk/src/vitest/plugin.ts"
      to: "consumer test files importing dicta/vitest/browser"
      via: "hard-coded IMPORT_NEEDLE string"
      pattern: "dicta/vitest/browser"
    - from: "docs/getting-started/install.md"
      to: "dicta on npm"
      via: "npm install dicta"
      pattern: "npm install dicta"
---

<objective>
Mechanical rename of the published npm package and CLI bin: `@shoki/core` → `dicta` (npm package), `shoki` → `dicta` (CLI bin command). This is the **third** name pivot — the unscoped `shoki` name was blocked by npm's E403 anti-typosquatting filter against `shiki`, and the `@shoki` org creation was subsequently denied (likely the same anti-typosquatting policy). `dicta` (Latin: "things said") is unscoped, distinctive, and semantically perfect for a screen-reader announcement-capture library.

**Critical distinctions for THIS rename:**
- NPM **package name** changes: `@shoki/core` → `dicta` (was `shoki` → `@shoki/core` in 260418-f0a)
- CLI **bin name** ALSO changes this time: `shoki` → `dicta` (users now type `dicta doctor`, `dicta setup`, `npx dicta setup`)
- Project **name** in titles/taglines/H1 rebrands: "Shoki" → "Dicta" in README header, CHANGELOG title, install.md "What is X" sections (NOT every incidental mention — that's a v0.2 deep-prose pass)
- Plugin needle in `packages/sdk/src/vitest/plugin.ts` MUST update to `dicta/vitest/browser` — silent break for consumers if missed
- All TS imports across repo: `from '@shoki/core'` (and subpaths) → `from 'dicta'` (and subpaths)

**Critical distinctions — DO NOT TOUCH (v0.2 deferral):**
- Helper app file names: `Shoki.app`, `Shoki Setup.app` STAY (regenerating signed bundles + CSREQ checks is its own task)
- Helper app bundle identifier: `app.shoki.setup` STAYS
- The following files MUST NOT be modified by this rename — they reference the helper bundle ID and helper app paths:
  - `packages/sdk/src/cli/checks/helper-discovery.ts`
  - `packages/sdk/src/cli/checks/helper-signature.ts`
  - `packages/sdk/src/cli/checks/csreq-compare.ts`
  - `packages/sdk/src/cli/setup-download.ts`
  - `packages/sdk/src/cli/setup-install.ts`
  - `packages/sdk/src/cli/setup-app-path.ts`
  - `packages/sdk/src/cli/setup-command.ts`
  - `helper/scripts/package-app-zip.sh`
  - `helper/build-app-bundle.sh`
  - `helper/**` (any helper Zig source)
  - `.github/workflows/app-release.yml`
  - Test fixtures referencing the helper bundle identifier
- Repo URL `git+https://github.com/shoki/shoki.git` STAYS (separate concern; GitHub org TBD)
- `compatibleAppVersion` field STAYS (helper-app version contract, orthogonal)
- Internal namespaces NOT in user-facing surface — `~/.shoki/` state dir, `SHOKI_*` env vars, `_shoki_snapshot_*` plist keys, `shoki-darwin-<arch>.zip` release artifacts, `com.shoki.runner` bundle ID — STAY (these are internal identifiers; rebranding them touches signed binaries and on-disk state migration)
- `.planning/phases/**` and `.planning/research/**` historical artifacts — STAY

**Acceptable v0.1 inconsistency:** A user installs `dicta`, types `npx dicta setup`, then a "Shoki Setup.app" briefly launches. Document this in CHANGELOG: "v0.1 ships with the helper app retaining its 'Shoki' file names — full helper rebrand follows in v0.2."

Purpose: Ship v0.1.0 to npm under the `dicta` name without further npm naming saga.

Output: A clean green build with `dicta` as the npm name and CLI bin command, plus user-facing docs rebranded to "Dicta" in titles/taglines, ready for `npm publish --access public`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260418-f0a-rename-to-shoki-core/260418-f0a-SUMMARY.md

<interfaces>
<!-- Substitution table. ALL of these substitutions apply across packages/, examples/, docs/, CHANGELOG, README, RELEASE runbook, and CLAUDE.md. -->

| Old                                                | New                                          |
|----------------------------------------------------|----------------------------------------------|
| `"name": "@shoki/core"` (in package.json)          | `"name": "dicta"`                            |
| `"bin": { "shoki": "..." }`                        | `"bin": { "dicta": "..." }`                  |
| `"@shoki/core": "workspace:*"` (dep/devDep)        | `"dicta": "workspace:*"`                     |
| `"@shoki/core": "0.1.0"` (or any version)          | `"dicta": "0.1.0"` (same semver)             |
| `from '@shoki/core'`                               | `from 'dicta'`                               |
| `from '@shoki/core/matchers'`                      | `from 'dicta/matchers'`                      |
| `from '@shoki/core/cli'`                           | `from 'dicta/cli'`                           |
| `from '@shoki/core/vitest'`                        | `from 'dicta/vitest'`                        |
| `from '@shoki/core/vitest/browser'`                | `from 'dicta/vitest/browser'`                |
| `import '@shoki/core/vitest/setup'`                | `import 'dicta/vitest/setup'`                |
| Plugin needle string `'@shoki/core/vitest/browser'`| `'dicta/vitest/browser'`                     |
| Plugin name `'@shoki/core/vitest'`                 | `'dicta/vitest'`                             |
| Warning prefix `[@shoki/core/vitest]`              | `[dicta/vitest]`                             |
| `npm install @shoki/core` (prose)                  | `npm install dicta`                          |
| `pnpm add @shoki/core` (prose)                     | `pnpm add dicta`                             |
| `npm view @shoki/core@0.1.0` (CLI command)         | `npm view dicta@0.1.0`                       |
| `pnpm --filter @shoki/core ...` (CI, scripts)      | `pnpm --filter dicta ...`                    |
| CLI invocation prose `shoki doctor`                | `dicta doctor`                               |
| CLI invocation prose `shoki setup`                 | `dicta setup`                                |
| CLI invocation prose `npx shoki setup`             | `npx dicta setup`                            |
| CLI invocation prose `shoki info`, `shoki restore-vo-settings` | `dicta info`, `dicta restore-vo-settings` |
| README/CHANGELOG/install.md TITLE "Shoki"          | "Dicta" (titles, H1 headers, hero taglines, "what is X" sections only) |

<!-- What DOES NOT change in this rename (leave these alone). -->

| Keep as-is                                                            | Why                                                  |
|-----------------------------------------------------------------------|------------------------------------------------------|
| `Shoki.app`, `Shoki Setup.app` (file names)                           | Helper app rebrand deferred to v0.2 (signed-bundle regen) |
| `app.shoki.setup` bundle identifier                                   | Same — helper code-signing identity                  |
| `packages/sdk/src/cli/checks/helper-*.ts` files                       | Reference the helper bundle ID — DO NOT TOUCH        |
| `packages/sdk/src/cli/setup-download.ts`, `setup-install.ts`, `setup-app-path.ts`, `setup-command.ts` | Reference helper app paths — DO NOT TOUCH |
| `helper/**`, `.github/workflows/app-release.yml`                      | Helper subsystem — DO NOT TOUCH                      |
| `~/.shoki/` state dir, `SHOKI_*` env vars                             | On-disk state + ABI; renaming requires migration     |
| `_shoki_snapshot_*` plist keys, `com.shoki.runner` bundle ID          | Internal identifiers, signed-binary tied             |
| `shoki-darwin-<arch>.zip` GitHub Release artifact names               | App-release pipeline (deferred with helper rebrand)  |
| `github.com/shoki/shoki` (repo URL)                                   | Separate concern; GitHub org TBD                     |
| `"compatibleAppVersion": "0.1.0"`                                     | Unrelated helper-app version contract                |
| `@shoki/binding-darwin-arm64` / `-x64` package names                  | Already scoped; rebranding bindings is bigger scope  |
| `optionalDependencies: { "@shoki/binding-darwin-arm64": "workspace:*" }` | Same — bindings keep their `@shoki` scope for v0.1 |
| Project name "Shoki" in incidental prose (e.g., "the Shoki helper app", "Shoki is built on Zig...") | v0.2 deep-prose sweep; touch only titles/taglines |
| `.planning/phases/**`, `.planning/research/**`                        | Historical record                                    |

<!-- Plugin needle callout — silent-break risk. -->

`packages/sdk/src/vitest/plugin.ts` scans consumer test files for the import string
`@shoki/core/vitest/browser` to auto-enable `singleThread`. After this rename, consumer files
import `dicta/vitest/browser` — the needle MUST change or auto-detection silently breaks
for consumers. The associated test fixtures under `packages/sdk/test/vitest/fixtures/`
must be updated with the same string. Plugin `name` should also update to `'dicta/vitest'`
for observability consistency (matching test assertion lives in `packages/sdk/test/vitest/plugin.test.ts`
and `packages/sdk/test/vitest/singleton-detection.test.ts`).

<!-- Bin-name callout — this is NEW vs. 260418-f0a. -->

The previous rename (260418-f0a) preserved `bin.shoki` exactly because muscle-memory
was a goal and bin name was independent of npm package name. THIS rename changes the
bin command too. After this work:

- `packages/sdk/package.json` `"bin"` has key `"dicta"` (NOT `"shoki"`); points to `dist/cli/main.js`
- All docs/README/runbook examples that say `shoki doctor` / `npx shoki setup` say `dicta doctor` / `npx dicta setup`
- `.planning/RELEASE-v0.1.0-RUNBOOK.md` smoke-test instruction `npx shoki setup` → `npx dicta setup`

Internal CLI source (commander program name, help text, error message prefixes) likely
hard-codes the program name — update those references too. Grep `commander` calls and
`.name(` / `.usage(` / `program.help` invocations in `packages/sdk/src/cli/main.ts`
and `packages/sdk/src/cli/index.ts`.

<!-- Helper-app guard — explicitly verified after the work. -->

A `git diff` on the deferred files MUST be empty after this rename. Verify:

```sh
git diff --name-only HEAD -- \
  packages/sdk/src/cli/checks/helper-discovery.ts \
  packages/sdk/src/cli/checks/helper-signature.ts \
  packages/sdk/src/cli/checks/csreq-compare.ts \
  packages/sdk/src/cli/setup-download.ts \
  packages/sdk/src/cli/setup-install.ts \
  packages/sdk/src/cli/setup-app-path.ts \
  packages/sdk/src/cli/setup-command.ts \
  helper/ \
  .github/workflows/app-release.yml
```

Output should be empty. If any of these files appear in the diff, the rename touched
something it shouldn't have — revert and inspect.

<!-- Out of scope: history. -->

DO NOT EDIT:
- `.planning/phases/**/*-PLAN.md`
- `.planning/phases/**/*-SUMMARY.md`
- `.planning/phases/**/*-CONTEXT.md`
- `.planning/research/**/*.md`
- `.planning/quick/260418-f0a-rename-to-shoki-core/**` (prior rename's record)
- `.planning/quick/260417-wl1-style-vitepress-docs-with-ear-image-pale/**`

These are historical artifacts. They reference old names accurately for the moment
they describe — editing them corrupts the record.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename to `dicta` across code (package.json, plugin needle, bin, all TS imports)</name>
  <read_first>
    - packages/sdk/package.json
    - packages/sdk/src/vitest/plugin.ts
    - packages/sdk/src/vitest/setup.ts
    - packages/sdk/src/vitest/errors.ts
    - packages/sdk/src/vitest/command-types.ts
    - packages/sdk/src/matchers/index.ts
    - packages/sdk/src/binding-loader.ts
    - packages/sdk/src/wire.ts
    - packages/sdk/src/voice-over.ts
    - packages/sdk/src/cli/main.ts
    - packages/sdk/src/cli/index.ts
    - packages/sdk/src/cli/errors.ts
    - packages/sdk/test/vitest/plugin.test.ts
    - packages/sdk/test/vitest/singleton-detection.test.ts
    - packages/sdk/test/vitest/fixtures/has-import/test.ts
    - packages/sdk/test/vitest/fixtures/opt-out/test.ts
    - examples/vitest-browser-qwik/package.json
    - examples/vitest-browser-qwik/vitest.config.ts
    - examples/vitest-browser-qwik/src/vitest.setup.ts
    - examples/vitest-browser-qwik/src/shoki-matchers.d.ts (note: file may need to be renamed to `dicta-matchers.d.ts` if convention dictates — check ambient module name first)
  </read_first>
  <files>
    packages/sdk/package.json,
    packages/sdk/src/vitest/plugin.ts,
    packages/sdk/src/vitest/setup.ts,
    packages/sdk/src/vitest/errors.ts,
    packages/sdk/src/vitest/command-types.ts,
    packages/sdk/src/matchers/index.ts,
    packages/sdk/src/binding-loader.ts,
    packages/sdk/src/wire.ts,
    packages/sdk/src/voice-over.ts,
    packages/sdk/src/cli/main.ts,
    packages/sdk/src/cli/index.ts,
    packages/sdk/src/cli/errors.ts,
    packages/sdk/test/vitest/plugin.test.ts,
    packages/sdk/test/vitest/singleton-detection.test.ts,
    packages/sdk/test/vitest/fixtures/has-import/test.ts,
    packages/sdk/test/vitest/fixtures/opt-out/test.ts,
    packages/binding-darwin-arm64/package.json,
    packages/binding-darwin-x64/package.json,
    examples/vitest-browser-qwik/package.json,
    examples/vitest-browser-qwik/vitest.config.ts,
    examples/vitest-browser-qwik/src/vitest.setup.ts,
    examples/vitest-browser-qwik/src/shoki-matchers.d.ts,
    examples/vitest-browser-qwik/tests/app.test.tsx,
    examples/vitest-browser-qwik/tests/app-ssr.test.tsx,
    examples/vitest-browser-qwik/tests/dom-vs-chrome-url.test.tsx,
    pnpm-lock.yaml
  </files>
  <action>
    Mechanical rename across code and config. Apply the substitution table from `<interfaces>`.

    STEP A — `packages/sdk/package.json`:
    - Change `"name": "@shoki/core"` → `"name": "dicta"`
    - Change `"bin": { "shoki": "dist/cli/main.js" }` → `"bin": { "dicta": "dist/cli/main.js" }`
    - Update `"description"` if it mentions the old package name token specifically (the current description "Screen-reader test automation SDK — TypeScript surface + CLI + matchers + Vitest plugin for Shoki's Zig native core" — leave the proper noun "Shoki" because helper app retains Shoki branding for v0.1; this is acceptable inconsistency)
    - Leave EVERYTHING else as-is: `compatibleAppVersion`, `exports`, `optionalDependencies` (`@shoki/binding-darwin-arm64` keeps its scope), `peerDependencies`, `peerDependenciesMeta`, `keywords`, `publishConfig`, `dependencies`, `repository.url`. `publishConfig.access: "public"` is fine for unscoped names too.

    STEP B — Plugin needle + plugin name in `packages/sdk/src/vitest/plugin.ts`:
    - Find `IMPORT_NEEDLE = '@shoki/core/vitest/browser'` (or equivalent constant) — change to `'dicta/vitest/browser'`
    - Find plugin `name: '@shoki/core/vitest'` — change to `name: 'dicta/vitest'`
    - Find any warning prefix `[@shoki/core/vitest]` — change to `[dicta/vitest]`

    STEP C — Test assertions + fixtures:
    - `packages/sdk/test/vitest/plugin.test.ts` — update plugin-name assertion from `'@shoki/core/vitest'` to `'dicta/vitest'`
    - `packages/sdk/test/vitest/singleton-detection.test.ts` — update needle assertion + warning-prefix assertion
    - `packages/sdk/test/vitest/fixtures/has-import/test.ts` — import string `'@shoki/core/vitest/browser'` → `'dicta/vitest/browser'` (this is what the detector scans FOR)
    - `packages/sdk/test/vitest/fixtures/opt-out/test.ts` — same substitution if present

    STEP D — CLI program name (NEW vs. 260418-f0a — bin command is changing):
    - `packages/sdk/src/cli/main.ts` and `packages/sdk/src/cli/index.ts`: search for commander `.name('shoki')`, `.usage(...)`, help text, version output prefix, and any error-message prefix that includes "shoki" as the bin token. Change to `dicta`.
    - `packages/sdk/src/cli/errors.ts`: HelperNotFoundError message and any header comment that says "run `shoki doctor`" → "run `dicta doctor`"
    - DO NOT touch any references to `Shoki Setup.app`, `Shoki.app`, `app.shoki.setup` bundle ID, or `~/.shoki/` paths — these stay (helper-app rebrand is v0.2)

    STEP E — Sweep code imports across `packages/sdk/src/**`, `packages/sdk/test/**`, and `packages/binding-darwin-*/`:
    - Apply the import substitution table to every `.ts`, `.tsx`, `.d.ts`
    - **Exception:** inside `packages/sdk/src/vitest/**` and the package's own internal modules, imports between SDK files are RELATIVE (`../index.js`, `../../matchers/index.js`) per Phase 10.1 — those stay relative. Only cross-package or self-referential `@shoki/core` imports update.
    - Doc comments + error messages that say `@shoki/core` as a package token update; doc comments that say "Shoki" the project name as proper noun stay (those will be a v0.2 prose sweep)
    - HARD GUARD: do not modify `packages/sdk/src/cli/checks/helper-*.ts`, `packages/sdk/src/cli/setup-download.ts`, `packages/sdk/src/cli/setup-install.ts`, `packages/sdk/src/cli/setup-app-path.ts`, `packages/sdk/src/cli/setup-command.ts`. If a global sed/grep would touch them, scope it to exclude these files.

    STEP F — `examples/vitest-browser-qwik/package.json`:
    - In `dependencies`: `"@shoki/core": "workspace:*"` → `"dicta": "workspace:*"`
    - No other changes.

    STEP G — Sweep example imports across every `.ts`, `.tsx`, `.d.ts` under `examples/vitest-browser-qwik/`:
    - `from '@shoki/core'` → `from 'dicta'`
    - `from '@shoki/core/matchers'` → `from 'dicta/matchers'`
    - `from '@shoki/core/vitest'` → `from 'dicta/vitest'`
    - `from '@shoki/core/vitest/browser'` → `from 'dicta/vitest/browser'`
    - `import '@shoki/core/vitest/setup'` → `import 'dicta/vitest/setup'`
    - Triple-slash references and ambient module declarations in `src/shoki-matchers.d.ts`: change the ambient module name from `'@shoki/core/matchers'` → `'dicta/matchers'`. The FILE NAME itself can stay `shoki-matchers.d.ts` for v0.1 (renaming it touches tsconfig include paths and isn't worth the scope creep — leave for v0.2 prose pass). If the file is auto-discovered (just `*.d.ts` glob), no rename needed.

    STEP H — `pnpm install` from repo root to regenerate `pnpm-lock.yaml` against the new name. Do not pass `--frozen-lockfile`.

    STEP I — `pnpm --filter dicta build` once so `dist/vitest/*.d.ts` exists (TS subpath types resolve from `dist/` — same first-run hurdle Phase 10.1 + 260418-f0a logged).

    STEP J — Run `pnpm -r typecheck && pnpm -r test` from repo root. Both must exit 0.

    STEP K — Helper-app guard: run `git diff --name-only HEAD -- packages/sdk/src/cli/checks/helper-discovery.ts packages/sdk/src/cli/checks/helper-signature.ts packages/sdk/src/cli/checks/csreq-compare.ts packages/sdk/src/cli/setup-download.ts packages/sdk/src/cli/setup-install.ts packages/sdk/src/cli/setup-app-path.ts packages/sdk/src/cli/setup-command.ts helper/ .github/workflows/app-release.yml` — output MUST be empty. If any file appears, revert that file from HEAD before continuing.

    DO NOT touch in this task:
    - Docs under `docs/**`
    - `README.md`, `CHANGELOG.md` (root)
    - `.planning/RELEASE-v0.1.0-RUNBOOK.md`
    - `CLAUDE.md`
    - `packages/sdk/README.md`, `packages/binding-darwin-*/README.md`, `examples/vitest-browser-qwik/README.md`
    - Any `.planning/phases/**`, `.planning/research/**`, or `.planning/quick/260418-f0a-*` files
    - The helper-app deferred file list above
    Those belong to Task 2.
  </action>
  <verify>
    <automated>
      cd /Users/jackshelton/dev/open-source/shoki && \
      jq -r '.name' packages/sdk/package.json | grep -qx 'dicta' && \
      jq -e '.bin | has("shoki") | not' packages/sdk/package.json > /dev/null && \
      jq -r '.bin.dicta' packages/sdk/package.json | grep -qx 'dist/cli/main.js' && \
      jq -r '.dependencies.dicta' examples/vitest-browser-qwik/package.json | grep -qx 'workspace:*' && \
      jq -e '.dependencies | has("@shoki/core") | not' examples/vitest-browser-qwik/package.json > /dev/null && \
      grep -q 'dicta/vitest/browser' packages/sdk/src/vitest/plugin.ts && \
      ! grep -rnE "from ['\"]@shoki/core(/[^'\"]+)?['\"]" packages/ examples/ --include='*.ts' --include='*.tsx' --include='*.d.ts' 2>/dev/null && \
      ! grep -rnE "['\"]@shoki/core['\"]\s*:\s*['\"]workspace" packages/ examples/ --include='*.json' 2>/dev/null && \
      [ -z "$(git diff --name-only HEAD -- packages/sdk/src/cli/checks/helper-discovery.ts packages/sdk/src/cli/checks/helper-signature.ts packages/sdk/src/cli/checks/csreq-compare.ts packages/sdk/src/cli/setup-download.ts packages/sdk/src/cli/setup-install.ts packages/sdk/src/cli/setup-app-path.ts packages/sdk/src/cli/setup-command.ts helper/ .github/workflows/app-release.yml)" && \
      pnpm install --no-frozen-lockfile && \
      pnpm --filter dicta build && \
      pnpm -r typecheck && \
      pnpm -r test
    </automated>
  </verify>
  <done>
    - `packages/sdk/package.json` `name` is `"dicta"`, `bin.dicta` is `dist/cli/main.js`, `bin.shoki` does not exist
    - Plugin needle string in `plugin.ts` is `'dicta/vitest/browser'`
    - Plugin `name` is `'dicta/vitest'`
    - Example's only SDK dep is `"dicta": "workspace:*"` (no `"@shoki/core"` key)
    - `grep -rnE "from ['\"]@shoki/core(/[^'\"]+)?['\"]"` across `packages/` and `examples/` (ts/tsx/d.ts) returns ZERO matches
    - `git diff --name-only HEAD --` against the helper-app deferred file list returns EMPTY (helper subsystem untouched)
    - `pnpm -r typecheck` exits 0
    - `pnpm -r test` exits 0
    - CLI bin name is now `dicta` — `jq -r '.bin.dicta'` returns `dist/cli/main.js`
  </done>
</task>

<task type="auto">
  <name>Task 2: Sweep user-facing docs, README, CHANGELOG, runbook, CLAUDE.md — install/import/CLI rebrand + title rebrand</name>
  <read_first>
    - README.md
    - CHANGELOG.md
    - docs/index.md
    - docs/getting-started/install.md
    - docs/getting-started/vitest-quickstart.md
    - docs/api/sdk.md
    - docs/api/cli.md
    - docs/api/vitest.md
    - docs/api/matchers.md
    - docs/guides/matchers.md
    - docs/guides/migration-from-guidepup.md
    - docs/guides/troubleshooting.md
    - docs/background/architecture.md
    - docs/background/release-setup.md
    - .planning/RELEASE-v0.1.0-RUNBOOK.md
    - CLAUDE.md
    - packages/sdk/README.md
    - packages/binding-darwin-arm64/README.md
    - packages/binding-darwin-x64/README.md
    - examples/vitest-browser-qwik/README.md
  </read_first>
  <files>
    README.md,
    CHANGELOG.md,
    docs/index.md,
    docs/getting-started/install.md,
    docs/getting-started/vitest-quickstart.md,
    docs/api/sdk.md,
    docs/api/cli.md,
    docs/api/vitest.md,
    docs/api/matchers.md,
    docs/guides/matchers.md,
    docs/guides/migration-from-guidepup.md,
    docs/guides/troubleshooting.md,
    docs/background/architecture.md,
    docs/background/release-setup.md,
    .planning/RELEASE-v0.1.0-RUNBOOK.md,
    CLAUDE.md,
    packages/sdk/README.md,
    packages/binding-darwin-arm64/README.md,
    packages/binding-darwin-x64/README.md,
    examples/vitest-browser-qwik/README.md
  </files>
  <action>
    Prose + code-block sweep across user-facing docs. Apply the substitution table from `<interfaces>`.

    STEP A — Root `README.md`:
    - **TITLE / HERO REBRAND:** H1 from `# Shoki` → `# Dicta`. Hero tagline (currently "Shoki lets you run real screen readers...") → "Dicta lets you run real screen readers...". Any "What is Shoki?" / "About Shoki" section header → "What is Dicta?" / "About Dicta".
    - Install commands: `npm install @shoki/core` → `npm install dicta`
    - Import examples: `from '@shoki/core'` → `from 'dicta'`
    - CLI examples: `npx shoki setup`, `shoki doctor` → `npx dicta setup`, `dicta doctor`
    - Architecture diagram label `@shoki/core` → `dicta`
    - "3 npm packages" list: SDK row updates from `@shoki/core` → `dicta`; binding rows stay `@shoki/binding-darwin-*`
    - **Acceptable residual:** mid-prose mentions of "Shoki" (e.g., "Shoki uses AppleScript under the hood", "the Shoki helper app", "Shoki's wire format") — leave these for v0.2 deep-prose sweep, BUT add a one-line "Note: helper app retains its Shoki branding through v0.1; full rebrand in v0.2" callout near the install section so users aren't confused when `Shoki Setup.app` appears.

    STEP B — `CHANGELOG.md`:
    - **TITLE:** if H1 says `# Shoki Changelog` → `# Dicta Changelog`. If it just says `# Changelog`, leave it.
    - Add a new entry at the top of the v0.1.0 section: "Renamed to `dicta` (Latin: 'things said'). The unscoped `shoki` name was blocked by npm's similarity check against `shiki`; the `@shoki` org workaround was subsequently denied. `dicta` is unscoped, distinctive, and semantically aligned with the library's purpose. The CLI bin command is also `dicta` now (`dicta doctor`, `npx dicta setup`)."
    - Add a paragraph: "**v0.1 helper-app naming:** The helper application retains its 'Shoki' file names (`Shoki.app`, `Shoki Setup.app`) and bundle identifier (`app.shoki.setup`) for v0.1 because regenerating the signed bundles + CSREQ trust anchors is its own work item. v0.2 will complete the helper rebrand. Users who run `npx dicta setup` will see a window labeled 'Shoki Setup' briefly — this is expected."
    - v0.1.0 install/migration snippets rewrite to `dicta` (the snippets that 260418-f0a wrote now point to `@shoki/core` — those need re-rewriting)
    - Historical entries describing prior renames (Phase 10 Plan 01: `@shoki/sdk` → `shoki`; quick task 260418-f0a: `shoki` → `@shoki/core`) STAY untouched — they accurately describe past events

    STEP C — Docs site (`docs/**`):
    - `docs/index.md` — hero quick-install + tagline. **TITLE/HERO REBRAND** if VitePress hero block says "Shoki" — change to "Dicta". Keep the same visual structure.
    - `docs/getting-started/install.md` — install commands (`npm install @shoki/core` → `npm install dicta`); import example; subpath table; "heads-up" migration box → rewrite to mention BOTH renames briefly ("Renamed `@shoki/sdk` → `shoki` → `@shoki/core` → `dicta` over v0.1.0-rc cycles. Use `dicta` for v0.1.0 GA."); "Why one package?" paragraph if it mentions the package name token. Add a one-line note about helper-app v0.1 inconsistency.
    - `docs/getting-started/vitest-quickstart.md` — install commands, config imports, setup file, needle reference (`@shoki/core/vitest/browser` → `dicta/vitest/browser`), CLI bin reference (`shoki` → `dicta`)
    - `docs/api/sdk.md` — H1 (if it says `@shoki/core`) → `dicta`; entry-points table; import examples; "see also" links
    - `docs/api/cli.md` — bin description: the CLI command is now `dicta` (was `shoki`). Update every `shoki doctor` / `shoki setup` / `shoki info` / `shoki restore-vo-settings` to `dicta ...`. Surrounding package-name references (`@shoki/core`) → `dicta`.
    - `docs/api/vitest.md` — H1 + all subpath references
    - `docs/api/matchers.md` — setup-files path + matcher-package path + "see also" + "live-reference" callout (all `@shoki/core/...` → `dicta/...`)
    - `docs/guides/matchers.md` — setup snippet + code examples + "pure fns" paragraph + paired-test callout
    - `docs/guides/migration-from-guidepup.md` — code example imports
    - `docs/guides/troubleshooting.md` — `ShokiConcurrentTestError` cause description: the error class name itself stays `ShokiConcurrentTestError` (renaming TS exports is breaking, deferred to v0.2); only update install/import references in surrounding prose
    - `docs/background/architecture.md` — SDK-layer name + matcher subpath
    - `docs/background/release-setup.md` — Section 2 bullet list; Section 3 `npm view`/`npm install` smoke checks; Section 5 unpublish commands

    STEP D — `.planning/RELEASE-v0.1.0-RUNBOOK.md`:
    - Top-of-file callout: rewrite to explain the THIRD pivot ("Originally `shoki` (npm E403 vs `shiki`); pivoted to `@shoki/core` (org creation denied); now `dicta` — unscoped, distinctive, ships under v0.1.0 GA")
    - REMOVE Step 2 "Claim the @shoki npm scope" entirely (no longer applies — `dicta` is unscoped)
    - Smoke-test commands: `npm view @shoki/core@0.1.0` → `npm view dicta@0.1.0`; `npm install @shoki/core` → `npm install dicta`; `npx shoki setup` smoke test → `npx dicta setup`
    - `pnpm --filter @shoki/core` invocations → `pnpm --filter dicta`
    - References to "the `@shoki/core` npm package" as the publish target → "`dicta`"
    - Keep references to `Shoki Setup.app` and `Shoki.app` in the helper-app section — those file names persist for v0.1; add a one-line note that the v0.2 helper rebrand follows.

    STEP E — Package-level READMEs:
    - `packages/sdk/README.md` — H1 from `# @shoki/core` → `# dicta`. Sweep install/import snippets. CLI examples (`shoki ...` → `dicta ...`).
    - `packages/binding-darwin-arm64/README.md` and `packages/binding-darwin-x64/README.md` — update prose references to the SDK from `@shoki/core` → `dicta`. The bindings keep their own `@shoki/binding-darwin-*` names (deferred). Update "automatically installed by `@shoki/core`" → "automatically installed by `dicta`".
    - `examples/vitest-browser-qwik/README.md` — install + import + CLI snippets

    STEP F — `CLAUDE.md`:
    - Search for the npm package name token `@shoki/core` (in backticks, in `"name": "..."` snippets, in import examples, in `npm install @shoki/core`). Replace with `dicta`.
    - Search for the bin command token `shoki` in CLI examples (`shoki doctor`, `npx shoki setup`). Replace with `dicta`.
    - Leave project-name prose ("Shoki", "**Shoki**", "# Shoki" in the project description, "Shoki lets you...") alone — those are helper-app-name-tied for v0.1. The "Project" section H2 stays as "**Shoki**" with a note added below: "(npm package: `dicta`, CLI: `dicta`; helper app retains 'Shoki' branding for v0.1)".
    - Specifically the "npm package name" row in the Version Compatibility table: update value to `dicta` + `@shoki/binding-*`.
    - The constraints section that says "Tech stack: Zig 0.16+ ... TypeScript SDK as the primary surface" — leave intact.

    STEP G — Grep sweep to prove completion. Acceptable residual `shoki` / `@shoki` tokens in docs are ONLY:
    - Project name prose ("Shoki", "Shoki.app", "Shoki Setup.app", "the Shoki helper app") — v0.2 deep prose
    - Repo URL (`github.com/shoki/shoki`)
    - Scoped binding names (`@shoki/binding-darwin-*`)
    - Internal namespaces (`~/.shoki/`, `SHOKI_*`, `_shoki_snapshot_*`, `com.shoki.runner`, `app.shoki.setup`)
    - Historical changelog entries describing past renames
    - GitHub Release artifact names (`shoki-darwin-*.zip`)
    - Comments explicitly noting the v0.1 helper-app deferral

    There MUST be NO standalone `npm install @shoki/core`, `pnpm add @shoki/core`, `"@shoki/core":`, `from '@shoki/core'`, or `npm view @shoki/core` residuals in user-facing docs.

    There MUST be NO `shoki doctor`, `shoki setup`, `npx shoki setup`, `shoki info`, `shoki restore-vo-settings` as a CLI command in user-facing docs (those are the bin name; CLI is now `dicta`). The string `shoki` standalone may still appear in helper-app references; the CLI invocation pattern must use `dicta`.

    DO NOT edit any `.planning/phases/**`, `.planning/research/**`, `.planning/quick/260418-f0a-*`, or any of the helper-app deferred files listed in OUT-of-scope.
  </action>
  <verify>
    <automated>
      cd /Users/jackshelton/dev/open-source/shoki && \
      ! grep -rnE "(npm|pnpm|yarn)\s+(install|add|view)\s+@shoki/core" README.md CHANGELOG.md docs/ .planning/RELEASE-v0.1.0-RUNBOOK.md CLAUDE.md packages/sdk/README.md packages/binding-darwin-arm64/README.md packages/binding-darwin-x64/README.md examples/vitest-browser-qwik/README.md 2>/dev/null && \
      ! grep -rnE "from ['\"]@shoki/core(/[^'\"]+)?['\"]" README.md CHANGELOG.md docs/ .planning/RELEASE-v0.1.0-RUNBOOK.md CLAUDE.md packages/sdk/README.md packages/binding-darwin-arm64/README.md packages/binding-darwin-x64/README.md examples/vitest-browser-qwik/README.md 2>/dev/null && \
      ! grep -rnE "(\\\$|>|^|\s)(npx\s+)?shoki\s+(doctor|setup|info|restore-vo-settings)" README.md docs/ .planning/RELEASE-v0.1.0-RUNBOOK.md CLAUDE.md packages/sdk/README.md examples/vitest-browser-qwik/README.md 2>/dev/null && \
      grep -q 'dicta' docs/getting-started/install.md && \
      grep -q 'npm install dicta' .planning/RELEASE-v0.1.0-RUNBOOK.md && \
      grep -q 'dicta' README.md && \
      grep -q 'dicta' CHANGELOG.md && \
      [ -z "$(git diff --name-only HEAD -- packages/sdk/src/cli/checks/helper-discovery.ts packages/sdk/src/cli/checks/helper-signature.ts packages/sdk/src/cli/checks/csreq-compare.ts packages/sdk/src/cli/setup-download.ts packages/sdk/src/cli/setup-install.ts packages/sdk/src/cli/setup-app-path.ts packages/sdk/src/cli/setup-command.ts helper/ .github/workflows/app-release.yml .planning/phases/ .planning/research/)" ] && \
      cd packages/sdk && npm publish --dry-run --access public 2>&1 | grep -q 'name: dicta'
    </automated>
  </verify>
  <done>
    - Zero matches for `npm install @shoki/core` / `pnpm add @shoki/core` / `npm view @shoki/core` in user-facing docs
    - Zero matches for `from '@shoki/core'` / `from '@shoki/core/...'` in user-facing docs
    - Zero matches for `shoki doctor` / `shoki setup` / `npx shoki setup` / `shoki info` / `shoki restore-vo-settings` as CLI invocations in user-facing docs (CLI is now `dicta`)
    - `docs/getting-started/install.md`, `README.md`, `CHANGELOG.md`, and `.planning/RELEASE-v0.1.0-RUNBOOK.md` all contain the string `dicta`
    - README H1 + CHANGELOG title + install.md hero rebranded to "Dicta"
    - CHANGELOG has new v0.1.0 lead-in explaining the third pivot + v0.1 helper-app deferral note
    - RUNBOOK Step 2 "Claim the @shoki npm scope" is REMOVED
    - `npm publish --dry-run --access public` from `packages/sdk/` reports `name: dicta` and produces a clean tarball
    - Helper-app deferred file list (`packages/sdk/src/cli/checks/helper-*.ts`, `setup-download.ts`, `setup-install.ts`, `setup-app-path.ts`, `setup-command.ts`, `helper/`, `app-release.yml`) is empty in `git diff --name-only HEAD --`
    - `.planning/phases/**`, `.planning/research/**`, `.planning/quick/260418-f0a-*` are not modified
  </done>
</task>

</tasks>

<verification>
- `jq -r '.name' packages/sdk/package.json` returns `dicta`
- `jq -r '.bin.dicta' packages/sdk/package.json` returns `dist/cli/main.js`
- `jq -e '.bin | has("shoki") | not' packages/sdk/package.json` is true (old bin key gone)
- `grep -rnE "from ['\"]@shoki/core(/[^'\"]+)?['\"]" packages/ examples/ --include='*.ts' --include='*.tsx' --include='*.d.ts'` returns ZERO matches
- `grep -rnE "(npm|pnpm|yarn)\s+(install|add|view)\s+@shoki/core"` across user-facing docs returns ZERO matches
- `grep -rnE "(npx\s+)?shoki\s+(doctor|setup|info|restore-vo-settings)"` across user-facing docs returns ZERO matches
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all exit 0
- `cd packages/sdk && npm publish --dry-run --access public` shows `name: dicta` (no E403, no scope-not-found)
- Helper-app deferred file list: `git diff --name-only HEAD -- packages/sdk/src/cli/checks/helper-discovery.ts packages/sdk/src/cli/checks/helper-signature.ts packages/sdk/src/cli/checks/csreq-compare.ts packages/sdk/src/cli/setup-download.ts packages/sdk/src/cli/setup-install.ts packages/sdk/src/cli/setup-app-path.ts packages/sdk/src/cli/setup-command.ts helper/ .github/workflows/app-release.yml` returns EMPTY
- `.planning/phases/**`, `.planning/research/**` untouched — `git diff .planning/phases/ .planning/research/` returns empty
</verification>

<success_criteria>
- Published npm name is `dicta` (ready for `npm publish --access public` without saga)
- CLI bin command is `dicta` — users type `npx dicta setup`, `dicta doctor`
- Every code import and every user-facing doc uses `dicta` / `dicta/vitest*`
- Plugin auto-detection needle updated to `dicta/vitest/browser` so consumer imports still trigger singleThread
- README and CHANGELOG titles + install.md hero rebranded to "Dicta"
- CHANGELOG documents the third pivot AND the v0.1 helper-app deferral so users understand why `Shoki Setup.app` appears after `npx dicta setup`
- Full build + typecheck + test green
- Helper-app subsystem untouched (signed bundles + CSREQ trust anchors safe for separate v0.2 work)
- Historical planning artifacts (`.planning/phases/**`, `.planning/research/**`, `.planning/quick/260418-f0a-*`) untouched
</success_criteria>

<output>
After completion, create `.planning/quick/260418-lfz-rename-to-dicta/260418-lfz-SUMMARY.md` summarizing:
- Count of files touched (code vs docs split)
- Confirmation of `pnpm -r build && pnpm -r typecheck && pnpm -r test` all exit 0
- Dry-run `npm publish` output showing `name: dicta`
- Confirmation that helper-app deferred file list is untouched (paste the empty `git diff --name-only` output)
- Any prose residuals that were intentionally left (project name prose pending v0.2, helper-app file names, repo URL, internal namespaces, historical changelog entries, scoped binding names)
- Any tweaks/discoveries vs the plan
</output>

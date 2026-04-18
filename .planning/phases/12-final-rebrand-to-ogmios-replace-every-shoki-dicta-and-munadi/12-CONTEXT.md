# Phase 12: Final Rebrand to Ogmios — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** User directive — after four prior rename attempts (shoki → @shoki/core → dicta → munadi) all ran into npm's anti-typosquatting filter or scope denials, we're pivoting to a mythologically-grounded name.

<domain>
## Phase Boundary

Replace every remaining `Shoki`, `Dicta`, and `Munadi` token across the entire repo with `Ogmios`. This phase completes what Phase 11 started — Phase 11 converted Shoki/Dicta to Munadi across code (Waves 1–2: SDK, bindings, helper app, infra, Zig core). Waves 3–4 of Phase 11 never ran (docs sweep, release pipeline, parent folder rename) because the Munadi name was rejected by npm's similarity filter (vs. `minami`).

**Etymology:** Ogmios (Ὄγμιος) is the Celtic/Gaulish god of eloquence. Lucian of Samosata (2nd century CE) described a Gaulish statue of Ogmios as an old man with chains of gold and amber running from his tongue to the ears of his followers, who trailed behind him willingly — a literal depiction of speech binding speaker to listener. In Irish tradition, his counterpart Ogma is credited with inventing ogham (the Irish alphabet), making him the patron of written-down speech. Homepage must lead with this etymology.

**Scope:** leaves nothing behind. Every token — on-disk identifiers, bundle IDs, Zig source, Info.plists, CI workflows, docs, READMEs, CLAUDE.md, RELEASE runbook, package names, env vars, state dirs, plist magic keys — becomes Ogmios.
</domain>

<decisions>
## Implementation Decisions

### Package Names (locked)
- npm SDK package: currently `ogmios` in `packages/sdk/package.json` (we already renamed this interactively) — **keep `ogmios`** (unscoped)
- npm binding packages: `@munadi/binding-darwin-arm64` → `@ogmios/binding-darwin-arm64`; `@munadi/binding-darwin-x64` → `@ogmios/binding-darwin-x64`
- **Risk note:** If `@ogmios` scope is denied or flagged, fallback is `@jackshelton/ogmios-binding-darwin-arm64` using the personal scope (guaranteed to publish)
- CLI bin: `ogmios` (users type `ogmios doctor`, `npx ogmios setup`)

### npm Status (locked)
- `ogmios` was unpublished in 2015. Whether npm allows re-registration depends on when the modern lockout policy kicks in for old unpublished names. Publish attempt is the only way to know. If blocked, Phase 12's terminal task falls back to `@jackshelton/ogmios` personal scope.
- After successful publish, deprecate:
  - `dicta@0.1.0` → "Renamed to ogmios. Install: npm install ogmios"
  - `@shoki/binding-darwin-arm64@*` → "Renamed to @ogmios/binding-darwin-arm64"
  - (If `munadi` ever went live before E403 hit, it didn't — no deprecation needed there)

### Helper Application (locked)
- File names: `MunadiRunner.app` → `OgmiosRunner.app`; `MunadiSetup.app` → `OgmiosSetup.app`
- Bundle identifiers: `org.munadi.runner` → `org.ogmios.runner`; `org.munadi.setup` → `org.ogmios.setup`
- Full rebuild: new signed `.app` bundles, new CSREQ trust anchors, new `app-v*` GitHub Release artifacts (`ogmios-darwin-arm64.zip`, `ogmios-darwin-x64.zip`)
- All helper Zig source: `MunadiRunnerMachServiceName` → `OgmiosRunnerMachServiceName`, `munadi_xpc_*` → `ogmios_xpc_*`, `libMunadiXPCClient.dylib` → `libOgmiosXPCClient.dylib`, every string literal

### On-Disk State Migration (locked — clean break)
- State directory: `~/.munadi/` → `~/.ogmios/` (and still-lingering `~/.shoki/`, `~/.dicta/` if any)
- Clean break. `ogmios doctor` on first run detects legacy dirs and prints one-line notice: "Detected legacy state dir — delete it safely with: rm -rf ~/.shoki ~/.dicta ~/.munadi"
- Plist snapshot keys: `_munadi_snapshot_*` → `_ogmios_snapshot_*`

### Environment Variables (locked)
- `MUNADI_HELPER_PATH` → `OGMIOS_HELPER_PATH`
- `MUNADI_AX_TARGET_PID` → `OGMIOS_AX_TARGET_PID`
- `MUNADI_INTEGRATION` → `OGMIOS_INTEGRATION`
- `MUNADI_SNAPSHOT_PATH` → `OGMIOS_SNAPSHOT_PATH`
- Any remaining `SHOKI_*`, `DICTA_*`, `MUNADI_*` → `OGMIOS_*`

### Error Classes / TS API (locked — breaking)
- `MunadiError` → `OgmiosError`, `MunadiConcurrentTestError` → `OgmiosConcurrentTestError`, every exported `MunadiX` class → `OgmiosX`
- Any remaining `ShokiX` or `DictaX` → `OgmiosX` (should already be zero after Phase 11 Waves 1–2, but verify)
- Factory function `munadiVitest()` → `ogmiosVitest()`

### Zig Core (locked)
- Package name: `.munadi_core` → `.ogmios_core` (regenerate fingerprint as Zig 0.16 requires)
- Build product: `libmunadi.dylib` → `libogmios.dylib`; compiled addon `munadi.node` → `ogmios.node`
- Binding `main: "munadi.node"` → `main: "ogmios.node"`; `files: ["munadi.node", ...]` → `files: ["ogmios.node", ...]`
- Driver type: `MunadiDriver` → `OgmiosDriver` (vtable shape unchanged — EXT-01 stable)

### Infra (locked)
- tart image names: `munadi-vo-ready-*` → `ogmios-vo-ready-*`
- VM names: `munadi-macos-*` → `ogmios-macos-*`
- Ansible: `munadi_bundle_id` → `ogmios_bundle_id` (value `org.ogmios.runner`)
- Scripts: `munadi-tcc-grant.sh` → `ogmios-tcc-grant.sh`
- Marker: `/etc/munadi-image` → `/etc/ogmios-image`
- Flag file: `/tmp/.munadi-force-tcc` → `/tmp/.ogmios-force-tcc`

### GitHub Actions (locked)
- Artifact names: `ogmios-darwin-arm64.zip`, `ogmios-darwin-x64.zip`
- Any workflow references `shoki-*`, `dicta-*`, `munadi-*` → `ogmios-*`
- Composite actions under `.github/actions/build-zig-binding/action.yml` — currently still reference `libshoki.dylib` / `shoki.node` per Phase 11 Plan 03 deferral note. Fix here.

### Repository URL (locked)
- `github.com/thejackshelton/munadi` → `github.com/thejackshelton/ogmios` (rename via GitHub UI or `gh api repos/thejackshelton/munadi --method PATCH -f name=ogmios` — if the repo was ever renamed to munadi; otherwise from current `github.com/shoki/shoki`)
- Update every `repository.url` in package.json files
- Update every prose reference in READMEs and docs

### Homepage Etymology (locked)
- `docs/index.md` VitePress hero: name is "Ogmios"
- Tagline lead with Celtic origin:
  - e.g., "Real screen readers in your tests. _Ogmios_ — the Gaulish god of eloquence, who bound his listeners with chains of gold running from his tongue to their ears."
- Add a short etymology paragraph in "What is Ogmios?" section citing Lucian's *Heracles*
- Tie it to the library's purpose: the library IS the chain — it captures the speech traveling from the screen reader (the "tongue") to the test (the "ear")

### Parent Folder Rename (locked — LAST step)
- `/Users/jackshelton/dev/open-source/shoki` → `/Users/jackshelton/dev/open-source/ogmios`
- Must execute from OUTSIDE the directory AFTER all commits land
- Terminates the running Claude Code session

### Exceptions (intentional residuals — locked)
- Historical planning artifacts: `.planning/phases/**` for completed phases (01–10), `.planning/phases/11-*` (which describes the Munadi attempt — accurate for its moment), `.planning/research/**`, `.planning/quick/260418-f0a-*`, `.planning/quick/260418-lfz-*` — MUST stay unmodified
- Historical CHANGELOG entries describing prior renames — stay; add NEW v0.1.1 entry describing the pivot to Ogmios and the reason (npm filter + Munadi rejection)
- Zig upstream `napi-zig` dep name in `build.zig.zon` — unchanged

### Claude's Discretion
- Exact tagline wording for the Celtic etymology on homepage (guidance: mention Lucian + the golden chains + tongue-to-ear imagery; keep tasteful)
- CHANGELOG entry wording
- Commit message wording (`refactor(12-XX): ...`, `docs(12-XX): ...`)
- Order of file modifications within a plan
- Whether to split by surface area or consolidate

</decisions>

<canonical_refs>
## Canonical References

### Phase 11 artifacts — describes the Munadi state that Phase 12 rewrites
- `.planning/phases/11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli/11-CONTEXT.md` — reference for which surfaces were touched and which weren't
- `.planning/phases/11-*/11-01-SUMMARY.md` through `11-05-SUMMARY.md` — what Phase 11 actually committed

### Prior rename artifacts (reference patterns, do not modify)
- `.planning/quick/260418-lfz-rename-to-dicta/260418-lfz-PLAN.md` — substitution-table pattern, scope guards, grep verification style
- `.planning/quick/260418-f0a-rename-to-shoki-core/260418-f0a-SUMMARY.md` — earlier rename lessons

### Project state
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `CLAUDE.md`

### Helper-app subsystem (heavy modification here)
- `helper/build.zig`, `helper/build.zig.zon`
- `helper/src/setup/Info.plist`, `helper/src/runner/Info.plist`
- `helper/src/**/*.zig`
- `helper/scripts/*.sh`
- `.github/workflows/app-release.yml`
- `.github/actions/build-zig-binding/action.yml` — Phase 11 Plan 03 noted this still has `libshoki.dylib` / `shoki.node` references at 6 sites

### Zig core
- `zig/src/root.zig`, `zig/src/core/*.zig`, `zig/src/drivers/voiceover/*.zig`
- `build.zig`, `build.zig.zon`

### Infra
- `infra/tart/packer/*.pkr.hcl`
- `infra/tart/ansible/*.yml`
- `infra/tart/scripts/*.sh`
- `infra/tart/README.md`

### Release pipeline
- `.planning/RELEASE-v0.1.0-RUNBOOK.md`

</canonical_refs>

<specifics>
## Token Substitution Table

Apply these substitutions EVERYWHERE except the exceptions listed above.

| Old                                                 | New                                           |
|-----------------------------------------------------|-----------------------------------------------|
| `munadi` (package, prose, any bare token)           | `ogmios`                                      |
| `Munadi` (capitalized, prose, class names)          | `Ogmios`                                      |
| `MUNADI_*` (env vars)                               | `OGMIOS_*`                                    |
| `munadi_*` (Zig/C symbols, Ansible vars)            | `ogmios_*`                                    |
| `@munadi/*` (npm scope)                             | `@ogmios/*` (or `@jackshelton/ogmios-*` on fallback) |
| `munadi.node` (compiled addon)                      | `ogmios.node`                                 |
| `libmunadi.dylib` / `libMunadiXPCClient.dylib`      | `libogmios.dylib` / `libOgmiosXPCClient.dylib`|
| `MunadiRunner.app` / `MunadiSetup.app`              | `OgmiosRunner.app` / `OgmiosSetup.app`        |
| `MunadiRunner` / `MunadiSetup` (exe, CFBundleName)  | `OgmiosRunner` / `OgmiosSetup`                |
| `org.munadi.runner` / `org.munadi.setup`            | `org.ogmios.runner` / `org.ogmios.setup`      |
| `_munadi_snapshot_*` (plist keys)                   | `_ogmios_snapshot_*`                          |
| `~/.munadi/` (state dir)                            | `~/.ogmios/`                                  |
| `munadi-vo-ready-*` (tart images)                   | `ogmios-vo-ready-*`                           |
| `munadi-macos-*` (VM names)                         | `ogmios-macos-*`                              |
| `munadi_bundle_id` (Ansible var)                    | `ogmios_bundle_id`                            |
| `munadi-tcc-grant.sh`                               | `ogmios-tcc-grant.sh`                         |
| `/etc/munadi-image`                                 | `/etc/ogmios-image`                           |
| `/tmp/.munadi-force-tcc`                            | `/tmp/.ogmios-force-tcc`                      |
| `munadi-darwin-<arch>.zip`                          | `ogmios-darwin-<arch>.zip`                    |
| `github.com/thejackshelton/munadi`                  | `github.com/thejackshelton/ogmios`            |
| `github.com/shoki/shoki` (remaining)                | `github.com/thejackshelton/ogmios`            |
| Any residual `shoki` / `Shoki` / `SHOKI_*`          | `ogmios` / `Ogmios` / `OGMIOS_*`              |
| Any residual `dicta` / `Dicta`                      | `ogmios` / `Ogmios`                           |

### Files with known residuals post-Phase 11

Per Phase 11 SUMMARY deferrals:
- `.github/actions/build-zig-binding/action.yml` — still has `libshoki.dylib` + `shoki.node`
- `.github/workflows/release.yml` — still has `packages/binding-darwin-arm64/shoki.node`
- `packages/sdk/src/cli/checks/helper-*.ts`, `setup-*.ts` — hard-guarded in Phase 11 (still reference `Shoki*.app` / `org.shoki.*` / `~/.shoki/`)
- `helper/scripts/package-app-zip.sh` output filename was renamed to `munadi-darwin-*.zip` in 11-04 — now → `ogmios-darwin-*.zip`
- Phase 11 prose sweep (Plan 06) never ran — all docs, README, CHANGELOG, CLAUDE.md, docs/** still carry Shoki/Dicta/Munadi mix
- Phase 11 release pipeline plan (Plan 07) never ran

</specifics>

<deferred>
## Deferred Ideas

None — Phase 12 is the terminal rebrand. After this, zero Shoki/Dicta/Munadi tokens remain (except documented historical records).

</deferred>

---

*Phase: 12-final-rebrand-to-ogmios*
*Context gathered: 2026-04-18 via autonomous directive*

# Phase 10: CLI-driven Shoki.app distribution - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Depends on:** Phase 8 (ShokiSetup.app + ShokiRunner.app both built), Phase 9 (docs in 4-package world)

<domain>
## Phase Boundary

Ship the download-and-install flow so consumers run `npx shoki setup` and never visit GitHub Releases manually. Move `ShokiRunner.app` + `ShokiSetup.app` out of the npm binding tarballs and onto GitHub Releases as a unified `Shoki.app.zip` artifact. `shoki setup` handles fetch + checksum verify + quarantine strip + install + launch.

This is the final piece that makes shoki actually consumable. Current install flow breaks on Gatekeeper + wrong-file-location + TCC grants on npm-transient paths. After this phase, install is: `npm install @shoki/sdk` → `npx shoki setup` → click through dialogs once → done.

Out of scope: Dev ID signing (kept optional for later), a dedicated homebrew cask (nice-to-have v1.1).

</domain>

<decisions>
## Implementation Decisions

### Distribution: unified `Shoki.app.zip` per platform

Currently we ship two `.app` bundles:
- `ShokiRunner.app` — XPC server, AX observer, TCC trust anchor at test time
- `ShokiSetup.app` — one-shot TCC prompt trigger + welcome UX

Decision: **keep them as separate .app bundles but distribute both inside one `Shoki-darwin-arm64.zip` (or `darwin-x64.zip`) archive** on GitHub Releases. Installed together into `~/Applications/`:

```
~/Applications/Shoki.app/                 (formerly ShokiRunner.app — the long-lived helper)
~/Applications/Shoki Setup.app/           (formerly ShokiSetup.app — one-click onboarding)
```

Rationale: merging them into a single binary adds state complexity (one-shot vs daemon mode flag switching); keeping them separate keeps each bundle's responsibility crisp. Users see two apps in `~/Applications/`, understand at a glance which is which.

Naming in the filesystem:
- Bundle identifier stays stable: `org.shoki.runner`, `org.shoki.setup` — TCC grants persist
- User-visible name uses spaces for polish: `Shoki.app` and `Shoki Setup.app`

### `shoki setup` CLI behavior

New first-run flow when invoked via `npx shoki setup`:

1. **Detect install state:** check for `~/Applications/Shoki Setup.app` AND `~/Applications/Shoki.app`
2. **If missing OR stale** (version in Info.plist older than `@shoki/sdk` expects):
   - Print: "Shoki.app not found. Downloading from GitHub Releases..."
   - Determine platform: `process.platform` + `process.arch` → `darwin-arm64` or `darwin-x64`
   - Fetch `https://github.com/<org>/shoki/releases/download/v<VERSION>/shoki-<platform>.zip`
   - Fetch `shoki-<platform>.zip.sha256` for checksum verification
   - Verify SHA256 matches
   - Unzip to `~/Applications/` (creates the dir if missing — macOS respects user-local Applications)
   - Strip quarantine: `xattr -dr com.apple.quarantine ~/Applications/Shoki.app ~/Applications/Shoki\ Setup.app`
3. **If installed and fresh:** skip download
4. **Launch Shoki Setup.app:** `open -W ~/Applications/Shoki\ Setup.app` (wait for exit)
5. **Post-launch verification:** run `shoki doctor --json` — if still failing, print the exact System Settings deep links
6. **Report success:** "Shoki is ready. Your tests can now use voiceOver.start()."

### `shoki setup` flags

- `--force` — redownload even if .app is present
- `--no-download` — fail if .app is missing (for scripted CI where the .app is pre-placed)
- `--install-dir <path>` — override `~/Applications/` (for custom layouts or CI)
- `--skip-launch` — download + install but don't auto-open (for headless verification)
- `--json` — structured output for CI pipelines
- `--version <ver>` — download a specific release version (default: match the installed `@shoki/sdk` version)

### Version pinning strategy

The shipped `@shoki/sdk` knows a compatible `Shoki.app` version range. On `shoki setup`:
- Read `compatibleAppVersion` field from the SDK's `package.json` (new field; added in this phase)
- If installed `Shoki.app/Contents/Info.plist` CFBundleShortVersionString is in range → skip download
- If out of range → prompt user before upgrading (since upgrade resets TCC grants)

### GitHub Release publish workflow

New workflow: `.github/workflows/app-release.yml`

Triggered on tags matching `app-v*` (separate from `v*` for SDK releases — `.app` ships independently from SDK).

Matrix: `macos-14` for arm64, cross-compile for x64.

Steps:
1. `mlugg/setup-zig@v2`
2. `cd helper && zig build -Dtarget=aarch64-macos` (and x86_64)
3. `bash helper/scripts/build-app-bundle.sh` — produces `.build/ShokiRunner.app` + `.build/ShokiSetup.app`
4. Rename to user-visible names, package: `ditto -c -k --keepParent .build/Shoki.app .build/Shoki\ Setup.app shoki-darwin-arm64.zip`
5. Compute `shoki-darwin-arm64.zip.sha256`
6. `gh release create app-v<VERSION> shoki-darwin-arm64.zip shoki-darwin-arm64.zip.sha256 ...` (separate release from SDK)

### Remove .apps from npm binding packages

Current state (Phase 8): `packages/binding-darwin-arm64/package.json` lists `helper/ShokiRunner.app/**` and `helper/ShokiSetup.app/**` in `files`.

After this phase:
- Remove those entries → binding packages only contain `shoki.node` (~2MB)
- Much smaller tarball
- Phase 8-04 release workflow edits: don't copy .apps into binding packages anymore (only `shoki.node`)

### Install-location TCC stability

TCC grants are keyed to the bundle signature at install location. `~/Applications/Shoki.app` is stable across shoki npm updates because:
- `@shoki/sdk` updates don't touch `~/Applications/Shoki.app`
- `Shoki.app` only updates when user runs `shoki setup --force` (deliberate) OR hits the version-mismatch prompt
- Stale installs that stop working: user runs `shoki setup --force`, re-grants once, done

### Quarantine handling

Downloads via `fetch` get tagged with `com.apple.quarantine` xattr. Gatekeeper checks this on first launch.

We strip immediately after verified download:
```bash
xattr -dr com.apple.quarantine ~/Applications/Shoki.app
xattr -dr com.apple.quarantine ~/Applications/Shoki\ Setup.app
```

This is the same approach `brew install --cask` uses. Not a bypass — the user ran `shoki setup` explicitly, consented to the download, and the checksum was verified. Stripping quarantine is the appropriate response.

Without this step, users hit "Shoki.app is damaged and can't be opened" or the softer "cannot verify developer" dialog. Both are bad UX.

### Gatekeeper edge case: macOS policy on ad-hoc signed apps

Some macOS versions still block ad-hoc signed apps even after quarantine strip, showing a `spctl assess` rejection. Mitigation:
- Document the one-time System Settings → "Open Anyway" flow as a fallback
- Consider adding `spctl --add ~/Applications/Shoki.app` to the install script (requires sudo on some macOS versions; make it optional with user consent)

### What users DON'T do

- Visit GitHub Releases in a browser (shoki setup fetches for them)
- `brew install shoki` (future — not v1)
- Run `sudo` commands (we install to `~/Applications/`, not `/Applications/`)
- Copy files around (shoki setup handles placement)
- Override Gatekeeper warnings manually (quarantine is stripped)

### Claude's Discretion

- Exact progress UI during download (spinner, percent, nothing — pick tasteful)
- Whether to cache the zip before unzipping (probably yes — reduces network if user retries)
- SHA256 verification library (Node's `crypto.createHash` built-in — no new dep)
- Exact `fetch` impl (Node 24 has native `fetch` — no node-fetch dep)

</decisions>

<code_context>
## Existing Code Insights

### Reusable
- `packages/sdk/src/cli/main.ts` — commander subcommand registration pattern
- `packages/sdk/src/cli/restore-vo-settings.ts` — pattern for CLI subcommands that do file I/O + shell out
- `helper/.build/Shoki*.app` — the bundles we package
- `helper/scripts/build-app-bundle.sh` — builds both .apps locally; reuse in CI
- `.github/workflows/release.yml` — pattern for tag-triggered release workflow

### Integration Points
- `shoki setup` already exists (Phase 8-04) — rewrite its body with the download+install flow
- `shoki doctor` (Phase 2) — called post-install for verification
- Phase 8-04's `release.yml` release workflow — removes the "copy .apps into binding packages" step
- `docs/getting-started/install.md` — updates to "npm install + npx shoki setup, done"

### What's being deleted / moved
- `packages/binding-darwin-*/package.json` `files` entries for `helper/**` — gone
- `packages/binding-darwin-*/helper/` directories in published tarballs — gone
- Release workflow steps that `cp -R helper/.build/Shoki*.app packages/binding-*/` — gone

</code_context>

<specifics>
## Specific Ideas

- `brew install --cask shoki` in v1.1 — flag as deferred; same Shoki.app zip served via a homebrew-cask formula pointing at the same GitHub Release URLs
- `shoki update-app` subcommand in v1.1 — explicit command for "upgrade Shoki.app only, without touching npm packages"
- Telemetry: consider an OPT-IN `--anonymous-telemetry` flag that reports install success rate + common failure modes, so we learn about consumer friction we can't see from stars/issues. v1.1+ though.

</specifics>

<deferred>
## Deferred Ideas

- Homebrew cask (v1.1)
- Explicit `shoki update-app` subcommand (v1.1)
- Telemetry (v1.1+, opt-in)
- Windows/Linux equivalents (v2+ with real cross-platform support)
- Sparkle-style auto-update for Shoki.app (overengineered for v1)

</deferred>

# Release Setup

One-time setup for the `ogmios` release pipeline. Maintainers run through this before the first `v*` tag.

## 1. Apple Developer ID (signing + notarization)

Ogmios's `.node` binding does not need to be signed — npm-distributed `.node` files inherit trust from Node. But the **OgmiosRunner.app helper** (the TCC trust anchor; see `docs/architecture.md`) MUST be Developer ID-signed + notarized so TCC grants persist across dev rebuilds.

### What you need

- **Apple Developer Program** membership — $99/year. Individual or Organization is fine; Organization gets you a stable Team ID across maintainers.
- **Developer ID Application** certificate — request via Xcode → Settings → Accounts → Manage Certificates, or via the Apple Developer portal. Export as `.p12` with a password. Base64-encode: `base64 -i cert.p12 | pbcopy`.
- **App Store Connect API key** for `notarytool` — Apple Developer portal → Users and Access → Keys → App Store Connect API → Generate. Download the `.p8` file (one-time download!). Record the Key ID and Issuer ID.

### Secrets to add to GitHub

| Secret | Value |
|--------|-------|
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_B64` | base64-encoded `.p12` |
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD` | password used when exporting the `.p12` |
| `DEVELOPER_ID_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID12)` — the exact SHA-matching string shown by `security find-identity -v -p codesigning` |
| `APPLE_TEAM_ID` | 10-char Team ID |
| `APPLE_API_KEY_ID` | 10-char key ID from the .p8 |
| `APPLE_API_ISSUER_ID` | UUID from the App Store Connect portal |
| `APPLE_API_KEY_B64` | `base64 -i AuthKey_<KEY_ID>.p8` |

### Local dev (without signing)

Running tests locally does not require Apple signing. Helper builds and signing scripts noop cleanly when `DEVELOPER_ID_IDENTITY` is unset.

---

## 2. npm OIDC Trusted Publishing

Ogmios publishes via npm's trusted-publishing flow — no `NPM_TOKEN` secret in CI.

> Note: Section 2 covers the **SDK / npm** release pipeline (`.github/workflows/release.yml`, triggered by `v*` tags). The separate **helper `.app` bundles** (OgmiosRunner.app + OgmiosSetup.app) ship from a different pipeline on a different cadence — see § 7 below for the `app-v*` tag flow and the `compatibleAppVersion` coupling.

### One-time enrollment per package

For each of:
- `ogmios` (the SDK)
- `ogmios-darwin-arm64`
- `ogmios-darwin-x64`

1. Publish an initial `0.0.1` version with a classic `NPM_TOKEN` from a maintainer's machine (bootstrap only; see "bootstrap publish" below).
2. Log into npmjs.com → package settings → Trusted Publishers → Add trusted publisher.
3. Select **GitHub Actions**, fill in:
   - Organization or user: `thejackshelton`
   - Repository: `ogmios`
   - Workflow filename: `release.yml`
   - Environment: leave blank (we don't use GH environments for release)
4. Save.

After enrollment, the `pnpm publish --provenance` step in `release.yml` authenticates via the OIDC token and no secret is needed.

### Bootstrap publish (one time)

Until the packages exist on npm, trusted publishing can't be configured. From a maintainer's machine:

```bash
cd packages/sdk && pnpm publish --access public --no-git-checks --dry-run
# review output, then:
cd packages/sdk && pnpm publish --access public --no-git-checks
# repeat for binding-darwin-arm64, binding-darwin-x64
```

Use `--dry-run` liberally. After the first successful publish per package, enable trusted publishing (above) and never manually publish again.

---

## 3. Verifying a release

After a tag push:

1. Watch the `Release` workflow in GitHub Actions. All four jobs should be green.
2. `npm view ogmios dist-tags` — should show the new `latest` version.
3. `npm install ogmios@latest` on a fresh macOS machine:
   - `ogmios-darwin-arm64` or `ogmios-darwin-x64` should be selected via `optionalDependencies`
   - `node -e "require('ogmios')"` should load without errors
   - `codesign -dvvv node_modules/@ogmios/binding-*/helper/OgmiosRunner.app` should show a valid Developer ID signature
4. `npm view ogmios@<new-version> --json | jq .dist.attestations` — should show provenance attestation.

---

## 4. If a release fails

**Signing fails:** Check that `APPLE_DEVELOPER_ID_APPLICATION_CERT_B64` is not expired. Certs are valid 5 years; renew in Apple Developer portal, update the secret.

**Notarization fails:** Apple's `notarytool` returns a log UUID. Fetch with:
```bash
xcrun notarytool log <log-uuid> --key AuthKey_XXX.p8 --key-id XXX --issuer XXX
```

**Publish fails with auth error:** Trusted publisher config drifted. Re-verify npm package settings → Trusted Publishers matches the current `release.yml` workflow name and repo path.

---

## 5. Emergency: unpublishing

npm allows unpublishing within 72 hours. If a broken release ships:
```bash
npm unpublish ogmios@<broken-version>
npm unpublish ogmios-darwin-arm64@<broken-version>
npm unpublish ogmios-darwin-x64@<broken-version>
```
After 72 hours, unpublishing is restricted — instead publish a patched version and `npm deprecate` the broken one.

---

## 6. Tart image publish (Phase 5)

The ogmios VO-ready tart images (`ghcr.io/thejackshelton/ogmios-macos-vo-ready:<ver>`) are
published from `.github/workflows/tart-publish.yml`. This is a separate
pipeline from the npm release because:

1. Tart images are large (5-15 GB slim, 30-50 GB `@full`) and don't fit
   within the `macos-14` GH-hosted runner's disk budget.
2. Tart requires nested virtualization via macOS Virtualization.framework,
   which GH-hosted runners can't provide.

So the publish pipeline runs on **self-hosted macOS-arm64 runners with
tart + packer installed** (label set: `self-hosted, macOS, arm64, packer`).

### What you need

- **Self-hosted macOS-arm64 runner** — Apple Silicon Mac mini / Mac Studio
  with 32 GB+ RAM and 500 GB+ free disk. One runner suffices (the matrix
  jobs share it and serialize naturally via tart VM exclusive lock).
- **tart installed** on the runner: `brew install cirruslabs/cli/tart`.
- **packer installed** on the runner: `brew install packer`.
- **ansible installed** on the runner: `brew install ansible`.
- **GHCR push credentials** (below).

### Secrets to add to GitHub

| Secret          | Value                                                                                             |
|-----------------|---------------------------------------------------------------------------------------------------|
| `GHCR_USERNAME` | GitHub username or org with write access to `ghcr.io/thejackshelton/ogmios-*`                     |
| `GHCR_TOKEN`    | Classic PAT with `write:packages` scope, OR a fine-grained token with Packages: Read and write    |

The Apple signing secrets (from § 1) are reused — the tart publish pipeline
imports the Developer ID cert for any helper artifacts baked into `@full`
images.

### First-time bootstrap

Before the first `tart-v*` tag:

1. Install the GitHub self-hosted runner on your Mac per the GitHub docs.
2. Label it with `self-hosted,macOS,arm64,packer`.
3. Verify tooling from the runner user account:
   ```bash
   tart --version     # 2.x
   packer --version   # 1.10+
   ansible --version  # 2.15+
   ```
4. Log into GHCR manually once to prime the keychain:
   ```bash
   echo "$GHCR_TOKEN" | tart login ghcr.io --username "$GHCR_USERNAME" --password-stdin
   ```
5. Sanity-check the base images can be pulled:
   ```bash
   tart pull ghcr.io/cirruslabs/macos-sonoma-xcode:latest
   ```
6. Tag and push:
   ```bash
   git tag tart-v1.0.0
   git push origin tart-v1.0.0
   ```

Watch `.github/workflows/tart-publish.yml`. One parallel job per macOS
version. Each job takes ~45 minutes for the slim image, ~90 minutes for
`@full`.

### Manual publish (dispatch)

For testing between tags, trigger the workflow manually via the Actions tab
on GitHub. You can pick a single macOS version (`sonoma`/`sequoia`/`tahoe`)
or `all`, and whether to also publish the `@full` variant.

### Verifying a tart image publish

After the workflow completes:

```bash
# On any Mac with tart installed:
tart pull ghcr.io/thejackshelton/ogmios-macos-vo-ready:sonoma
tart run ogmios-vo-ready-sonoma --no-graphics &
IP=$(tart ip ogmios-vo-ready-sonoma)
ssh -o StrictHostKeyChecking=no admin@$IP \
    'cat /etc/ogmios-image && ogmios info'
# expected: ogmios info prints the helper path + TCC accessibility lines and exits 0
```

### If the publish fails

- **`base image not found`** — cirruslabs hasn't published the macOS version
  yet (most common on the `tahoe` row until macOS 26 GA). Drop that row
  from the matrix and ship sonoma + sequoia only until the base catches up.
- **`tart push: unauthorized`** — `GHCR_TOKEN` expired or was revoked.
  Regenerate with `write:packages` scope.
- **Image size over 15 GB** (slim) — the base image grew. Check the
  post-Ansible strip provisioner in `sonoma.pkr.hcl` and add new caches /
  toolchains to the rm -rf list.
- **`tccutil` grant step failed inside Ansible** — TCC.db schema changed.
  See `infra/tart/scripts/tcc-grant.sh` header notes and inspect
  `sqlite3 TCC.db "PRAGMA table_info(access)"` on the failing image.

---

## 7. App release (helper `.app` bundles via GitHub Releases)

Ogmios ships two helper bundles — `OgmiosRunner.app` (the long-lived runner)
and `OgmiosSetup.app` (one-shot onboarding UX). These are distributed via
**GitHub Releases**, not npm.

Phase 10 split the two release channels for a reason:
- npm (`v*` tags, § 2) is cheap, frequent, and text-only — pure `ogmios.node` +
  TS code. No Apple secrets required to cut a patch.
- Helper bundles (`app-v*` tags, this section) are signed + notarized and
  only change when `helper/` source changes. Decoupling the cadences means
  an SDK bugfix doesn't force a helper rebuild, and a helper fix doesn't
  force a `pnpm publish -r` of every package.

### When to cut an app release

Only when `helper/` source changes — Zig sources, Info.plist, entitlements,
build.zig tweaks that alter binary output. A pure-docs or pure-TS change
never needs a new `app-v*` tag.

### Tagging flow

```bash
# From the default branch, after helper/ changes are merged:
git tag app-v0.1.1
git push origin app-v0.1.1
```

This triggers `.github/workflows/app-release.yml`, which:
1. Builds `OgmiosRunner.app` + `OgmiosSetup.app` for `darwin-arm64` + `darwin-x64`
   (x64 cross-compiled from the `macos-14` runner via
   `helper/scripts/build-app-bundle.sh --target x86_64-macos`).
2. Signs + notarizes each bundle via `helper/scripts/sign-and-notarize.sh`
   if `DEVELOPER_ID_IDENTITY` is set (forks without Apple secrets still get
   ad-hoc signed artifacts — download + install still works).
3. Packages both bundles into a single zip per arch via
   `helper/scripts/package-app-zip.sh`. Output files:
   - `ogmios-darwin-arm64.zip` + `ogmios-darwin-arm64.zip.sha256`
   - `ogmios-darwin-x64.zip`   + `ogmios-darwin-x64.zip.sha256`
4. Uploads all four files to `gh release create app-v<VERSION>` on the
   commit the tag points at (`--target ${{ github.sha }}`).

The resulting URL scheme — e.g.
`https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.1/ogmios-darwin-arm64.zip`
— is the wire contract with Plan 10-02's `ogmios setup` downloader.

### Required secrets

Shared with § 1 (same Apple credentials, same cert import step):

| Secret | Used for |
|--------|----------|
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_B64` | `apple-actions/import-codesign-certs` on each runner |
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD` | same |
| `DEVELOPER_ID_IDENTITY` | `sign-and-notarize.sh` codesign identity string |
| `APPLE_ID` | `notarytool submit --apple-id` |
| `APPLE_TEAM_ID` | `notarytool submit --team-id` |
| `APPLE_APP_SPECIFIC_PASSWORD` | `notarytool submit --password` |

No npm secret is needed — the workflow doesn't touch the registry. The
`GITHUB_TOKEN` GitHub auto-injects into every workflow is sufficient for
`gh release create` because the workflow declares `permissions.contents: write`.

### `compatibleAppVersion` coupling (critical)

`packages/sdk/package.json` has a top-level `compatibleAppVersion` field. This
is the version of `OgmiosRunner.app` the SDK knows how to talk to. `ogmios setup`
fetches from `app-v<compatibleAppVersion>`.

Rule: **after publishing an `app-v*` release, bump `compatibleAppVersion` in
`packages/sdk/package.json` to match, then cut a `v*` SDK release.** Otherwise
`ogmios setup` on the next install still downloads the previous `.app` version.

The reverse isn't required: SDK patch releases that don't need a new helper
just keep the same `compatibleAppVersion` value. An `app-v*` tag can sit
unreleased on the SDK side indefinitely until an SDK change needs it.

### Artifact contract (what consumers parse)

Plan 10-02's `packages/sdk/src/cli/setup-download.ts` expects:

- **Zip layout:** `OgmiosRunner.app/` and `OgmiosSetup.app/` at the archive root
  (no wrapper directory). Produced by `ditto -c -k` on a staging dir
  containing the two bundles.
- **SHA256 sidecar:** `<64-char-hex>  <basename>\n` (two spaces between
  hash and filename — the `shasum -a 256` default format). The parser
  also accepts a bare `<64-char-hex>` as a fallback.

Changing either shape is a breaking change to the SDK/app contract —
coordinate with `setup-download.ts` if the layout needs to evolve.

### First-time bootstrap (before v1.0)

Until `ogmios setup` is shipping to real users, you can also publish
manually from a maintainer's Mac:

```bash
cd helper
./scripts/build-app-bundle.sh --target aarch64-macos
./scripts/sign-and-notarize.sh .build/OgmiosRunner.app    # optional without secrets
./scripts/sign-and-notarize.sh .build/OgmiosSetup.app     # optional without secrets
./scripts/package-app-zip.sh --arch arm64

# Repeat for x64 (--target x86_64-macos, --arch x64), then:
gh release create app-v0.1.1 \
    helper/.build/ogmios-darwin-arm64.zip \
    helper/.build/ogmios-darwin-arm64.zip.sha256 \
    helper/.build/ogmios-darwin-x64.zip \
    helper/.build/ogmios-darwin-x64.zip.sha256 \
    --title "OgmiosRunner.app v0.1.1" \
    --notes "Ogmios rebrand app release."
```

Once the CI path is trusted, the manual flow is purely a break-glass tool.

### If the app-release workflow fails

- **Cross-compile x86_64 fails on the `macos-14` runner** — known pitfall
  in some Zig versions. Fallback: change `build-x64.runs-on` to
  `macos-13` (Intel) so the x64 target is native. Document the toggle
  here when it bites.
- **Notarization fails** — same playbook as § 4 (fetch the notarytool log).
- **SHA mismatch in the "Verify zip integrity" step** — almost always a
  stale `.build/` from a prior partial run. Add a `rm -rf helper/.build`
  step before the build or trigger a fresh runner.
- **`gh release create` says "release already exists"** — you're pushing a
  tag that was already published. Delete the old release (`gh release
  delete app-vX.Y.Z`) before re-pushing, or bump the version.

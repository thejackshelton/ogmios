# Release Setup

One-time setup for the `shoki` release pipeline. Maintainers run through this before the first `v*` tag.

## 1. Apple Developer ID (signing + notarization)

Shoki's `.node` binding does not need to be signed — npm-distributed `.node` files inherit trust from Node. But the **ShokiRunner.app helper** (the TCC trust anchor; see `docs/architecture.md`) MUST be Developer ID-signed + notarized so TCC grants persist across dev rebuilds.

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

Shoki publishes via npm's trusted-publishing flow — no `NPM_TOKEN` secret in CI.

### One-time enrollment per package

For each of:
- `@shoki/sdk`
- `@shoki/binding-darwin-arm64`
- `@shoki/binding-darwin-x64`

1. Publish an initial `0.0.1` version with a classic `NPM_TOKEN` from a maintainer's machine (bootstrap only; see "bootstrap publish" below).
2. Log into npmjs.com → package settings → Trusted Publishers → Add trusted publisher.
3. Select **GitHub Actions**, fill in:
   - Organization or user: `<org>`
   - Repository: `shoki`
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
2. `npm view @shoki/sdk dist-tags` — should show the new `latest` version.
3. `npm install @shoki/sdk@latest` on a fresh macOS machine:
   - `@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64` should be selected via `optionalDependencies`
   - `node -e "require('@shoki/sdk')"` should load without errors
   - `codesign -dvvv node_modules/@shoki/binding-*/helper/ShokiRunner.app` should show a valid Developer ID signature
4. `npm view @shoki/sdk@<new-version> --json | jq .dist.attestations` — should show provenance attestation.

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
npm unpublish @shoki/sdk@<broken-version>
npm unpublish @shoki/binding-darwin-arm64@<broken-version>
npm unpublish @shoki/binding-darwin-x64@<broken-version>
```
After 72 hours, unpublishing is restricted — instead publish a patched version and `npm deprecate` the broken one.

---

## 6. Tart image publish (Phase 5)

The shoki VO-ready tart images (`ghcr.io/shoki/macos-vo-ready:<ver>`) are
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
| `GHCR_USERNAME` | GitHub username or org with write access to `ghcr.io/shoki/*`                                     |
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
tart pull ghcr.io/shoki/macos-vo-ready:sonoma
tart run shoki-vo-ready-sonoma --no-graphics &
IP=$(tart ip shoki-vo-ready-sonoma)
ssh -o StrictHostKeyChecking=no admin@$IP \
    'cat /etc/shoki-image && shoki doctor --json --quiet'
# expected: shoki doctor prints {"ok": true, ...} and exits 0
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

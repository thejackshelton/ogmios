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

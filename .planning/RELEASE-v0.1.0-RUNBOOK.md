# v0.1.0 Release Runbook

Human steps to publish `@shoki/core` v0.1.0 + Shoki.app v0.1.0.

> **Why `@shoki/core` and not `shoki`?** The unscoped `shoki` slot is blocked
> by npm's anti-typosquatting check (too similar to
> [`shiki`](https://www.npmjs.com/package/shiki), which gets `E403`). The
> `@shoki` org scope is exempt from that filter, so the published name is
> `@shoki/core`. The CLI bin name stays `shoki` — users still run
> `npx shoki setup` / `npx shoki doctor` as before.

## Prerequisites

- [ ] Apple M-series Mac (for building arm64 + cross-compile)
- [ ] Node 24 LTS + pnpm 10 installed
- [ ] Zig 0.16.0 installed (`brew install zig@0.16` or direct download)
- [ ] GitHub account with repo creation rights
- [ ] npmjs.com account — the one that will own the `@shoki` scope

## Step 1: Get the repo on GitHub

```bash
# From shoki repo root
git remote add origin https://github.com/<YOUR_ORG>/shoki.git
git push -u origin main
```

Replace `<YOUR_ORG>` with your GitHub org/username.

Update any placeholder URLs in the repo to match:

```bash
# Find and fix placeholder github.com/<org>/shoki references
grep -r 'github.com/<org>\|github.com/shoki/shoki' --include='*.md' --include='*.json' --include='*.ts' --include='*.yml'
```

Commit the URL fixes before publishing.

## Step 2: Claim the @shoki npm scope

```bash
npm login
# → log in as the account that will own shoki

npm org create shoki
# → creates the @shoki org scope; you are its default owner
```

Confirm:
```bash
npm profile get
npm org ls shoki
```

## Step 3: Bootstrap publish (first time only)

```bash
pnpm install --frozen-lockfile=false
pnpm -r build
pnpm -r test
```

All green? Publish:

```bash
pnpm publish -r --access public --no-git-checks
```

pnpm publishes all 3 workspace packages in dependency order:
1. `@shoki/binding-darwin-arm64@0.1.0`
2. `@shoki/binding-darwin-x64@0.1.0`
3. `@shoki/core@0.1.0`

Verify:
```bash
npm view @shoki/core@0.1.0
npm view @shoki/binding-darwin-arm64@0.1.0
npm view @shoki/binding-darwin-x64@0.1.0
```

## Step 4: Set up OIDC trusted publishing (one-time, enables future CI releases)

For each of the 3 packages, log into npmjs.com and:

1. Go to `https://www.npmjs.com/package/<package-name>/access`
2. Scroll to "Trusted Publishers" → "Add trusted publisher"
3. Select **GitHub Actions**
4. Organization/user: `<YOUR_ORG>`
5. Repository: `shoki`
6. Workflow filename: `release.yml`
7. Environment: (leave blank)
8. Save

After OIDC is enrolled, all future SDK publishes happen via `git tag v<version> && git push --tags` — no manual `pnpm publish` needed.

## Step 5: Cut the Shoki.app release

The helper app release is decoupled from the SDK release.

```bash
git tag app-v0.1.0
git push origin app-v0.1.0
```

This triggers `.github/workflows/app-release.yml`, which:
1. Builds `ShokiRunner.app` + `ShokiSetup.app` for darwin-arm64 + darwin-x64
2. Optionally signs + notarizes (if Apple secrets are set — skippable for v0.1)
3. Packages `shoki-darwin-arm64.zip` + `.sha256`, same for x64
4. Creates GitHub Release `app-v0.1.0` with the zips as assets

Verify the release at `https://github.com/<YOUR_ORG>/shoki/releases/tag/app-v0.1.0`.

## Step 6: Smoke test from a fresh project

```bash
mkdir /tmp/shoki-smoke && cd /tmp/shoki-smoke
npm init -y
npm install @shoki/core
npx shoki setup
# click through the 2 TCC dialogs — should work end-to-end
npx shoki doctor --json | jq
```

If `shoki doctor` reports all green, v0.1.0 is live and consumable.

## Step 7: Announce

- GitHub Release notes for `v0.1.0` (SDK) and `app-v0.1.0` (helper)
- Optional: post on X, Bluesky, relevant Discords
- Update the README shields.io badges once they have real data

# v0.1.0 Release Runbook

Human steps to publish `dicta` v0.1.0 + Shoki.app v0.1.0.

> **The naming saga:** v0.1 went through three names before landing on `dicta`:
> 1. Originally `shoki` (unscoped) — blocked by npm's E403 anti-typosquatting
>    filter vs. [`shiki`](https://www.npmjs.com/package/shiki).
> 2. Pivoted to `@shoki/core` (scoped) — but the `@shoki` npm org creation was
>    subsequently denied (likely the same anti-typosquatting policy).
> 3. Pivoted again to **`dicta`** (Latin: "things said") — unscoped,
>    distinctive, unrelated to any existing npm package. This ships.
>
> The CLI bin command is also `dicta` now — users run `npx dicta setup` /
> `npx dicta doctor`. Helper-app file names (`Shoki.app`, `Shoki Setup.app`)
> and the binding packages (`@shoki/binding-darwin-*`) retain their "Shoki"
> naming through v0.1 — full rebrand follows in v0.2.

## Prerequisites

- [ ] Apple M-series Mac (for building arm64 + cross-compile)
- [ ] Node 24 LTS + pnpm 10 installed
- [ ] Zig 0.16.0 installed (`brew install zig@0.16` or direct download)
- [ ] GitHub account with repo creation rights
- [ ] npmjs.com account — the one that will publish `dicta`

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

## Step 2: Bootstrap publish (first time only)

`dicta` is unscoped so no org-creation step is needed. The binding packages
stay under the existing `@shoki` scope (already published via quick task
260418-f0a during the `@shoki/core` attempt; they kept their names).

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
3. `dicta@0.1.0`

Verify:
```bash
npm view dicta@0.1.0
npm view @shoki/binding-darwin-arm64@0.1.0
npm view @shoki/binding-darwin-x64@0.1.0
```

## Step 3: Set up OIDC trusted publishing (one-time, enables future CI releases)

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

## Step 4: Cut the Shoki.app release

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

> **Note (v0.1):** The helper bundles retain their "Shoki" file names
> (`Shoki.app`, `Shoki Setup.app`, bundle ID `app.shoki.setup`). End users who
> run `npx dicta setup` will see a window labeled "Shoki Setup" briefly — this
> is expected for v0.1 and is called out in the CHANGELOG. v0.2 will ship the
> rebranded helper bundles once the signed-bundle regen + CSREQ trust-anchor
> refresh work is done.

## Step 5: Smoke test from a fresh project

```bash
mkdir /tmp/dicta-smoke && cd /tmp/dicta-smoke
npm init -y
npm install dicta
npx dicta setup
# click through the 2 TCC dialogs — should work end-to-end
npx dicta doctor --json | jq
```

If `dicta doctor` reports all green, v0.1.0 is live and consumable.

## Step 6: Announce

- GitHub Release notes for `v0.1.0` (SDK) and `app-v0.1.0` (helper)
- Optional: post on X, Bluesky, relevant Discords
- Update the README shields.io badges once they have real data

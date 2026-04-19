# v0.1.1 Release Runbook

Human steps to publish `ogmios` v0.1.1 + OgmiosRunner.app v0.1.1.

> **The naming saga:** v0.1 went through four names before landing on `ogmios`:
> 1. Originally `shoki` (unscoped) — blocked by npm's E403 anti-typosquatting
>    filter vs. [`shiki`](https://www.npmjs.com/package/shiki).
> 2. Pivoted to `@shoki/core` (scoped) — but the `@shoki` npm org creation was
>    subsequently denied (likely the same anti-typosquatting policy).
> 3. Pivoted to `dicta` (Latin: "things said") — successfully published as
>    v0.1.0, but the name carried no mythological weight.
> 4. Pivoted to `munadi` — blocked before first publish by the similarity
>    filter vs. [`minami`](https://www.npmjs.com/package/minami).
> 5. **Pivoted to `ogmios`** — the Gaulish god of eloquence. Lucian of
>    Samosata's 2nd-century description of an elder binding his listeners
>    with chains of gold from his tongue to their ears is a perfect metaphor
>    for a library that captures speech from screen reader to test. This
>    ships.
>
> The CLI bin command is `ogmios` — users run `npx ogmios setup` /
> `npx ogmios doctor`. Helper-app file names are `OgmiosRunner.app` /
> `OgmiosSetup.app`, and the binding packages are
> `@ogmios/binding-darwin-*`. All `dicta` / `@shoki/*` packages published
> during the v0.1.0 run are deprecated in favor of `ogmios`.

## Prerequisites

- [ ] Apple M-series Mac (for building arm64 + cross-compile)
- [ ] Node 24 LTS + pnpm 10 installed
- [ ] Zig 0.16.0 installed (`brew install zig@0.16` or direct download)
- [ ] GitHub account with repo creation rights
- [ ] npmjs.com account — the one that will publish `ogmios`
- [ ] npm `@ogmios` scope reserved (or fallback `@jackshelton/ogmios-*`
      personal scope ready)

## Step 1: Get the repo on GitHub

```bash
# From ogmios repo root
git remote set-url origin https://github.com/thejackshelton/ogmios.git
git push -u origin main
```

(If the repo is still named `shoki` or `munadi` on GitHub, rename it via
the GitHub UI or `gh api repos/thejackshelton/<old-name> --method PATCH -f name=ogmios`.
The repo URL update is Plan 12-10's responsibility; here we just document
that the repo will be `github.com/thejackshelton/ogmios` at publish time.)

Update any placeholder URLs in the repo to match:

```bash
# Find and fix placeholder github.com/<org>/ogmios references
grep -r 'github.com/<org>\|github.com/shoki/shoki\|github.com/thejackshelton/munadi' \
  --include='*.md' --include='*.json' --include='*.ts' --include='*.yml'
```

Commit the URL fixes before publishing.

## Step 2: Bootstrap publish (first time only)

`ogmios` is unscoped. The binding packages use the `@ogmios` scope (reserve
first on npmjs.com).

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
1. `ogmios-darwin-arm64@0.1.1`
2. `ogmios-darwin-x64@0.1.1`
3. `ogmios@0.1.1`

Verify:
```bash
npm view ogmios@0.1.1
npm view ogmios-darwin-arm64@0.1.1
npm view ogmios-darwin-x64@0.1.1
```

## Step 2a: Deprecate the prior-name packages

After `ogmios@0.1.1` is live, redirect former-name installs to it:

```bash
npm deprecate dicta@0.1.0 \
  "Renamed to ogmios. Install: npm install ogmios"
npm deprecate "@shoki/binding-darwin-arm64@*" \
  "Renamed to ogmios-darwin-arm64. Install via ogmios."
npm deprecate "@shoki/binding-darwin-x64@*" \
  "Renamed to ogmios-darwin-x64. Install via ogmios."
# munadi was never successfully published; no deprecation needed.
```

## Step 3: Set up OIDC trusted publishing (one-time, enables future CI releases)

For each of the 3 packages, log into npmjs.com and:

1. Go to `https://www.npmjs.com/package/<package-name>/access`
2. Scroll to "Trusted Publishers" → "Add trusted publisher"
3. Select **GitHub Actions**
4. Organization/user: `thejackshelton`
5. Repository: `ogmios`
6. Workflow filename: `release.yml`
7. Environment: (leave blank)
8. Save

After OIDC is enrolled, all future SDK publishes happen via
`git tag v<version> && git push --tags` — no manual `pnpm publish` needed.

## Step 4: Cut the OgmiosRunner.app release

The helper app release is decoupled from the SDK release.

```bash
git tag app-v0.1.1
git push origin app-v0.1.1
```

This triggers `.github/workflows/app-release.yml`, which:
1. Builds `OgmiosRunner.app` + `OgmiosSetup.app` for darwin-arm64 + darwin-x64
2. Optionally signs + notarizes (if Apple secrets are set — skippable for v0.1)
3. Packages `ogmios-darwin-arm64.zip` + `.sha256`, same for x64
4. Creates GitHub Release `app-v0.1.1` with the zips as assets

Verify the release at `https://github.com/thejackshelton/ogmios/releases/tag/app-v0.1.1`.

## Step 5: Smoke test from a fresh project

```bash
mkdir /tmp/ogmios-smoke && cd /tmp/ogmios-smoke
npm init -y
npm install ogmios
npx ogmios setup
# click through the 2 TCC dialogs — should work end-to-end
npx ogmios doctor --json | jq
npx ogmios restore-vo-settings --dry-run
```

If `ogmios doctor` reports all green, v0.1.1 is live and consumable.

## Step 6: Announce

- GitHub Release notes for `v0.1.1` (SDK) and `app-v0.1.1` (helper) — lead
  with the Celtic etymology (Ogmios, Lucian's chains of gold) and the
  naming-saga explanation so the rename is framed as mythological grounding
  rather than yet-another-pivot.
- Optional: post on X, Bluesky, relevant Discords.
- Update the README shields.io badges once they have real data.

## Known stragglers (check before tagging)

- GitHub repo rename from `shoki` / `munadi` to `ogmios` (Plan 12-10).
- The `@shoki` org on npm will host only the deprecated bindings forever;
  `@ogmios` is the forward-going scope.
- `~/.shoki/` / `~/.dicta/` / `~/.munadi/` state dirs on existing developer
  machines — `ogmios doctor` prints a one-line cleanup hint on first run.
